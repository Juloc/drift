using Drift.Garage;
using Drift.Relay;

namespace Drift.Play;

/// <summary>
/// Playing without an account (docs/FOCUS.md, the owner's wish): the door <c>/api/open</c> lets anybody in to the public lobby, the same world as the signed-in drivers. Nothing is kept:
/// a name from the relay (a colour word and an animal), the AE86, the paint the device chooses (0 to 26, checked; anything else: the relay picks a hue), no stats, no boards. The relay's
/// own protection applies as for everybody (limits per address, idle drop, the pose checks, fixed emotes); on top of that only <see cref="Cap"/> of these connections at once.
/// </summary>
public static class OpenPlay
{
    public const string Key = "drift.open", Path = "/api/open/ws", RacePath = "/api/open/race/ws", TimesPath = "/api/open/times";
    public const int Cap = 96;
    static int open;

    public static ValueTask<bool> Check(HttpContext ctx) { ctx.Items[Key] = true; return ValueTask.FromResult(true); }

    public static bool TryEnter() { if (Interlocked.Increment(ref open) > Cap) { Interlocked.Decrement(ref open); return false; } return true; }
    public static void Leave() => Interlocked.Decrement(ref open);

    /// <summary>A guest's name as the others see it: "Name (Gast)" or "Name (Guest)". Guests choose freely (no rules on the content, duplicates are fine); only what the technique needs: no control characters or line breaks, 2 to 20 characters (the relay shows it as text, the page never as HTML).</summary>
    public static string GuestName(string? name, bool de)
    {
        var t = new string((name ?? "").Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (t.Length > 20) t = t[..20].TrimEnd();
        if (t.Length < 2) t = WorldRelay.Colours[Random.Shared.Next(WorldRelay.Colours.Length)] + " " + WorldRelay.Animals[Random.Shared.Next(WorldRelay.Animals.Length)];   // no name given: a colour and an animal as before
        return t + (de ? " (Gast)" : " (Guest)");
    }
    public static bool German(HttpContext ctx) => string.Equals(ctx.Request.Query["lang"], "de", StringComparison.OrdinalIgnoreCase);

    public static Player Player(HttpContext ctx)
    {
        var colour = int.TryParse(ctx.Request.Query["colour"], out var c) && c is >= 0 and <= 26 ? c : -1;
        // the page makes a random id once and keeps it on the device: the lobby socket and the race socket of one visitor meet through it (as the cookie does for a guest by link)
        var id = Guid.TryParse(ctx.Request.Query["id"], out var g) && g != Guid.Empty ? g : Guid.NewGuid();
        return new Player(id, GuestName(ctx.Request.Query["name"], German(ctx)), GarageStore.OnlyCar, colour, true, () => Task.FromResult(true));
    }
}
