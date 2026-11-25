-- Every shown name follows the same rules and is unique (review finding M3): a nickname has a comparison key like a games account's name.
-- Old rows get their key at the next start (Owners.SweepAsync, which also clears nicknames that the rules refuse).
alter table drift_profile add column nick_key text;
create unique index drift_profile_nick_key on drift_profile (nick_key) where nick_key is not null;
