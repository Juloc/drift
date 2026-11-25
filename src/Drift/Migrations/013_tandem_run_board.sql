-- A fifth kind of best: the pair's score of a tandem competition (kind 4; higher is better).
alter table drift_best_time drop constraint drift_best_time_kind_check;
alter table drift_best_time add constraint drift_best_time_kind_check check (kind in (0, 1, 2, 3, 4));
