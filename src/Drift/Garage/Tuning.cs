using Base.Core;
using Base.Data;
using Base.Web;
using Base.Web.Auth;
using Npgsql;

namespace Drift.Garage;

/// <summary>Four sliders, each -3..+3, at most 10 points together (the sum of the distances from 0). The same rules as game/sim/tuning.js.</summary>
public sealed record Tuning(int Steer, int Balance, int Power, int Handbrake)
{
    public const int Max = 3, Budget = 10;
    public static readonly Tuning None = new(0, 0, 0, 0);
    public int Cost => Math.Abs(Steer) + Math.Abs(Balance) + Math.Abs(Power) + Math.Abs(Handbrake);
    public bool Tuned => Cost > 0;
    public bool Valid => new[] { Steer, Balance, Power, Handbrake }.All(v => Math.Abs(v) <= Max) && Cost <= Budget;
    /// <summary>More wheel angle costs a little top speed (x 0.988 per point): what the server judges lap times and speeds by.</summary>
    public double TopFactor => 1 - 0.012 * Steer;
}

public sealed record TuningRequest(int? Steer, int? Balance, int? Power, int? Handbrake);

public sealed class TuningStore(NpgsqlDataSource db)
{
    public async Task<Tuning> GetAsync(Guid userId, int car, CancellationToken ct = default) =>
        await db.FirstAsync("select steer, balance, power, handbrake from drift_tuning where user_id = $1 and car_id = $2",
            r => new Tuning(r.GetInt16(0), r.GetInt16(1), r.GetInt16(2), r.GetInt16(3)), ct, userId, (short)car) ?? Tuning.None;

    public async Task<Tuning[]> AllAsync(Guid userId, CancellationToken ct = default)
    {
        var all = Enumerable.Repeat(Tuning.None, GarageStore.CarNames.Length).ToArray();
        foreach (var (car, t) in await db.QueryAsync("select car_id, steer, balance, power, handbrake from drift_tuning where user_id = $1",
                     r => (Car: (int)r.GetInt16(0), T: new Tuning(r.GetInt16(1), r.GetInt16(2), r.GetInt16(3), r.GetInt16(4))), ct, userId))
            all[car] = t;
        return all;
    }

    public Task SaveAsync(Guid userId, int car, Tuning t, CancellationToken ct = default) =>
        db.ExecAsync(
            """
            insert into drift_tuning (user_id, car_id, steer, balance, power, handbrake) values ($1, $2, $3, $4, $5, $6)
            on conflict (user_id, car_id) do update set steer = $3, balance = $4, power = $5, handbrake = $6
            """, ct, userId, (short)car, (short)t.Steer, (short)t.Balance, (short)t.Power, (short)t.Handbrake);
}

internal static class TuningEndpoints
{
    public static void MapTuning(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/tuning", async (HttpContext ctx, TuningStore store) =>
            Results.Ok(new { cars = (await store.AllAsync(ctx.Person().UserId, ctx.RequestAborted)).Select(t => new { steer = t.Steer, balance = t.Balance, power = t.Power, handbrake = t.Handbrake }), budget = Tuning.Budget, max = Tuning.Max }));

        app.MapPut("/api/tuning/{car:int}", async (int car, TuningRequest body, HttpContext ctx, TuningStore store) =>
        {
            var v = new Validator();
            if (car < 0 || car >= GarageStore.CarNames.Length) return Error.NotFound().ToHttp();
            var t = new Tuning(v.Int("steer", body.Steer, -Tuning.Max, Tuning.Max), v.Int("balance", body.Balance, -Tuning.Max, Tuning.Max),
                v.Int("power", body.Power, -Tuning.Max, Tuning.Max), v.Int("handbrake", body.Handbrake, -Tuning.Max, Tuning.Max));
            if (v.Ok && t.Cost > Tuning.Budget) return new Error(ErrorKind.Invalid, "tuning.budget", "More than 10 points.").ToHttp();
            if (v.Error is { } error) return error.ToHttp();
            await store.SaveAsync(ctx.Person().UserId, car, t, ctx.RequestAborted);
            return Results.Ok(new { steer = t.Steer, balance = t.Balance, power = t.Power, handbrake = t.Handbrake });
        });
    }
}
