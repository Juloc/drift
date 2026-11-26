using Base.Web.Auth;
using Drift.GameAccounts;

namespace Drift;

/// <summary>Who owns the rows an endpoint reads and writes: a games account (behind the games door) or a hub person (behind the base's guard).</summary>
public static class Who
{
    public static Guid Owner(this HttpContext ctx) => ctx.IsGameAccount() ? ctx.GameAccount().Id : ctx.Person().UserId;

    /// <summary>The name that is shown for the person: a games account's name or a hub person's user name (the owner's rule: a signed-in person always shows the account's name; the garage nickname is not shown).</summary>
    public static string? AccountName(this HttpContext ctx) => ctx.IsGameAccount() ? ctx.GameAccount().Name : ctx.Person().UserName;
}
