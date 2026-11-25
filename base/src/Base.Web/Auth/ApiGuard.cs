using Base.Accounts;
using Base.Core;
using Microsoft.AspNetCore.Http.Features;

namespace Base.Web.Auth;

/// <summary>
/// Guards everything under /api (SEC-03, SEC-04):
///  - a changing request (anything but GET and HEAD) must come from the app's own page: the custom header <c>X-Base: 1</c> (a foreign page cannot
///    send it without the browser asking this server first) and an Origin that matches the host;
///  - everything except the few public paths needs a valid session;
///  - bodies are small unless a path says otherwise.
/// Static files stay open, so the app can be installed and the sign-in page can load.
/// </summary>
internal sealed class ApiGuard(RequestDelegate next, AccountService accounts, SessionCookie cookie, BaseAppOptions options)
{
    public const string Header = "X-Base";
    public const string IdentityKey = "base.identity";
    public const long MaxSmallBody = 64 * 1024;
    public const long MaxAuthBody = 4096;

    /// <summary>
    /// The doors that need no session, all of them, in one place (SEC-03). Each protects itself: health and about say nothing private, setup needs the code of the
    /// server log, an invitation needs its link, the central sign-in needs the state it started and a signed token.
    /// </summary>
    public static readonly string[] BasePublicPaths =
    [
        "/api/health", "/api/about", "/api/auth/me", "/api/auth/login", "/api/setup/status", "/api/setup/begin", "/api/setup/finish",
        "/api/invite/check", "/api/invite/begin", "/api/invite/finish",
        HubPaths.Begin, HubPaths.Callback, HubPaths.BackChannelLogout,
    ];

    /// <summary>
    /// Changing requests that are not sent by a page of the app and so cannot carry its header: the central sign-in calls the logout from its server.
    /// The signed logout token is the protection (checked in the handler), not the header (SEC-04).
    /// </summary>
    public static readonly string[] ServerToServerPaths = [HubPaths.BackChannelLogout];

    private readonly HashSet<string> _public = new(BasePublicPaths.Concat(options.PublicPaths), StringComparer.Ordinal);
    private readonly HashSet<string> _large = new(options.LargeBodyPaths, StringComparer.Ordinal);

    private readonly ApiDoor[] _doors = [.. options.Doors];

    private async Task PassDoorAsync(HttpContext ctx, ApiDoor door)
    {
        var request = ctx.Request;
        if (request.ContentLength > door.MaxBodyBytes)
        {
            await HttpErrors.WriteAsync(ctx, new Error(ErrorKind.TooLarge, "too_large", "The request is too large."));
            return;
        }
        if (ctx.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit) limit.MaxRequestBodySize = door.MaxBodyBytes;
        request.Body = new LimitedBody(request.Body, door.MaxBodyBytes);
        bool pass;
        try { pass = await door.Check(ctx); }
        catch (Exception e) when (e is not OperationCanceledException and not BadHttpRequestException) { pass = false; }   // a check that fails never lets anybody in
        if (!pass) { await HttpErrors.WriteAsync(ctx, Error.Unauthorized()); return; }
        ctx.Items.Remove(IdentityKey);
        await next(ctx);
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var request = ctx.Request;
        if (!request.Path.StartsWithSegments("/api")) { await next(ctx); return; }
        var path = request.Path.Value ?? "";

        // An own door (SEC-07): the app protects it with its check. Neither the header, nor the Origin, nor the session cookie play a part here, and no identity is set.
        if (_doors.FirstOrDefault(d => d.Covers(request.Path)) is { } door) { await PassDoorAsync(ctx, door); return; }

        SessionIdentity? identity = null;
        var resolved = false;
        if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method))
        {
            if (!ServerToServerPaths.Contains(path) && (request.Headers[Header] != "1" || !SameOrigin(request)))
            {
                await HttpErrors.WriteAsync(ctx, Error.Forbidden("request.refused", "Request refused."));
                return;
            }
            if (!_large.Contains(path))
            {
                var max = request.Path.StartsWithSegments("/api/auth") || request.Path.StartsWithSegments("/api/setup") || request.Path.StartsWithSegments("/api/invite") ? MaxAuthBody : MaxSmallBody;
                // A limit the endpoint declares itself (SEC-04) counts only behind a session: who may call is decided first, so an anonymous caller never gets the larger limit.
                // Routing has run before the guard, so the matched endpoint is known here; a path without a match keeps the default.
                if (!_public.Contains(path) && ctx.GetEndpoint()?.Metadata.GetMetadata<BodyLimit>() is { } declared)
                {
                    identity = await ResolveAsync(ctx, accounts, cookie, rotate: true);
                    if (identity is null) { await HttpErrors.WriteAsync(ctx, Error.Unauthorized()); return; }
                    resolved = true;
                    max = declared.Bytes;
                }
                if (request.ContentLength > max)
                {
                    await HttpErrors.WriteAsync(ctx, new Error(ErrorKind.TooLarge, "too_large", "The request is too large."));
                    return;
                }
                if (ctx.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit) limit.MaxRequestBodySize = max;
                // a body without a declared length is cut off while it is read, whatever the server in front does
                request.Body = new LimitedBody(request.Body, max);
            }
        }

        if (_public.Contains(path)) { await next(ctx); return; }

        if (!resolved) identity = await ResolveAsync(ctx, accounts, cookie, rotate: true);
        if (identity is null) { await HttpErrors.WriteAsync(ctx, Error.Unauthorized()); return; }
        // the role an endpoint declares with RequireRole is checked here, before the handler runs: the one place (SEC-03)
        if (ctx.GetEndpoint()?.Metadata.GetMetadata<RoleRequirement>() is { } need && !identity.Has(need.Role))
        {
            await HttpErrors.WriteAsync(ctx, Error.Forbidden("role.missing", "This needs the role " + need.Role + "."));
            return;
        }
        ctx.Items[IdentityKey] = identity;
        await next(ctx);
    }

    /// <summary>Reads the cookie and checks the session. A rotated cookie is sent back at once.</summary>
    public static async Task<SessionIdentity?> ResolveAsync(HttpContext ctx, AccountService accounts, SessionCookie cookie, bool rotate)
    {
        var token = cookie.Read(ctx.Request);
        if (token is null) return null;
        var identity = await accounts.ResolveSessionAsync(token, rotate, ctx.RequestAborted);
        if (identity?.NewToken is { } fresh) cookie.Write(ctx, fresh);
        return identity;
    }

    public static bool SameOrigin(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (origin.Length == 0 || !Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        return string.Equals(uri.Authority, request.Host.Value, StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>Reads a request body up to a limit and refuses the rest with 413.</summary>
internal sealed class LimitedBody(Stream inner, long max) : Stream
{
    private long _read;

    private int Count(int n)
    {
        _read += n;
        if (_read > max) throw new BadHttpRequestException("The request is too large.", StatusCodes.Status413PayloadTooLarge);
        return n;
    }

    public override int Read(byte[] buffer, int offset, int count) => Count(inner.Read(buffer, offset, count));
    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => Count(await inner.ReadAsync(buffer.AsMemory(offset, count), cancellationToken));
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => Count(await inner.ReadAsync(buffer, cancellationToken));

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

/// <summary>Who is asking, for the endpoints behind the guard.</summary>
public static class RequestIdentity
{
    /// <summary>The signed-in person. Only behind the guard (every path under /api that is not public).</summary>
    public static SessionIdentity Person(this HttpContext ctx) =>
        ctx.Items[ApiGuard.IdentityKey] as SessionIdentity ?? throw new InvalidOperationException("No session: this path is public or outside /api.");

    /// <summary>The address of the client as the key for lockouts and the list of devices.</summary>
    public static string ClientIp(this HttpContext ctx) => ClientAddress.Key(ctx.Connection.RemoteIpAddress);

    /// <summary>Null when the person has the role, else the refusal to return.</summary>
    public static IResult? Require(this HttpContext ctx, string role) => ctx.Person().Has(role) ? null : Error.Forbidden("role.missing", "This needs the role " + role + ".").ToHttp();
}
