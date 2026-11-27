using System.Security.Cryptography;
using System.Text;
using Base.Accounts;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Drift.GameAccounts;

/// <summary>Who a games account is for a game: only this, never the password or an address.</summary>
public sealed record GameIdentity(Guid Id, string Name, Guid SessionId, bool MustChange);

/// <summary>A game's own data of a person, which the account module cannot know about: it is asked to delete it and to export it.</summary>
public interface IAccountData
{
    /// <summary>Removes everything of this owner.</summary>
    Task DeleteAsync(Guid owner, CancellationToken ct);
    /// <summary>What is stored about this owner, as plain data for the person's own download (nothing of others).</summary>
    Task<IReadOnlyDictionary<string, object?>> ExportAsync(Guid owner, CancellationToken ct);
}

/// <summary>Told when accounts or sessions end, so that open sockets close (the game implements this).</summary>
public interface IAccountEvents
{
    void Ended(IEnumerable<Guid> accountIds);
}

/// <summary>
/// The games accounts: sign-up, sign-in, sessions, and the person's own changes. A module of its own (docs/ACCOUNTS-GAMES.md): it talks to the game only through
/// <see cref="IAccountData"/> and <see cref="IAccountEvents"/>. Passwords are Argon2id through the base's hasher; an unknown name costs as much time as a known one (AUTH-08).
/// </summary>
public sealed class GameAccountService(NpgsqlDataSource db, PasswordHasher hasher, LoginLimiter limiter, IEnumerable<IAccountData> data, IEnumerable<IAccountEvents> events)
{
    public const int MinPassword = 8, MaxPassword = 256;
    static readonly TimeSpan MaxAge = TimeSpan.FromDays(90), Idle = TimeSpan.FromDays(30);

    public static string NewSecret() => Ids.Token();
    static byte[] Hash(string secret) => SHA256.HashData(Encoding.UTF8.GetBytes(secret));

    /// <summary>Null when fine, else the code of the problem.</summary>
    public static string? PasswordProblem(string? password, string name)
    {
        if (password is null || password.Length < MinPassword) return "password.short";
        if (password.Length > MaxPassword) return "password.long";
        if (password.Contains(name, StringComparison.OrdinalIgnoreCase)) return "password.contains_name";
        if (password.Distinct().Count() < 4) return "password.simple";
        if (CommonPasswords.Contains(password)) return "password.common";
        return null;
    }

    // the passwords most used in leaks, as far as eight characters go: refused outright (no composition rules otherwise)
    static readonly HashSet<string> CommonPasswords = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyui", "qwertyuiop", "qwerty123", "iloveyou", "11111111",
        "abc12345", "abcd1234", "letmein1", "welcome1", "admin123", "football", "baseball", "superman", "trustno1", "passw0rd", "master12", "monkey12",
        "dragon12", "sunshine", "princess", "starwars", "1q2w3e4r", "zaq12wsx", "00000000", "87654321", "asdfghjk", "asdf1234", "drift123", "driftdrift", "racing12",
        "passwort", "passwort1", "hallo123", "willkommen", "geheim12", "schalke04", "fussball", "12341234", "qwertz12", "qwertzui",
    };

    // ---------- sign up and sign in
    /// <summary>Makes an account and its first session. The name is already checked by the caller (<see cref="NameRules"/>).</summary>
    public async Task<Result<(GameIdentity Who, string Cookie)>> SignUpAsync(string name, string password, CancellationToken ct = default)
    {
        var key = NameRules.Key(name);
        if (PasswordProblem(password, name) is { } problem) return new Error(ErrorKind.Invalid, "invalid", "The password is not good.", new Dictionary<string, string> { ["password"] = problem });
        var hash = await hasher.HashAsync(password);
        var id = Ids.New();
        try
        {
            var taken = await db.ScalarAsync<bool>("select exists (select 1 from games_account where name_key = $1) or exists (select 1 from games_account_released where name_key = $1 and until > now())", ct, key);
            if (taken) return NameTaken();
            await db.ExecAsync("insert into games_account (id, name, name_key, password_hash) values ($1, $2, $3, $4)", ct, id, name, key, hash);
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return NameTaken(); }
        return await NewSessionAsync(id, name, false, ct);
    }

    static Error NameTaken() => new(ErrorKind.Conflict, "games.name_taken", "This name is taken.", new Dictionary<string, string> { ["name"] = "taken" });

    sealed record Row(Guid Id, string Name, string Hash, bool MustChange, string State);

    /// <summary>
    /// Checks name and password. An unknown name, a wrong password and a blocked account answer with the same error and take the same time; the limits count
    /// per name and per address (the wait doubles, AUTH-05) and a wait is its own answer.
    /// </summary>
    public async Task<Result<(GameIdentity Who, string Cookie)>> LoginAsync(string name, string password, string ip, CancellationToken ct = default)
    {
        var key = NameRules.Key(name);
        string[] keys = ["ip:games:" + ip, "acct:games:" + key];
        if (limiter.WaitSeconds(keys) is > 0 and var wait) return Error.TooMany(wait);
        var row = await db.FirstAsync("select id, name, password_hash, must_change, state from games_account where name_key = $1",
            r => new Row(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetBoolean(3), r.GetString(4)), ct, key);
        var (ok, rehash) = await hasher.VerifyAsync(password ?? "", row?.Hash ?? await hasher.DummyHashAsync());
        if (row is null || !ok || row.State != "active")
        {
            foreach (var k in keys) limiter.Fail(k);
            return new Error(ErrorKind.Unauthorized, "games.login", "Name or password is wrong.");
        }
        limiter.Succeed("acct:games:" + key);
        if (rehash) await db.ExecAsync("update games_account set password_hash = $2 where id = $1", ct, row.Id, await hasher.HashAsync(password!));
        return await NewSessionAsync(row.Id, row.Name, row.MustChange, ct);
    }

    async Task<(GameIdentity, string)> NewSessionAsync(Guid account, string name, bool mustChange, CancellationToken ct)
    {
        var cookie = NewSecret(); var sid = Ids.New();
        await db.ExecAsync("insert into games_account_session (id, hash, account_id) values ($1, $2, $3)", ct, sid, Hash(cookie), account);
        return (new GameIdentity(account, name, sid, mustChange), cookie);
    }

    /// <summary>The identity behind a cookie, or null (unknown, too old, idle, or the account is blocked).</summary>
    public async Task<GameIdentity?> ValidateAsync(string cookie, CancellationToken ct = default)
    {
        var h = Hash(cookie);
        var who = await db.FirstAsync(
            """
            select a.id, a.name, s.id, a.must_change
            from games_account_session s join games_account a on a.id = s.account_id
            where s.hash = $1 and a.state = 'active' and s.created_at > now() - $2 and s.last_seen > now() - $3
            """, r => new GameIdentity(r.GetGuid(0), r.GetString(1), r.GetGuid(2), r.GetBoolean(3)), ct, h, MaxAge, Idle);
        if (who is not null) await db.ExecAsync("update games_account_session set last_seen = now() where id = $1 and last_seen < now() - interval '10 minutes'", ct, who.SessionId);
        return who;
    }

    /// <summary>Is a session (by its id) still good? The sockets ask this every 30 seconds.</summary>
    public Task<bool> AliveAsync(Guid sessionId) => db.ScalarAsync<bool>(
        "select exists (select 1 from games_account_session s join games_account a on a.id = s.account_id where s.id = $1 and a.state = 'active' and s.created_at > now() - $2 and s.last_seen > now() - $3)",
        CancellationToken.None, sessionId, MaxAge, Idle);

    public Task EndSessionAsync(Guid sessionId, CancellationToken ct = default) => db.ExecAsync("delete from games_account_session where id = $1", ct, sessionId);

    // ---------- the person's own changes
    /// <summary>Changes the password after checking the old one; every other session of the account ends.</summary>
    public async Task<Result> ChangePasswordAsync(GameIdentity who, string? current, string? next, string ip, CancellationToken ct = default)
    {
        var verified = await VerifyOwnAsync(who, current, ip, ct);
        if (!verified.Ok) return verified;
        if (PasswordProblem(next, who.Name) is { } problem) return new Error(ErrorKind.Invalid, "invalid", "The password is not good.", new Dictionary<string, string> { ["password"] = problem });
        await db.ExecAsync("update games_account set password_hash = $2, must_change = false where id = $1", ct, who.Id, await hasher.HashAsync(next!));
        await db.ExecAsync("delete from games_account_session where account_id = $1 and id <> $2", ct, who.Id, who.SessionId);
        Tell([who.Id], onlyOthers: true);
        return Result.Success;
    }

    async Task<Result> VerifyOwnAsync(GameIdentity who, string? password, string ip, CancellationToken ct)
    {
        string[] keys = ["ip:games:" + ip, "acct:games:" + NameRules.Key(who.Name)];
        if (limiter.WaitSeconds(keys) is > 0 and var wait) return Error.TooMany(wait);
        var hash = await db.ScalarAsync<string>("select password_hash from games_account where id = $1", ct, who.Id);
        var (ok, _) = await hasher.VerifyAsync(password ?? "", hash ?? await hasher.DummyHashAsync());
        if (!ok) { foreach (var k in keys) limiter.Fail(k); return new Error(ErrorKind.Unauthorized, "games.password_wrong", "The password is wrong."); }
        limiter.Succeed(keys[1]);
        return Result.Success;
    }

    /// <summary>The person deletes the account (password asked): sessions, the game's rows and the account go; the name is free again after 30 days.</summary>
    public async Task<Result> DeleteOwnAsync(GameIdentity who, string? password, string ip, CancellationToken ct = default)
    {
        var verified = await VerifyOwnAsync(who, password, ip, ct);
        if (!verified.Ok) return verified;
        await DeleteAsync(who.Id, ct);
        return Result.Success;
    }

    /// <summary>Removes an account for good (the person's own delete, or an administrator's): the game's data first, then the account.</summary>
    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        foreach (var d in data) await d.DeleteAsync(id, ct);
        await db.InTransactionAsync(async (c, tx) =>
        {
            await c.ExecAsync(tx, "insert into games_account_released (name_key, until) select name_key, now() + interval '30 days' from games_account where id = $1 on conflict (name_key) do update set until = excluded.until", ct, id);
            await c.ExecAsync(tx, "delete from games_account where id = $1", ct, id);   // sessions go with it
        }, ct);
        Tell([id]);
    }

    /// <summary>Everything stored about the person, for their own download.</summary>
    public async Task<IReadOnlyDictionary<string, object?>> ExportAsync(GameIdentity who, CancellationToken ct = default)
    {
        var all = new Dictionary<string, object?>
        {
            ["account"] = await db.FirstAsync("select name, created_at, name_changed_at from games_account where id = $1",
                r => new { name = r.GetString(0), created = r.Time(1), nameChanged = r.IsDBNull(2) ? (DateTimeOffset?)null : r.Time(2) }, ct, who.Id),
            ["sessions"] = await db.QueryAsync("select created_at, last_seen from games_account_session where account_id = $1 order by created_at", r => new { created = r.Time(0), lastSeen = r.Time(1) }, ct, who.Id),
        };
        foreach (var d in data) foreach (var (k, v) in await d.ExportAsync(who.Id, ct)) all[k] = v;
        return all;
    }

    void Tell(IEnumerable<Guid> accounts, bool onlyOthers = false) { if (!onlyOthers) foreach (var e in events) e.Ended(accounts); }
}
