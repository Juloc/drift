-- Tuning per person and car: four sliders from -3 to +3 with a budget of 10 points (the sum of their distances from 0), checked by the table too.
create table drift_tuning (
  user_id   uuid not null references users (id) on delete cascade,
  car_id    smallint not null check (car_id between 0 and 4),
  steer     smallint not null default 0 check (steer between -3 and 3),
  balance   smallint not null default 0 check (balance between -3 and 3),
  power     smallint not null default 0 check (power between -3 and 3),
  handbrake smallint not null default 0 check (handbrake between -3 and 3),
  primary key (user_id, car_id),
  check (abs(steer) + abs(balance) + abs(power) + abs(handbrake) <= 10)
);
