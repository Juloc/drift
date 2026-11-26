using System.Net;
using System.Net.WebSockets;
using Drift.Play;
using Drift.Race;
using Drift.Relay;
using Microsoft.AspNetCore.TestHost;
using Npgsql;

namespace Drift.Tests;

public class GuestTests
{
    static async Task<(TestDb db, TestApp app, HttpClient c, string admin)> Start()
    {
        var db = await TestDb.CreateAsync();
        var app = new TestApp(db);
        var c = app.Http();
        return (db, app, c, await app.SignedInAsync(c));
    }

    [Fact]
    public async Task Only_an_administrator_makes_and_ends_links()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var member = await app.MemberAsync(c, admin, "ben");
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links", member, new { hours = 4, uses = 5 }))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest-links", member))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links/end-all", member))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links", null, new { hours = 4, uses = 5 }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links", admin, new { hours = 4, uses = 5 }))).StatusCode);
    }

    [Theory]
    [InlineData(0, 5)] [InlineData(13, 5)] [InlineData(4, 0)] [InlineData(4, 21)]
    public async Task A_link_has_limits_hours_and_uses(int hours, int uses)
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links", admin, new { hours, uses }))).StatusCode);
    }

    [Fact]
    public async Task At_most_five_links_are_valid_at_once()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        for (var i = 0; i < 5; i++) await app.GuestLinkAsync(c, admin);
        Assert.Equal(HttpStatusCode.Conflict, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links", admin, new { hours = 4, uses = 5 }))).StatusCode);
    }

    [Fact]
    public async Task A_friend_joins_with_the_link_and_a_name_and_gets_a_cookie_that_works_only_at_the_guest_door()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var token = await app.GuestLinkAsync(c, admin);
        var joined = await app.JoinAsync(c, token, "Kiwi 7");
        var cookie = await TestApp.GuestCookieAsync(joined);
        Assert.StartsWith("drift-guest=", cookie);
        var setCookie = string.Join(";", joined.Headers.GetValues("Set-Cookie")).ToLowerInvariant();
        Assert.Contains("httponly", setCookie); Assert.Contains("samesite=strict", setCookie);
        var me = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", cookie)));
        Assert.Equal("Kiwi 7", me.GetProperty("name").GetString());
        Assert.Equal(1, me.GetProperty("car").GetInt32());   // everybody drives the AE86 for now
        Assert.InRange(me.GetProperty("colour").GetInt32(), 0, 23);
        // a guest gets nothing else
        foreach (var url in new[] { "/api/garage", "/api/guest-links", "/api/people", "/api/times", "/api/play/ws", "/api/settings" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, url, cookie))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 1, colour = 2 }))).StatusCode);
        // the board is theirs to read
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/times", cookie))).StatusCode);
    }

    [Fact]
    public async Task The_guest_door_ignores_a_signed_in_persons_cookie_and_needs_a_guest_session()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", admin))).StatusCode);   // a person's cookie is no guest's
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", "drift-guest=nonsense"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/API/GUEST/ME", "drift-guest=nonsense"))).StatusCode);   // another spelling is the same door
    }

    [Fact]
    public async Task A_wrong_expired_ended_or_used_up_link_is_refused_the_same_way()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        async Task<string> Code(HttpResponseMessage r) { Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode); return (await TestApp.Json(r)).GetProperty("error").GetString()!; }
        var wrong = await Code(await app.JoinAsync(c, "not-a-token", "Ann"));
        var one = await app.GuestLinkAsync(c, admin, 4, 1);
        await TestApp.GuestCookieAsync(await app.JoinAsync(c, one, "Ann"));
        Assert.Equal(wrong, await Code(await app.JoinAsync(c, one, "Bob")));                 // used up
        var expired = await app.GuestLinkAsync(c, admin);
        await using (var cmd = db.Data.CreateCommand("update drift_guest_link set expires_at = now() - interval '1 minute'")) await cmd.ExecuteNonQueryAsync();
        Assert.Equal(wrong, await Code(await app.JoinAsync(c, expired, "Cy")));
        var ended = await app.GuestLinkAsync(c, admin);
        var links = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest-links", admin)));
        await c.SendAsync(app.Req(HttpMethod.Delete, "/api/guest-links/" + links.GetProperty("links")[0].GetProperty("id").GetString(), admin));
        Assert.Equal(wrong, await Code(await app.JoinAsync(c, ended, "Di")));
    }

    [Theory]
    [InlineData("x", "too_short")] [InlineData("a name that is much too long", "too_long")] [InlineData("<b>hi</b>", "invalid")] [InlineData("-dash", "invalid")] [InlineData("emoji😀", "invalid")]
    public async Task A_guest_name_is_checked(string name, string code)
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var token = await app.GuestLinkAsync(c, admin);
        var r = await app.JoinAsync(c, token, name);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal(code, (await TestApp.Json(r)).GetProperty("fields").GetProperty("name").GetString());
        // a refused name does not spend a use
        await using var cmd = db.Data.CreateCommand("select uses from drift_guest_link");
        Assert.Equal((short)0, await cmd.ExecuteScalarAsync());
    }

    [Fact]
    public async Task Joining_needs_the_header_and_the_origin_of_the_apps_own_page_and_is_limited_per_address()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var token = await app.GuestLinkAsync(c, admin);
        var bare = new HttpRequestMessage(HttpMethod.Post, "/api/guest/join") { Content = System.Net.Http.Json.JsonContent.Create(new { token, name = "Ann" }) };
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(bare)).StatusCode);
        var foreign = app.Req(HttpMethod.Post, "/api/guest/join", null, new { token, name = "Ann" }); foreign.Headers.Remove("Origin"); foreign.Headers.Add("Origin", "http://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(foreign)).StatusCode);
        HttpStatusCode last = 0;
        for (var i = 0; i < 12; i++) last = (await app.JoinAsync(c, "guess-" + i, "Ann")).StatusCode;
        Assert.Equal(HttpStatusCode.TooManyRequests, last);                                    // 10 tries a minute
    }

    [Fact]
    public async Task The_database_holds_only_hashes_of_the_secrets()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var token = await app.GuestLinkAsync(c, admin);
        var cookie = await TestApp.GuestCookieAsync(await app.JoinAsync(c, token, "Ann"));
        var secret = cookie.Split('=')[1];
        foreach (var table in new[] { "drift_guest_link", "drift_guest_session" })
        {
            await using var cmd = db.Data.CreateCommand($"select t::text from {table} t");
            var row = (string)(await cmd.ExecuteScalarAsync())!;
            Assert.DoesNotContain(token, row); Assert.DoesNotContain(secret, row);
        }
        await using var len = db.Data.CreateCommand("select octet_length(hash) from drift_guest_session");
        Assert.Equal(32, await len.ExecuteScalarAsync());
    }

    [Fact]
    public async Task A_guest_session_ends_with_its_link_and_ending_one_link_leaves_the_others()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var a = await app.GuestLinkAsync(c, admin); var b = await app.GuestLinkAsync(c, admin);
        var ga = await TestApp.GuestCookieAsync(await app.JoinAsync(c, a, "Ann")); var gb = await TestApp.GuestCookieAsync(await app.JoinAsync(c, b, "Bob"));
        var links = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest-links", admin)));
        var idOfA = links.GetProperty("links").EnumerateArray().Last().GetProperty("id").GetString();   // the older one
        await c.SendAsync(app.Req(HttpMethod.Delete, "/api/guest-links/" + idOfA, admin));
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", ga))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", gb))).StatusCode);
        // the link's own time running out ends the session too
        await using (var cmd = db.Data.CreateCommand("update drift_guest_link set expires_at = now() - interval '1 second'")) await cmd.ExecuteNonQueryAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", gb))).StatusCode);
    }

    static async Task<WebSocket> Connect(TestApp app, string cookie, string path = PlayEndpoint.GuestPath)
    {
        var client = app.Server.CreateWebSocketClient();
        client.ConfigureRequest = r => { r.Headers["Cookie"] = cookie; r.Headers["Origin"] = "http://localhost"; };
        return await client.ConnectAsync(new Uri("ws://localhost" + path), CancellationToken.None);
    }

    static async Task<byte[]?> Frame(WebSocket ws, byte type, int seconds = 5)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        var buf = new byte[512];
        try { while (true) { var r = await ws.ReceiveAsync(buf, cts.Token); if (r.MessageType == WebSocketMessageType.Close) return null; if (r.MessageType == WebSocketMessageType.Binary && buf[0] == type) return buf[..r.Count]; } }
        catch (Exception e) when (e is OperationCanceledException or WebSocketException) { return null; }
    }

    [Fact]
    public async Task A_guest_plays_in_the_lobby_under_the_chosen_name_and_is_thrown_out_when_all_links_end()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var token = await app.GuestLinkAsync(c, admin);
        var guest = await TestApp.GuestCookieAsync(await app.JoinAsync(c, token, "Kiwi 7"));
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, "drift-guest=nonsense"));            // no guest session: no upgrade
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, admin));                              // a person's cookie is not a guest's
        using var ws = await Connect(app, guest);
        var roster = (await Frame(ws, Wire.Roster))!;
        Assert.Equal("Kiwi 7", System.Text.Encoding.UTF8.GetString(roster, 6, roster[5]));
        Assert.Equal(1, roster[3]);                                                                     // the AE86 (the one car for now)
        var ended = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest-links/end-all", admin)));
        Assert.Equal(1, ended.GetProperty("ended").GetInt32());
        var bye = await Frame(ws, Wire.Bye);                                                            // within a moment, not after the 30 s check
        Assert.NotNull(bye); Assert.Equal(Wire.ByeSession, bye![1]);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", guest))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.JoinAsync(c, token, "Again")).StatusCode);
    }

    [Fact]
    public async Task A_guest_who_leaves_is_gone()
    {
        var (db, app, c, admin) = await Start();
        await using var _1 = db; await using var _2 = app;
        var guest = await TestApp.GuestCookieAsync(await app.JoinAsync(c, await app.GuestLinkAsync(c, admin), "Ann"));
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/guest/leave", guest))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/guest/me", guest))).StatusCode);
    }
}

public class GuestRaceTests
{
    [Fact]
    public async Task A_guests_time_is_shown_in_the_result_but_never_stored()
    {
        var time = new FakeTime();
        var lobby = new WorldRelay(time, new RelayOptions { MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 }, new Random(1));
        var raceWorld = new WorldRelay(time, new RelayOptions { MaxPerWorld = 8, MaxWorlds = 1, MaxPerAddress = 99, JoinsPerMinutePerAddress = 99 }, new Random(2));
        var best = new FakeBest();
        var hub = new RaceHub(time, RaceTrack.FromJson(RaceTrackTests.MapJson), best, raceWorld, [35, 31, 39, 36, 28]);
        var gid = Guid.NewGuid(); var peer = new TextPeer();
        var s = lobby.Join(peer, "g", 0, "Guest", 3)!;
        hub.LobbyJoined(new LobbyMember(gid, "Guest", 0, 3, s, Guest: true));
        hub.OnLobbyText(gid, """{"t":"race.start","laps":1}""");
        void Pass(double secs) { for (double t = 0; t < secs; t += 0.1) { time.Advance(0.1); hub.Tick(); } }
        Pass(2);
        var rp = new TextPeer(); var rs = raceWorld.Join(rp, "gr", 0, "Guest", 3)!;
        hub.RaceConnected(gid, rs);
        Pass(4);
        var track = RaceTrack.FromJson(RaceTrackTests.MapJson);
        var path = RaceTrackTests.Way(track, 1, 22.0 / 15, 30, -46);
        var seqG = 0;
        foreach (var p in path)
        {
            var f = new byte[13]; f[0] = 1; f[1] = (byte)++seqG;
            Wire.Put16(f, 2, (int)Math.Round(p.X * 20)); Wire.Put16(f, 4, (int)Math.Round(p.Z * 20));
            Wire.Put16(f, 6, (int)Math.Round(((p.H % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 65536) & 0xFFFF); Wire.Put16(f, 8, 22 * 50);
            raceWorld.OnMessage(rs, f);
            time.Advance(1.0 / 15); hub.Tick();
        }
        Pass(2);
        var row = rp.Last("result")!.Value.GetProperty("rows")[0];
        Assert.True(row.GetProperty("ms").GetInt32() > 10000);
        Assert.False(row.GetProperty("newLap").GetBoolean());
        Assert.Empty(best.Written);
        await Task.CompletedTask;
    }
}
