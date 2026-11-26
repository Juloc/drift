// The drift academy's map (tools/make-academy.mjs), its file, and the per-wheel grip on the new driving model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, mapOf, PAD, CONFIG } from '../../tools/make-academy.mjs';
import { gripPerWheel } from './exercise.js';
import { step, makeCar, AE86_DRIFT, ASSISTS, FLAT, DT } from './sim2.js';
import { prepareMap } from './map.js';

const file = JSON.parse(readFileSync(new URL('../data/maps/09-academy.json', import.meta.url), 'utf8'));

test('the academy fits: no overlaps, no cone near a start, nothing off the pad', () => {
  assert.deepEqual(build().problems, []);
});

test('the file on disk is what the tool makes now (run node tools/make-academy.mjs after a change)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(mapOf(build()))), file);
});

test('the map: a 250 x 180 m pad with barriers, every exercise listed, spawns free of cones, cones inside the pad', () => {
  assert.equal(PAD.x1 - PAD.x0, 250); assert.equal(PAD.z1 - PAD.z0, 180);
  const m = prepareMap(file);
  assert.ok(m.segs.length >= 16, 'the four barriers at least');
  assert.equal(file.academy.exercises.length, CONFIG.length + 1);   // + the free pad
  for (const e of file.academy.exercises) for (const c of file.cones) if (c.what !== 'x') assert.ok(Math.hypot(c.x - e.spawn.x, c.z - e.spawn.z) >= 7, `${e.key} spawn clear of ${c.what}`);
  for (const c of file.cones) assert.ok(c.x > PAD.x0 + 2 && c.x < PAD.x1 - 2 && c.z > PAD.z0 + 2 && c.z < PAD.z1 - 2);
  assert.ok(file.cones.length > 150 && file.cones.length < 400);
  assert.equal(file.academy.grip.length, 1); assert.equal(file.academy.grip[0].mu, 0.55);
});

test('per wheel: the wet pad gives 0.55 to the wheels on it and 1 to the others', () => {
  const g = file.academy.grip[0].poly, xs = g.map((p) => p[0]), x0 = Math.min(...xs), cz = (Math.min(...g.map((p) => p[1])) + Math.max(...g.map((p) => p[1]))) / 2;
  const muW = [1, 1, 1, 1];
  gripPerWheel(file.academy.grip, [[x0 + 0.5, cz], [x0 - 0.5, cz], [x0 + 0.5, cz - 2], [x0 - 0.5, cz - 2]], muW);   // the left wheels just inside, the right ones just outside
  assert.deepEqual(muW, [0.55, 1, 0.55, 1]);
  gripPerWheel(file.academy.grip, [[x0 + 0.5, cz], [x0 - 0.5, cz], [x0 + 0.5, cz], [x0 - 0.5, cz]], muW, false);
  assert.deepEqual(muW, [1, 1, 1, 1], 'switched off: asphalt');
});

function brake(muW, pedal = 1) {
  const s = makeCar(0, 0, 0), env = { ...FLAT, muW };
  for (let i = 0; i < 240; i++) step(s, { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false }, AE86_DRIFT, ASSISTS.sim, FLAT, DT);
  s.vz = 20; for (let i = 0; i < 4; i++) s.wheel[i] = 20 / 0.3;
  let slipMax = [0, 0, 0, 0];   // (the largest braking force each wheel reached)
  for (let i = 0; i < 120; i++) { step(s, { throttle: 0, brake: pedal, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false }, AE86_DRIFT, ASSISTS.sim, env, DT); for (let k = 0; k < 4; k++) slipMax[k] = Math.max(slipMax[k], Math.abs(s.fxw[k])); }
  return { h: s.h, x: s.x, slipMax };
}

test('one side on the wet pad: the car pulls towards the grippy side under braking, and the wet wheels reach their limit at a lower force', () => {
  const even = brake([1, 1, 1, 1]), left = brake([0.55, 1, 0.55, 1]);
  assert.ok(Math.abs(even.h) < 0.01, `evenly: straight (${even.h})`);
  assert.ok(left.h > 0.02, `left wheels wet: it turns to the right (${left.h})`);   // heading grows to the right: the braking force is bigger on the right
  for (const [wet, dry] of [[0, 1], [2, 3]]) { const r = left.slipMax[wet] / left.slipMax[dry]; assert.ok(r > 0.45 && r < 0.7, `wheel ${wet} reaches ${(r * 100).toFixed(0)} % of wheel ${dry}'s force`); }
});
