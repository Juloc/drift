import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { SLOTS, allowed, placesFor } from './nature.js';

const json = JSON.parse(readFileSync(new URL('../../data/maps/09-academy.json', import.meta.url), 'utf8')), pad = json.academy.pad;
const dir = new URL('../../assets/env/', import.meta.url);

test('every file the slots name exists, and the models together are under 1.5 MB', () => {
  let total = 0;
  for (const s of SLOTS) { const st = statSync(new URL(`${s.file}.glb`, dir)); assert.ok(st.size > 1000, s.file); }
  for (const f of ['bush-a', 'bush-b', 'fern', 'plant-a', 'plant-b', 'grass-a', 'grass-b', 'flowers-a', 'flowers-b', 'tree-a', 'tree-b', 'tree-c', 'pebble-a', 'pebble-b']) total += statSync(new URL(`${f}.glb`, dir)).size;
  assert.ok(total < 1.5 * 1024 * 1024, `${(total / 1024).toFixed(0)} KB`);
  assert.ok(readdirSync(dir).filter((f) => /^(bush|fern|plant|grass|flowers|tree|pebble)/.test(f)).length === 14);
});

test('every place is on the platform, off the pad (2 m), off the stand and the masts, and the same every time', () => {
  for (const tier of ['low', 'medium', 'high']) {
    const a = placesFor(pad, tier), b = placesFor(pad, tier);
    assert.deepEqual(a, b);
    for (const { places } of a) for (const [x, z] of places) assert.ok(allowed(x, z, pad), `${tier}: ${x}, ${z}`);
  }
  assert.ok(!allowed(0, 0, pad) && !allowed(124, 80, pad) && !allowed(-60, 110, pad) && !allowed(0, 102, pad), 'pad, barrier margin, stand, mast');
  assert.ok(allowed(-60, 96, pad) && allowed(-60, 120.5, pad) && allowed(-129, 0, pad), 'in front of and behind the stand, the west strip');
});

test('counts per tier: low has 7 kinds and fewer instances, high has all 14', () => {
  const k = (t) => placesFor(pad, t).length, n = (t) => placesFor(pad, t).reduce((a, x) => a + x.places.length, 0);
  assert.equal(k('low'), 7); assert.equal(k('medium'), 14); assert.equal(k('high'), 14);
  assert.ok(n('low') < n('medium') && n('medium') < n('high'));
  for (const t of ['low', 'medium', 'high']) for (const sl of SLOTS) { const got = placesFor(pad, t).find((x) => x.file === sl.file); if (sl.n[{ low: 0, medium: 1, high: 2 }[t]]) assert.ok(got && got.places.length >= sl.n[{ low: 0, medium: 1, high: 2 }[t]] * 0.9, `${t} ${sl.file}`); }
});
