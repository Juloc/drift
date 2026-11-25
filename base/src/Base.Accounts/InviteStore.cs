using System.Security.Cryptography;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Base.Accounts;

public sealed record InviteRow(Guid Id, Guid UserId, DateTimeOffset ExpiresAt);

/// <summary>
/// Invitation links (AUTH-11): 256 random bits in the link, only their SHA-256 in the table. One link per person at a time, valid for
/// <see cref="Lifetime"/>, and it works once: the row is marked used in the same step that finishes the setup.
/// </summary>
public sealed class InviteStore(NpgsqlDataSource db, TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

    /// <summary>Makes a new link for the person; older links of the same person stop working. Returns the token (shown once) and its end.</summary>
    public async Task<(string Token, DateTimeOffset ExpiresAt)> CreateAsync(Guid userId, string createdBy, CancellationToken ct = default)
    {
        var token = Ids.Token(32);
        var now = clock.GetUtcNow();
        var until = now + Lifetime;
        await db.InTransactionAsync(async (conn, tx) =>
        {
            await conn.ExecAsync(tx, "delete from invites where user_id = $1", ct, userId);
            await conn.ExecAsync(tx, "insert into invites (id, token_hash, user_id, created_by, created_at, expires_at) values ($1, $2, $3, $4, $5, $6)", ct,
                Ids.New(), SessionTokens.Hash(token), userId, createdBy, now, until);
        }, ct);
        return (token, until);
    }

    /// <summary>The open invitation for a link, or null when it is unknown, used or out of date.</summary>
    public Task<InviteRow?> FindOpenAsync(string token, CancellationToken ct = default) =>
        token.Length is 0 or > 100 ? Task.FromResult<InviteRow?>(null)
            : db.FirstAsync("select id, user_id, expires_at from invites where token_hash = $1 and used_at is null and expires_at > $2",
                r => new InviteRow(r.GetGuid(0), r.GetGuid(1), r.Time(2)), ct, SessionTokens.Hash(token), clock.GetUtcNow());

    /// <summary>Finishes the setup of an invited person: marks the link used and makes the person active, in one step. False when somebody was faster.</summary>
    public Task<bool> RedeemAsync(InviteRow invite, long totpStep, CancellationToken ct = default) =>
        db.InTransactionAsync(async (conn, tx) =>
        {
            if (await conn.ExecAsync(tx, "update invites set used_at = $2 where id = $1 and used_at is null and expires_at > $2", ct, invite.Id, clock.GetUtcNow()) != 1) return false;
            return await conn.ExecAsync(tx, "update users set state = 'active', totp_confirmed = true, totp_last_step = $2 where id = $1 and state = 'invited'", ct, invite.UserId, totpStep) == 1;
        }, ct);

    public async Task<DateTimeOffset?> OpenUntilAsync(Guid userId, CancellationToken ct = default) =>
        (await db.QueryAsync("select expires_at from invites where user_id = $1 and used_at is null and expires_at > $2", r => (DateTimeOffset?)r.Time(0), ct, userId, clock.GetUtcNow())).FirstOrDefault();
}
