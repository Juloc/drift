using Base.Web.Auth;
using Drift.GameAccounts;

namespace Drift;

/// <summary>Who owns the rows an endpoint reads and writes: a games account (behind the games door) or a hub person (behind the base's guard).</summary>
public static class Who
{
    public static Guid Owner(this HttpContext ctx) => ctx.IsGameAccount() ? ctx.GameAccount().Id : ctx.Person().UserId;

    /// <summary>The name a games account chose (shown when the garage has no nickname); null for a hub person, whose account name is never shown.</summary>
    public static string? AccountName(this HttpContext ctx) => ctx.IsGameAccount() ? ctx.GameAccount().Name : null;
}
