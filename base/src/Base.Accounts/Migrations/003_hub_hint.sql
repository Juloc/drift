-- The ID token of the central sign-in, kept on the session only as the hint for the hub's sign-out (the hub answers a sign-out without asking, and
-- sends the person back to the app, only when it gets this token back). It is deleted with the session; nothing else is done with it.
alter table sessions add column hub_hint text;
