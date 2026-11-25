using Base.Data;
using Npgsql;

namespace Drift.Garage;

/// <summary>What a person drives: a car (0..4), a colour (0..23, steps of 15 degrees on the colour wheel) and a nickname or null.</summary>
public sealed record Profile(int Car, int Colour, string? Nick);

/// <summary>The garage of every person. Every statement names the owner (DATA-03).</summary>
public sealed class GarageStore(NpgsqlDataSource db)
{
    public static readonly string[] CarNames = ["Dart", "Pip", "Bruno", "Marlin", "Ox"];

    /// <summary>The profile, or the defaults of a person who has never saved one: the first car, a colour that follows the person's id.</summary>
    public async Task<Profile> GetAsync(Guid userId, CancellationToken ct = default) =>
        await db.FirstAsync("select car_id, colour, nick from drift_profile where user_id = $1",
            r => new Profile(r.GetInt16(0), r.GetInt16(1), r.TextOrNull(2)), ct, userId)
        ?? new Profile(0, DefaultColour(userId), null);

    public async Task<Profile> SaveAsync(Guid userId, Profile p, CancellationToken ct = default)
    {
        await db.ExecAsync(
            """
            insert into drift_profile (user_id, car_id, colour, nick) values ($1, $2, $3, $4)
            on conflict (user_id) do update set car_id = $2, colour = $3, nick = $4, updated_at = now()
            """, ct, userId, (short)p.Car, (short)p.Colour, p.Nick);
        return p;
    }

    public static int DefaultColour(Guid userId) => userId.ToByteArray().Aggregate(0, (a, b) => a * 31 + b) is var n && n < 0 ? (-n) % 24 : n % 24;
}
