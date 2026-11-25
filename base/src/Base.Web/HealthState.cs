using System.Collections.Concurrent;

namespace Base.Web;

/// <summary>
/// "It works, but something is wrong" (health status <c>degraded</c>). The base and the app set a named signal when something is off and clear it when it is
/// fine again; health only reads this list, it never calls another service. The reasons are never sent to anybody without a session (CONTRACT-01).
/// </summary>
public sealed class HealthState
{
    private readonly ConcurrentDictionary<string, bool> _signals = new();

    public void Set(string signal, bool wrong)
    {
        if (wrong) _signals[signal] = true; else _signals.TryRemove(signal, out _);
    }

    public bool Degraded => !_signals.IsEmpty;

    public IReadOnlyCollection<string> Signals => [.. _signals.Keys];
}
