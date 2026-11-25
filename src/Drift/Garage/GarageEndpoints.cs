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

        app.MapPut(prefix + "/garage", async (GarageRequest body, HttpContext ctx, GarageStore garage, Owners owners) =>
        {
            var me = ctx.Owner();
            var v = new Validator();
            var car = v.Int("car", body.Car, 0, GarageStore.CarNames.Length - 1);
            var colour = v.Int("colour", body.Colour, 0, 23);
            var nick = v.OptionalText("nick", body.Nick, 16);
            int? glow = null;
            if (body.Glow is { } gl) glow = v.Int("glow", gl, 0, 23);   // absent or null: no underglow
            // a nickname is a name everybody sees: the same rules as an account's name (Latin letters, reserved words, the filter), and nobody else shows or owns it
            if (nick.Length > 0 && NameRules.Problem(nick) is { } problem) v.Fail("nick", problem);
            if (v.Error is { } error) return error.ToHttp();
            if (nick.Length > 0 && await owners.NameTakenAsync(NameRules.Key(nick), me, ctx.RequestAborted)) return new Error(ErrorKind.Conflict, "games.name_taken", "This name is taken.", new Dictionary<string, string> { ["nick"] = "taken" }).ToHttp();
            try { return Results.Ok(Body(me, await garage.SaveAsync(me, new Profile(car, colour, nick.Length == 0 ? null : nick, glow), ctx.RequestAborted), ctx.AccountName())); }
            catch (Npgsql.PostgresException e) when (e.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation) { return new Error(ErrorKind.Conflict, "games.name_taken", "This name is taken.", new Dictionary<string, string> { ["nick"] = "taken" }).ToHttp(); }
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
