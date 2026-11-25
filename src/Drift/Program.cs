using Base.Accounts;
using Base.Core;
using Base.Data;
using Base.Web;
using Base.Web.Settings;
using Drift.Garage;
using Drift.Play;
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
app.Run();
return 0;

public partial class Program;
