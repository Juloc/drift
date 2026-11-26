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
    /// <summary>
    /// Interest areas, metres. 0 = off (the public demo and the races): everybody gets every car every tick, as always. Above 0, a visitor gets the full pose of the cars
    /// within this distance every tick, and only a short entry (position and heading) of the cars further away, every <see cref="FarEvery"/>th tick. A car that was near stays near
    /// until it is <see cref="InterestHysteresis"/> metres further out, so nothing flickers at the border.
    /// </summary>
    public double InterestRadius { get; init; } = 0;
    public double InterestHysteresis { get; init; } = 10;
    public int FarEvery { get; init; } = 4;
}

public static class Wire
{
    /// <summary>SnapshotFar: the cars outside the interest radius, 7 bytes each (id, x, z, heading), a few times a second. Pages that do not know the frame ignore it.</summary>
    public const byte Pose = 1, Respawn = 2, Welcome = 0x80, Roster = 0x81, Snapshot = 0x82, Fix = 0x83, Bye = 0x84, Glow = 0x85, SnapshotFar = 0x86;
    public const int PoseLength = 13, EntryLength = 12, FarEntryLength = 7;
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
    /// <summary>Underglow: 0 = none, else the hue index (0..23) plus one. Sent to the others in a frame of its own, never in the roster.</summary>
    public byte Glow { get; internal set; }
    public string Name { get; internal set; } = "";
    public string Address { get; internal set; } = "";
    public IPeer Peer { get; internal set; } = null!;
    internal bool HasPose, AwaitSpawn;
    internal long RespawnAt = long.MinValue / 2;
    internal byte[] Last = new byte[Wire.PoseLength]; // last accepted POSE frame
    internal double X, Z, H;
    internal long LastMsg, LastMove, LastPoseAt;
    internal byte LastSeq;
    internal double Budget, Tokens = 8;
    internal long TokenAt;
    internal int Dropped; internal long DroppedSince;
    internal int Violations; internal long ViolationsSince;
    internal bool Gone;
    internal bool Faulty; // its socket threw while sending: removed on the next tick
    internal bool[]? Near; // by the other's id: is that car inside this visitor's interest area right now (with the border's hysteresis)
}

public sealed class RelayStats
{
    public long BytesIn, BytesOut, FramesIn, FramesOut, Accepted, Rejected, Ticks, TickTicks, TickErrors;
    /// <summary>Entries sent in full (near) and in short (far), and the far frames, since the start.</summary>
    public long NearEntries, FarEntries, FarFrames;
    /// <summary>The slowest tick in ticks of the stopwatch (for a p100 next to the average).</summary>
    public long MaxTickTicks;
    public int Visitors, Worlds;
}

public sealed class WorldRelay(TimeProvider time, RelayOptions? options = null, Random? random = null)
{
    /// <summary>The colour word of the paints 24 to 26 (white, black, silver).</summary>
    public static readonly string[] PaintWords = ["White", "Black", "Silver"];
    public static readonly string[] Colours = ["Red", "Orange", "Amber", "Lime", "Green", "Mint", "Teal", "Sky", "Blue", "Indigo", "Violet", "Pink"];
    public static readonly string[] Animals = ["Otter", "Fox", "Heron", "Badger", "Lynx", "Gecko", "Falcon", "Wombat", "Marmot", "Ibis", "Newt", "Panda", "Moose", "Stoat", "Puffin", "Koala"];

    readonly RelayOptions o = options ?? new();
    double halfX = (options ?? new()).HalfX, halfZ = (options ?? new()).HalfZ;

    double[] wallSegs = [];
    (double X, double Z, double R)[] obstacles = [];

    /// <summary>
    /// The solid things of the map (flat list x1, z1, x2, z2 per wall segment, and round obstacles): a pose whose way from the last one crosses a wall or
    /// cuts through an obstacle is refused like a jump, so shortcuts through them count for nothing. Without it (the public world) only the bounds are checked.
    /// </summary>
    public void SetGeometry(double[] segments, IEnumerable<(double X, double Z, double R)> round) { lock (gate) { wallSegs = segments; obstacles = [.. round]; } }

    bool Blocked(double x0, double z0, double x1, double z1)
    {
        for (var i = 0; i < wallSegs.Length; i += 4)
        {
            double ax = wallSegs[i], az = wallSegs[i + 1], bx = wallSegs[i + 2], bz = wallSegs[i + 3];
            double d1 = (bx - ax) * (z0 - az) - (bz - az) * (x0 - ax), d2 = (bx - ax) * (z1 - az) - (bz - az) * (x1 - ax);
            double d3 = (x1 - x0) * (az - z0) - (z1 - z0) * (ax - x0), d4 = (x1 - x0) * (bz - z0) - (z1 - z0) * (bx - x0);
            if (d1 * d2 < 0 && d3 * d4 < 0) return true;
        }
        double mx = x1 - x0, mz = z1 - z0, l2 = mx * mx + mz * mz;
        foreach (var (ox, oz, r) in obstacles)
        {
            var t = l2 > 0 ? Math.Clamp(((ox - x0) * mx + (oz - z0) * mz) / l2, 0, 1) : 0;
            if (double.Hypot(ox - (x0 + mx * t), oz - (z0 + mz * t)) < r) return true;
        }
        return false;
    }

    /// <summary>Ends every connection from the outside (a race is over): each is told why.</summary>
    public void DropAll(byte reason) { lock (gate) foreach (var members in worlds.ToArray()) foreach (var s in members.ToArray()) if (!s.Gone) Kick(s, reason); }

    /// <summary>Ends every connection whose address matches (a banned range): each is told why. Returns how many.</summary>
    public int DropWhere(Func<string, bool> addressMatches, byte reason)
    {
        var n = 0;
        lock (gate) foreach (var members in worlds.ToArray()) foreach (var s in members.ToArray()) if (!s.Gone && addressMatches(s.Address)) { Kick(s, reason); n++; }
        return n;
    }

    /// <summary>Changes the size of the map the poses must stay inside (a race on another map).</summary>
    public void SetBounds(double newHalfX, double newHalfZ) { lock (gate) { halfX = newHalfX; halfZ = newHalfZ; } }
    readonly Random rnd = random ?? Random.Shared;
    readonly object gate = new();
    readonly List<List<Session>> worlds = [];
    /// <summary>The key of each world in `worlds` (the same index): null for the public lobby worlds, a name for a private world that only those who know it enter (a guest link's id).</summary>
    readonly List<string?> worldKeys = [];
    readonly Dictionary<string, AddressState> addresses = [];
    public RelayStats Stats { get; } = new();
    /// <summary>Called, under the relay's lock, for every accepted pose: keep it short (queue it, do not call back into the relay).</summary>
    public Action<PoseSample>? PoseAccepted { get; set; }   // several may hook in with +=
    /// <summary>Size for a receive buffer: a frame longer than this is too large.</summary>
    public int MaxFrameBuffer => o.MaxFrame;

    sealed class AddressState { public int Connections; public double Tokens; public long TokenAt, LastTouch; public Queue<long> Joins = new(); }

    double Seconds(long ts) => ts / (double)time.TimestampFrequency;

    /// <summary>
    /// Let a visitor in. Returns null (after telling the peer why) if the relay refuses. With <paramref name="name"/> and
    /// <paramref name="hue"/> (0..23) the caller says who the visitor is (a signed-in person); without them the relay picks
    /// a name from its fixed list and a free colour (the public world). The caller has checked the text of a name.
    /// </summary>
    public Session? Join(IPeer peer, string address, int car, string? name = null, int? hue = null, int? glow = null, string? worldKey = null)
    {
        lock (gate)
        {
            var now = time.GetTimestamp();
            if (!addresses.TryGetValue(address, out var a)) addresses[address] = a = new AddressState { Tokens = o.FramesPerSecondPerAddress, TokenAt = now };
            a.LastTouch = now;
            while (a.Joins.Count > 0 && Seconds(now - a.Joins.Peek()) > 60) a.Joins.Dequeue();
            if (a.Connections >= o.MaxPerAddress || a.Joins.Count >= o.JoinsPerMinutePerAddress) { Refuse(peer, Wire.ByeFull); return null; }
            // first world with room, else a new one
            // a private world (a key): its own world, made when the first one comes; a public join never lands in a private world
            int w = worldKey is null ? worlds.FindIndex(x => x.Count < o.MaxPerWorld && worldKeys[worlds.IndexOf(x)] is null) : worldKeys.IndexOf(worldKey);
            if (w >= 0 && worlds[w].Count >= o.MaxPerWorld) { Refuse(peer, Wire.ByeFull); return null; }
            if (w < 0)
            {
                if (worlds.Count >= o.MaxWorlds) { Refuse(peer, Wire.ByeFull); return null; }
                worlds.Add([]); worldKeys.Add(worldKey); w = worlds.Count - 1;
            }
            var members = worlds[w];
            byte id = 0; while (members.Any(m => m.Id == id)) id++;
            var s = new Session
            {
                Id = id, World = w, Car = (byte)(car >= 0 && car < o.Top.Length ? car : 0), Peer = peer, Address = address,
                LastMsg = now, LastMove = now, TokenAt = now, DroppedSince = now, ViolationsSince = now,
                Hue = hue is >= 0 and < 27 ? (byte)hue.Value : PickHue(members),   // 0..23 the hues, 24 white, 25 black, 26 silver (a value the relay does not know gets a hue of its own choice)
                Glow = glow is >= 0 and < 24 ? (byte)(glow.Value + 1) : (byte)0,
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
            if (addresses.TryGetValue(s.Address, out var a)) { if (a.Connections > 0) a.Connections--; a.LastTouch = time.GetTimestamp(); }
            var members = worlds[s.World];
            members.Remove(s);
            BroadcastRoster(members);
            // an empty last world closes; earlier ones keep their number while anyone is in a later one
            while (worlds.Count > 0 && worlds[^1].Count == 0) { worlds.RemoveAt(worlds.Count - 1); worldKeys.RemoveAt(worldKeys.Count - 1); }
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
            a.LastTouch = now;
            if (a.Tokens < 1) { Strike(s, now); return; }
            a.Tokens--;
            // a respawn (a ride back to the plaza): two bytes; the next pose is a first pose, but it must lie at the spawn place
            if (f.Length == 2 && f[0] == Wire.Respawn) { Respawn(s, now); return; }
            if (f.Length != Wire.PoseLength || f[0] != Wire.Pose) { Strike(s, now); return; }
            // a per-connection bucket: 15 a second sustained, a burst of 8
            s.Tokens = Math.Min(8, s.Tokens + Seconds(now - s.TokenAt) * (o.PoseHz + 3)); s.TokenAt = now;
            if (s.Tokens < 1) { Strike(s, now); return; }
            s.Tokens--;
            s.LastMsg = now;
            Check(s, f, now);
        }
    }

    double spawnX, spawnZ, spawnR = -1;
    /// <summary>Where a visitor may be put back (the lobby's plaza): a respawn is accepted only with this set, and the next pose must be within `radius` metres of the place.</summary>
    public void SetSpawn(double x, double z, double radius) { lock (gate) { spawnX = x; spawnZ = z; spawnR = radius; } }
    void Respawn(Session s, long now)
    {
        if (spawnR < 0 || Seconds(now - s.RespawnAt) < 3) { Stats.Rejected++; return; }   // no spawn place known, or too often
        s.RespawnAt = now; s.HasPose = false; s.AwaitSpawn = true;
    }

    /// <summary>End a visitor's connection from the outside (a replaced or ended session): tells it why, closes, leaves.</summary>
    public void Drop(Session s, byte reason) { lock (gate) { if (!s.Gone) Kick(s, reason); } }

    /// <summary>A name as the wire carries it: no control characters, at most 24 characters and 60 bytes.</summary>
    static string Clean(string name)
    {
        var t = new string(name.Where(c => !char.IsControl(c)).Take(32).ToArray()).Trim();   // (a guest's name is at most 20 characters and a label of 7: "Name (Guest)")
        while (System.Text.Encoding.UTF8.GetByteCount(t) > 60) t = t[..^1];
        return t.Length > 0 ? t : "Driver";
    }

    /// <summary>A text frame (the protocol only has binary ones): it costs the same as any frame, so a flood of them is limited and ends in a kick.</summary>
    public void OnText(Session s)
    {
        Span<byte> one = [0];
        OnMessage(s, one);
    }

    /// <summary>A frame that was refused (over budget, wrong shape): counted, and more than 150 in 10 seconds ends the connection.</summary>
    void Strike(Session s, long now)
    {
        if (Seconds(now - s.DroppedSince) > 10) { s.Dropped = 0; s.DroppedSince = now; }
        Stats.Rejected++;
        if (++s.Dropped > 150) Kick(s, Wire.ByeLarge);
    }

    /// <summary>A frame that did not fit the receive buffer: too large.</summary>
    public void OnOversize(Session s) { lock (gate) { if (!s.Gone) Kick(s, Wire.ByeLarge); } }

    void Check(Session s, ReadOnlySpan<byte> f, long now)
    {
        double x = Wire.I16(f, 2) / 20.0, z = Wire.I16(f, 4) / 20.0, h = Wire.U16(f, 6) * (2 * Math.PI / 65536), vf = Wire.I16(f, 8) / 50.0;
        double top = o.Top[s.Car];
        bool ok = Math.Abs(x) <= halfX && Math.Abs(z) <= halfZ && Math.Abs(vf) <= 1.15 * top + 2;
        if (ok && s.AwaitSpawn && !s.HasPose) ok = double.Hypot(x - spawnX, z - spawnZ) <= spawnR;   // the pose after a respawn must be at the spawn place
        // a frame must be newer than the last one (the number wraps at 256): a replayed or reordered frame is dropped
        if (s.HasPose) { var ahead = (byte)(f[1] - s.LastSeq); if (ahead == 0 || ahead > 127) { Stats.Rejected++; return; } }
        s.LastSeq = f[1];
        if (ok && s.HasPose)
        {
            double dt = Math.Min(0.5, Seconds(now - s.LastPoseAt));
            double rate = 1.25 * top + 3;
            s.Budget = Math.Min(0.5 * rate, s.Budget + dt * rate);
            double d = double.Hypot(x - s.X, z - s.Z);
            double dh = Math.Abs(h - s.H); if (dh > Math.PI) dh = 2 * Math.PI - dh;
            var span = Seconds(now - s.LastPoseAt);
            // a claimed speed the car did not move at (a fake angle at a standstill earns drift points): over a second look at least, it must have moved
            bool standing = span >= 0.12 && Math.Abs(vf) > 8 && d < 0.08 * Math.Abs(vf) * span - 0.5;
            if (d > s.Budget + 0.5 || dh > 12 * Math.Max(dt, 0.02) + 0.5 || standing || Blocked(s.X, s.Z, x, z)) ok = false;
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
        f.CopyTo(s.Last); s.X = x; s.Z = z; s.H = h; s.LastPoseAt = now; s.HasPose = true; s.AwaitSpawn = false;
        PoseAccepted?.Invoke(new PoseSample(s, x, z, h, vf, (sbyte)f[10] * Math.PI / 128, f[12], Seconds(now)));
    }

    /// <summary>Tick that never throws: a failure is counted and returned for the caller to log, and the next tick runs as usual.</summary>
    public Exception? TickGuarded()
    {
        try { Tick(); return null; }
        catch (Exception e) { lock (gate) Stats.TickErrors++; return e; }
    }

    int sweep;
    long tickNo;
    byte[] nearBuf = new byte[4 + Wire.EntryLength * 64], farBuf = new byte[4 + Wire.FarEntryLength * 64];

    /// <summary>Call 15 times a second: sends the snapshots and drops idle or silent visitors.</summary>
    public void Tick()
    {
        lock (gate)
        {
            var t0 = Stopwatch.GetTimestamp();
            var now = time.GetTimestamp();
            foreach (var members in worlds.ToArray())
                foreach (var s in members.ToArray())
                    if (s.Faulty) Leave(s); // its socket is broken: no goodbye frame, just let it go
            // an address with no connection left is forgotten after a minute (the join history is a minute long anyway)
            if (++sweep % 15 == 0)
                foreach (var key in addresses.Where(kv => kv.Value.Connections == 0 && Seconds(now - kv.Value.LastTouch) > 60).Select(kv => kv.Key).ToArray())
                    addresses.Remove(key);
            foreach (var members in worlds.ToArray())
                foreach (var s in members.ToArray())
                {
                    if (Seconds(now - s.LastMsg) > o.SilentSeconds) Kick(s, Wire.ByeSilent);
                    else if (Seconds(now - s.LastMove) > o.IdleSeconds) Kick(s, Wire.ByeIdle);
                }
            ushort stamp = (ushort)(long)(Seconds(now) * 1000);
            tickNo++;
            foreach (var members in worlds)
            {
                var cap = Math.Min(255, members.Count);
                if (nearBuf.Length < 4 + Wire.EntryLength * cap) nearBuf = new byte[4 + Wire.EntryLength * Math.Max(cap, 64)];
                if (farBuf.Length < 4 + Wire.FarEntryLength * cap) farBuf = new byte[4 + Wire.FarEntryLength * Math.Max(cap, 64)];
                var interest = o.InterestRadius > 0;
                double r2 = o.InterestRadius * o.InterestRadius, rh = o.InterestRadius + o.InterestHysteresis, rh2 = rh * rh;
                foreach (var me in members)
                {
                    int n = 0, nf = 0;
                    var farTurn = interest && (tickNo + me.Id) % Math.Max(1, o.FarEvery) == 0;
                    if (interest) me.Near ??= new bool[256];
                    foreach (var other in members)
                    {
                        if (other == me || !other.HasPose) continue;
                        var near = true;
                        if (interest)
                        {
                            double dx = other.X - me.X, dz = other.Z - me.Z, d2 = dx * dx + dz * dz;
                            near = d2 <= (me.Near![other.Id] ? rh2 : r2);
                            me.Near[other.Id] = near;
                        }
                        if (near)
                        {
                            int p = 4 + n * Wire.EntryLength;
                            nearBuf[p] = other.Id;
                            other.Last.AsSpan(2, 11).CopyTo(nearBuf.AsSpan(p + 1));
                            n++;
                        }
                        else if (farTurn)
                        {
                            int p = 4 + nf * Wire.FarEntryLength;
                            farBuf[p] = other.Id;
                            other.Last.AsSpan(2, 6).CopyTo(farBuf.AsSpan(p + 1));   // x, z, heading as the pose frame has them
                            nf++;
                        }
                    }
                    nearBuf[0] = Wire.Snapshot; nearBuf[1] = (byte)n; Wire.Put16(nearBuf, 2, stamp);
                    if (n > 0) Send(me, nearBuf.AsSpan(0, 4 + n * Wire.EntryLength));
                    if (nf > 0)
                    {
                        farBuf[0] = Wire.SnapshotFar; farBuf[1] = (byte)nf; Wire.Put16(farBuf, 2, stamp);
                        Send(me, farBuf.AsSpan(0, 4 + nf * Wire.FarEntryLength));
                        Stats.FarFrames++;
                    }
                    Stats.NearEntries += n; Stats.FarEntries += nf;
                }
            }
            var took = Stopwatch.GetTimestamp() - t0;
            Stats.Ticks++; Stats.TickTicks += took; if (took > Stats.MaxTickTicks) Stats.MaxTickTicks = took;
            Stats.Visitors = worlds.Sum(w => w.Count); Stats.Worlds = worlds.Count;
        }
    }

    public int Visitors { get { lock (gate) return worlds.Sum(w => w.Count); } }
    /// <summary>For tests: how many addresses are remembered.</summary>
    public int KnownAddresses { get { lock (gate) return addresses.Count; } }
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
        try { s.Peer.Send(frame); }
        catch (Exception) { s.Faulty = true; } // one broken connection must not stop the others
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
        // underglow travels in a frame of its own (older pages ignore an unknown frame): count, then id and hue-plus-one of each visitor that has one
        var lit = members.Where(m => m.Glow > 0).ToList();
        if (lit.Count == 0) return;
        var g = new byte[2 + lit.Count * 2]; g[0] = Wire.Glow; g[1] = (byte)lit.Count;
        for (var i = 0; i < lit.Count; i++) { g[2 + i * 2] = lit[i].Id; g[3 + i * 2] = lit[i].Glow; }
        foreach (var m in members) Send(m, g);
    }

    /// <summary>The colour word follows the car's hue (24 hues of 15 degrees, 12 words), the animal is free.</summary>
    string PickName(List<Session> members, byte hue)
    {
        var colour = hue >= 24 ? PaintWords[Math.Min(2, hue - 24)] : Colours[hue / 2 % Colours.Length];
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
