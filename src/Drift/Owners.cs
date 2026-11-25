using Base.Data;
using Drift.GameAccounts;
using Drift.Play;
using Drift.Race;
using Drift.Relay;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Drift;

/// <summary>
/// The rows of the game that belong to a person (a hub person or a games account): the garage, the tuning, the stats and the best times. They no longer point at
/// `users` (a games account is not a user), so deleting is done here by owner, for the account's own delete and for the sweep that removes the rows of people who are gone.
/// Also the game's side of the account module: what to delete, what to export, who is behind a name in the lobby, and closing sockets.
/// </summary>
public sealed class Owners(NpgsqlDataSource db, PersonSockets sockets, RaceHub hub, WorldRelay lobby, [FromKeyedServices("race")] WorldRelay race) : IAccountData, IAccountEvents, IPlayerDirectory, IDisplayNames
{
    static readonly string[] Tables = ["drift_profile", "drift_stats", "drift_tuning", "drift_best_time", "drift_challenge"];

    public async Task DeleteAsync(Guid owner, CancellationToken ct)
    {
        foreach (var t in Tables) await db.ExecAsync($"delete from {t} where user_id = $1", ct, owner);
    }

    public async Task<IReadOnlyDictionary<string, object?>> ExportAsync(Guid owner, CancellationToken ct) => new Dictionary<string, object?>
    {
        ["garage"] = await db.FirstAsync("select car_id, colour, nick, glow, updated_at from drift_profile where user_id = $1",
            r => new { car = r.GetInt16(0), colour = r.GetInt16(1), nick = r.TextOrNull(2), glow = r.IsDBNull(3) ? (int?)null : r.GetInt16(3), updated = r.Time(4) }, ct, owner),
        ["tuning"] = await db.QueryAsync("select car_id, steer, balance, power, handbrake from drift_tuning where user_id = $1 order by car_id",
            r => new { car = r.GetInt16(0), steer = r.GetInt16(1), balance = r.GetInt16(2), power = r.GetInt16(3), handbrake = r.GetInt16(4) }, ct, owner),
        ["stats"] = await db.FirstAsync("select metres, seconds, races, wins, podiums from drift_stats where user_id = $1",
            r => new { metres = r.GetDouble(0), seconds = r.GetDouble(1), races = r.GetInt32(2), wins = r.GetInt32(3), podiums = r.GetInt32(4) }, ct, owner),
        ["challenges"] = await db.QueryAsync("select challenge_id, stars, value, set_at from drift_challenge where user_id = $1 order by challenge_id",
            r => new { id = r.GetString(0), stars = r.GetInt16(1), value = r.GetDouble(2), at = r.Time(3) }, ct, owner),
        ["bestTimes"] = await db.QueryAsync("select map_id, kind, ms, car_id, set_at from drift_best_time where user_id = $1 order by map_id, kind",
            r => new { map = r.GetInt16(0), kind = r.GetInt16(1), ms = r.GetInt32(2), car = r.GetInt16(3), at = r.Time(4) }, ct, owner),
    };

    public void Ended(IEnumerable<Guid> accountIds) => sockets.DropAll(accountIds, Wire.ByeSession);

    public Guid? FindByName(string name) => hub.FindByName(name);

    /// <summary>Does somebody else show this name (as a nickname)? <paramref name="except"/> is the asker's own row.</summary>
    public Task<bool> TakenAsync(string key, Guid? except, CancellationToken ct) =>
        db.ScalarAsync<bool>("select exists (select 1 from drift_profile where nick_key = $1 and user_id <> $2)", ct, key, except ?? Guid.Empty);

    /// <summary>A nickname is taken when another nickname or another games account's name has the same key (the asker's own account name is theirs to use).</summary>
    public async Task<bool> NameTakenAsync(string key, Guid owner, CancellationToken ct) =>
        await TakenAsync(key, owner, ct) || await db.ScalarAsync<bool>("select exists (select 1 from games_account where name_key = $1 and id <> $2)", ct, key, owner);

    public void Banned(string range)
    {
        // sockets from the banned range end now (the ban holds for people who are already in, not only for the next sign-in)
        if (!System.Net.IPNetwork.TryParse(range.Contains('/') ? range : range + (range.Contains(':') ? "/128" : "/32"), out var net)) return;
        bool In(string address) => System.Net.IPAddress.TryParse(address.Split('/')[0], out var ip) && net.Contains(ip);
        lobby.DropWhere(In, Wire.ByeSession); race.DropWhere(In, Wire.ByeSession);
    }

    /// <summary>Removes the rows of owners that are neither a hub person nor a games account (a person deleted in the hub's list).</summary>
    public async Task SweepAsync(CancellationToken ct = default)
    {
        foreach (var t in Tables)
            await db.ExecAsync($"delete from {t} where user_id not in (select id from users) and user_id not in (select id from games_account)", ct);
        // nicknames that came before the rules: they get their key, or are cleared when the rules refuse them or another nickname has the key already
        var old = await db.QueryAsync("select user_id, nick from drift_profile where nick is not null and nick_key is null", r => (r.GetGuid(0), r.GetString(1)), ct);
        foreach (var (id, nick) in old)
        {
            try
            {
                if (NameRules.Problem(nick) is null && !await NameTakenAsync(NameRules.Key(nick), id, ct))
                { await db.ExecAsync("update drift_profile set nick_key = $2 where user_id = $1", ct, id, NameRules.Key(nick)); continue; }
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { }
            await db.ExecAsync("update drift_profile set nick = null where user_id = $1", ct, id);
        }
    }
}
