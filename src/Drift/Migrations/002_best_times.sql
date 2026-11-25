-- The best times of every person on a map: one best lap and one best race (a race of the map's standard number of laps).
-- A time is only written for a finished race that passed the plausibility check of the server.
create table drift_best_time (
  map_id  smallint not null,
  user_id uuid     not null references users (id) on delete cascade,
  kind    smallint not null check (kind in (0, 1)),       -- 0 = best lap, 1 = best race
  ms      integer  not null check (ms > 0),
  car_id  smallint not null check (car_id between 0 and 4),
  set_at  timestamptz not null default now(),
  primary key (map_id, user_id, kind)
);
create index drift_best_time_board on drift_best_time (map_id, kind, ms);
