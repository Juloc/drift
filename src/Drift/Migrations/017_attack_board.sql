-- A sixth kind of best: the points of one run in the mode "Drift attack" on a map (kind 5; higher is better, like kinds 2 to 4).
alter table drift_best_time drop constraint drift_best_time_kind_check;
alter table drift_best_time add constraint drift_best_time_kind_check check (kind in (0, 1, 2, 3, 4, 5));
