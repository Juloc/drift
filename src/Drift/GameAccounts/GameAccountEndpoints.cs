using Base.Core;
using Base.Web;
using Base.Web.Auth;

namespace Drift.GameAccounts;

public sealed record SignUpRequest(string? Name, string? Password, string? Challenge, string? Nonce);
public sealed record LoginRequest(string? Name, string? Password);
public sealed record PasswordRequest(string? Current, string? Next);
public sealed record PasswordOnly(string? Password);

/// <summary>
/// The games account's door <c>/api/games</c> (SEC-07): everything under it is let in by <see cref="Check"/>, which looks only at the games cookie and never at the
/// base session. Sign-up, sign-in and the challenge are public (each protects itself); every other path needs a live games session; a changing request must come
/// from the app's own page (header and origin, SEC-04), which the guard does not check on a door, so it is checked here. The module knows the game only through
/// <see cref="IAccountData"/> and <see cref="IAccountEvents"/>.
/// </summary>
public static class GameAccountEndpoints
{
    public const string Key = "drift.games", Prefix = "/api/games";
    public static readonly string[] PublicPaths = [Prefix + "/challenge", Prefix + "/signup", Prefix + "/login"];
    /// <summary>What an account that must choose a new password (after a reset) may still reach.</summary>
    static readonly string[] WhileMustChange = [Prefix + "/me", Prefix + "/password", Prefix + "/logout"];

    public static string CookieName(HttpRequest r) => r.IsHttps ? "__Host-games" : "games";

    public static bool OwnPage(HttpRequest r) =>
        r.Headers[ApiGuardHeader] == "1" && Uri.TryCreate(r.Headers.Origin.ToString(), UriKind.Absolute, out var u) && string.Equals(u.Authority, r.Host.Value, StringComparison.OrdinalIgnoreCase);
    const string ApiGuardHeader = "X-Base";

    public static async ValueTask<bool> Check(HttpContext ctx)
    {
        var path = ctx.Request.Path.Value ?? "";
        var changing = !HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method);
        if (changing && !OwnPage(ctx.Request)) return false;
        if (PublicPaths.Contains(path, StringComparer.OrdinalIgnoreCase)) return true;
        if (ctx.Request.Cookies[CookieName(ctx.Request)] is not { Length: > 0 and < 100 } cookie) return false;
        if (await ctx.RequestServices.GetRequiredService<GameAccountService>().ValidateAsync(cookie, ctx.RequestAborted) is not { } who) return false;
        if (who.MustChange && !WhileMustChange.Contains(path, StringComparer.OrdinalIgnoreCase)) return false;
        ctx.Items[Key] = who;
        return true;
    }

    public static GameIdentity GameAccount(this HttpContext ctx) => ctx.Items[Key] as GameIdentity ?? throw new InvalidOperationException("Not behind the games door.");
    public static bool IsGameAccount(this HttpContext ctx) => ctx.Items.ContainsKey(Key);

    static void SetCookie(HttpContext ctx, string value) =>
        ctx.Response.Cookies.Append(CookieName(ctx.Request), value, new CookieOptions { HttpOnly = true, Secure = ctx.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/", Expires = DateTimeOffset.UtcNow.AddDays(90), IsEssential = true });

    static IResult Fields(string field, string code) => new Error(ErrorKind.Invalid, "invalid", "Some fields are not valid.", new Dictionary<string, string> { [field] = code }).ToHttp();

    public static void MapGameAccounts(this WebApplication app)
    {
        app.MapPost(Prefix + "/signup", async (SignUpRequest body, HttpContext ctx, GameAccountService accounts, SignupGuard guard, Bans bans, LegalPages legal) =>
        {
            if (!legal.Complete) return Error.Forbidden("games.signup_closed", "Sign-up is not open yet.").ToHttp();
            if (await bans.BannedAsync(ctx.ClientIp(), ctx.RequestAborted)) return Error.Forbidden("games.banned", "This address is blocked for now.").ToHttp();
            var name = (body.Name ?? "").Trim();
            if (NameRules.Problem(name) is { } np) return Fields("name", np);
            if (await guard.CheckAsync(ctx.ClientIp(), name, body.Challenge, body.Nonce, ctx.RequestAborted) is { } refused) return refused.ToHttp();
            var made = await accounts.SignUpAsync(name, body.Password ?? "", ctx.RequestAborted);
            if (!made.Ok) return made.Error!.ToHttp();
            await guard.CountAsync(ctx.ClientIp(), ctx.RequestAborted);
            SetCookie(ctx, made.Value.Cookie);
            return Results.Ok(new { name = made.Value.Who.Name });
        });

        app.MapPost(Prefix + "/login", async (LoginRequest body, HttpContext ctx, GameAccountService accounts, Bans bans) =>
        {
            if (await bans.BannedAsync(ctx.ClientIp(), ctx.RequestAborted)) return Error.Forbidden("games.banned", "This address is blocked for now.").ToHttp();
            var made = await accounts.LoginAsync((body.Name ?? "").Trim(), body.Password ?? "", ctx.ClientIp(), ctx.RequestAborted);
            if (!made.Ok) return made.Error!.ToHttp();
            SetCookie(ctx, made.Value.Cookie);
            return Results.Ok(new { name = made.Value.Who.Name, mustChange = made.Value.Who.MustChange });
        });

        app.MapGet(Prefix + "/me", (HttpContext ctx) => { var w = ctx.GameAccount(); return Results.Ok(new { name = w.Name, mustChange = w.MustChange }); });

        app.MapPost(Prefix + "/logout", async (HttpContext ctx, GameAccountService accounts) =>
        {
            await accounts.EndSessionAsync(ctx.GameAccount().SessionId, ctx.RequestAborted);
            ctx.Response.Cookies.Delete(CookieName(ctx.Request));
            return Results.NoContent();
        });

        app.MapPost(Prefix + "/password", async (PasswordRequest body, HttpContext ctx, GameAccountService accounts) =>
            (await accounts.ChangePasswordAsync(ctx.GameAccount(), body.Current, body.Next, ctx.ClientIp(), ctx.RequestAborted)).ToHttp());

        app.MapPost(Prefix + "/delete", async (PasswordOnly body, HttpContext ctx, GameAccountService accounts) =>
        {
            var r = await accounts.DeleteOwnAsync(ctx.GameAccount(), body.Password, ctx.ClientIp(), ctx.RequestAborted);
            if (!r.Ok) return r.ToHttp();
            ctx.Response.Cookies.Delete(CookieName(ctx.Request));
            return Results.NoContent();
        });

        app.MapGet(Prefix + "/export", async (HttpContext ctx, GameAccountService accounts) =>
        {
            var all = await accounts.ExportAsync(ctx.GameAccount(), ctx.RequestAborted);
            ctx.Response.Headers.ContentDisposition = "attachment; filename=\"my-games-data.json\"";
            return Results.Json(all);
        });

        app.MapGet(Prefix + "/challenge", (HttpContext ctx, SignupGuard guard, LegalPages legal) => Results.Ok(new { open = legal.Complete, challenge = guard.Challenge(ctx.ClientIp()) }));
    }
}
