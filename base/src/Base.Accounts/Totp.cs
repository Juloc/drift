using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace Base.Accounts;

/// <summary>
/// Time-based one-time codes as in RFC 6238 (HMAC-SHA1, 6 digits, 30 seconds), the kind every authenticator app speaks.
/// The HMAC itself comes from .NET; only the few lines of the standard around it are ours (CODE-03).
/// </summary>
public static class Totp
{
    public const int StepSeconds = 30;

    public static string NewSecret() => Base32.Encode(RandomNumberGenerator.GetBytes(20));

    /// <summary>The link an authenticator app reads from the QR code. <paramref name="issuer"/> is the name of the app.</summary>
    public static string Uri(string issuer, string user, string secret) =>
        $"otpauth://totp/{System.Uri.EscapeDataString(issuer)}:{System.Uri.EscapeDataString(user)}?secret={secret}&issuer={System.Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits=6&period=30";

    public static string Hotp(byte[] secret, long counter, int digits = 6)
    {
        Span<byte> msg = stackalloc byte[8];
        BinaryPrimitives.WriteInt64BigEndian(msg, counter);
        Span<byte> mac = stackalloc byte[20];
        HMACSHA1.HashData(secret, msg, mac);
        var offset = mac[19] & 0x0F;
        var code = ((mac[offset] & 0x7F) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
        var mod = 1;
        for (var i = 0; i < digits; i++) mod *= 10;
        return (code % mod).ToString().PadLeft(digits, '0');
    }

    /// <summary>
    /// Checks a code against the current time step and its neighbours (one before, one after). Returns the step the code belongs to, or null.
    /// Steps up to <paramref name="lastUsedStep"/> are spent: a code works once (AUTH-06). All three steps are always computed,
    /// so the time it takes does not tell which one matched.
    /// </summary>
    public static long? Check(string secretBase32, string code, long lastUsedStep, DateTimeOffset now)
    {
        if (code.Length != 6 || !code.All(char.IsAsciiDigit)) return null;
        byte[] secret;
        try { secret = Base32.Decode(secretBase32); }
        catch (FormatException) { return null; }
        if (secret.Length == 0) return null;
        var step = now.ToUnixTimeSeconds() / StepSeconds;
        var given = Encoding.ASCII.GetBytes(code);
        long? hit = null;
        foreach (var delta in new long[] { 0, -1, 1 })
        {
            var s = step + delta;
            var match = CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Hotp(secret, s)), given);
            if (match && s > lastUsedStep && hit is null) hit = s;
        }
        return hit;
    }
}
