using System.Net;
using System.Text.RegularExpressions;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Drift.GameAccounts;

public sealed record Ban(Guid Id, string Range, DateTimeOffset Until, string? Reason, DateTimeOffset MadeAt);

/// <summary>Bans of an address or a network for a time (the administrator's). They stop sign-up and sign-in from there; the key is what the limits count under (IPv4 itself, IPv6 the /64).</summary>
public sealed partial class Bans(NpgsqlDataSource db)
{
    [GeneratedRegex(@"^[0-9a-fA-F:.]+(/\d{1,3})?$")]
    private static partial Regex Plain();

    public async Task<bool> BannedAsync(string ipKey, CancellationToken ct = default)
    {
        if (!Plain().IsMatch(ipKey)) return false;
        try { return await db.ScalarAsync<bool>("select exists (select 1 from games_account_ban where until > now() and range >>= $1::inet)", ct, ipKey); }
        catch (PostgresException) { return false; }   // not an address
    }

    /// <summary>Makes a ban. The range must be an address or a network that is not too large (IPv4 from /16, IPv6 from /48): one slip must not shut out a country.</summary>
    public async Task<Result<Ban>> AddAsync(string? range, int hours, string? reason, Guid? by, CancellationToken ct = default)
    {
        if (hours is < 1 or > 24 * 365) return Error.Invalid("games.ban_range", "The time is out of range.");
        if (range is null || !Plain().IsMatch(range) || !IPNetwork.TryParse(range.Contains('/') ? range : range + (range.Contains(':') ? "/128" : "/32"), out var net)) return Error.Invalid("games.ban_range", "Not an address or network.");
        var v6 = range.Contains(':');
        if (net.PrefixLength < (v6 ? 48 : 16)) return Error.Invalid("games.ban_range", "That network is too large.");
        var id = Ids.New();
        var made = await db.QueryAsync("insert into games_account_ban (id, range, until, reason, made_by) values ($1, $2::inet, now() + make_interval(hours => $3), $4, $5) returning until, made_at",
            r => (r.Time(0), r.Time(1)), ct, id, range, hours, reason is { Length: > 200 } ? reason[..200] : reason, by is { } g ? g : DBNull.Value);
        return new Ban(id, range, made[0].Item1, reason, made[0].Item2);
    }

    public Task<List<Ban>> ListAsync(CancellationToken ct = default) =>
        db.QueryAsync("select id, range::text, until, reason, made_at from games_account_ban where until > now() order by made_at desc limit 200", r => new Ban(r.GetGuid(0), r.GetString(1), r.Time(2), r.TextOrNull(3), r.Time(4)), ct);

    public Task RemoveAsync(Guid id, CancellationToken ct = default) => db.ExecAsync("delete from games_account_ban where id = $1", ct, id);
}
