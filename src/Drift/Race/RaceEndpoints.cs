using Base.Web;
using Base.Web.Auth;
using Drift.Play;
using Drift.Relay;

namespace Drift.Race;

/// <summary>The race socket (only for the people who joined the race now) and the board of best times.</summary>
public static class RaceEndpoints
{
    public const string Path = "/api/play/race/ws", GuestPath = "/api/guest/race/ws";

    public static void MapRace(this WebApplication app)
    {
        var hub = app.Services.GetRequiredService<RaceHub>();
        var raceRelay = app.Services.GetRequiredKeyedService<WorldRelay>("race");
        var sockets = app.Services.GetRequiredService<PersonSockets>();
        async Task RaceSocket(HttpContext ctx)
        {
            var p = await PlayEndpoint.WhoAsync(ctx);
            if (!hub.CanRace(p.Id)) { ctx.Response.StatusCode = StatusCodes.Status409Conflict; return; }
            await RelayEndpoint.Serve(ctx, raceRelay, ctx.ClientIp(), p.Car, p.Name, p.Colour,
                stillValid: p.StillValid, checkEvery: PlayEndpoint.SessionCheck,
                joined: s => { sockets.Register(p.Id, true, raceRelay, s); hub.RaceConnected(p.Id, s); },
                left: s => { sockets.Unregister(p.Id, true, s); hub.RaceLeft(p.Id, s); },
                onText: (_, text) => hub.OnRaceText(p.Id, text));
        }
        app.Map(Path, async (HttpContext ctx) => await RaceSocket(ctx));
        app.Map(GuestPath, async (HttpContext ctx) => await RaceSocket(ctx));
        RelayEndpoint.RunTicker(raceRelay, app.Lifetime.ApplicationStopping);
        _ = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100));
            try { while (await timer.WaitForNextTickAsync(app.Lifetime.ApplicationStopping)) hub.Tick(); } catch (OperationCanceledException) { }
        });

        async Task<IResult> Board(RaceStore store, RaceTrack track, CancellationToken ct) => Results.Ok(new
        {
            map = track.Name, laps = track.Laps,
            lap = (await store.TopAsync(track.MapId, RaceStore.Lap, 5, ct)).Select(r => new { name = r.Name, ms = r.Ms, car = r.Car }),
            race = (await store.TopAsync(track.MapId, RaceStore.Race, 5, ct)).Select(r => new { name = r.Name, ms = r.Ms, car = r.Car }),
        });
        app.MapGet("/api/times", Board);
        app.MapGet("/api/guest/times", Board);   // read only, for guests
    }
}
