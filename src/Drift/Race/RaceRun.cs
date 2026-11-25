namespace Drift.Race;

public sealed class Runner(Guid person, string name, int car, int hue, double top)
{
    public Guid Person { get; } = person;
    public string Name { get; } = name;
    public int Car { get; } = car;
    public int Hue { get; } = hue;
    public double Top { get; } = top;
    public int Slot { get; set; }
    /// <summary>The gate to cross next; the grid stands after gate 0, so the first one is gate 1.</summary>
    public int NextGate { get; internal set; } = 1;
    public int LapsDone { get; internal set; }
    public int GatesPassed { get; internal set; }
    public List<double> LapMs { get; } = [];
    public bool CleanLaps { get; internal set; } = true;
    public double? FinishMs { get; internal set; }
    public bool Dnf { get; set; }
    public double Progress { get; internal set; }
    public DriftScore Drift { get; } = new();
    internal double LapStart;
    internal bool HasLast;
    internal double LastX, LastZ, LastT;
    public bool Finished => FinishMs is not null;
    /// <summary>The best lap that passed the plausibility check, or null.</summary>
    public double? BestLap => LapMs.Count == 0 ? null : LapMs.Min();
}

public readonly record struct RaceEvent(Runner Runner, string Kind, int Lap, double Ms);

/// <summary>
/// One race on a track, as pure logic: the server feeds in the poses of every runner with the relay's own clock and gets back laps and finishes.
/// Gates must be crossed in order and in the direction of travel (cutting out a gate or turning round counts for nothing); the crossing time is
/// interpolated between two poses (about 10 ms of resolution although poses come every 66 ms); a lap faster than the car could drive is not counted
/// as a time (no best time, and the runner's results are marked unclean).
/// </summary>
public sealed class RaceRun(RaceTrack track, int laps)
{
    public RaceTrack Track { get; } = track;
    public int Laps { get; } = laps;
    public List<Runner> Runners { get; } = [];
    public double? Started { get; private set; }
    public double? FirstFinish { get; private set; }
    private int _finishCount;

    public void Start(double now)
    {
        Started = now;
        foreach (var r in Runners) { r.LapStart = 0; r.HasLast = false; }
    }

    /// <summary>The fastest a car can drive one lap, ms (top speed plus the same slack the relay gives).</summary>
    public double MinLapMs(Runner r) => Track.LoopLength / (1.15 * r.Top) * 1000;

    public List<RaceEvent> Pose(Runner r, double x, double z, double vf, double beta, byte flags, double now)
    {
        var events = new List<RaceEvent>();
        if (Started is not { } t0 || now < t0 || r.Finished || r.Dnf) return events;
        double t = now - t0;
        if (r.HasLast)
        {
            double dt = Math.Min(0.25, t - r.LastT);
            if (dt > 0)
            {
                var speed = Math.Abs(vf) / Math.Max(0.3, Math.Cos(beta));
                r.Drift.Step(beta, speed, (flags & 4) != 0 ? 5 : 0, Math.Abs(beta), dt);
            }
            if (Track.Crosses(r.NextGate, r.LastX, r.LastZ, x, z, out var at))
            {
                var ms = (r.LastT + at * (t - r.LastT)) * 1000;
                Passed(r, ms, events);
            }
        }
        r.LastX = x; r.LastZ = z; r.LastT = t; r.HasLast = true;
        Progress(r, x, z);
        return events;
    }

    void Passed(Runner r, double ms, List<RaceEvent> events)
    {
        var gate = r.NextGate;
        r.GatesPassed++;
        r.NextGate = (gate + 1) % Track.Gates.Count;
        if (gate != 0) return;
        // gate 0 again: a lap is done
        var lapMs = ms - r.LapStart * 1000;
        r.LapStart = ms / 1000;
        r.LapsDone++;
        if (lapMs < MinLapMs(r)) r.CleanLaps = false; else r.LapMs.Add(lapMs);
        events.Add(new RaceEvent(r, "lap", r.LapsDone, lapMs));
        if (r.LapsDone >= Laps)
        {
            r.FinishMs = ms;
            FirstFinish ??= Started + ms / 1000;
            _finishCount++;
            events.Add(new RaceEvent(r, "finish", r.LapsDone, ms));
        }
    }

    /// <summary>How far along the race a runner is: gates passed plus the share of the way to the next gate.</summary>
    void Progress(Runner r, double x, double z)
    {
        var g = Track.Gates[r.NextGate];
        var leg = Track.Legs[(r.NextGate + Track.Gates.Count - 1) % Track.Gates.Count];
        var share = leg > 0 ? Math.Clamp(1 - double.Hypot(x - g.Cx, z - g.Cz) / leg, 0, 0.99) : 0;
        r.Progress = r.GatesPassed + share;
    }

    /// <summary>The order now: finished runners by their time, then the others by how far they are.</summary>
    public List<Runner> Order() => [.. Runners.Where(r => !r.Dnf).OrderBy(r => r.Finished ? 0 : 1).ThenBy(r => r.FinishMs ?? double.MaxValue).ThenByDescending(r => r.Progress), .. Runners.Where(r => r.Dnf).OrderByDescending(r => r.Progress)];

    public bool AllDone => Runners.All(r => r.Finished || r.Dnf);
}
