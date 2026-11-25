using Base.Accounts;
using Base.Web;
using Base.Web.Auth;
using Drift.Garage;
using Drift.Relay;

namespace Drift.Play;

/// <summary>
/// The lobby of the signed-in people: the shared-world relay behind the guard. The person comes from the session, the car,
/// the colour and the name from the garage; one connection per person (a second one replaces the first), and the session is
/// checked again every 30 s so that signing out, blocking or deleting a person closes the socket.
/// </summary>
public static class PlayEndpoint
{
    public const string Path = "/api/play/ws";

    /// <summary>How often an open socket asks whether its session still lives (tests make it short).</summary>
    public static TimeSpan SessionCheck { get; set; } = TimeSpan.FromSeconds(30);

    public static RelayOptions Options { get; } = new() { MaxPerAddress = 16, JoinsPerMinutePerAddress = 60, FramesPerSecondPerAddress = 400 };

    public static void MapPlay(this WebApplication app)
    {
        var relay = app.Services.GetRequiredService<WorldRelay>();
        var live = new Dictionary<Guid, Session>();
        var gate = new object();
        app.Map(Path, async (HttpContext ctx, GarageStore garage, AccountService accounts, SessionCookie cookie) =>
        {
            var me = ctx.Person();
            var token = cookie.Read(ctx.Request);
            var profile = await garage.GetAsync(me.UserId, ctx.RequestAborted);
            var name = GarageStore.DisplayName(me.UserId, profile);   // never the account name
            await RelayEndpoint.Serve(ctx, relay, ctx.ClientIp(), profile.Car, name, profile.Colour,
                stillValid: async () => token is not null && await accounts.ResolveSessionAsync(token, false, CancellationToken.None) is not null,
                joined: s =>
                {
                    Session? old;
                    lock (gate) { live.TryGetValue(me.UserId, out old); live[me.UserId] = s; }
                    if (old is not null) relay.Drop(old, Wire.ByeReplaced);
                },
                checkEvery: SessionCheck,
                left: s => { lock (gate) { if (live.TryGetValue(me.UserId, out var cur) && cur == s) live.Remove(me.UserId); } });
        });
        RelayEndpoint.RunTicker(relay, app.Lifetime.ApplicationStopping);
    }
}
