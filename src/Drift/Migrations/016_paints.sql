-- Three more paints besides the 24 hues: 24 = white, 25 = black, 26 = silver (an index like the hues, so the relay's frames do not change).
alter table drift_profile drop constraint if exists drift_profile_colour_check;
alter table drift_profile add constraint drift_profile_colour_check check (colour between 0 and 26);
alter table drift_guest_session drop constraint if exists drift_guest_session_colour_check;
alter table drift_guest_session add constraint drift_guest_session_colour_check check (colour between 0 and 26);
