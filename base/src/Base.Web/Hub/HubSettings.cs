using System.Net;
using System.Text.Json;
using Base.Accounts;
using Base.Web.Settings;

namespace Base.Web;

/// <summary>The settings of "Sign in through the hub". The secret is only ever used, never shown.</summary>
public sealed record HubConfig(string? Url, string? ClientId, string? Secret, bool Enabled, string? Name)
{
    /// <summary>Address, client id and secret are all there.</summary>
    public bool Complete => Url is not null && ClientId is not null && Secret is not null;

    /// <summary>Ready for people: switched on and complete.</summary>
    public bool Active => Enabled && Complete;

    /// <summary>What people see on the button: the name the hub gave itself, else the name of its host.</summary>
    public string DisplayName => Name ?? (Url is not null && Uri.TryCreate(Url, UriKind.Absolute, out var u) ? u.Host : "hub");
}

/// <summary>
/// Where the settings live: <c>instance_settings</c>, under keys of their own that no generic rule knows, so the plain settings API can neither read nor write
/// them (OPS-03). The secret is encrypted with the key that is not in the database (<see cref="SecretBox"/>) and is never sent to a browser (AUTH-13).
/// </summary>
public sealed class HubSettingsStore(SettingsStore store, SecretBox box)
{
    public const string UrlKey = "hub.url", ClientKey = "hub.client_id", SecretKey = "hub.secret", EnabledKey = "hub.enabled", NameKey = "hub.name";

    // the secret is bound to this fixed owner id, so it cannot be moved to another row of the table
    private static readonly Guid SecretOwner = new("3f6c2c4a-5f0e-4f4b-9d5e-0b0a4f1c7a11");

    private static string? Text(IReadOnlyDictionary<string, string> all, string key) =>
        all.TryGetValue(key, out var json) && JsonDocument.Parse(json).RootElement is { ValueKind: JsonValueKind.String } e ? e.GetString() : null;

    public async Task<HubConfig> GetAsync(CancellationToken ct = default)
    {
        var all = await store.GetInstanceAsync(ct);
        string? secret = null;
        if (Text(all, SecretKey) is { Length: > 0 } sealedValue)
        {
            try { secret = box.Decrypt(Convert.FromBase64String(sealedValue), SecretOwner); }
            catch (FormatException) { /* damaged: as if not set */ }
        }
        return new HubConfig(Text(all, UrlKey), Text(all, ClientKey), secret, all.TryGetValue(EnabledKey, out var on) && on == "true", Text(all, NameKey));
    }

    private static string Json(string s) => JsonSerializer.Serialize(s);

    public async Task SaveAsync(string? url, string? clientId, string? newSecret, bool enabled, CancellationToken ct = default)
    {
        var before = await GetAsync(ct);
        if (url is null) await store.DeleteInstanceAsync(UrlKey, ct); else await store.SetInstanceAsync(UrlKey, Json(url), ct);
        if (clientId is null) await store.DeleteInstanceAsync(ClientKey, ct); else await store.SetInstanceAsync(ClientKey, Json(clientId), ct);
        if (newSecret is not null) await store.SetInstanceAsync(SecretKey, Json(Convert.ToBase64String(box.Encrypt(newSecret, SecretOwner))), ct);
        await store.SetInstanceAsync(EnabledKey, JsonSerializer.Serialize(enabled), ct);
        if (url != before.Url) await store.DeleteInstanceAsync(NameKey, ct);          // the name belongs to the address it was read from
    }

    /// <summary>Keeps the name the hub gave itself, or forgets it (null: the hub has none to show now).</summary>
    public Task SetNameAsync(string? name, CancellationToken ct = default) => name is null ? store.DeleteInstanceAsync(NameKey, ct) : store.SetInstanceAsync(NameKey, Json(name), ct);

    public async Task ClearAsync(CancellationToken ct = default)
    {
        foreach (var key in new[] { UrlKey, ClientKey, SecretKey, EnabledKey, NameKey }) await store.DeleteInstanceAsync(key, ct);
    }
}

/// <summary>What an address of the hub may look like. A secret travels to it, so it is https; plain http only for this machine (development).</summary>
public static class HubUrl
{
    public static string? Normalize(string? input)
    {
        var text = (input ?? "").Trim();
        if (text.Length is 0 or > 200 || !Uri.TryCreate(text, UriKind.Absolute, out var uri)) return null;
        if (uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.AbsolutePath != "/" || uri.Host.Length == 0) return null;
        var local = IsLocal(uri.Host);
        if (!(uri.Scheme == "https" || (uri.Scheme == "http" && local))) return null;
        return uri.GetLeftPart(UriPartial.Authority);
    }

    public static bool IsLocal(string host) =>
        host == "localhost" || host.EndsWith(".localhost", StringComparison.Ordinal) || (IPAddress.TryParse(host.Trim('[', ']'), out var ip) && IPAddress.IsLoopback(ip));
}
