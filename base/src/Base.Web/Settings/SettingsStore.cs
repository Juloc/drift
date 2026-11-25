using Base.Data;
using Npgsql;

namespace Base.Web.Settings;

/// <summary>Settings as one JSON value per key, per person and for the installation. The server checks a value before it gets here (<see cref="SettingRules"/>).</summary>
public sealed class SettingsStore(NpgsqlDataSource db)
{
    public async Task<IReadOnlyDictionary<string, string>> GetAllAsync(Guid userId, CancellationToken ct = default) =>
        (await db.QueryAsync("select key, value::text from user_settings where user_id = $1", r => (r.GetString(0), r.GetString(1)), ct, userId)).ToDictionary(x => x.Item1, x => x.Item2);

    public Task SetAsync(Guid userId, string key, string json, CancellationToken ct = default) =>
        db.ExecAsync("insert into user_settings (user_id, key, value) values ($1, $2, $3::text::jsonb) on conflict (user_id, key) do update set value = excluded.value, updated_at = now()", ct, userId, key, json);

    public async Task<bool> DeleteAsync(Guid userId, string key, CancellationToken ct = default) =>
        await db.ExecAsync("delete from user_settings where user_id = $1 and key = $2", ct, userId, key) == 1;

    public async Task<IReadOnlyDictionary<string, string>> GetInstanceAsync(CancellationToken ct = default) =>
        (await db.QueryAsync("select key, value::text from instance_settings", r => (r.GetString(0), r.GetString(1)), ct)).ToDictionary(x => x.Item1, x => x.Item2);

    public Task SetInstanceAsync(string key, string json, CancellationToken ct = default) =>
        db.ExecAsync("insert into instance_settings (key, value) values ($1, $2::text::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()", ct, key, json);

    public async Task<bool> DeleteInstanceAsync(string key, CancellationToken ct = default) =>
        await db.ExecAsync("delete from instance_settings where key = $1", ct, key) == 1;
}
