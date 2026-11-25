// The shared-world relay of the public demo: no accounts, no sockets, no outside packages.
// It hands out ids and names from a fixed list, checks every pose (rate, size, bounds, speed, jumps, spin),
// and sends every visitor the others' poses 15 times a second. docs/ARCHITECTURE.md section 10 is the design.
// The caller passes frames in (Join, OnMessage, Leave) and calls Tick() 15 times a second.
using System.Diagnostics;

namespace Drift.Relay;

/// <summary>What the relay needs from a connection: a non-blocking send and a close.</summary>
public interface IPeer
{
    void Send(ReadOnlySpan<byte> frame);
    void Close(byte reason);
}

/// <summary>A peer that can also be sent text frames (the signed-in app uses them for invitations and race messages; the public world does not).</summary>
public interface ITextPeer : IPeer
{
    void SendText(string text);
}

/// <summary>An accepted pose with the relay's own receive time (seconds on the relay's clock), for a caller that follows the cars (a race).</summary>
public readonly record struct PoseSample(Session Session, double X, double Z, double Heading, double Vf, double Beta, byte Flags, double Seconds);

public sealed class RelayOptions
{
    public int MaxPerWorld { get; init; } = 16;
    public int MaxWorlds { get; init; } = 8;
    public int MaxPerAddress { get; init; } = 4;
    public int JoinsPerMinutePerAddress { get; init; } = 12;
    public int FramesPerSecondPerAddress { get; init; } = 80;
    public double PoseHz { get; init; } = 15;
    /// <summary>Half the size of the map plus a margin, metres.</summary>
    public double HalfX { get; init; } = 113;
    public double HalfZ { get; init; } = 78;
    /// <summary>Top speed of each car, m/s (index = car id); the same numbers as game/data/cars.json.</summary>
    public double[] Top { get; init; } = [35, 31, 39, 36, 28];
    public double IdleSeconds { get; init; } = 120;
    public double SilentSeconds { get; init; } = 30;
    public int MaxFrame { get; init; } = 64;
}

public static class Wire
{
    public const byte Pose = 1, Welcome = 0x80, Roster = 0x81, Snapshot = 0x82, Fix = 0x83, Bye = 0x84;
    public const int PoseLength = 13, EntryLength = 12;
    public const byte ByeLarge = 1, ByeViolations = 2, ByeIdle = 3, ByeSilent = 4, ByeFull = 5, ByeReplaced = 6, ByeSession = 7;

    public static short I16(ReadOnlySpan<byte> b, int i) => (short)(b[i] | (b[i + 1] << 8));
    public static ushort U16(ReadOnlySpan<byte> b, int i) => (ushort)(b[i] | (b[i + 1] << 8));
    public static void Put16(Span<byte> b, int i, int v) { b[i] = (byte)v; b[i + 1] = (byte)(v >> 8); }
}

public sealed class Session
{
    public byte Id { get; internal set; }
    public int World { get; internal set; }
    public byte Car { get; internal set; }
    public byte Hue { get; internal set; }
    public string Name { get; internal set; } = "";
    public string Address { get; internal set; } = "";
    public IPeer Peer { get; internal set; } = null!;
    internal bool HasPose;
    internal byte[] Last = new byte[Wire.PoseLength]; // last accepted POSE frame
    internal double X, Z, H;
    internal long LastMsg, LastMove, LastPoseAt;
    internal double Budget, Tokens = 8;
    internal long TokenAt;
    internal int Dropped; internal long DroppedSince;
    internal int Violations; internal long ViolationsSince;
    internal bool Gone;
}

public sealed class RelayStats
{
    public long BytesIn, BytesOut, FramesIn, FramesOut, Accepted, Rejected, Ticks, TickTicks;
    public int Visitors, Worlds;
}

public sealed class WorldRelay(TimeProvider time, RelayOptions? options = null, Random? random = null)
{
    public static readonly string[] Colours = ["Red", "Orange", "Amber", "Lime", "Green", "Mint", "Teal", "Sky", "Blue", "Indigo", "Violet", "Pink"];
    public static readonly string[] Animals = ["Otter", "Fox", "Heron", "Badger", "Lynx", "Gecko", "Falcon", "Wombat", "Marmot", "Ibis", "Newt", "Panda", "Moose", "Stoat", "Puffin", "Koala"];

    readonly RelayOptions o = options ?? new();
    readonly Random rnd = random ?? Random.Shared;
    readonly object gate = new();
    readonly List<List<Session>> worlds = [];
    readonly Dictionary<string, AddressState> addresses = [];
    public RelayStats Stats { get; } = new();
    /// <summary>Called, under the relay's lock, for every accepted pose: keep it short (queue it, do not call back into the relay).</summary>
    public Action<PoseSample>? PoseAccepted { get; set; }
    /// <summary>Size for a receive buffer: a frame longer than this is too large.</summary>
    public int MaxFrameBuffer => o.MaxFrame;

    sealed class AddressState { public int Connections; public double Tokens; public long TokenAt; public Queue<long> Joins = new(); }

    double Seconds(long ts) => ts / (double)time.TimestampFrequency;

    /// <summary>
    /// Let a visitor in. Returns null (after telling the peer why) if the relay refuses. With <paramref name="name"/> and
    /// <paramref name="hue"/> (0..23) the caller says who the visitor is (a signed-in person); without them the relay picks
    /// a name from its fixed list and a free colour (the public world). The caller has checked the text of a name.
    /// </summary>
    public Session? Join(IPeer peer, string address, int car, string? name = null, int? hue = null)
    {
        lock (gate)
        {
            var now = time.GetTimestamp();
            if (!addresses.TryGetValue(address, out var a)) addresses[address] = a = new AddressState { Tokens = o.FramesPerSecondPerAddress, TokenAt = now };
            while (a.Joins.Count > 0 && Seconds(now - a.Joins.Peek()) > 60) a.Joins.Dequeue();
            if (a.Connections >= o.MaxPerAddress || a.Joins.Count >= o.JoinsPerMinutePerAddress) { Refuse(peer, Wire.ByeFull); return null; }
            // first world with room, else a new one
            int w = worlds.FindIndex(x => x.Count < o.MaxPerWorld);
            if (w < 0)
            {
                if (worlds.Count >= o.MaxWorlds) { Refuse(peer, Wire.ByeFull); return null; }
                worlds.Add([]); w = worlds.Count - 1;
            }
            var members = worlds[w];
            byte id = 0; while (members.Any(m => m.Id == id)) id++;
            var s = new Session
            {
                Id = id, World = w, Car = (byte)(car >= 0 && car < o.Top.Length ? car : 0), Peer = peer, Address = address,
                LastMsg = now, LastMove = now, TokenAt = now, DroppedSince = now, ViolationsSince = now,
                Hue = hue is >= 0 and < 24 ? (byte)hue.Value : PickHue(members),
            };
            s.Name = name is { Length: > 0 } ? Clean(name) : PickName(members, s.Hue);
            members.Add(s);
            a.Connections++; a.Joins.Enqueue(now);
            Send(s, [Wire.Welcome, s.Id, (byte)s.World, s.Hue]);
            BroadcastRoster(members);
            return s;
        }
    }

    public void Leave(Session s)
    {
        lock (gate)
        {
            if (s.Gone) return;
            s.Gone = true;
            if (addresses.TryGetValue(s.Address, out var a) && a.Connections > 0) a.Connections--;
            var members = worlds[s.World];
            members.Remove(s);
            BroadcastRoster(members);
            // an empty last world closes; earlier ones keep their number while anyone is in a later one
            while (worlds.Count > 0 && worlds[^1].Count == 0) worlds.RemoveAt(worlds.Count - 1);
        }
    }

    /// <summary>One frame from a visitor.</summary>
    public void OnMessage(Session s, ReadOnlySpan<byte> f)
    {
        lock (gate)
        {
            if (s.Gone) return;
            var now = time.GetTimestamp();
            Stats.BytesIn += f.Length + 6; Stats.FramesIn++;
            if (f.Length > o.MaxFrame) { Kick(s, Wire.ByeLarge); return; }
            // all connections of one address share a frame budget
            var a = addresses[s.Address];
            a.Tokens = Math.Min(o.FramesPerSecondPerAddress, a.Tokens + Seconds(now - a.TokenAt) * o.FramesPerSecondPerAddress); a.TokenAt = now;
            if (a.Tokens < 1) { Stats.Rejected++; return; }
            a.Tokens--;
            if (f.Length != Wire.PoseLength || f[0] != Wire.Pose) { Stats.Rejected++; return; }
            // a per-connection bucket: 15 a second sustained, a burst of 8
            s.Tokens = Math.Min(8, s.Tokens + Seconds(now - s.TokenAt) * (o.PoseHz + 3)); s.TokenAt = now;
            if (s.Tokens < 1)
            {
                if (Seconds(now - s.DroppedSince) > 10) { s.Dropped = 0; s.DroppedSince = now; }
                Stats.Rejected++;
                if (++s.Dropped > 150) Kick(s, Wire.ByeLarge);
                return;
            }
            s.Tokens--;
            s.LastMsg = now;
            Check(s, f, now);
        }
    }

    /// <summary>End a visitor's connection from the outside (a replaced or ended session): tells it why, closes, leaves.</summary>
    public void Drop(Session s, byte reason) { lock (gate) { if (!s.Gone) Kick(s, reason); } }

    /// <summary>A name as the wire carries it: no control characters, at most 24 characters and 60 bytes.</summary>
    static string Clean(string name)
    {
        var t = new string(name.Where(c => !char.IsControl(c)).Take(24).ToArray()).Trim();
        while (System.Text.Encoding.UTF8.GetByteCount(t) > 60) t = t[..^1];
        return t.Length > 0 ? t : "Driver";
    }

    /// <summary>A frame that did not fit the receive buffer: too large.</summary>
    public void OnOversize(Session s) { lock (gate) { if (!s.Gone) Kick(s, Wire.ByeLarge); } }

    void Check(Session s, ReadOnlySpan<byte> f, long now)
    {
        double x = Wire.I16(f, 2) / 20.0, z = Wire.I16(f, 4) / 20.0, h = Wire.U16(f, 6) * (2 * Math.PI / 65536), vf = Wire.I16(f, 8) / 50.0;
        double top = o.Top[s.Car];
        bool ok = Math.Abs(x) <= o.HalfX && Math.Abs(z) <= o.HalfZ && Math.Abs(vf) <= 1.15 * top + 2;
        if (ok && s.HasPose)
        {
            double dt = Math.Min(0.5, Seconds(now - s.LastPoseAt));
            double rate = 1.25 * top + 3;
            s.Budget = Math.Min(0.5 * rate, s.Budget + dt * rate);
            double d = double.Hypot(x - s.X, z - s.Z);
            double dh = Math.Abs(h - s.H); if (dh > Math.PI) dh = 2 * Math.PI - dh;
            if (d > s.Budget + 0.5 || dh > 12 * Math.Max(dt, 0.02) + 0.5) ok = false;
            else { s.Budget = Math.Max(0, s.Budget - d); if (d > 0.1 || Math.Abs(vf) > 0.3) s.LastMove = now; }
        }
        else if (ok) s.LastMove = now; // the first pose
        if (!ok)
        {
            Stats.Rejected++;
            if (Seconds(now - s.ViolationsSince) > 10) { s.Violations = 0; s.ViolationsSince = now; }
            if (++s.Violations >= 8) { Kick(s, Wire.ByeViolations); return; }
            if (s.HasPose) { var fix = new byte[8]; fix[0] = Wire.Fix; Array.Copy(s.Last, 2, fix, 1, 6); Send(s, fix); }
            else { s.X = 0; s.Z = 0; }
            return;
        }
        Stats.Accepted++;
        f.CopyTo(s.Last); s.X = x; s.Z = z; s.H = h; s.LastPoseAt = now; s.HasPose = true;
        PoseAccepted?.Invoke(new PoseSample(s, x, z, h, vf, (sbyte)f[10] * Math.PI / 128, f[12], Seconds(now)));
    }

    /// <summary>Call 15 times a second: sends the snapshots and drops idle or silent visitors.</summary>
    public void Tick()
    {
        lock (gate)
        {
            var t0 = Stopwatch.GetTimestamp();
            var now = time.GetTimestamp();
            foreach (var members in worlds.ToArray())
                foreach (var s in members.ToArray())
                {
                    if (Seconds(now - s.LastMsg) > o.SilentSeconds) Kick(s, Wire.ByeSilent);
                    else if (Seconds(now - s.LastMove) > o.IdleSeconds) Kick(s, Wire.ByeIdle);
                }
            ushort stamp = (ushort)(long)(Seconds(now) * 1000);
            Span<byte> buf = stackalloc byte[4 + Wire.EntryLength * 64];
            foreach (var members in worlds)
            {
                foreach (var me in members)
                {
                    int n = 0;
                    foreach (var other in members)
                    {
                        if (other == me || !other.HasPose) continue;
                        int p = 4 + n * Wire.EntryLength;
                        buf[p] = other.Id;
                        other.Last.AsSpan(2, 11).CopyTo(buf.Slice(p + 1));
                        n++;
                    }
                    buf[0] = Wire.Snapshot; buf[1] = (byte)n; Wire.Put16(buf, 2, stamp);
                    if (n > 0) Send(me, buf[..(4 + n * Wire.EntryLength)]);
                }
            }
            Stats.Ticks++; Stats.TickTicks += Stopwatch.GetTimestamp() - t0;
            Stats.Visitors = worlds.Sum(w => w.Count); Stats.Worlds = worlds.Count;
        }
    }

    public int Visitors { get { lock (gate) return worlds.Sum(w => w.Count); } }
    public int WorldCount { get { lock (gate) return worlds.Count; } }

    // ---- helpers (called under the lock)
    void Refuse(IPeer peer, byte reason) { peer.Send([Wire.Bye, reason]); peer.Close(reason); }

    void Kick(Session s, byte reason)
    {
        Send(s, [Wire.Bye, reason]);
        s.Peer.Close(reason);
        Leave(s);
    }

    void Send(Session s, ReadOnlySpan<byte> frame)
    {
        Stats.BytesOut += frame.Length + 2; Stats.FramesOut++;
        s.Peer.Send(frame);
    }

    void BroadcastRoster(List<Session> members)
    {
        var ms = new MemoryStream();
        ms.WriteByte(Wire.Roster); ms.WriteByte((byte)members.Count);
        foreach (var m in members)
        {
            var name = System.Text.Encoding.UTF8.GetBytes(m.Name);
            ms.WriteByte(m.Id); ms.WriteByte(m.Car); ms.WriteByte(m.Hue); ms.WriteByte((byte)name.Length); ms.Write(name);
        }
        var frame = ms.ToArray();
        foreach (var m in members) Send(m, frame);
    }

    /// <summary>The colour word follows the car's hue (24 hues of 15 degrees, 12 words), the animal is free.</summary>
    string PickName(List<Session> members, byte hue)
    {
        var colour = Colours[hue / 2 % Colours.Length];
        for (int tries = 0; tries < 200; tries++)
        {
            var n = colour + " " + Animals[rnd.Next(Animals.Length)];
            if (!members.Any(m => m.Name == n)) return n;
        }
        return colour + " " + Animals[rnd.Next(Animals.Length)];
    }

    byte PickHue(List<Session> members)
    {
        var free = Enumerable.Range(0, 24).Where(h => !members.Any(m => m.Hue == h)).ToArray();
        return (byte)(free.Length > 0 ? free[rnd.Next(free.Length)] : rnd.Next(24));
    }
}
