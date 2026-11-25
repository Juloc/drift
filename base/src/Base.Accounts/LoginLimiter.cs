using System.Collections.Concurrent;

namespace Base.Accounts;

/// <summary>
/// Lockout after failed attempts, with a wait that doubles (AUTH-05). Keys: "ip:..." (more generous: 10 failures, then 1 minute and up),
/// everything else ("user:...", "acct:...", "setup:...") stricter (5 failures, then 30 seconds and up); the wait is capped at 15 minutes.
/// After an hour without a failure the count is forgotten. The counters live in memory: a restart clears them, which costs an attacker nothing
/// he could use (the wait is short) and needs no table that every attempt writes to.
/// </summary>
public sealed class LoginLimiter(TimeProvider? clock = null)
{
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;
    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    private sealed class Entry { public int Failures; public DateTimeOffset Last; public DateTimeOffset LockedUntil; }

    private static (int Limit, TimeSpan Base, TimeSpan Max) PolicyFor(string key) =>
        key.StartsWith("ip:", StringComparison.Ordinal) ? (10, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(15))
                                                        : (5, TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(15));

    /// <summary>The rest of the lockout, <see cref="TimeSpan.Zero"/> when free.</summary>
    public TimeSpan Wait(string key)
    {
        if (!_entries.TryGetValue(key, out var e)) return TimeSpan.Zero;
        lock (e) { var left = e.LockedUntil - _clock.GetUtcNow(); return left > TimeSpan.Zero ? left : TimeSpan.Zero; }
    }

    /// <summary>The longest wait of several keys, in whole seconds (0 when all are free).</summary>
    public int WaitSeconds(params string[] keys) => (int)Math.Ceiling(keys.Max(Wait).TotalSeconds);

    public void Fail(string key)
    {
        var now = _clock.GetUtcNow();
        var (limit, baseWait, max) = PolicyFor(key);
        var e = _entries.GetOrAdd(key, _ => new Entry { Last = now });
        lock (e)
        {
            if (now - e.Last > TimeSpan.FromHours(1)) e.Failures = 0;
            e.Failures++;
            e.Last = now;
            if (e.Failures >= limit)
            {
                var factor = Math.Pow(2, Math.Min(e.Failures - limit, 20));
                var wait = TimeSpan.FromTicks((long)Math.Min(max.Ticks, baseWait.Ticks * factor));
                e.LockedUntil = now + wait;
            }
        }
    }

    public void Succeed(string key) => _entries.TryRemove(key, out _);

    // Checks running at the same time per key: failures are only counted after the (expensive) password check, so a burst of
    // simultaneous requests would pass the lockout and fill the Argon2 memory and the queue.
    private readonly ConcurrentDictionary<string, int> _running = new();

    /// <summary>Announces a check. False when <paramref name="max"/> are already running for this key; otherwise <see cref="End"/> must follow.</summary>
    public bool TryBegin(string key, int max)
    {
        var n = _running.AddOrUpdate(key, 1, (_, c) => c + 1);
        if (n <= max) return true;
        End(key);
        return false;
    }

    public void End(string key)
    {
        if (_running.AddOrUpdate(key, 0, (_, c) => c - 1) <= 0) _running.TryRemove(new KeyValuePair<string, int>(key, 0));
    }

    /// <summary>Forgets counters that have been quiet for an hour (called by the purge worker).</summary>
    public void Sweep()
    {
        var now = _clock.GetUtcNow();
        foreach (var (k, e) in _entries) if (now - e.Last > TimeSpan.FromHours(1)) _entries.TryRemove(k, out _);
    }
}
