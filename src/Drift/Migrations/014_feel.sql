-- The feel of driving a best was set with (0 = arcade, 1 = pro: fewer aids). The boards are kept apart by it: a best is the person's best with that feel.
alter table drift_best_time add column feel smallint not null default 0 check (feel in (0, 1));
alter table drift_best_time drop constraint drift_best_time_pkey;
alter table drift_best_time add primary key (map_id, user_id, kind, feel);
drop index if exists drift_best_time_board;
create index drift_best_time_board on drift_best_time (map_id, kind, feel, ms);
