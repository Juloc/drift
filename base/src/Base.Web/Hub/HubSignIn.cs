using System.Security.Cryptography;
using System.Text;
using System.Web;
using Base.Accounts;
using Base.Core;
using Base.Web.Auth;

namespace Base.Web;

/// <summary>
/// "Sign in through the hub" (AUTH-13), the flow of the standard (OpenID Connect authorization code with PKCE S256) done strictly:
///  begin    state, nonce and verifier are made and stored, a cookie binds the flow to this browser, the person is sent to the hub;
///  complete the flow is taken (once), state and cookie must match, the code is exchanged, the ID token is checked (signature, issuer, audience, lifetime, nonce),
///           and then the app makes its OWN session. No token of the hub is kept anywhere;
///  logout   the back-channel logout of the hub ends the matching sessions (a signed token, seen once).
/// Failures go back to the page as a fixed code (<c>?hub_error=</c>) and are explained in the log, never to the person.
/// </summary>
public sealed class HubSignIn(HubSettingsStore settings, HubDirectory directory, HubTokens tokens, HubFlowStore flows, HubAccounts accounts, SessionCookie cookie,
    AppInfo app, HealthState health, RateLimit limit, ILogger<HubSignIn> log)
{
    public const string Scope = "openid profile";
    private const string Off = "hub.off";

    private string FlowCookie(bool https) => https ? $"__Host-{app.Id}_hubflow" : $"{app.Id}_hubflow";

    private static string RedirectUri(HttpContext ctx) => $"{ctx.Request.Scheme}://{ctx.Request.Host}{HubPaths.Callback}";

    private void Reach(bool fine) => health.Set("hub", !fine);

    // ---- begin: the page asks (POST), the answer is the address of the hub to go to ----

    public async Task<Result<string>> BeginAsync(HttpContext ctx)
    {
        if (!limit.Allow("hub-begin", ctx.ClientIp(), 20, out var wait)) return Error.TooMany(wait);
        var cfg = await settings.GetAsync(ctx.RequestAborted);
        if (!cfg.Active) return Error.Conflict(Off, "Sign-in through the hub is off.");
        // asked afresh every time (one small request): from memory a hub that went away would send the person to a dead address of the browser; asked, the button says so in words
        var meta = await directory.DiscoverAsync(cfg.Url!, ctx.RequestAborted, maxAge: TimeSpan.Zero);
        Reach(meta.Ok || meta.Error!.Code != "hub.unreachable");
        if (!meta.Ok) return meta.Error!;

        var state = Ids.Token(32); var nonce = Ids.Token(32); var verifier = Ids.Token(32); var browser = Ids.Token(32);
        var redirect = RedirectUri(ctx);
        await flows.CreateAsync(state, browser, nonce, verifier, redirect, ctx.RequestAborted);
        // Lax, not Strict: the hub sends the person back with a top-level GET from another site, and the cookie must come with it
        ctx.Response.Cookies.Append(FlowCookie(ctx.Request.IsHttps), browser, new CookieOptions
        {
            HttpOnly = true, Secure = ctx.Request.IsHttps, SameSite = SameSiteMode.Lax, Path = "/", MaxAge = HubFlowStore.Lifetime, IsEssential = true,
        });
        var challenge = Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var query = new Dictionary<string, string>
        {
            ["response_type"] = "code", ["client_id"] = cfg.ClientId!, ["redirect_uri"] = redirect, ["scope"] = Scope, ["state"] = state, ["nonce"] = nonce,
            ["code_challenge"] = challenge, ["code_challenge_method"] = "S256",
        };
        return meta.Value.AuthorizationEndpoint + "?" + string.Join('&', query.Select(kv => $"{kv.Key}={Uri.EscapeDataString(kv.Value)}"));
    }

    // ---- complete: the hub sends the person back here ----

    /// <summary>Returns where to send the browser: the app (signed in) or the app with an error code.</summary>
    public async Task<string> CompleteAsync(HttpContext ctx)
    {
        var ip = ctx.ClientIp();
        var q = ctx.Request.Query;
        string One(string key) => q[key].Count == 1 && q[key][0] is { Length: <= 1024 } v ? v : "";
        string state = One("state"), code = One("code"), error = One("error"), iss = One("iss");

        if (!limit.Allow("hub-callback", ip, 30, out _)) return Fail("hub.failed", "rate limit", ip);
        var cfg = await settings.GetAsync(ctx.RequestAborted);
        if (!cfg.Active) return Fail(Off, "switched off", ip);

        // the flow is used up by this look, whatever follows (a state works once)
        var flow = state.Length == 0 ? null : await flows.TakeAsync(state, ctx.RequestAborted);
        var browser = ctx.Request.Cookies[FlowCookie(ctx.Request.IsHttps)];
        ctx.Response.Cookies.Delete(FlowCookie(ctx.Request.IsHttps), new CookieOptions { Secure = ctx.Request.IsHttps, Path = "/", SameSite = SameSiteMode.Lax, HttpOnly = true });
        if (flow is null || string.IsNullOrEmpty(browser) || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(HubFlowStore.Hash(browser)), Encoding.ASCII.GetBytes(flow.BrowserHash)))
            return Fail("hub.state", "state unknown, used, expired, or the browser is not the one that began", ip);
        if (error.Length > 0) return Fail("hub.denied", "the hub answered error=" + Clean(error), ip);
        if (code.Length == 0) return Fail("hub.failed", "no code", ip);

        var meta = await directory.DiscoverAsync(cfg.Url!, ctx.RequestAborted);
        Reach(meta.Ok || meta.Error!.Code != "hub.unreachable");
        if (!meta.Ok) return Fail(meta.Error!.Code, meta.Error.Message, ip);
        // RFC 9207: a hub that says who answered must be the hub we asked
        if (iss.Length > 0 && iss.TrimEnd('/') != meta.Value.Issuer) return Fail("hub.failed", "the answer names another issuer", ip);

        var exchanged = await directory.ExchangeAsync(meta.Value, cfg.ClientId!, cfg.Secret!, code, flow.RedirectUri, flow.Verifier, ctx.RequestAborted);
        Reach(exchanged.Ok || exchanged.Error!.Code != "hub.unreachable");
        if (!exchanged.Ok) return Fail(exchanged.Error!.Code, exchanged.Error.Message, ip);

        var id = await tokens.ValidateIdTokenAsync(exchanged.Value, meta.Value, cfg.ClientId!, flow.Nonce, ctx.RequestAborted);
        if (!id.Ok) return Fail("hub.failed", id.Error!.Message, ip);

        var signedIn = await accounts.SignInAsync(new HubIdentity(id.Value.Sub, id.Value.Sid, id.Value.Name, id.Value.Role, exchanged.Value), ip, ctx.Request.Headers.UserAgent, ctx.RequestAborted);
        if (!signedIn.Ok) return Fail(signedIn.Error!.Code, signedIn.Error.Message, ip);
        cookie.Write(ctx, signedIn.Value.Token);
        return "/";
    }

    private static readonly HashSet<string> Shown = ["hub.off", "hub.state", "hub.denied", "hub.no_access", "hub.unreachable"];

    private string Fail(string code, string why, string ip)
    {
        if (!Shown.Contains(code)) code = "hub.failed";                 // the person sees one of a few fixed texts; the reason is in the log
        log.LogWarning("Central sign-in failed ({Code}) from {Ip}: {Why}", code, ip, why);
        return "/?hub_error=" + code;
    }

    private static string Clean(string s) => new([.. s.Where(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-').Take(40)]);

    // ---- back-channel logout ----

    public async Task<Result> LogoutAsync(HttpContext ctx)
    {
        if (!limit.Allow("hub-logout", ctx.ClientIp(), 60, out var wait)) return Error.TooMany(wait);
        if (!ctx.Request.HasFormContentType) return Error.Invalid("hub.token", "A form with logout_token is expected.");
        var form = await ctx.Request.ReadFormAsync(ctx.RequestAborted);
        if (form["logout_token"].Count != 1 || form["logout_token"][0] is not { Length: > 0 } jwt) return Error.Invalid("hub.token", "logout_token is missing.");

        // ending sessions is safe, so it also works while the sign-in is switched off, as long as the hub is known
        var cfg = await settings.GetAsync(ctx.RequestAborted);
        if (!cfg.Complete) return Error.Invalid("hub.token", "No hub is set up.");
        var meta = await directory.DiscoverAsync(cfg.Url!, ctx.RequestAborted);
        if (!meta.Ok) return meta.Error!;
        var token = await tokens.ValidateLogoutTokenAsync(jwt, meta.Value, cfg.ClientId!, ctx.RequestAborted);
        if (!token.Ok) { log.LogWarning("A logout token was refused: {Why}", token.Error!.Message); return Error.Invalid("hub.token", "The logout token is not valid."); }
        if (!await flows.RememberLogoutAsync(token.Value.Jti, token.Value.ExpiresAt, ctx.RequestAborted))
        {
            log.LogWarning("A logout token was presented twice and ignored");
            return Error.Invalid("hub.token", "The logout token was used before.");
        }
        await accounts.EndSessionsAsync(token.Value.Sid, token.Value.Sub, ctx.RequestAborted);
        return Result.Success;
    }

    /// <summary>The address to send a person to after signing out here, when they came through the hub (the hub then ends its own session and tells the other apps). Null otherwise.</summary>
    public async Task<string?> EndSessionUrlAsync(HttpContext ctx, string? idTokenHint, CancellationToken ct)
    {
        var cfg = await settings.GetAsync(ct);
        if (!cfg.Complete) return null;
        var meta = await directory.DiscoverAsync(cfg.Url!, ct);
        if (!meta.Ok || meta.Value.EndSessionEndpoint is not { } end) return null;
        var url = end + "?client_id=" + Uri.EscapeDataString(cfg.ClientId!);
        // with the hint the hub ends its session without asking and sends the person back to this app (it takes the address only with a valid hint, and only if it is registered)
        return idTokenHint is null ? url : url + "&id_token_hint=" + Uri.EscapeDataString(idTokenHint) + "&post_logout_redirect_uri=" + Uri.EscapeDataString($"{ctx.Request.Scheme}://{ctx.Request.Host}{HubPaths.SignedOut}");
    }
}
