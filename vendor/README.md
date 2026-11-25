# Vendored libraries

Everything here is loaded locally at run time. No CDN, no network requests to third parties.

## three.js 0.186.0 (r186), MIT

Source: npm package `three@0.186.0` (tarball `three-0.186.0.tgz`,
SHA-256 `61eeff9d7616005c9a481c796f52287d81fbbbc0d55eaca5565322924252c1aa`,
npm shasum `08f70ce80dffa9247a567b421165bec630e86f8d`).
The same files, unchanged, as in the owner's website project (compared by hash, not downloaded again).
The licence is in `three/LICENSE`.

| File here | From the package | SHA-256 |
|---|---|---|
| `three/three.module.js` | `build/three.module.js` | `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea` |
| `three/three.core.js` | `build/three.core.js` | `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6` |
| `three/addons/environments/RoomEnvironment.js` | `examples/jsm/environments/RoomEnvironment.js` | **patched**, see below. Original `55f466192cc84298755a424c5e040345006b2ee1455589b3b54126c2ea4123f4`; patched `dbc78a606724508ea6ddfb376b63689761cad07c49d879d0fa9c2ddc45c27dbc` |
| `three/LICENSE` | `LICENSE` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

Check: `cd vendor/three && sha256sum three.module.js three.core.js LICENSE`

One addon, **with one changed line**: `RoomEnvironment.js` (the studio-like room that `PMREMGenerator` turns into reflections, no download, no image) imports the bare name `three`, which needs an import map (an inline script, not allowed by the base's content policy), so its line `} from 'three';` is `} from '../../three.module.js';` here, and nothing else differs (`diff` against the file in the tarball shows that one line). Files of the game import this folder by relative path.

To update: `npm pack three@<version>` in a scratch folder, copy the same three files, update this table.
