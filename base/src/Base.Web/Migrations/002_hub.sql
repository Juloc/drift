-- The central sign-in: the sign-ins that are under way (state, nonce and PKCE verifier of each, valid for ten minutes, used once)
-- and the logout tokens already seen (a token works once). Nothing here is a session or a key; the verifier is stored encrypted.
create table hub_flows (
  id            uuid primary key,
  state_hash    text not null unique,
  browser_hash  text not null,
  nonce         text not null,
  verifier      text not null,
  redirect_uri  text not null,
  expires_at    timestamptz not null
);

create table hub_logout_tokens (
  jti_hash    text primary key,
  expires_at  timestamptz not null
);
