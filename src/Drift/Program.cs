using Base.Accounts;
using Drift;
using Base.Core;
using Base.Data;
using Base.Web;
using Base.Web.Settings;
using Drift.GameAccounts;
using Drift.Garage;
using Drift.Guests;
using Drift.Play;
using Drift.Race;
using Drift.Relay;
using Microsoft.Extensions.FileProviders;

// The health check of the container: dotnet Drift.dll health
if (await BaseApp.RunCommandAsync(args) is { } exitCode) return exitCode;

var builder = WebApplication.CreateSlimBuilder(args);
// The one place where the app says what it is (read by /api/about, the sign-in pages and the people management).
builder.AddBase(new BaseAppOptions("drift", "Drift", typeof(Program).Assembly)
{
    Description = new Localized("A small drift racing game: drive around the open lobby with the others who are there.", "Ein kleines Drift-Rennspiel: fahr in der offenen Lobby mit allen, die gerade da sind."),
    Icon = "bolt",
    AccentHue = 350,                                  // the same number as --accent-hue in wwwroot/app.css
    Start = "/",
    Roles =
    [
        new AppRole("admin", new Localized("Administrator", "Administration")),
        new AppRole("member", new Localized("Driver", "Fahrer")),
    ],
    // guests: an own door (SEC-07): the check admits a live guest session, and the join path (which checks the link's secret itself)
    Doors = [new ApiDoor("/api/guest", GuestEndpoints.Check, 4096), new ApiDoor(GameAccountEndpoints.Prefix, GameAccountEndpoints.Check, 4096)],
    Migrations = [MigrationSet.FromAssembly(typeof(Program).Assembly, "app")],
});
builder.Services.AddSingleton<GarageStore>();
builder.Services.AddSingleton<GuestService>();
// the Juloc Games account: a module of its own (Drift.GameAccounts); the game plugs in through three small interfaces
builder.Services.AddSingleton<GameAccountService>();
builder.Services.AddSingleton(sp => new SignupGuard(sp.GetRequiredService<Npgsql.NpgsqlDataSource>(), TimeProvider.System));
builder.Services.AddSingleton<HashGate>();
builder.Services.AddSingleton<Bans>();
builder.Services.AddSingleton(sp => new LegalPages(sp.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>().WebRootFileProvider, sp.GetRequiredService<ILoggerFactory>().CreateLogger<LegalPages>()));
builder.Services.AddSingleton(sp => new Reports(sp.GetRequiredService<Npgsql.NpgsqlDataSource>(), sp.GetServices<IPlayerDirectory>(), TimeProvider.System));
builder.Services.AddSingleton<Owners>();
builder.Services.AddSingleton<IAccountData>(sp => sp.GetRequiredService<Owners>());
builder.Services.AddSingleton<IAccountEvents>(sp => sp.GetRequiredService<Owners>());
builder.Services.AddSingleton<IPlayerDirectory>(sp => sp.GetRequiredService<Owners>());
builder.Services.AddSingleton<IDisplayNames>(sp => sp.GetRequiredService<Owners>());
builder.Services.AddSingleton<TuningStore>();
builder.Services.AddSingleton<StatsStore>();
builder.Services.AddSingleton(sp => new StatsTracker(sp.GetRequiredService<StatsStore>(), TimeProvider.System));
builder.Services.AddSingleton<PersonSockets>();
builder.Services.AddSingleton<SessionLife>();
builder.Services.AddSingleton(new WorldRelay(TimeProvider.System, PlayEndpoint.Options));
// the race has a world of its own (at most 8 racers), the same relay class
builder.Services.AddKeyedSingleton("race", (_, _) => new WorldRelay(TimeProvider.System, new RelayOptions { MaxPerWorld = RaceHub.MaxRacers, MaxWorlds = 1, MaxPerAddress = 16, JoinsPerMinutePerAddress = 120, FramesPerSecondPerAddress = 400 }));
builder.Services.AddSingleton<RaceStore>();
builder.Services.AddSingleton(sp => new TandemTracker(sp.GetRequiredService<RaceStore>()));
builder.Services.AddSingleton<IReadOnlyDictionary<int, RaceTrack>>(LoadTracks());
builder.Services.AddSingleton(sp => new RaceHub(TimeProvider.System, sp.GetRequiredService<IReadOnlyDictionary<int, RaceTrack>>(), sp.GetRequiredService<RaceStore>(), sp.GetRequiredKeyedService<WorldRelay>("race"), [35, 31, 39, 36, 28]).WithStats(sp.GetRequiredService<StatsStore>()));

var app = builder.Build();
await app.StartBaseAsync();
NameFilter.LoadFile(Path.Combine(AppContext.BaseDirectory, "games-names.txt"));   // the administrator's extra words (optional)
await app.Services.GetRequiredService<Owners>().SweepAsync();
app.Services.GetRequiredService<LegalPages>().WarnIfOpen();
app.UseBase();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
// the game page's files: next to the app when published, in the repository when run from source (they are not in wwwroot)
static string? Find(string folder)
{
    var beside = Path.Combine(AppContext.BaseDirectory, folder);
    if (Directory.Exists(beside)) return beside;
    for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
        if (Directory.Exists(Path.Combine(d.FullName, folder)) && Directory.Exists(Path.Combine(d.FullName, "base"))) return Path.Combine(d.FullName, folder);
    return null;
}
// the car models are .glb files, a type the static file server does not know
var mime = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
mime.Mappings[".glb"] = "model/gltf-binary";
void Serve(string path, string folder)
{
    if (Find(folder) is { } dir)
        app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(dir), RequestPath = path, ContentTypeProvider = mime, OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache" });
}
Serve("/play", "game");
Serve("/vendor/three", Path.Combine("vendor", "three"));
app.MapBase();
app.MapGarage();
app.MapTuning();
app.MapPlay();
{ var t0 = app.Services.GetRequiredService<IReadOnlyDictionary<int, RaceTrack>>()[0]; app.Services.GetRequiredService<WorldRelay>().SetGeometry(t0.Segments, t0.Obstacles); }   // the lobby is the car park: its walls count for the checks
app.MapGuests();
app.MapGameAccounts();
app.MapGameAdmin();
app.MapReports();
app.MapRace();
app.MapStats();
{ var tr = app.Services.GetRequiredService<StatsTracker>(); tr.Follow(app.Services.GetRequiredService<WorldRelay>()); tr.Follow(app.Services.GetRequiredKeyedService<WorldRelay>("race")); }
app.Run();
return 0;

static Dictionary<int, RaceTrack> LoadTracks()
{
    // the map files the browser draws are the ones the server reads: next to the app when published, in the repository when run from source
    var dir = Path.Combine(AppContext.BaseDirectory, "game", "data");
    if (!Directory.Exists(dir))
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null && !Directory.Exists(dir); d = d.Parent) dir = Path.Combine(d.FullName, "game", "data");
    using var list = System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, "maps.json")));
    var tracks = new Dictionary<int, RaceTrack>();
    foreach (var m in list.RootElement.GetProperty("maps").EnumerateArray())
    {
        var t = RaceTrack.FromJson(File.ReadAllText(Path.Combine(dir, "maps", m.GetProperty("file").GetString()!)));
        tracks[t.MapId] = t;
    }
    return tracks;
}

public partial class Program;
