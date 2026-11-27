-- Protection of the games accounts (docs/PLAN-0.2.md slices 2 and 3): sign-up log (addresses only as keyed hashes, kept 7 days), a secret for them,
-- bans of address ranges, and reports of players.
create table games_account_secret (
  name  text primary key,
  value bytea not null
);
create table games_account_signup_log (
  addr bytea not null,                 -- HMAC of the address key with the secret above: no raw address is kept
  at   timestamptz not null default now()
);
create index games_account_signup_log_addr on games_account_signup_log (addr, at);
create index games_account_signup_log_at on games_account_signup_log (at);
create table games_account_ban (
  id      uuid primary key,
  range   inet not null,               -- an address or a network (for IPv6 the /64 the limits count under)
  until   timestamptz not null,
  reason  text,
  made_by uuid,
  made_at timestamptz not null default now()
);
create table games_account_report (
  id            uuid primary key,
  reporter      uuid not null,
  reported_name text not null check (char_length(reported_name) <= 40),
  reported_id   uuid,                  -- when the name could be tied to one person in the lobby
  reason        smallint not null check (reason between 0 and 4),   -- fixed reasons: 0 ramming, 1 blocking, 2 name, 3 cheating, 4 other
  at            timestamptz not null default now(),
  handled_at    timestamptz
);
create index games_account_report_open on games_account_report (at) where handled_at is null;
