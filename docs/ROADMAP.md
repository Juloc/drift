# Roadmap to Drift 1.0

Status: **owner's decisions of 2026-11-26 are built in** (no closed beta: straight to a public start). Nothing of this is built yet; the first release is planned slice by slice in [PLAN-0.2.md](PLAN-0.2.md). [SCOPE.md](SCOPE.md) points here.

## Decisions this rests on

1. **Public for everyone from the first release.** Open game accounts, the family through the hub.
2. **One "Juloc Games" account for all games**, provided by Drift as a separable module ([ACCOUNTS-GAMES.md](ACCOUNTS-GAMES.md)).
3. **Look:** realistic, recognisable cars (models from the outside pipeline, rules in [CAR-MODELS.md](CAR-MODELS.md)) in a stylised, clear world with good light; details on mockups, later.
4. **PC first** (keyboard and controller, best graphics); the phone runs along (lower tier, same game).
5. **Hosting:** the owner's small server through the usual deployment tool, public behind the reverse proxy (the address is the owner's). A small preview on his website is the website's own work.
6. **First real car: Silvia S15.** Until the pipeline delivers it, the code models are the cars.

## Where we are

Driving, open lobby, races, five maps, five code-built cars, guests, garage, tuning sliders, boards, stats, the shared world on the website, the model-file path with a test model. Missing for the public: accounts for strangers and everything that protects them, collision, damage, sound, controller, real cars, night, load numbers, backups.

## Phases

Each phase ends with a version the owner can play. A phase starts on his yes; content moves between phases only with him. Release, repository and deployment are the orchestrator's and need his yes.

### 0.2 Public start

**Content (in this order, details in PLAN-0.2.md):**
- The **Juloc Games account** module and its sign-in; the lobby accepts it next to hub people and guests.
- **Protection for open registration:** limits per address and day, proof of work of our own, name filter, report and block/ban by the administrator, **emotes only** (no free text), **delete account and export data**, **privacy and imprint pages with placeholders** for the owner's texts (the site cannot go live without them).
- **Collision and damage** in our own 2D code (shared by client and server rules).
- **Controller** (Gamepad API), **sound** made in code (engine, tyres, bump).
- **Cars:** the five code models; the **S15 as the first real car** as soon as the pipeline delivers it (a file in `game/assets/cars/`, fallback stays).
- **Operations:** load test at 100 and more players, backups with a restore that was tried, monitoring (alive check, error counts, relay numbers), deployment on the owner's server, a security review of everything new.

**Done means:** a stranger registers, plays and deletes the account without help; a scripted attack on registration (1 000 attempts from one address) is stopped and logged; the load test passes with numbers written down (players, bytes per second, tick time, memory); a restore from backup ran on a clean machine; cars in contact neither stick nor fly (rules for what the relay accepts after a contact are written and tested); the controller is playable without the keyboard; sound starts only after a click and can be muted; the security review has no open finding; the owner has put his privacy and imprint texts in; frame time and bytes per second are written down for desktop and a mid phone.

**The owner checks:** the privacy and imprint texts (his), the sign-up page as a stranger, the ban process on a dummy case, how contact and damage feel, sound after an hour, the cost of running it (bandwidth per player-hour, load at 100).

**Risks:** abuse is the real work of going public (names, cheating, harassment by ramming or blocking): filter, reports, collision rules that cannot trap a player, a fast admin tool; collision under network delay (who hit whom): one authority for contacts, accept a little rubber-banding rather than desync; law (privacy, minors) is the owner's decision with advice; the server is small and the relay is one process, so a second world is the first scaling step; the proof of work stops lazy scripts, not a determined attacker, and says so.

### 0.3 All cars, visible tuning, ghost

**Content:** all 14 cars of the list (real-car numbers translated into the existing physics fields, never new physics rules; no logos until the owner confirms the licences); **visible tuning** (body kits, wings, rims, ride height as swaps in the model, plus the slider tuning); garage with a 3D view; **ghost drive against your own best time** (the pose list of the best lap, about 15 kB, replayed as a see-through car; no network cost while driving).

**Done means:** every car passes the model check script and the phone budget (15 000 triangles, 12 draw calls, 600 KB); a car with all parts is inside the budget; each car is recognisably different to drive; old car ids keep working; the ghost matches the stored lap within a frame.

**The owner checks:** every car by eye (silhouette, stance), three typical ones by feel, model names and licence proof.

**Risks:** 14 pipeline results are not all clean (plan for hand fixing); parts that combine badly (a wing through a roof); garage download size (load only what is chosen); licence questions are the owner's.

### 0.4 Maps, look and photo mode

**Content:** all maps to the new look: light (sun, shadows, reflections), **night** with headlamps and street light, **smoke, sparks and tyre marks** better and cheaper, fog and sky; quality setting (auto from frame time plus manual); **photo mode** (free camera, pause, hide HUD, a still of the screen) and a **replay of the last 30 s** reusing the ghost's pose recording; a still or loop for the website preview.

**Done means:** one map in day and night at 60 fps on a mid desktop GPU and 30 fps or better on a mid phone, numbers written down; no asset without source and licence in ASSETS.md.

**The owner checks:** mockups first, then every map in every light; legibility of the track at night (a pretty map you cannot read is a bug).

**Risks:** the phone falls behind here: the answer is a tier with fewer effects, not a second game; taste decisions are taken on pictures before code.

### 0.5 Weekly board and polish

**Content:** **weekly leaderboard** (a week key on the existing boards; needs tight cheat limits on lap times), **scoring by line** as a bonus on maps with a centre loop (the server's score check and the shared test vectors change with it), bug list from the live weeks, balance of cars and maps from real numbers, accessibility (colour-blind safe HUD, remappable keys), loading and error screens.

**Done means:** the bug list for the loop of play is empty; numbers of 0.2 still hold on the real server; boards survive a reset of the week without losing all-time times.

**The owner checks:** the weekly board for fairness; a day of playing as a newcomer.

**Risks:** scoring by line needs a reference per map and can feel arbitrary; start with the maps where it is clear.

### 1.0 Launch

**Content:** only what the live phases found; a short "how to play" screen; release notes; the website preview live. **No new features.**

**Done means:** two weeks of public play without a data-losing bug or an abuse case we could not handle; the owner says go.

**The owner checks:** the whole thing as a newcomer on phone and PC.

**Risks:** traffic on launch day (the load test), the first abuse wave (the admin tool must already be in use), a weak first impression on the phone (test on two real phones, not only the software renderer used so far).

## Ideas for 1.0 and where they landed

| Idea | Decision |
|---|---|
| Ghost against your own best time | **Yes**, 0.3 |
| Photo mode / replay | **Yes**, 0.4 |
| Scoring by angle, speed and line | **Yes**, line only on maps with a centre loop, 0.5 |
| Weekly leaderboard | **Yes**, 0.5 |
| Emotes instead of chat | **Yes**, 0.2 (fixed set, no free text) |

Not for 1.0: map editor, teams and championships, voice, tilt steering, spectating from outside the lobby, free text chat.

## Open before 0.2 starts

1. The owner's yes to PLAN-0.2.md.
2. The domain of the sign-in page and the public address (the owner's).
3. The pipeline machine reachable for the S15 (the code models carry the release if it is late).

## Not covered

No effort estimates (the pipeline and the owner's reviews set the pace), no costs, no legal text. Frame time on real phones is still unmeasured.
