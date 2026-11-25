using System.Security.Cryptography;
using System.Text;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Base.Accounts;

public static class SessionTokens
{
    /// <summary>256 bit from the system's random generator, URL-safe.</summary>
    public static string New() => Ids.Token(32);

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

/// <summary>Who a request comes from. <see cref="Id"/> is the stable id of the session (the device), <see cref="NewToken"/> a rotated cookie value to send back.</summary>
public sealed record SessionIdentity(Guid UserId, string UserName, string[] Roles, string Hash, string? NewToken, Guid Id, string? HubSid = null)
{
    public bool Has(string role) => Roles.Contains(role, StringComparer.Ordinal);

    /// <summary>The person signed in through the central sign-in (they have no password here).</summary>
    public bool ViaHub => HubSid is not null;
}

public sealed record SessionListItem(Guid Id, bool Current, DateTimeOffset CreatedAt, DateTimeOffset LastSeen, string? UserAgent, string? Ip);

/// <summary>
/// Sessions in PostgreSQL (AUTH-03, AUTH-04). The cookie holds 256 random bits; stored is only their SHA-256 value, so the table cannot be used to sign in.
/// Nothing lives in memory and nothing depends on a key made at start: an update or a restart signs nobody out.
/// Idle 30 days, at most 180 days. Every 12 hours the session gets a new cookie; the old one stays valid for 10 minutes,
/// so requests already on their way and a lost answer do not sign anybody out.
/// </summary>
public sealed class SessionStore(NpgsqlDataSource db)
{
    public const int IdleDays = 30;
    public const int MaxDays = 180;
    public const int RotateHours = 12;
    public const int GraceMinutes = 10;

    private static readonly string Valid = $"s.created_at > now() - interval '{MaxDays} days' and s.last_seen > now() - interval '{IdleDays} days' and u.state = 'active' and (u.totp_confirmed or u.hub_sub is not null)";

    public async Task<string> CreateAsync(Guid userId, string? ip, string? userAgent, CancellationToken ct = default, string? hubSid = null, string? hubHint = null)
    {
        var token = SessionTokens.New();
        await db.ExecAsync("insert into sessions (id, hash, user_id, created_at, last_seen, rotated_at, user_agent, ip, hub_sid, hub_hint) values ($1, $2, $3, now(), now(), now(), $4, $5, $6, $7)", ct,
            Ids.New(), SessionTokens.Hash(token), userId, userAgent is { Length: > 200 } ? userAgent[..200] : userAgent, ip, hubSid, hubHint);
        return token;
    }

    /// <param name="rotate">False where no new cookie can be sent back (a WebSocket handshake, a stream).</param>
    public async Task<SessionIdentity?> ResolveAsync(string token, bool rotate, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 100) return null;
        var hash = SessionTokens.Hash(token);

        Guid userId, id; string userName; string[] roles; bool due; string? hubSid;
        await using (var cmd = db.Cmd($"select s.user_id, u.name, u.roles, s.rotated_at < now() - interval '{RotateHours} hours', s.id, s.hub_sid from sessions s join users u on u.id = s.user_id where s.hash = $1 and {Valid}", hash))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            if (!await r.ReadAsync(ct)) return await ResolveByPreviousAsync(hash, ct);
            userId = r.GetGuid(0); userName = r.GetString(1); roles = r.GetFieldValue<string[]>(2); due = r.GetBoolean(3); id = r.GetGuid(4); hubSid = r.TextOrNull(5);
        }

        if (rotate && due)
        {
            var newToken = SessionTokens.New();
            var changed = await db.ExecAsync(
                $"update sessions set hash = $2, prev_hash = $1, prev_until = now() + interval '{GraceMinutes} minutes', rotated_at = now(), last_seen = now() where hash = $1 and rotated_at < now() - interval '{RotateHours} hours'",
                ct, hash, SessionTokens.Hash(newToken));
            if (changed == 1) return new SessionIdentity(userId, userName, roles, SessionTokens.Hash(newToken), newToken, id, hubSid);
            // a request at the same moment was faster: the old cookie is still good (grace), we only report who it is
            return await ResolveByPreviousAsync(hash, ct);
        }

        await db.ExecAsync("update sessions set last_seen = now() where hash = $1 and last_seen < now() - interval '10 minutes'", ct, hash);
        return new SessionIdentity(userId, userName, roles, hash, null, id, hubSid);
    }

    private Task<SessionIdentity?> ResolveByPreviousAsync(string previousHash, CancellationToken ct) =>
        db.FirstAsync($"select s.hash, s.user_id, u.name, u.roles, s.id, s.hub_sid from sessions s join users u on u.id = s.user_id where s.prev_hash = $1 and s.prev_until > now() and {Valid}",
            r => new SessionIdentity(r.GetGuid(1), r.GetString(2), r.GetFieldValue<string[]>(3), r.GetString(0), null, r.GetGuid(4), r.TextOrNull(5)), ct, previousHash);

    /// <summary>The ID token of the central sign-in that made this session (the hint for the hub's sign-out), or null.</summary>
    public Task<string?> HubHintAsync(Guid sessionId, CancellationToken ct = default) =>
        db.ScalarAsync<string>("select hub_hint from sessions where id = $1", ct, sessionId);

    public Task DeleteAsync(string hash, CancellationToken ct = default) => db.ExecAsync("delete from sessions where hash = $1", ct, hash);

    /// <summary>Ends one session of a person (a device in the list). Only the person's own sessions can be ended this way.</summary>
    public async Task<bool> DeleteByIdAsync(Guid userId, Guid sessionId, CancellationToken ct = default) =>
        await db.ExecAsync("delete from sessions where user_id = $1 and id = $2", ct, userId, sessionId) == 1;

    public Task<int> DeleteOthersAsync(Guid userId, Guid keepId, CancellationToken ct = default) =>
        db.ExecAsync("delete from sessions where user_id = $1 and id <> $2", ct, userId, keepId);

    public async Task<IReadOnlyList<SessionListItem>> ListAsync(Guid userId, Guid currentId, CancellationToken ct = default) =>
        await db.QueryAsync($"select s.id, s.created_at, s.last_seen, s.user_agent, s.ip from sessions s join users u on u.id = s.user_id where s.user_id = $1 and {Valid} order by s.last_seen desc",
            r => new SessionListItem(r.GetGuid(0), r.GetGuid(0) == currentId, r.Time(1), r.Time(2), r.TextOrNull(3), r.TextOrNull(4)), ct, userId);

    /// <summary>Ends every session of a person (they were blocked, or their role no longer exists).</summary>
    public Task<int> DeleteAllOfAsync(Guid userId, CancellationToken ct = default) => db.ExecAsync("delete from sessions where user_id = $1", ct, userId);

    /// <summary>
    /// The back-channel logout of the central sign-in: ends the sessions that were made for this central session (<paramref name="sid"/>) of this person
    /// (<paramref name="sub"/>). With only one of the two, that one decides; a sid that belongs to another person ends nothing.
    /// </summary>
    public Task<int> DeleteByHubAsync(string? sid, string? sub, CancellationToken ct = default) =>
        db.ExecAsync("delete from sessions s using users u where u.id = s.user_id and u.hub_sub is not null and ($1::text is null or s.hub_sid = $1) and ($2::text is null or u.hub_sub = $2) and ($1::text is not null or $2::text is not null)", ct, sid, sub);

    /// <summary>Removes sessions that have run out and old grace entries.</summary>
    public async Task<int> PurgeAsync(CancellationToken ct = default)
    {
        var n = await db.ExecAsync($"delete from sessions where created_at < now() - interval '{MaxDays} days' or last_seen < now() - interval '{IdleDays} days'", ct);
        await db.ExecAsync("update sessions set prev_hash = null, prev_until = null where prev_until < now()", ct);
        return n;
    }
}
