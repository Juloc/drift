using Base.Accounts;
using Base.Web;
using Base.Web.Auth;
using Drift.Garage;
using Drift.Guests;
using Drift.Race;
using Drift.Relay;

namespace Drift.Play;

/// <summary>Who is playing: a signed-in person or a guest, with what the others see and the check that the session still lives.</summary>
public sealed record Player(Guid Id, string Name, int Car, int Colour, bool Guest, Func<Task<bool>> StillValid);

/// <summary>
/// The lobby of the signed-in people and of the guests: the shared-world relay behind the base's guard (people) or the guest door (guests). The person comes
/// from the session, the car, the colour and the name from the garage (a guest: from the link's page); one connection per person (a second one replaces the
/// first), and the session is checked again every 30 s so that signing out, blocking, deleting or an ended guest link closes the socket.
/// </summary>
public static class PlayEndpoint
{
    public const string Path = "/api/play/ws", GuestPath = "/api/guest/ws";

    /// <summary>How often an open socket asks whether its session still lives (tests make it short).</summary>
    public static TimeSpan SessionCheck { get; set; } = TimeSpan.FromSeconds(30);

    public static RelayOptions Options { get; } = new() { MaxPerAddress = 16, JoinsPerMinutePerAddress = 60, FramesPerSecondPerAddress = 400 };

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
        var me = ctx.Person();
        var token = sp.GetRequiredService<SessionCookie>().Read(ctx.Request);
        var accounts = sp.GetRequiredService<AccountService>();
        var profile = await sp.GetRequiredService<GarageStore>().GetAsync(me.UserId, ctx.RequestAborted);
        return new Player(me.UserId, GarageStore.DisplayName(me.UserId, profile), profile.Car, profile.Colour, false,
            async () => token is not null && await accounts.ResolveSessionAsync(token, false, CancellationToken.None) is not null);
    }

    public static void MapPlay(this WebApplication app)
    {
        var relay = app.Services.GetRequiredService<WorldRelay>();
        var hub = app.Services.GetRequiredService<RaceHub>();
        var sockets = app.Services.GetRequiredService<PersonSockets>();
        Task Lobby(HttpContext ctx, Player p) =>
            RelayEndpoint.Serve(ctx, relay, ctx.ClientIp(), p.Car, p.Name, p.Colour,
                stillValid: p.StillValid, checkEvery: SessionCheck,
                onText: (_, text) => hub.OnLobbyText(p.Id, text),
                joined: s => { sockets.Register(p.Id, false, relay, s); hub.LobbyJoined(new LobbyMember(p.Id, p.Name, p.Car, p.Colour, s, p.Guest)); },
                left: s => { sockets.Unregister(p.Id, false, s); hub.LobbyLeft(p.Id, s); });
        app.Map(Path, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        app.Map(GuestPath, async (HttpContext ctx) => await Lobby(ctx, await WhoAsync(ctx)));
        RelayEndpoint.RunTicker(relay, app.Lifetime.ApplicationStopping);
    }
}
