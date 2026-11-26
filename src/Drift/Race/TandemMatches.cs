using System.Text.Json;
using Drift.Relay;

namespace Drift.Race;

/// <summary>
/// Tandem in two runs, between two people of the open lobby (signed in or guests): one invites the other near them, the other accepts, a short countdown, then
/// two rounds of the same length: in the first the inviter leads and the other chases, in the second they swap (the judging is `TandemRun`). The pair's score goes to the
/// boards of the signed-in drivers (kind 4); guests keep nothing here (the page keeps their best on the device).
/// Lobby messages from the page: tandem.invite {with: id}, tandem.accept, tandem.decline, tandem.cancel. To the pages: tandem.invite {from, by, ms}, tandem.sent {to},
/// tandem.no {why}, tandem.run {phase, round, role, left, total, mine}, tandem.result {total, mine, theirs, partner}, tandem.end {why}.
/// </summary>
public sealed class TandemMatches(IBestTimes? best, int map = 0, double roundSeconds = 30, double countdown = 3, double pause = 4, Func<double>? clock = null, int inviteMs = 15000)
{
    sealed class Member(Guid person, string name, bool guest, int car) { public Guid Person = person; public string Name = name; public bool Guest = guest; public int Car = car; public TandemCar Pose; public double At = -1; public Match? Match; }
    sealed class Match(Session a, Session b) { public Session A = a, B = b; public TandemRun Run = null!; public double Sent = -9; public string SentPhase = ""; }
    readonly object gate = new();
    readonly Dictionary<Session, Member> members = [];
    readonly Dictionary<Session, (Session From, double Until)> invites = [];
    readonly List<Match> matches = [];
    Timer? timer;
    double Now() => clock?.Invoke() ?? Environment.TickCount64 / 1000.0;

    public void Follow(WorldRelay relay) { relay.PoseAccepted += Pose; timer ??= new Timer(_ => Tick(), null, 250, 250); }
    public void Join(Session s, Guid person, string name, bool guest, int car) { lock (gate) members[s] = new Member(person, name, guest, car); }
    public void Leave(Session s)
    {
        lock (gate)
        {
            if (members.TryGetValue(s, out var m) && m.Match is { } match) End(match, "left", except: s);
            members.Remove(s); invites.Remove(s);
            foreach (var k in invites.Where(i => i.Value.From == s).Select(i => i.Key).ToList()) invites.Remove(k);
        }
    }

    static void Send(Session s, object message) { if (s.Peer is ITextPeer p) p.SendText(JsonSerializer.Serialize(message)); }

    void Pose(PoseSample p)
    {
        lock (gate)
        {
            if (!members.TryGetValue(p.Session, out var m)) return;
            m.Pose = new TandemCar(p.X, p.Z, p.Heading, p.Vf, p.Beta); m.At = p.Seconds;
            if (m.Match is { } match) match.Run.Pose(match.A == p.Session ? 0 : 1, m.Pose);
        }
    }

    /// <summary>A message from the lobby page; true when it was a tandem message.</summary>
    public bool OnText(Session s, string text)
    {
        if (!text.StartsWith("{\"t\":\"tandem.", StringComparison.Ordinal)) return false;
        try
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            var t = root.GetProperty("t").GetString();
            lock (gate)
            {
                if (!members.TryGetValue(s, out var me)) return true;
                switch (t)
                {
                    case "tandem.invite":
                    {
                        var id = (byte)root.GetProperty("with").GetInt32();
                        var other = members.Keys.FirstOrDefault(k => k.Id == id && k.World == s.World && k != s);
                        if (other is null) { Send(s, new { t = "tandem.no", why = "gone" }); return true; }
                        if (me.Match is not null || members[other].Match is not null || invites.ContainsKey(other)) { Send(s, new { t = "tandem.no", why = "busy" }); return true; }
                        invites[other] = (s, Now() + inviteMs / 1000.0);
                        Send(other, new { t = "tandem.invite", from = (int)s.Id, by = me.Name.Length > 0 ? me.Name : s.Name, ms = inviteMs });
                        Send(s, new { t = "tandem.sent", to = members[other].Name.Length > 0 ? members[other].Name : other.Name });
                        break;
                    }
                    case "tandem.accept":
                    {
                        if (!invites.Remove(s, out var inv) || inv.Until < Now() || !members.TryGetValue(inv.From, out var from) || from.Match is not null || me.Match is not null) { Send(s, new { t = "tandem.no", why = "gone" }); return true; }
                        var match = new Match(inv.From, s) { Run = new TandemRun(roundSeconds, countdown, pause) };
                        if (from.At >= 0) match.Run.Pose(0, from.Pose);
                        if (me.At >= 0) match.Run.Pose(1, me.Pose);
                        from.Match = me.Match = match; matches.Add(match);
                        match.Run.Start(Now());
                        Report(match, true);
                        break;
                    }
                    case "tandem.decline":
                        if (invites.Remove(s, out var d)) Send(d.From, new { t = "tandem.no", why = "declined" });
                        break;
                    case "tandem.cancel":
                        if (me.Match is { } cm) End(cm, "cancelled", except: null);
                        break;
                }
            }
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or FormatException or OverflowException) { /* a message that is not one of ours */ }
        return true;
    }

    /// <summary>Moves every match on; called by the timer four times a second (tests call it with their own clock).</summary>
    public void Tick()
    {
        List<(Match Match, Guid PA, bool GA, int CA, Guid PB, bool GB, int CB)>? done = null;
        lock (gate)
        {
            var now = Now();
            foreach (var k in invites.Where(i => i.Value.Until < now).Select(i => i.Key).ToList()) { Send(invites[k].From, new { t = "tandem.no", why = "timeout" }); invites.Remove(k); }
            foreach (var match in matches.ToList())
            {
                var events = match.Run.Tick(now);
                if (events.Contains("done"))
                {
                    var a = members[match.A]; var b = members[match.B];
                    Result(match);
                    (done ??= []).Add((match, a.Person, a.Guest, a.Car, b.Person, b.Guest, b.Car));
                    Finish(match);
                }
                else Report(match, events.Count > 0);
            }
        }
        if (done is not null && best is not null)
            foreach (var d in done)
                _ = Task.Run(async () => { try { await d.Match.Run.RecordAsync(best, (d.PA, d.GA, d.CA), (d.PB, d.GB, d.CB), map); } catch (Exception) { /* a board that cannot be written costs nothing here */ } });
    }

    static string PhaseName(TandemRun.Phase p) => p switch { TandemRun.Phase.Countdown => "countdown", TandemRun.Phase.Round1 => "round1", TandemRun.Phase.Swap => "swap", TandemRun.Phase.Round2 => "round2", TandemRun.Phase.Done => "done", _ => "waiting" };

    void Report(Match m, bool force)
    {
        var now = Now();
        var phase = PhaseName(m.Run.Now);
        if (!force && phase == m.SentPhase && now - m.Sent < 0.25) return;
        m.Sent = now; m.SentPhase = phase;
        var left = m.Run.Now switch { TandemRun.Phase.Countdown => countdown, TandemRun.Phase.Swap => pause, _ => m.Run.RoundSeconds } - (now - m.Run.PhaseStart);
        var round = m.Run.Now == TandemRun.Phase.Round2 || m.Run.Now == TandemRun.Phase.Swap ? 2 : 1;
        for (var who = 0; who < 2; who++)
        {
            var s = who == 0 ? m.A : m.B;
            var role = m.Run.Now == TandemRun.Phase.Swap ? (who == 0 ? TandemRole.Chase : TandemRole.Lead) : m.Run.RoleOf(who);   // in the pause the roles of the next round are shown
            Send(s, new { t = "tandem.run", phase, round, role = role.ToString().ToLowerInvariant(), left = Math.Round(Math.Max(0, left), 1), total = (int)Math.Round(m.Run.Total), mine = (int)Math.Round(m.Run.Points[who, 0] + m.Run.Points[who, 1]), partner = who == 0 ? members[m.B].Name : members[m.A].Name });
        }
    }

    void Result(Match m)
    {
        for (var who = 0; who < 2; who++)
        {
            var s = who == 0 ? m.A : m.B; var o = 1 - who;
            Send(s, new { t = "tandem.result", total = (int)Math.Round(m.Run.Total), mine = new[] { (int)Math.Round(m.Run.Points[who, 0]), (int)Math.Round(m.Run.Points[who, 1]) }, theirs = new[] { (int)Math.Round(m.Run.Points[o, 0]), (int)Math.Round(m.Run.Points[o, 1]) }, partner = members[who == 0 ? m.B : m.A].Name });
        }
    }

    void Finish(Match m) { matches.Remove(m); if (members.TryGetValue(m.A, out var a)) a.Match = null; if (members.TryGetValue(m.B, out var b)) b.Match = null; }

    void End(Match m, string why, Session? except)
    {
        foreach (var s in new[] { m.A, m.B }) if (s != except) Send(s, new { t = "tandem.end", why });
        Finish(m);
    }

    /// <summary>For tests: the phase of a person's match, or null.</summary>
    public string? PhaseOf(Session s) { lock (gate) return members.TryGetValue(s, out var m) && m.Match is { } match ? PhaseName(match.Run.Now) : null; }
}
