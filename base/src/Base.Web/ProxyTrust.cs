using System.Net;
using System.Text.Json;

namespace Base.Web;

/// <summary>
/// Which addresses count as the reverse proxy in front of the app. Only from them the server believes X-Forwarded-For, -Proto and -Host
/// (the real client address for lockouts, and whether the person arrived over HTTPS, which decides the cookie).
/// The list is the instance setting <c>proxy.trusted</c> (addresses or networks, changed in the app, effective at once). As long as it is not set,
/// every private network counts: that works behind a proxy on the same host or Docker network without any setup, but a device in the same network
/// that reaches the port directly could fake its address. Behind a proxy, set it to the proxy's address and publish the port only to it.
/// </summary>
public sealed class ProxyTrust
{
    public const string SettingKey = "proxy.trusted";

    private static readonly IPNetwork[] PrivateNetworks =
    [
        IPNetwork.Parse("127.0.0.0/8"), IPNetwork.Parse("::1/128"), IPNetwork.Parse("10.0.0.0/8"), IPNetwork.Parse("172.16.0.0/12"),
        IPNetwork.Parse("192.168.0.0/16"), IPNetwork.Parse("fc00::/7"),
    ];

    private volatile IPNetwork[] _networks = PrivateNetworks;

    /// <summary>True while no list is set and every private network is believed.</summary>
    public bool Unset { get; private set; } = true;

    /// <summary>Takes over the stored setting (a JSON list of addresses or networks); null or an empty list means "not set".</summary>
    public void Apply(string? json)
    {
        var list = new List<IPNetwork>();
        if (json is not null)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    foreach (var e in doc.RootElement.EnumerateArray())
                        if (e.ValueKind == JsonValueKind.String && TryParseNetwork(e.GetString()!, out var net)) list.Add(net);
            }
            catch (JsonException) { /* an unreadable value counts as not set */ }
        }
        Unset = list.Count == 0;
        _networks = Unset ? PrivateNetworks : [.. list];
    }

    public bool IsTrusted(IPAddress? address)
    {
        if (address is null) return false;
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        foreach (var n in _networks) if (n.Contains(address)) return true;
        return false;
    }

    /// <summary>An address ("192.0.2.10") or a network ("192.0.2.0/24").</summary>
    public static bool TryParseNetwork(string text, out IPNetwork network)
    {
        if (IPNetwork.TryParse(text, out network)) return true;
        if (IPAddress.TryParse(text, out var a)) { network = new IPNetwork(a, a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork ? 32 : 128); return true; }
        return false;
    }
}
