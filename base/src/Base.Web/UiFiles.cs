using System.Reflection;
using System.Security.Cryptography;

namespace Base.Web;

/// <summary>
/// The look of the base (the folder ui/: styles, scripts, icons, the catalogue), served under /base/ straight from this library.
/// An app references the base and has the whole kit, in exactly the version it was built with; nothing is copied into its wwwroot.
/// The browser asks every time whether a file changed (ETag), so an update arrives at once.
/// </summary>
public sealed class UiFiles
{
    public const string RequestPath = "/base";

    private static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".css"] = "text/css; charset=utf-8", [".js"] = "text/javascript; charset=utf-8", [".html"] = "text/html; charset=utf-8", [".svg"] = "image/svg+xml",
        [".json"] = "application/json; charset=utf-8", [".txt"] = "text/plain; charset=utf-8", [".png"] = "image/png", [".woff2"] = "font/woff2",
    };

    private readonly Dictionary<string, (byte[] Bytes, string Type, string ETag)> _files = new(StringComparer.Ordinal);

    public UiFiles() : this(typeof(UiFiles).Assembly) { }

    public UiFiles(Assembly assembly)
    {
        const string prefix = "ui/";
        foreach (var name in assembly.GetManifestResourceNames())
        {
            var path = name.Replace('\\', '/');
            if (!path.StartsWith(prefix, StringComparison.Ordinal) || !Types.TryGetValue(Path.GetExtension(path), out var type)) continue;
            using var stream = assembly.GetManifestResourceStream(name)!;
            using var ms = new MemoryStream();
            stream.CopyTo(ms);
            var bytes = ms.ToArray();
            _files["/" + path[prefix.Length..]] = (bytes, type, "\"" + Convert.ToHexStringLower(SHA256.HashData(bytes))[..20] + "\"");
        }
    }

    public IReadOnlyCollection<string> Paths => _files.Keys;

    /// <summary>Answers a request under /base/ and returns true, or returns false when there is no such file.</summary>
    public async Task<bool> TryServeAsync(HttpContext ctx)
    {
        if (!HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method)) return false;
        if (!ctx.Request.Path.StartsWithSegments(RequestPath, out var rest) || !_files.TryGetValue(rest.Value ?? "", out var file)) return false;
        var h = ctx.Response.Headers;
        h.ETag = file.ETag;
        h.CacheControl = "no-cache";
        if (ctx.Request.Headers.IfNoneMatch == file.ETag) { ctx.Response.StatusCode = StatusCodes.Status304NotModified; return true; }
        ctx.Response.ContentType = file.Type;
        ctx.Response.ContentLength = file.Bytes.Length;
        if (HttpMethods.IsGet(ctx.Request.Method)) await ctx.Response.Body.WriteAsync(file.Bytes, ctx.RequestAborted);
        return true;
    }
}
