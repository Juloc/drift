
namespace Drift.GameAccounts;

/// <summary>What a games account's name looks like: 3 to 16 characters, letters, digits, space, dot, dash, underscore, starting with a letter or digit, no double spaces, unique ignoring case. No real name is needed.</summary>
public static class NameRules
{
    public const int Min = 3, Max = 16;

    static readonly HashSet<string> Reserved = new(StringComparer.Ordinal)
    {
        "admin", "administrator", "system", "root", "moderator", "mod", "support", "staff", "server", "drift", "juloc", "julocgames", "games", "blockwelt", "schiffe versenken", "guest", "gast", "null", "undefined",
    };

    /// <summary>The key of uniqueness: lower case, full-width forms and accents folded (Kiwi and Kíwi and ＫＩＷＩ are one name).</summary>
    public static string Key(string name) => NameFilter.Latin(name.Trim());

    /// <summary>Null when the name is fine, else the code for the name field: too_short, too_long, invalid, reserved or not_allowed (the filter).</summary>
    public static string? Problem(string? name)
    {
        if (name is null) return "too_short";
        name = name.Trim();
        if (name.Length < Min) return "too_short";
        if (name.Length > Max) return "too_long";
        if (!char.IsLetterOrDigit(name[0]) || !name.All(c => char.IsLetterOrDigit(c) || c is ' ' or '.' or '-' or '_') || name.Contains("  ")) return "invalid";
        // letters only of the Latin script and digits: a name that mixes in look-alike letters of another script is the classic way to impersonate
        if (name.Any(c => char.IsLetter(c) && !IsLatin(c))) return "invalid";
        if (Reserved.Contains(Key(name)) || Reserved.Contains(NameFilter.Fold(name))) return "reserved";
        if (!NameFilter.Allowed(name)) return "not_allowed";
        return null;
    }

    static bool IsLatin(char c) => c <= 'ɏ';   // Basic Latin, Latin-1, Latin Extended A and B (accents, umlauts, sharp s)
}
