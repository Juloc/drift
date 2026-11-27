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

The owner states that he holds licences for the vehicles and their names (2026-11-25); the proofs are with the owner, not in this repository. Brand and model names may appear in the garage. The owner confirmed (2026-11-25) that his licences also cover the marks; logos will come later as stickers drawn by the game. **The models stay without logos or emblems** (they are removed when a download has them).

## Libraries (not assets)

three.js 0.186.0 (MIT), vendored in `vendor/three/` with licence and checksums (including `RoomEnvironment.js`, one import line changed, both hashes in the table), see [../vendor/README.md](../vendor/README.md).

## Model-file loading (GLTFLoader)

`GLTFLoader.js`, its helpers `BufferGeometryUtils.js` and `SkeletonUtils.js`, and `GLTFExporter.js` (Node tool only) are vendored from `three@0.186.0` next to three itself, each with its one changed import line and both hashes in `vendor/README.md`. Meshopt/KTX2/Draco decoders are not vendored. The test models `game/assets/cars/s15-test*.glb` are written by our own `tools/export-s15.mjs` from the code model (own work, no outside file). The rules for real models are in `docs/CAR-MODELS.md`.
