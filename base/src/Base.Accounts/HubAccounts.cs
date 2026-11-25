using Base.Core;
using Microsoft.Extensions.Logging;

namespace Base.Accounts;

/// <summary>What the central sign-in vouched for: who (<c>sub</c>, stable), for which of its sessions (<c>sid</c>), the name and the role in this app.</summary>
public sealed record HubIdentity(string Sub, string Sid, string? Name, string? Role, string? Hint = null);

/// <summary>
/// The accounts side of "Sign in through the hub" (AUTH-13): the person of the centre becomes a person here, by <c>sub</c> only (never by name or mail),
/// the role comes from the centre at every sign-in, and then the app makes its OWN session, exactly as after a password. Of the centre's token only the ID token stays, as the hint for its sign-out (AUTH-14).
/// </summary>
public sealed class HubAccounts(UserStore users, SessionStore sessions, AuditStore audit, AppRoles roles, ILogger<HubAccounts> log)
{
    private static readonly Error NoAccess = Error.Forbidden("hub.no_access", "The central sign-in gave no role this app knows.");

    public async Task<Result<SignedIn>> SignInAsync(HubIdentity who, string ip, string? userAgent, CancellationToken ct = default)
    {
        if (!roles.Knows(who.Role))
        {
            log.LogWarning("Central sign-in refused: the role '{Role}' is not known to this app", Truncate(who.Role));
            return NoAccess;
        }
        var user = await users.FindByHubSubAsync(who.Sub, ct);
        if (user is null)
        {
            user = await CreateAsync(who, ct);
            await AuditAsync(user.Name, "hub.created", ip, who.Role);
        }
        else if (user.State != PersonState.Active)
        {
            log.LogWarning("Central sign-in refused: {User} is blocked here", user.Name);
            await AuditAsync(user.Name, "hub.refused", ip);
            return NoAccess;
        }
        else if (user.Role != who.Role)
        {
            // the same protection as for an administrator's change (AUTH-12): the last active administrator keeps the role, the sign-in still succeeds
            if (await users.TrySetRoleAsync(user.Id, who.Role!, ct))
                await AuditAsync(user.Name, "person.role", ip, $"by the central sign-in, {user.Role} to {who.Role}");
            else
            {
                await AuditAsync(user.Name, "hub.role_kept", ip, $"the central sign-in said {who.Role}, not applied: the last administrator keeps the role {user.Role}");
                log.LogWarning("Central sign-in: the role {Role} for {User} was not applied, the last administrator keeps {Kept}", Truncate(who.Role), user.Name, user.Role);
                who = who with { Role = user.Role };
            }
        }
        var token = await sessions.CreateAsync(user.Id, ip, userAgent, ct, hubSid: who.Sid, hubHint: who.Hint);
        await AuditAsync(user.Name, "hub.login", ip);
        log.LogInformation("Signed in through the central sign-in: {User} from {Ip}", user.Name, ip);
        return new SignedIn(user.Name, [who.Role!], token, 0);
    }

    private async Task<UserRow> CreateAsync(HubIdentity who, CancellationToken ct)
    {
        // the name is only a label here: no sign-in by name for these people, and never a link to an existing local account of the same name
        var baseName = PasswordPolicy.NormalizeUserName(who.Name) ?? "hub-" + Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(who.Sub)))[..8];
        for (var i = 0; i < 20; i++)
        {
            var name = i == 0 ? baseName : (baseName.Length > 28 ? baseName[..28] : baseName) + "-" + (i + 1);
            if (await users.CreateHubPersonAsync(name, who.Role!, who.Sub, ct) is { } created) return created;
            // taken: by another person, or by the same person signing in twice at once
            if (await users.FindByHubSubAsync(who.Sub, ct) is { } same) return same;
        }
        throw new InvalidOperationException("No free name for a person of the central sign-in.");
    }

    /// <summary>Back-channel logout: ends the sessions made for that central session. Returns how many.</summary>
    public async Task<int> EndSessionsAsync(string? sid, string? sub, CancellationToken ct = default)
    {
        var ended = await sessions.DeleteByHubAsync(sid, sub, ct);
        if (ended > 0 && sub is not null && await users.FindByHubSubAsync(sub, ct) is { } user) await AuditAsync(user.Name, "hub.logout", null, ended.ToString());
        log.LogInformation("Back-channel logout: {Count} session(s) ended", ended);
        return ended;
    }

    private static string Truncate(string? s) => s is null ? "" : s.Length <= 30 ? s : s[..30];

    private async Task AuditAsync(string user, string evt, string? ip, string? detail = null)
    {
        try { await audit.AddAsync(user, evt, ip, detail, CancellationToken.None); }
        catch (Exception e) { log.LogError(e, "The security history could not be written"); }
    }
}
