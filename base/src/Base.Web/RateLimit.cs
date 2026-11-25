using System.Collections.Concurrent;

namespace Base.Web;

/// <summary>
/// A plain limit for anonymous paths: so many requests per client address and minute (fixed window, in memory). A restart forgets the counters,
/// which is fine: this keeps a stranger from using a free path as a tap, it is not a lock.
/// </summary>
public sealed class RateLimit(TimeProvider clock)
{
    private readonly ConcurrentDictionary<string, (long Window, int Count)> _counts = new();

    /// <summary>True while the address is within its limit for this bucket; the request is counted. Otherwise the seconds to wait are in <paramref name="retryAfter"/>.</summary>
    public bool Allow(string bucket, string ip, int perMinute, out int retryAfter)
    {
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        var window = now / 60;
        if (_counts.Count > 5000) foreach (var (k, v) in _counts) if (v.Window < window) _counts.TryRemove(k, out _);
        var entry = _counts.AddOrUpdate(bucket + "|" + ip, (window, 1), (_, old) => old.Window == window ? (window, old.Count + 1) : (window, 1));
        retryAfter = (int)((window + 1) * 60 - now);
        return entry.Count <= perMinute;
    }
}
