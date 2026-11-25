using Base.Core;
using Base.Web;
using Base.Web.Auth;
using Drift.GameAccounts;
using Drift.Play;
using Drift.Race;
using Drift.Relay;

namespace Drift.Guests;

public sealed record JoinRequest(string? Token, string? Name);
public sealed record NewLinkRequest(int? Hours, int? Uses);

/// <summary>
/// Guests. The door <c>/api/guest</c> (SEC-07) lets in anybody with a valid guest cookie and nobody else: its check never looks at the base session, and the base's
/// guard asks neither for the header nor for the origin there, so <c>join</c> and <c>leave</c> check those themselves. <c>join</c> is the one path that needs
/// no cookie: it protects itself with the link's secret and a limit per address. A guest sees the lobby, the races and the board, nothing else.
/// Making and ending links is the administrator's, under <c>/api/guest-links</c> behind the base's guard.
/// </summary>
public static class GuestEndpoints
{
    public const string Key = "drift.guest", JoinPath = "/api/guest/join";

    public static string CookieName(HttpRequest r) => r.IsHttps ? "__Host-drift-guest" : "drift-guest";

    /// <summary>The check of the door: the join path passes (it checks the link itself), every other path needs a live guest session, which is kept for the handler.</summary>
    public static async ValueTask<bool> Check(HttpContext ctx)
    {
        if (ctx.Request.Path.Equals(JoinPath, StringComparison.OrdinalIgnoreCase)) return true;
        if (ctx.Request.Cookies[CookieName(ctx.Request)] is not { Length: > 0 and < 100 } cookie) return false;
        if (await ctx.RequestServices.GetRequiredService<GuestService>().ValidateAsync(cookie, ctx.RequestAborted) is not { } guest) return false;
        ctx.Items[Key] = guest;
        return true;
    }

    public static GuestIdentity Guest(this HttpContext ctx) => ctx.Items[Key] as GuestIdentity ?? throw new InvalidOperationException("Not behind the guest door.");

    static bool OwnPage(HttpRequest r) =>
        r.Headers["X-Base"] == "1" && Uri.TryCreate(r.Headers.Origin.ToString(), UriKind.Absolute, out var u) && string.Equals(u.Authority, r.Host.Value, StringComparison.OrdinalIgnoreCase);

    public static void MapGuests(this WebApplication app)
    {
        app.MapPost(JoinPath, async (JoinRequest body, HttpContext ctx, GuestService guests, RateLimit limit, Owners owners) =>
        {
            if (!OwnPage(ctx.Request)) return Error.Forbidden("request.refused", "Request refused.").ToHttp();
            if (!limit.Allow("guest-join", ctx.ClientIp(), 10, out var wait)) return Error.TooMany(wait).ToHttp();
            var name = (body.Name ?? "").Trim();
            if (!GuestService.ValidName(name)) return new Error(ErrorKind.Invalid, "invalid", "The name is not valid.", new Dictionary<string, string> { ["name"] = name.Length < 2 ? "too_short" : name.Length > 16 ? "too_long" : "invalid" }).ToHttp();
            if (NameRules.Problem(name) is "not_allowed" or "reserved") return new Error(ErrorKind.Invalid, "invalid", "The name is not allowed.", new Dictionary<string, string> { ["name"] = "not_allowed" }).ToHttp();
            if (await owners.NameTakenAsync(NameRules.Key(name), Guid.Empty, ctx.RequestAborted)) return new Error(ErrorKind.Invalid, "invalid", "The name is taken.", new Dictionary<string, string> { ["name"] = "taken" }).ToHttp();
            if (string.IsNullOrEmpty(body.Token) || body.Token.Length > 100) return Error.Unauthorized("guest.link", "This guest link is not valid (any more).").ToHttp();
            // a random colour from the 24 hues; the first car
            var made = await guests.RedeemAsync(body.Token, name, Random.Shared.Next(24), ctx.RequestAborted);
            if (made is not { } m) return Error.Unauthorized("guest.link", "This guest link is not valid (any more).").ToHttp();
            ctx.Response.Cookies.Append(CookieName(ctx.Request), m.Cookie, new CookieOptions { HttpOnly = true, Secure = ctx.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/", Expires = m.Guest.Expires, IsEssential = true });
            return Results.Ok(new { name = m.Guest.Name, expires = m.Guest.Expires });
        });

        app.MapGet("/api/guest/me", (HttpContext ctx) => { var g = ctx.Guest(); return Results.Ok(new { name = g.Name, car = g.Car, colour = g.Colour, expires = g.Expires }); });

        app.MapPost("/api/guest/leave", async (HttpContext ctx, GuestService guests, PersonSockets sockets) =>
        {
            if (!OwnPage(ctx.Request)) return Error.Forbidden("request.refused", "Request refused.").ToHttp();
            var g = ctx.Guest();
            await guests.EndSessionAsync(g.Id, ctx.RequestAborted);
            sockets.DropAll([g.Id], Wire.ByeSession);
            ctx.Response.Cookies.Delete(CookieName(ctx.Request), new CookieOptions { HttpOnly = true, Secure = ctx.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/", IsEssential = true });
            return Results.NoContent();
        });

        // ----- the administrator's side
        var admin = app.MapGroup("/api/guest-links").RequireRole("admin");
        admin.MapGet("", async (GuestService guests, CancellationToken ct) => Results.Ok(new
        {
            links = (await guests.ListLinksAsync(ct)).Select(l => new { id = l.Id, createdAt = l.CreatedAt, expiresAt = l.ExpiresAt, maxUses = l.MaxUses, uses = l.Uses }),
            limits = new { maxHours = GuestService.MaxHours, maxUses = GuestService.MaxUses, maxLinks = GuestService.MaxValidLinks },
        }));
        admin.MapPost("", async (NewLinkRequest body, HttpContext ctx, GuestService guests) =>
            (await guests.CreateLinkAsync(ctx.Person().UserId, body.Hours ?? 4, body.Uses ?? 5, ctx.RequestAborted))
                .ToHttp(l => Results.Ok(new { id = l.Id, token = l.Token, expiresAt = l.ExpiresAt, maxUses = l.MaxUses })));
        admin.MapDelete("/{id:guid}", async (Guid id, GuestService guests, PersonSockets sockets, CancellationToken ct) =>
        {
            sockets.DropAll(await guests.RevokeLinkAsync(id, ct), Wire.ByeSession);
            return Results.NoContent();
        });
        admin.MapPost("/end-all", async (GuestService guests, PersonSockets sockets, CancellationToken ct) =>
        {
            var ids = await guests.RevokeAllAsync(ct);
            sockets.DropAll(ids, Wire.ByeSession);
            return Results.Ok(new { ended = ids.Count });
        });
    }
}
