using System.Text.RegularExpressions;
using Base.Accounts;
using Base.Core;
using Base.Web.Auth;

namespace Base.Web;

public sealed record HubSettingsDto(string? Url, string? ClientId, bool SecretSet, bool Enabled, string? Name);
public sealed record HubSettingsRequest(string? Url, string? ClientId, string? Secret, bool? Enabled);
public sealed record HubCheckDto(string Name, string Issuer, bool EndSession);
public sealed record HubBeginDto(string Url);

internal static partial class HubModule
{
    [GeneratedRegex("^[A-Za-z0-9._-]{1,100}$")]
    private static partial Regex ClientIdPattern();

    public static IServiceCollection AddBaseHub(this IServiceCollection services)
    {
        services.AddSingleton<HubSettingsStore>();
        services.AddSingleton(sp => new HubDirectory(sp.GetRequiredService<TimeProvider>()));
        services.AddSingleton<HubTokens>();
        services.AddSingleton<HubFlowStore>();
        services.AddSingleton<HubSignIn>();
        return services;
    }

    private static Error Field(string field, string code, string message) => new(ErrorKind.Invalid, code, message, new Dictionary<string, string> { [field] = code });

    public static void MapBaseHub(this IEndpointRouteBuilder app)
    {
        // ---- public: the three doors (each protects itself, see HubSignIn) ----
        app.MapPost(HubPaths.Begin, async (HttpContext ctx, HubSignIn hub) => (await hub.BeginAsync(ctx)).ToHttp(url => Results.Ok(new HubBeginDto(url))));

        // a GET that signs somebody in, because the hub sends the browser here: it is bound by the state and the cookie of the flow, and answers with a redirect only
        app.MapGet(HubPaths.Callback, async (HttpContext ctx, HubSignIn hub) => Results.Redirect(await hub.CompleteAsync(ctx)));

        app.MapPost(HubPaths.BackChannelLogout, async (HttpContext ctx, HubSignIn hub) =>
        {
            var done = await hub.LogoutAsync(ctx);
            return done.Ok ? Results.StatusCode(200) : done.Error!.ToHttp();
        });

        // ---- the settings, for the role admin ----
        var admin = app.MapGroup("/api/hub-settings").RequireRole(Roles.Admin);

        admin.MapGet("", async (HubSettingsStore settings, CancellationToken ct) => Dto(await settings.GetAsync(ct)));

        admin.MapPut("", async (HubSettingsRequest body, HttpContext ctx, HubSettingsStore settings, HubDirectory directory, AuditStore audit) =>
        {
            var current = await settings.GetAsync(ctx.RequestAborted);
            string? url = null, clientId = null;
            if (!string.IsNullOrWhiteSpace(body.Url) && (url = HubUrl.Normalize(body.Url)) is null) return Field("url", "hub.url", "The address must be https (http only for this machine), without path.").ToHttp();
            if (!string.IsNullOrWhiteSpace(body.ClientId) && !ClientIdPattern().IsMatch(clientId = body.ClientId.Trim())) return Field("clientId", "hub.client_id", "The client id has 1 to 100 characters of a-z, A-Z, 0-9, dot, dash, underscore.").ToHttp();
            string? secret = null;
            if (!string.IsNullOrEmpty(body.Secret) && (body.Secret.Length is < 8 or > 200 || body.Secret.Any(char.IsControl))) return Field("secret", "hub.secret", "The secret has 8 to 200 characters.").ToHttp();
            if (!string.IsNullOrEmpty(body.Secret)) secret = body.Secret;
            var enabled = body.Enabled ?? false;
            if (enabled && (url is null || clientId is null || (secret is null && current.Secret is null))) return Field("enabled", "hub.incomplete", "Address, client id and secret are needed before it can be switched on.").ToHttp();
            await settings.SaveAsync(url, clientId, secret, enabled, ctx.RequestAborted);
            directory.Forget();
            // the name for the button: asked once here (best effort), and again by "check"
            if (url is not null && url != current.Url) await settings.SetNameAsync(await directory.ReadNameAsync(url, ctx.RequestAborted), ctx.RequestAborted);
            await audit.AddAsync(ctx.Person().UserName, "hub.settings", ctx.ClientIp(), "enabled=" + enabled, ctx.RequestAborted);
            return Results.NoContent();
        });

        admin.MapDelete("", async (HttpContext ctx, HubSettingsStore settings, HubDirectory directory, AuditStore audit) =>
        {
            await settings.ClearAsync(ctx.RequestAborted);
            directory.Forget();
            await audit.AddAsync(ctx.Person().UserName, "hub.settings", ctx.ClientIp(), "removed", ctx.RequestAborted);
            return Results.NoContent();
        });

        // reads the description of the hub with the saved address and checks that its keys can be read; the name it gives itself is kept for the button
        admin.MapPost("/check", async (HttpContext ctx, HubSettingsStore settings, HubDirectory directory, HealthState health) =>
        {
            var cfg = await settings.GetAsync(ctx.RequestAborted);
            if (cfg.Url is null) return Error.Invalid("hub.not_configured", "Enter the address of the hub first.").ToHttp();
            directory.Forget();
            var meta = await directory.DiscoverAsync(cfg.Url, ctx.RequestAborted);
            health.Set("hub", !meta.Ok && meta.Error!.Code == "hub.unreachable");
            if (!meta.Ok) return meta.Error!.ToHttp();
            var keys = await directory.KeysAsync(meta.Value, refresh: false, ctx.RequestAborted);
            if (!keys.Ok) return keys.Error!.ToHttp();
            var name = await directory.ReadNameAsync(cfg.Url, ctx.RequestAborted);
            await settings.SetNameAsync(name, ctx.RequestAborted);
            return Results.Ok(new HubCheckDto(name ?? (cfg with { Name = null }).DisplayName, meta.Value.Issuer, meta.Value.EndSessionEndpoint is not null));
        });
    }

    public static HubSettingsDto Dto(HubConfig c) => new(c.Url, c.ClientId, c.Secret is not null, c.Enabled, c.Name);
}
