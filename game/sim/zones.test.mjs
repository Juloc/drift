import test from 'node:test';
import assert from 'node:assert/strict';
import { newZones, zoneStep, ZONE } from './zones.js';

const clips = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
const drive = (zs, path) => { let st = zs, total = 0; const events = []; for (const p of path) { const r = zoneStep(st, p); st = r.state; total += r.bonus; if (r.event) events.push(r.event); } return { st, total, events }; };
const pass = (x, z, slip, kmh, n = 20) => Array.from({ length: n }, (_, i) => ({ x: x - 10 + (i * 20) / (n - 1), z, slip, speed: kmh / 3.6 }));

test('a drift through a zone pays when the car leaves it, more for angle, speed and a line close to the point', () => {
  const run = (z, slip, kmh) => drive(newZones(clips), pass(0, z, slip, kmh, 40)).total;
  const base = run(0, 0.6, 60);
  assert.ok(base > 0);
  assert.ok(run(0, 0.9, 60) > base, 'more angle pays more');
  assert.ok(run(0, 0.6, 90) > base, 'more speed pays more');
  assert.ok(run(5, 0.6, 60) < base, 'a line far from the point pays less');
});

test('a clean clip (within 1.5 m) pays half as much again, and every point pays once per run', () => {
  const near = drive(newZones(clips), pass(0, 0.5, 0.6, 60, 60)), far = drive(newZones(clips), pass(0, 3, 0.6, 60, 60));
  assert.equal(near.events.length, 1); assert.equal(near.events[0].clean, true); assert.equal(far.events[0].clean, false);
  const twice = drive(near.st, pass(0, 0.5, 0.6, 60, 60));
  assert.equal(twice.total, 0, 'paid already');
  const other = drive(newZones(clips), [...pass(0, 0, 0.6, 60), ...pass(100, 0, 0.6, 60)]);
  assert.equal(other.events.length, 2);
});

test('no drift, no pay: driving straight or slowly through a zone gives nothing', () => {
  assert.equal(drive(newZones(clips), pass(0, 0, 0.05, 80)).total, 0);
  assert.equal(drive(newZones(clips), pass(0, 0, 0.8, 20)).total, 0);
  assert.ok(ZONE.minSpeed < 20 / 3.6 + 10);
});
