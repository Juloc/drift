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

Tested with a made-up download: `tools/blender/make_foreign_test.py` turns the code model's S15 into foreign names, centimetres,
front along +X and loose wheel objects, written as .glb, .fbx and .obj (`cars/test-foreign.json`: game wheels, scale by length;
`cars/test-foreign-own.json`: the model's own wheels, scale by wheelbase). All three formats and both tiers came out after the
rules and looked like the original in the showroom; a 5 000 triangle budget decimated the body 6 392 -> 3 106. Two naming traps
were found and fixed on the way ("trim" contains "rim", "black" contains the German "lack"). **Not tried yet: a real download**
(odd names, many parts, textures only, missing faces, non-symmetric details); expect to add names to `slots` and `drop` per car.

## Next for generated cars (proposal, on hold: downloads first)

A clean body built over the generated shell, by script: cross-sections along the car (about 20 to 30 rings, 16 to 24 points
each, symmetric) found by casting rays at the TRELLIS shell, lofted into one even quad mesh; windows and lamps as their own
inset parts at the contour lines; wing and mirrors as simple separate parts fitted to the shell; smooth shading, glossy paint.
TRELLIS stays the blueprint for proportions; the mesh the game sees is regular. Needs the owner's yes first.
Not checked in this try: a drift on the car park with the files, a real phone, the website's copy.
