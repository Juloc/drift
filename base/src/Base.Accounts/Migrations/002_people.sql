-- Managing people: a state per person (active, blocked, or invited and not yet set up), the link to a person of the central sign-in,
-- and the invitations (a link that works once and runs out after 24 hours, stored as SHA-256 only).
alter table users add column state text not null default 'active' check (state in ('active', 'blocked', 'invited'));
alter table users add column hub_sub text;
create unique index users_hub_sub_key on users (hub_sub) where hub_sub is not null;

-- The session made after a sign-in through the central place keeps the id of the central session (sid), so a logout of the centre can end it.
alter table sessions add column hub_sid text;
create index sessions_hub_sid_idx on sessions (hub_sid) where hub_sid is not null;

create table invites (
  id          uuid primary key,
  token_hash  text not null unique,
  user_id     uuid not null references users (id) on delete cascade,
  created_by  text not null,
  created_at  timestamptz not null,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index invites_user_idx on invites (user_id);
