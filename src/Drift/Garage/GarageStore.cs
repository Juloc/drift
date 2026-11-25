using Base.Data;
using Npgsql;

namespace Drift.Garage;

/// <summary>What a person drives: a car (0..4), a colour (0..23, steps of 15 degrees on the colour wheel; 24 white, 25 black, 26 silver) and a nickname or null.</summary>
public sealed record Profile(int Car, int Colour, string? Nick, int? Glow = null);

/// <summary>The garage of every person. Every statement names the owner (DATA-03).</summary>
public sealed class GarageStore(NpgsqlDataSource db)
{
    public static readonly string[] CarNames = ["Dart", "AE86", "Bruno", "Marlin", "Ox"];

    /// <summary>The profile, or the defaults of a person who has never saved one: the first car, a colour that follows the person's id.</summary>
    public async Task<Profile> GetAsync(Guid userId, CancellationToken ct = default) =>
        await db.FirstAsync("select car_id, colour, nick, glow from drift_profile where user_id = $1",
            r => new Profile(r.GetInt16(0), r.GetInt16(1), r.TextOrNull(2), r.IsDBNull(3) ? null : r.GetInt16(3)), ct, userId)
        ?? new Profile(0, DefaultColour(userId), null);

    public async Task<Profile> SaveAsync(Guid userId, Profile p, CancellationToken ct = default)
    {
        await db.ExecAsync(
            """
            insert into drift_profile (user_id, car_id, colour, nick, nick_key, glow) values ($1, $2, $3, $4, $6, $5)
            on conflict (user_id) do update set car_id = $2, colour = $3, nick = $4, nick_key = $6, glow = $5, updated_at = now()
            """, ct, userId, (short)p.Car, (short)p.Colour, p.Nick, p.Glow is { } g ? (short)g : DBNull.Value, p.Nick is null ? DBNull.Value : Drift.GameAccounts.NameRules.Key(p.Nick));
        return p;
    }

    /// <summary>
    /// The name the others see: the nickname, or a neutral name from the relay's fixed list (a colour word that follows the car's colour and an animal
    /// that follows the person's id): the same for one person every time, never the account name, which could be a real name.
    /// </summary>
    public static string DisplayName(Guid userId, Profile p, string? accountName = null) => p.Nick ?? accountName ?? NeutralName(userId, p.Colour);

    public static string NeutralName(Guid userId, int colour)
    {
        var h = userId.ToByteArray().Aggregate(17, (a, b) => unchecked(a * 31 + b));
        return Drift.Relay.WorldRelay.Colours[colour / 2 % Drift.Relay.WorldRelay.Colours.Length] + " " + Drift.Relay.WorldRelay.Animals[(h & 0x7fffffff) % Drift.Relay.WorldRelay.Animals.Length];
    }

    /// <summary>New drivers are white (the paint of the first mockup car); 24 is white.</summary>
    public static int DefaultColour(Guid userId) => 24;
}
