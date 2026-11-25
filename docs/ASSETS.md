# Assets: where every model, picture and library comes from

Rule: an outside file is committed only after it is listed here with source and licence.

## Models and pictures

The world and the five first cars are **our own code** (rounded boxes, cylinders and blobs merged by `game/core/build.js`).
Pictures in `docs/screenshots/` are made by the game itself. Car models from outside are listed below; each one also has
its line in `game/data/credits.json` (the text the game shows; CC BY needs the author named).

### Downloaded car models

| File | Title | Author | Source | Licence | Changed |
|---|---|---|---|---|---|
| `game/assets/cars/rx7.glb`, `rx7-hi.glb` | Mazda RX-7 FD | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/mazda-rx-7-fd-d35ff630df614771b82e7b2f59035b1e (Sketchfab UID d35ff630df614771b82e7b2f59035b1e) | CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real car's length, all materials replaced by the game's slots, emblems and lettering removed, reduced to 14 000 / 36 000 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/rx7.json` |
| `game/assets/cars/ae86.glb`, `ae86-hi.glb` | Toyota Corolla AE86 Trueno | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/toyota-corolla-ae86-trueno-fe02fba6302e450ea8424591493341ea (Sketchfab UID fe02fba6302e450ea8424591493341ea) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien zusammengefasst (scaled to the real car's length, its own materials and textures kept, the flat ones combined in one palette texture, the paint takes the garage colour, number plates and door lettering removed, 13 890 / 25 552 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/ae86.json` |
| `game/assets/cars/r34.glb`, `r34-hi.glb` | Nissan Skyline R34 GT-R | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/nissan-skyline-r34-gt-r-ff8fb2251dfa4bb9979e7022c5a6666c (Sketchfab UID ff8fb2251dfa4bb9979e7022c5a6666c) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real car's length, all materials replaced by the game's slots, emblems, lettering and the number plate removed, reduced to 13 997 / 39 994 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/r34.json` |
| `game/assets/cars/s14.glb`, `s14-hi.glb` | Nissan 200SX Silvia S14 | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/nissan-200sx-silvia-s14-f2a917a924734a89a020e7f970e55e7c (Sketchfab UID f2a917a924734a89a020e7f970e55e7c) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real car's length, all materials replaced by the game's slots, the number plates and their lettering removed, reduced to 12 577 / 15 077 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/s14.json` |
| `game/assets/cars/fc.glb`, `fc-hi.glb` | Mazda RX-7 FC | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/mazda-rx-7-fc-8ac0df459f514950ab83ac37109a06ab (Sketchfab UID 8ac0df459f514950ab83ac37109a06ab) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real car's length, all materials replaced by the game's slots, the lettering front and rear and a ground plane removed, reduced to 13 995 / 39 995 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/fc.json` |
| `game/assets/cars/mx5.glb`, `mx5-hi.glb` | Mazda Miata MX-5 NA | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/mazda-miata-mx-5-na-d51fcd44b74f4daf8012c41e0400c041 (Sketchfab UID d51fcd44b74f4daf8012c41e0400c041) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real car's length, all materials replaced by the game's slots, reduced to 13 994 / 39 994 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/mx5.json` |
| `game/assets/cars/p930.glb`, `p930-hi.glb` | Porsche 911 (930) Turbo 1975 | Lexyc16 (https://sketchfab.com/Lexyc16) | https://sketchfab.com/3d-models/porsche-911-930-turbo-1975-de1ffd344c41481892511f7fd332c136 (Sketchfab UID de1ffd344c41481892511f7fd332c136) | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), stated in the download's `license.txt` and in the glTF's `asset.extras` | verändert: verkleinert, Materialien ersetzt (scaled to the real car's length, all materials replaced by the game's slots, the lettering of the rear reflector (a texture) removed, reduced to 13 995 / 39 997 triangles), by `tools/blender/car_normalize.py` with `tools/blender/cars/p930.json` |

Checked for the cars after the RX-7 (2026-11-26): each download's `license.txt` and the glTF's `asset.extras` agree
(CC-BY-4.0, author, source); all are Sketchfab exports of Blender scenes with default object names, no sign of a game rip, **not
provable from the files alone**. Emblems, lettering and number plates were removed and looked for in a render with one colour
per material (`tools/blender/matcolours.py`). The downloads stay on the GPU PC. **Not used because of their licence**
(non-commercial, share-alike): 1991 BMW M3 E30 (OUTPISTON, CC BY-NC-SA 4.0), Honda Integra Type-R DB8 (Lexyc16, CC BY-NC
4.0), 2025 BMW M3 CS Touring (OUTPISTON, CC BY-NC-SA 4.0). Of two AE86 downloads the "Toyota Corolla AE86 Trueno" was taken;
"Toyota AE86 LOW POLY" (IvOfficial, CC BY 4.0) is one atlas texture with little shape and was not used.

Checked for the RX-7 (2026-11-25): the licence file and the glTF metadata both say CC-BY-4.0 with author and source; the
scene looks self-made in Blender (default object names like Plane, Circle, Cylinder, own materials), no sign of a game rip;
**not provable from the file alone**. The download itself (`mazda_rx-7_fd.zip`) stays on the GPU PC, not in the repository.

## Packs

None used.

## Own code copied from the owner's website project

`game/core/{build,bake,rng,materials,quality}.js` come from the website project `src/core/` (same owner, own code).
Changes: imports point to `vendor/three/` by relative path; the rounded box is `game/core/roundbox.js` (own, replaces
three.js's addon).

## Cars and names (licences)

The owner states that he holds licences for the vehicles and their names (2026-11-25); the proofs are with the owner, not in this repository. Brand and model names may appear in the garage. **Update 2026-11-26:** the owner confirms that his licences also cover **brands and logos**. Logos and emblems may therefore appear in the game; they are planned **later, as stickers** (a part of shaping the car, see `docs/VISION.md`), not baked into the car models, and the proofs stay with the owner, not in this repository. Until the sticker feature exists the models still show shapes only. All car models of the code path remain our own code. **The models stay without logos or emblems** (they are removed when a download has them).

## Libraries (not assets)

three.js 0.186.0 (MIT), vendored in `vendor/three/` with licence and checksums (including `RoomEnvironment.js`, one import line changed, both hashes in the table), see [../vendor/README.md](../vendor/README.md).

## Model-file loading (GLTFLoader)

`GLTFLoader.js`, its helpers `BufferGeometryUtils.js` and `SkeletonUtils.js`, and `GLTFExporter.js` (Node tool only) are vendored from `three@0.186.0` next to three itself, each with its one changed import line and both hashes in `vendor/README.md`. Meshopt/KTX2/Draco decoders are not vendored. The test models `game/assets/cars/s15-test*.glb` are written by our own `tools/export-s15.mjs` from the code model (own work, no outside file). The rules for real models are in `docs/CAR-MODELS.md`.
