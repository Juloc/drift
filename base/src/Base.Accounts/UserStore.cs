using Base.Core;
using Base.Data;
using Npgsql;

namespace Base.Accounts;

public static class PersonState
{
    public const string Active = "active", Blocked = "blocked", Invited = "invited";
}

public sealed record UserRow(Guid Id, string Name, string PasswordHash, string TotpSecret, bool TotpConfirmed, long TotpLastStep, string[] Roles, string State = PersonState.Active, string? HubSub = null)
{
    /// <summary>The one role of the person (SEC-03), or null.</summary>
    public string? Role => Roles.Length > 0 ? Roles[0] : null;

    /// <summary>A person who signs in with password and authenticator: set up, and not blocked.</summary>
    public bool CanSignInLocally => TotpConfirmed && State == PersonState.Active;
}

/// <summary>A row of the list of people (no secret in it).</summary>
public sealed record PersonRow(Guid Id, string Name, string? Role, string State, bool ViaHub, DateTimeOffset CreatedAt, DateTimeOffset? LastSeen);

/// <summary>Names of the roles the base itself knows. A role is a plain word in a person's list; an app may add its own (SEC-03).</summary>
public static class Roles
{
    public const string Admin = "admin";
}

/// <summary>
/// The people of an app. The authenticator secret is stored encrypted (<see cref="SecretBox"/>, Base64 of AES-256-GCM with the id of the person
/// bound in), so a dump of the database shows only Argon2 hashes and encrypted values.
/// </summary>
public sealed class UserStore(NpgsqlDataSource db, SecretBox box)
{
    private const string Columns = "id, name, password_hash, totp_secret, totp_confirmed, totp_last_step, roles, state, hub_sub";

    private string Seal(Guid id, string secret) => Convert.ToBase64String(box.Encrypt(secret, id));

    /// <summary>The secret in plain text. A value that cannot be read (another key) gives "": the sign-in fails instead of the server.</summary>
    private string Open(Guid id, string stored)
    {
        try { return box.Decrypt(Convert.FromBase64String(stored), id) ?? ""; }
        catch (FormatException) { return ""; }
    }

    private UserRow Read(NpgsqlDataReader r) =>
        new(r.GetGuid(0), r.GetString(1), r.GetString(2), Open(r.GetGuid(0), r.GetString(3)), r.GetBoolean(4), r.GetInt64(5), r.GetFieldValue<string[]>(6), r.GetString(7), r.TextOrNull(8));

    /// <summary>True when an account exists that can sign in at all: one whose own sign-in is confirmed, or a person of the central sign-in. The first setup is open only while there is none (AUTH-09).</summary>
    public async Task<bool> AnyCanSignInAsync(CancellationToken ct = default) =>
        await db.ScalarAsync<bool>("select exists (select 1 from users where totp_confirmed or hub_sub is not null)", ct);

    public Task<UserRow?> FindByNameAsync(string name, CancellationToken ct = default) =>
        db.FirstAsync($"select {Columns} from users where lower(name) = lower($1)", Read, ct, name);

    public Task<UserRow?> FindByIdAsync(Guid id, CancellationToken ct = default) =>
        db.FirstAsync($"select {Columns} from users where id = $1", Read, ct, id);

    /// <summary>Creates a person with recovery codes, in one transaction. At the first setup, unconfirmed leftovers of earlier tries are removed first.</summary>
    public async Task<UserRow> CreateAsync(string name, string passwordHash, string totpSecret, bool confirmed, IEnumerable<string> recoveryHashes, string[] roles, bool replacePending, CancellationToken ct = default)
    {
        var id = Ids.New();                                    // the id is part of the encrypted value, it must exist before the insert
        await db.InTransactionAsync(async (conn, tx) =>
        {
            if (replacePending) await conn.ExecAsync(tx, "delete from users where not totp_confirmed and state = 'active' and hub_sub is null", ct);
            await conn.ExecAsync(tx, "insert into users (id, name, password_hash, totp_secret, totp_confirmed, roles) values ($1, $2, $3, $4, $5, $6)", ct,
                id, name, passwordHash, Seal(id, totpSecret), confirmed, roles);
            await InsertRecoveryAsync(conn, tx, id, recoveryHashes, ct);
        }, ct);
        return new UserRow(id, name, passwordHash, totpSecret, confirmed, 0, roles);
    }

    private static async Task InsertRecoveryAsync(NpgsqlConnection conn, NpgsqlTransaction tx, Guid id, IEnumerable<string> hashes, CancellationToken ct)
    {
        foreach (var h in hashes) await conn.ExecAsync(tx, "insert into recovery_codes (user_id, code_hash) values ($1, $2)", ct, id, h);
    }

    /// <summary>Spends a time step. Works only when it is newer than the last one used: the same code never works twice, also not in two requests at once.</summary>
    public async Task<bool> TryAdvanceTotpStepAsync(Guid id, long step, CancellationToken ct = default) =>
        await db.ExecAsync("update users set totp_last_step = $2 where id = $1 and totp_last_step < $2", ct, id, step) == 1;

    /// <summary>Spends a recovery code: the row is deleted, so it works once.</summary>
    public async Task<bool> ConsumeRecoveryCodeAsync(Guid id, string hash, CancellationToken ct = default) =>
        await db.ExecAsync("delete from recovery_codes where user_id = $1 and code_hash = $2", ct, id, hash) == 1;

    public async Task<int> RecoveryLeftAsync(Guid id, CancellationToken ct = default) =>
        (int)await db.ScalarAsync<long>("select count(*) from recovery_codes where user_id = $1", ct, id);

    public Task ConfirmAsync(Guid id, CancellationToken ct = default) => db.ExecAsync("update users set totp_confirmed = true where id = $1", ct, id);

    public Task SetRolesAsync(Guid id, string[] roles, CancellationToken ct = default) => db.ExecAsync("update users set roles = $2 where id = $1", ct, id, roles);

    /// <summary>
    /// Changes the one role of a person, unless that would leave the app without an active administrator (AUTH-12): the one place for every way a role changes
    /// (an administrator's change and the sign-in through the hub). The check and the change are one statement. False: the role was not changed.
    /// </summary>
    public async Task<bool> TrySetRoleAsync(Guid id, string role, CancellationToken ct = default) =>
        await db.ExecAsync(
            "update users set roles = $2 where id = $1 and not (state = 'active' and 'admin' = any(roles) and (totp_confirmed or hub_sub is not null) and $3 <> 'admin' " +
            "and (select count(*) from users where state = 'active' and 'admin' = any(roles) and (totp_confirmed or hub_sub is not null)) <= 1)", ct, id, new[] { role }, role) == 1;

    public Task<UserRow?> FindByHubSubAsync(string sub, CancellationToken ct = default) =>
        db.FirstAsync($"select {Columns} from users where hub_sub = $1", Read, ct, sub);

    /// <param name="keepSession">With <paramref name="endSessions"/>: this session stays, for example the one the password is changed in.</param>
    public Task SetPasswordAsync(Guid id, string passwordHash, bool endSessions, CancellationToken ct = default, Guid? keepSession = null) =>
        db.InTransactionAsync(async (conn, tx) =>
        {
            await conn.ExecAsync(tx, "update users set password_hash = $2 where id = $1", ct, id, passwordHash);
            if (endSessions) await conn.ExecAsync(tx, "delete from sessions where user_id = $1 and ($2::uuid is null or id <> $2)", ct, id, keepSession);
        }, ct);

    /// <summary>A new authenticator secret and new recovery codes; ends every session except <paramref name="keepSession"/>.</summary>
    /// <param name="lastStep">The time step the new secret was confirmed with: the same code does not work again afterwards.</param>
    public Task ReplaceTotpAsync(Guid id, string secret, IEnumerable<string> recoveryHashes, CancellationToken ct = default, Guid? keepSession = null, long lastStep = 0) =>
        db.InTransactionAsync(async (conn, tx) =>
        {
            await conn.ExecAsync(tx, "update users set totp_secret = $2, totp_last_step = $3, totp_confirmed = true where id = $1", ct, id, Seal(id, secret), lastStep);
            await conn.ExecAsync(tx, "delete from recovery_codes where user_id = $1", ct, id);
            await InsertRecoveryAsync(conn, tx, id, recoveryHashes, ct);
            await conn.ExecAsync(tx, "delete from sessions where user_id = $1 and ($2::uuid is null or id <> $2)", ct, id, keepSession);
        }, ct);

    // ---- Managing people (PeopleService decides; these are the statements) ----

    public async Task<IReadOnlyList<PersonRow>> ListAsync(CancellationToken ct = default) =>
        await db.QueryAsync("select u.id, u.name, u.roles[1], u.state, u.hub_sub is not null, u.created_at, (select max(s.last_seen) from sessions s where s.user_id = u.id) from users u where not (u.state = 'active' and not u.totp_confirmed and u.hub_sub is null) order by lower(u.name)",
            r => new PersonRow(r.GetGuid(0), r.GetString(1), r.TextOrNull(2), r.GetString(3), r.GetBoolean(4), r.Time(5), r.IsDBNull(6) ? null : r.Time(6)), ct);

    /// <summary>Makes a person who has not set up a password yet (an invitation follows). The password and the authenticator key are placeholders nobody can use: the person is not "confirmed".</summary>
    public async Task<UserRow> CreateInvitedAsync(string name, string role, CancellationToken ct = default)
    {
        var id = Ids.New();
        await db.ExecAsync("insert into users (id, name, password_hash, totp_secret, totp_confirmed, roles, state) values ($1, $2, '', $3, false, $4, 'invited')", ct,
            id, name, Seal(id, Totp.NewSecret()), new[] { role });
        return new UserRow(id, name, "", "", false, 0, [role], PersonState.Invited);
    }

    /// <summary>A person of the central sign-in. No password and no authenticator here: they come in through the centre only. Null when the name is taken (the caller tries another).</summary>
    public async Task<UserRow?> CreateHubPersonAsync(string name, string role, string hubSub, CancellationToken ct = default)
    {
        var id = Ids.New();
        try
        {
            await db.ExecAsync("insert into users (id, name, password_hash, totp_secret, totp_confirmed, roles, state, hub_sub) values ($1, $2, '', $3, false, $4, 'active', $5)", ct,
                id, name, Seal(id, Totp.NewSecret()), new[] { role }, hubSub);
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { return null; }
        return new UserRow(id, name, "", "", false, 0, [role], PersonState.Active, hubSub);
    }

    public Task SetStateAsync(Guid id, string state, CancellationToken ct = default) => db.ExecAsync("update users set state = $2 where id = $1", ct, id, state);

    public Task<int> DeleteAsync(Guid id, CancellationToken ct = default) => db.ExecAsync("delete from users where id = $1", ct, id);

    /// <summary>Sets password and authenticator key of an invited person who has not finished yet, with new recovery codes. Nothing counts before <see cref="ConfirmAsync"/>.</summary>
    public Task SetUpInvitedAsync(Guid id, string passwordHash, string secret, IEnumerable<string> recoveryHashes, CancellationToken ct = default) =>
        db.InTransactionAsync(async (conn, tx) =>
        {
            await conn.ExecAsync(tx, "update users set password_hash = $2, totp_secret = $3, totp_last_step = 0 where id = $1 and state = 'invited'", ct, id, passwordHash, Seal(id, secret));
            await conn.ExecAsync(tx, "delete from recovery_codes where user_id = $1", ct, id);
            await InsertRecoveryAsync(conn, tx, id, recoveryHashes, ct);
        }, ct);

    public Task<long> CountActiveAdminsAsync(CancellationToken ct = default) =>
        db.ScalarAsync<long>("select count(*) from users where state = 'active' and 'admin' = any(roles) and (totp_confirmed or hub_sub is not null)", ct);
}
