using Base.Accounts;
using Base.Core;
using Base.Data;
using Base.Web;
using Base.Web.Settings;
using Drift.Garage;
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
    Migrations = [MigrationSet.FromAssembly(typeof(Program).Assembly, "app")],
});
builder.Services.AddSingleton<GarageStore>();
builder.Services.AddSingleton(new WorldRelay(TimeProvider.System, PlayEndpoint.Options));
// the race has a world of its own (at most 8 racers), the same relay class
builder.Services.AddKeyedSingleton("race", (_, _) => new WorldRelay(TimeProvider.System, new RelayOptions { MaxPerWorld = RaceHub.MaxRacers, MaxWorlds = 1, MaxPerAddress = 16, JoinsPerMinutePerAddress = 120, FramesPerSecondPerAddress = 400 }));
builder.Services.AddSingleton<RaceStore>();
builder.Services.AddSingleton(RaceTrack.FromJson(File.ReadAllText(MapFile())));
builder.Services.AddSingleton(sp => new RaceHub(TimeProvider.System, sp.GetRequiredService<RaceTrack>(), sp.GetRequiredService<RaceStore>(), sp.GetRequiredKeyedService<WorldRelay>("race"), [35, 31, 39, 36, 28]));

var app = builder.Build();
await app.StartBaseAsync();
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
void Serve(string path, string folder)
{
    if (Find(folder) is { } dir)
        app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(dir), RequestPath = path, OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache" });
}
Serve("/play", "game");
Serve("/vendor/three", Path.Combine("vendor", "three"));
app.MapBase();
app.MapGarage();
app.MapPlay();
app.MapRace();
app.Run();
return 0;

static string MapFile()
{
    // the map file the browser draws is the one the server reads: next to the app when published, in the repository when run from source
    const string rel = "data/maps/01-car-park.json";
    var beside = Path.Combine(AppContext.BaseDirectory, "game", rel);
    if (File.Exists(beside)) return beside;
    for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
        if (File.Exists(Path.Combine(d.FullName, "game", rel))) return Path.Combine(d.FullName, "game", rel);
    throw new FileNotFoundException(rel);
}

public partial class Program;
