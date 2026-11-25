namespace Base.Web.Auth;

/// <summary>ok/db/app/version/base are the first answer of the base and stay; status, contract and time are the contract of the family (CONTRACT-01).</summary>
public sealed record Health(bool Ok, bool Db, string App, string Version, string Base, string Status, int Contract, DateTimeOffset Time);
/// <summary>What an app says about itself without a session (CONTRACT-02): fixed fields, nothing private.</summary>
public sealed record About(int Contract, string Id, string Name, Base.Core.Localized Description, string Version, string Base, string Icon, int AccentHue, string Start, Base.Accounts.AppRole[] Roles);
public sealed record AppDto(string Id, string Name, string Version, string? Commit, string Base);
public sealed record SetupStatus(bool Needed);
public sealed record SetupBeginRequest(string? Code, string? User, string? Password);
public sealed record SetupBeginResponse(string Secret, string Uri, string[] Recovery);
public sealed record SetupFinishRequest(string? Code, string? User, string? Totp);
public sealed record LoginRequest(string? User, string? Password, string? Code);
public sealed record LoginResponse(string User, string[] Roles, int RecoveryLeft);
public sealed record HubOffer(string Name);
public sealed record MeResponse(string? User, string[]? Roles, bool SetupNeeded, AppDto App, Base.Accounts.AppRole[] AppRoles, bool ViaHub, HubOffer? Hub);
public sealed record LogoutResponse(string? HubLogoutUrl);
public sealed record PasswordChangeRequest(string? Current, string? Next);
public sealed record TotpBeginRequest(string? Current);
public sealed record TotpBeginResponse(string Secret, string Uri);
public sealed record TotpFinishRequest(string? Code);
public sealed record TotpFinishResponse(string[] Recovery);
public sealed record SessionDto(Guid Id, bool Current, DateTimeOffset CreatedAt, DateTimeOffset LastSeen, string? UserAgent, string? Ip);
public sealed record SessionsResponse(SessionDto[] Sessions, int RecoveryLeft);
public sealed record EndedResponse(int Ended);
public sealed record AuditDto(DateTimeOffset At, string Event, string? Detail, string? Ip);
public sealed record AuditResponse(AuditDto[] Entries);
