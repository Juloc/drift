-- A third kind of best: the highest points of one drift chain on a map (kind 2; the column ms then holds points, and higher is better).
alter table drift_best_time drop constraint drift_best_time_kind_check;
alter table drift_best_time add constraint drift_best_time_kind_check check (kind in (0, 1, 2));
