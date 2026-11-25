using Drift.Relay;

namespace Drift.Tests;

/// <summary>Interest areas of the relay (docs/PLAN-0.2.md step 3a): near cars in full every tick, far cars in short a few times a second, nothing at all changes with the option off.</summary>
public class RelayInterestTests
{
    static int seq;
    static byte[] Pose(double x, double z, double h = 0, double vf = 0)
    {
        var f = new byte[Wire.PoseLength];
        f[0] = Wire.Pose; f[1] = (byte)(++seq);
        Wire.Put16(f, 2, (int)Math.Round(x * 20)); Wire.Put16(f, 4, (int)Math.Round(z * 20));
        Wire.Put16(f, 6, (int)Math.Round(h / (2 * Math.PI) * 65536) & 0xFFFF); Wire.Put16(f, 8, (int)Math.Round(vf * 50));
        return f;
    }

    static RelayOptions Opt(double radius = 60, int farEvery = 4, int perWorld = 64, double halfX = 300, double halfZ = 300) =>
        new() { MaxPerWorld = perWorld, MaxPerAddress = 1000, JoinsPerMinutePerAddress = 100000, FramesPerSecondPerAddress = 100000, InterestRadius = radius, FarEvery = farEvery, HalfX = halfX, HalfZ = halfZ };

    static (WorldRelay r, FakeTime t) Make(RelayOptions o) { var t = new FakeTime(); return (new WorldRelay(t, o, new Random(1)), t); }
    static (Session s, FakePeer p) Join(WorldRelay r, int i) { var p = new FakePeer(); return (r.Join(p, "a" + i, 0)!, p); }

    static List<byte> Ids(byte[]? frame, int entry) => frame is null ? [] : Enumerable.Range(0, frame[1]).Select(i => frame[4 + i * entry]).ToList();

    [Fact]
    public void A_near_car_comes_in_full_every_tick_and_a_far_one_in_short_every_fourth()
    {
        var (r, t) = Make(Opt());
        var (a, pa) = Join(r, 0); var (b, _) = Join(r, 1); var (c, _) = Join(r, 2);
        r.OnMessage(a, Pose(0, 0)); r.OnMessage(b, Pose(30, 0)); r.OnMessage(c, Pose(200, 0, h: 1.0));
        var nearFrames = 0; var farFrames = 0; byte[]? lastFar = null;
        for (var i = 0; i < 8; i++)
        {
            pa.Frames.Clear(); t.Advance(1.0 / 15); r.Tick();
            var near = pa.Last(Wire.Snapshot); var far = pa.Last(Wire.SnapshotFar);
            Assert.Equal([b.Id], Ids(near, Wire.EntryLength)); nearFrames++;
            if (far is not null) { farFrames++; lastFar = far; Assert.Equal([c.Id], Ids(far, Wire.FarEntryLength)); Assert.Equal(4 + Wire.FarEntryLength, far.Length); }
        }
        Assert.Equal(8, nearFrames); Assert.Equal(2, farFrames);   // every fourth tick
        // the short entry carries x, z and heading as the pose frame has them
        Assert.Equal(200 * 20, Wire.I16(lastFar!, 5)); Assert.Equal(0, Wire.I16(lastFar!, 7));
        Assert.Equal((int)Math.Round(1.0 / (2 * Math.PI) * 65536), Wire.U16(lastFar!, 9));
    }

    [Fact]
    public void The_border_has_a_hysteresis_so_nothing_flickers()
    {
        var (r, t) = Make(Opt(radius: 60, farEvery: 1));
        var (a, pa) = Join(r, 0); var (b, _) = Join(r, 1);
        r.OnMessage(a, Pose(0, 0));
        bool IsNear(double x)
        {
            t.Advance(0.2); r.OnMessage(b, Pose(x, 0, vf: 0)); pa.Frames.Clear(); r.Tick();
            return pa.Last(Wire.Snapshot) is { } f && Ids(f, Wire.EntryLength).Contains(b.Id);
        }
        // the budget of the relay lets a car move only so far per pose: walk it out in steps of 5 m
        double x = 30;
        r.OnMessage(b, Pose(x, 0));
        Assert.True(IsNear(x));
        for (x = 35; x <= 65; x += 5) Assert.True(IsNear(x), $"still near at {x}");     // past 60 m but inside 60 + 10
        for (x = 75; x <= 90; x += 5) Assert.False(IsNear(x), $"far at {x}");           // beyond 70 m: far
        for (x = 85; x >= 65; x -= 5) Assert.False(IsNear(x), $"still far at {x}");     // coming back: far until inside 60 m
        for (x = 60; x >= 55; x -= 5) Assert.True(IsNear(x), $"near again at {x}");
    }

    [Fact]
    public void Everybody_sees_everybody_inside_the_radius_and_the_far_ones_arrive_within_one_cycle()
    {
        var (r, t) = Make(Opt(radius: 50, farEvery: 4));
        var rnd = new Random(5);
        var people = Enumerable.Range(0, 20).Select(i => Join(r, i)).ToList();
        var pos = people.Select(_ => (x: rnd.NextDouble() * 400 - 200, z: rnd.NextDouble() * 400 - 200)).ToList();
        for (var i = 0; i < people.Count; i++) r.OnMessage(people[i].s, Pose(pos[i].x, pos[i].z));
        foreach (var (_, p) in people) p.Frames.Clear();
        for (var i = 0; i < 4; i++) { t.Advance(1.0 / 15); r.Tick(); }
        for (var i = 0; i < people.Count; i++)
        {
            var seen = new HashSet<byte>();
            foreach (var f in people[i].p.Frames.Where(f => f[0] == Wire.Snapshot)) foreach (var id in Ids(f, Wire.EntryLength)) seen.Add(id);
            foreach (var f in people[i].p.Frames.Where(f => f[0] == Wire.SnapshotFar)) foreach (var id in Ids(f, Wire.FarEntryLength)) seen.Add(id);
            var expected = people.Where((q, j) => j != i).Select(q => q.s.Id).ToHashSet();
            Assert.Equal(expected, seen);   // every other car arrives, near ones in full, the rest in short, within four ticks
            var nearBy = people.Where((q, j) => j != i && double.Hypot(pos[j].x - pos[i].x, pos[j].z - pos[i].z) <= 50).Select(q => q.s.Id).ToHashSet();
            var inFull = people[i].p.Frames.Where(f => f[0] == Wire.Snapshot).SelectMany(f => Ids(f, Wire.EntryLength)).ToHashSet();
            Assert.Equal(nearBy, inFull);   // exactly those inside the radius come in full
        }
    }

    [Fact]
    public void With_the_option_off_everybody_gets_every_car_every_tick_and_no_far_frame_exists()
    {
        var (r, t) = Make(Opt(radius: 0));
        var (a, pa) = Join(r, 0); var (b, _) = Join(r, 1);
        r.OnMessage(a, Pose(-250, 0)); r.OnMessage(b, Pose(250, 0));
        for (var i = 0; i < 6; i++) { pa.Frames.Clear(); t.Advance(1.0 / 15); r.Tick(); Assert.Equal([b.Id], Ids(pa.Last(Wire.Snapshot), Wire.EntryLength)); Assert.Null(pa.Last(Wire.SnapshotFar)); }
    }

    [Fact]
    public void A_world_of_a_hundred_does_not_overflow_the_frame_buffer()
    {
        var (r, t) = Make(Opt(radius: 0, perWorld: 120));
        var people = Enumerable.Range(0, 100).Select(i => Join(r, i)).ToList();
        for (var i = 0; i < people.Count; i++) r.OnMessage(people[i].s, Pose(i * 2 - 100, 0));
        t.Advance(0.1); r.Tick();
        Assert.Equal(99, people[0].p.Last(Wire.Snapshot)![1]);
    }

    /// <summary>64 drivers on circles over a 400 by 300 m world for 20 simulated seconds; the numbers go to a file for STATE.md.</summary>
    [Fact]
    public void Sixty_four_drivers_cost_far_less_with_interest_areas_than_without()
    {
        (long bytes, double tickUs, double p95Us, double maxUs, double near, double far, int accepted, int rejected) Run(int n, double radius)
        {
            var (r, t) = Make(Opt(radius, perWorld: 128, halfX: 200, halfZ: 150));
            var rnd = new Random(11);
            var people = Enumerable.Range(0, n).Select(i => Join(r, i)).ToList();
            var drivers = people.Select(_ => { var R = 15 + rnd.NextDouble() * 35; return (R, cx: (rnd.NextDouble() * 2 - 1) * (190 - R), cz: (rnd.NextDouble() * 2 - 1) * (140 - R), a0: rnd.NextDouble() * 6.28, v: 12 + rnd.NextDouble() * 12); }).ToList();
            var times = new List<double>();
            for (var step = 0; step < 300; step++)   // 20 s at 15 Hz
            {
                t.Advance(1.0 / 15);
                for (var i = 0; i < n; i++)
                {
                    var d = drivers[i]; var a = d.a0 + step / 15.0 * d.v / d.R;
                    r.OnMessage(people[i].s, Pose(d.cx + d.R * Math.Cos(a), d.cz + d.R * Math.Sin(a), Math.Atan2(-Math.Sin(a), Math.Cos(a)), d.v));
                }
                var sw = System.Diagnostics.Stopwatch.StartNew(); r.Tick(); if (step >= 30) times.Add(sw.Elapsed.TotalMicroseconds);   // the first 2 s are warm-up (JIT)
            }
            times.Sort();
            var st = r.Stats;
            return (st.BytesOut, times.Average(), times[(int)(times.Count * 0.95)], times[^1], st.NearEntries / (double)(n * 300), st.FarEntries / (double)(n * 300), (int)st.Accepted, (int)st.Rejected);
        }
        var lines = new List<string> { "drivers, interest radius m | bytes out per driver per second | tick avg us | tick p95 us | tick max us | near entries per snapshot | far entries per tick | rejected poses" };
        var results = new Dictionary<(int, double), (long bytes, double tickUs, double p95Us, double maxUs, double near, double far, int accepted, int rejected)>();
        foreach (var (n, radius) in new[] { (8, 0.0), (8, 60.0), (32, 0.0), (32, 60.0), (64, 0.0), (64, 60.0), (64, 40.0) })
        {
            var x = Run(n, radius); results[(n, radius)] = x;
            lines.Add($"{n}, {radius} | {x.bytes / (double)n / 20:0} | {x.tickUs:0} | {x.p95Us:0} | {x.maxUs:0} | {x.near:0.0} | {x.far:0.0} | {x.rejected}");
            Assert.Equal(0, x.rejected);   // the synthetic drivers drive legally: the relay's checks accept all of it
        }
        File.WriteAllLines(Path.Combine(Path.GetTempPath(), "relay-load-numbers.txt"), lines);
        var off = results[(64, 0.0)]; var on = results[(64, 60.0)];
        Assert.True(on.bytes < off.bytes * 0.6, $"{on.bytes} vs {off.bytes}");
        Assert.True(on.p95Us < 25000, $"tick p95 {on.p95Us} us for 64 drivers");   // one tick is 66 ms; the other test classes run at the same time, so the bound is loose (quiet machine: under 1 ms)
        // with 32 drivers the new relay is no worse than the old one (a few far entries cost almost nothing)
        Assert.True(results[(32, 60.0)].bytes <= results[(32, 0.0)].bytes);
    }
}
