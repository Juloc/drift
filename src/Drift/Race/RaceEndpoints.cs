using Base.Web;
using Base.Web.Auth;
using Drift.Garage;
using Drift.Relay;
using Base.Accounts;

namespace Drift.Race;

/// <summary>The race socket (only for the people who joined the race now) and the board of best times.</summary>
public static class RaceEndpoints
{
    public const string Path = "/api/play/race/ws";

    public static void MapRace(this WebApplication app)
    {
        var hub = app.Services.GetRequiredService<RaceHub>();
        var raceRelay = app.Services.GetRequiredKeyedService<WorldRelay>("race");
        app.Map(Path, async (HttpContext ctx, GarageStore garage, AccountService accounts, SessionCookie cookie) =>
        {
            var me = ctx.Person();
            if (!hub.CanRace(me.UserId)) { ctx.Response.StatusCode = StatusCodes.Status409Conflict; return; }
            var token = cookie.Read(ctx.Request);
            var profile = await garage.GetAsync(me.UserId, ctx.RequestAborted);
            await RelayEndpoint.Serve(ctx, raceRelay, ctx.ClientIp(), profile.Car, GarageStore.DisplayName(me.UserId, profile), profile.Colour,
                stillValid: async () => token is not null && await accounts.ResolveSessionAsync(token, false, CancellationToken.None) is not null,
                joined: s => hub.RaceConnected(me.UserId, s),
                left: s => hub.RaceLeft(me.UserId, s),
                checkEvery: Drift.Play.PlayEndpoint.SessionCheck,
                onText: (_, text) => hub.OnRaceText(me.UserId, text));
        });
        RelayEndpoint.RunTicker(raceRelay, app.Lifetime.ApplicationStopping);
        _ = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100));
            try { while (await timer.WaitForNextTickAsync(app.Lifetime.ApplicationStopping)) hub.Tick(); } catch (OperationCanceledException) { }
        });

        app.MapGet("/api/times", async (RaceStore store, RaceTrack track, CancellationToken ct) => Results.Ok(new
        {
            map = track.Name, laps = track.Laps,
            lap = (await store.TopAsync(track.MapId, RaceStore.Lap, 5, ct)).Select(r => new { name = r.Name, ms = r.Ms, car = r.Car }),
            race = (await store.TopAsync(track.MapId, RaceStore.Race, 5, ct)).Select(r => new { name = r.Name, ms = r.Ms, car = r.Car }),
        }));
    }
}
