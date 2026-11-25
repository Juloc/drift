using System.Text.RegularExpressions;
using Base.Accounts;
using Base.Web.Auth;

namespace Base.Web;

/// <summary>
/// <c>GET /api/about</c>: the app describes itself, once, from the one object that names it (<see cref="BaseAppOptions"/>). Anonymous, so it holds nothing
/// private: fixed fields only (CONTRACT-02). A hub, a launcher or a monitor builds its tile from this and needs no code that knows the app.
/// </summary>
internal static partial class Describe
{
    public const int PerMinute = 60;

    [GeneratedRegex("^[a-z][a-z0-9-]{0,31}$")]
    private static partial Regex Slug();

    /// <summary>Stops the start when the description is wrong, so an app never publishes nonsense.</summary>
    public static void Check(BaseAppOptions o)
    {
        if (!Slug().IsMatch(o.Id)) throw new InvalidOperationException($"The id '{o.Id}' of the app is not a slug (a-z, 0-9, dash).");
        if (string.IsNullOrWhiteSpace(o.Name) || o.Name.Length > 60) throw new InvalidOperationException("The name of the app is empty or longer than 60 characters.");
        if (o.AccentHue is < 0 or > 359) throw new InvalidOperationException("AccentHue is an angle from 0 to 359.");
        if (!o.Start.StartsWith('/') || o.Start.StartsWith("//", StringComparison.Ordinal)) throw new InvalidOperationException("Start is a path on the app's own address (it begins with one slash).");
        if (o.Description is { } d && (d.En.Length > 200 || (d.De?.Length ?? 0) > 200)) throw new InvalidOperationException("The description is longer than 200 characters.");
        _ = new AppRoles(o.Roles);                  // throws when the roles are not valid
    }

    public static void MapAbout(this IEndpointRouteBuilder app, AppInfo info, BaseAppOptions options)
    {
        var about = new About(AppInfo.ContractVersion, info.Id, info.Name, options.Description ?? new Base.Core.Localized(info.Name), info.Version, info.BaseVersion,
            options.Icon, options.AccentHue, options.Start, [.. options.Roles]);
        app.MapGet("/api/about", (HttpContext ctx, RateLimit limit) =>
        {
            if (!limit.Allow("about", ctx.ClientIp(), PerMinute, out var wait)) return Base.Core.Error.TooMany(wait).ToHttp();
            // the one answer of the API a proxy or hub may keep for a few minutes: it is the same for everybody and holds nothing private
            ctx.Response.Headers.CacheControl = "public, max-age=300";
            return Results.Json(about, WebJson.Default.About);
        });
    }
}
