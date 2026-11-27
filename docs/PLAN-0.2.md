# Plan: steps 3 to 9 to the public start (draft)

Status: rewritten 2026-11-26 after the owner confirmed the vision ([VISION.md](VISION.md)) and the order ([ROADMAP.md](ROADMAP.md)). Accounts (the former slices 1 to 4) are built. One step at a time; each ends with tests green, small commits, STATE.md updated and a short report. Rules for every step: nothing private in the repository, texts through `t()` in German and English, failures as codes, no new runtime packages, no build step in the browser, numbers written down (frame time, triangles, draw calls, bytes per second).

## Step 3: the open world

**3a. The network for 32+ (first, independent of the look).**
- *What:* **interest areas** in the relay: a player gets the poses of the cars inside a radius around their own car every snapshot, and a **reduced-rate, reduced-size** update for the cars further away (a coarse position every fourth snapshot, no details), instead of everybody to everybody; the roster, names and join/leave stay global. The wire format of the existing frames is unchanged for what is sent; a client that knows nothing of the areas still works, it just sees fewer far cars. A load tool with **64 artificial drivers** (the existing `tools/loadgen.mjs` extended) and the numbers in STATE.md: bytes per second per player and in total at 8, 32 and 64, snapshot time on the server (p95), CPU, memory.
- *Done means:* with 64 drivers spread over the map, the bytes per second per player stay near the 32-player value of the old relay instead of doubling; a player still sees every car within the radius with no pop-in at the border (hysteresis); the checks of the relay (walls, speed, sequence) are untouched and their tests stay green; the website demo's relay compatibility is decided (below) and tested.
- *Risk:* a snapshot is built per player now (cost grows with players times neighbours): the grid must make it cheap; measure first.

**3b. The meeting point (after the owner approved the look).** A small world with mountain roads in the low-poly sunset look, with a collision map the relay knows (`SetGeometry`), spawn points, emotes already built. Simplified far drawing on the client. *Done means:* 32 drivers (the load tool plus real browsers) on the map, frame time on desktop and a mid phone written down.

## Step 4: tandem
Detection of two cars drifting side by side (distance, angle difference, speed) in shared code (`game/sim` with a C# port and shared test vectors like the drift score); the bonus while free driving; lead and chase roles; the tandem competition on a track (judged on both cars); a bot that follows and can be led, to practise. *Done means:* the detector passes vectors for clear cases and near-misses; a time-limited run with the bot gives a score; the server checks the claimed tandem bonus like it checks drift points.

## Step 5: challenges with stars; creative and story
Challenges as data (goal, stars thresholds, map), a progress table per account, Creative mode (everything free) as the default and Story as the second tab. *Done means:* the first ten challenges are playable and give 1 to 3 stars; progress is kept per account and deleted with it.

## Step 6: driving feel, controller, cameras
The assist switch (arcade default; fewer assists = the existing counter-steer and slip aids reduced), shown on the boards (a flag per time); Gamepad API (analog, deadzone, mapping screen); cameras: chase, bonnet, cockpit. *Done means:* both feel settings are in the physics tests (single-car physics otherwise unchanged); a fake gamepad drives a lap; every camera at phone size is looked at.

## Step 7: sound and music
WebAudio, generated: engine from revs, tyre squeal from slip, wind, bump; music as a few generated loops (own code, no files); volume and mute, starts after a click. *Done means:* no sound file; CPU of the audio per frame written down; at most four nearest cars have voices.

## Step 8: collision and damage
As in the earlier plan: contact in our own 2D code shared by client and server rules (`game/sim/contact.js` with a C# port and shared vectors), impulses bounded, a damage value that costs grip and shows, who is authoritative for a contact written down, a respawn grace window. *Done means:* scripted contacts end close on both clients (numbers under 100 ms and 300 ms delay); nothing sticks or flies; nobody can be pinned for more than a few seconds; the single-car physics tests are unchanged.

## Step 9: load test, review, legal texts, start
Load test with 32 and more real sockets and the limit written down; backups with a restore tried on a clean machine; monitoring (alive check, relay numbers, refusals, bans on an admin page); a review of everything new; the owner's privacy and imprint texts in (sign-up opens by itself); the release is the orchestrator's with the owner's yes.

## The relay and the website's demo

The relay is one class shared with the website's server. Proposal: **keep one class, add the interest areas as an option** (`RelayOptions.InterestRadius`, default 0 = off = today's behaviour); the website keeps its copy with the option off, so nothing changes there and the checks stay one code; the app turns it on. If the website later wants 32+ it copies the class again. The alternative (a separate class for the open world) doubles the checks that were reviewed; not recommended.

## What the owner brings
Approval of the look (pictures first), the texts for privacy and imprint, the public address, the GPU PC for the pipeline, a yes for each release.
