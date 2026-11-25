using Base.Data;
using Drift.Garage;
using Npgsql;

namespace Drift.Race;

public sealed record BoardRow(string Name, int Ms, int Car);

/// <summary>The best times per map. A time is written only when it beats the person's old one; every statement names the owner (DATA-03).</summary>
/// <summary>What the race needs from the best-times store (a test brings its own).</summary>
public interface IBestTimes
{
    Task<bool> RecordAsync(Guid userId, int map, int kind, int ms, int car, CancellationToken ct = default);
}

public sealed class RaceStore(NpgsqlDataSource db) : IBestTimes
{
    public const int Lap = 0, Race = 1;

    /// <returns>true when this is a new best for the person</returns>
    public async Task<bool> RecordAsync(Guid userId, int map, int kind, int ms, int car, CancellationToken ct = default) =>
        await db.ScalarAsync<bool>(
            """
            with up as (
              insert into drift_best_time (map_id, user_id, kind, ms, car_id) values ($1, $2, $3, $4, $5)
              on conflict (map_id, user_id, kind) do update set ms = $4, car_id = $5, set_at = now() where drift_best_time.ms > $4
              returning 1)
            select exists (select 1 from up)
            """, ct, (short)map, userId, (short)kind, ms, (short)car);

    /// <summary>The best few, fastest first, with the names the others know (nickname or neutral name, never the account name).</summary>
    public async Task<List<BoardRow>> TopAsync(int map, int kind, int count = 5, CancellationToken ct = default) =>
        await db.QueryAsync(
            """
            select t.user_id, p.nick, coalesce(p.colour, 8), t.ms, t.car_id
            from drift_best_time t left join drift_profile p on p.user_id = t.user_id
            where t.map_id = $1 and t.kind = $2 order by t.ms asc limit $3
            """,
            r => new BoardRow(r.TextOrNull(1) ?? GarageStore.NeutralName(r.GetGuid(0), r.GetInt16(2)), r.GetInt32(3), r.GetInt16(4)), ct, (short)map, (short)kind, count);
}
