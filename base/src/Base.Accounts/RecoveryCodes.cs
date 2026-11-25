using System.Security.Cryptography;
using System.Text;

namespace Base.Accounts;

/// <summary>Ten one-time recovery codes (80 bit each, shown as XXXX-XXXX-XXXX-XXXX). Only the SHA-256 value is stored (AUTH-07).</summary>
public static class RecoveryCodes
{
    public const int Count = 10;
    public const int NormalizedLength = 16;

    public static (string[] Plain, string[] Hashes) Generate()
    {
        var plain = new string[Count];
        for (var i = 0; i < Count; i++)
        {
            var raw = Base32.Encode(RandomNumberGenerator.GetBytes(10));          // 16 characters
            plain[i] = string.Join('-', Enumerable.Range(0, 4).Select(p => raw.Substring(p * 4, 4)));
        }
        return (plain, [.. plain.Select(Hash)]);
    }

    public static string Normalize(string input) => new(input.Where(c => c is not ('-' or ' ')).Select(char.ToUpperInvariant).ToArray());

    public static string Hash(string code) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Normalize(code))));

    public static bool LooksLikeRecoveryCode(string input) => Normalize(input).Length == NormalizedLength;
}
