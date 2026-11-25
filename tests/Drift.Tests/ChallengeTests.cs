using System.Text.Json;
using Drift.Race;
using Drift.Relay;

namespace Drift.Tests;

public class ChallengeTests
{
    static List<ChallengeDef> Defs => ChallengeDef.Load(File.ReadAllText(Path.Combine(Repo.Root, "game", "data", "challenges.json")));

    [Fact]
    public void The_server_judges_every_challenge_run_like_the_browser_for_the_shared_vectors()
    {
        var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(Repo.Root, "tests", "vectors", "challenge.json")));
        var defs = Defs.ToDictionary(d => d.Id);
        foreach (var c in doc.RootElement.EnumerateObject())
        {
            var run = new ChallengeRun(defs[c.Value.GetProperty("id").GetString()!]);
            var dt = c.Value.GetProperty("dt").GetDouble();
            foreach (var s in c.Value.GetProperty("steps").EnumerateArray())
                run.Step(s.GetProperty("slip").GetDouble(), s.GetProperty("speed").GetDouble(), s.GetProperty("hit").GetDouble(), s.GetProperty("turned").GetDouble(), s.GetProperty("tandem").GetDouble(), dt);
            Assert.True(Math.Abs(run.Value - c.Value.GetProperty("value").GetDouble()) < 0.05, $"{c.Name}: value {run.Value} vs {c.Value.GetProperty("value").GetDouble()}");
            Assert.Equal(c.Value.GetProperty("stars").GetInt32(), run.Stars);
            Assert.Equal(c.Value.GetProperty("done").GetBoolean(), run.Done);
            Assert.Equal(c.Value.GetProperty("failed").GetBoolean(), run.Failed);
        }
    }

    [Fact]
    public void The_definitions_load_and_a_lap_is_judged_downwards()
    {
        var defs = Defs;
        Assert.Equal(8, defs.Count);
        var lap = defs.Single(d => d.Id == "lap-sprint");
        Assert.True(lap.LowerIsBetter);
        Assert.Equal([0, 0, 1, 2, 3], new[] { 0.0, 100000, 85000, 70000, 59000 }.Select(lap.StarsFor));
    }
}

public class ChallengeTrackerTests
{
    static int seq;
    static byte[] Pose(double x, double z, double vf, double beta, byte flags = 0)
    {
        var f = new byte[Wire.PoseLength];
        f[0] = Wire.Pose; f[1] = (byte)(++seq);
        Wire.Put16(f, 2, (int)Math.Round(x * 20)); Wire.Put16(f, 4, (int)Math.Round(z * 20)); Wire.Put16(f, 6, 0); Wire.Put16(f, 8, (int)Math.Round(vf * 50));
        f[10] = (byte)(sbyte)Math.Round(beta / (Math.PI / 128)); f[12] = flags;
        return f;
    }

    sealed class Rig
    {
        public FakeTime Time = new(); public WorldRelay Relay; public ChallengeTracker Tracker; public List<(Guid, string, int, double)> Saved = [];
        public Rig(ChallengeStore? store = null)
        {
            Relay = new WorldRelay(Time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 999, FramesPerSecondPerAddress = 99999, HalfX = 9000, HalfZ = 9000 }, new Random(1));
            Tracker = new ChallengeTracker(Defs, store); Tracker.Follow(Relay);
        }
        static List<ChallengeDef> Defs => ChallengeDef.Load(File.ReadAllText(Path.Combine(Repo.Root, "game", "data", "challenges.json")));
        public (Session S, TextPeer P, Guid Id) Add(string n, bool guest = false) { var p = new TextPeer(); var s = Relay.Join(p, "addr" + n, 0)!; var id = Guid.NewGuid(); Tracker.Join(s, id, guest); return (s, p, id); }
        public void Drive(Session s, double seconds, double beta, double vf = 22, double z0 = 0, byte flags = 0)
        {
            for (var i = 0; i < (int)(seconds * 15); i++) { Time.Advance(1.0 / 15); Relay.OnMessage(s, Pose(0, z0 + (i + 1) * vf / 15.0, vf, beta, flags)); }
        }
    }

    [Fact]
    public void A_started_challenge_is_judged_from_the_poses_and_the_car_is_told_how_it_stands()
    {
        var r = new Rig(); var a = r.Add("a");
        r.Tracker.OnText(a.S, """{"t":"challenge.start","id":"hold-it"}""");
        Assert.Equal("hold-it", a.P.Last("challenge")!.Value.GetProperty("id").GetString());
        r.Drive(a.S, 9, 0.5);
        var m = a.P.Last("challenge")!.Value;
        Assert.InRange(m.GetProperty("value").GetDouble(), 6.5, 9.1);      // seconds of one slide
        Assert.True(m.GetProperty("stars").GetInt32() >= 1);
        Assert.False(m.GetProperty("done").GetBoolean());
        Assert.True(a.P.Count("challenge") <= 9 * 2 + 2, "twice a second at most");
        r.Drive(a.S, 60, 0.5, z0: 9 * 22);
        Assert.True(a.P.Last("challenge")!.Value.GetProperty("done").GetBoolean());
        Assert.Null(r.Tracker.RunOf(a.S));                                  // a finished run is gone
    }

    [Fact]
    public void A_lap_challenge_cannot_be_started_here_an_unknown_id_is_ignored_and_stop_ends_a_run()
    {
        var r = new Rig(); var a = r.Add("a");
        r.Tracker.OnText(a.S, """{"t":"challenge.start","id":"lap-sprint"}""");
        r.Tracker.OnText(a.S, """{"t":"challenge.start","id":"nope"}""");
        r.Tracker.OnText(a.S, "not json");
        r.Tracker.OnText(a.S, """{"t":"challenge.start"}""");
        Assert.Null(r.Tracker.RunOf(a.S)); Assert.Equal(0, a.P.Count("challenge"));
        r.Tracker.OnText(a.S, """{"t":"challenge.start","id":"first-slide"}""");
        Assert.NotNull(r.Tracker.RunOf(a.S));
        r.Tracker.OnText(a.S, """{"t":"challenge.stop"}""");
        Assert.Null(r.Tracker.RunOf(a.S));
    }

    [Fact]
    public void The_clean_sheet_ends_with_the_wall_hit_a_flag_in_the_pose()
    {
        var r = new Rig(); var a = r.Add("a");
        r.Tracker.OnText(a.S, """{"t":"challenge.start","id":"clean-sheet"}""");
        r.Drive(a.S, 3, 0.5);
        r.Drive(a.S, 0.5, 0.5, z0: 3 * 22, flags: 4);                       // the hit flag: the car touched something
        var m = a.P.Last("challenge")!.Value;
        Assert.True(m.GetProperty("done").GetBoolean() && m.GetProperty("failed").GetBoolean());
    }
}

public class ChallengeStoreTests
{
    [Fact]
    public async Task Progress_is_kept_per_owner_only_improves_goes_with_the_account_and_a_lap_is_judged_by_the_race()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http(); var cookie = await app.SignedInAsync(c);
        var store = (ChallengeStore)app.Services.GetService(typeof(ChallengeStore))!;
        var tracker = (ChallengeTracker)app.Services.GetService(typeof(ChallengeTracker))!;
        var me = Guid.Parse((await db.Data.CreateCommand("select id::text from users limit 1").ExecuteScalarAsync())!.ToString()!);
        var slide = tracker.Find("first-slide")!; var lap = tracker.Find("lap-sprint")!;
        Assert.True(await store.RecordAsync(me, slide, 1, 900));
        Assert.False(await store.RecordAsync(me, slide, 1, 850));            // the same stars, a worse value
        Assert.True(await store.RecordAsync(me, slide, 1, 950));             // the same stars, a better one
        Assert.False(await store.RecordAsync(me, slide, 0, 5000));           // fewer stars never replace
        Assert.True(await store.RecordAsync(me, slide, 2, 1900));
        await tracker.LapAsync(me, 0, 80000);                                 // a clean lap of 80 s: one star
        await tracker.LapAsync(me, 0, 75000);                                 // better: still one star but a better time
        await tracker.LapAsync(me, 0, 90000);                                 // too slow for a star
        await tracker.LapAsync(me, 7, 1000);                                  // a map without a challenge
        var list = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/challenges", cookie)));
        var p = list.GetProperty("progress").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetString()!);
        Assert.Equal(2, p["first-slide"].GetProperty("stars").GetInt32());
        Assert.Equal(1, p["lap-sprint"].GetProperty("stars").GetInt32());
        Assert.Equal(75000, p["lap-sprint"].GetProperty("value").GetDouble());
        Assert.Equal(2, p.Count);
        // deleting a games account deletes its progress (the sweep removes the rows of people who are gone)
        await db.Data.CreateCommand($"insert into drift_challenge (user_id, challenge_id, stars, value) values ('{Guid.NewGuid()}', 'x', 1, 1)").ExecuteNonQueryAsync();
        await ((Drift.Owners)app.Services.GetService(typeof(Drift.Owners))!).SweepAsync();
        Assert.Equal(2L, (long)(await db.Data.CreateCommand("select count(*) from drift_challenge").ExecuteScalarAsync())!);
        _ = lap;
    }
}
