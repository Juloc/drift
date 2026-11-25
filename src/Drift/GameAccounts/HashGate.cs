namespace Drift.GameAccounts;

/// <summary>
/// A gate of its own in front of the password hashing of the games accounts. The base's hasher lets three computations run at once for the whole app; if a flood of
/// public sign-ins queued up in there, the administrator's sign-in would wait behind them. Here at most two game hashes enter it (leaving a slot
/// for the base), and one that cannot get in within three seconds is refused at once ("try again") instead of piling up.
/// </summary>
public sealed class HashGate
{
    readonly SemaphoreSlim gate;
    readonly TimeSpan wait;
    public int Shed;

    public HashGate() : this(2, TimeSpan.FromSeconds(3)) { }
    public HashGate(int capacity, TimeSpan wait) { gate = new(capacity); this.wait = wait; }

    /// <summary>Runs the work inside the gate; Entered is false when the gate stayed full for too long (the caller answers "too many").</summary>
    public async Task<(bool Entered, T Value)> RunAsync<T>(Func<Task<T>> work)
    {
        if (!await gate.WaitAsync(wait)) { Interlocked.Increment(ref Shed); return (false, default!); }
        try { return (true, await work()); }
        finally { gate.Release(); }
    }
}
