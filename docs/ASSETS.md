# Assets: where every model, picture and library comes from

Rule: an outside file is committed only after it is listed here with source and licence.

## Models and pictures

All models are **our own code** (rounded boxes, cylinders and blobs merged by `game/core/build.js`). No file, mesh,
texture or sound from outside is in the repository. Pictures in `docs/screenshots/` are made by the game itself.

## Packs

None used.

## Own code copied from the owner's website project

`game/core/{build,bake,rng,materials,quality}.js` come from the website project `src/core/` (same owner, own code).
Changes: imports point to `vendor/three/` by relative path; the rounded box is `game/core/roundbox.js` (own, replaces
three.js's addon).

## Cars and names (licences)

The owner states that he holds licences for the vehicles and their names (2026-11-25); the proofs are with the owner, not in this repository. Brand and model names may appear in the garage. **No logos or emblems are drawn until the owner confirms that his licences cover them**: the models show shapes only. All car models remain our own code.

## Libraries (not assets)

three.js 0.186.0 (MIT), vendored in `vendor/three/` with licence and checksums (including `RoomEnvironment.js`, one import line changed, both hashes in the table), see [../vendor/README.md](../vendor/README.md).
