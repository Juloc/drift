using System.Text.RegularExpressions;

namespace Base.Accounts;

/// <summary>What a user name and a password must look like. Length counts, not character classes.</summary>
public static partial class PasswordPolicy
{
    public const int MinLength = 12;
    public const int MaxLength = 256;

    [GeneratedRegex("^[a-z0-9][a-z0-9._-]{0,31}$")]
    private static partial Regex UserNameRegex();

    /// <summary>The cleaned user name (lower case), or null when it is not allowed: 1 to 32 characters of a-z, 0-9, dot, dash, underscore.</summary>
    public static string? NormalizeUserName(string? name)
    {
        var n = (name ?? "").Trim().ToLowerInvariant();
        return UserNameRegex().IsMatch(n) ? n : null;
    }

    /// <summary>Null when the password is fine, else the code of the problem (the browser explains it in the person's language).</summary>
    public static string? Problem(string? password, string userName)
    {
        if (password is null || password.Length < MinLength) return "password.short";
        if (password.Length > MaxLength) return "password.long";
        if (password.Contains(userName, StringComparison.OrdinalIgnoreCase)) return "password.contains_name";
        if (password.Distinct().Count() < 4) return "password.simple";
        return null;
    }
}
