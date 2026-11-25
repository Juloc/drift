using Base.Data;
using Drift.GameAccounts;
using Drift.Play;
using Drift.Race;
using Drift.Relay;
using Npgsql;

namespace Drift;

/// <summary>
/// The rows of the game that belong to a person (a hub person or a games account): the garage, the tuning, the stats and the best times. They no longer point at
/// `users` (a games account is not a user), so deleting is done here by owner, for the account's own delete and for the sweep that removes the rows of people who are gone.
/// Also the game's side of the account module: what to delete, what to export, who is behind a name in the lobby, and closing sockets.
/// </summary>
public sealed class Owners(NpgsqlDataSource db, PersonSockets sockets, RaceHub hub) : IAccountData, IAccountEvents, IPlayerDirectory
{
    static readonly string[] Tables = ["drift_profile", "drift_stats", "drift_tuning", "drift_best_time"];

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
        ["bestTimes"] = await db.QueryAsync("select map_id, kind, ms, car_id, set_at from drift_best_time where user_id = $1 order by map_id, kind",
            r => new { map = r.GetInt16(0), kind = r.GetInt16(1), ms = r.GetInt32(2), car = r.GetInt16(3), at = r.Time(4) }, ct, owner),
    };

    public void Ended(IEnumerable<Guid> accountIds) => sockets.DropAll(accountIds, Wire.ByeSession);

    public Guid? FindByName(string name) => hub.FindByName(name);

    /// <summary>Removes the rows of owners that are neither a hub person nor a games account (a person deleted in the hub's list).</summary>
    public async Task SweepAsync(CancellationToken ct = default)
    {
        foreach (var t in Tables)
            await db.ExecAsync($"delete from {t} where user_id not in (select id from users) and user_id not in (select id from games_account)", ct);
    }
}
