-- A fourth kind of best: the highest bonus points of one tandem chain on a map (kind 3; higher is better, like kind 2).
alter table drift_best_time drop constraint drift_best_time_kind_check;
alter table drift_best_time add constraint drift_best_time_kind_check check (kind in (0, 1, 2, 3));
