// A tiny local server for trying the shared world: it serves the repository's files and the relay on /ws.
// Not the product's server (that is the base, milestone 2); the website takes WorldRelay.cs and RelayEndpoint.cs.
// Usage: dotnet run --project server -- [--port 8150] [--root <repository folder>] [--stats] [--test-limits]
using Drift.Relay;
using Microsoft.Extensions.FileProviders;

var argv = args.ToList();
string Opt(string name, string fallback) { var i = argv.IndexOf(name); return i >= 0 && i + 1 < argv.Count ? argv[i + 1] : fallback; }
var root = Opt("--root", "");
if (root == "") { var d = new DirectoryInfo(Directory.GetCurrentDirectory()); while (d is not null && !Directory.Exists(Path.Combine(d.FullName, "game"))) d = d.Parent; root = d?.FullName ?? Directory.GetCurrentDirectory(); }
var port = int.Parse(Opt("--port", "8150"));

var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
builder.Logging.SetMinimumLevel(LogLevel.Warning);
var app = builder.Build();
// --test-limits lifts the per-address limits (a load test comes from one address)
var relay = new WorldRelay(TimeProvider.System, argv.Contains("--test-limits") ? new RelayOptions { MaxPerAddress = 999, JoinsPerMinutePerAddress = 9999, FramesPerSecondPerAddress = 99999, MaxWorlds = 8 } : null);
RelayEndpoint.Map(app, relay, "/ws");
if (argv.Contains("--stats"))
    app.MapGet("/relay-stats", () => new { relay.Stats.Visitors, relay.Stats.Worlds, relay.Stats.BytesIn, relay.Stats.BytesOut, relay.Stats.FramesIn, relay.Stats.FramesOut, relay.Stats.Accepted, relay.Stats.Rejected, relay.Stats.Ticks, tickMicroseconds = relay.Stats.Ticks == 0 ? 0 : relay.Stats.TickTicks * 1e6 / System.Diagnostics.Stopwatch.Frequency / relay.Stats.Ticks });
app.MapGet("/", () => Results.Redirect("/game/demo.html"));
app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(root), ServeUnknownFileTypes = false });
Console.WriteLine($"serving {root} on http://127.0.0.1:{port}/ (demo: /game/demo.html)");
app.Run();
