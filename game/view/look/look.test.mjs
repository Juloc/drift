// Tests of the look probe's pure parts: the land around the road, bends, the HUD's helpers, the line bot on the probe's road,
// and that a whole world builds within its budget on both tiers. Run: node --test game/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeField, sampleOpen, pathInfo, bends, distToPath, profileAt, insidePoly } from './field.js';
import { gearOf, fmtTime, fmtNum } from '../probehud.js';
import { lineBot } from '../../sim/linebot.js';
import { step, makeCar, bodySlip, speedOf, DT } from '../../sim/physics.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const scene = read('../../data/probe-sunset.json'), look = read('../../data/looks/sunset.json'), cars = read('../../data/cars.json').cars;

test('look: the road and the plaza are flat ground just under the cars, the land rises on one side and falls on the other', () => {
  const f = makeField(scene, { cell: 3.5 });
  for (let i = 0; i < f.road.length; i += 7) {
    const [x, z] = f.road[i];
    assert.ok(Math.abs(f.height(x, z) + 0.15) < 1e-9, 'on the road');
    const d = f.info.dir[i], r = [d[1], -d[0]];
    // nothing of the land comes above the road within the road and a metre beside it
    for (const o of [-f.hw - 1, 0, f.hw + 1]) assert.ok(f.height(x + r[0] * o, z + r[1] * o) <= 0);
  }
  for (const [x, z] of scene.plaza.pts) assert.ok(f.height(x * 0.9, z * 0.9) <= 0, 'the plaza');
  assert.ok(f.height(0, 200) > 50, 'uphill to the south');
  assert.ok(f.height(0, -300) < -40, 'the valley to the north');
  assert.ok(f.height(40, f.riverZ(40)) < scene.river.y, 'the river bed is under the water');
});

test('look: the shelf beside the road is wide enough that no grid triangle lifts the land over the road edge', () => {
  for (const cell of [look.tiers.high.cell, look.tiers.low.cell]) {
    const f = makeField(scene, { cell });
    assert.ok(f.shelf >= cell * Math.SQRT2, `cell ${cell}: shelf ${f.shelf}`);
  }
});

test('look: helpers of the field', () => {
  const pts = sampleOpen([[0, 0], [10, 0], [20, 0]], 2);
  assert.deepEqual(pts[0], [0, 0]); assert.deepEqual(pts.at(-1), [20, 0]);
  assert.ok(Math.abs(pathInfo(pts).length - 20) < 1e-6);
  assert.equal(distToPath(pts, 5, 3).d, 3);
  assert.equal(distToPath(pts, 5, 3).side, -distToPath(pts, 5, -3).side);
  assert.equal(profileAt([[0, 0], [10, 10]], -5), 0); assert.equal(profileAt([[0, 0], [10, 10]], 5), 5);
  assert.ok(insidePoly(scene.plaza.pts, 0, 0) && !insidePoly(scene.plaza.pts, 100, 0));
});

test('look: the probe road has its three bends', () => {
  const f = makeField(scene);
  const b = bends(f.info);
  assert.equal(b.length, 3, JSON.stringify(b));
  assert.ok(b.some((x) => x.turn > 0) && b.some((x) => x.turn < 0), 'bends both ways');
});

test('look: the line bot drifts through the first bend of the probe road and stays on the road there', () => {
  const f = makeField(scene), D = scene.driver, bot = lineBot(f.road, D.bot);
  let s = makeCar(D.x, D.z, D.h), maxSlip = 0, maxOff = 0;
  for (let i = 0; i < Math.round(7.5 / DT); i++) {
    s = step(s, bot(i * DT, s), cars[0], 1);
    maxSlip = Math.max(maxSlip, Math.abs(bodySlip(s)));
    maxOff = Math.max(maxOff, distToPath(f.road, s.x, s.z).d);
  }
  assert.ok(maxSlip > 0.55, `slip ${maxSlip}`);
  assert.ok(maxOff < f.hw, `off the road by ${maxOff}`);
  assert.ok(speedOf(s) > 5);
});

test('look: HUD helpers (a gear from the speed, times, numbers in both languages)', () => {
  assert.equal(gearOf(0), 'N'); assert.equal(gearOf(10), '1'); assert.equal(gearOf(43), '2'); assert.equal(gearOf(124), '5'); assert.equal(gearOf(200), '6'); assert.equal(gearOf(10, -1), 'R');
  assert.equal(fmtTime(72400), '01:12.400'); assert.equal(fmtTime(6500), '00:06.500');
  assert.equal(fmtNum(18460, 'de'), '18.460'); assert.equal(fmtNum(18460.9, 'en'), '18,460');
});

test('look: a whole world builds on both tiers within its budget (one lit mesh, one unlit, the water)', async () => {
  const { buildWorld } = await import('./world.js');
  const high = buildWorld(scene, look, 'high'), low = buildWorld(scene, look, 'low');
  assert.equal(high.group.children.length, 3); assert.equal(low.group.children.length, 3);
  assert.ok(low.triangles < high.triangles);
  assert.ok(low.triangles < 45000, `phone tier: ${low.triangles} triangles`);
  assert.ok(high.triangles < 260000, `high tier: ${high.triangles} triangles`);
  assert.equal(high.lampHeads.length, scene.plaza.lamps.length);
});
