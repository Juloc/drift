using System.Text.RegularExpressions;
using Base.Core;
using Base.Web;
using Base.Web.Auth;

namespace Drift.Garage;

public sealed record GarageRequest(int? Car, int? Colour, string? Nick);

/// <summary>The garage: the person's car, colour and nickname. The person comes from the session, never from the request.</summary>
internal static partial class GarageEndpoints
{
    // letters, digits, space, dash, underscore, dot: no markup, no look-alike control characters
    [GeneratedRegex(@"^[\p{L}\p{N}][\p{L}\p{N} ._-]*$")]
    private static partial Regex NickPattern();

    public static void MapGarage(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/garage", async (HttpContext ctx, GarageStore garage) =>
        {
            var me = ctx.Person();
            return Results.Ok(Body(await garage.GetAsync(me.UserId, ctx.RequestAborted), me.UserName));
        });

        app.MapPut("/api/garage", async (GarageRequest body, HttpContext ctx, GarageStore garage) =>
        {
            var me = ctx.Person();
            var v = new Validator();
            var car = v.Int("car", body.Car, 0, GarageStore.CarNames.Length - 1);
            var colour = v.Int("colour", body.Colour, 0, 23);
            var nick = v.OptionalText("nick", body.Nick, 16);
            if (nick.Length == 1) v.Fail("nick", Validator.TooShort);
            if (nick.Length > 1 && !NickPattern().IsMatch(nick)) v.Fail("nick", Validator.NotValid);
            if (v.Error is { } error) return error.ToHttp();
            return Results.Ok(Body(await garage.SaveAsync(me.UserId, new Profile(car, colour, nick.Length == 0 ? null : nick), ctx.RequestAborted), me.UserName));
        });
    }

    private static object Body(Profile p, string accountName) => new
    {
        car = p.Car, colour = p.Colour, nick = p.Nick,
        name = p.Nick ?? accountName,   // what the others see above the car
        cars = GarageStore.CarNames,
    };
}
