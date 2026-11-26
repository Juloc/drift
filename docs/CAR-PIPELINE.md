# Car pipeline: picture -> TRELLIS.2 -> Blender -> game file

Look decided by the owner (2026-11-25): the cars look like the mockup's car, **smooth shaded with glossy paint**, not hard
faceted low-poly. Only the smooth files are made (`<car>.glb`, `<car>-hi.glb`); the flat low-poly variant was dropped.
Input from now on: one clean template picture per car (white, three-quarter front, light grey background, no logos), not a
crop of a mockup. Logos come later as stickers in the game; the models stay without.

Status (first try, Silvia S15, from the mockup crop): **the pipeline runs end to end, the result is not good enough.** The cars come out recognisable
but lumpy (a scan look), window and lamp edges follow triangles, and smoothing melts the mirrors and the wing. The owner wants
clean cars that look real in a simple low-poly way; that needs a **new mesh built over the generated one** (retopology), not a
thinned-out generated mesh. See "Next" at the end. The S15 files of this try are not in the repository (pictures and files are in
the session notes, `car-s15/`).

## The machines

- Dev VM (here): scripts, the game, the headless browser for pictures (`tools/carshots.mjs`).
- The GPU PC, SSH alias `gpu` (key login, user without admin). ComfyUI 0.46 with TRELLIS.2 (`C:\AI\ComfyUI`), Blender 4.5 LTS
  (`C:\AI\Blender\blender.exe`, headless with `-b -P`), working folder `C:\AI\work\<car>`, scripts in `C:\AI\scripts\drift`.
  Its address is not written anywhere in the repository; only the alias.

## Steps and commands

1. **Picture.** Copy the reference to the PC, crop the car with the PC's embedded Python (PIL), square, black margin:
   `scp ref.webp gpu:C:/AI/in/` and `ssh gpu "C:\AI\ComfyUI\python_embeded\python.exe C:\AI\scripts\drift\crop_ref.py in.webp out.png L T R B"`
   (the box is chosen by eye: manual). The background is removed inside the workflow (node 192 BiRefNet, node 312 crop to mask);
   no extra nodes.
2. **TRELLIS.2.** `ssh gpu "C:\AI\start-comfyui.cmd"`, tunnel `ssh -N -L 127.0.0.1:8188:127.0.0.1:8188 gpu`, then
   `python3 tools/gpu/trellis_run.py trellis2_api.json crop.png <prefix> --out DIR` (uploads, sets nodes 122 and 322, queues,
   polls `/history`, downloads the .glb and the previews). Workflow unchanged (INT8, shape 1024, texture 1024, 30 000 triangles).
   S15: **81 s**, 4.3 MB .glb, the masked input was clean. `ssh gpu "C:\AI\stop-comfyui.cmd"` afterwards.
3. **Look at the raw model:** `blender -b -P look.py -- raw.glb outdir` (Workbench, six orthographic views; works headless).
4. **Game files:** `tools/gpu/car_variants.sh <car>` copies the scripts and `tools/blender/cars/<car>.json` to the PC and runs
   `tools/blender/car_from_trellis.py` once per variant (smooth, smooth-hi), 4 to 8 s each. What the script does is in
   its header: turn and scale to the real length, find the generated tyres by their contact patches (wheelbase and track),
   centre, mirror one side, cut the generated wheels out with a boolean cylinder per wheel (a clean round wheel well),
   erase lettering boxes in the texture, decimate symmetrically, cut the mesh along the edges of windows and lamps in the
   texture (contour cut), sort faces into slots by colour and place (paint, glass, plastic, light_front, light_rear),
   keep the texture on paint and plastic, put the code model's wheels at the found centres, check with `prepare_car.py`, export.
5. **Pictures and numbers:** `node tools/carshots.mjs <glb name> <dir> front,rear,side,phone` (showroom, one headless browser,
   nice 10) and `node tools/glbinfo.mjs file.glb` (triangles, vertices, bytes per primitive).

Per car by hand (in `tools/blender/cars/<car>.json`): the crop box, which way the front points, which side to keep, the
generated tyre's radius and axle height (one side slice, `cut`), the boxes for lamps and the belt line, lettering boxes to erase.

## What came out for the S15

| File | Triangles | Draw calls | Size | Load (headless, software) |
|---|---|---|---|---|
| smooth, phone (`s15.glb`) | 14 653 | 9 | 592 KB | 0.7 s |
| smooth, high (`s15-hi.glb`, no decimation) | 29 191 | 13 | 954 KB | 2.9 to 3.9 s |
| (dropped) lowpoly, flat, vertex colours | 6 265 | 9 | 506 KB | 1.1 to 3.9 s |

Sizes from the scaled model: 4.445 m long, 1.26 m high (real 1.285), 1.91 m wide with mirrors, wheelbase 2.49 m (real 2.525),
track 1.55 m. (The dropped flat variant needed three vertices per triangle, so its file was large for its triangles.)

What went wrong and what was learnt:
- Cutting the tyres face by face leaves a saw tooth; a boolean cylinder gives a clean wheel well (kept).
- Slot borders on faces zigzag; cutting along the texture's edge (contour) helps but the generated shape itself is wavy.
- Laplacian smoothing (3 rounds) melts mirrors and the wing; 1 round is the most it takes.
- QuadriFlow (quad retopology in Blender 4.5) refuses the TRELLIS shell ("needs to be manifold") even after a voxel remesh
  with no open edge; it works on a test object. A voxel remesh plus smoothing plus decimation was worse than plain decimation.
- Blender writes a colour attribute twice unless `render_color_index` is set, and TRELLIS' own vertex colours must be removed.
- The mockup had small lettering on the doors; it is painted over in the texture (`erase`).

## Loading path change (kept)

`game/view/carglb.js`: a base colour texture and vertex colours in a file are no longer thrown away; they multiply the slot's
colour (so the garage paint still decides the paint), on one shared copy of the slot's material. Test in `carglb.test.mjs`.
`docs/CAR-MODELS.md` still says "colours and textures in the file are ignored": to be changed once a model uses it for real.

## Downloaded models (the normaliser)

Plan of the owner (2026-11-25): free, well built models (for example from Sketchfab) instead of generated ones; TRELLIS
template pictures only for a car without a usable free model. Before a file of a model is committed, its source, author and
licence go into `docs/ASSETS.md` (CLAUDE.md rule 6) and into the car file's `source` block.

`tools/blender/car_normalize.py` makes a game file of a download; `tools/gpu/car_normalize.sh <car> <model path on the PC> [phone high]`
copies the scripts and `tools/blender/cars/<car>.json` to the PC, runs both tiers (1 to 2 s each for a 12 000 triangle car)
and fetches `game/assets/cars/<car>.glb` and `<car>-hi.glb`. Put the download on the PC first (`scp model.fbx gpu:C:/AI/work/<car>/`).

What it does (details in the script's header):
- imports .glb, .gltf, .fbx, .obj or .blend; applies modifiers, bakes transforms, drops cameras, lights, empties, bones, hidden
  objects and whatever `drop` names (driver, number plate, ground plane);
- turns it by `up` and `front` (look at it first with `look.py`), scales it uniformly by the real length or wheelbase (`scale_by`);
- finds the wheels by name (wheel, tyre, rim, Reifen, Felge ...) and by shape (round side, at a corner, near the ground); when the
  wheels are inside bigger meshes, the loose parts are searched; brake calipers stay with the body;
- centres it after the rules (origin in the middle of the wheelbase, tyres on y = 0, symmetric wheel positions);
- gives every material a slot by name: first the car file's `slots` (regex -> slot), then a built-in list in English and German,
  the rest becomes `plastic` and is marked UNKNOWN in the printed table; one merged mesh per slot, no textures, UVs only on carbon,
  no interior in the phone file;
- wheels: `"wheels": "game"` puts the game's (code model's) wheels at the model's centres, scaled to its tyre; `"model"` keeps the
  model's own wheels as wheel_* nodes (phone: one mesh per wheel, at most about 800 triangles, the rim painted light grey into
  the vertex colours; high: rubber + chrome);
- decimates the big body slots (symmetric) to the tier's budget (`targets`, default 14 000 phone / 40 000 high, wheels included),
  small slots (lamps) stay; smooth normals with hard edges at 35 degrees; checks with `prepare_car.py`; exports.

**First real download: Mazda RX-7 FD** (Sketchfab, Lexyc16, CC BY 4.0, 36 000 triangles, glTF with 16 materials named
only `Material.0xx`). Steps: unzip on the PC with the embedded Python (`zipfile`, into `C:\AI\work\rx7\src`), read
`license.txt`; `blender -b -P tools/blender/materials.py -- scene.gltf` lists each material's colour, textures, triangles and
place, `look.py` shows the car; loose parts of the small materials located the emblems and lettering (all in `Object_14`,
dropped). The slots are a regex list in `cars/rx7.json` (manual: about 15 minutes). Wheels: the model's own (five spokes)
look clearly better than the game's; kept. Results (`docs/screenshots/cars/rx7-*.png`):

| File | Triangles | Draw calls | Size | Load in the showroom (headless, software) |
|---|---|---|---|---|
| `rx7.glb` (phone) | 13 995 | 10 | 428 KB | 0.8 to 1.0 s |
| `rx7-hi.glb` (high, with interior) | 35 934 | 15 | 873 KB | 3.4 to 5.1 s |

Scaled by the length 4.30 m: wheelbase 2.445 m (real 2.425), 1.27 m high with the wing (real 1.23), 1.86 m wide with
mirrors, tyre radius 0.327 m. In the game (`?glb=rx7`, car park, headless): the garage colour works (red and light blue seen),
it drifts, smoke and skid marks from the game's wheel layout; whole scene 48 862 triangles / 20 draw calls (phone tier),
83 812 / 33 (high). Known: on the phone tier the rims, thinned to 800 triangles each, look like plain light discs.

### Own materials (2026-11-26): the AE86 as the one car done right

The owner found the RX-7 with the game's plain slot materials ugly next to the original: downloads now keep their own
materials and textures, only the paint takes the garage colour (`docs/CAR-MODELS.md`, "The model's own materials").
`"materials": "own"` in the car file; `"slots"` then names only the paint and the glowing lamps (`lamp_front`, `lamp_rear`),
everything else stays the model's own. Flat materials are combined into one palette material (8 x 8 texels a material, colour
and metal/roughness), so the AE86's 13 materials are 9 draw calls on both tiers. The downloads' own normals were smooth across
coarse flat panels (a glossy black hood looked like crumpled foil): new normals, smooth with hard edges above 30 degrees
(`"smooth_angle"`, `"keep_normals": true` keeps the file's). Reference: `look.py --engine CYCLES` renders the original download
on the PC (`--views '{"front": [0.62, -0.79, 0.28]}'`).

AE86: phone 13 890 triangles / 9 draw calls / 570 KB, high 25 552 / 9 / 1 013 KB (wheels 1 500 and 4 414 triangles each).
The model has **no interior** (opaque black glass) and its pop-up lamps are **fixed up** and part of the body (no state
possible without remodelling). In the game: `?model=ae86` (the car is not in `cars.json` yet). Pictures
`docs/screenshots/cars/ae86-{front,rear,side,phone,drift-phone,drift-wide}.png`.

### Round for the touge acceptance list (G1 to G8), 2026-11-26

- Done at load from `cars.json` `fx` while the GPU PC is off (no new export needed): `glassUv` (the windows out of the palette into
  dark tinted glass), `tyreUv` (the tyres out of each wheel, with UVs and a tread normal map), `paintParts` (the AE86's bonnet and
  nose: up-facing faces of the black trim field in a box take the garage paint, as on the real car; a dark bonnet can become an
  option later).

- Headlight pool (G6): a flat 5 x 11 m sheet (2 x 6 segments) with a fan texture (hard near edge, fading far ahead), laid on
  the road every frame (each point 1.5 cm over `field.groundY`), warm white, additive, no depth writes.
- Lamps (G3): rear lamps glow at 3.2 (brake 2.5 times that), a soft camera-facing halo of 35 to 40 cm at each lamp (depth tested,
  bigger and brighter when braking), the front lamps warm white halos.
- Exhaust (G7): two crossed 16 x 30 cm quads (20 to 40 cm with the pop's strength), 60 to 120 ms, white-blue core, orange edge,
  a weak pop smaller and bluish, a small flash at the tip and a warm flash on the road under the rear.
- Tyres and rims (G5): the tyres matt rubber (were "metal 1" in the download), the rims gun metal (metal 0.7, rough 0.3, so the
  sunset does not turn them orange); skid marks at the model's own rear wheels (`fleet.dims`, also for the other visitors' cars).
- Paint (G1, G2): the game's paint is a solid colour under a clear coat (metal 0.05, rough 0.45, coat 1, coat rough 0.05) on the
  high tier, rough 0.22 on phones. A calm reflection of the dusk sky needs an environment map made from the look's own sky:
  `stage.js` (the look session's).
- Underglow: one soft pad of light under the whole car (zero at every edge) plus the thin sill strips; the floor pan only
  between the axles, the silencer an oval drum.
- Pictures: the look probe takes `?model=ae86&paint=ffffff&pop=1` and dresses a model car with the same effects
  (`ae86-probe-touge.png`, `ae86-probe-touge-phone.png`); the showroom takes `&pop=1&brake=1&glow=16&steer=0.3`
  (`ae86-rear-fx.png`). C# tests 227 green, Node tests 158 green.

### The AE86 as car 1, and its effects (2026-11-26)

- Car 1 ("Pip") is now the **AE86** (`game/data/cars.json`: mass 940, power 7.6, top 33, grip 1.05, slide 0.78, agility 1.25,
  `"model": "ae86"`; the name also in `GarageStore.CarNames`, the garage bars in `src/Drift/wwwroot/app.js`, `engine.js`'s
  name and the sim tests; engine sound and the relay's speed check stay per slot). The game takes the model from the car
  (`cars[carIndex].model`, else `rx7`); `?model=<file>` and `?paint=ffffff` remain for pictures.
- `game/view/carfx.js` (tests in `carfx.test.mjs`): `dressCar` puts an underbody (floor pan, axles, drive shaft, differential,
  exhaust pipe and silencer, one draw call), a contact shadow in the car's footprint (no circle) and a headlight pool on the
  road on the template, so every copy has them; `carFx` gives one car brake lights that brighten when braking (its own copies
  of the `lamp_rear_` materials), flames and a flash at the exhaust (`cars.json` `fx.exhaust`) and underglow as two strips
  along the sills plus their light on the road (`?glow=` / the garage setting; replaces the round patch for a model car).
- **Pops:** the game fires `car.pop` on `window` (`detail.strength` 0..1) when the throttle drops from above 0.7 to below 0.2 at
  more than 8 m/s, at most every 400 ms, and plays the bang itself (`game/main.js`, the drift session's code); the flames
  listen to that event only (a strong pop gets one or two smaller after-bangs), so sound and picture go together. Shift
  pops would come as the same event from the engine's virtual gearbox, if the game adds them.
- Pictures from the game (map 2, the sunset look, `?demo=line`, white paint): `docs/screenshots/cars/ae86-game-drift-dusk.png`
  (high, 52 km/h, 45 degrees, flame) and `ae86-game-drift-phone-glow.png` (low tier, phone size, underglow on). In the game the
  black lower half still looks grey: the painted style of the look (`paintCar`'s dust near the ground) also tints the model's own
  materials; the look branch takes that style out.
- Glass and rims without the GPU PC: `tools/glb-palette.mjs` draws a palette material's two textures again from a list
  (`tools/blender/cars/ae86.palette.json`) and puts them into the .glb as PNG: the glass (Material.011, a matt metal plate in the
  game) is dark tinted smooth glass, the rims gun metal with a shine; `cars/ae86.json` has the same `"overrides"` for the next
  export. **Waiting for the GPU PC** (off since 2026-11-26 evening): the RX-7 in the own-materials way and the
  fix of the wheel sides (the first version of `prepare_car.to_gltf` flipped x, so every file names its left wheels right; the
  game does not mind, the next export of each car corrects it).

### Batch 1 (2026-11-26): six more downloads

The same steps per car, about 15 to 30 minutes of looking and writing the car file; the runs take 2 to 4 s per tier.

1. `python -I tools/gpu/unpack_check.py C:\AI\work\<folder>` on the PC (embedded Python): unpacks every zip into `src\`
   (refuses paths that leave the folder), prints the licence file, the glTF's `asset.extras` and the materials. Only CC BY and CC0 go on.
2. `materials.py` (colour, textures, triangles, place of each material), `look.py` (the car from six sides) and `matcolours.py`
   (front and rear with one flat colour per material and the legend): which material is paint, glass, lamps, tyres, rims, and
   which carries an emblem.
3. `tools/blender/cars/<car>.json`: real sizes, the slot list (`slots`), what to `drop` (emblem materials, ground planes),
   `drop_boxes` (faces of a material inside a box: letters that share a material with chrome or trim), `slot_boxes` (a lamp
   material used at the front and the rear: the rear faces become `light_rear`). `parts.py` prints the loose parts of
   some materials with their boxes, for the box numbers.
4. `tools/gpu/car_normalize.sh <car> <scene.gltf on the PC> "phone high"`, then `matcolours.py` on the finished `-hi.glb`
   (axis `+z`) to see that no emblem is left, then `node tools/carshots.mjs <car> docs/screenshots/cars front,rear,side,phone`.
5. `python3 tools/credit_car.py <car> "<removed, English>" "<entfernt, Deutsch>" <phone tris> <high tris>`: the entry in
   `game/data/credits.json` and the row in `docs/ASSETS.md`. `node --test tests/js/credits.test.mjs game/view/carfiles.test.mjs`.

Changes to the normaliser on the way: a dropped material takes its emptied object along; wheel parts keep their own
material's brightness in the vertex colours (the phone rims show their spokes); `drop_boxes` and `slot_boxes`; the high
tier keeps a wheel to about 2 500 triangles (`wheel_tris_high`) so that the body gets the budget.

| Car | File (phone / high) | Triangles | Draw calls | Size | Wheelbase (real) | Removed |
|---|---|---|---|---|---|---|
| Toyota AE86 Trueno | `ae86` | 11 216 / 18 016 | 9 / 13 | 336 / 683 KB | 2.39 m (2.40) | plates, door lettering |
| Nissan Skyline GT-R R34 | `r34` | 13 997 / 39 994 | 11 / 15 | 416 / 1 002 KB | 2.66 m (2.665) | GT-R badges front and rear, plate |
| Nissan Silvia S14 | `s14` | 12 577 / 15 077 | 10 / 14 | 392 / 443 KB | 2.52 m (2.525) | plates with lettering |
| Mazda RX-7 FC | `fc` | 13 995 / 39 995 | 9 / 13 | 430 / 1 012 KB | 2.43 m (2.43) | lettering front and rear, ground plane |
| Mazda MX-5 NA | `mx5` | 13 994 / 39 994 | 10 / 14 | 388 / 985 KB | 2.31 m (2.265) | nothing (no emblems) |
| Porsche 911 930 Turbo | `p930` | 13 995 / 39 997 | 10 / 14 | 482 / 1 160 KB | 2.28 m (2.272) | rear reflector lettering (a texture) |

All with their own wheels (better than the game's), scaled by the real length (the MX-5 comes out 2 % long in the wheelbase).
Loading in the showroom (headless, software graphics, the VM under load): phone files 0.1 to 2.3 s, high files 2.5 to 28 s.
Pictures: `docs/screenshots/cars/<car>-{front,rear,side,phone}.png`. **Not checked:** a drift in the game with these cars (only
the RX-7 was driven), a real phone, the files in the website's copy. The cars are not in `game/data/cars.json` yet (no car
ids); try them with `?glb=<file name>`.

Tested with a made-up download: `tools/blender/make_foreign_test.py` turns the code model's S15 into foreign names, centimetres,
front along +X and loose wheel objects, written as .glb, .fbx and .obj (`cars/test-foreign.json`: game wheels, scale by length;
`cars/test-foreign-own.json`: the model's own wheels, scale by wheelbase). All three formats and both tiers came out after the
rules and looked like the original in the showroom; a 5 000 triangle budget decimated the body 6 392 -> 3 106. Two naming traps
were found and fixed on the way ("trim" contains "rim", "black" contains the German "lack"). **Not tried yet: a real download**
(odd names, many parts, textures only, missing faces, non-symmetric details); expect to add names to `slots` and `drop` per car.

## Emergency way for generated cars: the loft (tried once, S15)

Only for a car without a usable free model. `car_variants.sh <car> loft` runs `car_from_trellis.py --variant loft`: TRELLIS is the
blueprint, the body the game sees is new.
- **Sections:** 56 stations along the car (denser at the ends), 36 rays per half section from the section's middle; rays
  pointing up go from inside (first surface: not the wing, not a mirror), rays from 75 degrees down come from outside
  (the outermost: flares, sills, tyres). Taken from the shell **before** the wheel wells are cut. A 3x3 median and a light blur,
  mirrored to the other side, lofted into one closed quad mesh, the ends capped.
- **Attachments:** faces of the generated mesh more than 3.5 cm outside the loft and above 0.75 m (mirrors, wing) are added,
  thinned to 1 500 faces; crumbs under 60 faces dropped.
- Wells cut again (boolean); no texture: plain slot colours. Slot edges are cut along the blurred texture (glass, lamps, and the
  dark low parts as plastic), the well walls are plastic, a dark lip around a well is paint.
- S15: 13 593 triangles, 9 draw calls, 334 KB, 6 s on the PC. Pictures in the session notes (`car-s15/s15-loft-*.png`).

**Verdict (S15):** clearly better than the thinned-out scan: the big panels are smooth (no bumps), clean round wells, the wing
and the mirrors stay. **Still far from the mockup:** the front is a soft lump (no grille, intakes or lamp shapes; a front face
lies across the sections and is not caught by them), window and lamp edges still zigzag (they follow a blurred texture),
no crisp creases or panel lines. Reaching the mockup would mean modelling lamps, grille and creases as parts: that is hand work
per car. Good enough at most as a stand-in for a car nobody has a model of; downloads first.

Not checked in this try: a drift on the car park with the files, a real phone, the website's copy.
