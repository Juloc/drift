using Drift.Relay;

namespace Drift.Race;

/// <summary>One car's pose as the tandem judgement needs it (the wire's numbers: heading 0 faces +z, beta positive = goes to the right of the nose).</summary>
public readonly record struct TandemCar(double X, double Z, double H, double Vf, double Beta);

public enum TandemRole { None, Lead, Chase, Side }

public readonly record struct TandemPairState(bool Active, double Q, double Gap, TandemRole RoleA, TandemRole RoleB);

/// <summary>
/// Tandem drifting, the same logic as game/sim/tandem.js (a test reads the same vectors, tests/vectors/tandem.json). Two cars are in tandem while both drift the
/// same way, close together, pointing the same way; the closer and more alike, the higher the quality; a chain of tandem seconds earns a bonus multiplier (to x2) and bonus
/// points on top of the drift points. The one ahead along the travel direction leads.
/// </summary>
public static class Tandem
{
    public const double MaxGap = 10, IdealGap = 4, MaxHeading = 0.45, MaxSlipDiff = 0.4, MinSlip = 0.26, MinSpeed = 8, MinQuality = 0.05, Side = 1;
    public const double Rate = 0.35, Exponent = 0.8, MaxPointsPerSecond = 1500, Grace = 1, Smooth = 3, MaxMult = 2;

    static double AngDiff(double a, double b)
    {
        var d = (a - b) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        return Math.Abs(d);
    }

    public static TandemPairState Pair(TandemCar a, TandemCar b)
    {
        var gap = double.Hypot(b.X - a.X, b.Z - a.Z);
        var none = new TandemPairState(false, 0, gap, TandemRole.None, TandemRole.None);
        if (gap > MaxGap) return none;
        static bool Drifting(TandemCar c) => Math.Abs(c.Beta) > MinSlip && Math.Abs(c.Vf) > MinSpeed;
        if (!Drifting(a) || !Drifting(b) || Math.Sign(a.Beta) != Math.Sign(b.Beta)) return none;
        double da = a.H + a.Beta, db = b.H + b.Beta;
        double dDir = AngDiff(da, db), dSlip = Math.Abs(a.Beta - b.Beta);
        if (dDir > MaxHeading || dSlip > MaxSlipDiff) return none;
        var qp = Math.Clamp((MaxGap - gap) / (MaxGap - IdealGap), 0, 1);
        var qa = Math.Clamp(1 - Math.Max(dDir / MaxHeading, dSlip / MaxSlipDiff), 0, 1);
        var q = qp * (0.4 + 0.6 * qa);
        if (q < MinQuality) return none;
        double mx = Math.Sin(da) + Math.Sin(db), mz = Math.Cos(da) + Math.Cos(db), ml = double.Hypot(mx, mz);
        if (ml == 0) ml = 1;
        var along = ((b.X - a.X) * mx + (b.Z - a.Z) * mz) / ml;   // positive = b is ahead of a
        return Math.Abs(along) < Side ? new(true, q, gap, TandemRole.Side, TandemRole.Side)
            : along > 0 ? new(true, q, gap, TandemRole.Chase, TandemRole.Lead) : new(true, q, gap, TandemRole.Lead, TandemRole.Chase);
    }
}

/// <summary>One car's tandem chain: the multiplier and the bonus points, advanced by the poses.</summary>
public sealed class TandemChain
{
    public bool Active { get; private set; }
    public double Q { get; private set; }
    public double Mult { get; private set; } = 1;
    public double ChainTime { get; private set; }
    public double GraceLeft { get; private set; }
    public double Pending { get; private set; }
    public double Banked { get; private set; }
    public double Best { get; private set; }
    public TandemRole Role { get; private set; }

    /// <summary>What the car earned: banked plus pending.</summary>
    public double Total => Banked + Pending;

    /// <param name="partner">the pair's state seen from this car (null = no partner now)</param>
    /// <returns>the points of a chain that ended in this step (banked), or null</returns>
    public int? Step((double Q, TandemRole Role, double Speed, double Slip)? obs, double dt)
    {
        int? ev = null;
        if (obs is { } o)
        {
            Q += (o.Q - Q) * Math.Min(1, dt * Tandem.Smooth);
            if (ChainTime == 0) Q = o.Q;
            ChainTime += dt; GraceLeft = Tandem.Grace; Role = o.Role;
            Mult = Math.Min(Tandem.MaxMult, 1 + 0.5 * Q + Math.Min(0.5, ChainTime * 0.05));
            var deg = Math.Abs(o.Slip) * (180 / Math.PI);
            Pending += Math.Min(Tandem.MaxPointsPerSecond, Tandem.Rate * Math.Abs(o.Speed) * Math.Pow(deg, Tandem.Exponent) * (Mult - 1)) * dt;
        }
        else if (ChainTime > 0)
        {
            GraceLeft -= dt;
            if (GraceLeft <= 0)
            {
                if (Pending > 0) { ev = (int)Math.Round(Pending); Banked += Pending; Best = Math.Max(Best, Pending); }
                Pending = 0; Mult = 1; ChainTime = 0; GraceLeft = 0; Q = 0; Role = TandemRole.None;
            }
        }
        Active = obs is not null;
        return ev;
    }
}

/// <summary>
/// Follows the poses of the lobby and judges tandems for every car, on the server's own numbers: the nearest partner that is in tandem with a car gives it its
/// multiplier and its role. The car is told on a change ({ t: "tandem", on, mult, role, q } at most four times a second) and when a chain is banked
/// ({ t: "tandem.bank", points }); the best chain of a signed-in person is written to the boards (kind 3). Guests are judged and told, but write nothing.
/// </summary>
public sealed class TandemTracker(IBestTimes? best, int map = 0, Func<Guid, int>? feelOf = null, Func<Guid, bool>? creativeOf = null)
{
    public const int Board = 3;
    sealed class Car(Guid person, string name, bool guest, int carId) { public Guid Person = person; public string Name = name; public bool Guest = guest; public int CarId = carId; public TandemCar Pose; public double At = -1, Stepped = -1; public TandemChain Chain = new(); public double Sent = -9; public int SentMult = -1; public TandemRole SentRole; public bool SentOn; public byte PartnerId; }
    readonly object gate = new();
    readonly Dictionary<Session, Car> cars = [];

    public void Follow(WorldRelay relay) => relay.PoseAccepted += Pose;

    public void Join(Session s, Guid person, string name, bool guest, int carId) { lock (gate) cars[s] = new Car(person, name, guest, carId); }
    public void Leave(Session s) { lock (gate) cars.Remove(s); }

    /// <summary>The tandem bonus points a car has earned so far (banked plus pending), for the tandem challenge.</summary>
    public double TotalOf(Session s) { lock (gate) return cars.TryGetValue(s, out var c) ? c.Chain.Total : 0; }

    /// <summary>What a car's chain is now (for tests and for the stats).</summary>
    public (double Mult, TandemRole Role, double Pending, double Banked)? StateOf(Session s) { lock (gate) return cars.TryGetValue(s, out var c) ? (c.Chain.Mult, c.Chain.Role, c.Chain.Pending, c.Chain.Banked) : null; }

    static void Send(Session s, object message) { if (s.Peer is ITextPeer p) p.SendText(System.Text.Json.JsonSerializer.Serialize(message)); }

    void Pose(PoseSample p)
    {
        List<(Guid Person, int Points, int CarId)>? banked = null;
        lock (gate)
        {
            if (!cars.TryGetValue(p.Session, out var me)) return;
            me.Pose = new TandemCar(p.X, p.Z, p.Heading, p.Vf, p.Beta); me.At = p.Seconds;
            // the nearest partner in tandem with this car, judged on the latest pose of each (a pose older than half a second is not a car that is still there)
            double bestQ = 0; TandemPairState bestPair = default; Session? partner = null;
            foreach (var (os, o) in cars)
            {
                if (os == p.Session || o.At < 0 || p.Seconds - o.At > 0.5) continue;
                if (Math.Abs(o.Pose.X - me.Pose.X) > Tandem.MaxGap || Math.Abs(o.Pose.Z - me.Pose.Z) > Tandem.MaxGap) continue;
                var pair = Tandem.Pair(me.Pose, o.Pose);
                if (pair.Active && pair.Q > bestQ) { bestQ = pair.Q; bestPair = pair; partner = os; }
            }
            var dt = me.Stepped < 0 ? 0 : Math.Clamp(p.Seconds - me.Stepped, 0, 0.25);
            me.Stepped = p.Seconds;
            if (dt > 0 || partner is null)
            {
                var ev = me.Chain.Step(partner is null ? null : (bestPair.Q, bestPair.RoleA, Math.Abs(p.Vf), Math.Abs(p.Beta)), dt);
                if (partner is not null) me.PartnerId = partner.Id;
                if (ev is { } points)
                {
                    Send(p.Session, new { t = "tandem.bank", points });
                    if (!me.Guest && !(creativeOf?.Invoke(me.Person) ?? false)) (banked ??= []).Add((me.Person, points, me.CarId));
                }
            }
            // told on a change, at most four times a second
            var on = me.Chain.Active; var mult = (int)Math.Round(me.Chain.Mult * 10);
            if ((on != me.SentOn || (on && (mult != me.SentMult || me.Chain.Role != me.SentRole))) && p.Seconds - me.Sent >= 0.25)
            {
                me.Sent = p.Seconds; me.SentOn = on; me.SentMult = mult; me.SentRole = me.Chain.Role;
                Send(p.Session, new { t = "tandem", on, mult = Math.Round(me.Chain.Mult, 1), role = me.Chain.Role.ToString().ToLowerInvariant(), q = Math.Round(me.Chain.Q, 2), with = on ? (int?)me.PartnerId : null });
            }
        }
        if (banked is not null && best is not null)
            foreach (var (person, points, carId) in banked)
                if (points >= 1) _ = Task.Run(async () => { try { await best.RecordAsync(person, map, Board, points, carId, feelOf?.Invoke(person) ?? 0); } catch (Exception) { /* a board that cannot be written costs nothing here */ } });
    }
}

/// <summary>
/// The tandem competition of two drivers, as pure logic (no sockets yet, no page: docs/PLAN-0.2.md step 4). Two rounds of the same length; in the first round A leads and B
/// chases, then they swap. Both cars are judged, and the pair's score is the sum of everything both earned:
///  - the **lead** earns the normal drift rate of its own slide (speed and angle) while it drifts;
///  - the **chase** earns the same rate times the tandem quality (how close and how alike it drives to the lead) while it is behind the lead.
/// A chase that is in fact ahead of the lead earns nothing (the roles are about who is in front), the lead still earns its own slide.
/// A countdown and a short pause before the swap are not scored.
/// </summary>
public sealed class TandemRun(double roundSeconds = 30, double countdown = 3, double pause = 4)
{
    public enum Phase { Waiting, Countdown, Round1, Swap, Round2, Done }
    public Phase Now { get; private set; } = Phase.Waiting;
    public double RoundSeconds { get; } = roundSeconds;
    /// <summary>Points of each driver (0 = A, 1 = B) per round, and the pair's total.</summary>
    public double[,] Points { get; } = new double[2, 2];
    public double Total => Points[0, 0] + Points[0, 1] + Points[1, 0] + Points[1, 1];
    TandemCar? a, b;
    double phaseStart, last = -1;
    /// <summary>When the current phase began (the clock of `Tick`).</summary>
    public double PhaseStart => phaseStart;

    /// <summary>The role of a driver (0 = A, 1 = B) in the current round, or None outside a round.</summary>
    public TandemRole RoleOf(int who) => Now switch
    {
        Phase.Round1 => who == 0 ? TandemRole.Lead : TandemRole.Chase,
        Phase.Round2 => who == 0 ? TandemRole.Chase : TandemRole.Lead,
        _ => TandemRole.None,
    };

    public void Start(double now) { Now = Phase.Countdown; phaseStart = now; last = -1; }

    /// <summary>The newest pose of a driver (0 = A, 1 = B).</summary>
    public void Pose(int who, TandemCar car) { if (who == 0) a = car; else b = car; }

    /// <summary>Advance the clock; scores the time since the last call from the newest poses. Returns the phase changes ("round1", "swap", "round2", "done") in this call.</summary>
    public List<string> Tick(double now)
    {
        var events = new List<string>();
        var dt = last < 0 ? 0 : Math.Clamp(now - last, 0, 0.25);
        last = now;
        switch (Now)
        {
            case Phase.Countdown when now - phaseStart >= countdown: Now = Phase.Round1; phaseStart = now; events.Add("round1"); break;
            case Phase.Round1 when now - phaseStart >= RoundSeconds: Now = Phase.Swap; phaseStart = now; events.Add("swap"); break;
            case Phase.Swap when now - phaseStart >= pause: Now = Phase.Round2; phaseStart = now; events.Add("round2"); break;
            case Phase.Round2 when now - phaseStart >= RoundSeconds: Now = Phase.Done; events.Add("done"); break;
        }
        if (Now is Phase.Round1 or Phase.Round2 && dt > 0 && a is { } ca && b is { } cb)
        {
            var round = Now == Phase.Round1 ? 0 : 1;
            var pair = Tandem.Pair(ca, cb);
            for (var who = 0; who < 2; who++)
            {
                var car = who == 0 ? ca : cb;
                var rate = Rate(car);
                if (rate <= 0) continue;
                var role = RoleOf(who);
                if (role == TandemRole.Lead) Points[who, round] += rate * dt;
                else if (pair.Active && (who == 0 ? pair.RoleA : pair.RoleB) is TandemRole.Chase or TandemRole.Side) Points[who, round] += rate * pair.Q * dt;
            }
        }
        return events;
    }

    /// <summary>The drift rate of one car (the drift score's formula without the chain multiplier), points per second; 0 when it does not drift.</summary>
    static double Rate(TandemCar c) =>
        Math.Abs(c.Beta) > Tandem.MinSlip && Math.Abs(c.Vf) > Tandem.MinSpeed
            ? Math.Min(DriftScore.MaxPointsPerSecond / DriftScore.MaxMult, DriftScore.Rate * Math.Abs(c.Vf) * Math.Pow(Math.Abs(c.Beta) * (180 / Math.PI), DriftScore.Exponent))
            : 0;

    /// <summary>Writes the pair's score to the boards of both (signed-in) drivers; the best of each is kept. Kind 4.</summary>
    public async Task RecordAsync(IBestTimes best, (Guid Person, bool Guest, int Car) a, (Guid Person, bool Guest, int Car) b, int map = 0, int feel = 0)
    {
        if (Now != Phase.Done || (int)Math.Round(Total) < 1) return;
        foreach (var (person, guest, car) in new[] { a, b }) if (!guest) await best.RecordAsync(person, map, TandemRun.Board, (int)Math.Round(Total), car, feel);
    }

    public const int Board = 4;
}
