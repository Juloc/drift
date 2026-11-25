using Base.Core;
using Microsoft.Extensions.Logging;

namespace Base.Accounts;

public sealed record Invitation(string Token, DateTimeOffset ExpiresAt);

public sealed record PersonCreated(PersonRow Person, Invitation Invite);

public sealed record InviteInfo(string User, string? Role);

/// <summary>
/// Managing people (admin only, checked at the endpoint with <c>RequireRole</c>): create by invitation link, change the role, block, delete.
/// One role per person, from the list of the app. Somebody must always be able to administer the app, so the last active admin can neither lose the
/// role nor be blocked or deleted (AUTH-12). Every change is written to the history of that person, with the name of the admin (AUTH-10).
/// </summary>
public sealed class PeopleService(UserStore users, SessionStore sessions, InviteStore invites, PasswordHasher hasher, LoginLimiter limiter, AuditStore audit,
    AppRoles roles, AccountOptions options, TimeProvider clock, ILogger<PeopleService> log)
{
    // Changes that could leave the app without an admin run one at a time. An app is one container (OPS-01), so a lock in the process is enough.
    private static readonly SemaphoreSlim OneChangeAtATime = new(1, 1);

    private static readonly Error LastAdmin = Error.Conflict("people.last_admin", "The last administrator cannot lose the role, be blocked or be deleted.");
    private static readonly Error Self = Error.Conflict("people.self", "You cannot do this to yourself.");
    private static readonly Error NoPerson = Error.NotFound("people.unknown", "No such person.");
    private static readonly Error ByHub = Error.Conflict("people.managed_by_hub", "The role of this person comes from the central sign-in.");
    private static readonly Error BadLink = new(ErrorKind.Forbidden, "invite.invalid", "This invitation link is not valid (anymore).");
    private static readonly Error WrongCode = new(ErrorKind.Unauthorized, "totp.wrong", "The code is not right. Check the entry in the app and the clock of the phone; a code works once.");

    private static Error Field(string field, string code, string message) => new(ErrorKind.Invalid, code, message, new Dictionary<string, string> { [field] = code });

    public Task<IReadOnlyList<PersonRow>> ListAsync(CancellationToken ct = default) => users.ListAsync(ct);

    public async Task<IReadOnlyList<AuditEntry>?> HistoryAsync(Guid id, CancellationToken ct = default) =>
        await users.FindByIdAsync(id, ct) is { } u ? await audit.ListForUserAsync(u.Name, 50, ct) : null;

    // ---- Create and invite ----

    public async Task<Result<PersonCreated>> CreateAsync(SessionIdentity actor, string? name, string? role, string ip, CancellationToken ct = default)
    {
        var clean = PasswordPolicy.NormalizeUserName(name);
        if (clean is null) return Field("name", "account.name", "User name: 1 to 32 characters of a-z, 0-9, dot, dash and underscore.");
        if (!roles.Knows(role)) return Field("role", "people.role", "This role does not exist.");
        if (await users.FindByNameAsync(clean, ct) is not null) return Field("name", "people.name_taken", "This name is taken.");
        UserRow person;
        try { person = await users.CreateInvitedAsync(clean, role!, ct); }
        catch (Npgsql.PostgresException e) when (e.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation) { return Field("name", "people.name_taken", "This name is taken."); }
        var (token, until) = await invites.CreateAsync(person.Id, actor.UserName, ct);
        await AuditAsync(person.Name, "person.created", ip, $"by {actor.UserName}, role {role}");
        log.LogWarning("People: {Admin} created {User} with the role {Role}", actor.UserName, person.Name, role);
        return new PersonCreated(new PersonRow(person.Id, person.Name, role, PersonState.Invited, false, clock.GetUtcNow(), null), new Invitation(token, until));
    }

    /// <summary>A new link for a person who has not finished the setup (the old link stops working).</summary>
    public async Task<Result<Invitation>> ReinviteAsync(SessionIdentity actor, Guid id, string ip, CancellationToken ct = default)
    {
        if (await users.FindByIdAsync(id, ct) is not { State: PersonState.Invited } person) return NoPerson;
        var (token, until) = await invites.CreateAsync(person.Id, actor.UserName, ct);
        await AuditAsync(person.Name, "invite.created", ip, $"by {actor.UserName}");
        return new Invitation(token, until);
    }

    // ---- Role, block, delete ----

    public Task<Result> SetRoleAsync(SessionIdentity actor, Guid id, string? role, string ip, CancellationToken ct = default) =>
        ChangeAsync(id, async person =>
        {
            if (!roles.Knows(role)) return Field("role", "people.role", "This role does not exist.");
            if (person.HubSub is not null) return ByHub;
            if (!await users.TrySetRoleAsync(person.Id, role!, ct)) return LastAdmin;
            // what the role allows changes now: the person signs in again with the new role (the guard reads it from the database, so also open sessions see it at once)
            await AuditAsync(person.Name, "person.role", ip, $"by {actor.UserName}, {person.Role} to {role}");
            return Result.Success;
        }, ct);

    public Task<Result> SetBlockedAsync(SessionIdentity actor, Guid id, bool blocked, string ip, CancellationToken ct = default) =>
        ChangeAsync(id, async person =>
        {
            if (person.Id == actor.UserId) return Self;
            if (person.State == PersonState.Invited) return Error.Conflict("people.invited", "This person has not finished the setup yet.");
            if (blocked && person.State == PersonState.Active && person.Role == Base.Accounts.Roles.Admin && await users.CountActiveAdminsAsync(ct) <= 1) return LastAdmin;
            await users.SetStateAsync(person.Id, blocked ? PersonState.Blocked : PersonState.Active, ct);
            if (blocked) await sessions.DeleteAllOfAsync(person.Id, ct);
            if (blocked) await AuditAsync(person.Name, "person.blocked", ip, $"by {actor.UserName}");
            else await AuditAsync(person.Name, "person.unblocked", ip, $"by {actor.UserName}");
            log.LogWarning("People: {Admin} changed the block of {User}, blocked now: {Blocked}", actor.UserName, person.Name, blocked);
            return Result.Success;
        }, ct);

    public Task<Result> DeleteAsync(SessionIdentity actor, Guid id, string ip, CancellationToken ct = default) =>
        ChangeAsync(id, async person =>
        {
            if (person.Id == actor.UserId) return Self;
            if (person.State == PersonState.Active && person.Role == Base.Accounts.Roles.Admin && await users.CountActiveAdminsAsync(ct) <= 1) return LastAdmin;
            await users.DeleteAsync(person.Id, ct);                   // sessions, settings, invitations and recovery codes go with the row
            await AuditAsync(person.Name, "person.deleted", ip, $"by {actor.UserName}");
            log.LogWarning("People: {Admin} deleted {User}", actor.UserName, person.Name);
            return Result.Success;
        }, ct);

    private async Task<Result> ChangeAsync(Guid id, Func<UserRow, Task<Result>> change, CancellationToken ct)
    {
        await OneChangeAtATime.WaitAsync(ct);
        try
        {
            if (await users.FindByIdAsync(id, ct) is not { } person) return NoPerson;
            return await change(person);
        }
        finally { OneChangeAtATime.Release(); }
    }

    // ---- The invited person: three steps behind the link (the link is the only proof, so every step is limited) ----

    private async Task<Result<(InviteRow Invite, UserRow Person)>> OpenAsync(string? token, string ip, CancellationToken ct)
    {
        var key = "invite:" + ip;
        if (limiter.WaitSeconds(key) is > 0 and var wait) return Error.TooMany(wait);
        if (string.IsNullOrEmpty(token) || await invites.FindOpenAsync(token, ct) is not { } invite
            || await users.FindByIdAsync(invite.UserId, ct) is not { State: PersonState.Invited } person)
        {
            limiter.Fail(key);
            return BadLink;
        }
        return (invite, person);
    }

    public async Task<Result<InviteInfo>> CheckInviteAsync(string? token, string ip, CancellationToken ct = default)
    {
        var open = await OpenAsync(token, ip, ct);
        return open.Ok ? new InviteInfo(open.Value.Person.Name, open.Value.Person.Role) : open.Error!;
    }

    /// <summary>Step 1: the invited person chooses a password; the answer is the authenticator key and the recovery codes. Nothing counts before step 2.</summary>
    public async Task<Result<SetupStart>> BeginInviteAsync(string? token, string? password, string ip, CancellationToken ct = default)
    {
        var open = await OpenAsync(token, ip, ct);
        if (!open.Ok) return open.Error!;
        var person = open.Value.Person;
        if (PasswordPolicy.Problem(password, person.Name) is { } problem) return Field("password", problem, "The password is not strong enough.");
        var secret = Totp.NewSecret();
        var (plain, hashes) = RecoveryCodes.Generate();
        await users.SetUpInvitedAsync(person.Id, await hasher.HashAsync(password!), secret, hashes, ct);
        return new SetupStart(secret, Totp.Uri(options.Issuer, person.Name, secret), plain);
    }

    /// <summary>Step 2: the first code of the authenticator. The link is used up and the person is signed in.</summary>
    public async Task<Result<SignedIn>> FinishInviteAsync(string? token, string? totp, string ip, string? userAgent, CancellationToken ct = default)
    {
        var open = await OpenAsync(token, ip, ct);
        if (!open.Ok) return open.Error!;
        var (invite, person) = open.Value;
        var step = Totp.Check(person.TotpSecret, (totp ?? "").Replace(" ", ""), 0, clock.GetUtcNow());
        if (person.PasswordHash.Length == 0) return Error.Invalid("setup.order", "Choose a password first.");
        if (step is null)
        {
            limiter.Fail("invite:" + ip);
            return WrongCode;
        }
        if (!await invites.RedeemAsync(invite, step.Value, ct)) return BadLink;
        var session = await sessions.CreateAsync(person.Id, ip, userAgent, ct);
        await AuditAsync(person.Name, "invite.used", ip);
        log.LogInformation("People: {User} finished the setup from an invitation", person.Name);
        return new SignedIn(person.Name, person.Roles, session, RecoveryCodes.Count);
    }

    private async Task AuditAsync(string user, string evt, string? ip, string? detail = null)
    {
        try { await audit.AddAsync(user, evt, ip, detail, CancellationToken.None); }
        catch (Exception e) { log.LogError(e, "The security history could not be written"); }
    }
}
