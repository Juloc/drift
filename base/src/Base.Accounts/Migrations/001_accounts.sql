-- People, recovery codes, sessions and the security history.
-- Nothing here can be used to sign in when the table leaks: passwords are Argon2id hashes, the authenticator secret is encrypted with a key
-- that is not in the database, recovery codes and sessions are stored as SHA-256 only (AUTH-01, AUTH-03, AUTH-06, AUTH-07).

create table users (
  id              uuid primary key,
  name            text not null,
  password_hash   text not null,
  totp_secret     text not null,
  totp_confirmed  boolean not null default false,
  totp_last_step  bigint not null default 0,
  roles           text[] not null default '{}',
  created_at      timestamptz not null default now()
);
create unique index users_name_key on users (lower(name));

create table recovery_codes (
  user_id    uuid not null references users (id) on delete cascade,
  code_hash  text not null,
  primary key (user_id, code_hash)
);

-- One row per device. id stays the same for the life of the session; hash changes when the cookie is rotated,
-- prev_hash keeps the old cookie valid for a few minutes so that requests already on their way do not sign anybody out.
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  hash        text not null unique,
  user_id     uuid not null references users (id) on delete cascade,
  created_at  timestamptz not null,
  last_seen   timestamptz not null,
  rotated_at  timestamptz not null,
  prev_hash   text,
  prev_until  timestamptz,
  user_agent  text,
  ip          text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_prev_idx on sessions (prev_hash) where prev_hash is not null;

-- Who did what to an account, and when. Never a password, a code or a key.
create table account_audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_name  text not null,
  event      text not null,
  detail     text,
  ip         text
);
create index account_audit_user_idx on account_audit (user_name, id desc);
