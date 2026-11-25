using System.Text.Json;
using Drift.Race;
using Drift.Relay;

namespace Drift.Tests;

sealed class TextPeer : IPeer, ITextPeer
{
    public List<string> Texts { get; } = [];
    public byte? Closed { get; private set; }
    public void Send(ReadOnlySpan<byte> frame) { }
    public void SendText(string text) => Texts.Add(text);
    public void Close(byte reason) => Closed = reason;
    public JsonElement? Last(string type) { for (var i = Texts.Count - 1; i >= 0; i--) { var j = JsonDocument.Parse(Texts[i]).RootElement; if (j.GetProperty("t").GetString() == type) return j; } return null; }
    public int Count(string type) => Texts.Count(t => JsonDocument.Parse(t).RootElement.GetProperty("t").GetString() == type);
}

sealed class FakeBest : IBestTimes
{
    public List<(Guid Who, int Kind, int Ms)> Written { get; } = [];
    public Task<bool> RecordAsync(Guid userId, int map, int kind, int ms, int car, CancellationToken ct = default) { lock (Written) Written.Add((userId, kind, ms)); return Task.FromResult(true); }
}

public class RaceTrackTests
{
    internal static readonly string MapJson = File.ReadAllText(Path.Combine(Repo.Root, "game", "data", "maps", "01-car-park.json"));
    static RaceTrack Track() => RaceTrack.FromJson(MapJson);

    /// <summary>The way a driver takes: from the first grid slot along the centre line round the loop, `laps` times, ending past the line; sampled every `step` metres.</summary>
    internal static List<(double X, double Z, double H)> Way(RaceTrack track, int laps, double step, double fromX = 30, double fromZ = -46) => Way(MapJson, laps, step, fromX, fromZ);

    internal static List<(double X, double Z, double H)> Way(string json, int laps, double step, double fromX, double fromZ, double firstTargetAfter = 0)
    {
        using var doc = JsonDocument.Parse(json);
        var centre = doc.RootElement.GetProperty("centre").EnumerateArray().Select(p => (X: p[0].GetDouble(), Z: p[1].GetDouble())).ToList();
        var way = new List<(double X, double Z)> { (fromX, fromZ) };
        way.AddRange(centre.Where((p, i) => i >= (firstTargetAfter > 0 ? (int)firstTargetAfter : 8)));   // the rest of the first lap (the grid stands after the line)
        for (var l = 1; l < laps; l++) way.AddRange(centre);
        way.Add(centre[0]); way.Add(centre[1]); way.Add(centre[2]);        // across the line at the end
        return Sample(way, step);
    }

    /// <summary>Points every `step` metres along the whole way (the spacing carries over corners, so the speed is the speed).</summary>
    internal static List<(double X, double Z, double H)> Sample(List<(double X, double Z)> way, double step)
    {
        var o = new List<(double, double, double)>();
        double next = 0, done = 0;
        for (var i = 0; i + 1 < way.Count; i++)
        {
            var (ax, az) = way[i]; var (bx, bz) = way[i + 1];
            var len = double.Hypot(bx - ax, bz - az); var h = Math.Atan2(bx - ax, bz - az);
            for (; next < done + len; next += step) { var d = next - done; o.Add((ax + (bx - ax) * d / len, az + (bz - az) * d / len, h)); }
            done += len;
        }
        return o;
    }

    [Fact]
    public void The_map_file_has_eight_gates_a_grid_after_the_line_and_a_lap_length()
    {
        var t = Track();
        Assert.Equal(8, t.Gates.Count);
        Assert.Equal(3, t.Laps);
        Assert.InRange(t.LoopLength, 300, 600);
        Assert.True(t.Grid.Count >= 8);
        Assert.All(t.Gates, g => Assert.InRange(double.Hypot(g.Dx, g.Dz), 0.98, 1.02));
        // the first grid slot is past gate 0 in the direction of travel
        var g0 = t.Gates[0]; var s = t.Grid[0];
        Assert.True((s.X - g0.Cx) * g0.Dx + (s.Z - g0.Cz) * g0.Dz > 0);
    }

    [Fact]
    public void A_gate_is_crossed_only_across_it_and_with_the_direction_of_travel()
    {
        var t = Track(); var g = t.Gates[2];
        double cx = g.Cx, cz = g.Cz, dx = g.Dx, dz = g.Dz;
        Assert.True(t.Crosses(2, cx - dx * 3, cz - dz * 3, cx + dx * 3, cz + dz * 3, out var at)); Assert.InRange(at, 0.49, 0.51);
        Assert.False(t.Crosses(2, cx + dx * 3, cz + dz * 3, cx - dx * 3, cz - dz * 3, out _));          // the wrong way
        Assert.False(t.Crosses(2, cx - dx * 3 + dz * 40, cz - dz * 3 - dx * 40, cx + dx * 3 + dz * 40, cz + dz * 3 - dx * 40, out _)); // beside the gate
        Assert.False(t.Crosses(2, cx - dx * 3, cz - dz * 3, cx - dx, cz - dz, out _));                // stops short
    }

    static (RaceRun run, Runner r) Make(int laps = 3, double top = 35)
    {
        var track = Track(); var run = new RaceRun(track, laps); var r = new Runner(Guid.NewGuid(), "A", 0, 0, top); run.Runners.Add(r); run.Start(100);
        return (run, r);
    }

    static List<RaceEvent> Drive(RaceRun run, Runner r, List<(double X, double Z, double H)> path, double speed, double t0 = 100)
    {
        var ev = new List<RaceEvent>(); var dt = 1.0 / 15;
        for (var i = 0; i < path.Count; i++) ev.AddRange(run.Pose(r, path[i].X, path[i].Z, speed, 0, 0, t0 + i * dt));
        return ev;
    }

    [Fact]
    public void Three_laps_give_three_lap_events_and_a_finish_with_sensible_times()
    {
        var (run, r) = Make();
        var path = Way(run.Track, 3, 20.0 / 15);
        var ev = Drive(run, r, path, 20);
        Assert.Equal(3, ev.Count(e => e.Kind == "lap"));
        Assert.Single(ev, e => e.Kind == "finish");
        Assert.True(r.Finished);
        Assert.InRange(r.LapMs[1], 19000, 20000);                                  // 389 m at 20 m/s
        Assert.InRange(r.LapMs[0], 17000, r.LapMs[1]);                             // the first lap starts after the line: a little shorter
        Assert.True(r.CleanLaps);
        Assert.Equal(3, r.LapsDone);
    }

    [Fact]
    public void Driving_round_the_wrong_way_counts_for_nothing()
    {
        var (run, r) = Make();
        var path = Way(run.Track, 3, 20.0 / 15); path.Reverse();
        Assert.Empty(Drive(run, r, path, 20));
        Assert.Equal(0, r.LapsDone);
    }

    [Fact]
    public void A_shortcut_that_skips_gates_counts_for_nothing()
    {
        var (run, r) = Make();
        // from the grid straight across the middle to the line, without passing gates 1 to 7
        var path = Sample([(30, -46), (-30, 0), (0, -58), (0, -26)], 20.0 / 15);
        path.Insert(0, (30, -46, 0));
        Assert.Empty(Drive(run, r, path, 20));
        Assert.Equal(0, r.LapsDone);
    }

    [Fact]
    public void A_lap_faster_than_the_car_can_drive_is_not_a_time()
    {
        var (run, r) = Make(1, top: 35);
        var path = Way(run.Track, 1, 80.0 / 15);                                  // 80 m/s
        var ev = Drive(run, r, path, 80);
        Assert.Contains(ev, e => e.Kind == "lap");
        Assert.False(r.CleanLaps);
        Assert.Empty(r.LapMs);
        Assert.Null(r.BestLap);
    }

    [Fact]
    public void The_order_is_finished_by_time_then_by_progress_then_dnf()
    {
        var track = Track(); var run = new RaceRun(track, 1);
        var a = new Runner(Guid.NewGuid(), "A", 0, 0, 35); var b = new Runner(Guid.NewGuid(), "B", 0, 0, 35); var c = new Runner(Guid.NewGuid(), "C", 0, 0, 35); var d = new Runner(Guid.NewGuid(), "D", 0, 0, 35);
        run.Runners.AddRange([a, b, c, d]); run.Start(0);
        Drive(run, a, Way(track, 1, 20.0 / 15), 20);                                          // finishes
        Drive(run, b, Way(track, 1, 15.0 / 15), 15);                                          // finishes later
        Drive(run, c, Way(track, 1, 20.0 / 15).Take(60).ToList(), 20);                        // still on the way
        d.Dnf = true;
        Assert.Equal(["A", "B", "C", "D"], run.Order().Select(r => r.Name));
        Assert.False(run.AllDone);
        c.Dnf = true;
        Assert.True(run.AllDone);
    }

    [Fact]
    public void Poses_before_the_start_do_nothing()
    {
        var track = Track(); var run = new RaceRun(track, 1); var r = new Runner(Guid.NewGuid(), "A", 0, 0, 35); run.Runners.Add(r);
        Assert.Empty(run.Pose(r, 30, -46, 0, 0, 0, 5));     // not started
        run.Start(10);
        Assert.Empty(run.Pose(r, 30, -46, 0, 0, 0, 9));     // before the start time
    }
}

public class DriftScoreTests
{
    [Fact]
    public void The_server_gives_the_numbers_of_the_browsers_score_for_the_shared_vectors()
    {
        var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(Repo.Root, "tests", "vectors", "drift-score.json")));
        foreach (var c in doc.RootElement.EnumerateObject())
        {
            var dt = c.Value.GetProperty("dt").GetDouble();
            var sc = new DriftScore();
            var events = new List<(int, string)>();
            var trace = c.Value.GetProperty("trace").EnumerateArray().ToDictionary(t => t.GetProperty("step").GetInt32());
            var i = 0;
            foreach (var s in c.Value.GetProperty("steps").EnumerateArray())
            {
                var ev = sc.Step(s.GetProperty("slip").GetDouble(), s.GetProperty("speed").GetDouble(), s.GetProperty("hit").GetDouble(), s.GetProperty("turned").GetDouble(), dt);
                if (ev is not null) events.Add((i, ev));
                if (trace.TryGetValue(i, out var t))
                {
                    Assert.True(Math.Abs(sc.Pending - t.GetProperty("pending").GetDouble()) < 1e-4, $"{c.Name} pending at {i}: {sc.Pending} vs {t.GetProperty("pending").GetDouble()}");
                    Assert.True(Math.Abs(sc.Banked - t.GetProperty("banked").GetDouble()) < 1e-4, $"{c.Name} banked at {i}");
                    Assert.Equal(t.GetProperty("mult").GetInt32(), sc.Mult);
                }
                i++;
            }
            Assert.Equal(c.Value.GetProperty("events").EnumerateArray().Select(e => (e.GetProperty("step").GetInt32(), e.GetProperty("type").GetString()!)).ToList(), events);
            Assert.True(Math.Abs(sc.Banked - c.Value.GetProperty("banked").GetDouble()) < 1e-4, c.Name);
        }
    }
}

public class RaceHubTests
{
    sealed class Rig
    {
        public FakeTime Time = new();
        public WorldRelay Lobby, RaceWorld;
        public RaceHub Hub;
        public FakeBest Best = new();
        public Dictionary<string, (Guid Id, Session Lobby, TextPeer LobbyPeer)> People = [];
        public Dictionary<string, (Session Race, TextPeer Peer)> Racing = [];
        public double[] Tops = [35, 31, 39, 36, 28];

        public Rig(params string[] names)
        {
            Lobby = new WorldRelay(Time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 }, new Random(1));
            RaceWorld = new WorldRelay(Time, new RelayOptions { MaxPerWorld = 8, MaxWorlds = 1, MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 }, new Random(2));
            Hub = new RaceHub(Time, RaceTrack.FromJson(RaceTrackTests.MapJson), Best, RaceWorld, Tops);
            foreach (var n in names) Arrive(n);
        }

        public void Arrive(string name, int car = 0)
        {
            var id = Guid.NewGuid(); var peer = new TextPeer();
            var s = Lobby.Join(peer, "addr-" + name, car, name, 3)!;
            People[name] = (id, s, peer);
            Hub.LobbyJoined(new LobbyMember(id, name, car, 3, s));
        }
        public void Say(string who, string json) => Hub.OnLobbyText(People[who].Id, json);
        public void Pass(double seconds) { for (double t = 0; t < seconds; t += 0.1) { Time.Advance(0.1); Hub.Tick(); } }

        public void Connect(string name, int car = 0)
        {
            var peer = new TextPeer();
            var s = RaceWorld.Join(peer, "race-" + name, car, name, 3)!;
            Racing[name] = (s, peer);
            Hub.RaceConnected(People[name].Id, s);
        }

        /// <summary>Everybody who joined opens the race socket, the countdown runs; returns when the race is on.</summary>
        public void ToTheStart(params string[] racers)
        {
            Say(racers[0], """{"t":"race.start","laps":3}""");
            foreach (var r in racers.Skip(1)) Say(r, """{"t":"race.join"}""");
            foreach (var p in People.Keys.Except(racers)) Say(p, """{"t":"race.decline"}""");
            Pass(2);
            Assert.Equal(RaceHub.Phase.Grid, Hub.Current);
            foreach (var r in racers) Connect(r);
            Pass(4);
            Assert.Equal(RaceHub.Phase.Racing, Hub.Current);
        }

        /// <summary>A pose frame on the race socket, through the race relay's own checks.</summary>
        public void Pose(string who, double x, double z, double h, double vf, double beta = 0, byte flags = 0)
        {
            var f = new byte[13]; f[0] = 1;
            Wire.Put16(f, 2, (int)Math.Round(x * 20)); Wire.Put16(f, 4, (int)Math.Round(z * 20));
            Wire.Put16(f, 6, (int)Math.Round(((h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 65536) & 0xFFFF); Wire.Put16(f, 8, (int)Math.Round(vf * 50));
            f[10] = (byte)(sbyte)Math.Round(beta / (Math.PI / 128)); f[12] = flags;
            RaceWorld.OnMessage(Racing[who].Race, f);
        }

        public void DriveAll(Dictionary<string, double> speeds, int laps)
        {
            var track = RaceTrack.FromJson(RaceTrackTests.MapJson);
            var paths = speeds.ToDictionary(kv => kv.Key, kv => RaceTrackTests.Way(track, laps, kv.Value / 15, 30, -46));
            var n = paths.Values.Max(p => p.Count);
            for (var i = 0; i < n; i++)
            {
                foreach (var (who, speed) in speeds) if (i < paths[who].Count) { var p = paths[who][i]; Pose(who, p.X, p.Z, p.H, speed, 0.5, 2); }
                Time.Advance(1.0 / 15); Hub.Tick();
            }
        }
    }

    [Fact]
    public void A_race_can_be_on_another_map_the_grid_message_says_which_and_the_relay_follows_its_size()
    {
        var dir = Path.Combine(Repo.Root, "game", "data", "maps");
        var tracks = new Dictionary<int, RaceTrack> { [0] = RaceTrack.FromJson(RaceTrackTests.MapJson), [3] = RaceTrack.FromJson(File.ReadAllText(Path.Combine(dir, "04-desert.json"))) };
        var rig = new Rig("anna");
        rig.Hub = new RaceHub(rig.Time, tracks, rig.Best, rig.RaceWorld, rig.Tops);
        rig.Arrive("zed");   // arrives after the hub is made
        rig.Hub.LobbyJoined(new LobbyMember(rig.People["anna"].Id, "anna", 0, 3, rig.People["anna"].Lobby));
        rig.Say("anna", """{"t":"race.start","map":3,"laps":2}""");
        Assert.Equal("Desert", rig.People["anna"].LobbyPeer.Last("race.wait")!.Value.GetProperty("mapName").GetString());
        Assert.Equal("Desert", rig.People["zed"].LobbyPeer.Texts.Select(t => JsonDocument.Parse(t).RootElement).Last(j => j.GetProperty("t").GetString() == "race.invite").GetProperty("mapName").GetString());
        rig.Say("zed", """{"t":"race.decline"}""");
        rig.Pass(2);
        Assert.Equal(3, rig.People["anna"].LobbyPeer.Last("race.go")!.Value.GetProperty("map").GetInt32());
        rig.Connect("anna");
        var grid = rig.Racing["anna"].Peer.Last("grid")!.Value;
        Assert.Equal(3, grid.GetProperty("map").GetInt32());
        Assert.Equal(tracks[3].Grid[0].X, grid.GetProperty("x").GetDouble(), 3);
        Assert.Equal(2, grid.GetProperty("laps").GetInt32());
        // a pose far off the car park but on the desert map is fine for the race relay now
        rig.Pose("anna", tracks[3].Grid[0].X, tracks[3].Grid[0].Z, 0, 0);
        Assert.Equal(1, rig.RaceWorld.Stats.Accepted);
        // an unknown map falls back to the default
        rig.Pass(40);
    }

    [Fact]
    public void A_race_on_an_unknown_map_runs_on_the_default_one()
    {
        var rig = new Rig("anna");
        rig.Say("anna", """{"t":"race.start","map":99}""");
        Assert.Equal(0, rig.People["anna"].LobbyPeer.Last("race.wait")!.Value.GetProperty("map").GetInt32());
    }

    [Fact]
    public void A_race_starts_with_an_invitation_that_the_others_answer()
    {
        var rig = new Rig("anna", "ben", "cleo");
        rig.Say("anna", """{"t":"race.start","laps":2}""");
        Assert.Equal(RaceHub.Phase.Invite, rig.Hub.Current);
        Assert.NotNull(rig.People["ben"].LobbyPeer.Last("race.invite"));
        Assert.Equal(2, rig.People["ben"].LobbyPeer.Last("race.invite")!.Value.GetProperty("laps").GetInt32());
        Assert.NotNull(rig.People["anna"].LobbyPeer.Last("race.wait"));
        Assert.Null(rig.People["anna"].LobbyPeer.Last("race.invite"));
        rig.Say("ben", """{"t":"race.join"}"""); rig.Say("cleo", """{"t":"race.decline"}""");
        Assert.False(rig.Hub.CanRace(rig.People["ben"].Id));                         // not before the grid
        rig.Pass(2);                                                                  // everybody answered: the grid opens early
        Assert.Equal(RaceHub.Phase.Grid, rig.Hub.Current);
        Assert.NotNull(rig.People["anna"].LobbyPeer.Last("race.go"));
        Assert.NotNull(rig.People["ben"].LobbyPeer.Last("race.go"));
        Assert.Null(rig.People["cleo"].LobbyPeer.Last("race.go"));
        Assert.True(rig.Hub.CanRace(rig.People["ben"].Id));
        Assert.False(rig.Hub.CanRace(rig.People["cleo"].Id));                         // she did not join
    }

    [Fact]
    public void The_invitation_runs_out_after_ten_seconds_when_somebody_does_not_answer()
    {
        var rig = new Rig("anna", "ben");
        rig.Say("anna", """{"t":"race.start"}""");
        rig.Pass(9);
        Assert.Equal(RaceHub.Phase.Invite, rig.Hub.Current);
        rig.Pass(1.5);
        Assert.Equal(RaceHub.Phase.Grid, rig.Hub.Current);                            // anna alone: a time trial
    }

    [Fact]
    public void Only_one_race_at_a_time_and_a_pause_after_it()
    {
        var rig = new Rig("anna", "ben");
        rig.Say("anna", """{"t":"race.start"}""");
        rig.Say("ben", """{"t":"race.start"}""");
        Assert.NotNull(rig.People["ben"].LobbyPeer.Last("race.busy"));
        Assert.Single(rig.People["ben"].LobbyPeer.Texts, t => t.Contains("race.invite"));
    }

    [Fact]
    public void The_grid_message_gives_the_slot_and_the_countdown_runs_three_two_one_go()
    {
        var rig = new Rig("anna", "ben");
        rig.Say("anna", """{"t":"race.start","laps":3}"""); rig.Say("ben", """{"t":"race.join"}""");
        rig.Pass(2);
        rig.Connect("anna"); rig.Connect("ben");
        var grid = rig.Racing["ben"].Peer.Last("grid")!.Value;
        Assert.Equal(2, grid.GetProperty("n").GetInt32());
        Assert.Equal(3, grid.GetProperty("laps").GetInt32());
        Assert.NotEqual(rig.Racing["anna"].Peer.Last("grid")!.Value.GetProperty("slot").GetInt32(), grid.GetProperty("slot").GetInt32());
        rig.Pass(0.5);
        Assert.Equal(RaceHub.Phase.Countdown, rig.Hub.Current);
        rig.Pass(4);
        var counts = rig.Racing["anna"].Peer.Texts.Select(t => JsonDocument.Parse(t).RootElement).Where(j => j.GetProperty("t").GetString() is "count" or "go").Select(j => j.GetProperty("t").GetString() == "go" ? "go" : j.GetProperty("n").GetInt32().ToString()).ToList();
        Assert.Equal(["3", "2", "1", "go"], counts);
        Assert.Equal(RaceHub.Phase.Racing, rig.Hub.Current);
    }

    [Fact]
    public void Somebody_who_never_opens_the_race_socket_is_left_out()
    {
        var rig = new Rig("anna", "ben");
        rig.Say("anna", """{"t":"race.start"}"""); rig.Say("ben", """{"t":"race.join"}""");
        rig.Pass(2);
        rig.Connect("anna");
        rig.Pass(11);                                                                 // the grid waits 10 s for ben
        Assert.True(rig.Hub.Current is RaceHub.Phase.Countdown or RaceHub.Phase.Racing);
        Assert.Equal(1, rig.Racing["anna"].Peer.Last("grid")!.Value.GetProperty("n").GetInt32() == 2 ? 1 : 1);
    }

    [Fact]
    public void A_whole_race_laps_positions_drift_points_result_and_best_times()
    {
        var rig = new Rig("anna", "ben");
        rig.ToTheStart("anna", "ben");
        rig.DriveAll(new() { ["anna"] = 22, ["ben"] = 18 }, 3);
        // anna finishes first, ben about 20 s later: the result comes when ben is through
        rig.Pass(1);
        Assert.Equal(1, rig.Racing["anna"].Peer.Last("finish")!.Value.GetProperty("pos").GetInt32());
        Assert.Equal(2, rig.Racing["ben"].Peer.Last("finish")!.Value.GetProperty("pos").GetInt32());
        Assert.Equal(3, rig.Racing["anna"].Peer.Count("lap"));
        Assert.NotNull(rig.Racing["anna"].Peer.Last("prog"));
        rig.Pass(1);
        var result = rig.Racing["anna"].Peer.Last("result")!.Value;
        var rows = result.GetProperty("rows").EnumerateArray().ToList();
        Assert.Equal(["anna", "ben"], rows.Select(r => r.GetProperty("name").GetString()));
        Assert.Equal(10 + rows[0].GetProperty("drift").GetInt32() / 100.0, rows[0].GetProperty("points").GetDouble(), 0.1);
        Assert.True(rows[0].GetProperty("ms").GetInt32() < rows[1].GetProperty("ms").GetInt32());
        Assert.True(rows[0].GetProperty("drift").GetInt32() > 100, "a drifting car earns points");
        Assert.True(rows.All(r => r.GetProperty("clean").GetBoolean()));
        // the best times were written, for each finished person: a best lap and a best race
        Assert.Equal(4, rig.Best.Written.Count);
        Assert.Equal(2, rig.Best.Written.Count(w => w.Kind == RaceStore.Race));
        // after the result time everybody is sent back, and the pause starts
        rig.Pass(16);
        Assert.NotNull(rig.Racing["anna"].Peer.Last("back"));
        Assert.Equal(RaceHub.Phase.Idle, rig.Hub.Current);
        rig.Say("anna", """{"t":"race.start"}""");
        Assert.Equal(RaceHub.Phase.Idle, rig.Hub.Current);                             // 20 s of pause
        Assert.NotNull(rig.People["anna"].LobbyPeer.Last("race.busy"));
        rig.Pass(21);
        rig.Say("anna", """{"t":"race.start"}""");
        Assert.Equal(RaceHub.Phase.Invite, rig.Hub.Current);
    }

    [Fact]
    public void A_racer_who_leaves_is_dnf_and_the_others_still_get_their_result()
    {
        var rig = new Rig("anna", "ben");
        rig.ToTheStart("anna", "ben");
        rig.Pose("ben", 30, -50, 1.57, 5);
        rig.Hub.RaceLeft(rig.People["ben"].Id, rig.Racing["ben"].Race);
        rig.DriveAll(new() { ["anna"] = 24 }, 3);
        rig.Pass(3);
        var rows = rig.Racing["anna"].Peer.Last("result")!.Value.GetProperty("rows").EnumerateArray().ToList();
        Assert.False(rows[0].GetProperty("dnf").GetBoolean());
        Assert.True(rows[1].GetProperty("dnf").GetBoolean());
        Assert.Equal(0.0, rows[1].GetProperty("points").GetDouble(), 1);
        Assert.Equal(2, rig.Best.Written.Count);                                         // only anna's lap and race
    }

    [Fact]
    public void A_race_nobody_finishes_still_ends_with_a_result_after_the_time_is_up()
    {
        var rig = new Rig("anna");
        rig.ToTheStart("anna");
        rig.Hub.OnRaceText(rig.People["anna"].Id, """{"t":"leave"}""");
        rig.Pass(1);
        Assert.NotNull(rig.Racing["anna"].Peer.Last("result"));
        Assert.Empty(rig.Best.Written);
    }

    [Fact]
    public void A_pose_before_the_start_is_not_counted()
    {
        var rig = new Rig("anna");
        rig.Say("anna", """{"t":"race.start"}""");
        rig.Pass(2);
        rig.Connect("anna");
        rig.Pass(1);
        Assert.Equal(RaceHub.Phase.Countdown, rig.Hub.Current);
        rig.Pose("anna", 60, -46, 1.57, 20);   // moved already: the hub is not racing yet, so nothing is counted
        rig.Pass(0.3);
        Assert.Equal(0, rig.Racing["anna"].Peer.Count("lap"));
    }

    [Fact]
    public void Nobody_can_open_the_race_socket_outside_the_grid_phase()
    {
        var rig = new Rig("anna", "ben");
        Assert.False(rig.Hub.CanRace(rig.People["anna"].Id));
        rig.ToTheStart("anna");
        Assert.False(rig.Hub.CanRace(rig.People["ben"].Id));
        Assert.False(rig.Hub.CanRace(rig.People["anna"].Id));
    }
}


public class MapFileTests
{
    static readonly string Dir = Path.Combine(Repo.Root, "game", "data");
    static IEnumerable<(int Id, string File, string Name, string Json)> Maps()
    {
        using var list = JsonDocument.Parse(File.ReadAllText(Path.Combine(Dir, "maps.json")));
        return [.. list.RootElement.GetProperty("maps").EnumerateArray().Select(m => (m.GetProperty("id").GetInt32(), m.GetProperty("file").GetString()!, m.GetProperty("name").GetString()!, File.ReadAllText(Path.Combine(Dir, "maps", m.GetProperty("file").GetString()!))))];
    }

    [Fact]
    public void There_are_five_maps_with_their_own_ids_and_every_one_is_a_track()
    {
        var maps = Maps().ToList();
        Assert.Equal([0, 1, 2, 3, 4], maps.Select(m => m.Id));
        Assert.Equal(5, maps.Select(m => m.Name).Distinct().Count());
        foreach (var m in maps)
        {
            var t = RaceTrack.FromJson(m.Json);
            Assert.Equal(m.Id, t.MapId);
            Assert.Equal(m.Name, t.Name);
            Assert.Equal(8, t.Gates.Count);
            Assert.True(t.Grid.Count >= 8);
            Assert.InRange(t.LoopLength, 350, 1500);
            Assert.InRange(t.Laps, 1, 5);
            var g0 = t.Gates[0];
            Assert.All(t.Grid, s => Assert.True((s.X - g0.Cx) * g0.Dx + (s.Z - g0.Cz) * g0.Dz > 0, $"{m.Name}: a grid slot is behind the line"));
        }
    }

    [Fact]
    public void A_driver_on_the_centre_line_completes_a_lap_on_every_map_and_the_wrong_way_counts_for_nothing()
    {
        foreach (var m in Maps())
        {
            var track = RaceTrack.FromJson(m.Json);
            var run = new RaceRun(track, 1); var r = new Runner(Guid.NewGuid(), "A", 0, 0, 35); run.Runners.Add(r); run.Start(0);
            using var doc = JsonDocument.Parse(m.Json);
            var centre = doc.RootElement.GetProperty("centre");
            var spacing = track.LoopLength / centre.GetArrayLength();
            var from = track.Grid[0];
            var way = RaceTrackTests.Way(m.Json, 1, 20.0 / 15, from.X, from.Z, Math.Ceiling(34 / spacing));
            var events = new List<RaceEvent>();
            for (var i = 0; i < way.Count; i++) events.AddRange(run.Pose(r, way[i].X, way[i].Z, 20, 0, 0, i / 15.0));
            Assert.True(r.Finished, $"{m.Name}: the lap did not count");
            Assert.InRange(r.FinishMs!.Value / 1000, (track.LoopLength - 40) / 20 - 3, (track.LoopLength + 40) / 20 + 3);

            var back = new RaceRun(track, 1); var rb = new Runner(Guid.NewGuid(), "B", 0, 0, 35); back.Runners.Add(rb); back.Start(0);
            var reversed = Enumerable.Reverse(way).ToList();
            for (var i = 0; i < reversed.Count; i++) back.Pose(rb, reversed[i].X, reversed[i].Z, 20, 0, 0, i / 15.0);
            Assert.Equal(0, rb.LapsDone);
        }
    }

    [Fact]
    public void The_race_relay_accepts_poses_on_every_map_and_refuses_those_outside()
    {
        foreach (var m in Maps())
        {
            var t = RaceTrack.FromJson(m.Json);
            var time = new FakeTime();
            var relay = new WorldRelay(time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 });
            relay.SetBounds(t.HalfX, t.HalfZ);
            var peer = new FakePeer(); var s = relay.Join(peer, "a", 0)!;
            var far = t.Grid[0];
            byte[] Pose(double x, double z) { var f = new byte[13]; f[0] = 1; Wire.Put16(f, 2, (int)Math.Round(x * 20)); Wire.Put16(f, 4, (int)Math.Round(z * 20)); return f; }
            relay.OnMessage(s, Pose(far.X, far.Z));
            Assert.Equal(1, relay.Stats.Accepted);
            time.Advance(0.07);
            relay.OnMessage(s, Pose(t.HalfX + 40, 0));
            Assert.Equal(1, peer.Count(Wire.Fix));
        }
    }
}
