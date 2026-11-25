using Base.Data;
using Npgsql;

namespace Base.Accounts;

public sealed record AuditEntry(long Id, DateTimeOffset At, string UserName, string Event, string? Detail, string? Ip);

/// <summary>
/// The security history of the accounts (AUTH-10): who, what, when, from where. Short event codes only; never a password, a code or a key.
/// The newest <see cref="Keep"/> entries stay.
/// </summary>
public sealed class AuditStore(NpgsqlDataSource db, TimeProvider time)
{
    public const int Keep = 2000;

    public async Task AddAsync(string userName, string evt, string? ip = null, string? detail = null, CancellationToken ct = default)
    {
        await db.ExecAsync("insert into account_audit (at, user_name, event, detail, ip) values ($1, $2, $3, $4, $5)", ct, time.GetUtcNow(), Cut(userName, 40)!, Cut(evt, 40)!, Cut(detail, 400), Cut(ip, 60));
        await db.ExecAsync("delete from account_audit where id < coalesce((select min(id) from (select id from account_audit order by id desc limit $1) k), 0)", ct, Keep);
    }

    private static string? Cut(string? s, int max) => s is null ? null : s.Length <= max ? s : s[..max];

    private static AuditEntry Read(NpgsqlDataReader r) => new(r.GetInt64(0), r.Time(1), r.GetString(2), r.GetString(3), r.TextOrNull(4), r.TextOrNull(5));

    /// <summary>The newest entries of one person.</summary>
    public async Task<IReadOnlyList<AuditEntry>> ListForUserAsync(string userName, int limit, CancellationToken ct = default) =>
        await db.QueryAsync("select id, at, user_name, event, detail, ip from account_audit where user_name = $1 order by id desc limit $2", Read, ct, userName, Math.Clamp(limit, 1, 200));

    public async Task<IReadOnlyList<AuditEntry>> ListAsync(int limit, CancellationToken ct = default) =>
        await db.QueryAsync("select id, at, user_name, event, detail, ip from account_audit order by id desc limit $1", Read, ct, Math.Clamp(limit, 1, 200));
}
