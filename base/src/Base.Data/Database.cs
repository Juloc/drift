using Microsoft.Extensions.Logging;
using Npgsql;

namespace Base.Data;

/// <summary>Opens the one PostgreSQL database of an app and brings its schema up to date at start.</summary>
public static class Database
{
    /// <summary>
    /// The data source of the app. The password may stand in the connection string or, as in the Compose file of every app, in a file that
    /// only the server can read (<paramref name="passwordFile"/>): so the Compose file holds no secret and needs no variables (OPS-02).
    /// </summary>
    public static NpgsqlDataSource Create(string connectionString, string? passwordFile = null)
    {
        var builder = new NpgsqlDataSourceBuilder(connectionString);
        // Kerberos is not used; on slim images the library is missing and Npgsql would complain in the log
        builder.ConnectionStringBuilder.GssEncryptionMode = GssEncryptionMode.Disable;
        if (!string.IsNullOrWhiteSpace(passwordFile))
        {
            if (!File.Exists(passwordFile)) throw new InvalidOperationException($"The database password file '{passwordFile}' does not exist.");
            builder.ConnectionStringBuilder.Password = File.ReadAllText(passwordFile).Trim();
        }
        return builder.Build();
    }

    /// <summary>Applies the migrations. PostgreSQL is sometimes not ready when both containers start together: waits up to a minute for it.</summary>
    public static async Task<IReadOnlyList<string>> MigrateWithRetryAsync(Migrator migrator, ILogger log, CancellationToken ct = default)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var applied = await migrator.RunAsync(ct);
                log.LogInformation("Database ready, {Count} migration(s) applied.", applied.Count);
                return applied;
            }
            catch (Exception e) when (attempt < 30 && e is NpgsqlException or System.Net.Sockets.SocketException or TimeoutException)
            {
                log.LogWarning("Database not reachable yet (attempt {Attempt}): {Message}", attempt, e.Message);
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }
    }
}
