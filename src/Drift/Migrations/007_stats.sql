-- Counters per person: driven distance and play time (everywhere, from the poses and the open sockets), races, wins and podiums (from races).
-- The best drift is not stored here: it is the highest of the person's rows of kind 2 in drift_best_time.
create table drift_stats (
  user_id uuid primary key references users (id) on delete cascade,
  metres  double precision not null default 0 check (metres >= 0),
  seconds double precision not null default 0 check (seconds >= 0),
  races   integer not null default 0 check (races >= 0),
  wins    integer not null default 0 check (wins >= 0),
  podiums integer not null default 0 check (podiums >= 0)
);
