// The model files in game/assets/cars follow docs/CAR-MODELS.md: parsed by the real GLTFLoader, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { SLOTS, WHEEL_NAMES, slotOf, countOf } from './carglb.js';

const dir = new URL('../assets/cars/', import.meta.url);
const parse = (file) => { const b = fs.readFileSync(new URL(file, dir)); return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const limits = { 's15-test.glb': { tris: 15000, calls: 12, kb: 600 }, 's15-test-hi.glb': { tris: 40000, calls: 20, kb: 2000 },
  'rx7.glb': { tris: 15000, calls: 12, kb: 600 }, 'rx7-hi.glb': { tris: 40000, calls: 20, kb: 2000 } };

for (const [file, lim] of Object.entries(limits)) {
  test(`${file} follows the rules`, async () => {
    const { scene } = await parse(file);
    for (const w of WHEEL_NAMES) {
      const n = scene.getObjectByName(w); assert.ok(n, w);
      assert.ok(n.quaternion.angleTo(new (n.quaternion.constructor)()) < 1e-6, w + ' has no rotation');
      assert.ok(n.position.y > 0.2 && n.position.y < 0.5, w + ' centre height');
    }
    scene.traverse((o) => { if (o.isMesh) assert.ok(slotOf(o.material.name), 'slot name: ' + o.material.name); });
    const c = countOf(scene);
    assert.ok(c.triangles <= lim.tris, `${c.triangles} triangles`);
    assert.ok(c.drawCalls <= lim.calls, `${c.drawCalls} draw calls`);
    assert.ok(fs.statSync(new URL(file, dir)).size / 1024 <= lim.kb, 'file size');
    assert.ok(SLOTS.length === 9);
  });
}
