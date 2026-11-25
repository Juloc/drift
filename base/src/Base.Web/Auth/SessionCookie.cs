namespace Base.Web.Auth;

/// <summary>
/// The session cookie (AUTH-02): HttpOnly, SameSite=Strict, and over HTTPS Secure with the prefix __Host- (only this exact host, no domain cookie,
/// so no other service on the same domain can read or set it). Over plain HTTP (localhost while developing) the prefix is not possible.
/// The name carries the id of the app: cookies do not know ports, and two apps on one host must not overwrite each other.
/// </summary>
public sealed class SessionCookie(AppInfo app)
{
    public const int Days = 30;

    public string Name(bool https) => https ? $"__Host-{app.Id}_sid" : $"{app.Id}_sid";

    public string? Read(HttpRequest request) => request.Cookies.TryGetValue(Name(request.IsHttps), out var v) ? v : null;

    public void Write(HttpContext ctx, string token) => ctx.Response.Cookies.Append(Name(ctx.Request.IsHttps), token, Options(ctx, TimeSpan.FromDays(Days)));

    public void Clear(HttpContext ctx) => ctx.Response.Cookies.Append(Name(ctx.Request.IsHttps), "", Options(ctx, TimeSpan.Zero));

    private static CookieOptions Options(HttpContext ctx, TimeSpan maxAge) => new()
    {
        HttpOnly = true,
        Secure = ctx.Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        MaxAge = maxAge,
        IsEssential = true,
    };
}
