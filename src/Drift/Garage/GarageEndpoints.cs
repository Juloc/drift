using System.Text.RegularExpressions;
using Base.Core;
using Base.Web;
using Base.Web.Auth;
using Drift.GameAccounts;

namespace Drift.Garage;

public sealed record GarageRequest(int? Car, int? Colour, string? Nick, int? Glow = null);

/// <summary>The garage: the person's car, colour and nickname. The person comes from the session, never from the request.</summary>
internal static partial class GarageEndpoints
{
    // letters, digits, space, dash, underscore, dot: no markup, no look-alike control characters
    [GeneratedRegex(@"^[\p{L}\p{N}][\p{L}\p{N} ._-]*$")]
    private static partial Regex NickPattern();

    public static void MapGarage(this IEndpointRouteBuilder app)
    {
        // the same garage for a hub person (/api, the base's guard) and for a games account (/api/games, its own door)
        foreach (var prefix in new[] { "/api", GameAccountEndpoints.Prefix })
        {
        app.MapGet(prefix + "/garage", async (HttpContext ctx, GarageStore garage) =>
        {
            var me = ctx.Owner();
            return Results.Ok(Body(me, await garage.GetAsync(me, ctx.RequestAborted), ctx.AccountName()));
        });

        app.MapPut(prefix + "/garage", async (GarageRequest body, HttpContext ctx, GarageStore garage) =>
        {
            var me = ctx.Owner();
            var v = new Validator();
            var car = v.Int("car", body.Car, 0, GarageStore.CarNames.Length - 1);
            var colour = v.Int("colour", body.Colour, 0, 23);
            var nick = v.OptionalText("nick", body.Nick, 16);
            int? glow = null;
            if (body.Glow is { } gl) glow = v.Int("glow", gl, 0, 23);   // absent or null: no underglow
            if (nick.Length == 1) v.Fail("nick", Validator.TooShort);
            if (nick.Length > 1 && !NickPattern().IsMatch(nick)) v.Fail("nick", Validator.NotValid);
            if (nick.Length > 1 && v.Ok && !NameFilter.Allowed(nick)) v.Fail("nick", "not_allowed");
            if (v.Error is { } error) return error.ToHttp();
            return Results.Ok(Body(me, await garage.SaveAsync(me, new Profile(car, colour, nick.Length == 0 ? null : nick, glow), ctx.RequestAborted), ctx.AccountName()));
        });
        }
    }

    private static object Body(Guid userId, Profile p, string? accountName) => new
    {
        car = p.Car, colour = p.Colour, nick = p.Nick, glow = p.Glow,
        name = GarageStore.DisplayName(userId, p, accountName),   // what the others see above the car: the nickname, a games account's chosen name, or a neutral name (never a hub account name)
        cars = GarageStore.CarNames,
    };
}
