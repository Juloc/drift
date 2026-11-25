using System.Security.Cryptography;
using System.Text;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Drift.Guests;

/// <summary>Who a guest is: the session id stands where a person's id stands for the lobby and the races.</summary>
public sealed record GuestIdentity(Guid Id, string Name, int Car, int Colour, DateTimeOffset Expires);

public sealed record GuestLink(Guid Id, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, int MaxUses, int Uses);

public sealed record NewLink(Guid Id, string Token, DateTimeOffset ExpiresAt, int MaxUses);

/// <summary>
/// Guest links and guest sessions. Both secrets are 256 random bits; only their SHA-256 is stored. A link works for a few hours and a few uses; a guest
/// session ends with its link (or earlier when an administrator ends the links). Times are the database's (<c>now()</c>), one clock for all.
/// </summary>
public sealed class GuestService(NpgsqlDataSource db)
{
    public const int MaxValidLinks = 5, MaxHours = 12, MaxUses = 20;

    public static string NewSecret() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    static byte[] Hash(string secret) => SHA256.HashData(Encoding.UTF8.GetBytes(secret));

    public async Task<Result<NewLink>> CreateLinkAsync(Guid admin, int hours, int uses, CancellationToken ct = default)
    {
        if (hours is < 1 or > MaxHours || uses is < 1 or > MaxUses) return Error.Invalid("guest.range", "Hours or uses are out of range.");
        var valid = await db.ScalarAsync<long>("select count(*) from drift_guest_link where revoked_at is null and expires_at > now()", ct);
        if (valid >= MaxValidLinks) return Error.Conflict("guest.too_many_links", "There are already as many guest links as allowed.");
        var token = NewSecret(); var id = Ids.New();
        var expires = (await db.QueryAsync(
            "insert into drift_guest_link (id, hash, created_by, expires_at, max_uses) values ($1, $2, $3, now() + make_interval(hours => $4), $5) returning expires_at",
            r => r.Time(0), ct, id, Hash(token), admin, hours, (short)uses)).Single();
        return new NewLink(id, token, expires, uses);
    }

    public Task<List<GuestLink>> ListLinksAsync(CancellationToken ct = default) =>
        db.QueryAsync("select id, created_at, expires_at, max_uses, uses from drift_guest_link where revoked_at is null and expires_at > now() order by created_at desc",
            r => new GuestLink(r.GetGuid(0), r.Time(1), r.Time(2), r.GetInt16(3), r.GetInt16(4)), ct);

    /// <summary>Ends one link and every guest session that came through it. Returns the session ids (their sockets must close).</summary>
    public async Task<List<Guid>> RevokeLinkAsync(Guid linkId, CancellationToken ct = default)
    {
        var ids = await db.QueryAsync("delete from drift_guest_session where link_id = $1 returning id", r => r.GetGuid(0), ct, linkId);
        await db.ExecAsync("update drift_guest_link set revoked_at = now() where id = $1 and revoked_at is null", ct, linkId);
        return ids;
    }

    /// <summary>Ends every link and every guest session at once.</summary>
    public async Task<List<Guid>> RevokeAllAsync(CancellationToken ct = default)
    {
        var ids = await db.QueryAsync("delete from drift_guest_session returning id", r => r.GetGuid(0), ct);
        await db.ExecAsync("update drift_guest_link set revoked_at = now() where revoked_at is null", ct);
        return ids;
    }

    /// <summary>The name of a guest: 2 to 16 characters, letters, digits, space, dot, dash, underscore, starting with a letter or digit.</summary>
    public static bool ValidName(string? name) =>
        name is { Length: >= 2 and <= 16 } && char.IsLetterOrDigit(name[0]) && name.All(c => char.IsLetterOrDigit(c) || c is ' ' or '.' or '-' or '_');

    /// <summary>Spends one use of a link and makes a session. Null when the link is not good (unknown, ended, expired, used up): the caller says the same to all.</summary>
    public async Task<(GuestIdentity Guest, string Cookie)?> RedeemAsync(string token, string name, int colour, CancellationToken ct = default)
    {
        await db.ExecAsync("delete from drift_guest_session where expires_at <= now()", ct);
        var cookie = NewSecret(); var id = Ids.New();
        // one statement: the use is counted only if the link is still good, and the session is made only then
        var made = await db.QueryAsync(
            """
            with l as (
              update drift_guest_link set uses = uses + 1
              where hash = $1 and revoked_at is null and expires_at > now() and uses < max_uses
              returning id, expires_at)
            insert into drift_guest_session (id, hash, link_id, name, car_id, colour, expires_at)
            select $2, $3, l.id, $4, 0, $5, l.expires_at from l
            returning expires_at
            """, r => r.Time(0), ct, Hash(token), id, Hash(cookie), name, (short)colour);
        return made.Count == 1 ? (new GuestIdentity(id, name, 0, colour, made[0]), cookie) : null;
    }

    public Task<GuestIdentity?> ValidateAsync(string cookie, CancellationToken ct = default) =>
        db.FirstAsync(
            """
            select s.id, s.name, s.car_id, s.colour, s.expires_at
            from drift_guest_session s join drift_guest_link l on l.id = s.link_id
            where s.hash = $1 and s.expires_at > now() and l.revoked_at is null and l.expires_at > now()
            """, r => new GuestIdentity(r.GetGuid(0), r.GetString(1), r.GetInt16(2), r.GetInt16(3), r.Time(4)), ct, Hash(cookie));

    public Task EndSessionAsync(Guid id, CancellationToken ct = default) => db.ExecAsync("delete from drift_guest_session where id = $1", ct, id);
}
