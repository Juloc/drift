using System.Net;
using System.Net.WebSockets;
using Drift.Play;
using Drift.Relay;
using Microsoft.AspNetCore.TestHost;

namespace Drift.Tests;

public class PlayTests
{
    static async Task<WebSocket> Connect(TestApp app, string? cookie, string origin = "http://localhost")
    {
        var client = app.Server.CreateWebSocketClient();
        client.ConfigureRequest = r => { if (cookie is not null) r.Headers["Cookie"] = cookie; if (origin.Length > 0) r.Headers["Origin"] = origin; };
        return await client.ConnectAsync(new Uri("ws://localhost" + PlayEndpoint.Path), CancellationToken.None);
    }

    /// <summary>Reads frames until one of the type arrives (or the socket closes, then null).</summary>
    static async Task<byte[]?> Frame(WebSocket ws, byte type, int seconds = 5)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        var buf = new byte[512];
        try
        {
            while (true)
            {
                var r = await ws.ReceiveAsync(buf, cts.Token);
                if (r.MessageType == WebSocketMessageType.Close) return null;
                if (buf[0] == type) return buf[..r.Count];
            }
        }
        catch (OperationCanceledException) { return null; }
        catch (WebSocketException) { return null; }
    }

    [Fact]
    public async Task The_socket_needs_a_session_and_the_page_s_own_origin()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var cookie = await app.SignedInAsync(app.Http());
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, null));                                  // no session: 401, no upgrade
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, "drift_sid=nonsense"));
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, cookie, "http://evil.example"));        // a page of another site
        using var ok = await Connect(app, cookie);
        Assert.NotNull(await Frame(ok, Wire.Welcome));
    }

    [Fact]
    public async Task A_person_arrives_with_the_car_colour_and_name_of_the_garage()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var c = app.Http();
        var cookie = await app.SignedInAsync(c, "mia");
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/garage", cookie, new { car = 2, colour = 19, nick = "Bolt" }));
        using var ws = await Connect(app, cookie);
        var welcome = await Frame(ws, Wire.Welcome);
        Assert.Equal(19, welcome![3]);                      // the hue index
        var roster = (await Frame(ws, Wire.Roster))!;
        Assert.Equal(1, roster[1]);
        Assert.Equal(2, roster[3]);                         // car
        Assert.Equal(19, roster[4]);                        // hue
        Assert.Equal("Bolt", System.Text.Encoding.UTF8.GetString(roster, 6, roster[5]));
    }

    [Fact]
    public async Task Without_a_nickname_the_account_name_shows()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var cookie = await app.SignedInAsync(app.Http(), "mia");
        using var ws = await Connect(app, cookie);
        var roster = (await Frame(ws, Wire.Roster))!;
        Assert.Equal("mia", System.Text.Encoding.UTF8.GetString(roster, 6, roster[5]));
    }

    [Fact]
    public async Task A_second_connection_of_the_same_person_replaces_the_first()
    {
        await using var db = await TestDb.CreateAsync();
        await using var app = new TestApp(db);
        var cookie = await app.SignedInAsync(app.Http());
        using var first = await Connect(app, cookie);
        Assert.NotNull(await Frame(first, Wire.Welcome));
        using var second = await Connect(app, cookie);
        Assert.NotNull(await Frame(second, Wire.Welcome));
        var bye = await Frame(first, Wire.Bye);
        Assert.NotNull(bye);
        Assert.Equal(Wire.ByeReplaced, bye![1]);
    }

    [Fact]
    public async Task When_the_session_ends_the_socket_is_closed()
    {
        PlayEndpoint.SessionCheck = TimeSpan.FromMilliseconds(300);
        try
        {
            await using var db = await TestDb.CreateAsync();
            await using var app = new TestApp(db);
            var c = app.Http();
            var cookie = await app.SignedInAsync(c);
            using var ws = await Connect(app, cookie);
            Assert.NotNull(await Frame(ws, Wire.Welcome));
            Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/auth/logout", cookie))).StatusCode);
            var bye = await Frame(ws, Wire.Bye);
            Assert.NotNull(bye);
            Assert.Equal(Wire.ByeSession, bye![1]);
        }
        finally { PlayEndpoint.SessionCheck = TimeSpan.FromSeconds(30); }
    }
}
