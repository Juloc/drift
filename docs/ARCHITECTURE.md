# Architecture (draft for the orchestrator)

Status: **draft, 2026-11-25**, written before any server code. Scope is [SCOPE.md](SCOPE.md) and wins over this page. Numbers marked *target* are promises to be checked; numbers marked *measured* come from a run and say where.

What shapes everything below, found in the two reference projects:

- The **base** is ASP.NET Core plus PostgreSQL (CODE-02: no packages beyond the platform, Npgsql, Argon2, JWT). WebSockets are part of the platform, so they cost no package. The browser side has **no build step, no npm, nothing from another origin** (CODE-06), and the content policy allows **no inline script and no inline style** (SEC-02). So: ES modules with relative imports (no import map, which is an inline script; the website's block world already does it this way), a stylesheet file, no `style=` attributes set from markup.
- Every request under `/api` needs a session (SEC-03), changes need `X-Base: 1` and a matching `Origin` (SEC-04). `SessionStore.ResolveAsync(token, rotate: false)` exists for "a WebSocket handshake", so the base already expects one.
- The **website** (`world-demo`) has the pattern for look and speed: three.js r186 vendored (306 KB Brotli), a `Builder` that merges many small primitives into one vertex-coloured geometry with baked corners, one clay material, a quality governor with a `low` tier for phones, 73k triangles for a whole town on the phone tier.

Layout of the repository (target):

```
game/            static page, no build: index.html, style.css, main.js
  sim/           PURE code, no DOM, no three.js: physics, score, map queries, camera rig maths, bot driver
  view/          three.js: scene, car and map models, HUD, input
  data/          cars.json, maps/NN-name.json  (read by the browser AND by the server)
  core/          Builder, bake, rng, clay material, quality governor (copied from the website, own code)
vendor/three/    three.js r186, README with source and hashes (also in ASSETS.md)
tools/           small node scripts that write map JSON
docs/ tests (node --test next to the code)
src/ base/       the server, from milestone 2
```

Anything in `game/sim/` must run unchanged in node (that is how it is tested) and in the browser (that is how it is played).

---

## 1. The driving model

**Two models live side by side since 2026-11-26** (design: `drift-mockups/DESIGN-PHYSIK-STRECKE.md`): the flat model described first (1.1: what every player drives until the owner flips the switch, and what the maps without a road of the track system always drive), and the model on the road's surface (1.3: hills, a new tyre; `?phys=1` or the menu's "Gefälle: an"). Both are `step(state, input, car, mu, dt, surf)` in `game/sim/physics.js`: with a surface the second one runs. The road itself is 1.2.

### 1.1 The flat model

A **2D top-down model** in metres and seconds; the third dimension is only drawing. Mass is 1, so forces are accelerations. One car = a point with a heading, between two axles (a "bicycle model": one front and one rear tyre), which is the smallest model that has slip angles, understeer and oversteer, and is the standard base of arcade drift games.

**State** (`CarState`, 8 numbers): position `x, z`; heading `h` (0 = +z, growing towards the car's right); velocity in the world `vx, vz`; yaw rate `w`; steering angle `steer` (the smoothed wheel angle); plus `slide` (0..1, how far the rear is sliding, for sound, smoke and score, derived, not an integrator).

**Input** (`Controls`, 4 numbers): `steer` -1..1, `throttle` 0..1, `brake` 0..1, `handbrake` 0 or 1. Touch gives only on/off, so the model smooths them, never the input layer.

**One step** (`step(car, input, defs, surface, dt)`, returns the next state, no hidden state):

1. Split the velocity into forward `vf` and sideways `vr` (to the right) in the car's frame.
2. **Steering wheel:** the player's lock is `maxLock * min(1.25, agility) / (1 + (|vf| / 40)^2)` with `maxLock = 0.55 rad` (less lock at speed); the wheels' mechanical limit is 0.75 rad. The wheel moves towards its target at 2.7 rad/s while the finger is on and at 5.4 when it comes off. **Counter-steer assist:** with `beta = atan2(vr, vf)` the body slip angle, the assist adds `0.9 * (|beta| - 0.12)` (in the sign of `beta`) and, while sliding, `-0.3 * w` (the swinging nose is caught), fading in between 3 and 8 m/s, and it may use the whole mechanical limit. **It gives way (to 30 %) while the player steers on purpose into the direction the car is turning**, so a driver who wants a big angle gets it, and hands off or counter-steering gets all of it. Constants in `K`.
3. **Slip angles** per axle: front `af = atan2(vr + a*w, max(|vf|, 2)) - steer*sign(vf)`; rear `ar = atan2(vr - b*w, max(|vf|, 2))`, with `a = b = 1.3 m` from the centre (the slip angle at low speed uses `max(|vf|, 2)`).
4. **Tyre force** per axle, as a share of the grip it has: `F = -grip * g * load * curve(alpha / alphaPeak)`. The `curve` rises linearly to 1 at the peak angle (`alphaPeak = 0.20 rad`, about 11 degrees), then **falls to `slide`** (the car's fifth number, 0.55 to 0.9) over the next 1.2 peaks and stays there. That falling edge is the whole drift: when the rear passes the peak it loses grip, the tail steps out, and the car holds a slide at a lower grip level until the angle comes back.
5. **Friction circle on the rear:** the engine's push `Fx` uses part of the rear grip; the lateral share is `sqrt(1 - (Fx / (grip*g*load))^2)` (a strict circle, `K.circle = 1`). Throttle in a corner therefore costs side grip: power oversteer, the way to start a drift without the handbrake.
6. **Handbrake:** the rear grip is multiplied by 0.2 while it is held, and the rear brakes with 0.6 g. The tail breaks away at once; letting go gives the grip back. **Footbrake:** 1.0 g split 65/35 front/rear (front-biased so braking in a turn understeers, not spins).
7. **Drive and drag:** `ax = throttle * power * (1 - (|vf| / top)^2)` (a soft top speed), reverse at 40 % when `vf < 0.5` and brake is held, rolling drag `0.05 * v`; the soft top speed uses the total speed, so a sliding car does not out-run `top`.
8. **Yaw:** `w' = (a*Ffront_lateral - b*Frear_lateral) / I - 1.6*w` with `I = 0.7 * a * b / agility` (the damping keeps it stable; below 3 m/s the tyre forces are blended out and a small viscous term is added, so a stopped car does not pivot or creep). *Found by tuning in milestone 1: a lower inertia and the yielding assist are what make a handbrake turn reach 40 to 80 degrees while a held drift stays catchable.*
9. **Surface:** the ground under the car gives `mu` (asphalt 1.0, wet 0.9, grass 0.7, sand 0.8, snow 0.6, ice 0.4); `grip` is multiplied by it, `slide` pulled towards 1 on loose ground.
10. **Walls:** the car is a circle of 1.0 m radius against wall segments and round obstacles; on a hit the position is pushed out, the normal part of the velocity is reflected at 25 %, and a little speed is lost. This is also how the lobby's borders hold.
11. Semi-implicit Euler: update velocities and yaw rate from forces, then positions from the new velocities.

**A car's character is five numbers** (`data/cars.json`, everything else is shared):

| number | meaning | typical range |
|---|---|---|
| `power` | acceleration at standstill, m/s² | 6 to 10 |
| `top` | soft top speed, m/s | 28 to 40 (100 to 145 km/h) |
| `grip` | lateral grip in g | 0.9 to 1.4 |
| `slide` | share of grip left once sliding | 0.55 (snaps, hard to hold) to 0.9 (lazy, long slides) |
| `agility` | steering lock and quickness together | 0.7 (heavy) to 1.3 (nervous) |

**Fixed time step.** The simulation always advances in `dt = 1/120 s`; the frame loop adds the real elapsed time to an accumulator and runs as many whole steps as fit (a cap of 0.1 s stops the "spiral of death" after a stall). The drawn car is interpolated between the last two states by the leftover fraction. Input is read when each step runs. Consequences: a 30 Hz and a 144 Hz device run the same steps; there is no `Math.random`, no `Date`, no `performance.now` inside `sim/`. *Honest limit:* the result is the same **in the sense of the same behaviour**, not bit for bit across engines (`Math.sin` may differ in the last digit between JavaScript engines). Nothing in the design needs bit-exactness: the server does not replay (see 3).

**Cost:** one step is a few dozen multiplications, *target* under 5 microseconds; 16 cars at 120 Hz is nothing. The server could run the same step for everyone, but it does not need to (see 3).

**Drift score** (`sim/score.js`, pure): a car is *drifting* when `|beta| > 0.26 rad` (15 degrees) and `|v| > 8 m/s` and no wall is touched. Points per second while drifting = `0.35 * |v| * (|beta| in degrees)^0.8`, times a **chain multiplier** that grows by 1 for every 2 s of unbroken drift (to x5) and is kept for 1.5 s after the drift ends (so linking two drifts counts as a chain). The points of a chain are *pending* while the chain lives and are *banked* when it ends cleanly; a wall hit or a spin (`|beta| > 1.9 rad`) loses the pending points. A short drift (about 3 s at 60 degrees angle and 25 m/s) is worth a few hundred points; the numbers are tuned in milestone 1 and then frozen, because the server recomputes them (3.6).

**Bots:** `sim/bot.js` is a small driver (steer towards a look-ahead point, brake before corners) used for tests and for the screenshots; it is not a game feature.

### 1.2 The road: one source of height (`game/sim/track.js`)

- A map of the track system carries `track` in its file: the road baked every 2 m (centre line, height, side tilt, half widths) from **control data** (`ctrl`, what an editor touches). `buildTrack` makes it inside the limits, `checkTrack` proves it, the generators (`tools/make-touge.mjs`, `tools/make-practice.mjs`) stop when it finds anything. `prepareMap` loads it as `map.surface`.
- `surfaceAt(track, x, z)` -> `{ y, gx, gz, s, lat, kind }` is the ONLY place a height comes from: the physics, the car's four wheel points (`sim/carpose.js`), the camera, smoke and marks, the look's field (`field.groundY`, `field.track`), the tools. Between the samples everything is one uniform cubic B-spline, so height and slope have no steps and no kinks; nothing is remembered between calls. `frameAt(track, s, lat)` gives the road frame (point, along, across, normal): rails (the physics walls are the same line, 6 m from the centre), gates, start slots and clipping points are placed in it.
- **The limits** (`LIMITS`; the sheet of `tools/trackcheck.mjs` lists the worst value of each): half width 3.5 to 7 m; centre radius at least 15 m, inner edge 9 m, rail line 6 m; a bend builds up over at least 12 m; grade at most 10 % (8 % in a bend), anywhere on the surface 12 %, along and across together 13 %; crests of at least 80 m radius and 0.30 g at the reference speed, dips 50 m and 0.50 g; side tilt up to 8 % into the bend, 2 % out of it, changing by at most 1 % in 5 m, four wheel points within 3 cm of a plane; two branches at least 18 m apart on the plan; the first 25 m out of the plaza level at the plaza's height; inside +-1500 m (the wire format).
- The touge today: 1999 m, 105 m down, eight hairpins of 21 m radius, 5.3 % everywhere, tilt up to 6.7 %.

### 1.3 The model on the surface ("2.5D", `stepSurface`)

The car's place stays `x, z, h` on the plan; its height is always the surface's (it cannot float, sink or jump; a crest makes it light, it never lifts off). New in the state: `y`, `nLoad` (wheel load in g), `tl`, `tq` (weight moved to the rear and to the right, filtered), `sr` (slip of the rear wheels), `fyF`, `fyR` (the axles' side forces), `ay`.

1. **The hill:** the slope pulls with `-G * gradient / (1 + gradient^2)` on the plan; the wheel load is `G / sqrt(1 + g^2) + v^2 * kv` (`kv`: the vertical curve along the way, from the slopes 1.5 m ahead and behind), kept between 0.25 and 1.8 g; nose-down the front carries more (`hcg / wheelbase` per unit of grade); under 0.5 m/s with no pedal (or the handbrake without gas) the tyres hold the car on the hill (the brake at a standstill stays the reverse gear).
2. **The weight moves with time:** `tl` follows the car's own acceleration along over 0.12 s, `tq` across over 0.10 s; an axle carries its share of the load (at least 15 %), and side grip falls with the weight moved across (`kLoad`).
3. **One tyre force for both directions (the rear):** slip along is the wheel's own slip `sr / srPeak`, slip across is `tan(alpha) / tan(alphaPeak)`; together they give the size on the same tyre curve as before (rises to the peak, falls to `slide`), and the force points where the tyre slips (along it pulls 1.35 times as hard as across). More gas turns the force forwards and takes side force away: **the pedal sets the angle**, from about 20 degrees up to about 40.
4. **The rear wheels' slip** follows the engine and the brake against what the tyre gives (`kSpin`), and slows again beyond the peak (`relax`). **The handbrake locks the rear wheels** (`sr` to -1): the force points against the slide. A braked or locked wheel's slip shrinks with the speed below 2 m/s: it stops the car and never pushes it back.
5. **The front tyre** is measured and works across the STEERED wheel (turned far, its side force also drags); braking takes side grip away (a circle). While the car grips the wheel is not turned far past the tyre's best angle (keys and thumbs give all or nothing); in a slide the whole wheel is free. The counter-steer aid is the flat model's.
6. **A side force builds up over 0.4 m** of travel (and with time at a crawl): no pivoting on the spot. A force that would push along the slip (after a knock) is dropped: **a tyre only takes energy out** (a million random steps: under 0.001 J/kg in a step).
7. **The turn:** as before with more swing (`K2.inertia` 1.1, `yawDamp` 1.2), so a slide carries over when the wheel goes the other way.

Arcade and Pro change numbers only (`feel.js`): Pro has a third of the counter-steer aid, 60 % of the yaw damping and wheels that spin up 1.2 times as fast. The cars' five numbers are the same for both models.

**The server** needs none of it: no new byte on the wire (the height follows from `x, z` and the map file), the relay's speed check holds downhill (no car passes 1.1 times its top speed on the steepest surface a road may have; a test on each side), the walls are the map's. Pages say which road they drive (`{t:"hello", road}`: a page on another road is told to `reload`) and which physics (`{t:"phys", v}`); **bests are kept apart** by it (`drift_best_time.ver`: 1 the old road, 2 a track-system road with the flat model, 3 with the hills; `RaceTrack.Board`).

### 1.4 What proves it

`tools/trackcheck.mjs` (the road against every limit, with the sheet), `tools/drivecheck.mjs` (a clean and a drifting driver, `sim/trackbot.js`, down the whole road with every car on the surface model: walls, the angle in each hairpin, wheel load, wheel points, the body's and the camera's movement), `tools/playcheck.mjs` (the real page; it runs the other two first). Node tests: `track.test.mjs`, `slope.test.mjs`, `drift.test.mjs`, `trackbot.test.mjs`. `tools/measure.mjs` (`PHYS=1` for the surface model) prints the table of how each car drives.

## 2. Look and budget on a phone

- **three.js r186, vendored** exactly as on the website (same four files, same hashes, `vendor/three/README.md` and `docs/ASSETS.md` before the first commit of them). Imports are relative (`../vendor/three/three.module.js`), the page has no inline script, so the base's content policy holds.
- **Own models, built by code** with the website's `Builder` (rounded boxes, cylinders, blobs, merged into few geometries, vertex colours with jitter, corners darkened by the bake, one matte clay material). Copied into `game/core/` with relative imports. Models are functions `(Builder) => dimensions`, one file per car and per map prop.
- **Draw calls and triangles** (*targets*, per frame, whole scene):

| | phone tier | desktop tier |
|---|---|---|
| map, static (ground + road, walls and props, buildings, water or sky dome) | at most 5 calls, 30k triangles | 8 calls, 60k |
| one car (paint in the person's colour, the rest; the four wheels of all cars are **one** instanced mesh, the shadow blobs of all cars one more) | 2 calls, 1.5k triangles | 2 calls, 3k |
| 16 cars at once | 33 calls, 24k | 33 calls, 48k |
| smoke and sparks (one instanced quad mesh, 256 quads) | 1 call, 0.5k | 1 call, 0.5k |
| **total, full lobby** | **at most 45 calls, 60k triangles** | **at most 60 calls, 120k** |

Names above cars are **HTML labels** moved with `transform` (no draw calls, crisp text, text set with `textContent`, only the nearest 8 shown). 120k is the website's own phone ceiling.
- **Phone tier** (`core/quality.js`, same governor as the website): no shadow pass (the shadow is a dark blob under each car, instanced), no blur, no antialiasing, `devicePixelRatio` capped at 1.5, render scale 0.7 to 1.0 chosen by the measured frame time; desktop tier gets a shadow map for the sun that follows the player's car (1024) and the website's soft top and bottom blur, **off while racing** if it costs frame time (the blur helps a miniature, hurts a fast game).
- **Frame budget** (*target* on a mid phone, landscape): 60 fps = 16.6 ms; JavaScript per frame at most 3 ms (physics 0.1 ms, interpolation of others 0.2 ms, scene update 1 ms), the rest is the GPU; the governor lowers the render scale when the average goes over 22 ms.
- **First load** *target* under 700 KB Brotli (three.js 306 KB, own code under 60 KB, maps JSON under 20 KB each, models are built by code, so no model files); a service worker is the base's job (SEC-08: static shell only).
- Camera: a spring camera behind the car, looking along a blend of the heading and the velocity, so the slide stays on screen; the field of view opens from 55 to 68 degrees with speed.
- **Night** (harbour) is cheap: dark sky colours, bright vertex colours (the `glow` helper) on lamps, no real lights.
- Not in 1.0: engine sound (an idea), real lights, reflections.

## 3. The network: lobby and races

**Transport:** one WebSocket per player to `/api/ws`, same origin, **never without a session**: the handshake is an ordinary GET, the server reads the session cookie (`ResolveAsync(token, rotate: false)`), checks `Origin` against the host itself (a WebSocket is not covered by the `X-Base` rule), and refuses with 401 if there is no valid person. Cookie `SameSite=Strict` already stops other sites from using it. A guest comes in through its own door with its own cookie (5). While a socket is open the server checks the session again every 60 s and on every logout it hears of, and closes the socket with a code when the session is gone (blocked, signed out, guest link ended). One socket per person: a second one replaces the first.

**Two kinds of frames:**

- **Binary, fixed layout, for positions** (below): small and cheap to parse.
- **JSON text, for everything rare** (hello, lobby list, invitation, join, countdown, results, quick reactions, corrections): easy to read and change; at most a few per minute per player. Messages are small, size-limited (4 KB), rate-limited.

**What a client sends** (`POSE`, 14 bytes): `type u8, seq u8, x i16 (1/20 m), z i16, h u16 (2π/65536), vf i16 (1/50 m/s), beta i8 (π/128 per unit), steer i8, flags u8` (bit 0 handbrake, bit 1 drifting, bit 2 on grass or loose ground, bit 3 hit something, bit 4 reverse). Position uses 1/20 m in `i16` (±1638 m), enough for maps up to about 600 m across, 5 cm resolution. Total 14 bytes plus 6 bytes of WebSocket frame header (client frames are masked: 2 + 4) = **20 bytes per message**.
**Rate:** 20 per second while moving, 2 per second while standing still, 0 while the tab is hidden (the car is parked in place; after 30 s hidden the player leaves the lobby). A client never queues old poses: if `bufferedAmount` is above 4 KB, it skips the send (the newest pose is all that matters).
**Up: 20 × 20 = 400 B/s, i.e. 0.4 KB/s per player.**

**What the server sends** (`SNAPSHOT`): `type u8, count u8, serverTime u16 (ms, wraps)` then per player `id u8` and the same 12 pose bytes (without type and seq) = 13 B. The server keeps only the newest pose per player and sends a snapshot of all players in the same room to everyone at **20 Hz**; a client is never sent its own car. Down per player with N players in the room: `(4 + 13 × (N - 1)) × 20 + 2 × 20` B/s: **N = 4: 0.9 KB/s, N = 8: 1.9 KB/s, N = 16: 4.0 KB/s**. Server total with 16 players: 16 × 4.0 = 64 KB/s out, 6 KB/s in, 320 messages/s in and out, trivial for the server. On a phone, 4 KB/s is 14 MB/hour at the worst case (16 players), 4 MB/hour with four friends; both are fine for a plan, and it is **written down so the owner can judge**.
**How many players:** **lobby up to 16**, **race up to 8** (grid slots of the map). 16 is what 4 KB/s and 33 draw calls were sized for, not a hard physical limit.

**Interpolation of others.** Each remote car has a buffer of its last ~6 snapshots with their server times. The client draws every remote car at `serverNow - 100 ms` (two snapshot intervals): it finds the two snapshots around that time and interpolates position with a cubic Hermite spline (the velocity comes from `vf`, `h` and `beta`), heading and steering linearly with angle wrap. If the buffer runs dry (a stall) it extrapolates along the last velocity for at most 250 ms, then holds still. The clock: every snapshot carries `serverTime`; the client keeps `offset = serverTime - localTime`, takes the **smallest** observed value over the last 10 s (least delayed packet), plus a ping/pong every 5 s for the number shown in the debug line. The 100 ms delay is a constant and a setting for the debug page. Others therefore look about 100 ms plus the network delay late, which nobody can see because everyone is late the same way and there are no car-to-car collisions (see below).
Your own car is never interpolated: it is driven locally with zero delay (the point of a client-driven game).

**Who decides what:**

| thing | decided by | why |
|---|---|---|
| where your own car is, how it moves | **your client** (it runs the physics) | zero delay, no prediction code, the feel of milestone 1 stays |
| whether a pose is possible | **server** (checks, below) | the cheap protection |
| the start, the countdown, who is on the grid | **server** | one clock for everybody |
| checkpoints passed, laps, finish time, positions, the race result | **server** (from the validated poses) | the result must not be claimed by a client |
| drift points in the result | **server**, recomputed from `beta` and `vf` in the poses with the same formula as the client (see test vectors below) | the client shows a live number, the server's is the one that counts |
| best times per map | **server** | same |
| collisions between cars | **nobody: cars pass through each other** | see open point 3 |

**What the server checks (and what it does not).** For every pose, against the player's previous accepted pose:

1. **Rate:** at most 30 per second per socket (more are dropped), `seq` must increase (u8, wrap-aware).
2. **Bounds:** inside the map's outer polygon (`data/maps/*.json`, the same file the client loads). A pose outside is refused.
3. **Speed:** `vf` at most `1.15 * top(car) + 2`; the speed *implied* by the movement, `|dpos| / dt`, at most `1.25 * top + 3`, where `dt` is the server's own receive time but with a **budget**: allowed distance accumulates with server time up to a cap of 0.5 s of movement, so a burst after a lag does not flag an honest player.
4. **Jumps:** no teleports: one pose may not be further away than the budget; a car may not turn faster than 12 rad/s (heading change per pose).
5. **Walls:** the line from the last pose to this one must not cross any wall segment of the map (about 100 segments, a few hundred multiplications).
6. **Pose consistent with itself:** reported `vf` and the implied movement along `h` must agree within 40 %.
7. **Race:** gates are crossed **in order** (a segment test between consecutive poses against each gate's two end points, the crossing time interpolated, so times have about 10 ms resolution although poses come every 50 ms); a lap shorter than `lapLength / (1.15 * top)` is physically impossible and is refused (not stored, not shown as a best); progress along the track (for positions) is the nearest point on the sampled centreline in a window ahead of the last known index, so it cannot jump around.
8. **Drift points:** recomputed, capped at 3x the rate a perfect drift can earn; the sum shown in the result is the server's.

On a violation the server sends `{"t":"fix","x":..,"z":..,"h":..}` with the last accepted pose; the client puts the car there and zeroes its speed (a rubber band the honest player almost never feels). More than 5 fixes in 10 s: out of the room; in a race: disqualified.

**Why this is enough for friends.** Nothing is won outside the group: no ranking against strangers, no money, no account that unlocks things, only a short best-time list among people who know each other. The checks stop the casual and the accidental (a console `car.x = 1e5`, a speed hack, a script that jumps over the finish line, a glitchy client) and keep one broken device from showing a car flying through the others. They do **not** stop a determined cheater who drives a perfect line with a bot or speeds up by 10 %, and nothing short of a server-side simulation would: that needs the client's inputs, a physics that is **bit-identical in JavaScript and C#** (it is not: chaotic drift amplifies a last-digit difference), prediction and reconciliation on the client (the car would no longer feel like milestone 1) and a physics port. SCOPE rule 1 says not to do that unless it is cheap; the step itself is cheap, the rest is not, so **1.0 does not**. If a cheater ever shows up in the group, the owner knows who it is: every name is a person or a link he made.

**Test vectors:** `tests/vectors/drift-score.json` (inputs → points) is read by the JavaScript tests and by the C# tests, so the two implementations of the score cannot drift apart. Same file idea for the gate-crossing and wall tests.

**Where it runs:** one `GameHub` singleton in the app process (a dictionary of rooms, each with its players and a 20 Hz timer: `PeriodicTimer`), no database in the hot path. **A restart ends the lobby for a moment** (clients reconnect with a back-off of 1, 2, 4, 8 s and appear again; a race in progress is lost, which is acceptable and said in the docs). One instance only; scaling out is not a goal. Code takes the time from `TimeProvider` (CODE-05), the tick can be driven by a test.

**Content policy:** `connect-src 'self'` covers a same-origin `wss://` in current browsers; older Safari versions need the host written out. To be checked in milestone 3 (not on this machine).

## 4. Lobby and race flow

Rooms: **`lobby`** (always exists, one map: the lobby map) and **`race-<n>`** (made on demand). A player is in exactly one room. All rooms use the same pose frames.

**States of a race** (server, per race):

```
LOBBY: nothing pending
  -- anyone presses "Start a race" and picks a map and laps (1 to 5, default 3; 1 lap = a sprint)
INVITE (10 s)       the lobby gets an invitation (map, laps, who started it, [Join] [Not now]);
                    the starter is in; at most 8 join; it ends early once everybody present
                    has answered, and with at least 2 joined (1 is allowed for a time trial of the starter alone, a start button "Go alone")
GRID (loading, up to 10 s)   joined players move to race-<n>, load the map (already cached after the first time),
                    sit on their grid slot (the server fixes slot and heading), controls locked; they say "ready"
COUNTDOWN (3 s)     the server picks a start time T = now + 3.5 s and sends it with the grid; clients show 3, 2, 1, GO by
                    their own offset-corrected clocks; poses before T that show movement are refused
RACING              poses flow; gates, laps and positions are computed by the server and sent as small JSON updates (1 per second plus on every change: lap, position)
FINISHING           when the first player finishes, the others have 20 s (or until all are through)
RESULT (15 s)       the table: position, name, race time, best lap, drift points, points; best times updated and marked "new best"
                    then everybody (also DNF) goes back to the lobby by itself ([Back now] possible)
```

- **Points per race:** position points 10, 7, 5, 4, 3, 2, 1, 1 plus the drift points divided by 100. Both columns are shown; the first column decides the winner. DNF (left, disconnected, disqualified): 0 position points, drift points kept.
- **One pending or running race at a time** in 1.0 (one room is enough for 16 friends); a 20 s pause after a result before the next invitation; the lobby shows "a race is on, 5 of 8 racing" and the join stays closed after the invitation time.
- **Late joiners** in the lobby during a race wait in the lobby (the race-room's cars are not visible in the lobby: separate rooms). **Spectating is out of scope.**
- **Leaving** a race = DNF; the player goes to the lobby.
- **Best times per map:** per person and map, one best lap and one best race time (by laps); the lobby's board shows the 5 best of the chosen map; a time is written only if the race was finished and it passed the plausibility check (3.7). Guests' times are shown in the result but **not stored** (see 5).
- Quick reactions in the lobby (a few emoji-like words, 1 per 2 s per player) are a JSON message; there is no free chat.

**As built, the checks (after the security review of 2026-11-26):** the relay checks rate, frame size, a frame number that must be newer (wrapping at 256), the bounds (a **rectangle**; all five maps are rectangles, so a polygon would change nothing today), forward speed, jumps against a movement budget, spin, a claimed speed the car did not move at, and, when the map is given to it (`SetGeometry`: the lobby and every race), **walls and round obstacles on the way between two poses** (a shortcut through them is refused like a jump). The server's drift points use the speed the car really moved at (capped by the car's top speed) and an angle of at most 80 degrees, and at most 2500 points a second. Not built: a check of the pose against the ground (a car on the wrong side of a thin wall is caught only by the line between two poses), punishing a false start, a total timeout on a database that hangs while the result is made.

**As built (milestone 3):** the race socket is a second WebSocket (`/api/play/race/ws`) next to the lobby's; the control messages are JSON text frames on both (`race.start`, `race.join`, `race.decline`, `race.invite`, `race.go`, then `grid`, `count`, `go`, `prog`, `lap`, `finish`, `result`, `back`, and `leave` from the client); the grid stands after the start line and a lap ends when gate 0 is crossed again; gates are 8 segments in the map file; the 10 s of the invitation and the other times are constants in `RaceHub.cs`. Drift points: server and browser share `tests/vectors/drift-score.json`.

## 5. Guests

- **The link** is made by an administrator (the owner) in the app: *Make a guest link* with **hours valid** (default 4, at most 12) and **uses** (default 5, at most 20); the page shows the URL **once**. The URL is `/g#<token>`: 256 random bits in the **fragment** (so no server log sees it, as for the base's invitation link, AUTH-11); the server stores only SHA-256; at most 5 links valid at once.
- **Redeeming:** the page reads the fragment and posts it to `/api/guest/join` together with a **name** (2 to 16 characters, letters, digits, space, dash, underscore; the same text rules as for accounts, shown only through `textContent`). The server checks hash, expiry, remaining uses, rate (10 tries per minute per address), then makes a **guest session**: its own random 256-bit value in its own cookie (`__Host-drift-guest`, `HttpOnly`, `SameSite=Strict`, `Secure`), SHA-256 stored, ends when the link expires. The guest then has the game page and nothing else.
- **What a guest is allowed:** the lobby, the race flow, the garage **without** choice (the first car, a colour picked at random from the palette), the best-times board **read only**. **No** settings, no account pages, no hub, no guest-made links, no storage of times.
- **How it fits the base:** the base's guard demands a base session for everything under `/api` (SEC-03). A guest has none, so the guest endpoints are an **own door** (SEC-07) on `/api/guest/` with a required check that validates the guest cookie, and **the game socket is `/api/guest/ws`** for guests, the same `GameHub` behind both (`Player` = `{ id, name, kind: account|guest, carId, colour }`). The door's check reads its own cookie only, never the base session cookie. **This is a question for the base:** a door check may read a cookie and a WebSocket upgrade may run under a door (see open point 4). If not, the alternative is a guest as a real `users` row with a role `guest`, no password and an expiry, which needs a change in the base's `Valid` rule (TOTP confirmed).
- **End all at once:** one button (administrator only) sets `revoked_at` on every link, deletes every guest session and tells the hub to close all guest sockets; the lobby shows them gone within a second. A guest whose link expires is closed at the next 60 s check.
- A guest has no history: closing the tab ends the person; using the same link again makes a new guest.

## 6. The data (plain SQL, numbered scripts)

People, sessions, roles are the base's tables. This app adds four small tables in its own migration set (DATA-02), every statement parameterised, every row of a person read together with its owner (DATA-03):

```sql
-- 100_drift_profile.sql: what a person chose in the garage
create table drift_profile (
  user_id  uuid primary key references users(id) on delete cascade,
  car_id   smallint not null default 0 check (car_id between 0 and 15),
  colour   smallint not null default 200 check (colour between 0 and 359),  -- a hue; the palette fixes saturation and lightness
  nick     text check (nick is null or char_length(nick) between 2 and 16)  -- null = the account's name
);

-- 101_drift_best_times.sql
create table drift_best_time (
  map_id   smallint not null,
  user_id  uuid     not null references users(id) on delete cascade,
  kind     smallint not null check (kind in (0, 1)),   -- 0 = best lap, 1 = best race (map's standard laps only)
  ms       integer  not null check (ms > 0),
  car_id   smallint not null,
  set_at   timestamptz not null,
  primary key (map_id, user_id, kind)
);
create index drift_best_time_board on drift_best_time (map_id, kind, ms);

-- 102_drift_guest.sql
create table drift_guest_link (
  id         uuid primary key,
  hash       bytea not null unique,            -- SHA-256 of the token
  created_by uuid  not null references users(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  max_uses   smallint not null check (max_uses between 1 and 20),
  uses       smallint not null default 0,
  revoked_at timestamptz
);
create table drift_guest_session (
  id         uuid primary key,
  hash       bytea not null unique,
  link_id    uuid  not null references drift_guest_link(id) on delete cascade,
  name       text  not null check (char_length(name) between 2 and 16),
  created_at timestamptz not null,
  expires_at timestamptz not null
);
```

**Cars and maps are not tables:** they are `data/cars.json` and `data/maps/NN-name.json`, shipped with the page and read by the server from the same files, so the client's drawing and the server's checks cannot disagree. Ids are small integers that never change meaning (a retired map keeps its id). A map file holds: `id, name, laps, surfaces` (zones with their ground type), `bounds` (outer polygon), `walls` (segments), `obstacles` (circles), `centre` (the sampled closed centreline, so the server does not need the spline), `halfWidth`, `gates` (pairs of end points; gate 0 is start/finish), `grid` (slots with position and heading), `lobbySpawn`, `props` (what to draw, by type and place, drawn only on the client), `sky` and `light` colours. A script in `tools/` writes the file from a compact description; the JSON is committed.

Quick reactions, positions, races in progress and the lobby's members live **in memory only** (a restart empties them on purpose, see 3). Race history is not stored in 1.0 (an idea).

## 7. Five maps and five cars

Maps (physics is flat; hills are only drawn, never under the road). Each is a closed loop with gates so it can host a race.

1. **Car park** (also the **lobby**): a big flat open space, painted bays, light poles, shopping trolleys, a few concrete islands; wide, forgiving, `asphalt`. Race: a tight figure-of-eight between the islands, about 450 m, 3 laps in a minute and a half. Character: open and friendly, where you learn.
2. **Harbour at night**: quays, containers, cranes, bollards, dark water as a wall; `wet` asphalt (0.9), glowing lamps. A fast loop of about 900 m with two long sweepers and a hairpin at the pier. Character: speed and one scary corner.
3. **Mountain pass**: a narrow switchback road with guard rails and a rock wall; asphalt, dry; about 1100 m, half-width 5 m. Character: counter-steer, chains of linked drifts, no room for mistakes.
4. **Desert**: a broad dusty loop of `sand` (0.8) with a darker, grippier asphalt patch; dunes and rocks (round obstacles); about 1300 m. Character: long, lazy slides.
5. **Winter track**: pine forest, snow banks (soft walls), a loop on `snow` (0.6) with `ice` patches (0.4); about 800 m. Character: a car that barely grips, where throttle control matters more than steering.

Cars (names are made up; none is a real model):

| id | name | `power` | `top` | `grip` | `slide` | `agility` | feel |
|---|---|---|---|---|---|---|---|
| 0 | **Dart** (rear-drive coupe, the starter) | 8.5 | 35 | 1.15 | 0.72 | 1.05 | balanced, enters a drift willingly and holds it |
| 1 | **Pip** (light hatchback) | 7.0 | 31 | 1.10 | 0.62 | 1.40 | nervous, turns in at once, flicks the tail, spins if careless |
| 2 | **Bruno** (heavy muscle car) | 10.0 | 39 | 1.00 | 0.82 | 0.75 | lazy, huge power, long drawn-out slides, slow to turn |
| 3 | **Marlin** (grippy hot hatch) | 8.0 | 36 | 1.35 | 0.55 | 1.00 | fast and planted, then lets go suddenly: hard to drift, great to race |
| 4 | **Ox** (heavy pick-up) | 6.0 | 28 | 0.95 | 0.90 | 0.70 | slow, wallowing, forgives everything, loves sand and snow |

These numbers are the **starting guess**; milestone 1 plays with Dart and writes down what the real numbers are (0 to 100 km/h time, top speed, smallest circle, angle of a handbrake turn).

## 8. What is tested and what only playing shows

**Automatic** (`node --test`, no packages; later `dotnet test` in the base's way):

- *The physics as pure functions (`sim/`):* at rest stays at rest; straight throttle reaches but never passes `top`; no sideways drift when going straight; steering right turns right (sign), and the turning circle matches the grip (lateral acceleration never above `grip * mu * g`, 5 % slack); handbrake produces a body slip angle above the drift threshold; `slide` changes how long the angle holds; the same inputs give the same states (determinism) and a different frame rate does not change the result (run with the accumulator at 30, 60 and 144 fps); a million random inputs never give `NaN`, a speed over `1.5 * top`, or a position outside the map; wall hits push out and never let a car through; surface lookup; score: thresholds, chain, bank and loss, the test vectors.
- *The server's checks (milestone 3):* every rule of 3 as a test with a passing and a failing pose sequence; a speed burst after a pause; a lap that is too fast; gates out of order; wall crossing; the guest link's life (expiry, uses, revoke); a WebSocket without a session or from another origin is refused.
- *Map files:* each loads, its `centre` is closed, its gates sit on the centre, the grid is inside the bounds, `lobbySpawn` is on the surface.

**Only playing shows:** how it **feels** (the numbers above are a guess until a person drives them), whether the camera shows the slide, whether the touch buttons are comfortable for a thumb and the screen size of the real phone, frame time on a real phone, the look in the sun and at night, interpolation of others over a real mobile network, how a race with eight feels. These are written in STATE.md under "not checked" until someone has done them; the headless browser with software graphics proves that the page runs and what it draws, **not** how fast it runs on a phone.

## 9. Milestone 1 in detail, and open points

### Milestone 1: driving feels good, alone (no server, no base)

**Done when** (SCOPE) one car on one map drives well with touch and keys, the camera follows, the drift score shows, and the frame time is written down.

Files: `game/index.html` (canvas, HUD, touch buttons, no inline script), `game/style.css`, `game/main.js`, `game/sim/{physics,score,map,bot}.js`, `game/view/{scene,car,mapview,hud,input,camera}.js`, `game/core/*`, `game/data/{cars.json,maps/01-car-park.json}`, `vendor/three/`, `tools/make-map.mjs`, tests next to `sim/`, `docs/ASSETS.md`, pictures in `docs/screenshots/`.

Content:

- **Map:** the car park (open space with islands, walls at the border, a few obstacles) with its race loop painted on it, enough to drive in circles, chain drifts and find the walls.
- **Car:** Dart, built by code, about 1.5k triangles on the phone tier, wheels that turn and steer, body that rolls a little, a shadow blob; tyre smoke and a short skid mark trail while sliding (one instanced mesh each).
- **Drive:** the model of 1, fixed step 1/120.
- **Camera:** spring camera as in 2.
- **Controls:** keys (arrows or WASD, space = handbrake, shift/S = brake, R = back to the start, F = fullscreen, P = pause, Q = quality); touch in landscape: **left thumb** steer left / right, **right thumb** throttle (big), brake, handbrake; every target at least 44 px (MOBILE-01), multi-touch with pointer events; a hint to turn the phone in portrait.
- **HUD:** speed (km/h), drift score (pending and banked, chain multiplier, lit while drifting), a small `?debug=1` line with frame time, triangles, draw calls, physics steps.
- **Tests:** physics and score, as in 8.
- **Playing:** headless Chromium with software graphics at phone size (844 x 390 landscape) and wide (1500 x 900); numbers and pictures.

Not in milestone 1: server, accounts, other cars and maps, lobby, races, audio, the family's menus.

### Open points for the orchestrator, each with my proposal

1. **The lobby map.** *Proposal:* the **car park is both the lobby and a race map** (one fewer map to build; the lobby needs open space, the car park is the most open). Alternative: a sixth, plain lobby map.
2. **Server-side physics.** *Proposal:* **none in 1.0** (3 explains why it is not cheap, although the step is). The checks of 3 only.
3. **Do cars collide with each other?** *Proposal:* **no, they pass through each other** (cars drawn normally, no ghost look). Reason: with only a position every 50 ms and a delay of 100 ms, a hit between players cannot feel right, nobody can push anybody off the map (SCOPE milestone 3), and races stay fair on slow connections. Later: a light "push apart" that only moves your own car.
4. **Guest door in the base.** *Proposal:* an own door `/api/guest/` with a cookie check, also for the WebSocket. *Question to the base:* does a door's required check get to read its own cookie, and does the guard let a WebSocket upgrade under a door through? If the base needs a change, it is a small one and goes into the base (not copied into the app).
5. **Closing sockets when a session ends.** *Proposal:* the hub re-checks every 60 s and on the base's logout events. *Question:* does the base give an event or hook when a person is blocked or the hub signs them out (AUTH-14), or must we poll only?
6. **Guest link shape.** *Proposal:* one link, several uses (default 5, 4 hours, at most 20 / 12 h), the owner can have up to 5 at once, a guest gets a name and nothing else, **no stored times**. Alternative: one link per friend (safer, more work for the owner).
7. **Guest names.** *Proposal:* plain text, 2 to 16 characters, no word filter (friends), shown with `textContent` only; the administrator can kick a name from the lobby (a small button) in milestone 3.
8. **Race rules.** *Proposal:* default 3 laps, sprint = 1; points 10-7-5-4-3-2-1-1 plus drift points / 100; one race at a time; 10 s to join; invitation closes early once everybody has answered. Free to change, they are numbers in one file.
9. **Player counts.** *Proposal:* lobby 16, race 8. The network numbers for N = 4, 8, 16 are in 3.
10. **Touch layout.** *Proposal:* buttons (steer left/right on the left, throttle/brake/handbrake on the right), because they are predictable and testable; "slide on the left half to steer" is a candidate for IDEAS (analog steering). Needs a real phone to decide.
11. **Where the game runs inside the hub.** The scope says the app opens inside the hub's window, but the base forbids framing (SEC-01). *Question:* is the hub's window a real window of the browser (a tab) or an iframe, and who may ask for full screen and landscape lock (iOS gives no lock; the game would show a "turn the phone" hint)? Milestone 2 depends on the answer.
12. **Copying the website's code.** *Proposal:* copy `Builder`, `bake`, `rng`, the clay material and the quality governor into `game/core/` (own code; the website stays read only), note the origin in `docs/ASSETS.md`, and tell the website's chat that the base for shared code should be the app family's base if a third project needs it (outside this scope).
13. **three.js license and files.** The same four files as the website (MIT), checked by hash against its table; entry in `docs/ASSETS.md` before the commit of `vendor/`.

---

## 10. The public shared world (demo), decided 2026-11-25

A public demo for the owner's website: the car park, the cars, and **everyone who is on the page at the same time drives in one shared world, without an account**. It is the network part of milestone 3 in a public variant, built before the accounts of milestone 2. It is a **relay**, not a game server: it knows no rules, only what is possible.

**Who the visitor is.** A random short id (0 to 15, the smallest free one in the world) and a **name picked by the server from a fixed list** (colour word + animal word, 64 made-up names, no free text anywhere, not from the client either). A colour (hue) is picked by the server too. The client only says which of the five cars it drives (`?car=0..4` in the socket address, anything else becomes 0). Nothing is stored, no cookie, no account; closing the tab ends the visitor.

**Frames** (one WebSocket, binary only; the relay ignores text):

| direction | frame | bytes |
|---|---|---|
| client to relay | `POSE`: `1, seq u8, x i16 (1/20 m), z i16, h u16 (2*pi/65536), vf i16 (1/50 m/s), beta i8 (pi/128), steer i8 (1.05 rad = 127), flags u8` (bit 0 handbrake, 1 drifting, 2 hit) | 13 |
| relay to client | `WELCOME 0x80`: my id, world id, hue index | 4 |
| | `ROSTER 0x81`: count, then per visitor `id, car, hue, name length, name` (sent to the whole world when someone comes or goes) | about 14 per visitor |
| | `SNAPSHOT 0x82`: count, server time u16 (ms, wraps), then per other visitor `id` and 11 pose bytes (the POSE without type and seq) | 4 + 12 per other |
| | `FIX 0x83`: x, z, h of the last accepted pose (the car is put back) | 8 |
| | `BYE 0x84`: reason (1 too large or too many junk frames, 2 too many violations, 3 idle, 4 silent, 5 full) | 2 |

**Rates.** A client sends **at most 15 poses a second** (every 66 ms while it moves, twice a second while it stands still, nothing while the tab is hidden). The relay sends a snapshot to every visitor **15 times a second**. Per visitor with N cars in the world: up `13 B x 15` = 195 B/s (+ 6 B of WebSocket header per message = 285 B/s on the wire), down `(4 + 12 x (N - 1)) x 15` = 2.8 KB/s at N = 16 (+ 2 B per message), 0.8 KB/s at N = 4. Measured numbers are in STATE.md.

**Interpolation.** Others are drawn **140 ms behind** the relay's clock (two snapshot intervals): Hermite between the two snapshots around that time (velocity from heading, forward speed and slip), up to 250 ms of extrapolation if a snapshot is late, then standing still. The clock is the smallest `serverTime - localTime` seen in the last 10 s (the least delayed packet), unwrapped from the 16-bit counter. Your own car is never delayed.

**What the relay checks** (every pose; a pose that fails is **dropped and answered with FIX**; 8 failures in 10 s end the connection):

1. exactly 13 bytes, type 1; anything over 64 bytes ends the connection;
2. at most 15 poses a second per connection (a token bucket with a burst of 8: more are dropped silently; a flood ends the connection);
3. inside the map plus 3 m;
4. forward speed at most `1.15 x top(car) + 2`;
5. no jump: the distance since the last accepted pose must fit a **movement budget** that grows with the relay's clock at `1.25 x top + 3` m/s (capped at 0.5 s of it, so a lag burst of an honest player passes);
6. no spinning faster than 12 rad/s.

It does **not** check walls (the demo has none worth cheating through) and cannot stop a driver who is 10 % faster than the rules say; see 3 for why that is enough for a demo where nothing is won.

**Limits.** At most **16 cars per world**; when a world is full a **second world opens** (up to 8 worlds, 128 visitors; then the socket is refused with 5). Per address: at most **4 connections**, **12 new connections a minute**, **80 frames a second** in all. A visitor with no frame for **30 s** is dropped, and one that has not moved for **2 minutes** is dropped (the page then shows "you were dropped, tap to rejoin"). Nothing is stored; a restart empties the world and the pages reconnect after a back-off of 1, 2, 4, 8 seconds.

**One small class, no outside packages.** `server/Relay/WorldRelay.cs` is the whole relay: it knows no sockets, only a tiny `IPeer` (`Send(bytes)`, `Close(reason)`), a clock (`TimeProvider`) and the address text it is given. The caller passes the frames in (`Join`, `OnMessage`, `Leave`) and calls `Tick()` 15 times a second. `server/Relay/RelayEndpoint.cs` is the 80-line bridge to an ASP.NET WebSocket (a bounded outgoing queue that drops the oldest frame, the receive loop, an `Origin` check, the 15 Hz timer); the website's own small server can take both files as they are and map one path. The caller decides what "address" means: behind a proxy it must pass the forwarded client address, not the proxy's.

**Browser side.** `game/net/world.js` is the client module (socket with back-off, encode and decode, the buffers and the interpolation, the clock); `game/demo.html` is the page (the same `main.js` with `data-mode="online"`). Names are drawn as HTML labels set with `textContent`; a counter shows how many are driving here.

**Not in the demo:** accounts, races, guests, cars pushing each other, walls in the relay, sound.

