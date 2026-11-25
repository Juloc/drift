-- Settings live in the app, not in files or environment variables (OPS-03):
--   user_settings      what a person chose (language, light or dark, ...), follows them to every device
--   instance_settings  what applies to the whole installation, changed by an administrator
-- One JSON value per key. The server checks every value against its rule before it is stored (SettingRules); unknown keys are refused.
create table user_settings (
  user_id     uuid not null references users (id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create table instance_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
