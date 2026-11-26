namespace Drift.Race;

/// <summary>
/// The clipping points of a map (game/sim/zones.js, the same rules): a drift through the zone round a point pays a bonus for the angle and the speed, more the closer the car
/// came to the point, half as much again for a clean clip (within 1.5 m); each point pays once per run, when the car leaves its zone. The server judges it on the poses it
/// gets (about 15 a second: the closest pose counts, so a clean clip can be missed by a little). The bonus is added to the pending points of the drift chain by the caller.
/// </summary>
public sealed class ZoneScore(IReadOnlyList<(double X, double Z, double R)> clips)
{
    public const double Radius = 9, Clip = 1.5, ClipFactor = 1.5, MinSlip = 0.26, MinSpeed = 8, Rate = 50;
    /// <summary>The server's own ceiling for one clipping point (a perfect pass pays about 3000).</summary>
    public const double MaxPerPoint = 4000;
    readonly bool[] paid = new bool[clips.Count];
    readonly (double Value, double Dist)?[] best = new (double, double)?[clips.Count];

    /// <summary>One pose: the car at (x, z) with body slip `slip` (rad) and speed. Returns the bonus that falls due in this step (0 in most).</summary>
    public double Step(double x, double z, double slip, double speed)
    {
        double bonus = 0;
        for (var i = 0; i < clips.Count; i++)
        {
            if (paid[i]) continue;
            var c = clips[i]; var d = double.Hypot(x - c.X, z - c.Z); var r = c.R > 0 ? c.R : Radius;
            var drifting = Math.Abs(slip) > MinSlip && speed > MinSpeed;
            if (d <= r)
            {
                if (drifting)
                {
                    var value = speed * 3.6 / 10 * (Math.Abs(slip) * (180 / Math.PI) / 10) * Rate * (1 - d / r);
                    if (best[i] is not { } b || value > b.Value) best[i] = (value, d);
                }
            }
            else if (best[i] is { } b)
            {
                paid[i] = true;
                bonus += Math.Min(MaxPerPoint, Math.Round(b.Value * (b.Dist <= Clip ? ClipFactor : 1)));
            }
        }
        return bonus;
    }
}
