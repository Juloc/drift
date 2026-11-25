using System.Security.Cryptography;
using System.Text;

namespace Base.Accounts;

/// <summary>
/// The one-time code of the first setup. It is written to the server log only, so only somebody with access to the server can create
/// the first account (AUTH-09). A fixed value can be given for tests; otherwise it is random (12 characters, 60 bit) and new at every start.
/// </summary>
public sealed class SetupCode(string? fixedValue = null)
{
    private bool _used;

    public string Value { get; } = string.IsNullOrWhiteSpace(fixedValue) ? Generate() : fixedValue.Trim();

    private static string Generate()
    {
        var raw = Base32.Encode(RandomNumberGenerator.GetBytes(8))[..12];
        return $"{raw[..4]}-{raw[4..8]}-{raw[8..]}";
    }

    public bool Matches(string? input)
    {
        if (_used || input is null || input.Length > 64) return false;
        var a = Encoding.UTF8.GetBytes(Normalize(input));
        var b = Encoding.UTF8.GetBytes(Normalize(Value));
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    public void MarkUsed() => _used = true;

    private static string Normalize(string s) => new(s.Where(c => c is not ('-' or ' ')).Select(char.ToUpperInvariant).ToArray());
}
