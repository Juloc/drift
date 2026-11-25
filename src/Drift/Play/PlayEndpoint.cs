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
public sealed record Player(Guid Id, string Name, int Car, int Colour, bool Guest, Func<Task<bool>> StillValid, int? Glow = null, Tuning? Tune = null);

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
        if (ctx.Items.ContainsKey(GuestEndpoints.Key))
        {
            var g = ctx.Guest();
            var cookie = ctx.Request.Cookies[GuestEndpoints.CookieName(ctx.Request)];
            var guests = sp.GetRequiredService<GuestService>();
            return new Player(g.Id, g.Name, g.Car, g.Colour, true, async () => cookie is not null && await guests.ValidateAsync(cookie, CancellationToken.None) is not null);
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
        var sessionId = me.Id;   // the id stays the same when the cookie value is rotated: a socket must not be thrown out by a rotation
        var profile = await sp.GetRequiredService<GarageStore>().GetAsync(me.UserId, ctx.RequestAborted);
        return new Player(me.UserId, GarageStore.DisplayName(me.UserId, profile), profile.Car, profile.Colour, false,
            () => life.AliveAsync(sessionId), profile.Glow, await sp.GetRequiredService<TuningStore>().GetAsync(me.UserId, profile.Car, ctx.RequestAborted));
    }

    public static void MapPlay(this WebApplication app)
    {
        var relay = app.Services.GetRequiredService<WorldRelay>();
        var hub = app.Services.GetRequiredService<RaceHub>();
        var sockets = app.Services.GetRequiredService<PersonSockets>();
        var stats = app.Services.GetRequiredService<StatsTracker>();
        var tandem = app.Services.GetRequiredService<TandemTracker>();
        tandem.Follow(relay);
        Task Lobby(HttpContext ctx, Player p) =>
            RelayEndpoint.Serve(ctx, relay, ctx.ClientIp(), p.Car, p.Name, p.Colour, glow: p.Glow,
                stillValid: p.StillValid, checkEvery: SessionCheck,
                onText: (_, text) => hub.OnLobbyText(p.Id, text),
                joined: s => { stats.Join(s, p.Id, p.Guest); tandem.Join(s, p.Id, p.Name, p.Guest, p.Car); sockets.Register(p.Id, false, relay, s); hub.LobbyJoined(new LobbyMember(p.Id, p.Name, p.Car, p.Colour, s, p.Guest, p.Tune?.TopFactor ?? 1, p.Tune?.Tuned ?? false)); },
                left: s => { tandem.Leave(s); sockets.Unregister(p.Id, false, s); hub.LobbyLeft(p.Id, s); _ = stats.LeaveAsync(s); });
        app.Map(Path, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        app.Map(GuestPath, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        app.Map(GamesPath, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        RelayEndpoint.RunTicker(relay, app.Lifetime.ApplicationStopping, app.Logger);
    }
}
