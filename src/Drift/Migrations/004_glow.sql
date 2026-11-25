-- Underglow: null = off, else one of the 24 hues (index of 15 degrees), like the car's colour.
alter table drift_profile add column glow smallint check (glow is null or glow between 0 and 23);
