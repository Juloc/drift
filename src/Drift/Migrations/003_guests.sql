-- Guest links and guest sessions (docs/ARCHITECTURE.md section 5). A guest has no account: an administrator makes a link (valid some hours, a few
-- uses), a friend opens it, chooses a name and gets a session of its own that ends with the link. The tables hold only hashes (SHA-256) of the secrets.
create table drift_guest_link (
  id         uuid primary key,
  hash       bytea not null unique,                  -- SHA-256 of the link's token (the token lives only in the URL fragment)
  created_by uuid  not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses   smallint not null check (max_uses between 1 and 20),
  uses       smallint not null default 0 check (uses >= 0),
  revoked_at timestamptz
);
create table drift_guest_session (
  id         uuid primary key,
  hash       bytea not null unique,                  -- SHA-256 of the session cookie value
  link_id    uuid  not null references drift_guest_link (id) on delete cascade,
  name       text  not null check (char_length(name) between 2 and 16),
  car_id     smallint not null default 0 check (car_id between 0 and 4),
  colour     smallint not null check (colour between 0 and 23),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index drift_guest_session_link on drift_guest_session (link_id);
