using Base.Data;
using Drift.Garage;
using Npgsql;

namespace Drift.Race;

public sealed record BoardRow(string Name, int Ms, int Car, bool Mine = false);

/// <summary>A person's own best on a map and the place it has (1 = best).</summary>
public sealed record Standing(int Value, int Place);

/// <summary>The best times per map. A time is written only when it beats the person's old one; every statement names the owner (DATA-03).</summary>
/// <summary>What the race needs from the best-times store (a test brings its own).</summary>
public interface IBestTimes
{
    Task<bool> RecordAsync(Guid userId, int map, int kind, int ms, int car, int feel = 0, CancellationToken ct = default);
}

public sealed class RaceStore(NpgsqlDataSource db) : IBestTimes
{
    /// <summary>Lap and race: milliseconds, less is better. Drift and tandem: points of the best chain, more is better.</summary>
    public const int Lap = 0, Race = 1, Drift = 2, Tandem = 3, TandemRun = 4, Attack = 5;   // Attack: the points of one whole run (the mode Drift attack)

    /// <returns>true when this is a new best for the person</returns>
    public async Task<bool> RecordAsync(Guid userId, int map, int kind, int ms, int car, int feel = 0, CancellationToken ct = default) =>
        await db.ScalarAsync<bool>(
            """
            with up as (
              insert into drift_best_time (map_id, user_id, kind, ms, car_id, feel) values ($1, $2, $3, $4, $5, $6)
              on conflict (map_id, user_id, kind, feel) do update set ms = $4, car_id = $5, set_at = now()
                where case when $3 >= 2 then drift_best_time.ms < $4 else drift_best_time.ms > $4 end
              returning 1)
            select exists (select 1 from up)
            """, ct, (short)map, userId, (short)kind, ms, (short)car, (short)feel);

    /// <summary>The best ten, best first, with the names the others know (nickname, a games account's chosen name, or a neutral name; never a hub account name); <paramref name="me"/> marks the caller's row.</summary>
    public async Task<List<BoardRow>> TopAsync(int map, int kind, int count = 10, Guid? me = null, int feel = 0, CancellationToken ct = default) =>
        await db.QueryAsync(
            """
            select t.user_id, coalesce(ga.name, u.name), coalesce(p.colour, 8), t.ms, t.car_id
            from drift_best_time t left join drift_profile p on p.user_id = t.user_id left join games_account ga on ga.id = t.user_id left join users u on u.id = t.user_id
            where t.map_id = $1 and t.kind = $2 and t.feel = $4
            order by case when $2 >= 2 then -t.ms else t.ms end asc limit $3
            """,
            r => new BoardRow(r.TextOrNull(1) ?? GarageStore.NeutralName(r.GetGuid(0), r.GetInt16(2)), r.GetInt32(3), r.GetInt16(4), me is { } m && m == r.GetGuid(0)), ct, (short)map, (short)kind, count, (short)feel);

    /// <summary>The caller's own best and place, or null if they have none.</summary>
    public async Task<Standing?> StandingAsync(int map, int kind, Guid userId, int feel = 0, CancellationToken ct = default) =>
        await db.FirstAsync(
            """
            select t.ms, (select count(*) + 1 from drift_best_time o where o.map_id = t.map_id and o.kind = t.kind and o.feel = t.feel and (case when t.kind >= 2 then o.ms > t.ms else o.ms < t.ms end))
            from drift_best_time t where t.map_id = $1 and t.kind = $2 and t.user_id = $3 and t.feel = $4
            """, r => new Standing(r.GetInt32(0), (int)r.GetInt64(1)), ct, (short)map, (short)kind, userId, (short)feel);
}
