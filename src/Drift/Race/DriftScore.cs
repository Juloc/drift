namespace Drift.Race;

/// <summary>
/// The drift score, the same state machine as game/sim/score.js (a test reads the same vectors file as the browser's test). A car is drifting while its
/// body slip is over 15 degrees at over 8 m/s and nothing is touched; points per second = 0.35 * speed * degrees^0.8 times a chain multiplier that grows
/// by one for every 2 s of drifting (to x5) and is kept for 1.5 s after the slide ends. Pending points are banked when the chain ends cleanly and lost
/// on a hit or a spin. The server feeds it from the poses (15 a second), so its total can differ a little from the live number in the browser.
/// </summary>
public sealed class DriftScore
{
    public const double MinSlip = 0.26, MinSpeed = 8, Rate = 0.35, Exponent = 0.8, SecondsPerStep = 2, Grace = 1.5, Spin = 1.9;
    public const int MaxMult = 5;
    /// <summary>The server's own ceiling on points per second (a perfect drift at the top multiplier earns about 2300); the browser's score has none. A faked stream cannot earn more.</summary>
    public const double MaxPointsPerSecond = 2500;

    public double Pending { get; private set; }
    public double Banked { get; private set; }
    public int Mult { get; private set; } = 1;
    public double ChainTime { get; private set; }
    public double GraceLeft { get; private set; }
    public bool Drifting { get; private set; }
    public double Best { get; private set; }

    /// <summary>Points that fall due outside the drift itself (a clipping point's bonus): they join the chain in progress, so they are multiplied by it no more and lost with it on a hit.</summary>
    public void AddPending(double points) { if (Pending > 0) Pending += points; }

    /// <summary>What the car has earned so far: banked plus what is still pending.</summary>
    public double Total => Banked + Pending;

    /// <param name="slip">body slip, rad (signed)</param>
    /// <param name="speed">m/s</param>
    /// <param name="hit">speed of a wall hit in this step, 0 = none</param>
    /// <param name="turned">angle between nose and travel, rad</param>
    /// <returns>"bank", "lost" or null</returns>
    public string? Step(double slip, double speed, double hit, double turned, double dt)
    {
        string? ev = null;
        var deg = Math.Abs(slip) * (180 / Math.PI);
        var drifting = Math.Abs(slip) > MinSlip && speed > MinSpeed && hit <= 0 && turned < Spin;
        if (hit > 2 || turned >= Spin)
        {
            if (Pending > 0) ev = "lost";
            Pending = 0; Mult = 1; ChainTime = 0; GraceLeft = 0;
        }
        else if (drifting)
        {
            ChainTime += dt;
            GraceLeft = Grace;
            Mult = Math.Min(MaxMult, 1 + (int)Math.Floor(ChainTime / SecondsPerStep));
            Pending += Math.Min(Rate * speed * Math.Pow(deg, Exponent) * Mult, MaxPointsPerSecond) * dt;
        }
        else if (ChainTime > 0)
        {
            GraceLeft -= dt;
            if (GraceLeft <= 0)
            {
                if (Pending > 0) { ev = "bank"; Banked += Pending; Best = Math.Max(Best, Pending); }
                Pending = 0; Mult = 1; ChainTime = 0; GraceLeft = 0;
            }
        }
        Drifting = drifting;
        return ev;
    }
}
