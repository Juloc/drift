namespace Base.Web;

/// <summary>
/// The security headers of every answer (SEC-01). The content policy allows only what the app itself serves: no inline script, no inline style,
/// no foreign origin, no framing (SEC-02). That is why the look has no build step and no CDN: everything comes from this server.
/// </summary>
public static class SecurityHeaders
{
    public const string Csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
                            + "manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

    public const string Permissions = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

    public static void Apply(HttpContext ctx)
    {
        var h = ctx.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["Referrer-Policy"] = "no-referrer";
        h["X-Frame-Options"] = "DENY";
        h["Content-Security-Policy"] = Csp;
        h["Permissions-Policy"] = Permissions;
        h["Cross-Origin-Opener-Policy"] = "same-origin";
        h["Cross-Origin-Resource-Policy"] = "same-origin";
        if (ctx.Request.IsHttps) h["Strict-Transport-Security"] = "max-age=31536000";
        // answers of the API are never kept by a browser or a proxy
        if (ctx.Request.Path.StartsWithSegments("/api")) h["Cache-Control"] = "no-store";
    }
}
