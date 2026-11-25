using System.Text;

namespace Drift.GameAccounts;

/// <summary>
/// The name filter. A name is folded (case, accents, look-alike characters, repeated letters, separators removed) and refused when it contains a word of the list.
/// The list is the administrator's: a text file, one word per line, in <c>games-names.txt</c> next to the app (or the built-in short list). Slice 3 of docs/PLAN-0.2.md.
/// </summary>
public static class NameFilter
{
    /// <summary>The built-in start of the list: only the plainest. The administrator's file adds to it.</summary>
    static readonly string[] Builtin =
    [
        "fuck", "shit", "bitch", "cunt", "asshole", "arschloch", "wichser", "hurensohn", "fotze", "nazi", "hitler", "heilhitler", "nigger", "nigga", "faggot",
        "rapist", "pedo", "kanake", "schlampe", "scheisse", "penis", "vagina", "porn", "sexy",
    ];

    static volatile string[] words = Builtin;

    /// <summary>Replaces the list (built-in words stay). Null or empty keeps only the built-in ones.</summary>
    public static void SetWords(IEnumerable<string>? extra) => words = [.. Builtin.Concat(extra ?? []).Select(Fold).Where(w => w.Length >= 3).Distinct()];

    /// <summary>Reads the administrator's file when it exists: one word per line, # starts a comment.</summary>
    public static void LoadFile(string path) =>
        SetWords(File.Exists(path) ? File.ReadAllLines(path).Select(l => l.Split('#')[0].Trim()).Where(l => l.Length > 0) : null);

    static readonly Dictionary<char, char> Lookalike = new()
    {
        ['0'] = 'o', ['1'] = 'i', ['!'] = 'i', ['|'] = 'i', ['3'] = 'e', ['4'] = 'a', ['@'] = 'a', ['5'] = 's', ['$'] = 's', ['7'] = 't', ['8'] = 'b', ['9'] = 'g', ['ß'] = 's',
    };

    // accents and the like fold to the plain letter. The app runs with invariant globalization (no ICU), where string normalization does not decompose non-ASCII, so this is a table of our own.
    static readonly Dictionary<char, string> Plain = BuildPlain();
    static Dictionary<char, string> BuildPlain()
    {
        var d = new Dictionary<char, string>();
        void Add(string to, string from) { foreach (var c in from) d[c] = to; }
        Add("a", "àáâãäåāăąǎ"); Add("c", "çćĉċč"); Add("d", "ďđ"); Add("e", "èéêëēĕėęě"); Add("g", "ĝğġģ"); Add("h", "ĥħ"); Add("i", "ìíîïĩīĭįıǐ"); Add("j", "ĵ"); Add("k", "ķ");
        Add("l", "ĺļľŀł"); Add("n", "ñńņňŉ"); Add("o", "òóôõöøōŏőǒ"); Add("r", "ŕŗř"); Add("s", "śŝşš"); Add("t", "ţťŧ"); Add("u", "ùúûüũūŭůűųǔ"); Add("w", "ŵ"); Add("y", "ýÿŷ"); Add("z", "źżž");
        d['æ'] = "ae"; d['œ'] = "oe"; d['ß'] = "ss"; d['þ'] = "th";
        return d;
    }

    /// <summary>Lower case, full-width letters and digits as plain ones, accents removed (Müller is Muller): the form in which names are compared for uniqueness and for the filter's first step.</summary>
    public static string Latin(string name)
    {
        var sb = new StringBuilder(name.Length);
        foreach (var raw in name.ToLowerInvariant())
        {
            var c = raw >= '\uFF01' && raw <= '\uFF5E' ? (char)(raw - 0xFEE0) : raw;   // the full-width forms of ASCII
            if (c is >= 'A' and <= 'Z') c = char.ToLowerInvariant(c);
            if (Plain.TryGetValue(c, out var p)) sb.Append(p); else sb.Append(c);
        }
        return sb.ToString();
    }

    /// <summary>Latin form, look-alikes mapped (0 to o, 1 to i, 3 to e, 4 to a, 5 and $ to s, 7 to t, ...), separators dropped, repeated letters collapsed.</summary>
    public static string Fold(string name)
    {
        var d = Latin(name);
        var sb = new StringBuilder(d.Length);
        foreach (var raw in d)
        {
            if (char.IsWhiteSpace(raw)) continue;
            var c = Lookalike.TryGetValue(raw, out var m) ? m : raw;
            if (c is '.' or '-' or '_' or '*' or '+') continue;
            if (sb.Length > 0 && sb[^1] == c) continue;   // "fuuuck" and "fuck" are the same
            sb.Append(c);
        }
        return sb.ToString();
    }

    public static bool Allowed(string name)
    {
        var f = Fold(name);
        foreach (var w in words) if (f.Contains(w, StringComparison.Ordinal)) return false;
        return true;
    }
}
