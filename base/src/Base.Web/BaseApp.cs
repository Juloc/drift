using System.Text.Json.Serialization;
using Base.Accounts;
using Base.Data;
using Base.Web.Auth;
using Base.Web.Settings;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Npgsql;

namespace Base.Web;

/// <summary>
/// The four calls that turn a plain ASP.NET Core program into an app of the family: <see cref="AddBase"/> (services), <see cref="StartBaseAsync"/>
/// (database and first-setup code), <see cref="UseBase"/> (headers, the look, the guard), <see cref="MapBase"/> (health, sign-in, settings).
/// The app adds only what is its own. Configuration from outside is small on purpose (OPS-02, OPS-03):
///   BASE_DB                 connection to PostgreSQL (required)
///   BASE_DB_PASSWORD_FILE   file with the database password (the Compose file of every app uses it)
///   BASE_DATA               folder for the server's own key file (default: data)
/// Everything else is a setting in the app. Only for tests and for working on the look: BASE_SECRET_KEY, BASE_SETUP_CODE (fixed values instead of
/// generated ones) and BASE_UI_DIR (serve ui/ from disk).
/// </summary>
public static class BaseApp
{
    public static AppInfo AddBase(this WebApplicationBuilder builder, BaseAppOptions options)
    {
        var cfg = builder.Configuration;
        var services = builder.Services;
        builder.WebHost.ConfigureKestrel(o => o.AddServerHeader = false);
        // not every request in the log (only warnings and errors of the framework); our own lines such as sign-ins stay visible
        builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);

        var connection = cfg["BASE_DB"] ?? throw new InvalidOperationException("BASE_DB is missing (the connection to PostgreSQL, see docker-compose.yml).");
        var info = AppInfo.From(options);
        Describe.Check(options);
        ApiDoor.Validate(options.Doors, [.. ApiGuard.BasePublicPaths, .. options.PublicPaths, .. options.LargeBodyPaths]);
        services.AddSingleton(options);
        services.AddSingleton(info);
        services.AddSingleton(_ => Database.Create(connection, cfg["BASE_DB_PASSWORD_FILE"]));
        services.AddSingleton(sp => new Migrator(sp.GetRequiredService<NpgsqlDataSource>(), [AccountsModule.Migrations, Migrations, .. options.Migrations], options.MigrationTable));
        services.AddSingleton(TimeProvider.System);
        services.AddBaseAccounts(options.Name, SecretBox.ResolveKey(cfg["BASE_SECRET_KEY"], cfg["BASE_DATA"] ?? "data"), cfg["BASE_SETUP_CODE"], options.Roles);
        services.AddSingleton<HealthState>();
        services.AddSingleton<RateLimit>();
        services.AddBaseHub();
        services.AddSingleton(new SettingRules([.. SettingRules.OfTheBase, .. options.Settings]));
        services.AddSingleton<SettingsStore>();
        services.AddSingleton<ProxyTrust>();
        services.AddSingleton<SessionCookie>();
        services.AddSingleton<UiFiles>();
        services.ConfigureHttpJsonOptions(o =>
        {
            o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
            o.SerializerOptions.TypeInfoResolverChain.Insert(0, WebJson.Default);
        });
        // The middleware itself believes any address, but only requests from a trusted proxy reach it at all (UseWhen in UseBase, ProxyTrust).
        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
            o.ForwardLimit = 1;
            o.KnownProxies.Clear();
            o.KnownIPNetworks.Clear();
            o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse("0.0.0.0/0"));
            o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse("::/0"));
        });
        return info;
    }

    /// <summary>The numbered SQL scripts of this module (the settings tables).</summary>
    public static MigrationSet Migrations => MigrationSet.FromAssembly(typeof(BaseApp).Assembly, "web");

    /// <summary>Brings the database up to date, loads the instance settings the server itself needs and, while there is no account, writes the setup code to the log.</summary>
    public static async Task StartBaseAsync(this WebApplication app)
    {
        var log = app.Logger;
        var info = app.Services.GetRequiredService<AppInfo>();
        log.LogInformation("{Name} {Version} (base {Base})", info.Name, info.Version, info.BaseVersion);
        await Database.MigrateWithRetryAsync(app.Services.GetRequiredService<Migrator>(), log);

        var proxies = app.Services.GetRequiredService<ProxyTrust>();
        (await app.Services.GetRequiredService<SettingsStore>().GetInstanceAsync()).TryGetValue(ProxyTrust.SettingKey, out var trusted);
        proxies.Apply(trusted);
        if (proxies.Unset)
            log.LogInformation("Trusted proxies are not set: X-Forwarded-* is believed from every private network. Behind a reverse proxy, restrict it in the app (Settings, Installation).");

        if (await app.Services.GetRequiredService<AccountService>().SetupNeededAsync())
            log.LogWarning("FIRST SETUP: there is no account yet. Open the page in a browser and enter this setup code: {Code}", app.Services.GetRequiredService<SetupCode>().Value);
    }

    /// <summary>The middleware of every app, in the order that matters: proxy headers, error boundary, security headers, the look, the app's own files, the guard of /api.</summary>
    public static void UseBase(this WebApplication app)
    {
        var proxies = app.Services.GetRequiredService<ProxyTrust>();
        app.UseWhen(ctx => proxies.IsTrusted(ctx.Connection.RemoteIpAddress), branch => branch.UseForwardedHeaders());
        app.UseMiddleware<ErrorBoundary>();
        app.Use((ctx, next) => { SecurityHeaders.Apply(ctx); return next(ctx); });

        // While working on the look itself: BASE_UI_DIR points at the folder ui/ and files are read from disk, without a rebuild
        if (app.Configuration["BASE_UI_DIR"] is { Length: > 0 } uiDir && Directory.Exists(uiDir))
            app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(Path.GetFullPath(uiDir)), RequestPath = UiFiles.RequestPath, OnPrepareResponse = NoCache });
        var ui = app.Services.GetRequiredService<UiFiles>();
        app.Use(async (ctx, next) => { if (!await ui.TryServeAsync(ctx)) await next(ctx); });

        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = NoCache });
        app.UseMiddleware<ApiGuard>();
    }

    // the browser asks at every start whether a file changed (ETag), so an update arrives at once
    private static void NoCache(Microsoft.AspNetCore.StaticFiles.StaticFileResponseContext c) => c.Context.Response.Headers.CacheControl = "no-cache";

    /// <summary>The endpoints of every app: health with version, setup, sign-in, account, settings.</summary>
    public static void MapBase(this WebApplication app)
    {
        var info = app.Services.GetRequiredService<AppInfo>();
        var options = app.Services.GetRequiredService<BaseAppOptions>();
        app.MapGet("/api/health", async (NpgsqlDataSource data, HealthState state, TimeProvider clock, CancellationToken ct) =>
        {
            var dbOk = false;
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeout.CancelAfter(TimeSpan.FromSeconds(2));
                dbOk = await data.ScalarAsync<int>("select 1", timeout.Token) == 1;
            }
            catch (Exception) { /* database not reachable: ok = false */ }
            var status = !dbOk ? "down" : state.Degraded ? "degraded" : "ok";
            return Results.Json(new Health(dbOk, dbOk, info.Id, info.Version, info.BaseVersion, status, AppInfo.ContractVersion, clock.GetUtcNow()), statusCode: dbOk ? 200 : 503);
        });
        app.MapAbout(info, options);
        app.MapBasePeople();
        app.MapBaseHub();
        app.MapBaseAuth();
        app.MapBaseSettings();
    }

    /// <summary>
    /// The health check of the container: <c>dotnet App.dll health</c> asks the running server (the runtime image has no curl).
    /// Returns null when the arguments are not this command, else the exit code.
    /// </summary>
    public static async Task<int?> RunCommandAsync(string[] args)
    {
        if (args is not ["health", ..]) return null;
        var port = (Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") ?? "8080").Split(';')[0];
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            using var response = await http.GetAsync($"http://127.0.0.1:{port}/api/health");
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return 1; }
    }
}
