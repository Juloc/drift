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
