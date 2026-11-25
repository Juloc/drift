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
            var m = hub.Member(p.Id);   // the car, name and colour the person came to the lobby with: the same in the race and in the result
            await RelayEndpoint.Serve(ctx, raceRelay, ctx.ClientIp(), m?.Car ?? p.Car, m?.Name ?? p.Name, m?.Hue ?? p.Colour,
                stillValid: p.StillValid, checkEvery: PlayEndpoint.SessionCheck,
                joined: s => { if (hub.RaceConnected(p.Id, s)) sockets.Register(p.Id, true, raceRelay, s); },
                left: s => { sockets.Unregister(p.Id, true, s); hub.RaceLeft(p.Id, s); },
                onText: (_, text) => hub.OnRaceText(p.Id, text));
        }
        app.Map(Path, async (HttpContext ctx) => await RaceSocket(ctx));
        app.Map(GuestPath, async (HttpContext ctx) => await RaceSocket(ctx));
        RelayEndpoint.RunTicker(raceRelay, app.Lifetime.ApplicationStopping, app.Logger);
        _ = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100));
            var errors = 0;
            try
            {
                while (await timer.WaitForNextTickAsync(app.Lifetime.ApplicationStopping))
                {
                    try { hub.Tick(); }
                    catch (Exception e) when (e is not OperationCanceledException) { if (++errors == 1 || errors % 150 == 0) app.Logger.LogError(e, "race tick failed ({Count} so far)", errors); }   // the next tick runs as usual
                }
            }
            catch (OperationCanceledException) { }
        });

        async Task<IResult> Board(int? map, RaceStore store, IReadOnlyDictionary<int, RaceTrack> tracks, CancellationToken ct)
        {
            var track = tracks.TryGetValue(map ?? 0, out var t) ? t : tracks[tracks.Keys.Min()];
            return Results.Ok(new
        {
            map = track.Name, mapId = track.MapId, laps = track.Laps, maps = tracks.Values.OrderBy(x => x.MapId).Select(x => new { id = x.MapId, name = x.Name }),
            lap = (await store.TopAsync(track.MapId, RaceStore.Lap, 5, ct)).Select(r => new { name = r.Name, ms = r.Ms, car = r.Car }),
            race = (await store.TopAsync(track.MapId, RaceStore.Race, 5, ct)).Select(r => new { name = r.Name, ms = r.Ms, car = r.Car }),
            });
        }
        app.MapGet("/api/times", Board);
        app.MapGet("/api/guest/times", Board);   // read only, for guests
    }
}
