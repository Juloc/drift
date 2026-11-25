using Base.Accounts;
using Base.Core;

namespace Base.Web.Auth;

/// <summary>The setup assistant, sign-in and the account of the signed-in person, the same in every app.</summary>
internal static class AuthEndpoints
{
    public static void MapBaseAuth(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/setup/status", async (AccountService accounts, CancellationToken ct) => new SetupStatus(await accounts.SetupNeededAsync(ct)));

        app.MapPost("/api/setup/begin", async (SetupBeginRequest body, HttpContext ctx, AccountService accounts) =>
            (await accounts.BeginSetupAsync(body.Code, body.User, body.Password, ctx.ClientIp(), ctx.RequestAborted))
                .ToHttp(s => Results.Ok(new SetupBeginResponse(s.Secret, s.Uri, s.Recovery))));

        app.MapPost("/api/setup/finish", async (SetupFinishRequest body, HttpContext ctx, AccountService accounts, SessionCookie cookie) =>
            (await accounts.FinishSetupAsync(body.Code, body.User, body.Totp, ctx.ClientIp(), ctx.Request.Headers.UserAgent, ctx.RequestAborted))
                .ToHttp(s => SignIn(ctx, cookie, s)));

        // public: the page asks this first to decide between setup, sign-in and the app itself
        app.MapGet("/api/auth/me", async (HttpContext ctx, AccountService accounts, SessionCookie cookie, AppInfo info, AppRoles roles, HubSettingsStore hubSettings) =>
        {
            var identity = await ApiGuard.ResolveAsync(ctx, accounts, cookie, rotate: true);
            var setupNeeded = identity is null && await accounts.SetupNeededAsync(ctx.RequestAborted);
            // the button "Sign in with ..." is offered only to somebody who is not signed in, and only while it is switched on
            var hub = identity is null && !setupNeeded && await hubSettings.GetAsync(ctx.RequestAborted) is { Active: true } cfg ? new HubOffer(cfg.DisplayName) : null;
            return new MeResponse(identity?.UserName, identity?.Roles, setupNeeded, new AppDto(info.Id, info.Name, info.Version, info.Commit, info.BaseVersion), [.. roles.All], identity?.ViaHub ?? false, hub);
        });

        app.MapPost("/api/auth/login", async (LoginRequest body, HttpContext ctx, AccountService accounts, SessionCookie cookie) =>
            (await accounts.LoginAsync(body.User, body.Password, body.Code, ctx.ClientIp(), ctx.Request.Headers.UserAgent, ctx.RequestAborted))
                .ToHttp(s => SignIn(ctx, cookie, s)));

        app.MapPost("/api/auth/logout", async (HttpContext ctx, AccountService accounts, SessionCookie cookie, HubSignIn hub) =>
        {
            var who = ctx.Person();
            var hint = await accounts.HubHintAsync(who, ctx.RequestAborted);
            await accounts.LogoutAsync(who, ctx.ClientIp(), ctx.RequestAborted);
            cookie.Clear(ctx);
            // somebody who came through the hub is sent on to the hub's sign-out (it ends its own session and tells the other apps); the others get nothing to follow
            return who.ViaHub && await hub.EndSessionUrlAsync(ctx, hint, ctx.RequestAborted) is { } url ? Results.Ok(new LogoutResponse(url)) : Results.NoContent();
        });

        app.MapPost("/api/auth/logout-others", async (HttpContext ctx, AccountService accounts) =>
            new EndedResponse(await accounts.LogoutOthersAsync(ctx.Person(), ctx.ClientIp(), ctx.RequestAborted)));

        // The list of devices: one row per session, each can be ended by the person
        app.MapGet("/api/auth/sessions", async (HttpContext ctx, AccountService accounts) =>
        {
            var who = ctx.Person();
            var list = await accounts.ListSessionsAsync(who, ctx.RequestAborted);
            return new SessionsResponse([.. list.Select(s => new SessionDto(s.Id, s.Current, s.CreatedAt, s.LastSeen, s.UserAgent, s.Ip))], await accounts.RecoveryLeftAsync(who, ctx.RequestAborted));
        });

        app.MapDelete("/api/auth/sessions/{id:guid}", async (Guid id, HttpContext ctx, AccountService accounts, SessionCookie cookie) =>
        {
            var who = ctx.Person();
            if (!await accounts.EndSessionAsync(who, id, ctx.ClientIp(), ctx.RequestAborted)) return Error.NotFound().ToHttp();
            if (id == who.Id) cookie.Clear(ctx);
            return Results.NoContent();
        });

        // Account: the current password is asked for every time, a session alone is not enough
        app.MapPost("/api/auth/password", async (PasswordChangeRequest body, HttpContext ctx, AccountService accounts) =>
            (await accounts.ChangePasswordAsync(ctx.Person(), body.Current, body.Next, ctx.ClientIp(), ctx.RequestAborted)).ToHttp());

        app.MapPost("/api/auth/totp/begin", async (TotpBeginRequest body, HttpContext ctx, AccountService accounts) =>
            (await accounts.BeginTotpChangeAsync(ctx.Person(), body.Current, ctx.ClientIp(), ctx.RequestAborted))
                .ToHttp(s => Results.Ok(new TotpBeginResponse(s.Secret, s.Uri))));

        app.MapPost("/api/auth/totp/finish", async (TotpFinishRequest body, HttpContext ctx, AccountService accounts) =>
            (await accounts.FinishTotpChangeAsync(ctx.Person(), body.Code, ctx.ClientIp(), ctx.RequestAborted))
                .ToHttp(codes => Results.Ok(new TotpFinishResponse(codes))));

        app.MapGet("/api/auth/history", async (HttpContext ctx, AccountService accounts) =>
            new AuditResponse([.. (await accounts.HistoryAsync(ctx.Person(), 50, ctx.RequestAborted)).Select(e => new AuditDto(e.At, e.Event, e.Detail, e.Ip))]));
    }

    private static IResult SignIn(HttpContext ctx, SessionCookie cookie, SignedIn s)
    {
        cookie.Write(ctx, s.Token);
        return Results.Ok(new LoginResponse(s.User, s.Roles, s.RecoveryLeft));
    }
}
