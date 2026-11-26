-- The boards are kept apart by what a best was driven ON (design DESIGN-PHYSIK-STRECKE.md 2.8): the road changed shape with the track system and the physics learned
-- hills, so an old time and a new one do not compare. ver 1 = the road and the flat physics of before (every row there is), 2 = a road of the track system with the
-- flat physics, 3 = a road of the track system with the physics that feels hills. Old rows stay and can be read; they are never compared with the new ones.
alter table drift_best_time add column ver smallint not null default 1 check (ver between 1 and 9);
alter table drift_best_time drop constraint drift_best_time_pkey;
alter table drift_best_time add primary key (map_id, user_id, kind, feel, ver);
drop index if exists drift_best_time_board;
create index drift_best_time_board on drift_best_time (map_id, kind, feel, ver, ms);
