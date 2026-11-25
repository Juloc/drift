# Features 1: HUD, map choice, boards, tuning, underglow, stats (plan, one page)

Status: **proposal 2026-11-26**, waiting for the orchestrator's yes. Order after the yes: 1 HUD, 5 underglow, 4 tuning, 2 + 3 map choice with boards and best drift, 6 stats. Small commits, tests on server checks and pure logic (no display tests), pictures in `docs/screenshots/`. The relay's frames stay as they are (the website's copy stays compatible); new things travel in the join address or in JSON text frames.

## 1. HUD (first)
Bars for throttle, brake and handbrake (what the car is told, not the key), steering as an arc with degrees, speed, drift angle, the running drift (points, chain), best drift of the session. Small in landscape on a phone, nothing over the touch buttons; **H** or a small button hides and shows it (remembered per device).
*Open:* (a) one HUD for everybody, or a "plain" and a "driver" version? **Proposal:** two levels, plain = speed + drift card (as now), driver = everything; the button switches. (b) Units: km/h and degrees. **Proposal:** yes, no setting.

## 2. Map choice
Already half there (the starter chooses in a race). Add it to the time trial (the starter alone) and show the map's name and length on the invitation. The lobby stays the car park. **Open:** can a person drive a map alone without a race? **Proposal:** no, a time trial is a race of one (same server timing, so times count).

## 3. Boards per map
Best lap, best race (standard laps) and **best single drift** (the highest points of one chain, from the server's own score of the poses, like the drift points in a result). Top 10, your own place if you are not in it, nickname or neutral name. Table: one more `kind` in `drift_best_time` (migration). Guests never enter. **Open:** drift record per car or per person? **Proposal:** per person and map, with the car shown. A drift outside a race counts? **Proposal:** only in races (the server follows poses only there).

## 4. Tuning (garage)
Four sliders, each with a counterweight, a budget of 10 points so nothing is just better: **steering angle** (more angle, less top speed), **grip balance** front/rear (more front, less drift), **power against weight** (more acceleration, less top speed... and the other way), **handbrake** (bite against stability). Saved per car (table `drift_tuning`: person, car, four small numbers). The car's five numbers stay the base; tuning is a small, bounded change of them. The **server knows the values** (loads them at join, like the profile) and uses the tuned top speed for the plausibility checks of laps and poses. **Open:** do guests tune? **Proposal:** no. Is a tuned car allowed in every race? **Proposal:** yes, shown in the invitation list ("tuned"), no classes in 1.0.

## 5. Underglow
On/off and a colour (the 24 hues) in the garage, saved in the profile, visible to others as an optional extra in the join address (like the car id: `&glow=<hue>`), so no frame changes. Drawn as one glowing patch under the car (an unlit instanced quad, in the shared pool: one more draw call for all cars), no real light, so it is cheap on the phone tier. **Open:** a night map only? **Proposal:** all maps, brighter at night.

## 6. Stats per person
Driven km, races, wins, podiums, best drift, play time: one card in the garage. Table `drift_stats` (counters, updated by the server at the end of a race and from the pose stream: distance from accepted poses, time from the socket). **Open:** counts in the lobby too? **Proposal:** km and time yes (everywhere), races/wins/podiums only from races. Guests have none.

## Not in this plan
Cars changing shape with tuning, paint jobs beyond the hue, sound, spectators, the simple shared account (that is a separate decision with the owner).
