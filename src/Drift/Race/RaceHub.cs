using System.Collections.Concurrent;
using System.Text.Json;
using Drift.Relay;

namespace Drift.Race;

/// <summary>What the lobby knows about a person who is connected: the garage's choice, for the invitation and the race.</summary>
public sealed record LobbyMember(Guid Person, string Name, int Car, int Hue, Session Session, bool Guest = false, double TopFactor = 1, bool Tuned = false);

/// <summary>
/// The races of the signed-in lobby, one at a time (docs/ARCHITECTURE.md section 4):
/// idle, invitation (10 s, shorter once everybody answered), grid (the racers open the race socket, up to 10 s), countdown (3 s), racing, finishing
/// (20 s after the first finish), result (15 s), then back to the lobby and a pause of 20 s. The server decides everything that counts: who is in, the
/// start, gates and laps, positions, the result. The cars are driven by their browsers (the relay of the race checks the poses as it does everywhere).
/// The hub is driven by <see cref="Tick"/> (10 times a second); messages to the browsers are JSON text frames.
/// </summary>
public sealed class RaceHub
{
    public enum Phase { Idle, Invite, Grid, Countdown, Racing, Finishing, Result }

    public const double InviteSeconds = 10, GridSeconds = 10, CountSeconds = 3, FinishSeconds = 20, ResultSeconds = 15, CooldownSeconds = 20;
    public const int MaxRacers = 8;
    static readonly double[] PositionPoints = [10, 7, 5, 4, 3, 2, 1, 1];

    sealed class Part(LobbyMember m)
    {
        public LobbyMember Member { get; } = m;
        public Runner? Runner;
        public Session? Race;
        public int Slot;
        /// <summary>The feel of driving (0 arcade, 1 pro) the person had when they joined the race: the times they set are kept under it.</summary>
        public int Feel;
        /// <summary>The person plays in the creative mode: nothing of this race counts for the boards or the stats.</summary>
        public bool Creative;
    }

    readonly TimeProvider time;
    readonly IReadOnlyDictionary<int, RaceTrack> tracks;
    RaceTrack track;
    readonly IBestTimes store;
    readonly WorldRelay raceRelay;
    readonly double[] tops;
    readonly object gate = new();
    readonly Dictionary<Guid, LobbyMember> lobby = [];
    readonly List<Part> parts = [];
    readonly HashSet<Guid> answered = [];
    readonly ConcurrentQueue<PoseSample> poses = new();
    Phase phase = Phase.Idle;
    double phaseStart, cooldownUntil, lastProgress;
    int laps, lastCount;
    Guid starter;
    RaceRun? run;
    bool resulting;

    public RaceHub(TimeProvider time, RaceTrack track, IBestTimes store, WorldRelay raceRelay, double[] tops)
        : this(time, new Dictionary<int, RaceTrack> { [track.MapId] = track }, store, raceRelay, tops) { }

    IRaceStats? stats;
    /// <summary>Where finished races are counted (wins, podiums); optional.</summary>
    public RaceHub WithStats(IRaceStats s) { stats = s; return this; }
    IRaceChallenges? challenges;
    public RaceHub WithChallenges(IRaceChallenges c) { challenges = c; return this; }

    /// <param name="tracks">every map a race can be on, by id; the one with the lowest id is the default</param>
    public RaceHub(TimeProvider time, IReadOnlyDictionary<int, RaceTrack> tracks, IBestTimes store, WorldRelay raceRelay, double[] tops)
    {
        this.time = time; this.tracks = tracks; this.track = tracks[tracks.Keys.Min()]; this.store = store; this.raceRelay = raceRelay; this.tops = tops;
        raceRelay.PoseAccepted += p => poses.Enqueue(p);
    }

    public Phase Current { get { lock (gate) return phase; } }
    double Now => time.GetTimestamp() / (double)time.TimestampFrequency;

    // ---------- the lobby sockets
    public void LobbyJoined(LobbyMember m)
    {
        lock (gate)
        {
            lobby[m.Person] = m;
            if (phase == Phase.Invite && parts.All(p => p.Member.Person != m.Person)) Send(m.Session, new { t = "race.invite", by = parts[0].Member.Name, tuned = parts[0].Member.Tuned, map = track.MapId, mapName = track.Name, laps, ms = Math.Max(0, (int)((phaseStart + InviteSeconds - Now) * 1000)) });
            else if (phase != Phase.Idle) Send(m.Session, new { t = "race.busy", n = parts.Count });
        }
    }

    public void LobbyLeft(Guid person, Session s)
    {
        lock (gate)
        {
            if (lobby.TryGetValue(person, out var cur) && cur.Session == s) { lobby.Remove(person); emoteAt.Remove(person); feels.Remove(person); creatives.Remove(person); }
        }
    }

    static JsonDocument? ParseOrNull(string text) { try { return JsonDocument.Parse(text); } catch (JsonException) { return null; } }

    /// <summary>How many emotes there are (the client draws a symbol each), the least gap between two of one person, and how many were refused.</summary>
    public const int Emotes = 10;
    public const double EmoteGap = 1.5;
    readonly Dictionary<Guid, double> emoteAt = [];
    readonly Dictionary<Guid, int> feels = [];
    readonly HashSet<Guid> creatives = [];
    /// <summary>Does the person play in the creative mode right now (they said so in the lobby)?</summary>
    public bool CreativeOf(Guid person) { lock (gate) return creatives.Contains(person); }
    /// <summary>The feel a person last said they play with (0 arcade when they said nothing).</summary>
    public int FeelOf(Guid person) { lock (gate) return feels.GetValueOrDefault(person); }
    public int emotesDropped;

    public void OnLobbyText(Guid person, string text)
    {
        JsonElement r;
        using var doc = ParseOrNull(text);
        if (doc is null) return;
        r = doc.RootElement;
        if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("t", out var tp) || tp.ValueKind != JsonValueKind.String) return;
        lock (gate)
        {
            if (!lobby.TryGetValue(person, out var me)) return;
            switch (tp.GetString())
            {
                case "race.start":
                    if (phase != Phase.Idle || Now < cooldownUntil) { Send(me.Session, new { t = "race.busy", n = parts.Count, wait = Math.Max(0, (int)Math.Ceiling(cooldownUntil - Now)) }); return; }
                    track = r.TryGetProperty("map", out var mp) && mp.TryGetInt32(out var mi) && tracks.TryGetValue(mi, out var chosen) ? chosen : tracks[tracks.Keys.Min()];
                    laps = r.TryGetProperty("laps", out var l) && l.TryGetInt32(out var li) ? Math.Clamp(li, 1, 5) : track.Laps;
                    parts.Clear(); answered.Clear();
                    parts.Add(new Part(me) { Feel = feels.GetValueOrDefault(person), Creative = creatives.Contains(person) });
                    starter = person; phase = Phase.Invite; phaseStart = Now;
                    // a time trial is a race of one: nobody is invited, the grid opens at the next tick, the times count like any
                    var solo = r.TryGetProperty("solo", out var so) && so.ValueKind == JsonValueKind.True;
                    if (solo)
                    {
                        phaseStart = Now - InviteSeconds;
                        foreach (var m in lobby.Values) Send(m.Session, m.Person == person ? new { t = "race.wait", by = me.Name, tuned = me.Tuned, map = track.MapId, mapName = track.Name, laps, ms = 0 } : new { t = "race.busy", n = 1 });
                        break;
                    }
                    foreach (var m in lobby.Values)
                        Send(m.Session, m.Person == person ? new { t = "race.wait", by = me.Name, map = track.MapId, mapName = track.Name, laps, ms = (int)(InviteSeconds * 1000) } : new { t = "race.invite", by = me.Name, tuned = me.Tuned, map = track.MapId, mapName = track.Name, laps, ms = (int)(InviteSeconds * 1000) });
                    break;
                case "race.join":
                    if (phase == Phase.Invite && parts.Count < MaxRacers && parts.All(p => p.Member.Person != person)) { parts.Add(new Part(me) { Feel = feels.GetValueOrDefault(person), Creative = creatives.Contains(person) }); Send(me.Session, new { t = "race.joined" }); }
                    answered.Add(person);
                    break;
                case "race.decline":
                    answered.Add(person);
                    break;
                case "feel":   // the feel of driving the person plays with now (0 arcade, 1 pro); kept for the race they join
                    if (r.TryGetProperty("v", out var fv) && fv.TryGetInt32(out var f) && f is 0 or 1) feels[person] = f; else emotesDropped++;
                    break;
                case "mode":   // { v: "creative" | "normal" }: the creative mode is a switch of the session; its races never count for boards or stats
                    if (r.TryGetProperty("v", out var mv) && mv.ValueKind == JsonValueKind.String && mv.GetString() is "creative" or "normal") { if (mv.GetString() == "creative") creatives.Add(person); else creatives.Remove(person); } else emotesDropped++;
                    break;
                case "emote":   // a fixed set, no text: one of Emotes numbers, at most one per 1.5 s per person, shown to the lobby over the sender's car
                    if (r.TryGetProperty("e", out var ep) && ep.TryGetInt32(out var e) && e >= 0 && e < Emotes)
                    {
                        if (emoteAt.TryGetValue(person, out var last) && Now - last < EmoteGap) { emotesDropped++; break; }
                        emoteAt[person] = Now;
                        foreach (var m in lobby.Values) Send(m.Session, new { t = "emote", id = (int)me.Session.Id, e });
                    }
                    else emotesDropped++;
                    break;
                case "challenge.start": case "challenge.stop": break;   // the challenge tracker's messages (it reads them from the same socket)
                default:
                    emotesDropped++;   // an unknown control message is counted, never answered
                    break;
            }
        }
    }

    // ---------- the race sockets
    /// <summary>May this person open the race socket now? Only the people who joined, during the grid phase.</summary>
    public bool CanRace(Guid person)
    {
        lock (gate) return phase == Phase.Grid && parts.Any(p => p.Member.Person == person && p.Race is null);
    }

    /// <summary>A person's race socket is up. False (and the socket is dropped) when they are not in this race, it is not the grid phase, or they already have a race socket.</summary>
    public bool RaceConnected(Guid person, Session s)
    {
        lock (gate)
        {
            var p = parts.FirstOrDefault(x => x.Member.Person == person);
            if (p is null || phase != Phase.Grid || p.Race is not null) { raceRelay.Drop(s, p?.Race is not null ? Wire.ByeReplaced : Wire.ByeSession); return false; }
            p.Race = s;
            var g = track.Grid[p.Slot];
            Send(s, new { t = "grid", map = track.MapId, slot = p.Slot, x = g.X, z = g.Z, h = g.H, laps, n = parts.Count, racers = parts.Select(x => x.Member.Name).ToArray(), tuned = parts.Select(x => x.Member.Tuned).ToArray() });
            return true;
        }
    }

    /// <summary>Who is behind a name in the lobby right now: one person, or null (nobody, or the name is shared).</summary>
    public Guid? FindByName(string name)
    {
        lock (gate) { var hits = lobby.Values.Where(m => string.Equals(m.Name, name, StringComparison.OrdinalIgnoreCase)).Select(m => m.Person).Distinct().ToList(); return hits.Count == 1 ? hits[0] : null; }
    }

    /// <summary>What the lobby knows about a connected person (the garage's choice at the time they joined the lobby).</summary>
    public LobbyMember? Member(Guid person) { lock (gate) return lobby.TryGetValue(person, out var m) ? m : null; }

    public void RaceLeft(Guid person, Session s)
    {
        lock (gate)
        {
            var p = parts.FirstOrDefault(x => x.Member.Person == person && x.Race == s);
            if (p is null) return;
            p.Race = null;
            if (phase is Phase.Grid or Phase.Invite) { parts.Remove(p); return; }
            if (p.Runner is { Finished: false } r) r.Dnf = true;
        }
    }

    public void OnRaceText(Guid person, string text)
    {
        if (!text.Contains("\"leave\"", StringComparison.Ordinal)) return;
        lock (gate)
        {
            var p = parts.FirstOrDefault(x => x.Member.Person == person);
            if (p?.Runner is { Finished: false } r) r.Dnf = true;
        }
    }

    // ---------- the clock
    public void Tick()
    {
        var after = new List<Action>();
        lock (gate)
        {
            var now = Now;
            while (poses.TryDequeue(out var pose)) OnPose(pose);
            switch (phase)
            {
                case Phase.Invite:
                {
                    var others = lobby.Keys.Where(k => k != starter).ToList();
                    if (now >= phaseStart + InviteSeconds || (others.Count == 0 || others.All(answered.Contains)) && now >= phaseStart + 1)
                        ToGrid(now, after);
                    break;
                }
                case Phase.Grid:
                    if (parts.Count == 0) { Idle(now, after); break; }
                    if (parts.All(p => p.Race is not null) || now >= phaseStart + GridSeconds)
                    {
                        foreach (var p in parts.Where(p => p.Race is null).ToList()) parts.Remove(p);
                        if (parts.Count == 0) { Idle(now, after); break; }
                        run = new RaceRun(track, laps);
                        foreach (var (p, i) in parts.Select((p, i) => (p, i)))
                        {
                            p.Slot = i;
                            p.Runner = new Runner(p.Member.Person, p.Member.Name, p.Member.Car, p.Member.Hue, tops[Math.Clamp(p.Member.Car, 0, tops.Length - 1)] * p.Member.TopFactor) { Slot = i, Guest = p.Member.Guest, Tuned = p.Member.Tuned, Feel = p.Feel, Creative = p.Creative };
                            run.Runners.Add(p.Runner);
                        }
                        phase = Phase.Countdown; phaseStart = now; lastCount = 4;
                    }
                    break;
                case Phase.Countdown:
                {
                    var n = (int)Math.Ceiling(CountSeconds - (now - phaseStart));
                    if (n < lastCount && n >= 1) { lastCount = n; Broadcast(new { t = "count", n }); }
                    if (now - phaseStart >= CountSeconds)
                    {
                        run!.Start(now); phase = Phase.Racing; phaseStart = now; lastProgress = now;
                        Broadcast(new { t = "go" });
                    }
                    break;
                }
                case Phase.Racing:
                case Phase.Finishing:
                    if (now - lastProgress >= 1) { lastProgress = now; Progress(now); }
                    if (phase == Phase.Racing && run!.FirstFinish is { } ff) { phase = Phase.Finishing; phaseStart = ff; }
                    if (run!.AllDone || (phase == Phase.Finishing && now >= phaseStart + FinishSeconds) || (phase == Phase.Racing && now - phaseStart > 20 * 60))
                    {
                        foreach (var r in run.Runners.Where(r => !r.Finished)) r.Dnf = true;
                        if (!resulting) { resulting = true; var order = run.Order(); after.Add(() => _ = Finish(order, run)); }
                    }
                    break;
                case Phase.Result:
                    if (now >= phaseStart + ResultSeconds)
                    {
                        Broadcast(new { t = "back" });
                        foreach (var p in parts) if (p.Race is not null) { var s = p.Race; after.Add(() => raceRelay.Drop(s, Wire.ByeSession)); }
                        parts.Clear(); run = null; Idle(now, after);
                    }
                    break;
            }
        }
        foreach (var a in after) a();
    }

    /// <summary>Back to idle with the pause before the next invitation (also when nobody came: no invitation spam), and every race socket that is still open is closed.</summary>
    void Idle(double now, List<Action> after)
    {
        phase = Phase.Idle; cooldownUntil = now + CooldownSeconds;
        after.Add(() => raceRelay.DropAll(Wire.ByeSession));
    }

    void ToGrid(double now, List<Action> after)
    {
        // whoever left the lobby before the grid is out
        parts.RemoveAll(p => !lobby.ContainsKey(p.Member.Person));
        if (parts.Count == 0) { Idle(now, after); return; }
        phase = Phase.Grid; phaseStart = now;
        raceRelay.SetBounds(track.HalfX, track.HalfZ);   // the poses of this race must stay on this map, and not go through its walls
        raceRelay.SetGeometry(track.Segments, track.Obstacles);
        for (var i = 0; i < parts.Count; i++) parts[i].Slot = i;
        foreach (var p in parts) if (lobby.TryGetValue(p.Member.Person, out var m)) Send(m.Session, new { t = "race.go", map = track.MapId, laps });
        foreach (var m in lobby.Values.Where(m => parts.All(p => p.Member.Person != m.Person))) Send(m.Session, new { t = "race.busy", n = parts.Count });
    }

    void OnPose(PoseSample p)
    {
        if (run is null || phase is not (Phase.Racing or Phase.Finishing)) return;
        var part = parts.FirstOrDefault(x => x.Race == p.Session);
        if (part?.Runner is not { } r) return;
        foreach (var ev in run.Pose(r, p.X, p.Z, p.Vf, p.Beta, p.Flags, p.Seconds))
        {
            var pos = run.Order().IndexOf(r) + 1;
            if (ev.Kind == "lap") SendTo(part, new { t = "lap", lap = ev.Lap, ms = (int)ev.Ms, of = laps, pos });
            else SendTo(part, new { t = "finish", pos, ms = (int)ev.Ms });
        }
    }

    void Progress(double now)
    {
        var order = run!.Order();
        foreach (var part in parts)
            if (part.Runner is { } r)
                SendTo(part, new { t = "prog", pos = order.IndexOf(r) + 1, of = order.Count, lap = Math.Min(r.LapsDone + 1, laps), laps, ms = (int)((now - run.Started!.Value) * 1000), drift = (int)r.Drift.Total, mult = r.Drift.Mult });
    }

    async Task Finish(List<Runner> order, RaceRun finishedRun)
    {
        // the best times, in the database (outside the lock); then the result goes out
        var flags = new Dictionary<Guid, (bool Lap, bool Race, bool Drift)>();
        foreach (var r in order)
        {
            bool lap = false, race = false, drift = false;
            try
            {
                var bestDrift = Math.Max(r.Drift.Best, r.Drift.Pending);   // the chain still running at the end counts
                if (r.CleanLaps && !r.Guest && !r.Creative && bestDrift >= 1) drift = await store.RecordAsync(r.Person, track.MapId, RaceStore.Drift, (int)bestDrift, r.Car, r.Feel);
                if (r.Finished && r.CleanLaps && !r.Guest && !r.Creative)   // a guest's time is shown in the result, never stored
                {
                    if (r.BestLap is { } bl) { lap = await store.RecordAsync(r.Person, track.MapId, RaceStore.Lap, (int)Math.Round(bl), r.Car, r.Feel); if (challenges is not null) await challenges.LapAsync(r.Person, track.MapId, bl); }
                    if (finishedRun.Laps == track.Laps && r.FinishMs is { } fm) race = await store.RecordAsync(r.Person, track.MapId, RaceStore.Race, (int)Math.Round(fm), r.Car, r.Feel);
                }
            }
            catch (Exception) { /* a database problem must not stop the result from reaching the racers */ }
            // the counters: a finished race counts for a person (not for a guest); a win needs somebody to beat, a podium three racers
            try { if (r.Finished && !r.Guest && !r.Creative && stats is not null) { var pos = order.IndexOf(r) + 1; await stats.RaceDoneAsync(r.Person, pos == 1 && order.Count >= 2, pos <= 3 && order.Count >= 3); } }
            catch (Exception) { /* the result must still reach the racers */ }
            flags[r.Person] = (lap, race, drift);
        }
        lock (gate)
        {
            var rows = order.Select((r, i) => new
            {
                pos = i + 1, name = r.Name, car = r.Car, hue = r.Hue,
                ms = r.FinishMs is { } f ? (int?)(int)f : null,
                bestLap = r.BestLap is { } b ? (int?)(int)b : null,
                drift = (int)r.Drift.Total, bestDrift = (int)Math.Max(r.Drift.Best, r.Drift.Pending), newDrift = flags[r.Person].Drift,
                points = Math.Round((r.Finished && i < PositionPoints.Length ? PositionPoints[i] : 0) + r.Drift.Total / 100, 1),
                dnf = r.Dnf, clean = r.CleanLaps, tuned = r.Tuned, creative = r.Creative,
                newLap = flags[r.Person].Lap, newRace = flags[r.Person].Race,
            }).ToArray();
            Broadcast(new { t = "result", rows, laps = finishedRun.Laps });
            phase = Phase.Result; phaseStart = Now; resulting = false;
        }
    }

    // ---------- messages
    static readonly JsonSerializerOptions Json = new() { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never };
    static void Send(Session s, object message) { if (s.Peer is ITextPeer p) p.SendText(JsonSerializer.Serialize(message, Json)); }
    static void SendTo(Part part, object message) { if (part.Race is { } s) Send(s, message); }
    void Broadcast(object message) { foreach (var p in parts) SendTo(p, message); }
}
