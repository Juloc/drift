-- The "Juloc Games" account (docs/ACCOUNTS-GAMES.md): one name and one password for all games, no mail, no second factor. A module of its own: its tables all
-- start with games_account, and nothing in it points at the game's tables. The accounts are not rows of `users` (the base asks for a second factor there).
create table games_account (
  id            uuid primary key,
  name          text not null check (char_length(name) between 3 and 16),
  name_key      text not null unique,                 -- the name folded to lower case: the uniqueness
  password_hash text not null,
  must_change   boolean not null default false,       -- set after an administrator's reset: the next sign-in must choose a new password
  state         text not null default 'active' check (state in ('active', 'blocked')),
  created_at    timestamptz not null default now(),
  name_changed_at timestamptz
);
create table games_account_session (
  id         uuid primary key,
  hash       bytea not null unique,                   -- SHA-256 of the cookie value
  account_id uuid not null references games_account (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create table games_account_released (               -- a deleted account's name stays reserved for 30 days
  name_key text primary key,
  until    timestamptz not null
);
create index games_account_session_account on games_account_session (account_id);

-- The game's own tables hold rows of hub people (users) and of games accounts, so they cannot all point at `users` any more. Whoever deletes a person
-- (the hub's people list, the account's own delete) removes the rows by owner (Drift.Owners); a sweep at start catches the rest.
alter table drift_profile drop constraint if exists drift_profile_user_id_fkey;
alter table drift_stats drop constraint if exists drift_stats_user_id_fkey;
alter table drift_tuning drop constraint if exists drift_tuning_user_id_fkey;
alter table drift_best_time drop constraint if exists drift_best_time_user_id_fkey;
