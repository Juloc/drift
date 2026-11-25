namespace Base.Core;

/// <summary>
/// Collects what is wrong with the inputs of one request, field by field, so a form can show every problem at once (FORM-02).
/// Each method returns a usable value even when it records a problem; check <see cref="Error"/> before using them.
/// </summary>
public sealed class Validator
{
    public const string Required = "required", TooLong = "too_long", TooShort = "too_short", NotValid = "invalid", OutOfRange = "out_of_range";

    private Dictionary<string, string>? _fields;

    public bool Ok => _fields is null;

    /// <summary>Null when everything is fine, else one error that names every wrong field.</summary>
    public Error? Error => _fields is null ? null : new Error(ErrorKind.Invalid, "invalid", "Some fields are not valid.", _fields);

    /// <summary>Records a problem. The first problem of a field wins.</summary>
    public void Fail(string field, string code) => (_fields ??= new(StringComparer.Ordinal)).TryAdd(field, code);

    /// <summary>A required text: trimmed, without control characters (line breaks only with <paramref name="multiline"/>), within the lengths.</summary>
    public string Text(string field, string? value, int max, int min = 1, bool multiline = false)
    {
        var s = (value ?? "").Trim();
        if (s.Length == 0 && min > 0) { Fail(field, Required); return ""; }
        if (s.Length < min) Fail(field, TooShort);
        else if (s.Length > max) { Fail(field, TooLong); s = s[..max]; }
        else if (s.Any(c => char.IsControl(c) && !(multiline && c is '\n' or '\r' or '\t'))) Fail(field, NotValid);
        return s;
    }

    /// <summary>A text that may be missing or empty (then ""), checked like <see cref="Text"/> otherwise.</summary>
    public string OptionalText(string field, string? value, int max, bool multiline = false) => Text(field, value, max, min: 0, multiline);

    public int Int(string field, int? value, int min, int max)
    {
        if (value is not { } v) { Fail(field, Required); return min; }
        if (v < min || v > max) { Fail(field, OutOfRange); return Math.Clamp(v, min, max); }
        return v;
    }

    /// <summary>One of a fixed set of values (a state, a kind).</summary>
    public string OneOf(string field, string? value, IReadOnlyCollection<string> allowed)
    {
        if (string.IsNullOrEmpty(value)) { Fail(field, Required); return allowed.First(); }
        if (!allowed.Contains(value)) { Fail(field, NotValid); return allowed.First(); }
        return value;
    }
}
