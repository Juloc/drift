import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newCones, coneStep, PENALTY } from './cones.js';

const cones = [{ x: 0, z: 10, what: 'slalom' }, { x: 0, z: 25, what: 'slalom' }, { x: 8, z: 40, what: 'slalom' }];

test('cones: driving past close by knocks the cone down and costs points; a clear pass costs nothing', () => {
  let cs = newCones(cones), n = 0;
  for (let z = 0; z < 50; z += 0.2) { const next = coneStep(cs, cones, 3.5, z, 0, 15); if (next !== cs) n++; cs = next; }   // 3.5 m beside the line of the first two cones: clear
  assert.equal(cs.hits, 0); assert.equal(cs.points, 0); assert.equal(n, 0);
  cs = newCones(cones);
  for (let z = 0; z < 50; z += 0.2) cs = coneStep(cs, cones, 0.5, z, 0, 15);    // through the first two
  assert.equal(cs.hits, 2); assert.equal(cs.points, -2 * PENALTY); assert.ok(cs.down[0] && cs.down[1] && !cs.down[2]);
});

test('cones: a cone is knocked once, falls the way the car goes, and a new round puts them all up', () => {
  let cs = newCones(cones);
  cs = coneStep(cs, cones, 0.2, 10, 3, 4);
  assert.deepEqual(cs.event, [0]); assert.ok(Math.abs(cs.down[0].dx - 0.6) < 1e-9 && Math.abs(cs.down[0].dz - 0.8) < 1e-9);
  const again = coneStep(cs, cones, 0.2, 10, 3, 4);
  assert.equal(again, cs, 'nothing falls twice');
  assert.equal(newCones(cones).hits, 0);
});

test('cones: the practice ground has its cones as data and every cone is on the pad, clear of the walls', () => {
  const j = JSON.parse(readFileSync(new URL('../data/maps/07-practice.json', import.meta.url), 'utf8'));
  assert.ok(j.cones.length >= 40);
  const [[x0, z0], , [x1, z1]] = j.practice.pad;
  for (const c of j.cones) assert.ok(c.x > x0 && c.x < x1 && c.z > z0 && c.z < z1, `a cone at ${c.x}, ${c.z} is off the pad`);
});
