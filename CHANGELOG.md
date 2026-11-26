# Changelog

Versions follow SemVer. The version stands in `Directory.Build.props`.

## 0.7.16

- The drift training place has its look: a pier in a harbour at sunset. Asphalt with worn areas, repair patches, rubber rings and a wet zone that mirrors the sky; red and white barriers; a quay with containers, cranes, a ship and a lighthouse; a grandstand with a crowd and flags; palms and floodlights; shadows. Tyre smoke is a trail of small white clouds from the wheels instead of a veil over the picture.

## 0.7.15

- The test page of the new driving model now drives on a drift training place (250 x 180 m): circle, figure eight, S-bends, slalom, hairpin, a bend along a wall with a clipping zone, a wet pad and a straight, all made from numbers. Cones fall when hit and stand up on reset; the wet pad has its own grip, worked out per wheel, and can be switched (N); a list picks the exercise to start on. Plain shapes for now: the look of the place comes next.

## 0.7.14

- A colour study of the touge look to switch to ("Look B": no violet wash, cool sky light, green land, blue far hills, neutral asphalt): menu chip Look A / B, or `?look=b`; also on the test page. Look A stays the default.

## 0.7.13

- Test page of the new driving model: an action camera (key C: Action, Calm, Wide) that sits behind the direction of travel, so a drift shows the car's side; both rear wheels smoke in a drift (the tread heats by sliding power per contact area); a floored start spins the rear wheels, and gas against the brake is a burnout.

## 0.7.12

- Test page of the new driving model: the car no longer shakes against the camera (the drawing is blended between two steps of the model); tyres squeal only at and past their limit and smoke only when the tread is hot and slides hard; a full steering key no longer scrubs the front tyres; tread temperature in the read-outs.

## 0.7.11

- Test page for a new driving model (`/play/lab-sim.html`): a real car simulation (four wheels that spin on their own, tyres by slip and load, springs and dampers, engine, clutch, gearbox, limited-slip differential), with Arcade, Sport and Sim as helpers on the same car. The game itself still drives on the old model.
- Game modes: a mode window (free driving, drift attack, time attack, tandem, training); the score in the HUD equals the score on the result card.
- Look: rocks and rock faces in the cuts, first grass, bigger smoke; props fade when the camera is right in front of them.
- Car: paint, tyres and rims; recorded tyre squeal.

## 0.7.10

- The road is drawn on the same surface the car drives on, with its side tilt: no more car that seems to float in bends, no underglow sticking into the road, no light patches cutting into it.
- Tyre smoke starts at the rear tyres' contact point, is thrown back, grows and rises; no hole around the car.
- Lamp light: soft round pools laid on the ground, close ones merged, halos fainter with bloom; the road stays dark violet between the lamps.
- Sky: warm cloud bands low over the horizon and stars high up (weak at dusk).
- Car lights: smaller halos, brake lights glow pink-red when braking, a short sharp exhaust flame at high revs; no sun glint ball on the side glass.
- The plaza at the top of the touge is 1.5 times as big, with a tyre ring, a barrier gate and two cone gates to practise.
- Known: at one place (895 m) the drawn road is 7 cm above the car's surface; the frame rate dropped somewhat on the test machine (being measured).

## 0.7.9

- The chase camera no longer looks into the hill: it checks the line of sight to the car over the land and rises (quickly) or comes closer when a slope is in the way, then settles back slowly.
- Practice ground: each knocked-over cone costs 50 points of the drift score (never below 0; not in creative mode).

## 0.7.8

- Practice ground: the small step where the course returns to the pad is gone (the road's end now lies level in the pad); the course is a little longer and has its own leaderboard. Cones fall over when hit; a counter shows them (−50 each), R stands them up again.
- The test driver brakes for every bend by its curve and the road's grip; all maps are checked by the track and drive checks before a release.
- Winter pass and autumn course in the interface lab; each map keeps its own leaderboard.
- Known: the ice patches right after the two winter hairpins are hard to hold (decision pending); the music slider is now big enough for a finger.

## 0.7.7

- New HUD layout: cards, buttons and minimap sit in a fixed grid and no longer overlap, checked at eleven screen sizes from a small phone to an ultrawide PC.
- Real engine sound for the AE86 and four music tracks (volume in the menu).
- Two new maps in the menu, each playable alone with or without an account: the winter pass (snow and ice patches with less grip) and the autumn drift course.
- Stone lanterns as a proper model.
- Known, fixed next: a small step where the practice course returns to the pad; the ice patches right after the winter hairpins are hard to hold; the music slider is slightly small for a finger.

## 0.7.6

- No more rubber-banding: the chase camera's follow point moves with the car instead of trailing on an elastic band; the travel direction and the drift turn blend softly (no view snap); hitches are caught up.

## 0.7.5

- Boards kept apart: the old touge, the new touge with flat physics and the new touge with the slope switch each have their own list (old times stay readable). Races, modes and tandem write to the list of the driver's physics.
- A page with an older road is asked to reload when it joins.
- Database: migration 018 (a version column for best times).

## 0.7.4

- The practice ground: a flat pad of 220 x 140 m with drift circles (15 and 25 m), a figure eight and two slaloms of soft cones, plus a 691 m practice course with a long bend, a transition, a hairpin and a gentle climb and descent, clipping points in every bend. Open it from the menu chip or with /play/?map=practice, with or without an account. Its look is still a placeholder.

## 0.7.3

- The practice partner and the demo bot drive the new slope model on the new road (with the slope switch on); a drive check measures camera calm, wheel contact and body motion along the whole touge.

## 0.7.2

- Drift feel with the slope switch on (menu chip "slope: on"): a new tyre with one force along and across, its own rear wheel slip, a locking handbrake and a weight shift that takes time; throttle now holds the angle (more throttle, more angle) and left-right transitions no longer spin. Tyres can only take energy away. The flat model stays as it was for comparison.

## 0.7.1

- Fix: the game page of 0.7.0 did not load (a name was declared twice after merging the car work); the car now reads the loaded road surface.

## 0.7.0

- The touge made again from one road surface with hard limits: at most 5.3 % grade, side tilt up to 6.7 % into the bends, no height jumps, the plaza joins the road flat. Times of the old touge no longer compare.
- The car stands on its four wheel points: it pitches and rolls with the road; tyre marks and smoke start at each rear wheel and lie on the road.
- Physics with height, behind a switch in the menu ("slope: on/off"; off by default): slope force, wheel load on crests and dips, hill hold.
- Tandem in two runs and training with a ghost; a calm camera with presets, mouse orbit and wheel zoom, auto-follow; a PC/phone controls switch; own icons instead of emoji; the underglow follows the road.
- Known: the road band is still drawn flat across, so at a hairpin edge the car can sit a few centimetres off the drawn road; the land does not yet follow the road everywhere.

## 0.6.3

- The interface lab at /play/lab/ grows: track list, track details (with the map from the game's centre line) and the result screen.

## 0.6.2

- Names: guests type any name and show as "Name (Gast)"; signed-in drivers always show their account name.
- Drift attack and Time attack also without an account (the best stays on the device; with an account it goes on the board).
- The interface lab at /play/lab/: garage with the car in 3D, navigation and the game modes, to click through on a phone (more screens follow).
- The ground no longer pokes through the road on the hillside; the play check now samples along the road too.

## 0.6.1

- Phones: the game turns to landscape and goes full screen on the first tap (where the browser allows it; iOS keeps the hint to turn the phone); the picture no longer stretches when the size changes; a reset button, and every key can be reached by touch (the rest in the menu).
- The plaza: its west half was drawn and placed 14 m too low, so some starts were under the plaza; fixed for every start, reset and ride back.
- Play without an account: Drive on the start page puts everybody into the same public lobby.
- Game modes Drift attack and Time attack: a run down the touge, scored by the server, with boards (with an account).
- The touge: a gate with stone stairs, stone lanterns with light, cherry bushes and rocks at every hairpin; the paint shines from the sky without sparkle points; stone slabs and lights on the plaza.
- The AE86: tyre sound in layers (roll, hiss, squeal, scrub); the drivers nearby sound like an AE86 too; rims as their own calm material; far fewer draw calls on phones.
- A play check runs before a release (phone portrait and landscape, tablet, PC, size changes, every start on the ground, every key by touch, nothing covered).

## 0.6.0

- The touge view: a moon, an orange sunset lane on the crater lake, glowing three-arrow signs, the lake and sun where the view over the guardrail looks.
- The camera sits lower and closer, with the car left of the middle while drifting.
- The start looks over the plaza towards the gate and the valley; the plaza now sits at the height of the road (the car no longer stood in the ground).
- The AE86's own engine sound plays loops at five revs on and off load (made in the browser), with a shift dip and a limiter; the bonnet takes the paint; tyres have a tread.
- Private sessions: a guest link is its own world; a signed-in driver joins it from the settings; a small hint shows a private session.
- Not in yet: the new tyre sound, the rims as their own part, game modes, playing without an account.

## 0.5.0

- The touge in its new look: a brighter dusk, hazy ridges in layers, green cedars, a darker lake, smoke as soft rosy clouds that stay behind the car, the same mood on phones (sharp at full resolution).
- One car for everybody: the AE86 ("Toyota Corolla AE86 Trueno" by Lexyc16, CC BY 4.0, changed; see the credits), with glowing tail lamps, headlight light on the road, a short exhaust flame on a pop, dark glass and its own tyre marks. The other cars stay in the code and are not offered for now.
- Three new paints: white (the default), black and silver.
- The touge is the lobby: Drive starts on the plaza at the top; R or the end of the road brings the car back up.
- A card at the end of a run: time, points, clipping points, best drift.
- The camera sits closer and turns towards the exit of a bend while drifting.
- Not in yet: a private world by link, zone points on the server, the new engine sound.

## 0.4.0

- Touge preview: a new map, the touge at dusk (a plaza above a crater lake, 1.95 km of narrow road with eight hairpins, guardrails on both sides), reached from the garage with "Touge (preview)". A run is timed from the first gate to the bottom; R or the end of the road brings the car back to the top.
- Hard walls: a hit on a guardrail costs much more speed than before.
- Clipping points at the hairpins: a drift through a zone adds a bonus to the drift chain.
- Sound is off by default, with a volume slider and a limiter; exhaust pops.
- The switches sit behind one menu button, the minimap is a fine line, the graphics tier is chosen automatically (and can be set), the game opens in the same tab and Esc leads back to the garage.
- Races and challenges are hidden for now (the focus is one map and one car).
- Not in yet: the lobby on the touge, a summary at the end of a run, zone points on the server, the new car.

## 0.3.0

- The game wears the new look: the shared look stage (sky, light, world, mist, smoke, tyre marks), the HUD from the mockup, the RX-7 for everybody, the road on a drawn height profile (view only), the maps drawn in the new style.

## 0.2.4

- Look probe rounds 15 to 18 (measured against the mockup): surface noise on land, rocks and trees, softer grade with grain, bloom only on lights, coral sun at the mockup place, rosier sky, darker mauve road, lake with bridge mid-right.

## 0.2.3

- Look probe rounds 9 to 14: the road on a drawn height profile with a deep valley (view only, physics unchanged), painted car style, detailed road and surroundings, painted billow smoke.

## 0.2.2

- Reverse works: the brake brakes while the car rolls forward and becomes reverse at a stop; the camera stays behind the car.
- Finer control on the PC: keyboard throttle, brake and steering as smooth ramps (tap to hold half throttle or a steering angle), "direct" as a setting; the mouse as a throttle lever (optional).

## 0.2.1

- The first real car: the Mazda RX-7 FD ("Mazda RX-7 FD" by Lexyc16, CC BY 4.0, scaled, materials replaced, emblems removed), with the pipeline that normalises downloaded models; the credits page lists it.
- The look probe "sunset" from the owner's mockup as its own page (`/play/lookprobe.html`): meeting place, mountain road, valley, the mockup's HUD; not yet the game's look.

## 0.2.0

- The first preview of the public game: the open lobby (64 per world, interest areas), races and boards, the Juloc Games account (open registration, closed until the owner's privacy and imprint texts are in), tandem, challenges with stars, Arcade and Pro feel, controller, cameras, sound, collision and damage, model files (test model only).
- A production stack (`deploy/stack/docker-compose.yml`) and a release workflow for `ghcr.io/juloc/drift:<version>`.

## 0.1.0

- Made from base 0.3.4 with `new-app.sh`.
