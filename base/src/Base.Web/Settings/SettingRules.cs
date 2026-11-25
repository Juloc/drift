using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Base.Web.Settings;

/// <summary>Whom a setting belongs to: one person (follows them to every device) or the whole installation (changed by an administrator).</summary>
public enum SettingScope { Person, Instance }

/// <summary>
/// One setting the server knows. <see cref="Normalize"/> checks a value and writes it anew in its stored form, or returns null when it is not allowed:
/// unknown fields fall away, lengths and counts are limited. So a browser cannot make the server store anything it likes (OPS-03).
/// </summary>
public sealed record SettingRule(string Key, SettingScope Scope, Func<JsonElement, string?> Normalize)
{
    // without escaping of + and umlauts: the result is JSON for the database and the API, not HTML
    private static readonly JsonWriterOptions Plain = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private static string Write(Action<Utf8JsonWriter> write)
    {
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms, Plain)) write(w);
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    /// <summary>One of a fixed set of words.</summary>
    public static SettingRule OneOf(string key, SettingScope scope, params string[] allowed) => new(key, scope, v =>
        v.ValueKind == JsonValueKind.String && v.GetString() is { } s && allowed.Contains(s) ? Write(w => w.WriteStringValue(s)) : null);

    public static SettingRule Bool(string key, SettingScope scope) => new(key, scope, v =>
        v.ValueKind is JsonValueKind.True or JsonValueKind.False ? (v.GetBoolean() ? "true" : "false") : null);

    public static SettingRule Int(string key, SettingScope scope, int min, int max) => new(key, scope, v =>
        v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) && n >= min && n <= max ? n.ToString() : null);

    /// <summary>A short text without control characters.</summary>
    public static SettingRule Text(string key, SettingScope scope, int max) => new(key, scope, v =>
        v.ValueKind == JsonValueKind.String && v.GetString() is { } s && s.Length <= max && !s.Any(char.IsControl) ? Write(w => w.WriteStringValue(s.Trim())) : null);

    /// <summary>A list of short texts, each checked by <paramref name="itemOk"/>.</summary>
    public static SettingRule TextList(string key, SettingScope scope, int maxItems, int maxLength, Func<string, bool>? itemOk = null) => new(key, scope, v =>
    {
        if (v.ValueKind != JsonValueKind.Array || v.GetArrayLength() > maxItems) return null;
        var items = new List<string>();
        foreach (var e in v.EnumerateArray())
        {
            if (e.ValueKind != JsonValueKind.String || e.GetString()?.Trim() is not { Length: > 0 } s || s.Length > maxLength || s.Any(char.IsControl)) return null;
            if (itemOk is not null && !itemOk(s)) return null;
            items.Add(s);
        }
        return Write(w => { w.WriteStartArray(); foreach (var s in items) w.WriteStringValue(s); w.WriteEndArray(); });
    });
}

/// <summary>Every setting of the app, by key. There are only these.</summary>
public sealed class SettingRules
{
    private readonly Dictionary<(SettingScope, string), SettingRule> _rules = [];

    public SettingRules(IEnumerable<SettingRule> rules)
    {
        foreach (var r in rules)
            if (!_rules.TryAdd((r.Scope, r.Key), r)) throw new InvalidOperationException($"The setting '{r.Key}' is defined twice.");
    }

    public SettingRule? Find(SettingScope scope, string key) => _rules.GetValueOrDefault((scope, key));

    /// <summary>The settings every app has: language and light or dark per person, the trusted proxies for the installation.</summary>
    public static IReadOnlyList<SettingRule> OfTheBase =>
    [
        SettingRule.OneOf("lang", SettingScope.Person, "de", "en", "system"),
        SettingRule.OneOf("scheme", SettingScope.Person, "auto", "light", "dark"),
        SettingRule.TextList(ProxyTrust.SettingKey, SettingScope.Instance, maxItems: 20, maxLength: 50, itemOk: s => ProxyTrust.TryParseNetwork(s, out _)),
    ];
}
