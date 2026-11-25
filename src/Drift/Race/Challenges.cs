using System.Text.Json;
using Base.Data;
using Base.Web;
using Drift.Relay;
using Npgsql;

namespace Drift.Race;

/// <summary>A challenge from game/data/challenges.json (the browser reads the same file).</summary>
public sealed record ChallengeDef(string Id, string Type, int Map, double Time, double[] Stars)
{
    public bool LowerIsBetter => Type == "lap";

    public int StarsFor(double value) => LowerIsBetter ? (value > 0 ? Stars.Count(t => value <= t) : 0) : Stars.Count(t => value >= t);

    public static List<ChallengeDef> Load(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("challenges").EnumerateArray()
            .Select(c => new ChallengeDef(c.GetProperty("id").GetString()!, c.GetProperty("type").GetString()!, c.GetProperty("map").GetInt32(), c.GetProperty("time").GetDouble(), c.GetProperty("stars").EnumerateArray().Select(x => x.GetDouble()).ToArray()))
            .ToList();
    }
}

/// <summary>One run of a challenge, the same judging as game/sim/challenge.js (a test reads the same vectors, tests/vectors/challenge.json). Not for `lap`: the race logic judges those.</summary>
public sealed class ChallengeRun(ChallengeDef def)
{
    public const double HoldSlip = 0.35, HoldSpeed = 8, FastSpeed = 18;
    public ChallengeDef Def { get; } = def;
    public DriftScore Score { get; } = new();
    public double T { get; private set; }
    public double Current { get; private set; }
    public double Longest { get; private set; }
    public double Fast { get; private set; }
    public int MaxMult { get; private set; } = 1;
    public double Tandem { get; private set; }
    public bool Done { get; private set; }
    public bool Failed { get; private set; }

    public void Step(double slip, double speed, double hit, double turned, double tandem, double dt)
    {
        if (Done) return;
        T += dt;
        Score.Step(slip, speed, hit, turned, dt);
        var holding = Math.Abs(slip) > HoldSlip && speed > HoldSpeed && hit <= 0;
        Current = holding ? Current + dt : 0;
        Longest = Math.Max(Longest, Current);
        if (Math.Abs(slip) > 0.26 && speed > FastSpeed && hit <= 0) Fast += dt;
        MaxMult = Math.Max(MaxMult, Score.Mult);
        Tandem = Math.Max(Tandem, tandem);
        Failed = Def.Type == "clean-sheet" && hit > 2;
        Done = Failed || T >= Def.Time;
    }

    public double Value => Def.Type switch
    {
        "drift-points" => Math.Max(Score.Best, Score.Pending),
        "drift-hold" => Longest,
        "drift-fast" => Fast,
        "chain-mult" => MaxMult,
        "tandem" => Tandem,
        "clean-sheet" => Score.Banked + Score.Pending,
        _ => 0,
    };
    public int Stars => Def.StarsFor(Value);
}

/// <summary>The best stars of each person (every statement names the owner, DATA-03).</summary>
public sealed class ChallengeStore(NpgsqlDataSource db)
{
    public sealed record Progress(string Id, int Stars, double Value);

    /// <returns>true when this is a new best (more stars, or the same stars with a better value)</returns>
    public async Task<bool> RecordAsync(Guid owner, ChallengeDef def, int stars, double value, CancellationToken ct = default) =>
        await db.ScalarAsync<bool>(
            $"""
            with up as (
              insert into drift_challenge (user_id, challenge_id, stars, value) values ($1, $2, $3, $4)
              on conflict (user_id, challenge_id) do update set stars = $3, value = $4, set_at = now()
                where drift_challenge.stars < $3 or (drift_challenge.stars = $3 and drift_challenge.value {(def.LowerIsBetter ? ">" : "<")} $4)
              returning 1)
            select exists (select 1 from up)
            """, ct, owner, def.Id, (short)stars, value);

    public Task<List<Progress>> AllAsync(Guid owner, CancellationToken ct = default) =>
        db.QueryAsync("select challenge_id, stars, value from drift_challenge where user_id = $1 order by challenge_id", r => new Progress(r.GetString(0), r.GetInt16(1), r.GetDouble(2)), ct, owner);
}

/// <summary>What the race hands over when a clean lap is recorded (lap challenges).</summary>
public interface IRaceChallenges
{
    Task LapAsync(Guid person, int map, double ms, CancellationToken ct = default);
}

/// <summary>
/// Judges the challenges on the server, from the poses of the lobby, like the drift points of a race: the page says "start this one" ({ t: "challenge.start", id }), the server
/// runs the judging on the poses it accepted and tells the car how it stands ({ t: "challenge", id, value, stars, left, done, failed, saved }) twice a second; a finished run of a
/// signed-in person is saved if it is better. Guests are judged and told but nothing is saved. Lap challenges are judged by the race logic (<see cref="LapAsync"/>).
/// </summary>
public sealed class ChallengeTracker(IReadOnlyList<ChallengeDef> defs, ChallengeStore? store, Func<Session, double>? tandemTotal = null) : IRaceChallenges
{
    sealed class Live(Guid person, bool guest) { public Guid Person = person; public bool Guest = guest; public ChallengeRun? Run; public double TandemBase, LastX, LastZ, LastT = -1, Sent = -9; public bool Has; }
    readonly object gate = new();
    readonly Dictionary<Session, Live> live = [];

    public void Follow(WorldRelay relay) => relay.PoseAccepted += Pose;
    public void Join(Session s, Guid person, bool guest) { lock (gate) live[s] = new Live(person, guest); }
    public void Leave(Session s) { lock (gate) live.Remove(s); }
    public ChallengeDef? Find(string id) => defs.FirstOrDefault(d => d.Id == id);
    public ChallengeRun? RunOf(Session s) { lock (gate) return live.TryGetValue(s, out var l) ? l.Run : null; }

    static void Send(Session s, object message) { if (s.Peer is ITextPeer p) p.SendText(JsonSerializer.Serialize(message)); }

    /// <summary>The page's control messages: challenge.start (with an id) and challenge.stop.</summary>
    public void OnText(Session s, string text)
    {
        JsonDocument? doc;
        try { doc = JsonDocument.Parse(text); } catch (JsonException) { return; }
        using (doc)
        {
            var r = doc.RootElement;
            if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("t", out var t) || t.ValueKind != JsonValueKind.String) return;
            lock (gate)
            {
                if (!live.TryGetValue(s, out var l)) return;
                switch (t.GetString())
                {
                    case "challenge.start":
                        if (r.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && Find(id.GetString()!) is { Type: not "lap" } def)
                        { l.Run = new ChallengeRun(def); l.TandemBase = tandemTotal?.Invoke(s) ?? 0; l.LastT = -1; l.Has = false; l.Sent = -9; Send(s, new { t = "challenge", id = def.Id, value = 0, stars = 0, left = def.Time, done = false, failed = false, saved = false }); }
                        break;
                    case "challenge.stop": l.Run = null; break;
                }
            }
        }
    }

    void Pose(PoseSample p)
    {
        (Guid Person, ChallengeDef Def, int Stars, double Value)? save = null;
        lock (gate)
        {
            if (!live.TryGetValue(p.Session, out var l) || l.Run is not { } run) return;
            // the same speed the race gives a pose: the claimed one, no more than the car moved (and the car can drive)
            var dt = l.LastT < 0 ? 0 : Math.Clamp(p.Seconds - l.LastT, 0, 0.25);
            if (l.Has && dt > 0)
            {
                var beta = Math.Clamp(p.Beta, -1.4, 1.4);
                var implied = double.Hypot(p.X - l.LastX, p.Z - l.LastZ) / (p.Seconds - l.LastT);
                var speed = Math.Min(Math.Min(Math.Abs(p.Vf) / Math.Max(0.3, Math.Cos(beta)), implied * 1.25 + 1), 60);
                run.Step(beta, speed, (p.Flags & 4) != 0 ? 5 : 0, Math.Abs(beta), (tandemTotal?.Invoke(p.Session) ?? 0) - l.TandemBase, dt);
            }
            l.LastX = p.X; l.LastZ = p.Z; l.LastT = p.Seconds; l.Has = true;
            if (run.Done || p.Seconds - l.Sent >= 0.5)
            {
                l.Sent = p.Seconds;
                if (run.Done && !l.Guest && store is not null) save = (l.Person, run.Def, run.Stars, run.Value);
                Send(p.Session, new { t = "challenge", id = run.Def.Id, value = Math.Round(run.Value, 1), stars = run.Stars, left = Math.Round(Math.Max(0, run.Def.Time - run.T), 1), done = run.Done, failed = run.Failed, saved = false });
                if (run.Done) l.Run = null;
            }
        }
        if (save is { } sv && store is not null)
            _ = Task.Run(async () =>
            {
                try { await store.RecordAsync(sv.Person, sv.Def, sv.Stars, sv.Value); } catch (Exception) { /* progress that cannot be written costs nothing here */ }
            });
    }

    /// <summary>A clean lap was recorded in a race or time trial: the lap challenges of that map are judged.</summary>
    public async Task LapAsync(Guid person, int map, double ms, CancellationToken ct = default)
    {
        if (store is null) return;
        foreach (var d in defs.Where(d => d.Type == "lap" && d.Map == map))
            if (d.StarsFor(ms) is > 0 and var stars) await store.RecordAsync(person, d, stars, ms, ct);
    }
}

internal static class ChallengeEndpoints
{
    public static void MapChallenges(this WebApplication app)
    {
        foreach (var prefix in new[] { "/api", Drift.GameAccounts.GameAccountEndpoints.Prefix })
            app.MapGet(prefix + "/challenges", async (HttpContext ctx, ChallengeStore store, CancellationToken ct) =>
                Results.Ok(new { progress = (await store.AllAsync(ctx.Owner(), ct)).Select(p => new { id = p.Id, stars = p.Stars, value = p.Value }) }));
    }
}
