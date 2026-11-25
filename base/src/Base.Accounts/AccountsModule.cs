using Base.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Base.Accounts;

/// <summary>Registers the accounts of the base in an app.</summary>
public static class AccountsModule
{
    /// <summary>The numbered SQL scripts of the accounts.</summary>
    public static MigrationSet Migrations => MigrationSet.FromAssembly(typeof(AccountsModule).Assembly, "accounts");

    /// <param name="issuer">The name of the app, shown by authenticator apps.</param>
    /// <param name="secretKey">The key for encrypted values, see <see cref="SecretBox.ResolveKey"/>.</param>
    /// <param name="fixedSetupCode">Only for tests: a known setup code instead of a random one.</param>
    /// <param name="roles">The roles of the app (default: admin and member).</param>
    public static IServiceCollection AddBaseAccounts(this IServiceCollection services, string issuer, string secretKey, string? fixedSetupCode = null, IReadOnlyList<AppRole>? roles = null)
    {
        services.AddSingleton(new AccountOptions(issuer));
        services.AddSingleton(new SecretBox(secretKey));
        services.AddSingleton(new SetupCode(fixedSetupCode));
        services.AddSingleton<UserStore>();
        services.AddSingleton<SessionStore>();
        services.AddSingleton<AuditStore>();
        services.AddSingleton<PasswordHasher>();
        services.AddSingleton<LoginLimiter>();
        services.AddSingleton(new AppRoles(roles ?? AppRoles.Default));
        services.AddSingleton<InviteStore>();
        services.AddSingleton<AccountService>();
        services.AddSingleton<PeopleService>();
        services.AddSingleton<HubAccounts>();
        services.AddHostedService<SessionPurgeWorker>();
        return services;
    }
}

/// <summary>Once an hour: removes sessions that have run out and forgets old lockout counters.</summary>
internal sealed class SessionPurgeWorker(SessionStore sessions, LoginLimiter limiter, ILogger<SessionPurgeWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        try
        {
            do
            {
                try { await sessions.PurgeAsync(stoppingToken); limiter.Sweep(); }
                catch (Exception e) when (e is not OperationCanceledException) { log.LogWarning(e, "Removing old sessions failed; it is tried again in an hour"); }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) { /* the server stops */ }
    }
}
