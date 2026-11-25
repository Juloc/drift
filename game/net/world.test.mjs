// The client's frame handling and interpolation, in node. Run: node --test game/
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePose, decodeEntry, interpolate, DELAY_MS } from './world.js';

test('a pose frame is 13 bytes and decodes back to what was sent (within the wire resolution)', () => {
  const b = encodePose(7, { x: -12.34, z: 45.67, h: 5.5, vf: 22.2, steer: -0.4 }, 0.3, 3);
  assert.equal(b.byteLength, 13);
  const v = new DataView(b);
  assert.equal(v.getUint8(0), 1); assert.equal(v.getUint8(1), 7);
  const e = decodeEntry(v, 2);
  assert.ok(Math.abs(e.x + 12.34) < 0.05 && Math.abs(e.z - 45.67) < 0.05 && Math.abs(e.h - 5.5) < 0.001);
  assert.ok(Math.abs(e.vf - 22.2) < 0.02 && Math.abs(e.beta - 0.3) < 0.02 && Math.abs(e.steer + 0.4) < 0.01 && e.flags === 3);
});

const P = (t, x, z, h = 0, vf = 10) => ({ t, x, z, h, vf, beta: 0, steer: 0, flags: 0 });

test('interpolation: between two snapshots a car at constant speed is where it should be', () => {
  const buf = [P(0, 0, 0), P(66, 0, 0.66)];
  const r = interpolate(buf, 33);
  assert.ok(Math.abs(r.z - 0.33) < 0.01 && Math.abs(r.x) < 1e-9);
});

test('interpolation: the heading takes the short way round the circle', () => {
  const r = interpolate([P(0, 0, 0, 6.2), P(100, 0, 0, 0.2)], 50);
  const want = 6.2 + (2 * Math.PI - 6.2 + 0.2) / 2; // the short way across 2*pi, not back through 3
  assert.ok(Math.abs(Math.cos(r.h - want) - 1) < 1e-4);
});

test('extrapolation goes on along the velocity for 250 ms and then holds still', () => {
  const buf = [P(0, 0, 0), P(66, 0, 0.66)];
  assert.ok(Math.abs(interpolate(buf, 66 + 100).z - (0.66 + 1.0)) < 0.01);
  assert.ok(Math.abs(interpolate(buf, 66 + 250).z - (0.66 + 2.5)) < 0.01);
  assert.ok(Math.abs(interpolate(buf, 66 + 5000).z - (0.66 + 2.5)) < 0.01);
});

test('before the first snapshot the car stands at the first one; no snapshots, nothing', () => {
  assert.equal(interpolate([P(100, 3, 4)], 0).x, 3);
  assert.equal(interpolate([], 0), null);
});

test('the delay is two snapshot intervals', () => { assert.ok(DELAY_MS >= 2 * 66 && DELAY_MS <= 200); });
