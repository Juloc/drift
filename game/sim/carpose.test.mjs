// The car on the surface (game/sim/carpose.js): four wheel points on a plane, a crest and a banked bend; the angles turn smoothly; a test drive on a sample road.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePose, settle, wheelGaps, wheelPoints, heightSurface, POSE } from './carpose.js';
import { poseDrive, poseDriveOnRoad, LIMITS } from '../../tools/posecheck.mjs';

const W = wheelPoints({ wheelX: 0.7, wheelZ: 1.19, wheelZF: 1.21 });
const plane = (gx, gz, y0 = 3) => (x, z, o = {}) => { o.y = y0 + gx * x + gz * z; o.gx = gx; o.gz = gz; return o; };

test('carpose: on a tilted plane the four wheels touch it, the angles are the plane\'s, whatever the heading', () => {
  for (const h of [0, 0.7, 2, -2.6]) {
    const surf = plane(0.06, -0.1), p = makePose();
    for (let i = 0; i < 30; i++) settle(p, surf, 4, -2, h, W, 1 / 60);
    for (const g of wheelGaps(p, surf, W)) assert.ok(Math.abs(g) < 1e-3, `heading ${h}: ${g}`);
    // the grade along the car: forward (sin h, cos h) on the plan, nose up when the road climbs
    const along = 0.06 * Math.sin(h) - 0.1 * Math.cos(h), across = -0.06 * Math.cos(h) - 0.1 * Math.sin(h);   // left = -right = (-cos h, sin h)
    assert.ok(Math.abs(Math.tan(p.pitch) - along) < 0.005 && Math.abs(Math.tan(p.roll) - across) < 0.005, `${h}: ${p.pitch} ${p.roll}`);
  }
});

test('carpose: over the tightest crest the wheels stay within 2 cm; a step in the ground is taken at the rate limit, not in one frame', () => {
  const crest = heightSurface((x, z) => -(z * z) / (2 * 80)), p = makePose();   // the tightest crest the track allows (LIMITS.crestR), at 30 m/s
  for (let z = -10; z < 10; z += 0.5) { settle(p, crest, 0, z, 0, W, 1 / 60); for (const g of wheelGaps(p, crest, W)) assert.ok(Math.abs(g) < 0.02, `${z}: ${g}`); }
  const step = (x, z, o = {}) => { o.y = z > 0 ? 0.1 * z : 0; o.gx = 0; o.gz = z > 0 ? 0.1 : 0; return o; }, q = makePose();
  settle(q, step, 0, -5, 0, W, 1 / 60);
  let most = 0; for (let i = 0; i < 120; i++) { settle(q, step, 0, 5, 0, W, 1 / 60); most = Math.max(most, Math.abs(q.rate[0])); }
  assert.ok(most <= POSE.maxRate + 1e-9 && Math.abs(Math.tan(q.pitch) - 0.1) < 1e-3, `${most} ${q.pitch}`);
});

test('carpose: braking dives the body and a bend leans it, softly, and the wheels are not moved by it', () => {
  const surf = plane(0, 0), p = makePose();
  settle(p, surf, 0, 0, 0, W, 1 / 60);
  settle(p, surf, 0, 0, 0, W, 1 / 60, { ax: -9, side: 15 });
  assert.ok(p.dive > 0 && p.dive < POSE.diveMax * 0.3, `soft: ${p.dive}`);
  for (let i = 0; i < 120; i++) settle(p, surf, 0, 0, 0, W, 1 / 60, { ax: -9, side: 15 });
  assert.ok(Math.abs(p.dive - 0.036) < 1e-3 && Math.abs(p.lean + POSE.leanMax * 0.66) < 0.01, `${p.dive} ${p.lean}`);
  for (const g of wheelGaps(p, surf, W)) assert.ok(Math.abs(g) < 1e-9);
});

test('carpose: a test drive on a sample road with two hairpins (drifting) keeps every limit of the drive check', () => {
  const r = poseDrive({ fps: 60 });
  assert.ok(r.track.ok && r.endS > 580, `the bot drives the road: ${JSON.stringify(r)}`);
  assert.ok(r.maxSlipDeg > 25, 'it drifts');
  for (const [k, v] of Object.entries(LIMITS)) assert.ok(r[k] <= v, `${k} ${r[k]} > ${v}`);
});

test('carpose: every car of the game keeps the limits on the sample road', () => {
  for (const carIndex of [0, 2, 3, 4]) {
    const r = poseDriveOnRoad({ carIndex });
    assert.ok(r.endS > 580, `${r.car} reaches the end`);
    for (const [k, v] of Object.entries(LIMITS)) assert.ok(r[k] <= v, `${r.car}: ${k} ${r[k]} > ${v}`);
  }
});
