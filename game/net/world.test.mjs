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

import { WorldClient } from './world.js';

test('the underglow frame gives the hue of each visitor that has one, and a leaving visitor takes theirs along', () => {
  const c = new WorldClient({ url: 'ws://x' });
  const roster = (ids) => { const b = [0x81, ids.length]; for (const id of ids) b.push(id, 0, 3, 1, 65); return new Uint8Array(b).buffer; };
  c.handle(roster([0, 1, 2]));
  c.handle(new Uint8Array([0x85, 2, 0, 9, 2, 1]).buffer);        // visitor 0: hue 8, visitor 2: hue 0
  assert.equal(c.glow.get(0), 8); assert.equal(c.glow.get(2), 0); assert.equal(c.glow.has(1), false);
  c.handle(roster([0, 1]));                                       // 2 leaves
  assert.equal(c.glow.has(2), false); assert.equal(c.glow.get(0), 8);
});

test('an unknown frame type is ignored (older pages meet newer relays this way)', () => {
  const c = new WorldClient({ url: 'ws://x' });
  c.handle(new Uint8Array([0x99, 1, 2, 3]).buffer);
  assert.equal(c.roster.size, 0);
});

// ----- interest areas: the short frame of the cars outside the radius (0x86)
import { SNAPSHOT_FAR } from './world.js';
const farFrame = (stamp, cars) => {
  const b = new ArrayBuffer(4 + 7 * cars.length), v = new DataView(b);
  v.setUint8(0, SNAPSHOT_FAR); v.setUint8(1, cars.length); v.setUint16(2, stamp, true);
  cars.forEach((c, i) => { const o = 4 + i * 7; v.setUint8(o, c.id); v.setInt16(o + 1, Math.round(c.x * 20), true); v.setInt16(o + 3, Math.round(c.z * 20), true); v.setUint16(o + 5, Math.round((c.h / (2 * Math.PI)) * 65536) & 0xffff, true); });
  return b;
};

test('a far frame gives position and heading, and the speed is worked out from the last two entries', () => {
  const c = new WorldClient({ url: 'ws://x' });
  c.handle(farFrame(1000, [{ id: 5, x: 100, z: 50, h: 1 }]));
  c.handle(farFrame(1267, [{ id: 5, x: 110, z: 50, h: 1 }]));
  const buf = c.buffers.get(5);
  assert.equal(buf.length, 2);
  assert.ok(buf[1].far && Math.abs(buf[1].x - 110) < 0.06);
  assert.ok(Math.abs(buf[1].vx - 37.5) < 1 && Math.abs(buf[1].vf - 37.5) < 1, `vx ${buf[1].vx}`);
});

test('a far car moves smoothly between two short entries (no stop and go) and is marked far', () => {
  const c = new WorldClient({ url: 'ws://x' });
  c.handle(farFrame(1000, [{ id: 5, x: 100, z: 0, h: 1.57 }]));
  c.handle(farFrame(1267, [{ id: 5, x: 110, z: 0, h: 1.57 }]));
  c.handle(farFrame(1534, [{ id: 5, x: 120, z: 0, h: 1.57 }]));
  const a = interpolate(c.buffers.get(5), c.buffers.get(5)[1].t + 100).x, b = interpolate(c.buffers.get(5), c.buffers.get(5)[1].t + 200).x;
  assert.ok(a > 110 && b > a && b < 120, `${a} ${b}`);
  assert.ok(Math.abs(b - a - 100 / 267 * 10) < 0.8, 'about constant speed between the entries');
  const now = performance.now(); c.offset = c.buffers.get(5)[2].t - now + 140;   // render time = the last entry
  assert.equal(c.sample(now).find((x) => x.id === 5).far, true);
});

test('a car that comes near again is drawn in full: a near entry ends the far state', () => {
  const c = new WorldClient({ url: 'ws://x' });
  c.handle(farFrame(1000, [{ id: 5, x: 100, z: 0, h: 0 }]));
  const near = new ArrayBuffer(4 + 12), v = new DataView(near);
  v.setUint8(0, 0x82); v.setUint8(1, 1); v.setUint16(2, 1067, true); v.setUint8(4, 5); v.setInt16(5, 2000, true); v.setInt16(7, 0, true);
  c.handle(near);
  const now = performance.now(); c.offset = 1067 - now + 140;
  assert.equal(c.sample(now).find((x) => x.id === 5).far, false);
});
