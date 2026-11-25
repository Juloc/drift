using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Base.Core;
using Microsoft.IdentityModel.Tokens;

namespace Base.Web;

/// <summary>What the hub says about itself at <c>/.well-known/openid-configuration</c>, checked: one origin, the issuer equal to the address that was asked.</summary>
public sealed record HubMetadata(string Issuer, string AuthorizationEndpoint, string TokenEndpoint, string JwksUri, string? EndSessionEndpoint);

/// <summary>
/// The calls from this server to the hub: its description, its public keys, the exchange of the code (AUTH-13). Everything is bounded: five seconds, no redirect,
/// no proxy, at most 128 KiB per answer, https (or this machine), and never to a link-local address (where cloud metadata lives). The description and the keys
/// are kept for ten minutes; a key that is not known triggers one new reading (at most once a minute), so a rotation at the hub does not need a restart here.
/// </summary>
public sealed class HubDirectory : IDisposable
{
    public const int MaxBytes = 128 * 1024;
    private static readonly TimeSpan Keep = TimeSpan.FromMinutes(10), RefreshGap = TimeSpan.FromMinutes(1);

    private readonly HttpClient _http;
    private readonly TimeProvider _clock;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private (string Url, HubMetadata Meta, DateTimeOffset At)? _meta;
    private (string Url, SecurityKey[] Keys, DateTimeOffset At)? _keys;

    public HubDirectory(TimeProvider clock, HttpMessageHandler? handler = null)
    {
        _clock = clock;
        _http = new HttpClient(handler ?? new SocketsHttpHandler { AllowAutoRedirect = false, UseProxy = false, ConnectCallback = GuardedConnectAsync, ConnectTimeout = TimeSpan.FromSeconds(5) })
        { Timeout = TimeSpan.FromSeconds(8) };
    }

    public void Dispose() { _http.Dispose(); _lock.Dispose(); }

    /// <summary>Forgets what was read (the settings changed, or the person asked to check the connection).</summary>
    public void Forget() { _meta = null; _keys = null; }

    private static bool Allowed(IPAddress a)
    {
        if (a.IsIPv4MappedToIPv6) a = a.MapToIPv4();
        if (a.Equals(IPAddress.Any) || a.Equals(IPAddress.IPv6Any) || a.IsIPv6Multicast || a.IsIPv6LinkLocal) return false;
        if (a.AddressFamily == AddressFamily.InterNetwork) { var b = a.GetAddressBytes(); if (b[0] == 169 && b[1] == 254 || b[0] >= 224) return false; }
        return true;
    }

    private static async ValueTask<Stream> GuardedConnectAsync(SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var addresses = (await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, ct)).Where(Allowed).ToArray();
        if (addresses.Length == 0) throw new HttpRequestException("The address of the hub is not allowed.");
        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try { await socket.ConnectAsync(addresses, context.DnsEndPoint.Port, ct); return new NetworkStream(socket, ownsSocket: true); }
        catch { socket.Dispose(); throw; }
    }

    private static async Task<string> ReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int n;
        while ((n = await stream.ReadAsync(chunk, ct)) > 0)
        {
            buffer.Write(chunk, 0, n);
            if (buffer.Length > MaxBytes) throw new HttpRequestException("The answer of the hub is too large.");
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private async Task<string> GetAsync(string url, CancellationToken ct)
    {
        using var response = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode) throw new HttpRequestException($"The hub answered {(int)response.StatusCode}.", null, response.StatusCode);
        return await ReadAsync(response, ct);
    }

    private static string Origin(string url) => new Uri(url).GetLeftPart(UriPartial.Authority);

    private static string? Endpoint(JsonElement doc, string name, string origin)
    {
        if (!doc.TryGetProperty(name, out var e) || e.ValueKind != JsonValueKind.String || e.GetString() is not { } text) return null;
        return Uri.TryCreate(text, UriKind.Absolute, out var u) && u.GetLeftPart(UriPartial.Authority) == origin && u.Fragment.Length == 0 && u.UserInfo.Length == 0 ? text : null;
    }

    /// <summary>The description of the hub at <paramref name="url"/> (already normalised, see <see cref="HubUrl"/>).</summary>
    public async Task<Result<HubMetadata>> DiscoverAsync(string url, CancellationToken ct = default, TimeSpan? maxAge = null)
    {
        if (_meta is { } m && m.Url == url && _clock.GetUtcNow() - m.At < (maxAge ?? Keep)) return m.Meta;
        try
        {
            using var doc = JsonDocument.Parse(await GetAsync(url + "/.well-known/openid-configuration", ct));
            var root = doc.RootElement;
            var issuer = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("issuer", out var i) && i.ValueKind == JsonValueKind.String ? i.GetString() : null;
            // the issuer in the description must be the address we asked: otherwise a description could vouch for another hub
            if (issuer is null || issuer.TrimEnd('/') != url) return Error.Conflict("hub.metadata", "The description of the hub is not valid (issuer).");
            var origin = Origin(url);
            var auth = Endpoint(root, "authorization_endpoint", origin);
            var token = Endpoint(root, "token_endpoint", origin);
            var jwks = Endpoint(root, "jwks_uri", origin);
            if (auth is null || token is null || jwks is null) return Error.Conflict("hub.metadata", "The description of the hub is not valid (endpoints).");
            if (root.TryGetProperty("code_challenge_methods_supported", out var methods) && methods.ValueKind == JsonValueKind.Array && !methods.EnumerateArray().Any(x => x.GetString() == "S256"))
                return Error.Conflict("hub.metadata", "The hub does not support PKCE S256.");
            var meta = new HubMetadata(url, auth, token, jwks, Endpoint(root, "end_session_endpoint", origin));
            _meta = (url, meta, _clock.GetUtcNow());
            return meta;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException) { return Unreachable(e); }
    }

    internal static Error Unreachable(Exception e) => Error.Conflict("hub.unreachable", "The hub cannot be reached (" + Reason(e) + ").");

    /// <summary>A few plain words for why a call failed (shown in the settings next to "check connection"), never the name of an exception type.</summary>
    private static string Reason(Exception e) => e switch
    {
        TaskCanceledException => "no answer in time",
        HttpRequestException { HttpRequestError: HttpRequestError.NameResolutionError } => "the name is not known",
        HttpRequestException { HttpRequestError: HttpRequestError.ConnectionError } => "nothing answers at that address",
        HttpRequestException { HttpRequestError: HttpRequestError.SecureConnectionError } => "the secure connection failed",
        HttpRequestException { StatusCode: { } code } => $"it answered {(int)code}",
        JsonException => "the answer is not a description of a hub",
        _ => "no valid answer",
    };

    /// <summary>The signing keys of the hub. <paramref name="refresh"/> asks again, but never more often than once a minute.</summary>
    public async Task<Result<SecurityKey[]>> KeysAsync(HubMetadata meta, bool refresh, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var now = _clock.GetUtcNow();
            if (_keys is { } k && k.Url == meta.Issuer && now - k.At < Keep && !(refresh && now - k.At >= RefreshGap)) return k.Keys;
            try
            {
                var set = new JsonWebKeySet(await GetAsync(meta.JwksUri, ct));
                SecurityKey[] keys = [.. set.GetSigningKeys()];
                if (keys.Length == 0) return Error.Conflict("hub.metadata", "The hub published no signing key.");
                _keys = (meta.Issuer, keys, now);
                return keys;
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or ArgumentException) { return Unreachable(e); }
        }
        finally { _lock.Release(); }
    }

    /// <summary>The name the hub gives itself (<c>/api/about</c>, anonymous), or null when it has none to show.</summary>
    public async Task<string?> ReadNameAsync(string url, CancellationToken ct = default)
    {
        try
        {
            using var doc = JsonDocument.Parse(await GetAsync(url + "/api/about", ct));
            return doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String
                   && n.GetString()?.Trim() is { Length: > 0 and <= 60 } name && !name.Any(char.IsControl) ? name : null;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException) { return null; }
    }

    /// <summary>Exchanges the code for the ID token (client_secret_basic, PKCE verifier). Returns the raw ID token.</summary>
    public async Task<Result<string>> ExchangeAsync(HubMetadata meta, string clientId, string secret, string code, string redirectUri, string verifier, CancellationToken ct = default)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, meta.TokenEndpoint)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "authorization_code", ["code"] = code, ["redirect_uri"] = redirectUri, ["code_verifier"] = verifier,
                }),
            };
            // RFC 6749: the id and the secret are form-encoded before they are joined for Basic
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.EscapeDataString(clientId)}:{Uri.EscapeDataString(secret)}")));
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            var body = await ReadAsync(response, ct);
            if (!response.IsSuccessStatusCode) return Error.Conflict("hub.exchange", $"The hub refused the code ({(int)response.StatusCode}).");
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("id_token", out var t) && t.ValueKind == JsonValueKind.String && t.GetString() is { Length: > 0 and < 8192 } jwt
                ? jwt : Error.Conflict("hub.exchange", "The answer of the hub has no ID token.");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException) { return Unreachable(e); }
    }
}
