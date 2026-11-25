using System.Net;
using Drift.Garage;
using Drift.Race;
using Drift.Relay;

namespace Drift.Tests;

public class TuningTests
{
    [Fact]
    public void The_budget_the_range_and_the_top_speed_factor()
    {
        Assert.True(new Tuning(3, 3, 3, 1).Valid && new Tuning(3, 3, 3, 1).Cost == 10);
        Assert.False(new Tuning(3, 3, 3, 2).Valid);                       // eleven points
        Assert.False(new Tuning(4, 0, 0, 0).Valid);
        Assert.False(Tuning.None.Tuned); Assert.True(new Tuning(0, 0, -1, 0).Tuned);
        Assert.Equal(1.0, Tuning.None.TopFactor);
        Assert.Equal(1 - 0.036, new Tuning(3, 0, 0, 0).TopFactor, 9);     // the same numbers as game/sim/tuning.js
        Assert.Equal(1 + 0.036, new Tuning(-3, 0, 0, 0).TopFactor, 9);
    }

    [Fact]
    public async Task Tuning_is_saved_per_car_and_refused_over_budget_out_of_range_or_for_an_unknown_car()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/tuning")).StatusCode);
        var cookie = await app.SignedInAsync(c);
        var first = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/tuning", cookie)));
        Assert.Equal(5, first.GetProperty("cars").GetArrayLength());
        Assert.Equal(0, first.GetProperty("cars")[2].GetProperty("steer").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/tuning/2", cookie, new { steer = 3, balance = -2, power = 1, handbrake = 0 }))).StatusCode);
        var again = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/tuning", cookie)));
        Assert.Equal(3, again.GetProperty("cars")[2].GetProperty("steer").GetInt32());
        Assert.Equal(-2, again.GetProperty("cars")[2].GetProperty("balance").GetInt32());
        Assert.Equal(0, again.GetProperty("cars")[1].GetProperty("steer").GetInt32());          // another car is untouched
        var over = await c.SendAsync(app.Req(HttpMethod.Put, "/api/tuning/2", cookie, new { steer = 3, balance = 3, power = 3, handbrake = 2 }));
        Assert.Equal(HttpStatusCode.BadRequest, over.StatusCode);
        Assert.Equal("tuning.budget", (await TestApp.Json(over)).GetProperty("error").GetString());
        var range = await c.SendAsync(app.Req(HttpMethod.Put, "/api/tuning/2", cookie, new { steer = 4, balance = 0, power = 0, handbrake = 0 }));
        Assert.Equal(HttpStatusCode.BadRequest, range.StatusCode);
        Assert.Equal("out_of_range", (await TestApp.Json(range)).GetProperty("fields").GetProperty("steer").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/tuning/9", cookie, new { steer = 0, balance = 0, power = 0, handbrake = 0 }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/tuning/2", cookie, new { steer = 1 }))).StatusCode);   // missing sliders
        // the table refuses eleven points too
        await using var cmd = db.Data.CreateCommand("update drift_tuning set steer = 3, balance = 3, power = 3, handbrake = 3");
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => cmd.ExecuteNonQueryAsync());
    }

    [Fact]
    public async Task A_guest_cannot_reach_the_tuning()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        var admin = await app.SignedInAsync(c);
        var guest = await TestApp.GuestCookieAsync(await app.JoinAsync(c, await app.GuestLinkAsync(c, admin), "Ann"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/tuning", guest))).StatusCode);
    }

    [Fact]
    public void The_servers_lap_check_uses_the_tuned_top_speed()
    {
        var track = RaceTrack.FromJson(RaceTrackTests.MapJson);
        int Clean(double factor)
        {
            var run = new RaceRun(track, 2); var r = new Runner(Guid.NewGuid(), "A", 0, 0, 35 * factor); run.Runners.Add(r); run.Start(0);
            var way = RaceTrackTests.Way(track, 2, 39.4 / 15, 30, -46);                 // 39.4 m/s: a lap in 9.9 s
            for (var i = 0; i < way.Count; i++) run.Pose(r, way[i].X, way[i].Z, 39.4, 0, 0, i / 15.0);
            return r.LapMs.Count;
        }
        Assert.Equal(1, Clean(1.0));                                  // the second lap is fast but possible for the car as built (the first starts after the line, so it is short)
        Assert.Equal(0, Clean(new Tuning(3, 0, 0, 0).TopFactor));     // for the car tuned for steering angle (top speed -3.6 %) it is not
    }

    [Fact]
    public void A_tuned_car_is_marked_in_the_invitation_the_grid_and_the_result()
    {
        var time = new FakeTime();
        var lobby = new WorldRelay(time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 });
        var raceWorld = new WorldRelay(time, new RelayOptions { MaxPerWorld = 8, MaxWorlds = 1, MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 });
        var hub = new RaceHub(time, RaceTrack.FromJson(RaceTrackTests.MapJson), new FakeBest(), raceWorld, [35, 31, 39, 36, 28]);
        var pa = new TextPeer(); var pb = new TextPeer();
        var a = lobby.Join(pa, "a", 0, "anna", 3)!; var b = lobby.Join(pb, "b", 0, "ben", 4)!;
        var ida = Guid.NewGuid(); var idb = Guid.NewGuid();
        hub.LobbyJoined(new LobbyMember(ida, "anna", 0, 3, a, false, 0.964, true));
        hub.LobbyJoined(new LobbyMember(idb, "ben", 0, 4, b));
        hub.OnLobbyText(ida, """{"t":"race.start"}""");
        Assert.True(pb.Last("race.invite")!.Value.GetProperty("tuned").GetBoolean());
        hub.OnLobbyText(idb, """{"t":"race.join"}""");
        for (double t = 0; t < 2; t += 0.1) { time.Advance(0.1); hub.Tick(); }
        var ra = new TextPeer(); var rb = new TextPeer();
        hub.RaceConnected(ida, raceWorld.Join(ra, "ra", 0, "anna", 3)!); hub.RaceConnected(idb, raceWorld.Join(rb, "rb", 0, "ben", 4)!);
        var tuned = ra.Last("grid")!.Value.GetProperty("tuned").EnumerateArray().Select(x => x.GetBoolean()).ToArray();
        Assert.Equal([true, false], tuned);
    }
}
