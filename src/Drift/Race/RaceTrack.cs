using System.Text.Json;

namespace Drift.Race;

public readonly record struct Gate(double Ax, double Az, double Bx, double Bz, double Dx, double Dz)
{
    public double Cx => (Ax + Bx) / 2;
    public double Cz => (Az + Bz) / 2;
}

public readonly record struct GridSlot(double X, double Z, double H);

/// <summary>
/// A race track as the map file describes it (the same file the browser draws): the gates a lap goes through, in order, the grid, the lap length and
/// the standard number of laps. Gate 0 is the start and finish line; the grid stands after it, so a lap ends when gate 0 is crossed again.
/// </summary>
public sealed class RaceTrack
{
    public IReadOnlyList<Gate> Gates { get; }
    public IReadOnlyList<GridSlot> Grid { get; }
    public double LoopLength { get; }
    public int Laps { get; }
    public int MapId { get; }
    public string Name { get; }
    /// <summary>Length of the way from the centre of gate i to the next one.</summary>
    public IReadOnlyList<double> Legs { get; }

    public RaceTrack(IReadOnlyList<Gate> gates, IReadOnlyList<GridSlot> grid, double loopLength, int laps, int mapId = 0, string name = "")
    {
        Gates = gates; Grid = grid; LoopLength = loopLength; Laps = laps; MapId = mapId; Name = name;
        Legs = [.. gates.Select((g, i) => double.Hypot(gates[(i + 1) % gates.Count].Cx - g.Cx, gates[(i + 1) % gates.Count].Cz - g.Cz))];
    }

    public static RaceTrack FromJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        double N(JsonElement e) => e.GetDouble();
        var gates = r.GetProperty("gates").EnumerateArray().Select(g =>
        {
            var a = g.GetProperty("a"); var b = g.GetProperty("b"); var d = g.GetProperty("d");
            return new Gate(N(a[0]), N(a[1]), N(b[0]), N(b[1]), N(d[0]), N(d[1]));
        }).ToList();
        var grid = r.GetProperty("grid").EnumerateArray().Select(g => new GridSlot(N(g.GetProperty("x")), N(g.GetProperty("z")), N(g.GetProperty("h")))).ToList();
        return new RaceTrack(gates, grid, N(r.GetProperty("loopLength")), r.GetProperty("laps").GetInt32(), r.GetProperty("id").GetInt32(), r.GetProperty("name").GetString() ?? "");
    }

    /// <summary>
    /// Does the movement from (x0, z0) to (x1, z1) cross gate <paramref name="g"/> in the direction of travel? <paramref name="at"/> is how far along
    /// the movement (0..1) it happened, so a time between two poses can be interpolated.
    /// </summary>
    public bool Crosses(int g, double x0, double z0, double x1, double z1, out double at)
    {
        at = 0;
        var gate = Gates[g];
        double mx = x1 - x0, mz = z1 - z0;
        if (mx * gate.Dx + mz * gate.Dz <= 0) return false;                 // against the direction of travel (or standing still)
        double gx = gate.Bx - gate.Ax, gz = gate.Bz - gate.Az;
        double den = mx * gz - mz * gx;
        if (Math.Abs(den) < 1e-9) return false;                              // parallel
        double t = ((gate.Ax - x0) * gz - (gate.Az - z0) * gx) / den;       // along the movement
        double u = ((gate.Ax - x0) * mz - (gate.Az - z0) * mx) / den;       // along the gate
        if (t < 0 || t > 1 || u < 0 || u > 1) return false;
        at = t;
        return true;
    }
}
