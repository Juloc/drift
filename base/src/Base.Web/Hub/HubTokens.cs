using System.Text.Json;
using Base.Accounts;
using Base.Core;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Base.Web;

/// <summary>The checked statements of an ID token.</summary>
public sealed record HubIdToken(string Sub, string Sid, string? Name, string? Role);

/// <summary>The checked statements of a logout token.</summary>
public sealed record HubLogoutToken(string? Sub, string? Sid, string Jti, DateTimeOffset ExpiresAt);

/// <summary>
/// Checks the tokens of the hub, strictly (AUTH-13). The signature is checked by Microsoft's token library against the keys the hub publishes, with the algorithm
/// fixed to ES256 (never "none", never a symmetric one); issuer, audience (this app's client id) and lifetime are checked by the same call. What is left
/// is ours: the nonce of the ID token, the claims we need, and for a logout token the event, the missing nonce and a recent issue time.
/// </summary>
public sealed class HubTokens(HubDirectory directory, TimeProvider clock)
{
    public const string LogoutEvent = "http://schemas.openid.net/event/backchannel-logout";
    private static readonly TimeSpan Skew = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan LogoutMaxAge = TimeSpan.FromMinutes(5);
    private static readonly Error Invalid = Error.Conflict("hub.token", "The token of the hub is not valid.");
    private static readonly JsonWebTokenHandler Handler = new() { MapInboundClaims = false };

    private async Task<Result<JsonWebToken>> ValidateAsync(string jwt, HubMetadata meta, string clientId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(jwt) || jwt.Length > 8192) return Invalid;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var keys = await directory.KeysAsync(meta, refresh: attempt > 0, ct);
            if (!keys.Ok) return keys.Error!;
            var result = await Handler.ValidateTokenAsync(jwt, new TokenValidationParameters
            {
                ValidIssuer = meta.Issuer,
                ValidAudience = clientId,
                IssuerSigningKeys = keys.Value,
                ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
                ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
                RequireSignedTokens = true, RequireExpirationTime = true,
                ClockSkew = Skew,
                // the time comes from the app's clock (CODE-05), with a minute of tolerance for clocks that differ a little
                LifetimeValidator = (notBefore, expires, _, _) => expires is { } end && end.ToUniversalTime() > clock.GetUtcNow().UtcDateTime - Skew && (notBefore is null || notBefore.Value.ToUniversalTime() < clock.GetUtcNow().UtcDateTime + Skew),
            });
            if (result.IsValid && result.SecurityToken is JsonWebToken valid) return valid;
            // an unknown key: the hub may have rotated, read its keys once more (the directory allows this once a minute)
            if (attempt == 0 && result.Exception is SecurityTokenSignatureKeyNotFoundException or SecurityTokenInvalidSignatureException) continue;
            return Invalid;
        }
        return Invalid;
    }

    /// <summary>The claims of a token whose signature, issuer, audience and lifetime are already checked, read from its own JSON.</summary>
    private sealed class Payload(JsonElement root)
    {
        public string? Text(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 and <= 256 } s ? s : null;
        public bool Has(string name) => root.TryGetProperty(name, out _);
        public JsonElement? Object(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : null;
        public long? Number(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n) ? n : null;
    }

    private static Payload Read(JsonWebToken t, out JsonDocument doc)
    {
        doc = JsonDocument.Parse(Base64UrlEncoder.DecodeBytes(t.EncodedPayload));
        return new Payload(doc.RootElement);
    }

    public async Task<Result<HubIdToken>> ValidateIdTokenAsync(string jwt, HubMetadata meta, string clientId, string expectedNonce, CancellationToken ct = default)
    {
        var checkedToken = await ValidateAsync(jwt, meta, clientId, ct);
        if (!checkedToken.Ok) return checkedToken.Error!;
        var p = Read(checkedToken.Value, out var doc);
        using (doc)
        {
            // nonce: ties the token to the sign-in this browser started; a missing or other nonce is a replayed or foreign token
            if (p.Text("nonce") is not { } nonce || !FixedEquals(nonce, expectedNonce)) return Invalid;
            if (p.Text("sub") is not { } sub || p.Text("sid") is not { } sid) return Invalid;
            // one role as a text; anything else (a list, a number) is no role at all
            return new HubIdToken(sub, sid, p.Text("preferred_username") ?? p.Text("name"), p.Text("role"));
        }
    }

    public async Task<Result<HubLogoutToken>> ValidateLogoutTokenAsync(string jwt, HubMetadata meta, string clientId, CancellationToken ct = default)
    {
        var checkedToken = await ValidateAsync(jwt, meta, clientId, ct);
        if (!checkedToken.Ok) return checkedToken.Error!;
        var t = checkedToken.Value;
        var p = Read(t, out var doc);
        using (doc)
        {
            if (p.Object("events") is not { } events || !events.TryGetProperty(LogoutEvent, out var ev) || ev.ValueKind != JsonValueKind.Object) return Invalid;
            if (p.Has("nonce")) return Invalid;                     // an ID token is not a logout token
            var sid = p.Text("sid"); var sub = p.Text("sub");
            if (sid is null && sub is null) return Invalid;
            if (p.Text("jti") is not { } jti) return Invalid;
            var now = clock.GetUtcNow();
            if (p.Number("iat") is not { } iat) return Invalid;
            var issued = DateTimeOffset.FromUnixTimeSeconds(iat);
            if (issued > now + Skew || now - issued > LogoutMaxAge) return Invalid;
            return new HubLogoutToken(sub, sid, jti, new DateTimeOffset(t.ValidTo, TimeSpan.Zero));
        }
    }

    private static bool FixedEquals(string a, string b) =>
        a.Length == b.Length && System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(a), System.Text.Encoding.UTF8.GetBytes(b));
}
