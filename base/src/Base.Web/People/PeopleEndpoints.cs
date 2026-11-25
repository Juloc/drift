using Base.Accounts;
using Base.Core;
using Base.Web.Auth;

namespace Base.Web;

public sealed record PersonDto(Guid Id, string Name, string? Role, string State, bool ViaHub, DateTimeOffset CreatedAt, DateTimeOffset? LastSeen, DateTimeOffset? InviteUntil);
public sealed record PeopleResponse(PersonDto[] People, AppRole[] Roles);
public sealed record CreatePersonRequest(string? Name, string? Role);
public sealed record InviteDto(string Token, DateTimeOffset ExpiresAt);
public sealed record CreatePersonResponse(PersonDto Person, InviteDto Invite);
public sealed record RoleRequest(string? Role);
public sealed record InviteTokenRequest(string? Token);
public sealed record InviteBeginRequest(string? Token, string? Password);
public sealed record InviteFinishRequest(string? Token, string? Totp);
public sealed record InviteInfoResponse(string User, string? Role);

/// <summary>
/// The people of the app (admin only: the whole group declares <c>RequireRole</c>, so no endpoint here can forget it) and the three public steps
/// behind an invitation link.
/// </summary>
internal static class PeopleEndpoints
{
    public static void MapBasePeople(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/people").RequireRole(Roles.Admin);

        admin.MapGet("", async (PeopleService people, InviteStore invites, AppRoles roles, CancellationToken ct) =>
        {
            var list = await people.ListAsync(ct);
            var dtos = new List<PersonDto>();
            foreach (var p in list)
                dtos.Add(new PersonDto(p.Id, p.Name, p.Role, p.State, p.ViaHub, p.CreatedAt, p.LastSeen, p.State == PersonState.Invited ? await invites.OpenUntilAsync(p.Id, ct) : null));
            return new PeopleResponse([.. dtos], [.. roles.All]);
        });

        admin.MapPost("", async (CreatePersonRequest body, HttpContext ctx, PeopleService people) =>
            (await people.CreateAsync(ctx.Person(), body.Name, body.Role, ctx.ClientIp(), ctx.RequestAborted))
                .ToHttp(c => Results.Ok(new CreatePersonResponse(Dto(c.Person, c.Invite.ExpiresAt), new InviteDto(c.Invite.Token, c.Invite.ExpiresAt)))));

        admin.MapPost("/{id:guid}/invite", async (Guid id, HttpContext ctx, PeopleService people) =>
            (await people.ReinviteAsync(ctx.Person(), id, ctx.ClientIp(), ctx.RequestAborted)).ToHttp(i => Results.Ok(new InviteDto(i.Token, i.ExpiresAt))));

        admin.MapPut("/{id:guid}/role", async (Guid id, RoleRequest body, HttpContext ctx, PeopleService people) =>
            (await people.SetRoleAsync(ctx.Person(), id, body.Role, ctx.ClientIp(), ctx.RequestAborted)).ToHttp());

        admin.MapPost("/{id:guid}/block", async (Guid id, HttpContext ctx, PeopleService people) =>
            (await people.SetBlockedAsync(ctx.Person(), id, true, ctx.ClientIp(), ctx.RequestAborted)).ToHttp());

        admin.MapPost("/{id:guid}/unblock", async (Guid id, HttpContext ctx, PeopleService people) =>
            (await people.SetBlockedAsync(ctx.Person(), id, false, ctx.ClientIp(), ctx.RequestAborted)).ToHttp());

        admin.MapDelete("/{id:guid}", async (Guid id, HttpContext ctx, PeopleService people) =>
            (await people.DeleteAsync(ctx.Person(), id, ctx.ClientIp(), ctx.RequestAborted)).ToHttp());

        admin.MapGet("/{id:guid}/history", async (Guid id, PeopleService people, CancellationToken ct) =>
            await people.HistoryAsync(id, ct) is { } entries
                ? Results.Ok(new AuditResponse([.. entries.Select(e => new AuditDto(e.At, e.Event, e.Detail, e.Ip))]))
                : Error.NotFound("people.unknown", "No such person.").ToHttp());

        // the invited person: the link is the only proof, so these three are public and every step is limited per address (AUTH-11)
        app.MapPost("/api/invite/check", async (InviteTokenRequest body, HttpContext ctx, PeopleService people) =>
            (await people.CheckInviteAsync(body.Token, ctx.ClientIp(), ctx.RequestAborted)).ToHttp(i => Results.Ok(new InviteInfoResponse(i.User, i.Role))));

        app.MapPost("/api/invite/begin", async (InviteBeginRequest body, HttpContext ctx, PeopleService people) =>
            (await people.BeginInviteAsync(body.Token, body.Password, ctx.ClientIp(), ctx.RequestAborted)).ToHttp(s => Results.Ok(new SetupBeginResponse(s.Secret, s.Uri, s.Recovery))));

        app.MapPost("/api/invite/finish", async (InviteFinishRequest body, HttpContext ctx, PeopleService people, SessionCookie cookie) =>
            (await people.FinishInviteAsync(body.Token, body.Totp, ctx.ClientIp(), ctx.Request.Headers.UserAgent, ctx.RequestAborted))
                .ToHttp(s => { cookie.Write(ctx, s.Token); return Results.Ok(new LoginResponse(s.User, s.Roles, s.RecoveryLeft)); }));
    }

    private static PersonDto Dto(PersonRow p, DateTimeOffset? inviteUntil) => new(p.Id, p.Name, p.Role, p.State, p.ViaHub, p.CreatedAt, p.LastSeen, inviteUntil);
}
