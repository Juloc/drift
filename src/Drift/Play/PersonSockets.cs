using Drift.Relay;

namespace Drift.Play;

/// <summary>
/// The open game sockets by person (a signed-in person or a guest): one lobby socket and one race socket each. A new socket replaces the old one of the
/// same kind, and a person can be dropped from outside (a guest link ended, a session blocked).
/// </summary>
public sealed class PersonSockets
{
    readonly object gate = new();
    readonly Dictionary<(Guid, bool), (WorldRelay Relay, Session Session)> live = [];

    /// <summary>Registers a socket; an older one of the same person and kind is dropped (outside the lock).</summary>
    public void Register(Guid person, bool race, WorldRelay relay, Session session)
    {
        (WorldRelay Relay, Session Session) old;
        bool had;
        lock (gate) { had = live.TryGetValue((person, race), out old); live[(person, race)] = (relay, session); }
        if (had) old.Relay.Drop(old.Session, Wire.ByeReplaced);
    }

    public void Unregister(Guid person, bool race, Session session)
    {
        lock (gate) { if (live.TryGetValue((person, race), out var cur) && cur.Session == session) live.Remove((person, race)); }
    }

    /// <summary>Closes every socket of these people at once.</summary>
    public void DropAll(IEnumerable<Guid> people, byte reason)
    {
        var drop = new List<(WorldRelay Relay, Session Session)>();
        lock (gate) foreach (var p in people) foreach (var race in new[] { false, true }) if (live.TryGetValue((p, race), out var e)) drop.Add(e);
        foreach (var (relay, session) in drop) relay.Drop(session, reason);
    }
}
