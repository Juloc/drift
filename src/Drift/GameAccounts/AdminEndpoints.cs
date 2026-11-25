using System.Security.Cryptography;
using Base.Accounts;
using Base.Core;
using Base.Data;
using Base.Web;
using Base.Web.Auth;
using Npgsql;

namespace Drift.GameAccounts;

public sealed record BanRequest(string? Range, int? Hours, string? Reason);
public sealed record ReportRequest(string? Name, int? Reason);

/// <summary>The administrator's side of the games accounts, behind the base's guard and the role "admin": the list, block, unblock, reset, delete, reports and bans. Every action is written to the audit log.</summary>
public static class AdminEndpoints
{
    public const string Prefix = "/api/games-admin";

    public static void MapGameAdmin(this WebApplication app)
    {
        var g = app.MapGroup(Prefix).RequireRole("admin");

        g.MapGet("/accounts", async (string? q, NpgsqlDataSource db, CancellationToken ct) =>
        {
            var key = NameRules.Key(q ?? "").Replace("%", "").Replace("_", "\\_");
            var rows = await db.QueryAsync("select id, name, state, created_at from games_account where name_key like $1 order by created_at desc limit 50",
                r => new { id = r.GetGuid(0), name = r.GetString(1), state = r.GetString(2), created = r.Time(3) }, ct, key + "%");
            return Results.Ok(new { accounts = rows });
        });

        g.MapPost("/accounts/{id:guid}/block", (Guid id, HttpContext ctx, NpgsqlDataSource db, AuditStore audit, IEnumerable<IAccountEvents> events) => SetState(id, "blocked", ctx, db, audit, events));
        g.MapPost("/accounts/{id:guid}/unblock", (Guid id, HttpContext ctx, NpgsqlDataSource db, AuditStore audit, IEnumerable<IAccountEvents> events) => SetState(id, "active", ctx, db, audit, events));

        g.MapPost("/accounts/{id:guid}/reset-password", async (Guid id, HttpContext ctx, NpgsqlDataSource db, PasswordHasher hasher, AuditStore audit, IEnumerable<IAccountEvents> events) =>
        {
            // one temporary password, shown once; the person must choose a new one at the next sign-in, and every session ends
            var temp = Ids.Token(9);
            var n = await db.ExecAsync("update games_account set password_hash = $2, must_change = true where id = $1", ctx.RequestAborted, id, await hasher.HashAsync(temp));
            if (n == 0) return Error.NotFound().ToHttp();
            await db.ExecAsync("delete from games_account_session where account_id = $1", ctx.RequestAborted, id);
            foreach (var e in events) e.Ended([id]);
            await audit.AddAsync(ctx.Person().UserName, "games.reset", ctx.ClientIp(), id.ToString(), ctx.RequestAborted);
            return Results.Ok(new { password = temp });
        });

        g.MapDelete("/accounts/{id:guid}", async (Guid id, HttpContext ctx, GameAccountService accounts, AuditStore audit, NpgsqlDataSource db) =>
        {
            // only a games account: this door must not delete a hub person's rows by guessing a Guid
            if (!await db.ScalarAsync<bool>("select exists (select 1 from games_account where id = $1)", ctx.RequestAborted, id)) return Error.NotFound().ToHttp();
            await accounts.DeleteAsync(id, ctx.RequestAborted);
            await audit.AddAsync(ctx.Person().UserName, "games.delete", ctx.ClientIp(), id.ToString(), ctx.RequestAborted);
            return Results.NoContent();
        });

        g.MapGet("/reports", async (Reports reports, CancellationToken ct) => Results.Ok(new { reports = (await reports.OpenAsync(ct)).Select(r => new { id = r.Id, name = r.Name, reportedId = r.ReportedId, reason = r.Reason, at = r.At }) }));
        g.MapPost("/reports/{id:guid}/handle", async (Guid id, HttpContext ctx, Reports reports, AuditStore audit) =>
        {
            await reports.HandleAsync(id, ctx.RequestAborted);
            await audit.AddAsync(ctx.Person().UserName, "games.report_handled", ctx.ClientIp(), id.ToString(), ctx.RequestAborted);
            return Results.NoContent();
        });

        g.MapGet("/bans", async (Bans bans, CancellationToken ct) => Results.Ok(new { bans = (await bans.ListAsync(ct)).Select(b => new { id = b.Id, range = b.Range, until = b.Until, reason = b.Reason }) }));
        g.MapPost("/bans", async (BanRequest body, HttpContext ctx, Bans bans, AuditStore audit) =>
        {
            var made = await bans.AddAsync(body.Range, body.Hours ?? 24, body.Reason, ctx.Person().UserId, ctx.RequestAborted);
            if (made.Ok) await audit.AddAsync(ctx.Person().UserName, "games.ban", ctx.ClientIp(), body.Range, ctx.RequestAborted);
            return made.ToHttp(b => Results.Ok(new { id = b.Id, range = b.Range, until = b.Until }));
        });
        g.MapDelete("/bans/{id:guid}", async (Guid id, HttpContext ctx, Bans bans, AuditStore audit) =>
        {
            await bans.RemoveAsync(id, ctx.RequestAborted);
            await audit.AddAsync(ctx.Person().UserName, "games.unban", ctx.ClientIp(), id.ToString(), ctx.RequestAborted);
            return Results.NoContent();
        });
    }

    static async Task<IResult> SetState(Guid id, string state, HttpContext ctx, NpgsqlDataSource db, AuditStore audit, IEnumerable<IAccountEvents> events)
    {
        var n = await db.ExecAsync("update games_account set state = $2 where id = $1", ctx.RequestAborted, id, state);
        if (n == 0) return Error.NotFound().ToHttp();
        if (state == "blocked")
        {
            await db.ExecAsync("delete from games_account_session where account_id = $1", ctx.RequestAborted, id);
            foreach (var e in events) e.Ended([id]);   // open sockets close at once
        }
        await audit.AddAsync(ctx.Person().UserName, "games." + (state == "blocked" ? "block" : "unblock"), ctx.ClientIp(), id.ToString(), ctx.RequestAborted);
        return Results.NoContent();
    }

    /// <summary>The report button: a games account sends it through its own door; a hub person through <c>/api/games-report</c>.</summary>
    public static void MapReports(this WebApplication app)
    {
        app.MapPost(GameAccountEndpoints.Prefix + "/report", async (ReportRequest b, HttpContext ctx, Reports reports) =>
            (await reports.CreateAsync(ctx.GameAccount().Id, b.Name, b.Reason, ctx.RequestAborted)).ToHttp());
        app.MapPost("/api/games-report", async (ReportRequest b, HttpContext ctx, Reports reports) =>
            (await reports.CreateAsync(ctx.Person().UserId, b.Name, b.Reason, ctx.RequestAborted)).ToHttp());
    }
}
