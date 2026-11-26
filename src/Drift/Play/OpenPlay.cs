using Drift.Garage;

namespace Drift.Play;

/// <summary>
/// Playing without an account (docs/FOCUS.md, the owner's wish): the door <c>/api/open</c> lets anybody in to the public lobby, the same world as the signed-in drivers. Nothing is kept:
/// a name from the relay (a colour word and an animal), the AE86, the paint the device chooses (0 to 26, checked; anything else: the relay picks a hue), no stats, no boards. The relay's
/// own protection applies as for everybody (limits per address, idle drop, the pose checks, fixed emotes); on top of that only <see cref="Cap"/> of these connections at once.
/// </summary>
public static class OpenPlay
{
    public const string Key = "drift.open", Path = "/api/open/ws";
    public const int Cap = 96;
    static int open;

    public static ValueTask<bool> Check(HttpContext ctx) { ctx.Items[Key] = true; return ValueTask.FromResult(true); }

    public static bool TryEnter() { if (Interlocked.Increment(ref open) > Cap) { Interlocked.Decrement(ref open); return false; } return true; }
    public static void Leave() => Interlocked.Decrement(ref open);

    public static Player Player(HttpContext ctx)
    {
        var colour = int.TryParse(ctx.Request.Query["colour"], out var c) && c is >= 0 and <= 26 ? c : -1;
        return new Player(Guid.NewGuid(), "", GarageStore.OnlyCar, colour, true, () => Task.FromResult(true));
    }
}
