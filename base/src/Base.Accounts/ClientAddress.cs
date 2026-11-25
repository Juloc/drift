using System.Net;
using System.Net.Sockets;

namespace Base.Accounts;

/// <summary>
/// The key of a client address for lockouts and for the list of devices. IPv4 stays the address itself. For IPv6 the whole /64 counts:
/// a line normally gets a /64 and can change addresses inside it at will, so a lockout per address would be walked around.
/// </summary>
public static class ClientAddress
{
    public static string Key(IPAddress? address)
    {
        if (address is null) return "?";
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (address.AddressFamily != AddressFamily.InterNetworkV6) return address.ToString();
        Span<byte> bytes = stackalloc byte[16];
        address.TryWriteBytes(bytes, out _);
        bytes[8..].Clear();
        return new IPAddress(bytes).ToString() + "/64";
    }
}
