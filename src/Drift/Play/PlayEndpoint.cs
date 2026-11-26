using Base.Accounts;
using Base.Web;
using Base.Web.Auth;
using Drift.GameAccounts;
using Drift.Garage;
using Drift.Guests;
using Drift.Race;
using Drift.Relay;

namespace Drift.Play;

/// <summary>Is a base session still alive (by its id, which survives the rotation of the cookie value)? The same rule as the base's own check: not too old, not idle, the person active.</summary>
public sealed class SessionLife(Npgsql.NpgsqlDataSource db)
{
    public Task<bool> AliveAsync(Guid sessionId) => Base.Data.Db.ScalarAsync<bool>(db,
        "select exists (select 1 from sessions s join users u on u.id = s.user_id where s.id = $1 and s.created_at > now() - interval '180 days' and s.last_seen > now() - interval '30 days' and u.state = 'active' and (u.totp_confirmed or u.hub_sub is not null))", CancellationToken.None, sessionId);
}

/// <summary>Who is playing: a signed-in person or a guest, with what the others see and the check that the session still lives.</summary>
public sealed record Player(Guid Id, string Name, int Car, int Colour, bool Guest, Func<Task<bool>> StillValid, int? Glow = null, Tuning? Tune = null, string? World = null);

/// <summary>
/// The lobby of the signed-in people and of the guests: the shared-world relay behind the base's guard (people) or the guest door (guests). The person comes
/// from the session, the car, the colour and the name from the garage (a guest: from the link's page); one connection per person (a second one replaces the
/// first), and the session is checked again every 30 s so that signing out, blocking, deleting or an ended guest link closes the socket.
/// </summary>
public static class PlayEndpoint
{
    public const string Path = "/api/play/ws", GuestPath = "/api/guest/ws", GamesPath = "/api/games/play/ws";

    /// <summary>How often an open socket asks whether its session still lives (tests make it short).</summary>
    public static TimeSpan SessionCheck { get; set; } = TimeSpan.FromSeconds(30);

    public static RelayOptions Options { get; } = new()
    {
        MaxPerAddress = 16, JoinsPerMinutePerAddress = 60, FramesPerSecondPerAddress = 400,
        MaxPerWorld = 64,                       // 32 and more drivers in one world (docs/VISION.md)
        InterestRadius = 70, InterestHysteresis = 10, FarEvery = 4,   // cars within 70 m in full every tick, the others in short a few times a second
    };

    /// <summary>The player behind a request to a person's endpoint (base session) or a guest endpoint (guest door).</summary>
    public static async Task<Player> WhoAsync(HttpContext ctx)
    {
        var sp = ctx.RequestServices;
        if (ctx.Items.ContainsKey(OpenPlay.Key)) return OpenPlay.Player(ctx);   // without an account: a name from the relay, a paint from the device, nothing kept
        if (ctx.Items.ContainsKey(GuestEndpoints.Key))
        {
            var g = ctx.Guest();
            var cookie = ctx.Request.Cookies[GuestEndpoints.CookieName(ctx.Request)];
            var guests = sp.GetRequiredService<GuestService>();
            return new Player(g.Id, OpenPlay.GuestName(g.Name, OpenPlay.German(ctx)), Drift.Garage.GarageStore.OnlyCar, g.Colour, true, async () => cookie is not null && await guests.ValidateAsync(cookie, CancellationToken.None) is not null, World: g.LinkId == Guid.Empty ? null : g.LinkId.ToString("N"));   // a guest plays in the private world of the link it came in by
        }
        if (ctx.IsGameAccount())
        {
            var a = ctx.GameAccount();
            var accounts = sp.GetRequiredService<GameAccountService>();
            var prof = await sp.GetRequiredService<GarageStore>().GetAsync(a.Id, ctx.RequestAborted);
            return new Player(a.Id, GarageStore.DisplayName(a.Id, prof, a.Name), prof.Car, prof.Colour, false, () => accounts.AliveAsync(a.SessionId), prof.Glow,
                await sp.GetRequiredService<TuningStore>().GetAsync(a.Id, prof.Car, ctx.RequestAborted));
        }
        var me = ctx.Person();
        var life = sp.GetRequiredService<SessionLife>();
        // a signed-in person joins the private world of a guest link with ?world=<link id> (the link must still be good); without it: the public lobby
        string? world = null;
        if (Guid.TryParse(ctx.Request.Query["world"], out var linkId) && await sp.GetRequiredService<GuestService>().LinkActiveAsync(linkId, ctx.RequestAborted)) world = linkId.ToString("N");
        var sessionId = me.Id;   // the id stays the same when the cookie value is rotated: a socket must not be thrown out by a rotation
        var profile = await sp.GetRequiredService<GarageStore>().GetAsync(me.UserId, ctx.RequestAborted);
        return new Player(me.UserId, me.UserName, profile.Car, profile.Colour, false,
            () => life.AliveAsync(sessionId), profile.Glow, await sp.GetRequiredService<TuningStore>().GetAsync(me.UserId, profile.Car, ctx.RequestAborted), world);
    }

    public static void MapPlay(this WebApplication app)
    {
        var relay = app.Services.GetRequiredService<WorldRelay>();
        var hub = app.Services.GetRequiredService<RaceHub>();
        var sockets = app.Services.GetRequiredService<PersonSockets>();
        var stats = app.Services.GetRequiredService<StatsTracker>();
        var tandem = app.Services.GetRequiredService<TandemTracker>();
        tandem.Follow(relay);
        var matches = app.Services.GetRequiredService<TandemMatches>();
        matches.Follow(relay);
        var challenges = app.Services.GetRequiredService<ChallengeTracker>();
        challenges.Follow(relay);
        Task Lobby(HttpContext ctx, Player p) =>
            RelayEndpoint.Serve(ctx, relay, ctx.ClientIp(), p.Car, p.Name.Length > 0 ? p.Name : null, p.Colour, glow: p.Glow, worldKey: p.World,
                stillValid: p.StillValid, checkEvery: SessionCheck,
                onText: (sess, text) => { if (matches.OnText(sess, text)) return; hub.OnLobbyText(p.Id, text); challenges.OnText(sess, text); },
                joined: s => { stats.Join(s, p.Id, p.Guest); tandem.Join(s, p.Id, p.Name.Length > 0 ? p.Name : s.Name, p.Guest, p.Car); matches.Join(s, p.Id, p.Name.Length > 0 ? p.Name : s.Name, p.Guest, p.Car); challenges.Join(s, p.Id, p.Guest); sockets.Register(p.Id, false, relay, s); hub.LobbyJoined(new LobbyMember(p.Id, p.Name.Length > 0 ? p.Name : s.Name, p.Car, p.Colour, s, p.Guest, p.Tune?.TopFactor ?? 1, p.Tune?.Tuned ?? false)); },
                left: s => { tandem.Leave(s); matches.Leave(s); challenges.Leave(s); sockets.Unregister(p.Id, false, s); hub.LobbyLeft(p.Id, s); _ = stats.LeaveAsync(s); });
        app.Map(Path, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        app.Map(GuestPath, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        app.MapGet("/api/open/name", () => Results.Ok(new { name = WorldRelay.Colours[Random.Shared.Next(WorldRelay.Colours.Length)] + " " + WorldRelay.Animals[Random.Shared.Next(WorldRelay.Animals.Length)] }));   // the suggestion in the name field of somebody without an account
        app.Map(OpenPlay.Path, async (HttpContext ctx) =>
        {
            if (!OpenPlay.TryEnter()) { ctx.Response.StatusCode = 503; return; }   // too many without an account at once
            try { await Lobby(ctx, await WhoAsync(ctx)); } finally { OpenPlay.Leave(); }
        });
        app.Map(GamesPath, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        RelayEndpoint.RunTicker(relay, app.Lifetime.ApplicationStopping, app.Logger);
    }
}
