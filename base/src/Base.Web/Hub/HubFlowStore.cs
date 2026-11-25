using System.Security.Cryptography;
using System.Text;
using Base.Accounts;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Base.Web;

public sealed record HubFlow(string Nonce, string Verifier, string RedirectUri, string BrowserHash);

/// <summary>
/// The sign-ins that are under way: a random state (only its hash is stored), the nonce, the PKCE verifier (encrypted) and the hash of a cookie that binds the
/// flow to the browser that started it. A flow lives ten minutes and is used once: it is deleted in the same statement that reads it.
/// </summary>
public sealed class HubFlowStore(NpgsqlDataSource db, SecretBox box, TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public async Task CreateAsync(string state, string browser, string nonce, string verifier, string redirectUri, CancellationToken ct = default)
    {
        var id = Ids.New();
        var now = clock.GetUtcNow();
        await db.ExecAsync("delete from hub_flows where expires_at < $1", ct, now);
        await db.ExecAsync("insert into hub_flows (id, state_hash, browser_hash, nonce, verifier, redirect_uri, expires_at) values ($1, $2, $3, $4, $5, $6, $7)", ct,
            id, Hash(state), Hash(browser), nonce, Convert.ToBase64String(box.Encrypt(verifier, id)), redirectUri, now + Lifetime);
    }

    /// <summary>Takes the flow for this state (and removes it), or null when there is none, it is used, or it ran out.</summary>
    public async Task<HubFlow?> TakeAsync(string state, CancellationToken ct = default)
    {
        await using var cmd = db.Cmd("delete from hub_flows where state_hash = $1 returning id, browser_hash, nonce, verifier, redirect_uri, expires_at", Hash(state));
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct) || r.Time(5) < clock.GetUtcNow()) return null;
        string? verifier;
        try { verifier = box.Decrypt(Convert.FromBase64String(r.GetString(3)), r.GetGuid(0)); } catch (FormatException) { return null; }
        return verifier is null ? null : new HubFlow(r.GetString(2), verifier, r.GetString(4), r.GetString(1));
    }

    /// <summary>Notes a logout token. False when it was seen before (a repeated token ends nothing).</summary>
    public async Task<bool> RememberLogoutAsync(string jti, DateTimeOffset until, CancellationToken ct = default)
    {
        await db.ExecAsync("delete from hub_logout_tokens where expires_at < $1", ct, clock.GetUtcNow());
        return await db.ExecAsync("insert into hub_logout_tokens (jti_hash, expires_at) values ($1, $2) on conflict do nothing", ct, Hash(jti), until + TimeSpan.FromMinutes(5)) == 1;
    }
}
