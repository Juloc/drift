using Npgsql;

namespace Base.Data;

/// <summary>
/// Plain SQL against PostgreSQL. Values always travel as parameters ($1, $2, ...), never glued into the text (DATA-01).
/// </summary>
public static class Db
{
    public static NpgsqlCommand Cmd(this NpgsqlDataSource db, string sql, params object?[] args)
    {
        var cmd = db.CreateCommand(sql);
        foreach (var a in args) cmd.Parameters.Add(new NpgsqlParameter { Value = a ?? DBNull.Value });
        return cmd;
    }

    public static NpgsqlCommand Cmd(this NpgsqlConnection conn, NpgsqlTransaction? tx, string sql, params object?[] args)
    {
        var cmd = new NpgsqlCommand(sql, conn, tx);
        foreach (var a in args) cmd.Parameters.Add(new NpgsqlParameter { Value = a ?? DBNull.Value });
        return cmd;
    }

    /// <summary>Runs a statement and returns the number of rows it changed.</summary>
    public static async Task<int> ExecAsync(this NpgsqlDataSource db, string sql, CancellationToken ct, params object?[] args)
    {
        await using var cmd = db.Cmd(sql, args);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    public static async Task<int> ExecAsync(this NpgsqlConnection conn, NpgsqlTransaction? tx, string sql, CancellationToken ct, params object?[] args)
    {
        await using var cmd = conn.Cmd(tx, sql, args);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>The first column of the first row, or the default when there is no row or it is null.</summary>
    public static async Task<T?> ScalarAsync<T>(this NpgsqlDataSource db, string sql, CancellationToken ct, params object?[] args)
    {
        await using var cmd = db.Cmd(sql, args);
        return await cmd.ExecuteScalarAsync(ct) is { } v and not DBNull ? (T)v : default;
    }

    public static async Task<List<T>> QueryAsync<T>(this NpgsqlDataSource db, string sql, Func<NpgsqlDataReader, T> map, CancellationToken ct, params object?[] args)
    {
        await using var cmd = db.Cmd(sql, args);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        var list = new List<T>();
        while (await r.ReadAsync(ct)) list.Add(map(r));
        return list;
    }

    /// <summary>The first row, or null when there is none.</summary>
    public static async Task<T?> FirstAsync<T>(this NpgsqlDataSource db, string sql, Func<NpgsqlDataReader, T> map, CancellationToken ct, params object?[] args) where T : class
    {
        await using var cmd = db.Cmd(sql, args);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? map(r) : null;
    }

    /// <summary>
    /// Runs the work in one transaction: all of it is saved, or (when it throws) none of it (DATA-01).
    /// Use the given connection and transaction for every statement inside.
    /// </summary>
    public static async Task<T> InTransactionAsync<T>(this NpgsqlDataSource db, Func<NpgsqlConnection, NpgsqlTransaction, Task<T>> work, CancellationToken ct = default)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        var result = await work(conn, tx);
        await tx.CommitAsync(ct);
        return result;
    }

    public static Task InTransactionAsync(this NpgsqlDataSource db, Func<NpgsqlConnection, NpgsqlTransaction, Task> work, CancellationToken ct = default) =>
        db.InTransactionAsync<object?>(async (conn, tx) => { await work(conn, tx); return null; }, ct);

    public static string? TextOrNull(this NpgsqlDataReader r, int column) => r.IsDBNull(column) ? null : r.GetString(column);

    public static DateTimeOffset Time(this NpgsqlDataReader r, int column) => r.GetFieldValue<DateTimeOffset>(column);
}
