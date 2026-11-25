using System.Buffers.Text;
using System.Security.Cryptography;

namespace Base.Core;

/// <summary>Identifiers and random tokens. Ids are UUID version 7: unique without asking the database, and sorted by the time they were made.</summary>
public static class Ids
{
    public static Guid New() => Guid.CreateVersion7();

    public static bool TryParse(string? text, out Guid id) => Guid.TryParse(text, out id) && id != Guid.Empty;

    /// <summary>A random secret from the system's generator, URL-safe (default 256 bit). For anything that must not be guessed.</summary>
    public static string Token(int bytes = 32) => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(bytes));
}
