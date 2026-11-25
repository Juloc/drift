-- Review fixes: the sign-up log gets an id (a limit slot is reserved first and given back when the sign-up fails).
alter table games_account_signup_log add column id bigserial;
create unique index games_account_signup_log_id on games_account_signup_log (id);
