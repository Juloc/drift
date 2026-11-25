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
