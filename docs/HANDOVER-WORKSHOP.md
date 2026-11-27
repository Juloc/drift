# Hand-over: the look and asset workshop (for an agent on a PC with a real graphics card)

Written 2026-11-27 by the planning session. Read `CLAUDE.md`, `docs/SCOPE.md` and `docs/STATE.md` first; this page says what the owner wants for the
look, what was tried, what is proposed and what is yours to do. It holds nothing private (no addresses, hosts, accounts): keep it that way.

## What the owner wants (his words, translated)

- The game must look like his mockup picture of the harbour race at sunset "in everything: car, materials, road, surroundings"; only the car model may
  differ. Ask him for the picture file; it is not in the repository.
- "It needs a dynamic time of day, but at that time of day it must look like this." "Everything may be faked, but it must look good, not only at this
  time and angle, and in that state exactly like it."
- "Exactly this style: a clear mid-poly style." No photographed textures, nothing blocky, nothing empty or flat.
- "Do not make everything yourself: download things and look at how others do it when that is simpler or better."
- It must run well on a phone.
- Order after the look: one car perfect (model, lights, tyres), sound (engine, tyres, exhaust pops and fire), the new driving model and the harbour in the
  real game, car customisation, then more maps and cars.

## How to work with him (he stopped the planning session for going in circles)

- Think and agree first, then build. One step, one picture next to the mockup, **his decision**, then the next step.
- Do not release or push per small change. Releases, pushes and the deployment are the planning session's and need his yes.
- Report in German, short, pictures first. Say what was not checked.
- What cannot be judged without him: a real phone, sound by ear.

## Where things stand (live version 0.7.23)

- `game/lab-drive.html`: drive on the harbour quay (a ring of track). `?sound=1` unmutes, `?tier=low` is the phone tier, `?style=plain` the look before the
  mockup preset, `?hud=test` the test read-outs, H or the Data chip toggles them.
- `game/lab-harbour.html`: the still picture at the mockup's camera. `game/lab-sound.html`: the computed sound alone.
- `game/view/look/quay.js`: the scene (sky shader, toon shading patch `toon()`, painted road with a mask picture, smoke as picture puffs, palms, stand,
  crowd, cranes, ship, lighthouse). `finish.js`: the finish in one pass (glow, streaks at speed, outlines from depth, film curve, colour steps).
  `flames.js`, `carlights.js`: tail-pipe flames and the car's lamps.
- `game/lab-drive-quay.js`, `lab-drive-core.js`, `lab-drive-hud.js`: the drive page, its shared core, the mockup-style display.
- `game/sim/sim2.js`: the driving model (per-wheel tyres, suspension, engine, gearbox; assists arcade, sport, sim). `sim/enginemodel.js`,
  `sim/tyremodel.js`, `audio/engine-worklet.js`: the computed engine and tyre sound. The owner has not judged the sound by ear yet.
- Models and their licences: `docs/ASSETS.md`, `game/data/credits.json` (a test fails for a file without an entry). `tools/make-quay-assets.mjs` shrinks them.
- Checks: `node --test game/ tests/js`; `scripts/premerge.sh` (also loads the lab pages under the app's content policy); `node tools/simdrive.mjs
  --page=lab-drive.html --sim --seconds=6 --keys= --query="drive=13&angle=0.55" --shot=out.png` drives and takes a picture; `node tools/pageeval.mjs
  <url> <wait> <expr> <w> <h> <png>` loads a page and takes one. `scripts/test.sh` (the app's tests) needs Docker.
- The app's content policy forbids fetching `blob:` addresses: every glTF loader needs the plain-images plugin (`tests/js/model-pictures.test.mjs`).

## What was tried and why it was dropped

- Objects built from code primitives (boxes): rejected as ugly. Only extruded things are fine from code: road, kerb, barriers, fences, rails.
- A blocky free kit (Kenney): "far too low-poly and static".
- A physically lit scene from mixed downloads, pushed towards the picture with shaders and many small releases: each step "a bit closer", none a
  decision. The models come from eight sources and do not belong together; the car is boxy next to the mockup's smooth coupe.
- Painting the light into the textures (unlit materials): fits the picture best, but **he needs a dynamic time of day**, so it is out.

## What is proposed (NOT yet agreed: confirm with the owner before building)

1. **Textures without light:** plain colours and gradients from one small palette picture for the whole world; flat graphics for signs, banners, kerb
   and tyre marks. That is the mockup's style and it lets every colour move with the time of day.
2. **The look from light and finish:** the toon light model (soft steps, coloured shadows, a rim) plus a **colour script keyed over the day** (dawn, noon,
   sunset, dusk, night): sun colour and place, shadow colour, sky, haze, grade. The **sunset key is tuned against the mockup from the mockup's camera**;
   that is the acceptance test. Other times and angles are judged on one sheet: five times by three angles.
3. **Models by kind:** the car from a human-made model (separate wheels, clean surfaces); props (palms, people, crane, ship, lighthouse, stand) by
   image-to-3D from pictures made in the mockup's style (each object alone, neutral flat light, plain background, so no sunset sticks in the texture);
   extruded things from code.
4. **First step:** a small look-dev stage (`game/lab-lookdev.html`): a ball, a car, a palm, a barrier and a figure on a ground disc, with a
   time-of-day slider. Tune the light model and the sunset key there against crops of the mockup. Put three test models on it, one per source, so he
   can judge whether the model quality is enough before a world is built from it.

## Image-to-3D: what was found out (pages read 2026-11-27; check again, this moves fast)

| Program | Licence | Graphics memory | Runs on | Verdict |
|---|---|---|---|---|
| TRELLIS (Microsoft) | MIT, code and models | "at least 16GB" | tested on Linux only | fits on paper; tight on a 16 GB card |
| TRELLIS.2 | MIT | "at least 24GB" | Linux | too much for 16 GB |
| Hunyuan3D-2 (Tencent) | its licence "does not apply in the European Union, United Kingdom and South Korea" | 16 GB with texture | Windows, Linux | do not use: the owner is in the EU |
| Stable Fast 3D, SPAR3D (Stability) | not verified; the weights sit behind a sign-in | 6 and 10.5 GB | Windows experimental | check the licence first; SF3D says it removes the light from the colour |

An online service is the quickest first test of the real question (is image-to-3D good enough in this style); an account and any cost are the owner's.
Whatever is used: a model goes into the repository only with its source and licence in `docs/ASSETS.md` and `credits.json`, mid-poly, with small textures.

## The car

- The game's car is an AE86 (`game/assets/cars/ae86-hi.glb`, boxy). The mockup shows a smooth, wide white coupe with ring tail lamps.
- Looked at so far (Sketchfab, CC BY): "Subaru BRZ (ZC6)" by Car2022, model `321a9ece66bb4616872892c01d279542`: a SketchUp export, 58 flat meshes, about
  100k of its 148k triangles are edge lines to drop, the four wheels sit in shared meshes (cut by position, hub as pivot), one paint material, tail
  lamp parts present; about 45 to 50k triangles after the edges go, too many for the phone tier without reduction. "Scion FR-S Tuning 2013 for
  3D-printing" by fishermans: one solid piece without wheels or colours, not usable. A cleaner human-made coupe may exist: search before building a tool.
- Other candidates seen: "Palm tree" by galaxxxy (`95cd1a77789241ee82a960bad5dfe809`, in use), "Hand Painted Stylized Coconut Palm Tree Island" by
  Kigha (`0935d409de024174b2a231b47263a7cd`), smoke pictures from Kenney's "Particle Pack" (CC0, in use).

## What is yours on this machine

1. Agree the proposal above with the owner (or what he wants instead). Nothing below without that.
2. Set up what image-to-3D needs and prove it on ONE object (a palm): picture in, model out, cleaned to mid-poly, in the game's page next to the mockup
   crop. Tell him program, source and download size before installing; installs on his PC are his to allow.
3. The look-dev stage with the time-of-day slider and the colour script keys; the sunset key against the mockup.
4. Report with pictures; push nothing without his yes; hand the finished pieces back as a branch.

## Rules that always hold (from `CLAUDE.md`)

- Nothing private in the repository or its history. Commit as `drift builder <builder@example.invalid>`.
- Assets only CC0 or CC BY, each with its line in `docs/ASSETS.md` and its entry in `credits.json` before it is committed. No brand logos, no names
  from games or anime.
- three.js is vendored (r186, no build step, no import map, no inline script or style). Small and readable code.
- Update `docs/STATE.md` at the end of your work.
