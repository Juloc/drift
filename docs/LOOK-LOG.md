# Look log: the sunset probe against the owner's mockup

One short entry per round: the five biggest differences to the mockup seen in that round's picture, and what the next round does
about them. Pictures side by side with the mockup are in the orchestrator's notes folder (the mockup is not our asset); the probe's
own pictures are `docs/screenshots/probe-sunset-*.png`. Page: `game/lookprobe.html`, data: `game/data/probe-sunset.json`,
`game/data/looks/sunset.json`.

## A limit found on the way (round 3)

The cars drive on flat ground (the physics is 2D), so the road is flat at y = 0. From a camera about 2 m over that road, everything
that lies more than about 2 degrees under the horizon *behind* the guardrail line is hidden by it. The mockup shows the valley floor,
river and bridge well under the horizon; that only works for us when the valley floor is shallow (about 12 m under the road) and the
river and bridge are far (300 to 500 m), so they appear as a bright band just above the guardrail, as they do in the mockup. A deep,
close valley under a low camera would need a road that is drawn higher than the ground of the physics (a 3D road with a 2D physics
underneath), which is a game change, not a look change.

## Round 3 (2026-11-25)

Done: the land falls away right behind the guardrail (no flat shelf on the valley side; long posts), a W-beam at 0.75 m, a shallow
valley floor with the river far, the camera of the mockup (1.9 m, tilted down 7.5 degrees: horizon at about 35 to 40 % from the top,
the car big and left of the middle), the valley side kept free of trees near the road, the smoke pushed to the left of the car's way,
the big cherry out of the middle, a long arched bridge across the valley, darker front mountain rings.

Biggest differences left (picture `r3d`):
1. Valley: the mockup shows a winding river with bright reflections, mist banks and a clearly drawn multi-arch bridge mid-right; ours
   is a thin glowing band and a dark, flat line (the bridge is backlit and fogged).
2. Mountains: the mockup has four or five clear silhouettes, dark violet in front, pale pink behind; ours are low, soft and pale.
3. Smoke: the mockup's smoke is dense, sunlit puff clusters with shape; ours is a translucent veil.
4. Left slope: in the mockup cherry blossom fills the top left corner over a green-olive slope with rock; ours has dark pines in the
   top middle.
5. Road: the mockup's road is dark violet-grey with clear tyre marks and a modest sheen; ours has a strong orange sheen over the right
   half and faint tyre marks.

Next (round 4): a warmer, lit bridge closer to the camera; mountains higher and sharper with a gentler fog; denser, more opaque smoke
cores; the framing trees moved (cherries top left, smaller pines); less sheen on the road, darker and clearer tyre marks.

## Round 4 (2026-11-25)

Done: a warmer, lit arched bridge closer across the valley; mountain rings higher and sharper with a gentler fog (clear silhouettes,
dark in front, pale behind); the framing trees moved (cherries to the top left, fewer and smaller pines in the middle); less sheen on
the road, darker tyre marks; fuller smoke that drifts off to the left of the car's way and fades close to the camera. The owner's word
in between ("too smooth"): the land, trees, rocks, mountains and the smoke are **faceted again** (flat shading over the soft colour
gradients, as in the mockup), the car and the road stay smooth; the sun was moved up so it sits on the mountains.

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Valley: the river is still only a thin bright band behind the guardrail (the limit above); the mockup shows more of it, with mist
   banks lying in the valley and a reflection of the sun.
2. Sky: the mockup has a big clear sun with a strong golden glow and distinct pink cloud bands around it; ours is paler and partly
   under the position card.
3. Smoke: the mockup's puffs are fuller and whiter with a pink shade and fill the lower left; ours are more transparent.
4. Left slope: the mockup's slope is a rock cliff with green ledges and big cherry trees reaching into the top left; ours is a grass
   slope with a few rocks; the cherries are small in the corner.
5. Colour: the mockup's whole picture is a little more saturated and contrasty (deep violet shadows, bright peach light); ours is
   a little grey-pink.

## Round 5 (2026-11-25)

Done: the sun moved out from under the position card and given a stronger golden glow; whiter, fuller smoke (less see-through at its
edges); the left slope steeper with rock showing in patches between the grass (faceted); two big cherry trees placed 10 to 20 m ahead
on the left so their blossom reaches into the top left corner, as in the mockup; a little more saturation and more violet in the
shadows.

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Valley: still the thin band behind the guardrail (the limit above).
2. Smoke: still a little glassy (see-through faceted shells); the mockup's puffs read as solid, sunlit balls.
3. Clouds: the mockup has distinct pink cloud bands around the sun; ours are faint.
4. Road: the sun's sheen on the right half of the road is stronger and more orange than in the mockup.
5. Middle: the mockup's midground right of the road has rounded green hills with pines in front of the mountains; ours goes from the
   guardrail straight to the far valley and mountains.

## Round 6 (2026-11-25)

Done: more distinct cloud bands (lower threshold, a deeper pink shade), less sun sheen on the road (more matt asphalt), the smoke nearly
opaque. Tried and dropped: solid smoke with a screen-door fade (no sorting needed, but the grain shows; the bloom does not hide it).

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Valley: the thin band behind the guardrail (the limit above).
2. Smoke: the faceted puffs still look a little like glass where several overlap (transparent shells in one instanced mesh are not
   sorted); the mockup's smoke reads as soft, solid balls.
3. Clouds: they sit mostly behind the drift-score card at this camera; the open sky right of it shows few.
4. Midground right: the mockup has rounded green hills with pines between the road and the far mountains.
5. Car: the mockup's car shows more of its flank and a stronger red glow of the tail lights.

## Round 7 (2026-11-25)

Done: rolling hills with pines on the valley floor from about 50 m beyond the road (their tops reach just under road level, so they
stay visible over the guardrail, as the midground hills of the mockup); the trees may now stand 60 m from the road on the valley side;
the picture taken a moment earlier, at the entry of the right-hander, so the bend and its guardrail curve to the right through the
picture as in the mockup; the sun moved back over the mountains right of the middle, a stronger fill light for the backlit cliff. Tried
and dropped: smoke writing depth (the faded puffs then hide the others: the smoke vanished).

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Valley: the river and lake are only glimpsed between the hills (the limit above).
2. Smoke: thinner than the mockup's big billows in the lower left.
3. Tail lights: the mockup's glow red and strong; ours are orange and small.
4. Left cliff: darker and bigger than the mockup's sunlit slope.
5. Clouds: mostly behind the drift-score card.

## Round 8 (2026-11-25)

Done: more and fuller smoke (300 puffs on the high tier) that starts a little outside the rear wheels on the side the tail swings to,
so the clouds billow beside and behind the car (lower left) and the tail stays visible, as in the mockup; deep red tail lights (very
bright red turns orange under the ACES tone mapping, so the red is more saturated and less bright).

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Valley: lake and river are only glimpsed (the limit above); the mockup shows a glowing river bend under the sun.
2. Left cliff: darker and taller than the mockup's sunlit slope with pines on its ledges.
3. Clouds: the bands lie mostly behind the drift-score card at this camera.
4. Car: the mockup's car is a body-kitted S15 with a big wing and wide wheels; ours is the RX-7 model (the car the orchestrator chose).
5. Numbers: the mockup shows a long drift (18.460, ×4,2, 124 km/h, gear 3); ours are the real values 6.8 s into the bot's drive.

## Round 9 (2026-11-25)

Done: the left slope lower and lighter (grass with rock patches, boulders, cherry trees on it), as the sunlit slope of the mockup; the
far, hidden lake replaced by a lake bend in the valley under the sun (glimpsed between the hills at the right edge); cloud streaks
gathered round the sun.

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Clouds: round the sun they now read as a bright haze, not as the mockup's distinct pink bands with golden edges.
2. Valley: the lake under the sun is hidden by the valley hills from this low camera (the limit above).
3. Car: RX-7 instead of the mockup's kitted S15 (the orchestrator's choice of model).
4. Numbers: real values 6.8 s into the bot's drive instead of a long drift.
5. Detail density: the mockup's midground has more small pines and cherries on several hill layers; ours has one layer.

## Round 10 (2026-11-25)

Done: crisper cloud edges and less glow on the clouds near the sun. Result: the sky round the sun stays a soft peach glow; the bloom
blurs thin bands next to the sun, and the rest of the band lies behind the drift-score card at this camera.

Where it stands after ten rounds: the composition, camera, light, colours, facets, road, guardrail, chevrons, cherry trees, smoke and the
HUD match the mockup closely. What is still different and why:
1. **Valley floor, river and lake** under the low camera: the limit described at the top (a flat physics road hides what lies more
   than about 2 degrees under the horizon behind the guardrail). Way out: draw the road higher than the physics ground (a 3D road over
   the 2D physics), a game change for the orchestrator and the owner to decide.
2. **Clouds**: thin bands next to a bright sun are softened by the bloom; a cloud layer of its own (soft quads in front of the sky,
   like the mist) would make them distinct; small next step if wanted.
3. **Car**: RX-7 model as chosen; the mockup shows a kitted S15.
4. **Numbers in the HUD**: real values of the bot's drive (score 31, ×1,0, 56 km/h) instead of a long drift (18.460, ×4,2, 124 km/h);
   only lap, best and position are sample values from the scene.
5. **Detail density**: the mockup's midground has several layers of small trees; ours one.

## The limit lifted: a visible height profile for the road (rounds 11 and 12, the orchestrator's decision)

The road now lies on a drawn height profile (`road.grade` in the scene: metres along the road against height; the plaza at 0, the pass
falls about 42 m over 370 m). Every other height of the scene (terrain profile, river, lake, bridge, mist) is relative to the road's
height nearby, so the land, the cliff above and the drop below move with the road. The car, the camera, the smoke, the skid marks and
the car's shadow are set onto that height; the car leans with the slope. **The physics stays 2D and untouched**: the cars still drive
on flat ground; server, relay and collision see nothing of it.

How it would come into the game later (only the view): a map gets a `grade` (or a height function) next to its centre line;
`field.js` gives `groundY(x, z)` from the nearest point of the road; the game's renderer sets every car's drawn y (own and remote, from
the same x, z the relay already sends) and its pitch from the slope; the follow camera, the smoke and the skid marks take `groundY` too.
Costs: one nearest-point search per car per frame (a few hundred segments: microseconds; a coarse grid lookup would make it constant),
no extra draw calls, no network bytes. What it cannot do: jumps or a road that crosses itself at two heights (the physics would not
know); for a mountain pass that is fine.

## Rounds 11 and 12 (2026-11-25)

Done: the road's height profile (above); a deep valley right behind the guardrail with the river, the lake bend and the arched bridge
mid-right and a forested far slope; the camera at 2.4 m and 7.2 m behind the car; the owner's "car and road far too smooth, the
surroundings not detailed enough": the car in a painted style (`view/look/paint.js`: the light in soft steps, a darker soft contour,
a clear-coat gloss instead of a mirror, satin rims, dust low on the sills); the road with grain (a small shader, no texture), darker
wheel tracks in both lanes, patches and cracks, broken and worn edge lines, worn centre dashes, many old tyre marks through the bends,
a gravel-to-grass shoulder; around it grass tufts and small stones at the roadside, bushes, petals under the cherry trees, pines in
groups of different sizes, a carpet of far trees on the valley floor and the far slope, power poles with sagging wires along the slope,
two stone lanterns and a red shrine gate where the road leaves the plaza; the smoke clears around the car's body, so the car is always
seen.

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Smoke: the mockup's big billows next to the car read as round, lit balls; ours sit mostly at the left edge and look like a pale
   wall where many overlap.
2. Mist: the mockup has white mist banks lying in the valley; ours is faint.
3. Valley floor: the far trees are sparse dots on green; the mockup's valley is a soft forest of pines with pink cherries in it.
4. Sky: the clouds are faint; the mockup has bright peach bands round the sun.
5. Left cliff: the mockup's slope is lit warm with green ledges; ours is a dark violet rock face.

## Rounds 13 and 14 (2026-11-25)

Done: mist banks lying along the river (placed by the river's line, relative to the valley floor, denser); a denser carpet of far pines
in clumps on the valley floor and the far slope; a warmer rock colour on the left; the smoke as **painted billows**
(`view/look/billows.js`): camera-facing quads with a cloud texture drawn by code (a cluster of round puffs, light on top, rosy-grey
underneath, soft edges), brighter than white in the low sun, clearing round the car's body so the tail and its lights stay visible;
two triangles a puff, so it is also the cheaper smoke for the phone. The faceted puffs stay as an option (`smoke.style`).

Biggest differences left (picture `probe-sunset-drift.png` of this round):
1. Car model: the RX-7 against the mockup's kitted S15 (a question of the car file, not of the look).
2. HUD values: a short drift (31, ×1,0, 56 km/h) against the mockup's long one (18.460, ×4,2, 124 km/h).
3. Sky: the mockup's cloud bands are brighter and more distinct.
4. Left slope: the mockup shows more green ledges and pines on the rock; ours is mostly rock and grass with one big cherry.
5. Bridge: half hidden in the mist from this camera; the mockup shows its arches clearly above the river.

## Rounds 15 and 16 (2026-11-25): measured against the mockup

A measuring tool: `node tools/palette.mjs <mockup> <picture> [--boxes=name:x0,y0,x1,y1;...]` (headless Chromium reads the pixels, no
packages): brightness, contrast (standard deviation), saturation, the mean colour of six regions (left/right × thirds) and of named
boxes, and the distance of each (RGB). Boxes used: sky-top 0.4,0.11,0.6,0.16; near-sun 0.72,0.2,0.8,0.26; road-near 0.55,0.85,0.75,0.97;
smoke 0.02,0.55,0.2,0.75 (fractions of the picture).

Done: a cloud layer of its own (soft bands at the sky's distance, `makeClouds` in sky.js, lit coral on the sun's side); a softer grade
(less saturation, contrast 0.94, shadows lifted a little towards mauve, a fine film grain; bloom only above 1.8, so lamps, sun and
reflectors glow and the car's paint does not); a coral sun and mauve sky; lower, rosier mountain rings and a lower far slope, so the
right third is sky with the sun just over the mountains; the camera of the mockup (1.6 m, 5.6 m behind, the car big left of the
middle, the horizon at about a third); greener-olive land, stronger pink cherries, satin grey rims; the power poles out of the picture;
the smoke as big billows that fill the lower left and fade only right at the lens.

Distances to the mockup, start of round 15 → end of round 16: mean 58 → 36; brightness 99 → 114 (mockup 108), contrast 43 → 43 (42),
saturation 0.44 → 0.34 (0.37); smoke 74 → 9, middle-left 57 → 8, top-right 76 → 36, road-near 28 → 36, near-sun 169 → 95.

Biggest differences left:
1. Near the sun: ours is a pale cream glow, the mockup a saturated coral-orange (#faae7b) round a smaller bright core.
2. Sky top: ours more magenta and darker (#9e5674 against #c37c88).
3. Road near: a little too light and red (#855155 against #683e4c).
4. Valley: the river and mist are only a strip at the right edge; the mockup shows the river bend and the bridge mid-right.
5. The car (RX-7, a choice) and the HUD values (a short drift) as before.

## Rounds 17 and 18 (2026-11-25)

Done: surfaces instead of flat colour on the land, rocks and trees (a small shader: colour noise per facet from its own normal, soft
blotches and a fine grain from the world position; `look.surface`); the sun moved to the mockup's place (right third, just over the
mountains) with a more saturated coral halo; a lighter, rosier sky; a darker mauve road; a lake with an arched bridge placed about 25
degrees right of the view down the road, the hills and trees kept off its shores, so it glows mid-right behind the guardrail. The
sky-top box of the measuring moved to open sky (the old one lay on the drift-score card).

Distances (boxes: sky-top 0.62,0.03,0.85,0.1; near-sun 0.72,0.2,0.8,0.26; road-near 0.55,0.85,0.75,0.97; smoke 0.02,0.55,0.2,0.75):
mean 36 → 31; brightness 114 (mockup 108), contrast 42 (42), saturation 0.35 (0.37); smoke 9, middle-left 8, middle-right 16,
road-near 30, top-right 33, sky-top 44, near-sun 69.

Biggest differences left:
1. Near the sun: still a pale cream (#eccfb6) against the mockup's saturated orange (#faae7b): ACES tone mapping bleaches bright warm
   colours; next: a hue-preserving curve for the sky (or the sky drawn after tone mapping).
2. Bottom-left: our smoke and the shoulder are lighter than the mockup's (#99717f against #7b5b6a).
3. The bridge disappears in the mist and haze over the lake; the mockup shows it as a clear dark silhouette.
4. Top-left: the cherry tree in the mockup is pink and lit (#bd5076); ours is dark red in the shade of the slope.
5. Car (RX-7) and HUD values (short drift) as before.

## Rounds 19 and 20 (2026-11-26): the composition of the mockup; now on the shared modules

The branch was set up again on master (the look's parts are now shared modules, `game/view/look/stage.js` builds the picture for the
probe and the game); rounds 15 to 18 were carried over (the cloud layer now lives in `stage.js`). The probe uses the game's own
chase camera (`LookChase` in `view/camera.js`), which got one option: `turn` (degrees, + = to the right) turns the view away from the
road into the valley beside it.

Done: the camera turned 24 degrees into the valley and set a little to the left of the car, so the valley with river, mist and forest
lies mid-right, the road curves right in front of it, the car sits big left of the middle seen from behind-left, the sun is in the
right third over the mountains; the uphill land on the left made much lower (a sunny slope with the cherry trees, pines and rocks in
the top left corner instead of a dark cliff); a more saturated orange round the sun; a darker mauve road; the bridge darker and
without mist round it; stronger pink blossom; warmer rock.

Distances (same boxes as before): mean 31 → 28; brightness 116 (mockup 108), contrast 40 (42), saturation 0.36 (0.37); middle-left 4,
middle-right 15, road-near 20, top-left 24, bottom-right 26, near-sun 69 → 30, top-right 32, bottom-left 40, smoke 9 → 41, sky-top 43.

Biggest differences left:
1. Smoke: with the camera now left of the car the billows lie between the lens and the car and fade there; the mockup's big billows
   fill the lower left. Next: let them grow larger beside and behind the car, keep them off the lens.
2. Sky top: paler and more cream than the mockup's pink.
3. The bridge is not seen from here (behind the valley rim); the mockup shows it mid-right over the river.
4. The tail lights are red bars; the mockup shows two separate lamps (a question of the car model).
5. HUD values from a short drift, as before.

## Round 21 (2026-11-26): the owner's verdict with a real GPU (0.2.4)

"Why so much grain, ugly": the film grain is off (`grade.grain` 0), the surface noise on large areas is much weaker (`surface`:
facet 0.07, blotch 0.10, grain 0.02), the road's grain weaker (`road.grain` 0.12; the shader takes its strength from the look now).
"Why is the car model so ugly, it was better in the rx7 folder": the painted car style (toon steps, contour, dust) is off; it is an
option of the look now (`car.painted`, default off) and the car keeps the game's normal PBR materials with the sky's reflection and
clear coat. Whether the model file keeps its original textures and rim materials is asked of the car session (the normaliser).

## Round 22 (2026-11-26)

Done: sharp, staggered mountain peaks (`ridges.sharp`: more peaks round each ring, five rings, higher and finer on the high tier); the
car seen from behind-left with its flank and drift angle as in the mockup (chase camera: 1.5 m to the right, turn 10 degrees, 6 m
behind); the sun moved back into the right third over the peaks; warmer, rosier and bigger smoke billows (`smoke.size`), and a puff
in front of the car that would cover it on screen fades out (`Billows.aim(camera)`), so the car is always seen and the smoke beside
and behind it stays.

Distances: mean 30 (round 20: 28; the new camera trades a little colour match for the mockup's angle); top-left 14, smoke 12,
middle-left 20, middle-right 22, road-near 26, bottom-left 29, bottom-right 30, top-right 37, sky-top 44, near-sun 62.

Biggest differences left:
1. Sky top and near the sun: paler cream than the mockup's pink and orange.
2. Smoke: thinner than the mockup's dense billows at the lower left.
3. The bridge is not in sight from this camera.
4. The cherry tree at the top left hangs in front of the drift-score card; the mockup's sits further left.
5. Car model (RX-7) and HUD values (short drift), as before.

# Touge at dusk (the owner's focus from 2026-11-25 on, FOKUS.md)

The mountain pass sunset stays at round 22. From now on only the touge look. No mockup file yet (`touge.png` follows), so the first
rounds go by the description: dusk blue-violet with the last orange, a rising moon, a narrow road with hairpins, a red torii and stone
lanterns, cedars on a steep slope, a calm crater lake deep below, volcano silhouettes, warm street lamps.

## Touge round 1 (2026-11-26)

New in the shared modules (all data-driven, the game takes them over with its touge map):
- `field.js`: terrain mode `slope`: the land is one hillside (a height profile along `terrain.dir`); a road that winds down it with
  switchbacks and hairpins takes its drawn height from the hillside under it (`road.grade: 'slope'`, smoothed); water heights are
  absolute there (`f.waterY`).
- `world.js`: volcano cones far away (`scene.volcanoes`: x, z, radius, height, layer), cedar shape for the pine (`look.pine.shape`:
  layers, width, tier height), a wide road torii (`marks` gate with `width`/`height`, a black-capped top beam), street lamps along the
  road on the uphill side with the arm over the road (`road.lamps`: metres apart).
- `sky.js`: a moon (`look.sky.moon`: dir, size, colour, bright, glow).
- `camera.js` (LookChase): `swing`, metres per radian of drift angle: the camera swings out to the side the nose points to, so the
  angle is seen (the owner: "the camera swings with the drift").
- `stage.js`: a mist patch may carry its own absolute height.
Data: `game/data/looks/touge-dusk.json`, the probe scene `game/data/probe-touge.json` (`lookprobe.html?scene=touge`).

Pictures: `docs/screenshots/probe-touge-drift.png` (high tier, drifting 44 degrees into the first hairpin, the lake below),
`probe-touge-phone.png`, `probe-touge-overview.png`. Numbers: high tier 995k triangles / 50 calls (drift view), phone tier 81k / 21.

Biggest open points:
1. The moon is not in the picture yet (behind the drift-score card or off the frame).
2. The volcanoes are flat dark triangles: they need haze, a lit rim and a crater edge.
3. The smoke is grey and covers the left third; at dusk it should be lit by the lamps, lighter and smaller.
4. The meeting place at the top is big, dark and empty (no lanterns, no people, no torii seen from it).
5. Cedars only on the valley side of the picture; the uphill slope should be a dark cedar wall with lanterns along the road.

## Touge round 2 (2026-11-26): the owner's new list (smoke, rendering), the orchestrator's review

Done in the shared modules (the game takes them with it):
- Smoke (`billows.js`, data in `look.smoke`): trails behind the rear wheels that grow with the drift angle (`start`, `spread`, the
  angle scales each puff), thin out fast (`life`, `lifeGrow`, `fade` < 1), a little more for the first `burstTime` s of a slide
  (`burst`), half the old size on the touge. `stage.render()` now keeps the car free of its own smoke in the game too
  (`Billows.aim` is called there).
- Contact shadow under the car (`wheels.js`): a soft gradient that is dark right under the car and fades to its edge, not a flat disc.
- Volcanoes: hazier by layer, a lighter crater rim (`look.volcano`); farther away.
- Touge look: warmer and brighter (exposure, sun, fill), green cedars and grey road kept, bloom only above 2.4 (lamps, chevrons),
  smaller lamp halos. Probe HUD in the touge's free-run mode (no lap or position: run time, drift score, best drift).
Numbers: high tier 995k triangles / 50 calls, phone tier about 81k / 21.

Still open: the game has no touge map yet (the drift chat builds it), so no game picture of the touge; volcano faces lie in their
own shade (dark flat triangles); a bright highlight on the car's roof; real shadows of trees and rails need the shadow box to reach
farther; foliage from outside sources waits for the owner's yes to download (a list went to the orchestrator); automatic quality
tiers are next.

## Quality tiers by device (2026-11-26)

`game/view/look/autotier.js`: `readDevice(renderer)` (graphics chip from WebGL, memory, cores, phone), `guessTier(device)` (a first
guess: no chip/software low; strong phones medium, others low; desktop graphics cards high, integrated graphics medium or low),
`TierPicker` (measures the frame rate after the first 1.5 s for 3 s: under 40 fps one step down, over 58 fps one step up unless it
went down before; two steps at most, then it stays), `startTier(setting, device)` (a setting high/medium/low wins over auto).
`stage.setTier(name)` switches shadows, the after-pass and the world's density and builds the world again (the caller builds the cars
again when `stage.carTier` changed). Looks may have a `medium` tier (the touge has one; others fall back to low). Probe:
`?tier=auto` (headless software rendering picks low, as it should). Tests: `autotier.test.mjs`. The setting in the game (Auto, High,
Medium, Low) is the drift chat's part.

## Touge triangle budget (2026-11-26)

On master the land is no longer a shadow receiver (the drift chat: the VSM pass drew every receiver again). The touge's tiers thinned
to keep the high tier under 400k triangles a frame: high cell 4.5 m, 550 + 320 cedars, 3500 far trees, cedar 5 tiers; medium cell 6 m,
320 + 200 cedars, 2000 far trees. Measured (probe, drift view, including shadow and bloom passes): high 336k triangles / 49 calls
(world 250k; before 995k), medium 190k / 49 (world 108k), low world 59k. The picture is unchanged by eye.

## Touge round 3 (2026-11-26): the orchestrator's review of round 2

1. Smoke: a soft wisp texture drawn from value noise (`look.smoke.texture: 'wisp'`: one blurred blob with frayed alpha, light on top,
   shaded below), fewer and bigger sprites (90 on high), so the trails run into each other without round edges.
2. The bright spots on the roof and the rear window were the clear coat's highlight (not bloom): `look.car.gloss` (env, roughness, coat,
   clearcoat) tames the paint for dusk; carMaker applies it to the paint material of every car.
3. Light: a second warm key light from the bright side of the sky (`look.key2`), stronger fill, greener cedars and land: the
   foreground keeps its own colours instead of dark violet silhouettes.
4. Volcanoes lower, hazed towards a warm haze colour (`look.volcano.hazeColour`), a lit crater rim; a lighter, warmer fog.
5. The lake mirrors the orange sky (water `light` orange, stronger glow).
6. The dark smudge behind the drift-score card was the blurred peak of a volcano behind the frosted card: the peaks are lower now.
   A seam in the sky (the azimuth of the cloud streaks jumped at +-180 degrees) is gone: azimuth now measured from the sun.
7. Road: neutral grey asphalt, little sheen, clear edge and centre lines.
Numbers unchanged: high 336k triangles / 49 calls.

## Touge round 4 (2026-11-26): the new chief's review, points 1 to 4

1. Sky: the hard vertical edge in the cloud streaks (the azimuth seam) was fixed in round 3; checked again: gone.
2. Mountains: five ridge rings staggered behind the lake, each lighter and rosier than the one before (`look.ridges`), drawn unlit
   (`look.farUnlit`: a mesh of its own with the layer colours, so they do not lie dark in their own shade against the low sun); the
   volcanoes are lathes with concave, soft flanks and a small crater (no sharp-edged cones); the touge look is smooth (`facets: false`).
3. Lake: the sky in the water by direction: bright orange on the side towards the sun, darker towards the viewer, and a path of light
   to the sun (finer lake grid); less of its own glow, so the gradient shows.
4. Smoke: puffs never rise more than `maxRise` (1.3 m) over where they started and never grow past `maxSize` (4.2 m): no smoke high up
   behind the HUD cards; soft wisps, light on top, shaded underneath.
Numbers: high 343k triangles / 50 calls, phone tier 82k / 22. Tests 128 green.
