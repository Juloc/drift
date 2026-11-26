# Changelog

Versions follow SemVer. The version stands in `Directory.Build.props`.

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
