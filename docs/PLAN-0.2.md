# Plan 0.2: the public start (draft, nothing built)

Status: **plan for the owner's yes**, written 2026-11-26. Content comes from [ROADMAP.md](ROADMAP.md) (phase 0.2); the account module from [ACCOUNTS-GAMES.md](ACCOUNTS-GAMES.md). Slices are in the order they are built; **one slice at a time**, each ends with tests green, a small commit, an entry in STATE.md and a short report. Rules that hold for every slice: nothing private in the repository, texts through `t()` in German and English, failures as codes with a text (I18N-02), SQL names the owner (DATA-03), schema changes are new numbered scripts, no new runtime packages, no build step in the browser, the relay's frames stay compatible with the website's copy.

Why this order: everything public depends on accounts and on protecting them, so those come first; gameplay changes (contact, sound, controller) come before the load test because they change what the server does per frame; the security review comes last over everything new.

## Slice 1: the Juloc Games account module
- **What:** `src/Drift/GameAccounts/` (namespace `Drift.GameAccounts`): tables `games_account`, `games_account_session` (migration `008_games_accounts.sql`, all prefixed), Argon2id through the base's hasher, own door `/games-account/api/...` and own cookie `__Host-games`, sign-up, sign-in, sign-out, session check by id; name rules (3 to 16, unique ignoring case, reserved words); one small interface `IGameIdentity` through which Drift's play door, garage, boards and races learn `{ id, name, kind }`; the lobby accepts game accounts next to hub people and guests; sign-in and sign-up page (own page, own `t()` texts); the garage works for them.
- **Done means:** a new account can sign up, sign in, drive in the lobby with a hub person and a guest at the same time, race, and appear on the boards with its name; a wrong password and an unknown name answer alike and take the same time; sessions end on sign-out and on block; the module has **no reference to Drift's game code** (a test that fails when the project reference or a namespace import appears); module tests run alone.
- **Not in this slice:** protection against abuse, deletion, admin (slices 2 to 4).

## Slice 2: protection of registration
- **What:** limits per address and day/week and a global hourly cap (`games_account_signup_log`, address key hashed with a server secret, rows older than 7 days removed); the **proof-of-work** challenge (`GET /games-account/api/challenge`, signed, 60 s, used once) and the worker in the sign-up page (Web Crypto SHA-256), difficulty rising with recent sign-ups; failed-login limiter per account and per address with the doubling wait; password rules (8 characters, common-password list); invitation links for friends (skip the puzzle, not the rules).
- **Done means:** a test script makes 1 000 sign-up attempts from one address and 1 000 from many fake addresses: the first is stopped after the limit, both are logged, the server stays responsive; the puzzle solves in about 1 s on this machine at the base difficulty (written down, also measured in the headless phone-sized browser); a challenge cannot be used twice or after 60 s; difficulty rises under load and falls back.
- **Written down in the doc:** what the puzzle does not stop.

## Slice 3: names and admin tools
- **What:** the name filter (word list file the administrator edits, folding of case, accents, lookalikes and repeats) at sign-up and name change; reports (a "report" action on a player in the lobby with a fixed reason; rows, no text); an admin page in the base's settings area: list of game accounts, reports, **block** (sessions end at once, the socket closes), **ban an address range** for a time, reset password (temporary, shown once, must change), delete an account.
- **Done means:** a filtered name is refused with one neutral text, lookalike variants too (table test); a report reaches the admin list; a block closes the live socket within the 30 s session check or at once through the hook; the admin actions are behind the base's admin role and are written to the audit log; nobody without the role reaches them (tests).

## Slice 4: emotes, delete, export, legal pages
- **What:** **emotes** (a fixed set of 10, as a small control frame over the existing text-peer path; shown over the car for 3 s; a rate limit per player; no free text anywhere, a test that no other string a client sends is shown to others); **delete my account** (password asked; cascade of account, sessions, garage, times, stats; name free after 30 days); **export my data** (one JSON download: name, garage, times, stats, created date); **privacy and imprint pages** with clearly marked placeholders for the owner's texts, linked from sign-up, footer and lobby; the sign-up page cannot be enabled while a placeholder is still in the text (a startup check says so).
- **Done means:** delete leaves no row with the account's id in any table (a test that walks the schema); export contains exactly what is stored and nothing of others; emotes from a modified client with any other payload are dropped and counted; the placeholder check fails loudly.

## Slice 5: collision and damage
- **What:** car-to-car contact in our own 2D code, one module used by the game and by the server's rules (`game/sim/contact.js` with a C# port and shared test vectors, as the drift score does): boxes or circle pairs, impulse on contact with a restitution and a cap, damage value from impact speed that costs grip and top speed a little and shows as a visual bend and smoke, repair on a pit zone or after a time; **who is authoritative:** each client simulates its own car and applies impulses it computes from the received other pose; the relay only accepts speed changes inside a bound after a contact (rules written and tested), so one player cannot launch another; a "ghosting" window after a respawn; contact can be off in time-trial.
- **Done means:** two scripted cars driven into each other on the test rig end up close to each other on both clients (numbers written down: position difference after contact, under 100 ms and under 300 ms delay); nothing sticks, nothing flies off the map, nobody can be pinned in a corner for more than a few seconds (a test with three cars); the relay still refuses speed or position jumps with no contact; the physics tests for single cars are unchanged and green; frame time with 12 cars in contact is written down.
- **Risk handled here:** rubber-banding is accepted over desync; the owner checks the feel.

## Slice 6: controller
- **What:** Gamepad API: left stick analog steering with deadzone and a response curve, triggers for throttle and brake, a button for the handbrake, buttons for reset, pause, emotes (d-pad); hot-plug; a hint screen showing the mapping; the existing keyboard and touch stay; the HUD shows the right glyph set (text, no logos).
- **Done means:** a scripted fake gamepad in the headless browser drives a lap; analog steering reaches the physics as a value in -1..1 like touch does; unplugging pauses; the mapping is in the doc.

## Slice 7: sound
- **What:** WebAudio, everything generated: engine (oscillators and filtered noise, pitch and gain from revs/speed/throttle), tyre squeal from slip, wind, bump on contact (from slice 5), emotes click; master volume and mute in the settings; audio starts after the first user gesture; a cheap path on phones (fewer voices).
- **Done means:** no sound file in the repository; mute persists; no sound before a click; CPU time of the audio per frame written down on desktop and phone-sized run; the sound of up to 12 cars is limited to the nearest 4.

## Slice 8: the first real car (S15) and the model path in the game
- **What:** when the pipeline delivers the S15 as `0.glb`/`0-hi.glb` after `docs/CAR-MODELS.md`: the game picks `game/assets/cars/<id>.glb` by car id with the code model as fallback (today only `?glb=`); check with `prepare_car.py`; the garage shows the model; load time and memory measured; the car's physics numbers stay as in `cars.json` (the S15 is an existing car id or a new one: the owner decides).
- **Done means:** the file passes the check script and the budget test; a missing or broken file still gives the code model; the phone loads it within a written-down time; no logo on the model.
- **Dependency:** the pipeline machine. If the file is late, 0.2 ships with the code models and this slice moves to 0.3 (the owner decides then).

## Slice 9: deployment, load test, backups, monitoring
- **What:** deployment on the owner's server through the usual tool (a Compose file without variables, OPS-02; the orchestrator does the release, the owner's yes); **load test at 100+ players** with `tools/loadgen.mjs` (extended with registration, contact and emotes) against a throwaway copy, numbers: players, bytes per second per player, tick time p95, CPU and memory, sockets; **backups** of the database (scheduled dump, kept N days, off the machine) and a **restore tried on a clean machine**; **monitoring**: an alive check, error counters (relay tick errors, rejected frames, sign-up refusals, bans) on an admin page, and log lines without personal data.
- **Done means:** the load test passes at 100 and the limit where it breaks is written down; the restore produced a working copy and the time it took is written down; the admin sees the counters; the owner can read what is stored about a person (privacy text input).

## Slice 10: security review and release check
- **What:** a review of everything new (accounts, proof of work, admin, emotes, contact rules, delete/export) like the earlier one (SEC and AUTH rules, CSP, cookies, rate limits, enumeration, injection, abuse by ramming), fixes, a last full test run (`scripts/test.sh`, `node --test game/`), `check-app.sh` for the base copy, the checklist of the owner's inputs (texts, address), STATE.md updated.
- **Done means:** no open finding; all tests green with the numbers written down; the owner has put in his privacy and imprint texts; the release is the orchestrator's with the owner's yes.

## What the owner has to bring
Privacy and imprint texts; the public address and the sign-in page's domain; the yes for each release step; a decision on contact strength and damage after he has felt it; his word on the S15 delivery date.

## What stays open
The exact limits per address are a first guess (tuned in slice 9). The proof of work is a speed bump, not a wall. Frame time on a real phone is not measured yet and must be before the release. Law and minors are the owner's.
