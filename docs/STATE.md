# State: where drift stands (hand-over page)

Updated 2026-11-25 (late) by the building session. Every session updates this page at the end of its work.

## Done

- **Scope agreed:** [SCOPE.md](SCOPE.md). **Architecture draft written:** [ARCHITECTURE.md](ARCHITECTURE.md) (waits for the orchestrator's reading and its 13 open points).
- **Milestone 1 (driving feels good, alone) runs**, no server, no base: `game/` is one static page. One car (Dart) on one map (the car park, also the future lobby map), drift model with fixed step 1/120 s, follow camera, keys (arrows or WASD, Space = handbrake, Shift = brake, R restart, F fullscreen, Q quality, P pause, G debug line) and touch buttons in landscape (steer left and right on the left, handbrake, brake and a big gas button on the right, multi-touch), drift score with chain multiplier, tyre smoke and skid marks, a "turn your phone" hint in portrait. English and German texts.
- Nothing is committed to GitHub; the repository is local; **no push**. The commits carry a placeholder author (`drift builder`, `builder@example.invalid`) because this machine has no git identity set for the repository; the owner or orchestrator should set one (and may rewrite the commits' author).

## The public shared world (demo), built 2026-11-25 on the orchestrator's go

Design: [ARCHITECTURE.md](ARCHITECTURE.md) section 10. Everyone on `game/demo.html` drives in one shared car park; no account, a server-picked name from a fixed list (colour word matches the car's colour), no free text anywhere; up to 16 cars per world, a second world opens when one is full; limits per address; idle visitors dropped after 2 minutes; nothing stored.

- **Relay:** `server/Relay/WorldRelay.cs` (one class, no sockets, no outside packages, `TimeProvider` and a tiny `IPeer`), `server/Relay/RelayEndpoint.cs` (80 lines: WebSocket bridge with origin check, bounded send queue, 15 Hz timer). **These two files are what the website's own .NET server takes**: `RelayEndpoint.Map(app, new WorldRelay(TimeProvider.System), "/ws", addressOf)`; behind a proxy `addressOf` must return the forwarded client address.
- **Client:** `game/net/world.js` (socket with back-off, frames, clock, interpolation; testable in node), `game/view/remotes.js` (other cars, wheels and blobs through the shared pool, smoke, HTML name labels for the nearest 8), `game/demo.html` (the same `main.js` with `data-mode="online"`: a counter "N driving here", "You are <name>", a tap-to-rejoin button when dropped or the world is full). Own models: all five cars still use the Dart body in the visitor's colour (the five cars differ in driving numbers only).
- **Try it:** `cd server && dotnet build -c Release`, then `dotnet server/bin/Release/net10.0/DriftServer.dll --port 8150 [--stats] [--test-limits]` and open `http://127.0.0.1:8150/` (serves the repository files plus `/ws`; `--stats` adds `/relay-stats`; `--test-limits` lifts the per-address limits for load tests from one address).
- **Tests:** `dotnet test server.tests` (19 tests: ids and names, roster, relay of poses, every check, the limits, second world, idle and silent drops, address limits, byte size per visitor) and `node --test game/` (now 26: adds the client frame and interpolation tests).
- **Tools:** `node tools/loadgen.mjs 16 30` (16 synthetic visitors, prints bytes and relay CPU), `node tools/crowd.mjs 3 14 name` (up to 3 headless browsers drive together, one picture).

**Numbers** (this machine, shared and busy; relay and clients on loopback):

| | 4 visitors | 16 visitors |
|---|---|---|
| upload per visitor (13-byte pose at 15 Hz + 6 B WebSocket header) | 275 B/s | 270 to 282 B/s |
| download per visitor (snapshots at 15 Hz + roster + welcome; 2 B header per frame) | 642 B/s | 2.85 KB/s |
| relay CPU (whole process, including the socket work) | not measured | **3.3 % of one core** (30 s run) |
| relay time per tick (snapshots for everybody) | 116 us | 74 to 162 us |

Per hour on a phone with 16 in the world: about 10 MB down, 1 MB up. With three real headless browsers driving together (software graphics): each saw the other two (roster 3, two cars drawn, labels shown for those in view), 15 to 24 frames a second came in, about 0.45 to 0.6 KB/s down and 0.1 KB/s up (a few visitors, and a headless page that sends poses only when its frames come, so lower than the 15 Hz of a real phone). Picture: `docs/screenshots/demo-crowd.png`.

**Not checked (demo):** a real phone, real networks (loss, jitter, a mobile connection that stalls), more than 16 real visitors and a real second world (covered by a unit test and by the load generator with 16 only), HTTPS and `wss://` behind the website's proxy and its content policy (`connect-src` must allow the socket; older Safari needs the host written out), Safari and Firefox, the interpolation by eye with real lag (only unit-tested), the relay under attack (the limits are unit-tested, not stress-tested), a restart of the relay while pages are open (the back-off is written, not tried), reduced motion, screen readers for the name labels (they are hidden from them on purpose).

## Cars and phone polish (after the website release of the shared world)

- **All five cars have their own model** (`game/view/carmodel.js`, built by code like the Dart): Dart coupe, **Pip** short tall hatchback with big round lights, **Bruno** long wide muscle car (bonnet scoop, twin stripes, fat rear arches, twin exhausts), **Marlin** wide hot hatch with a big wing, splitter and skirts, **Ox** tall pick-up (open bed, roll bar, bull bar). The wheel layout is the same on all (one instanced mesh for every car), each has its own shadow-blob size. Remote cars in the shared world are drawn with the model of the car id they announced in the join address, so **the relay frames are unchanged and the website's copy stays compatible** (only `game/` changed; `server/Relay/` is untouched).
- **Feel:** the numbers are the same except **Pip's agility 1.30 to 1.40** (more nervous turn-in). A new test (`the five cars differ in the way their names promise`) pins the character: Bruno quickest off the line, Ox slowest, Pip turns in fastest and the heavy ones slowest, Marlin holds the most sideways acceleration at a moderate steering angle and Ox the least. Finding while testing: at **full** steering lock every car is limited by the front tyres' falling curve, not by its grip number, so grip shows at moderate steering; this makes Marlin a car that rewards smooth steering.
- **Phone:** touch steering now builds up over about 0.3 s and comes back quickly (a tap is a small correction, a long press full lock; keys unchanged); a **first-time tip** above the buttons until the first gas; a **full-screen button** between the pads (also tries a landscape lock where the browser allows it). Camera unchanged. **None of this was tried on a real phone**: the ramp rate (3.4 per second), the button sizes and the tip text are guesses; only the headless two-finger run shows that the steering reaches full lock after about a second of holding (the headless page runs at a few frames a second).
- Tests: 27 node tests (new: the five cars). The .NET tests are unchanged (19).

## How to run and check

- Serve the **repository root** (the page imports `../vendor/`): `python3 -m http.server 8150`, then open `http://127.0.0.1:8150/game/index.html`. Options in the address: `?debug=1` (frame time, triangles, draw calls), `?tier=low|medium|high`, `?touch=1` (show touch buttons on a desktop), `?demo=orbit&t=6` (a bot drives a drift circle, `t` seconds are simulated before the first frame), `?car=0..4` (the five cars' numbers are in `game/data/cars.json`; only Dart has a model so far, the others drive with the same body), `?lang=de`.
- Tests: `node --test game/` (20 tests, no packages): physics, collisions, score, loop, map file, car numbers. The numbers of how the cars drive: `node tools/measure.mjs`.
- Play in headless Chromium and write numbers and a picture: `node tools/play.mjs <w> <h> <name> [--touch] [--tier=..] [--secs=8] [--dpr=2]` (software graphics; it picks its own free DevTools port and kills its browser). Single pictures: `chrome --headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --window-size=W,H --virtual-time-budget=15000 --screenshot=out.png "http://127.0.0.1:8150/game/index.html?tier=high&demo=orbit&t=6"`.
- The map JSON is written by `node tools/make-map.mjs`.

## Numbers

**Driving model** (`node tools/measure.mjs`, asphalt, 2026-11-25, node on this machine):

| car | 0-100 km/h | after 20 s | braking 100-0 | circle at 50 km/h | handbrake turn at 80 km/h, max slip | held drift (bot), asphalt / snow |
|---|---|---|---|---|---|---|
| Dart | 5.4 s | 114 km/h | 36 m | 32 m | 70 deg | 29 deg at 42 km/h / 29 deg at 41 |
| Pip | never (top about 100) | 100 | 36 m | 34 m | 88 deg (spins) | 29 deg at 47 / 29 deg at 32 |
| Bruno | 3.9 s | 127 | 36 m | 39 m | 43 deg | 29 deg at 55 / 36 deg at 45 |
| Marlin | 5.6 s | 116 | 36 m | 39 m | 66 deg | **no drift** (5 deg at 107 km/h) / 29 deg at 43 |
| Ox | never (top about 90) | 90 | 36 m | 27 m | 49 deg | 29 deg at 50 / 29 deg at 39 |

These are the **starting numbers, not tuned by a person**: the cars differ in the intended direction (Pip nervous and spinning, Bruno heavy and lazy, Marlin planted and hard to drift, Ox forgiving), but only a person driving can say whether they feel right. One physics step costs about 0.26 microseconds in node (2 million steps timed).

**Drawing** (headless, software graphics; totals per frame, from `renderer.info`): phone tier (lite parts) **6.8k triangles, 8 draw calls** (map 3.0k + 0.1k, car body 0.3k, lights 0.05k, four wheels 0.35k, shadow blob 20, skid ring 3k when full); desktop tier **16.3k triangles, 9 draw calls** (map 9.8k, car 1.5k, plus the shadow pass). Budget in ARCHITECTURE.md: 60k / 45 calls for a full lobby on a phone, so there is plenty of room for 15 other cars and a richer map.

**Load:** first load about **335 KB with Brotli** (three.js 306 KB, own code and data 29 KB; 2.1 MB raw), computed with node's Brotli on the files, not measured over a network.

**Frame time:** the JavaScript part (simulation, interpolation, scene update, submitting the frame) measured **0.4 to 3 ms per frame** in the headless run (quiet moments); this is CPU only. **There is no phone number**: the headless browser draws with a CPU renderer, and the machine was heavily used by other projects during the later runs (load average 19 to 39), so its frame rates (1 to 60 fps) say nothing about a phone. A quiet run at phone size drew 59 fps (low tier, 633x293 buffer) and 34 fps (medium, 1055x487), a desktop-size run with shadows 29 to 34 ms per frame, all in software.

## Not checked

- **A real phone** (frame rate, how the buttons feel under real thumbs, size of the buttons on small screens, notch and rounded-corner safe areas, whether the browser steals a gesture), tablets, **Safari** and iOS (no orientation lock there), Firefox.
- **How it feels** to drive: the model passes its tests and the bot drifts, but nobody has driven it with a keyboard or thumbs; the camera, the steering assist strength, the handbrake and the score numbers are guesses to be tuned by playing.
- The `?demo` and keyboard runs under load only proved that the page runs, that two-finger input reaches the model (gas + steer + handbrake, read back from the page) and that nothing logs an error.
- Other four cars have no own model (same Dart body, own numbers); no sound; `prefers-reduced-motion`, forced colours, screen readers beyond labels on the buttons.
- The hub's window (iframe or tab?) and full screen; the base's content policy has not been tried (no server yet), though the page has no inline script, no inline style attribute and no import map.

## Open points (from ARCHITECTURE.md, section 9)

13 points with proposals; the ones that block milestone 2 or 3: the guest door in the base (4), closing sockets when a session ends (5), where the game runs inside the hub (11), who sets a git identity.

## Next

Waits for the orchestrator's go: milestone 2 (the app around it: the base, accounts, garage). Not started: server, base, other maps and cars, lobby, races.
