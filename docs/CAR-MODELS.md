# Car models: the rules for a model file

A car comes as a `.glb` (glTF 2.0 binary) that falls into the game **without rework**. The game replaces the materials, finds the wheels by name and drives them.
`tools/blender/prepare_car.py` checks a Blender scene against these rules and exports it; `game/view/carglb.js` is the loading path; `game/assets/cars/s15-test*.glb`
are test models written by `tools/export-s15.mjs` (the proof that the path works).

## Files and tiers

| File | For | Triangles | Draw calls | Size |
|---|---|---|---|---|
| `game/assets/cars/<id>.glb` | phones, and every device when there is no `-hi` | **at most 15 000** | **at most 12** | **at most 600 KB** |
| `game/assets/cars/<id>-hi.glb` (optional) | the high tier | about 40 000 (hard limit 60 000) | at most 20 | at most 3 MB |

- `<id>` is the car's small index from `game/data/cars.json` (0, 1, 2 ...). Two **separate files**, not two LODs in one file: a phone then downloads one file only.
- Draw calls = one per mesh primitive. Phone file: one mesh per slot, and **each wheel is one primitive** (slot `rubber`; the rim is painted into the vertex colours, a light grey), so 7 body slots + 4 wheels = 11. Leave `interior` out of the phone file. High file: a wheel may have two primitives (`rubber`, `chrome`).
- Textures only where they are needed (at most 1024 x 1024, webp or KTX2 is **not** loaded yet: use embedded PNG/webp only when a model truly needs one). No texture is the default: colour comes from the slot's material and from vertex colours.
- Compression: **none** for now (the meshopt decoder carries inline WebAssembly, which the content policy would have to allow; see `vendor/README.md`). Whoever needs it later proposes the policy change first. Quantised attributes are not used either.
- No logos, emblems or readable lettering baked into a model: brands and logos are covered by the owner's licences (`docs/ASSETS.md`) but come later as **stickers** in the game, not in the mesh or its textures.

## Axes, scale, origin

- glTF 2.0, **Y up, 1 unit = 1 metre**, the car's **front is +Z**, so the car's **left side is +X** (right-handed).
- In Blender (Z up): the car looks along **-Y**, up is +Z, 1 unit = 1 m; the glTF exporter option "+Y up" turns that into the above. The script checks both.
- **Origin: the middle of the wheelbase, on the ground** (x = 0, z = 0 between the axles, y = 0 where the tyres touch). The ground contact of all four tyres is at y = 0 (within 1 cm).
- Size like the real car: wheelbase and track as in life; the game's physics numbers do not read the model, but the camera and the shadow do (length about 4 to 5 m, width about 1.7 to 1.9 m).
- The car is **symmetric about x = 0**; no scale other than 1, no rotation on any node except the wheels' own children (apply transforms before export).

## Objects

```
car                      (root, any name)
  body_<slot> ...        one mesh per slot, any name; the material name decides
  wheel_fl  wheel_fr  wheel_rl  wheel_rr
    <meshes of the wheel>
```

- The four wheels are **nodes of exactly these names** (`fl` front left = +X front, `fr` front right, `rl`, `rr`). Each node's **origin is the wheel centre**, it has **no rotation and scale 1**, and everything of the wheel hangs below it (tyre, rim, disc).
- The axle is the node's **local X**. The game spins the wheel around X (the same angle on all four, forward = the same sign), so a left wheel must be modelled **outward = +X**, a right wheel **outward = -X**: the rim face is built mirrored, not the node. No camber and no toe in the model (the game does not know them).
- Front wheels steer around the **vertical axis through the wheel centre** (Y of the pivot at the node's position). Rear wheels do not steer.
- Wheel radius about 0.30 to 0.36 m, centre height = radius (the tyre touches the ground).
- Anything that has to move besides wheels (doors, wipers) is not supported.

## Material slots

A material's **name** is its slot (`paint.001` counts as `paint`; case does not matter). The game **replaces every material** by its own; colours and textures in the file are ignored (vertex colours of `rubber` are kept).

| Slot | What goes there | The game's material |
|---|---|---|
| `paint` | all body panels (the garage colour goes here) | clearcoat paint (high), standard (phone) |
| `glass` | windows, headlight covers if clear | dark tinted glass |
| `chrome` | rims, exhaust tips, trim, door handles | mirror metal |
| `rubber` | tyres; **vertex colours** `COLOR_0`: dark tread, lighter sidewall (and a grey rim in the phone file) | matt rubber with vertex colours |
| `plastic` | black plastic: grille, mirrors, lower bumper, seams, arch liners, underbody | matt black |
| `carbon` | body-kit parts, wing, splitter (UVs needed: the game draws the weave) | carbon with weave |
| `light_front` | headlamp lenses | unlit, glowing white |
| `light_rear` | tail lamps, reverse light | unlit, glowing red |
| `interior` | seats, dashboard, anything inside (**high file only**) | matt dark |

A material with any other name becomes `plastic` and is reported in the console. Fewer slots than listed are fine. Every slot is **one merged mesh** (the whole body in one mesh per slot, not one mesh per panel).

### The model's own materials (`own_`, `lamp_front_`, `lamp_rear_`)

Since 2026-11-26 a downloaded car keeps its own look (the owner's decision): besides the slot names above, a material may be
- `own_<name>`: the game keeps the file's material as it is (PBR: colour, metal, roughness, its textures), adds its room for
  the reflections;
- `lamp_front_<name>`, `lamp_rear_<name>`: the file's material, glowing in its own colour or texture (headlamps, amber
  indicators, textured tail lamps).
Only `paint` is the game's (the garage colour). `tools/blender/car_normalize.py` with `"materials": "own"` writes such files:
all flat materials of a kind become one material with a small palette texture (colour; metal and roughness), so a car with
twenty original materials is still about ten draw calls. Textures at most 1024 (phone) / 2048 (high), webp; UVs are kept.

## Other rules

- Normals: smooth where the surface is curved, hard where there is an edge (split vertices), exported with normals. Tangents, cameras, lights, animations, morph targets, skins: **none**.
- No hidden objects, no empty extra nodes besides the wheels' and the root.
- UVs only for `carbon` (and where a texture is used).
- Bounding box and names are checked by `prepare_car.py` before export and by `game/view/carfiles.test.mjs` for the files in the repository.

## Loading and fallback

`loadCarModel(name, { tier, materials })` (`game/view/carmodel.js`) tries `<name>-hi.glb` (high tier) and `<name>.glb`. A missing file, a broken file or a file without the four wheels gives `null`, and the game keeps the code model (`buildCar`). Try a file with `?glb=<name>` on the game page and in the showroom (`game/showroom.html?glb=s15-test&info=1`); the other cars are untouched. The garage has no 3D view yet (it shows colour swatches); a 3D preview is a design question for later.

## What the website must take over

The website's copy of the game has to ship the same `carglb.js`, `carmaterials.js`, `GLTFLoader.js` and helpers (hashes in `vendor/README.md`), serve `.glb` as `model/gltf-binary`, and show a replacement (the code model) for a car id it has no file for.
