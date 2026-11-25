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

## Libraries (not assets)

three.js 0.186.0 (MIT), vendored in `vendor/three/` with licence and checksums, see [../vendor/README.md](../vendor/README.md).
