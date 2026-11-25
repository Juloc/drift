using System.Security.Cryptography;
using System.Text;

namespace Base.Accounts;

/// <summary>
/// Encrypts small secrets for the database (the authenticator secret, later tokens of outside accounts) with AES-256-GCM from .NET.
/// The key (32 bytes) is not in the database: it lives in a file in the data folder of the app, made at the first start. A dump of the database alone
/// reveals no secret (AUTH-06). Format: nonce (12) + tag (16) + cipher text. The id of the owning row is bound in as associated data, so a value
/// cannot be moved to another row.
/// </summary>
public sealed class SecretBox
{
    private const int NonceSize = 12, TagSize = 16;
    public const string KeyFileName = "secret.key";
    private readonly byte[] _key;

    public SecretBox(string base64Key)
    {
        try { _key = Convert.FromBase64String(base64Key.Trim()); }
        catch (FormatException) { throw new InvalidOperationException("The secret key is not valid Base64 (32 random bytes)."); }
        if (_key.Length != 32) throw new InvalidOperationException("The secret key must be 32 bytes long.");
    }

    /// <summary>
    /// Which key applies: the given value when set (tests), else the key file in <paramref name="dataDir"/>. A missing file is created once
    /// (32 random bytes, readable for the server only) and used unchanged from then on. Throws when the folder cannot be written:
    /// without a key that survives a restart, nobody could sign in after the next update.
    /// </summary>
    public static string ResolveKey(string? fixedValue, string dataDir)
    {
        if (!string.IsNullOrWhiteSpace(fixedValue)) return fixedValue;
        var path = Path.Combine(dataDir, KeyFileName);
        try
        {
            if (File.Exists(path)) return File.ReadAllText(path).Trim();
            Directory.CreateDirectory(dataDir);
            var key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            try
            {
                var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, Share = FileShare.None };
                if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
                using var fs = new FileStream(path, options);
                fs.Write(Encoding.ASCII.GetBytes(key + "\n"));
            }
            catch (IOException) when (File.Exists(path)) { return File.ReadAllText(path).Trim(); }   // another start was faster
            return key;
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException)
        {
            throw new InvalidOperationException($"The data folder '{dataDir}' cannot be written. The server keeps its key there ({KeyFileName}); mount a volume the server owns.", e);
        }
    }

    public byte[] Encrypt(string plain, Guid ownerId)
    {
        var data = Encoding.UTF8.GetBytes(plain);
        var result = new byte[NonceSize + TagSize + data.Length];
        var nonce = result.AsSpan(0, NonceSize);
        RandomNumberGenerator.Fill(nonce);
        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, data, result.AsSpan(NonceSize + TagSize), result.AsSpan(NonceSize, TagSize), ownerId.ToByteArray());
        CryptographicOperations.ZeroMemory(data);
        return result;
    }

    /// <returns>The secret, or null when it cannot be decrypted (another key, another owner, damaged).</returns>
    public string? Decrypt(byte[] sealedValue, Guid ownerId)
    {
        if (sealedValue.Length < NonceSize + TagSize) return null;
        var plain = new byte[sealedValue.Length - NonceSize - TagSize];
        try
        {
            using var aes = new AesGcm(_key, TagSize);
            aes.Decrypt(sealedValue.AsSpan(0, NonceSize), sealedValue.AsSpan(NonceSize + TagSize), sealedValue.AsSpan(NonceSize, TagSize), plain, ownerId.ToByteArray());
            return Encoding.UTF8.GetString(plain);
        }
        catch (CryptographicException) { return null; }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }
}
