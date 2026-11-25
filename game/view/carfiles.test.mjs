// The model files in game/assets/cars follow docs/CAR-MODELS.md: parsed by the real GLTFLoader, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { SLOTS, WHEEL_NAMES, slotOf, ownOf, countOf } from './carglb.js';

const dir = new URL('../assets/cars/', import.meta.url);
// Node cannot decode pictures: every texture becomes an empty one (the test is about names, wheels and budget, not pixels).
// A plugin with the name of a built-in one replaces it in its place, so this one is asked first for every texture.
const noPictures = () => ({ name: 'EXT_texture_webp', loadTexture: () => Promise.resolve(new THREE.Texture()) });
const parse = (file) => { const b = fs.readFileSync(new URL(file, dir)); return new GLTFLoader().register(noPictures).parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
// every model file in game/assets/cars: the phone limits, or the high tier's for a -hi file (docs/CAR-MODELS.md)
const limits = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))
  .map((f) => [f, f.endsWith('-hi.glb') ? { tris: 40000, calls: 20, kb: 2000 } : { tris: 15000, calls: 12, kb: 600 }]));

for (const [file, lim] of Object.entries(limits)) {
  test(`${file} follows the rules`, async () => {
    const { scene } = await parse(file);
    for (const w of WHEEL_NAMES) {
      const n = scene.getObjectByName(w); assert.ok(n, w);
      assert.ok(n.quaternion.angleTo(new (n.quaternion.constructor)()) < 1e-6, w + ' has no rotation');
      assert.ok(n.position.y > 0.2 && n.position.y < 0.5, w + ' centre height');
    }
    scene.traverse((o) => { if (o.isMesh) assert.ok(slotOf(o.material.name) || ownOf(o.material.name), 'slot or own name: ' + o.material.name); });
    const c = countOf(scene);
    assert.ok(c.triangles <= lim.tris, `${c.triangles} triangles`);
    assert.ok(c.drawCalls <= lim.calls, `${c.drawCalls} draw calls`);
    assert.ok(fs.statSync(new URL(file, dir)).size / 1024 <= lim.kb, 'file size');
    assert.ok(SLOTS.length === 9);
  });
}
