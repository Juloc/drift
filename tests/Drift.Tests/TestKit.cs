using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Base.Accounts;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;

namespace Drift.Tests;

/// <summary>An own schema per test in the test database (BASE_TEST_DB; scripts/test.sh starts a throwaway PostgreSQL). Without it the database tests are skipped.</summary>
internal sealed class TestDb : IAsyncDisposable
{
    public static string? Admin => Environment.GetEnvironmentVariable("BASE_TEST_DB");
    private readonly string _schema = "t_" + Guid.NewGuid().ToString("N");
    public string ConnectionString { get; private set; } = "";
    public NpgsqlDataSource Data { get; private set; } = null!;

    public static async Task<TestDb> CreateAsync()
    {
        Assert.SkipWhen(Admin is null, "BASE_TEST_DB is not set (use scripts/test.sh)");
        var t = new TestDb();
        await using (var admin = NpgsqlDataSource.Create(Admin!))
            await using (var cmd = admin.CreateCommand($"create schema {t._schema}")) await cmd.ExecuteNonQueryAsync();
        t.ConnectionString = new NpgsqlConnectionStringBuilder(Admin!) { SearchPath = t._schema, MaxPoolSize = 20, ConnectionIdleLifetime = 15 }.ConnectionString;
        t.Data = NpgsqlDataSource.Create(t.ConnectionString);
        return t;
    }

    public async ValueTask DisposeAsync()
    {
        await Data.DisposeAsync();
        await using var admin = NpgsqlDataSource.Create(Admin!);
        await using var cmd = admin.CreateCommand($"drop schema {_schema} cascade");
        await cmd.ExecuteNonQueryAsync();
    }
}

/// <summary>The app in memory over a test schema; the app runs its own migrations (base and drift) at start.</summary>
internal sealed class TestApp(TestDb db) : WebApplicationFactory<Program>
{
    public const string SetupCode = "TEST-CODE-0000", Password = "correct horse battery";
    public static readonly string Key = Convert.ToBase64String(Enumerable.Repeat((byte)7, 32).ToArray());
    public string Origin => "http://localhost";

    public HttpClient Http() => CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false, BaseAddress = new Uri(Origin) });

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("BASE_DB", db.ConnectionString);
        builder.UseSetting("BASE_SETUP_CODE", SetupCode);
        builder.UseSetting("BASE_SECRET_KEY", Key);
        builder.ConfigureServices(s => s.AddTransient<IStartupFilter, LoopbackFilter>());
    }

    private sealed class LoopbackFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((ctx, n) => { ctx.Connection.RemoteIpAddress ??= IPAddress.Loopback; return n(ctx); });
            next(app);
        };
    }

    /// <summary>A request as the app's own page sends it: with the custom header and the matching origin on everything that changes something.</summary>
    public HttpRequestMessage Req(HttpMethod method, string url, string? cookie = null, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        if (body is not null) req.Content = JsonContent.Create(body);
        if (method != HttpMethod.Get) { req.Headers.Add("X-Base", "1"); req.Headers.Add("Origin", Origin); }
        if (cookie is not null) req.Headers.Add("Cookie", cookie);
        return req;
    }

    public static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();
    public static string CookieOf(HttpResponseMessage r) => r.Headers.GetValues("Set-Cookie").First().Split(';')[0];

    /// <summary>Runs the setup assistant over HTTP (the first account, an administrator) and returns the session cookie.</summary>
    public async Task<string> SignedInAsync(HttpClient c, string user = "jul")
    {
        var begin = await c.SendAsync(Req(HttpMethod.Post, "/api/setup/begin", null, new { code = SetupCode, user, password = Password }));
        Assert.Equal(HttpStatusCode.OK, begin.StatusCode);
        var secret = (await Json(begin)).GetProperty("secret").GetString()!;
        var totp = Totp.Hotp(Base32.Decode(secret), DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30);
        var finish = await c.SendAsync(Req(HttpMethod.Post, "/api/setup/finish", null, new { code = SetupCode, user, totp }));
        Assert.Equal(HttpStatusCode.OK, finish.StatusCode);
        return CookieOf(finish);
    }
}
