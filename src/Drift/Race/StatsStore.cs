using Base.Data;
using Base.Web;
using Base.Web.Auth;
using Drift.Relay;
using Npgsql;

namespace Drift.Race;

public sealed record PersonStats(double Km, double Seconds, int Races, int Wins, int Podiums, int BestDrift);

/// <summary>What a race tells the stats: a finished race, and whether it was a win or a podium.</summary>
public interface IRaceStats
{
    Task RaceDoneAsync(Guid userId, bool win, bool podium, CancellationToken ct = default);
}

/// <summary>Counters per person; every statement names the owner (DATA-03). Guests have none.</summary>
public sealed class StatsStore(NpgsqlDataSource db) : IRaceStats
{
    public Task AddDrivingAsync(Guid userId, double metres, double seconds, CancellationToken ct = default) =>
        db.ExecAsync("insert into drift_stats (user_id, metres, seconds) values ($1, $2, $3) on conflict (user_id) do update set metres = drift_stats.metres + $2, seconds = drift_stats.seconds + $3", ct, userId, Math.Max(0, metres), Math.Max(0, seconds));

    public Task RaceDoneAsync(Guid userId, bool win, bool podium, CancellationToken ct = default) =>
        db.ExecAsync("insert into drift_stats (user_id, races, wins, podiums) values ($1, 1, $2, $3) on conflict (user_id) do update set races = drift_stats.races + 1, wins = drift_stats.wins + $2, podiums = drift_stats.podiums + $3",
            ct, userId, win ? 1 : 0, podium ? 1 : 0);

    public async Task<PersonStats> GetAsync(Guid userId, CancellationToken ct = default)
    {
        var best = await db.ScalarAsync<int?>("select max(ms) from drift_best_time where user_id = $1 and kind = 2", ct, userId) ?? 0;
        return await db.FirstAsync("select metres, seconds, races, wins, podiums from drift_stats where user_id = $1",
            r => new PersonStats(r.GetDouble(0) / 1000, r.GetDouble(1), r.GetInt32(2), r.GetInt32(3), r.GetInt32(4), best), ct, userId) ?? new PersonStats(0, 0, 0, 0, 0, best);
    }
}

/// <summary>
/// Follows the sockets of the signed-in people: how far they drive (from the accepted poses, so it is what the relay believed) and how long their sockets
/// are open; it writes the totals when a socket ends and every minute. Guests are not followed. A relay is hooked with <see cref="Follow"/>.
/// </summary>
public sealed class StatsTracker(StatsStore store, TimeProvider time)
{
    sealed class Acc { public Guid Person; public double Metres, LastX, LastZ; public bool Has; public long Flushed; }   // Flushed: the moment up to which the time is already written
    readonly object gate = new();
    readonly Dictionary<Session, Acc> live = [];

    public void Follow(WorldRelay relay) => relay.PoseAccepted += Pose;

    public void Join(Session s, Guid person, bool guest)
    {
        if (guest) return;
        lock (gate) { var now = time.GetTimestamp(); live[s] = new Acc { Person = person, Flushed = now }; }
    }

    void Pose(PoseSample p)
    {
        lock (gate)
        {
            if (!live.TryGetValue(p.Session, out var a)) return;
            if (a.Has) { var d = double.Hypot(p.X - a.LastX, p.Z - a.LastZ); if (d < 120) a.Metres += d; }   // a teleport is not driving
            a.LastX = p.X; a.LastZ = p.Z; a.Has = true;
        }
    }

    public Task LeaveAsync(Session s)
    {
        Acc? a;
        lock (gate) { if (!live.Remove(s, out a)) return Task.CompletedTask; }
        return Write(a);
    }

    /// <summary>Writes what has been counted so far for every open socket (called every minute).</summary>
    public async Task FlushAsync()
    {
        List<Acc> due = [];
        lock (gate)
        {
            var now = time.GetTimestamp();
            foreach (var a in live.Values) { due.Add(new Acc { Person = a.Person, Metres = a.Metres, Flushed = a.Flushed }); a.Metres = 0; a.Flushed = now; }
        }
        foreach (var a in due) await Write(a);
    }

    async Task Write(Acc a)
    {
        try { await store.AddDrivingAsync(a.Person, a.Metres, time.GetElapsedTime(a.Flushed).TotalSeconds); }
        catch (Exception) { /* counters are not worth a failed socket: the next minute's numbers are written as usual */ }
    }
}

internal static class StatsEndpoints
{
    public static void MapStats(this WebApplication app)
    {
        foreach (var prefix in new[] { "/api", Drift.GameAccounts.GameAccountEndpoints.Prefix })
            app.MapGet(prefix + "/stats", async (HttpContext ctx, StatsStore store, CancellationToken ct) =>
            {
                var s = await store.GetAsync(ctx.Owner(), ct);
                return Results.Ok(new { km = Math.Round(s.Km, 1), seconds = (int)s.Seconds, races = s.Races, wins = s.Wins, podiums = s.Podiums, bestDrift = s.BestDrift });
            });
        // every minute the open sockets' totals are written; a failed write is logged and tried again with the next minute's numbers
        var tracker = app.Services.GetRequiredService<StatsTracker>();
        _ = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
            try { while (await timer.WaitForNextTickAsync(app.Lifetime.ApplicationStopping)) { try { await tracker.FlushAsync(); } catch (Exception e) when (e is not OperationCanceledException) { app.Logger.LogWarning(e, "writing the stats failed"); } } }
            catch (OperationCanceledException) { }
        });
    }
}
