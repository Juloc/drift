using System.Collections.Concurrent;
using Base.Core;
using Microsoft.Extensions.Logging;

namespace Base.Accounts;

/// <summary>The name of the app as an authenticator app shows it next to the code.</summary>
public sealed record AccountOptions(string Issuer);

public sealed record SignedIn(string User, string[] Roles, string Token, int RecoveryLeft);

public sealed record SetupStart(string Secret, string Uri, string[] Recovery);

public sealed record TotpStart(string Secret, string Uri);

/// <summary>
/// First setup, sign-in, sessions and the account of a signed-in person. An answer never tells whether the user name, the password or the code was wrong (AUTH-08).
/// Every failure counts against the address and the account (AUTH-05); every change of an account is written to the history (AUTH-10).
/// </summary>
public sealed class AccountService(UserStore users, SessionStore sessions, PasswordHasher hasher, LoginLimiter limiter, SetupCode setupCode, AuditStore audit,
    AccountOptions options, TimeProvider clock, ILogger<AccountService> log)
{
    private static readonly Error LoginFailed = new(ErrorKind.Unauthorized, "auth.failed", "Sign-in failed. Check user name, password and code.");
    private static readonly Error SetupDone = Error.Conflict("setup.done", "The setup is already finished.");
    private static readonly Error BadInput = Error.Invalid("input", "The input is not valid.");
    private static readonly Error WrongCode = new(ErrorKind.Unauthorized, "totp.wrong", "The code is not right. Check the entry in the app and the clock of the phone; a code works once.");
    private static readonly Error TotpExpired = Error.Invalid("totp.expired", "The new key has expired. Please start again.");

    private static readonly Error WrongSetupCode = new(ErrorKind.Forbidden, "setup.code", "The setup code is not right. It stands in the server log.", new Dictionary<string, string> { ["code"] = "setup.code" });

    private static Error Field(string field, string code, string message) =>
        new(ErrorKind.Invalid, code, message, new Dictionary<string, string> { [field] = code });

    public async Task<bool> SetupNeededAsync(CancellationToken ct = default) => !await users.AnyCanSignInAsync(ct);

    // ---- First setup: the first account, protected by the code from the server log (AUTH-09) ----

    public async Task<Result<SetupStart>> BeginSetupAsync(string? code, string? user, string? password, string ip, CancellationToken ct = default)
    {
        if (!await SetupNeededAsync(ct)) return SetupDone;
        var key = "setup:" + ip;
        if (limiter.WaitSeconds(key) is > 0 and var wait) return Error.TooMany(wait);
        if (!setupCode.Matches(code))
        {
            limiter.Fail(key);
            log.LogWarning("Wrong setup code from {Ip}", ip);
            return WrongSetupCode;
        }

        var name = PasswordPolicy.NormalizeUserName(user);
        if (name is null) return Field("user", "account.name", "User name: 1 to 32 characters of a-z, 0-9, dot, dash and underscore.");
        if (PasswordPolicy.Problem(password, name) is { } problem) return Field("password", problem, "The password is not strong enough.");

        var secret = Totp.NewSecret();
        var (plain, hashes) = RecoveryCodes.Generate();
        await users.CreateAsync(name, await hasher.HashAsync(password!), secret, confirmed: false, hashes, roles: [Roles.Admin], replacePending: true, ct);
        return new SetupStart(secret, Totp.Uri(options.Issuer, name, secret), plain);
    }

    public async Task<Result<SignedIn>> FinishSetupAsync(string? code, string? user, string? totp, string ip, string? userAgent, CancellationToken ct = default)
    {
        if (!await SetupNeededAsync(ct)) return SetupDone;
        var key = "setup:" + ip;
        if (limiter.WaitSeconds(key) is > 0 and var wait) return Error.TooMany(wait);
        if (!setupCode.Matches(code)) { limiter.Fail(key); return WrongSetupCode; }

        var name = PasswordPolicy.NormalizeUserName(user);
        var pending = name is null ? null : await users.FindByNameAsync(name, ct);
        if (pending is null || pending.TotpConfirmed) return Error.Invalid("setup.order", "Enter user name and password first.");
        var step = Totp.Check(pending.TotpSecret, Clean(totp), pending.TotpLastStep, clock.GetUtcNow());
        if (step is null || !await users.TryAdvanceTotpStepAsync(pending.Id, step.Value, ct))
        {
            limiter.Fail(key);
            return WrongCode;
        }

        await users.ConfirmAsync(pending.Id, ct);
        setupCode.MarkUsed();
        var token = await sessions.CreateAsync(pending.Id, ip, userAgent, ct);
        log.LogInformation("First setup finished, account {User} created.", pending.Name);
        await AuditAsync(pending.Name, "setup.done", ip);
        return new SignedIn(pending.Name, pending.Roles, token, RecoveryCodes.Count);
    }

    // ---- Sign-in ----

    /// <summary>So many sign-ins of one address may be checked at the same time (the password check needs 64 MiB per attempt).</summary>
    public const int MaxLoginsInFlightPerAddress = 3;

    public async Task<Result<SignedIn>> LoginAsync(string? userName, string? password, string? code, string ip, string? userAgent, CancellationToken ct = default)
    {
        var busy = "busy:" + ip;
        if (!limiter.TryBegin(busy, MaxLoginsInFlightPerAddress)) return Error.TooMany(5);
        try { return await LoginCoreAsync(userName, password, code, ip, userAgent, ct); }
        finally { limiter.End(busy); }
    }

    private async Task<Result<SignedIn>> LoginCoreAsync(string? userName, string? password, string? code, string ip, string? userAgent, CancellationToken ct)
    {
        var name = PasswordPolicy.NormalizeUserName(userName);
        string[] keys = name is null ? ["ip:" + ip] : ["ip:" + ip, "user:" + name];
        if (limiter.WaitSeconds(keys) is > 0 and var wait) return Error.TooMany(wait);
        if (password is null || password.Length is 0 or > PasswordPolicy.MaxLength) return BadInput;

        var user = name is null ? null : await users.FindByNameAsync(name, ct);
        if (user is { CanSignInLocally: false }) user = null;
        // an unknown name is checked against a dummy hash: the answer takes as long as for a known one
        var (passwordOk, needsRehash) = await hasher.VerifyAsync(password, user?.PasswordHash ?? await hasher.DummyHashAsync());

        var secondOk = false; var byRecovery = false;
        if (user is not null && passwordOk && !string.IsNullOrWhiteSpace(code) && code.Length <= 40)
        {
            // the step that spends the code is atomic: the same code works once, also with two requests at the same moment
            if (RecoveryCodes.LooksLikeRecoveryCode(code)) secondOk = byRecovery = await users.ConsumeRecoveryCodeAsync(user.Id, RecoveryCodes.Hash(code), ct);
            else if (Totp.Check(user.TotpSecret, Clean(code), user.TotpLastStep, clock.GetUtcNow()) is { } step) secondOk = await users.TryAdvanceTotpStepAsync(user.Id, step, ct);
        }

        if (user is null || !passwordOk || !secondOk)
        {
            foreach (var k in keys) limiter.Fail(k);
            log.LogWarning("Sign-in failed for {User} from {Ip}", name ?? "?", ip);
            if (user is not null) await AuditAsync(user.Name, "login.failed", ip);
            return LoginFailed;
        }

        if (needsRehash) await users.SetPasswordAsync(user.Id, await hasher.HashAsync(password), endSessions: false, ct);
        limiter.Succeed("user:" + user.Name);
        var token = await sessions.CreateAsync(user.Id, ip, userAgent, ct);
        log.LogInformation("Signed in: {User} from {Ip}{Recovery}", user.Name, ip, byRecovery ? " (recovery code)" : "");
        await AuditAsync(user.Name, "login.ok", ip, byRecovery ? "recovery code" : null);
        return new SignedIn(user.Name, user.Roles, token, await users.RecoveryLeftAsync(user.Id, ct));
    }

    private static string Clean(string? code) => (code ?? "").Replace(" ", "");

    private async Task AuditAsync(string user, string evt, string? ip, string? detail = null)
    {
        // the history must not be the reason a sign-in fails
        try { await audit.AddAsync(user, evt, ip, detail, CancellationToken.None); }
        catch (Exception e) { log.LogError(e, "The security history could not be written"); }
    }

    // ---- The account of a signed-in person: always with a valid session AND the current password ----

    /// <summary>So long a new, not yet confirmed authenticator key stays valid.</summary>
    public static readonly TimeSpan TotpChangeLifetime = TimeSpan.FromMinutes(10);

    private readonly ConcurrentDictionary<Guid, (string Secret, DateTimeOffset Until)> _pendingTotp = new();

    /// <summary>Checks the current password of a signed-in person. Failures count per account and per address; the expensive check runs once at a time per account.</summary>
    private async Task<Result<UserRow>> VerifyCurrentAsync(SessionIdentity who, string? current, string ip, CancellationToken ct)
    {
        string[] keys = ["acct:" + who.UserId, "ip:" + ip];
        if (limiter.WaitSeconds(keys) is > 0 and var wait) return Error.TooMany(wait);
        if (current is null || current.Length is 0 or > PasswordPolicy.MaxLength) return Field("current", "input", "The input is not valid.");
        var busy = "acct-busy:" + who.UserId;
        if (!limiter.TryBegin(busy, 1)) return Error.TooMany(5);
        try
        {
            var user = await users.FindByIdAsync(who.UserId, ct);
            if (user is null) return Error.Unauthorized();
            var (ok, _) = await hasher.VerifyAsync(current, user.PasswordHash);
            if (!ok)
            {
                foreach (var k in keys) limiter.Fail(k);
                log.LogWarning("Account: wrong current password for {User} from {Ip}", user.Name, ip);
                return new Error(ErrorKind.Forbidden, "password.current", "The current password is not right.", new Dictionary<string, string> { ["current"] = "password.current" });
            }
            return user;
        }
        finally { limiter.End(busy); }
    }

    /// <summary>Sets a new password. Every other device is signed out, this one stays.</summary>
    public async Task<Result> ChangePasswordAsync(SessionIdentity who, string? current, string? next, string ip, CancellationToken ct = default)
    {
        var verified = await VerifyCurrentAsync(who, current, ip, ct);
        if (!verified.Ok) return verified.Error!;
        var user = verified.Value;
        if (PasswordPolicy.Problem(next, user.Name) is { } problem) return Field("next", problem, "The password is not strong enough.");
        if (next == current) return Field("next", "password.same", "The new password must differ from the current one.");
        await users.SetPasswordAsync(user.Id, await hasher.HashAsync(next!), endSessions: true, ct, keepSession: who.Id);
        limiter.Succeed("acct:" + user.Id);
        log.LogWarning("Account: password changed for {User} from {Ip}, other devices signed out", user.Name, ip);
        await AuditAsync(user.Name, "password.changed", ip);
        return Result.Success;
    }

    /// <summary>Step 1 of a new authenticator: ask for a new key with the current password. It only counts after <see cref="FinishTotpChangeAsync"/>.</summary>
    public async Task<Result<TotpStart>> BeginTotpChangeAsync(SessionIdentity who, string? current, string ip, CancellationToken ct = default)
    {
        var verified = await VerifyCurrentAsync(who, current, ip, ct);
        if (!verified.Ok) return verified.Error!;
        var user = verified.Value;
        var now = clock.GetUtcNow();
        foreach (var (id, p) in _pendingTotp) if (p.Until < now) _pendingTotp.TryRemove(id, out _);
        var secret = Totp.NewSecret();
        _pendingTotp[user.Id] = (secret, now + TotpChangeLifetime);
        log.LogWarning("Account: new authenticator requested for {User} from {Ip}", user.Name, ip);
        return new TotpStart(secret, Totp.Uri(options.Issuer, user.Name, secret));
    }

    /// <summary>Step 2: the first code of the new authenticator. Then the new key and new recovery codes apply (the old ones are gone) and other devices are signed out.</summary>
    public async Task<Result<string[]>> FinishTotpChangeAsync(SessionIdentity who, string? code, string ip, CancellationToken ct = default)
    {
        string[] keys = ["acct:" + who.UserId, "ip:" + ip];
        if (limiter.WaitSeconds(keys) is > 0 and var wait) return Error.TooMany(wait);
        var now = clock.GetUtcNow();
        if (!_pendingTotp.TryGetValue(who.UserId, out var pending) || pending.Until < now)
        {
            _pendingTotp.TryRemove(who.UserId, out _);
            return TotpExpired;
        }
        var step = Totp.Check(pending.Secret, Clean(code), 0, now);
        if (step is null)
        {
            foreach (var k in keys) limiter.Fail(k);
            return WrongCode;
        }
        // only the owner of this entry may redeem it, and only once
        if (!_pendingTotp.TryRemove(new KeyValuePair<Guid, (string, DateTimeOffset)>(who.UserId, pending))) return TotpExpired;
        var (plain, hashes) = RecoveryCodes.Generate();
        await users.ReplaceTotpAsync(who.UserId, pending.Secret, hashes, ct, keepSession: who.Id, lastStep: step.Value);
        limiter.Succeed("acct:" + who.UserId);
        log.LogWarning("Account: authenticator replaced for {User} from {Ip}, new recovery codes, other devices signed out", who.UserName, ip);
        await AuditAsync(who.UserName, "totp.changed", ip);
        return plain;
    }

    // ---- Sessions (the list of devices) ----

    /// <summary>What the hub needs to end its own session without asking (the ID token it gave this session), or null.</summary>
    public Task<string?> HubHintAsync(SessionIdentity who, CancellationToken ct = default) => who.ViaHub ? sessions.HubHintAsync(who.Id, ct) : Task.FromResult<string?>(null);

    public Task<SessionIdentity?> ResolveSessionAsync(string token, bool rotate, CancellationToken ct = default) => sessions.ResolveAsync(token, rotate, ct);

    public async Task LogoutAsync(SessionIdentity who, string ip, CancellationToken ct = default)
    {
        await sessions.DeleteAsync(who.Hash, ct);
        await AuditAsync(who.UserName, "logout", ip);
    }

    public async Task<int> LogoutOthersAsync(SessionIdentity who, string ip, CancellationToken ct = default)
    {
        var ended = await sessions.DeleteOthersAsync(who.UserId, who.Id, ct);
        if (ended > 0) await AuditAsync(who.UserName, "sessions.ended", ip, ended.ToString());
        return ended;
    }

    /// <summary>Ends one device of the person. False when the session is not one of theirs.</summary>
    public async Task<bool> EndSessionAsync(SessionIdentity who, Guid sessionId, string ip, CancellationToken ct = default)
    {
        var ended = await sessions.DeleteByIdAsync(who.UserId, sessionId, ct);
        if (ended) await AuditAsync(who.UserName, "session.ended", ip);
        return ended;
    }

    public Task<IReadOnlyList<SessionListItem>> ListSessionsAsync(SessionIdentity who, CancellationToken ct = default) => sessions.ListAsync(who.UserId, who.Id, ct);

    public Task<int> RecoveryLeftAsync(SessionIdentity who, CancellationToken ct = default) => users.RecoveryLeftAsync(who.UserId, ct);

    public Task<IReadOnlyList<AuditEntry>> HistoryAsync(SessionIdentity who, int limit = 50, CancellationToken ct = default) => audit.ListForUserAsync(who.UserName, limit, ct);
}
