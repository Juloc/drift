using System.Reflection;
using Base.Accounts;
using Base.Core;
using Base.Data;
using Base.Web.Settings;

namespace Base.Web;

/// <summary>What an app tells the base about itself.</summary>
/// <param name="Id">Short technical name (lower case, digits, dash): names the session cookie, so two apps on one host do not collide.</param>
/// <param name="Name">The name people see; also shown by authenticator apps.</param>
/// <param name="Assembly">The app's own library: its version is the version of the app.</param>
public sealed record BaseAppOptions(string Id, string Name, Assembly Assembly)
{
    /// <summary>The app's own numbered SQL scripts; they run after those of the base.</summary>
    public IReadOnlyList<MigrationSet> Migrations { get; init; } = [];

    /// <summary>
    /// The table that remembers the applied scripts. Only an app that already owns a table named <c>schema_migrations</c> with other columns sets this
    /// (a plain identifier: letters, digits, underscore). Apps made by <c>new-app.sh</c> keep the default.
    /// </summary>
    public string MigrationTable { get; init; } = Migrator.DefaultTable;

    /// <summary>
    /// Own doors: path prefixes under /api that the app protects itself, for a device or another app with a key instead of a person with a session (SEC-07).
    /// Empty for most apps.
    /// </summary>
    public IReadOnlyList<ApiDoor> Doors { get; init; } = [];

    /// <summary>The app's own settings (the base brings language, light or dark and the trusted proxies).</summary>
    public IReadOnlyList<SettingRule> Settings { get; init; } = [];

    /// <summary>Paths under /api that answer without a session. Keep this list short; every entry is a door (SEC-03).</summary>
    public IReadOnlyList<string> PublicPaths { get; init; } = [];

    /// <summary>What the app is, in a sentence people read (English required, German expected). The app's name when not given.</summary>
    public Localized? Description { get; init; }

    /// <summary>The icon of the app: a name from the icon file of the base (<c>ui/icons.js</c>).</summary>
    public string Icon { get; init; } = "grid";

    /// <summary>The colour of the app as an angle on the colour wheel (0 to 359): the same number as <c>--accent-hue</c> in its stylesheet (COLOR-01).</summary>
    public int AccentHue { get; init; } = 250;

    /// <summary>Where the app starts, a path on its own address.</summary>
    public string Start { get; init; } = "/";

    /// <summary>The roles of the app: a small fixed list, one per person, always with "admin" (SEC-03). Default: admin and member.</summary>
    public IReadOnlyList<AppRole> Roles { get; init; } = AppRoles.Default;

    /// <summary>Paths under /api that accept large bodies (uploads); each of them checks its own limit.</summary>
    public IReadOnlyList<string> LargeBodyPaths { get; init; } = [];
}

/// <summary>
/// A path prefix under /api with its own protection (SEC-07). For a request under it the guard asks for no <c>X-Base</c> header and no Origin, never reads the
/// session cookie and sets no identity; it applies the body limit, calls <paramref name="Check"/> and answers 401 when that says no. The check is required:
/// a door without one cannot be declared.
/// </summary>
/// <param name="Prefix">Starts with <c>/api/</c> and names at least one more segment, e.g. <c>/api/v1</c>. Matches whole segments: <c>/api/v1</c> covers <c>/api/v1/x</c>, not <c>/api/v10</c>. Upper and lower case are the same, as they are for the routes: <c>/api/V1/x</c> is the door too.</param>
/// <param name="Check">Looks at the request (for example a bearer key) and says whether it may pass. It runs before the body is read by the app.</param>
/// <param name="MaxBodyBytes">The largest body a request under the door may have.</param>
public sealed record ApiDoor(string Prefix, Func<HttpContext, ValueTask<bool>> Check, long MaxBodyBytes)
{
    /// <summary>The first segment under /api that the base itself serves; a door cannot sit on any of them.</summary>
    public static readonly IReadOnlySet<string> ReservedFirstSegments = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "auth", "setup", "invite", "account", "health", "about", "people", "settings", "instance-settings", "hub-settings",
    };

    /// <summary>
    /// True when <paramref name="path"/> is the prefix or lies below it, by whole segments. Case is ignored on purpose: the routes ignore it, so a path that
    /// reaches an endpoint of the door in another spelling must be the door as well. Otherwise it would fall to the session guard and a cookie would open it.
    /// </summary>
    public bool Covers(PathString path) => path.StartsWithSegments(Prefix, StringComparison.OrdinalIgnoreCase);

    /// <summary>Stops the start when a door is not allowed.</summary>
    public static void Validate(IReadOnlyList<ApiDoor> doors, IEnumerable<string> otherPaths)
    {
        var seen = new List<string>();
        foreach (var d in doors)
        {
            if (d.Check is null) throw new InvalidOperationException($"The door '{d.Prefix}' has no check; a door without a check cannot be declared.");
            if (d.MaxBodyBytes < 0) throw new InvalidOperationException($"The door '{d.Prefix}' has a negative body limit.");
            var prefix = d.Prefix ?? "";
            if (!prefix.StartsWith("/api/", StringComparison.Ordinal)) throw new InvalidOperationException($"The door '{prefix}' must start with /api/ and name at least one more segment.");
            var segments = prefix[5..].Split('/');
            if (segments.Any(s => s.Length == 0 || !s.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_')))
                throw new InvalidOperationException($"The door '{prefix}' is not a plain path: segments of letters, digits, dash and underscore, no empty segment, no trailing slash.");
            if (ReservedFirstSegments.Contains(segments[0])) throw new InvalidOperationException($"The door '{prefix}' lies on a path the base itself serves (/api/{segments[0]}).");
            foreach (var other in otherPaths)
                if (new PathString(other).StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException($"The door '{prefix}' would cover the path '{other}' that the app or the base declares otherwise.");
            foreach (var earlier in seen)
                if (new PathString(prefix).StartsWithSegments(earlier, StringComparison.OrdinalIgnoreCase) || new PathString(earlier).StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException($"The doors '{earlier}' and '{prefix}' overlap.");
            seen.Add(prefix);
        }
    }
}

/// <summary>Name and versions of the running app: its own version, the commit it was built from, and the version of the base it was made with.</summary>
public sealed record AppInfo(string Id, string Name, string Version, string? Commit, string BaseVersion)
{
    /// <summary>The version of the contract between an app and the hub that this base speaks (docs/CONTRACT.md). A change that breaks a reader raises it.</summary>
    public const int ContractVersion = 1;

    public static AppInfo From(BaseAppOptions options)
    {
        var (version, commit) = Parse(options.Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion);
        return new AppInfo(options.Id, options.Name, version, commit, ReadBaseVersion());
    }

    /// <summary>Splits "1.2.3+commit" (the build appends the commit) into version and short commit.</summary>
    public static (string Version, string? Commit) Parse(string? informationalVersion)
    {
        var text = (informationalVersion ?? "").Trim();
        var plus = text.IndexOf('+');
        var version = plus < 0 ? text : text[..plus];
        var commit = plus < 0 ? "" : text[(plus + 1)..];
        return (version.Length == 0 ? "0.0.0" : version, commit.Length == 0 ? null : commit[..Math.Min(7, commit.Length)]);
    }

    private static string ReadBaseVersion()
    {
        using var stream = typeof(AppInfo).Assembly.GetManifestResourceStream("base/VERSION");
        if (stream is null) return "0.0.0";
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().Trim();
    }
}
