# Roadmap to Drift 1.0 (draft, nothing built)

Status: **draft for the owner**, written 2026-11-25 on the orchestrator's brief. It changes what [SCOPE.md](SCOPE.md) calls out of scope (strangers, gamepads, tuning, damage), so **SCOPE.md is updated only after the owner says yes to this page**.

## Decisions of the owner this draft rests on

1. **Public for everyone**: open game accounts on the owner's website, the family comes in through the hub ([ACCOUNTS-GAMES.md](ACCOUNTS-GAMES.md)).
2. **Look**: realistic, recognisable cars (3D models from the outside pipeline, rules in [CAR-MODELS.md](CAR-MODELS.md)) in a stylised, clear world with good light. Details are decided on mockups, later.
3. **PC first** (keyboard and controller, best graphics); the phone runs along (lower tier, same game).
4. A small preview on the website (the website's own work).

## Where we are (end of Features 1 and the model path)

Driving, open lobby, races, five maps, five code-built cars, guests, garage, tuning sliders, boards, stats, shared world on the website; the model-file path with a test model. The cars are not final art, there is no collision between cars, no damage, no sound, no controller, no night, and registration is closed.

## Phases

Each phase ends with a release candidate the owner can play. A phase starts only on his yes; the order can change, the content of a phase moves between phases only with him.

### 0.2 Closed beta (family and friends)

- **Content:** the app runs on the owner's server (behind his reverse proxy); 1 to 2 **real car models** through the pipeline (the first one doubles as the test of the whole pipeline); **2 maps polished** (shape, surface, props, light); **car-to-car collision and damage in our own 2D code** (circles or boxes, impulse on contact, a damage value that costs grip or looks bent; the server judges it as it judges everything else); **controller** (Gamepad API: analog steering and triggers, deadzones, a hint screen); **sound** made in code: engine (pitch/gain from revs), tyre squeal from slip, wind, a bump (no sound files, nothing to license).
- **Done means:** six people drive at once for an evening without a restart; the cars do not stick or fly after contact (rules for what the relay accepts after a collision are written and tested); the controller is playable without the keyboard; sound can be muted and starts only after a click; frame time and bytes per second are written down for desktop and for a mid phone.
- **The owner checks:** how a car feels after the first real model; collision strength and damage look; whether sound is pleasant after an hour.
- **Risks:** collision under network delay (two clients disagree who hit whom): decide who is authoritative for contacts, accept a little rubber-banding rather than desync; the first model may need several rounds with the pipeline (budget in CAR-MODELS.md); the server is small, so the number of players per world is a number to measure.

### 0.3 All cars and visible tuning

- **Content:** all 14 cars of the list (real-car numbers for power, weight and grip, translated into the existing physics fields, never new physics rules); **tuning you can see**: body kits, wings, rims, ride height as swaps in the model (separate meshes or small files per part, slot `carbon` for the kit, `chrome` for rims) and the existing slider tuning; garage with a 3D view of the car and its parts.
- **Done means:** every car passes the model check script and the phone budget (15 000 triangles, 12 draw calls, 600 KB); a car with all parts is still inside the budget; each car is recognisably different to drive (lap times and drift scores of the same driver differ in the expected direction); old garage choices (car ids) keep working.
- **The owner checks:** every car by eye (silhouette, stance), the feel of three typical ones, names and licence proof for the model names (no logos until he confirms the licences cover them).
- **Risks:** 14 pipeline results will not all be clean: plan for hand fixing; parts that combine badly (a wing through a roof); download size of a garage with many parts (load only what is chosen); licence questions for names and shapes are the owner's to settle.

### 0.4 Maps and look

- **Content:** all maps to the new look: **light** (sun, shadows, reflections already vendored), **night** with headlamps and street light, **smoke, sparks and tyre marks** better and cheaper, fog and sky; a quality setting (auto from frame time, the existing tier idea, plus a manual one); the website preview can use a still or a short loop from here.
- **Done means:** one map in day and in night at the high tier at 60 fps on a mid desktop GPU and at 30 fps or better on a mid phone, numbers written down (frame time, draw calls, triangles); no new asset without source and licence in ASSETS.md.
- **The owner checks:** mockups first, then each map in each light; legibility of the track at night (a pretty map you cannot read is a bug).
- **Risks:** this is where the phone falls behind; the answer is a tier with fewer effects, not a second game; the look is a matter of taste, so decisions are taken on pictures before code.

### 0.5 Ready for the public

- **Registration with protection:** open registration for game accounts (name and password, ACCOUNTS-GAMES.md) with **limits per address and per day**, a **proof of work of our own** instead of somebody else's captcha (the browser solves a small puzzle that costs the server nothing, difficulty rises when many registrations come from one place), a **name filter** (plain word list the owner can edit, lookalike letters folded), **report and ban by the admin** (a report button on a player, an admin list, ban by account and by address range for a time), **no free text chat anywhere** (names are the only text; reactions are fixed emotes), texts for **privacy and imprint written by the owner** (we give drafts of what data is stored: name, password hash, times, no mail), **delete my account and export my data** in the app, a **load test** at 100+ players (tools/loadgen exists), **backups** with a restore that was actually tried, **monitoring** (alive check, error counts, relay numbers on a page the admin sees).
- **Done means:** a stranger can register, play and delete the account without help; a scripted attack on registration (1 000 attempts from one address) is stopped and logged; the load test passes with the numbers written down; a restore from a backup was run on a clean machine; a security review of everything new (like the earlier one) has no open finding.
- **The owner checks:** the privacy and imprint texts (his, not ours); the ban process on a dummy case; the cost of running it (bandwidth per player-hour, server load at 100).
- **Risks:** abuse is the real work of going public: names, cheating, harassment through driving (blocking, ramming); we limit with filter, reports, a mute/block per person, collision rules that do not let one player trap another, and a fast admin tool. Law (privacy, minors) is the owner's decision with advice, not ours. Server size: the relay is one process, so a second world is the first scaling step, not a cluster.

### 1.0 Launch

- **Content:** only what the earlier phases found: bug list at zero for the loop of play, the website preview live, a short "how to play" screen, release notes. **No new features in this phase.**
- **Done means:** one week of beta with outsiders without a data-losing bug or a ban case we could not handle; the numbers of 0.5 hold on the real server; the owner says go. Release, repository and deployment are the orchestrator's and need his yes.
- **The owner checks:** the whole thing as a newcomer on phone and PC.
- **Risks:** launch day traffic (see load test), first abuse wave (the admin tool must already be used by then), a bad first impression on the phone (test on at least two real phones, not only the software renderer we used so far).

## Ideas for 1.0 (proposal, the owner decides)

| Idea | Proposal | Why |
|---|---|---|
| **Ghost against your own best time** | **Yes**, 0.3 or 0.4 | Needs only the pose list of the best lap (the server already holds best times; add a replay of poses, about 15 kB a lap); makes time trial a game of its own; no network cost while driving. |
| **Photo mode / replay** | **Yes**, a small one in 0.4 (free camera, pause, hide HUD, a still of the screen); replay of the last 30 s afterwards | Fits PC first and the website preview; replay reuses the pose recording of the ghost. |
| **Scoring by angle, speed and line** | **Yes, but carefully** in 0.4: add "line" (distance to an ideal line per map) as a bonus on maps that have a centre loop | Angle and speed are already in the score; a line needs a reference per map, so only where the loop exists; the server's score check must change with it (shared test vectors). |
| **Weekly leaderboard** | **Yes** in 0.5 | Cheap (a week key on the existing boards), gives a reason to come back, resets limit the damage of one cheater. Needs the cheat limits on lap times to be tight first. |
| **Emotes instead of chat** | **Yes**, 0.2 | A fixed set of 8 to 12 icons or short lines in both languages over the car; no free text, so no moderation load; one more byte in the pose frame or a tiny control frame. |

Not proposed for 1.0: map editor, teams and championships, voice, tilt steering, spectating from outside the lobby, free text chat (SCOPE.md keeps them out).

## What must be decided before 0.2 starts

1. The owner's yes to this order (or his changes), then SCOPE.md and the first lines of STATE.md follow.
2. Who is the provider of game accounts (Drift or the website), because registration is built on that answer.
3. Hosting for the beta (the orchestrator's) and the size of the server.
4. Which car comes first through the pipeline, and when the pipeline machine is reachable.

## Not covered

No effort estimates (the pipeline and the owner's reviews decide the pace, not code), no costs, no legal text. Numbers for frame time on real phones are still unmeasured.
