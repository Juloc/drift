-- What a person chose in the garage: the car, the colour (one of 24 hues, an index of 15 degrees) and a nickname.
-- One row per person, created at the first save; without a row the person drives the first car under their account name.
create table drift_profile (
  user_id    uuid primary key references users (id) on delete cascade,
  car_id     smallint not null default 0 check (car_id between 0 and 4),
  colour     smallint not null default 8 check (colour between 0 and 23),
  nick       text check (nick is null or char_length(nick) between 2 and 16),
  updated_at timestamptz not null default now()
);
