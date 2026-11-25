-- The best stars of a person for each challenge (game/data/challenges.json), confirmed by the server from the poses (or the race logic for lap challenges).
create table drift_challenge (
  user_id      uuid not null,
  challenge_id text not null check (char_length(challenge_id) between 1 and 40),
  stars        smallint not null check (stars between 0 and 3),
  value        double precision not null,      -- what was measured: points, seconds, a multiplier or milliseconds
  set_at       timestamptz not null default now(),
  primary key (user_id, challenge_id)
);
