using System.Collections.Concurrent;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Drift.GameAccounts;

public sealed record ReportRow(Guid Id, Guid Reporter, string Name, Guid? ReportedId, int Reason, DateTimeOffset At);

/// <summary>Finds who is behind a name in the lobby right now (the game implements this); null when nobody or more than one.</summary>
public interface IPlayerDirectory
{
    Guid? FindByName(string name);
}

/// <summary>
/// Reports of players: a fixed reason (0 ramming, 1 blocking, 2 name, 3 cheating, 4 other), never free text. A person can send a few an hour; the rows wait for the administrator.
/// </summary>
public sealed partial class Reports(NpgsqlDataSource db, IEnumerable<IPlayerDirectory> directory, TimeProvider clock)
{
    public const int Reasons = 5, PerHour = 6;
    [System.Text.RegularExpressions.GeneratedRegex(@"^[\p{L}\p{N}][\p{L}\p{N} ._-]*$")]
    private static partial System.Text.RegularExpressions.Regex NamePattern();
    readonly ConcurrentDictionary<Guid, (long Window, int Count)> sent = new();

    public async Task<Result> CreateAsync(Guid reporter, string? name, int? reason, CancellationToken ct = default)
    {
        if (reason is not (>= 0 and < Reasons)) return Error.Invalid("games.report_reason", "The reason is not valid.");
        name = (name ?? "").Trim();
        // only what a name can look like (a nickname, an account's name, a neutral name): the report is no place for free text
        if (name.Length is < 1 or > 40 || !NamePattern().IsMatch(name)) return Error.Invalid("games.report_name", "The name is not valid.");
        var window = clock.GetUtcNow().ToUnixTimeSeconds() / 3600;
        if (sent.Count > 2000) foreach (var (k, v) in sent) if (v.Window < window) sent.TryRemove(k, out _);
        var n = sent.AddOrUpdate(reporter, (window, 1), (_, o) => o.Window == window ? (window, o.Count + 1) : (window, 1));
        if (n.Count > PerHour) return Error.TooMany(1800);
        var found = directory.Select(d => d.FindByName(name)).FirstOrDefault(g => g is not null);
        if (found == reporter) return Error.Invalid("games.report_self", "That is you.");
        await db.ExecAsync("insert into games_account_report (id, reporter, reported_name, reported_id, reason) values ($1, $2, $3, $4, $5)", ct, Ids.New(), reporter, name, found is { } f ? f : DBNull.Value, (short)reason.Value);
        return Result.Success;
    }

    public Task<List<ReportRow>> OpenAsync(CancellationToken ct = default) =>
        db.QueryAsync("select id, reporter, reported_name, reported_id, reason, at from games_account_report where handled_at is null order by at desc limit 200",
            r => new ReportRow(r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.IsDBNull(3) ? null : r.GetGuid(3), r.GetInt16(4), r.Time(5)), ct);

    public Task HandleAsync(Guid id, CancellationToken ct = default) => db.ExecAsync("update games_account_report set handled_at = now() where id = $1 and handled_at is null", ct, id);
}
