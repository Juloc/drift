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
| `three/addons/loaders/GLTFLoader.js` | `examples/jsm/loaders/GLTFLoader.js` | **patched** (same one line). Original `131c0f78c01d19368ae495caa65b3adaa10487810a36a05bb5901b769a35ac16`; patched `03952cb129d558f92b8e6c757fbf7c1f718b3126c4d34f264d574b40ea36054f` |
| `three/addons/utils/BufferGeometryUtils.js` | `examples/jsm/utils/BufferGeometryUtils.js` | **patched** (same one line). Original `9fb63427ce6641fa14fd0baff9cc4d1b5f9c3d85fd084bf2e90e803c44ec1797`; patched `259085a7dac89e0840393a9347c77123fbc4206ec2146bf0c29ffc72e14a2800` |
| `three/addons/utils/SkeletonUtils.js` | `examples/jsm/utils/SkeletonUtils.js` | **patched** (same one line). Original `b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f`; patched `28017bf37d0ecb0c4be6048db759ff14df729a562464830b064d4cc239c5af17` |
| `three/addons/exporters/GLTFExporter.js` | `examples/jsm/exporters/GLTFExporter.js` | **patched** (same one line). Original `d766b04f233fa8bc72bfaebacaac5ecb832c30ca3695ce8d84bbb7dccccdc842`; patched `063cde8cf50bd45d8ff0728d70c2decfe464d0e6498fa80aa1f3c03c32e6df4e` |
| `three/LICENSE` | `LICENSE` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

Check: `cd vendor/three && sha256sum three.module.js three.core.js LICENSE`

One addon, **with one changed line**: `RoomEnvironment.js` (the studio-like room that `PMREMGenerator` turns into reflections, no download, no image) imports the bare name `three`, which needs an import map (an inline script, not allowed by the base's content policy), so its line `} from 'three';` is `} from '../../three.module.js';` here, and nothing else differs (`diff` against the file in the tarball shows that one line). Files of the game import this folder by relative path.

More addons, same single changed line (`} from 'three';` to `} from '../../three.module.js';`): `GLTFLoader.js` with its two helpers `BufferGeometryUtils.js` and `SkeletonUtils.js` (loads the car models, `docs/CAR-MODELS.md`) and `GLTFExporter.js` (only used by `tools/export-s15.mjs` in Node to write the test model; the game does not load it). The meshopt decoder is **not** vendored: it carries inline WebAssembly, which the content policy would have to allow; car files are uncompressed for now.

To update: `npm pack three@<version>` in a scratch folder, copy the same three files, update this table.
