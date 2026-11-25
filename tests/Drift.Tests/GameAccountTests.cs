using System.Net;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Drift.GameAccounts;
using Drift.Play;
using Drift.Relay;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Drift.Tests;

static class GameAccountSetup
{
    // the shipped legal pages carry placeholders (so sign-up would be closed); the tests switch that check off, and make the puzzle small
    [ModuleInitializer] internal static void Init() { LegalPages.Required = false; SignupGuard.BaseDifficulty = 6; SignupGuard.MaxDifficulty = 10; }
}

/// <summary>The Juloc Games account (docs/PLAN-0.2.md slices 1 to 4): the module through the app's own door.</summary>
public class GameAccountTests
{
    const string Pw = "kiwi-lemon-42";

    static async Task<(TestDb db, TestApp app, HttpClient c)> Start()
    {
        var db = await TestDb.CreateAsync();
        var app = new TestApp(db);
        return (db, app, app.Http());
    }

    /// <summary>Finds the number the page's worker would find.</summary>
    static string Solve(string salt, string name, int bits)
    {
        for (var n = 0; ; n++)
            if (SignupGuard.Leading(SHA256.HashData(Encoding.UTF8.GetBytes(salt + ":" + name + ":" + n)), bits)) return n.ToString();
    }

    static async Task<HttpResponseMessage> SignUp(TestApp app, HttpClient c, string name, string password = Pw)
    {
        var ch = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/challenge")));
        var o = ch.GetProperty("challenge");
        return await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/signup", null, new { name, password, challenge = o.GetProperty("challenge").GetString(), nonce = Solve(o.GetProperty("salt").GetString()!, name, o.GetProperty("difficulty").GetInt32()) }));
    }

    static async Task<string> Cookie(TestApp app, HttpClient c, string name, string password = Pw)
    {
        var r = await SignUp(app, c, name, password);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return TestApp.CookieOf(r);
    }

    static async Task<WebSocket> Connect(TestApp app, string cookie, string path = PlayEndpoint.GamesPath)
    {
        var client = app.Server.CreateWebSocketClient();
        client.ConfigureRequest = r => { r.Headers["Cookie"] = cookie; r.Headers["Origin"] = "http://localhost"; };
        return await client.ConnectAsync(new Uri("ws://localhost" + path), CancellationToken.None);
    }

    static async Task<string?> Text(WebSocket ws, string type, int seconds = 5)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        var buf = new byte[4096];
        try
        {
            while (true)
            {
                var r = await ws.ReceiveAsync(buf, cts.Token);
                if (r.MessageType == WebSocketMessageType.Close) return null;
                if (r.MessageType != WebSocketMessageType.Text) continue;
                var s = Encoding.UTF8.GetString(buf, 0, r.Count);
                if (JsonDocument.Parse(s).RootElement.GetProperty("t").GetString() == type) return s;
            }
        }
        catch (Exception e) when (e is OperationCanceledException or WebSocketException) { return null; }
    }

    static async Task<bool> Closes(WebSocket ws, int seconds = 5)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        var buf = new byte[4096];
        try { while (true) { var r = await ws.ReceiveAsync(buf, cts.Token); if (r.MessageType == WebSocketMessageType.Close) return true; } }
        catch (Exception e) when (e is WebSocketException) { return true; }
        catch (OperationCanceledException) { return false; }
    }

    // ================= slice 1: the module

    [Fact]
    public async Task Sign_up_signs_in_and_the_cookie_is_safe()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var r = await SignUp(app, c, "Kiwi 7");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var cookie = TestApp.CookieOf(r);
        Assert.StartsWith("games=", cookie);
        var set = string.Join(";", r.Headers.GetValues("Set-Cookie")).ToLowerInvariant();
        Assert.Contains("httponly", set); Assert.Contains("samesite=strict", set);
        var me = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", cookie)));
        Assert.Equal("Kiwi 7", me.GetProperty("name").GetString());
        Assert.False(me.GetProperty("mustChange").GetBoolean());
    }

    [Fact]
    public async Task Cookies_do_not_cross_doors()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        var games = await Cookie(app, c, "Lena Q");
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", admin))).StatusCode);        // a hub session is no games session
        foreach (var url in new[] { "/api/garage", "/api/people", "/api/guest-links", "/api/games-admin/accounts", "/api/settings", "/api/play/ws" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, url, games))).StatusCode);                   // a games session reaches the games door only
        var gtoken = await app.GuestLinkAsync(c, admin);
        var guest = TestApp.CookieOf(await app.JoinAsync(c, gtoken, "Kiwi 8"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", guest))).StatusCode);
        // a change from a foreign page is refused even with a good cookie
        var evil = app.Req(HttpMethod.Post, "/api/games/logout", games); evil.Headers.Remove("Origin"); evil.Headers.Add("Origin", "http://evil.example");
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(evil)).StatusCode);
    }

    [Theory]
    [InlineData("ab", "too_short")] [InlineData("a-very-long-name-indeed", "too_long")] [InlineData("-dash", "invalid")] [InlineData("two  spaces", "invalid")]
    [InlineData("n<b>", "invalid")] [InlineData("Иван Ivan", "invalid")] [InlineData("Admin", "reserved")] [InlineData("fuck you", "not_allowed")]
    public async Task Bad_names_are_refused_with_a_code(string name, string code)
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var r = await SignUp(app, c, name);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal(code, (await TestApp.Json(r)).GetProperty("fields").GetProperty("name").GetString());
    }

    [Theory]
    [InlineData("short1", "password.short")] [InlineData("password", "password.common")] [InlineData("aaaaaaaaaa", "password.simple")] [InlineData("xxKiwi 9xx", "password.contains_name")]
    public async Task Bad_passwords_are_refused_with_a_code(string password, string code)
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var r = await SignUp(app, c, "Kiwi 9", password);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal(code, (await TestApp.Json(r)).GetProperty("fields").GetProperty("password").GetString());
    }

    [Fact]
    public async Task A_name_is_unique_ignoring_case_and_look_alike_forms()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        await Cookie(app, c, "Kiwi Ten");
        Assert.Equal(HttpStatusCode.Conflict, (await SignUp(app, c, "KIWI TEN")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await SignUp(app, c, "kiwi ten")).StatusCode);
    }

    [Fact]
    public async Task Sign_in_answers_the_same_for_an_unknown_name_and_a_wrong_password()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        await Cookie(app, c, "Kiwi 11");
        var a = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 11", password = "wrong-wrong-1" }));
        var b = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Nobody 1", password = "wrong-wrong-1" }));
        Assert.Equal(HttpStatusCode.Unauthorized, a.StatusCode); Assert.Equal(HttpStatusCode.Unauthorized, b.StatusCode);
        Assert.Equal(await a.Content.ReadAsStringAsync(), await b.Content.ReadAsStringAsync());
        var ok = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "kiwi 11", password = Pw }));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task An_unknown_name_costs_about_as_much_time_as_a_known_one()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        await Cookie(app, c, "Kiwi 12");
        async Task<double> Time(string name) { var sw = System.Diagnostics.Stopwatch.StartNew(); for (var i = 0; i < 3; i++) await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name, password = "wrong-wrong-" + i })); return sw.Elapsed.TotalMilliseconds; }
        var known = await Time("Kiwi 12"); var unknown = await Time("Nobody 12");
        Assert.True(unknown > known * 0.5, $"unknown {unknown:0} ms vs known {known:0} ms");   // both run the full Argon2 check
    }

    [Fact]
    public async Task Failed_sign_ins_wait_and_the_wait_doubles()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        await Cookie(app, c, "Kiwi 13");
        HttpStatusCode last = 0;
        for (var i = 0; i < 6; i++) last = (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 13", password = "wrong-wrong-" + i }))).StatusCode;
        Assert.Equal(HttpStatusCode.TooManyRequests, last);
        // even the right password waits (the wait is the lock; there is no permanent lock-out)
        Assert.Equal(HttpStatusCode.TooManyRequests, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 13", password = Pw }))).StatusCode);
    }

    [Fact]
    public async Task The_garage_tuning_stats_and_boards_work_for_an_account_under_its_own_name()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var cookie = await Cookie(app, c, "Kiwi 14");
        var g = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/garage", cookie)));
        Assert.Equal("Kiwi 14", g.GetProperty("name").GetString());          // no nickname: the chosen name is shown
        var put = await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", cookie, new { car = 3, colour = 5, nick = "Bolt" }));
        Assert.Equal("Bolt", (await TestApp.Json(put)).GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/tuning/3", cookie, new { steer = 2, balance = 0, power = 1, handbrake = 0 }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/tuning", cookie))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/stats", cookie))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/times", cookie))).StatusCode);
        // a name the filter refuses is refused as a nickname too
        var bad = await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", cookie, new { car = 3, colour = 5, nick = "sh1t head" }));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Sign_out_ends_the_session_and_a_password_change_ends_the_others()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var one = await Cookie(app, c, "Kiwi 15");
        var two = TestApp.CookieOf(await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 15", password = Pw })));
        var change = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/password", one, new { current = Pw, next = "new-pass-word-9" }));
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", two))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", one))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/password", one, new { current = "not-the-one-1", next = "other-pass-word-9" }))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/logout", one))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", one))).StatusCode);
    }

    [Fact]
    public async Task A_games_account_drives_in_the_lobby_with_a_hub_person()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var hub = await app.SignedInAsync(c);
        var cookie = await Cookie(app, c, "Kiwi 16");
        using var a = await Connect(app, cookie);
        var client = app.Server.CreateWebSocketClient();
        client.ConfigureRequest = r => { r.Headers["Cookie"] = hub; r.Headers["Origin"] = "http://localhost"; };
        using var b = await client.ConnectAsync(new Uri("ws://localhost" + PlayEndpoint.Path), CancellationToken.None);
        var buf = new byte[512];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var got = false;
        while (!got) { var r = await a.ReceiveAsync(buf, cts.Token); if (r.MessageType == WebSocketMessageType.Binary && buf[0] == Wire.Roster) got = true; }
        Assert.True(got);
    }

    [Fact]
    public async Task The_games_socket_needs_the_games_session_and_the_pages_origin()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var cookie = await Cookie(app, c, "Kiwi 17");
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, "games=nonsense"));
        var hubCookie = await app.SignedInAsync(c);
        await Assert.ThrowsAnyAsync<Exception>(() => Connect(app, hubCookie));
        using var ok = await Connect(app, cookie);
        Assert.False(await Closes(ok, 1));
    }

    [Fact]
    public void The_module_stands_alone_in_its_own_folder_with_its_own_tables()
    {
        var dir = Path.Combine(Repo.Root, "src", "Drift", "GameAccounts");
        foreach (var f in Directory.GetFiles(dir, "*.cs"))
        {
            var text = File.ReadAllText(f);
            foreach (var line in text.Split('\n').Where(l => l.TrimStart().StartsWith("using Drift.", StringComparison.Ordinal)))
                Assert.True(line.Contains("using Drift.GameAccounts;"), f + ": " + line.Trim());   // nothing of the game's code
            Assert.DoesNotContain("drift_", text, StringComparison.Ordinal);   // no table of the game
        }
        foreach (var f in new[] { "008_games_accounts.sql", "009_games_protection.sql" })
            foreach (var m in System.Text.RegularExpressions.Regex.Matches(File.ReadAllText(Path.Combine(Repo.Root, "src", "Drift", "Migrations", f)), @"create table (\w+)").Select(m => m.Groups[1].Value))
                Assert.StartsWith("games_account", m);
    }

    // ================= slice 2: protection of registration

    [Fact]
    public async Task Sign_up_needs_the_puzzle_a_challenge_works_once_and_cannot_be_forged()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        Task<HttpResponseMessage> Post(object body) => c.SendAsync(app.Req(HttpMethod.Post, "/api/games/signup", null, body));
        async Task<string> Code(HttpResponseMessage r) => (await TestApp.Json(r)).GetProperty("error").GetString()!;
        Assert.Equal("games.pow", await Code(await Post(new { name = "Kiwi 20", password = Pw })));                                    // none
        var ch = (await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/challenge")))).GetProperty("challenge");
        var token = ch.GetProperty("challenge").GetString()!; var salt = ch.GetProperty("salt").GetString()!; var bits = ch.GetProperty("difficulty").GetInt32();
        Assert.Equal("games.pow", await Code(await Post(new { name = "Kiwi 20", password = Pw, challenge = token, nonce = "x" })));    // not solved (nonce wrong: bits make a miss all but sure)
        var forged = token[..^4] + "0000";
        Assert.Equal("games.pow", await Code(await Post(new { name = "Kiwi 20", password = Pw, challenge = forged, nonce = Solve(salt, "Kiwi 20", bits) })));
        var nonce = Solve(salt, "Kiwi 20", bits);
        Assert.Equal("games.pow", await Code(await Post(new { name = "Kiwi 21", password = Pw, challenge = token, nonce })));             // the work belongs to the name
        Assert.Equal(HttpStatusCode.OK, (await Post(new { name = "Kiwi 20", password = Pw, challenge = token, nonce })).StatusCode);
        Assert.Equal("games.pow", await Code(await Post(new { name = "Kiwi 22", password = Pw, challenge = token, nonce = Solve(salt, "Kiwi 22", bits) })));   // used once
    }

    [Fact]
    public async Task The_puzzle_gets_harder_with_sign_ups_from_one_address_and_has_a_ceiling()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        async Task<int> Bits() => (await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/challenge")))).GetProperty("challenge").GetProperty("difficulty").GetInt32();
        var before = await Bits();
        await Cookie(app, c, "Kiwi 30");
        var after = await Bits();
        Assert.True(after > before, $"{before} -> {after}");
        Assert.True(after <= SignupGuard.MaxDifficulty);
    }

    [Fact]
    public async Task One_address_makes_a_few_accounts_a_day_and_the_refusal_is_logged_nowhere_with_the_address()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        for (var i = 0; i < SignupGuard.PerAddressDay; i++) await Cookie(app, c, "Lim " + i + "x");
        var r = await SignUp(app, c, "Lim over");
        Assert.Equal(HttpStatusCode.TooManyRequests, r.StatusCode);
        Assert.Equal("games.signup_limit", (await TestApp.Json(r)).GetProperty("error").GetString());
        // the log holds a keyed hash, never the address
        await using var cmd = db.Data.CreateCommand("select count(*) from games_account_signup_log where addr = convert_to('127.0.0.1', 'UTF8')");
        Assert.Equal(0L, (long)(await cmd.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task A_thousand_scripted_attempts_from_one_address_are_stopped_and_the_server_stays_up()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var created = 0; var refused = 0;
        var tasks = Enumerable.Range(0, 1000).Select(async i =>
        {
            // a script that skips the puzzle is refused before any database work; one that solves it runs into the limit
            var r = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/signup", null, new { name = "Bot " + i, password = Pw, challenge = "x", nonce = "1" }));
            if (r.StatusCode == HttpStatusCode.OK) Interlocked.Increment(ref created); else Interlocked.Increment(ref refused);
        });
        await Task.WhenAll(tasks);
        Assert.Equal(0, created); Assert.Equal(1000, refused);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/challenge"))).StatusCode);   // still answering
        var ok = 0;
        for (var i = 0; i < 12; i++) if ((await SignUp(app, c, "Slv " + i + "q")).StatusCode == HttpStatusCode.OK) ok++;
        Assert.Equal(SignupGuard.PerAddressDay, ok);
    }

    [Fact]
    public async Task The_puzzle_solves_fast_enough_at_the_base_level()
    {
        // the real base difficulty, the page's worker does about this much work per second on a phone: a count of hashes, not a clock
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var n = 0; var salt = "abc";
        while (!SignupGuard.Leading(SHA256.HashData(Encoding.UTF8.GetBytes(salt + ":x:" + n)), 17)) n++;
        Assert.True(n < 2_000_000, $"{n} hashes at 17 bits");   // geometric: the mean is 131 072, two million is a very unlucky draw
        Assert.True(sw.Elapsed.TotalSeconds < 20);
    }

    [Fact]
    public void Sign_up_stays_closed_while_the_owners_texts_are_not_in()
    {
        var shipped = new PhysicalFileProvider(Path.Combine(Repo.Root, "src", "Drift", "wwwroot"));
        var was = LegalPages.Required;
        try
        {
            LegalPages.Required = true;
            Assert.False(new LegalPages(shipped, NullLogger<LegalPages>.Instance).Complete);   // the pages we ship carry the marker
            var dir = Directory.CreateTempSubdirectory().FullName;
            Directory.CreateDirectory(Path.Combine(dir, "legal"));
            File.WriteAllText(Path.Combine(dir, "legal", "privacy.html"), "<p>Our text</p>");
            File.WriteAllText(Path.Combine(dir, "legal", "imprint.html"), "<p>Our text</p>");
            Assert.True(new LegalPages(new PhysicalFileProvider(dir), NullLogger<LegalPages>.Instance).Complete);
            File.WriteAllText(Path.Combine(dir, "legal", "imprint.html"), "<p>" + LegalPages.Marker + "</p>");
            Assert.False(new LegalPages(new PhysicalFileProvider(dir), NullLogger<LegalPages>.Instance).Complete);
        }
        finally { LegalPages.Required = was; }
    }

    // ================= slice 3: names and admin

    [Theory]
    [InlineData("fuck")] [InlineData("Fuuuck")] [InlineData("f.u.c.k")] [InlineData("sh1t")] [InlineData("$h!t")] [InlineData("a$$hole")] [InlineData("Ｆｕｃｋ")] [InlineData("Hitl3r")] [InlineData("n1gger")]
    public void The_filter_folds_case_look_alikes_and_repeats(string name) => Assert.False(NameFilter.Allowed(name), name);

    [Theory]
    [InlineData("Kiwi 7")] [InlineData("Nico")] [InlineData("Anna-Lena")] [InlineData("Drifter 88")] [InlineData("Müller")] [InlineData("Scunthorpe fan")]
    public void The_filter_lets_ordinary_names_through(string name)
    {
        // "Scunthorpe fan" is the known weak spot of every word filter: it is refused, and that is written down here so nobody is surprised
        if (name.StartsWith("Scunthorpe")) { Assert.False(NameFilter.Allowed(name)); return; }
        Assert.True(NameFilter.Allowed(name), name);
    }

    [Fact]
    public void Every_neutral_name_of_the_game_passes_the_filter()
    {
        foreach (var colour in WorldRelay.Colours) foreach (var animal in WorldRelay.Animals)
            Assert.True(NameFilter.Allowed(colour + " " + animal), colour + " " + animal);
    }

    [Fact]
    public void The_administrators_word_list_adds_to_the_built_in_one()
    {
        try
        {
            NameFilter.SetWords(["banana"]);
            Assert.False(NameFilter.Allowed("B4nana Joe")); Assert.False(NameFilter.Allowed("fuck"));
        }
        finally { NameFilter.SetWords(null); }
        Assert.True(NameFilter.Allowed("Banana Joe"));
    }

    [Fact]
    public async Task A_guest_name_goes_through_the_filter_too()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        var token = await app.GuestLinkAsync(c, admin);
        var r = await app.JoinAsync(c, token, "sh1thead");
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal("not_allowed", (await TestApp.Json(r)).GetProperty("fields").GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.OK, (await app.JoinAsync(c, token, "Nice Guest")).StatusCode);
    }

    static string Id(JsonElement list, string name) => list.GetProperty("accounts").EnumerateArray().First(a => a.GetProperty("name").GetString() == name).GetProperty("id").GetString()!;

    [Fact]
    public async Task Only_an_administrator_reaches_the_games_admin()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        var member = await app.MemberAsync(c, admin, "ben");
        foreach (var url in new[] { "/api/games-admin/accounts", "/api/games-admin/reports", "/api/games-admin/bans" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(app.Req(HttpMethod.Get, url, member))).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, url, null))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, url, admin))).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games-admin/bans", member, new { range = "10.0.0.1", hours = 1 }))).StatusCode);
    }

    [Fact]
    public async Task Blocking_ends_the_session_closes_the_socket_and_keeps_the_person_out_until_unblocked()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        var cookie = await Cookie(app, c, "Kiwi 40");
        using var ws = await Connect(app, cookie);
        Assert.False(await Closes(ws, 1));
        var id = Id(await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games-admin/accounts?q=kiwi", admin))), "Kiwi 40");
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, $"/api/games-admin/accounts/{id}/block", admin))).StatusCode);
        Assert.True(await Closes(ws, 5));
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", cookie))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 40", password = Pw }))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, $"/api/games-admin/accounts/{id}/unblock", admin))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 40", password = Pw }))).StatusCode);
        // the actions are in the audit log
        Assert.Equal(1L, (long)(await db.Data.CreateCommand("select count(*) from account_audit where event = 'games.block'").ExecuteScalarAsync())!);
        Assert.Equal(1L, (long)(await db.Data.CreateCommand("select count(*) from account_audit where event = 'games.unblock'").ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task A_reset_gives_a_temporary_password_that_must_be_changed()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        var old = await Cookie(app, c, "Kiwi 41");
        var id = Id(await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games-admin/accounts?q=kiwi", admin))), "Kiwi 41");
        var temp = (await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Post, $"/api/games-admin/accounts/{id}/reset-password", admin)))).GetProperty("password").GetString()!;
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", old))).StatusCode);                          // every session ended
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 41", password = Pw }))).StatusCode);
        var login = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 41", password = temp }));
        Assert.True((await TestApp.Json(login)).GetProperty("mustChange").GetBoolean());
        var cookie = TestApp.CookieOf(login);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/garage", cookie))).StatusCode);                  // nothing else until the change
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/password", cookie, new { current = temp, next = "fresh-pass-word-7" }))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/garage", cookie))).StatusCode);
    }

    [Fact]
    public async Task A_ban_stops_sign_up_and_sign_in_from_that_address_and_is_checked_for_size()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        await Cookie(app, c, "Kiwi 42");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games-admin/bans", admin, new { range = "10.0.0.0/8", hours = 1 }))).StatusCode);   // too large
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games-admin/bans", admin, new { range = "not an address", hours = 1 }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games-admin/bans", admin, new { range = "10.1.2.3", hours = 0 }))).StatusCode);
        var made = await c.SendAsync(app.Req(HttpMethod.Post, "/api/games-admin/bans", admin, new { range = "127.0.0.0/24", hours = 1, reason = "test" }));
        Assert.Equal(HttpStatusCode.OK, made.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 42", password = Pw }))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SignUp(app, c, "Kiwi 43")).StatusCode);
        var id = (await TestApp.Json(made)).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Delete, $"/api/games-admin/bans/{id}", admin))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/login", null, new { name = "Kiwi 42", password = Pw }))).StatusCode);
    }

    [Fact]
    public async Task A_report_has_a_fixed_reason_reaches_the_admin_and_is_limited()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var admin = await app.SignedInAsync(c);
        var cookie = await Cookie(app, c, "Kiwi 44");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/report", cookie, new { name = "Red Fox", reason = 9 }))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/report", cookie, new { name = "", reason = 1 }))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/report", cookie, new { name = "Red Fox", reason = 0 }))).StatusCode);
        var list = await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games-admin/reports", admin)));
        var one = list.GetProperty("reports").EnumerateArray().Single();
        Assert.Equal("Red Fox", one.GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, $"/api/games-admin/reports/{one.GetProperty("id").GetString()}/handle", admin))).StatusCode);
        Assert.Empty((await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games-admin/reports", admin)))).GetProperty("reports").EnumerateArray());
        HttpStatusCode last = 0;
        for (var i = 0; i < Reports.PerHour + 1; i++) last = (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/report", cookie, new { name = "Blue Owl", reason = 1 }))).StatusCode;
        Assert.Equal(HttpStatusCode.TooManyRequests, last);
        // a hub person can report too
        var member = await app.MemberAsync(c, admin, "ben");
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games-report", member, new { name = "Red Fox", reason = 2 }))).StatusCode);
    }

    // ================= slice 4: emotes, delete, export

    [Fact]
    public async Task Emotes_are_a_fixed_set_shown_to_the_lobby_and_everything_else_is_dropped()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var one = await Cookie(app, c, "Kiwi 50"); var two = await Cookie(app, c, "Kiwi 51");
        using var a = await Connect(app, one); using var b = await Connect(app, two);
        await Task.Delay(300);
        Task Send(WebSocket ws, string json) => ws.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, CancellationToken.None);
        await Send(a, "{\"t\":\"emote\",\"e\":3}");
        var seen = JsonDocument.Parse((await Text(b, "emote"))!).RootElement;
        Assert.Equal(3, seen.GetProperty("e").GetInt32());
        // free text, an unknown symbol, a symbol out of range, an emote too soon after the last: nothing arrives
        var hub = app.Services.GetRequiredService<Drift.Race.RaceHub>();
        var dropped0 = hub.emotesDropped;
        await Send(a, "{\"t\":\"emote\",\"e\":4}");   // too soon
        await Send(a, "{\"t\":\"emote\",\"e\":99}");
        await Send(a, "{\"t\":\"emote\",\"text\":\"hello everybody\"}");
        await Send(a, "{\"t\":\"say\",\"text\":\"hello\"}");
        await Task.Delay(400);
        Assert.True(hub.emotesDropped >= dropped0 + 4);
        Assert.Null(await Text(b, "emote", 1));
        // and nothing of the sender's own words is ever relayed: the message the others get has only the car's id and the symbol
        Assert.Equal(["e", "id", "t"], seen.EnumerateObject().Select(p => p.Name).Order().ToArray());
    }

    [Fact]
    public async Task Deleting_an_account_leaves_no_row_with_its_id_and_reserves_the_name_for_thirty_days()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var cookie = await Cookie(app, c, "Kiwi 60");
        var other = await Cookie(app, c, "Kiwi 61");
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", cookie, new { car = 2, colour = 7, nick = "Gone Soon" }));
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/tuning/2", cookie, new { steer = 1, balance = 1, power = 0, handbrake = 0 }));
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", other, new { car = 1, colour = 3 }));
        var id = (await db.Data.CreateCommand("select id::text from games_account where name = 'Kiwi 60'").ExecuteScalarAsync())!.ToString()!;
        await db.Data.CreateCommand($"insert into drift_stats (user_id, races) values ('{id}', 3)").ExecuteNonQueryAsync();
        await db.Data.CreateCommand($"insert into drift_best_time (map_id, user_id, kind, ms, car_id) values (0, '{id}', 0, 60000, 2)").ExecuteNonQueryAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/delete", cookie, new { password = "not-the-password-1" }))).StatusCode);   // the password is asked
        Assert.Equal(HttpStatusCode.OK, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", cookie))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.SendAsync(app.Req(HttpMethod.Post, "/api/games/delete", cookie, new { password = Pw }))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/me", cookie))).StatusCode);
        // walk every table of the schema: no row mentions the id any more
        var tables = new List<string>();
        await using (var cmd = db.Data.CreateCommand("select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'"))
        await using (var rd = await cmd.ExecuteReaderAsync()) while (await rd.ReadAsync()) tables.Add(rd.GetString(0));
        Assert.Contains("drift_profile", tables); Assert.Contains("games_account", tables);
        foreach (var t in tables)
        {
            await using var q = db.Data.CreateCommand($"select count(*) from \"{t}\" x where row_to_json(x)::text like '%{id}%'");
            var n = (long)(await q.ExecuteScalarAsync())!;
            if (t == "games_account_report") continue;   // a report keeps what it says about others, not the account
            Assert.True(n == 0, $"{t} still has {n} row(s) with the deleted id");
        }
        // the other account is untouched, and the name is reserved
        Assert.Equal(1, (await TestApp.Json(await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/garage", other)))).GetProperty("car").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await SignUp(app, c, "Kiwi 60")).StatusCode);
        // after thirty days it is free
        await db.Data.CreateCommand("update games_account_released set until = now() - interval '1 second'").ExecuteNonQueryAsync();
        Assert.Equal(HttpStatusCode.OK, (await SignUp(app, c, "Kiwi 60")).StatusCode);
    }

    [Fact]
    public async Task The_export_has_exactly_what_is_stored_about_the_person_and_nothing_of_others()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var mine = await Cookie(app, c, "Kiwi 70"); var other = await Cookie(app, c, "Kiwi 71");
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", mine, new { car = 4, colour = 9, nick = "Mine" }));
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", other, new { car = 1, colour = 2, nick = "Secret Other" }));
        var r = await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/export", mine));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Contains("attachment", r.Content.Headers.ContentDisposition?.ToString() ?? string.Join(";", r.Headers.Select(h => h.Value)));
        var text = await r.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(text).RootElement;
        Assert.Equal("Kiwi 70", json.GetProperty("account").GetProperty("name").GetString());
        Assert.Equal("Mine", json.GetProperty("garage").GetProperty("nick").GetString());
        Assert.DoesNotContain("Secret Other", text); Assert.DoesNotContain("Kiwi 71", text);
        Assert.DoesNotContain("password", text, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(app.Req(HttpMethod.Get, "/api/games/export", null))).StatusCode);
    }

    [Fact]
    public async Task The_sweep_removes_rows_of_people_who_are_gone_and_keeps_the_others()
    {
        var (db, app, c) = await Start(); await using var _1 = db; await using var _2 = app;
        var cookie = await Cookie(app, c, "Kiwi 80");
        await c.SendAsync(app.Req(HttpMethod.Put, "/api/games/garage", cookie, new { car = 1, colour = 1 }));
        var gone = Guid.NewGuid();
        await db.Data.CreateCommand($"insert into drift_profile (user_id, car_id, colour) values ('{gone}', 0, 0)").ExecuteNonQueryAsync();
        await app.Services.GetRequiredService<Drift.Owners>().SweepAsync();
        Assert.Equal(0L, (long)(await db.Data.CreateCommand($"select count(*) from drift_profile where user_id = '{gone}'").ExecuteScalarAsync())!);
        Assert.Equal(1L, (long)(await db.Data.CreateCommand("select count(*) from drift_profile").ExecuteScalarAsync())!);
    }
}
