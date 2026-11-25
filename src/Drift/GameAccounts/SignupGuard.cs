using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Base.Core;
using Base.Data;
using Npgsql;

namespace Drift.GameAccounts;

/// <summary>
/// Protects open registration (docs/ACCOUNTS-GAMES.md section 3): limits per address and per day/week and per hour for everybody, and a proof of work of our own.
/// The server hands out a signed challenge; the browser must find a number so that SHA-256 of "salt:name:number" starts with so many zero bits. Checking costs one hash,
/// a challenge works once and for 60 seconds. It slows scripts down a little each time; it is a speed bump, not a wall: the limits and the filter carry the rest.
/// Addresses are kept only as keyed hashes and only for 7 days.
/// </summary>
public sealed class SignupGuard(NpgsqlDataSource db, TimeProvider clock)
{
    /// <summary>Zero bits of the work at the base level (about 0.5 s on a phone with the page's own SHA-256, 95 times in 100 under 1.5 s), and the most it ever rises to.</summary>
    public static int BaseDifficulty { get; set; } = 17;
    public static int MaxDifficulty { get; set; } = 20;
    public static int PerAddressDay { get; set; } = 3;
    public static int PerAddressWeek { get; set; } = 10;
    public static int PerHour { get; set; } = 60;
    public static TimeSpan Lifetime { get; set; } = TimeSpan.FromSeconds(60);

    readonly byte[] key = RandomNumberGenerator.GetBytes(32);   // signs the challenges; a restart ends the open ones, which is fine for 60 seconds
    readonly ConcurrentDictionary<string, long> used = new();
    byte[]? addrKey;

    async Task<byte[]> AddrKeyAsync(CancellationToken ct)
    {
        if (addrKey is not null) return addrKey;
        await db.ExecAsync("insert into games_account_secret (name, value) values ('addr', $1) on conflict do nothing", ct, RandomNumberGenerator.GetBytes(32));
        return addrKey = await db.ScalarAsync<byte[]>("select value from games_account_secret where name = 'addr'", ct) ?? throw new InvalidOperationException("no secret");
    }

    async Task<byte[]> AddrAsync(string ip, CancellationToken ct) => HMACSHA256.HashData(await AddrKeyAsync(ct), Encoding.UTF8.GetBytes(ip));

    static byte[] Sign(byte[] key, string text) => HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(text));

    int recentGlobal, recentWindow;   // a cheap in-memory count for the difficulty: sign-ups of the last hour (set by CountAsync, read by Challenge)
    readonly ConcurrentDictionary<string, (long Window, int Count)> perAddress = new();

    int DifficultyFor(string ip)
    {
        var window = clock.GetUtcNow().ToUnixTimeSeconds() / 3600;
        var mine = perAddress.TryGetValue(ip, out var e) && e.Window == window ? e.Count : 0;
        var global = recentWindow == window ? recentGlobal : 0;
        var d = BaseDifficulty + mine + (global > PerHour / 2 ? 1 : 0);
        return Math.Min(MaxDifficulty, d);
    }

    /// <summary>A challenge for this address: <c>id.salt.difficulty.expires.signature</c> (one token) and the difficulty in clear.</summary>
    public object Challenge(string ip)
    {
        var id = Ids.Token(9); var salt = Ids.Token(8); var d = DifficultyFor(ip);
        var exp = clock.GetUtcNow().Add(Lifetime).ToUnixTimeSeconds();
        var body = $"{id}.{salt}.{d}.{exp}";
        return new { challenge = body + "." + Convert.ToHexString(Sign(key, body)), salt, difficulty = d, expires = exp };
    }

    /// <summary>
    /// The work and the limits, in one step: the challenge is checked (one hash), then a place in the limits is **reserved** (a log row, counted and inserted under one
    /// lock, so parallel sign-ups cannot all pass the same count). Returns the refusal, or the reservation, which the caller gives back with <see cref="ReleaseAsync"/> when the sign-up fails.
    /// </summary>
    public async Task<(Error? Refused, long Reservation)> ReserveAsync(string ip, string name, string? challenge, string? nonce, CancellationToken ct)
    {
        var parts = (challenge ?? "").Split('.');
        if (parts.Length != 5 || nonce is null || nonce.Length is 0 or > 32 || !nonce.All(char.IsAsciiLetterOrDigit)) return (Pow(), 0);
        var body = string.Join('.', parts[..4]);
        if (!CryptographicOperations.FixedTimeEquals(TryHex(parts[4]), Sign(key, body))) return (Pow(), 0);
        if (!long.TryParse(parts[3], out var exp) || exp < clock.GetUtcNow().ToUnixTimeSeconds()) return (Pow(), 0);
        if (!int.TryParse(parts[2], out var difficulty) || difficulty < 1 || difficulty > 40) return (Pow(), 0);
        if (!Leading(SHA256.HashData(Encoding.UTF8.GetBytes(parts[1] + ":" + name + ":" + nonce)), difficulty)) return (Pow(), 0);
        if (!used.TryAdd(parts[0], exp)) return (Pow(), 0);   // a challenge works once
        if (used.Count > 2000) foreach (var (k, v) in used) if (v < clock.GetUtcNow().ToUnixTimeSeconds()) used.TryRemove(k, out _);

        var addr = await AddrAsync(ip, ct);
        return await db.InTransactionAsync(async (c, tx) =>
        {
            await c.ExecAsync(tx, "select pg_advisory_xact_lock(7001)", ct);   // one at a time through the count and the insert
            await c.ExecAsync(tx, "delete from games_account_signup_log where at < now() - interval '7 days'", ct);
            long day, week, hour;
            await using (var cmd = c.Cmd(tx, "select count(*) filter (where addr = $1 and at > now() - interval '1 day'), count(*) filter (where addr = $1), count(*) filter (where at > now() - interval '1 hour') from games_account_signup_log", addr))
            await using (var r = await cmd.ExecuteReaderAsync(ct)) { await r.ReadAsync(ct); (day, week, hour) = (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2)); }
            if (day >= PerAddressDay) return ((Error?)(Error.TooMany(3600 * 6) with { Code = "games.signup_limit" }), 0L);
            if (week >= PerAddressWeek) return (Error.TooMany(3600 * 24) with { Code = "games.signup_limit" }, 0L);
            if (hour >= PerHour) return (Error.TooMany(600) with { Code = "games.signup_busy" }, 0L);
            await using var ins = c.Cmd(tx, "insert into games_account_signup_log (addr) values ($1) returning id", addr);
            return ((Error?)null, (long)(await ins.ExecuteScalarAsync(ct))!);
        }, ct);
    }

    /// <summary>Gives a reservation back (the sign-up did not happen).</summary>
    public Task ReleaseAsync(long reservation, CancellationToken ct) => db.ExecAsync("delete from games_account_signup_log where id = $1", ct, reservation);

    static Error Pow() => new(ErrorKind.Invalid, "games.pow", "The small puzzle was not solved (or too late). Try again.");

    /// <summary>A sign-up went through: the numbers the difficulty follows (the log row was written with the reservation).</summary>
    public void Confirm(string ip)
    {
        var window = clock.GetUtcNow().ToUnixTimeSeconds() / 3600;
        if (perAddress.Count > 5000) foreach (var (k, v) in perAddress) if (v.Window < window) perAddress.TryRemove(k, out _);
        perAddress.AddOrUpdate(ip, (window, 1), (_, o) => o.Window == window ? (window, o.Count + 1) : (window, 1));
        recentGlobal = recentWindow == window ? recentGlobal + 1 : 1; recentWindow = (int)window;
    }

    public static byte[] TryHex(string s) { try { return Convert.FromHexString(s); } catch (FormatException) { return []; } }

    public static bool Leading(byte[] hash, int bits)
    {
        for (var i = 0; i < bits; i++) if ((hash[i / 8] & (0x80 >> (i % 8))) != 0) return false;
        return true;
    }
}
