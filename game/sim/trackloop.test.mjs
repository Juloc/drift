// Circuits in the track system (game/sim/track.js, `closed: true`): built inside the limits, smooth over the seam, and the surface goes round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, checkTrack, surfaceAt, frameAt, packTrack, loadTrack } from './track.js';

// a circuit: a long straight, a wide bend, an S, a hairpin back, round to the start; heights given at three places, the rest solved
const loopSpec = () => {
  const ctrl = [];
  for (let i = 0; i <= 6; i++) ctrl.push({ x: 0, z: i * 25 });
  for (let a = 1; a < 8; a++) { const t = (a / 8) * Math.PI; ctrl.push({ x: 60 - 60 * Math.cos(t), z: 150 + 60 * Math.sin(t) }); }
  ctrl.push({ x: 120, z: 150, y: 6 }, { x: 125, z: 110 }, { x: 115, z: 75 }, { x: 125, z: 40 });
  for (let a = 0; a <= 8; a++) { const t = (a / 8) * Math.PI; ctrl.push({ x: 60 + 60 * Math.cos(t), z: -10 - 45 * Math.sin(t) }); }
  ctrl[0].y = 0; ctrl[10].y = 4;
  return { closed: true, ctrl };
};

test('track loop: a circuit is built inside every limit, and its last sample is its first', () => {
  const T = buildTrack(loopSpec()), c = checkTrack(T);
  assert.deepEqual(c.problems.map((p) => p.text), []);
  assert.ok(T.closed);
  for (const a of [T.x, T.z, T.y, T.bank]) assert.ok(Math.abs(a[0] - a[T.n - 1]) < 1e-9);
  assert.ok(Math.max(...T.y) > 3, 'it climbs and comes back down');
});

test('track loop: over the seam the surface, its slope and the frame are smooth, and a point there is found from both sides', () => {
  const T = buildTrack(loopSpec());
  const a = frameAt(T, T.len - 0.01), b = frameAt(T, 0.01), c = frameAt(T, T.len + 3), d = frameAt(T, 3);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.03 && Math.abs(a.y - b.y) < 0.003, 'the position');
  assert.ok(Math.abs(a.grade - b.grade) < 0.003 && Math.abs(a.bank - b.bank) < 0.003 && Math.abs(Math.sin(a.head - b.head)) < 0.003, 'the slope and the direction');
  assert.ok(Math.hypot(c.x - d.x, c.z - d.z) < 1e-6, 'a distance past the end goes round');
  // walk across the seam on the plan: the height never jumps, s goes from near the end to near the start
  let last = null;
  for (let s = T.len - 8; s < T.len + 8; s += 0.25) {
    const f = frameAt(T, s, 1.5), q = surfaceAt(T, f.x, f.z);
    assert.equal(q.kind, 'road'); assert.ok(Math.abs(q.y - f.y) < 0.01, `${s}: ${q.y} vs ${f.y}`);
    if (last) assert.ok(Math.abs(q.y - last) < 0.02);
    last = q.y;
  }
});

test('track loop: packed and loaded again it is the same circuit; an open road stays open', () => {
  const T = buildTrack(loopSpec()), P = packTrack(T), U = loadTrack(JSON.parse(JSON.stringify(P)));
  assert.equal(P.closed, true); assert.ok(U.closed);
  assert.deepEqual(checkTrack(U).problems.map((p) => p.text), []);
  for (const s of [0, 77, T.len / 2, T.len - 1]) { const f = frameAt(T, s, 2), g = frameAt(U, s, 2); assert.ok(Math.hypot(f.x - g.x, f.z - g.z) < 0.01 && Math.abs(f.y - g.y) < 0.01); }
  const open = buildTrack({ ctrl: loopSpec().ctrl.slice(0, 12) });
  assert.equal(open.closed, false); assert.equal(packTrack(open).closed, undefined);
});
