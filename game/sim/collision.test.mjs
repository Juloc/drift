import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY, corners, collideBody, collideCars, overlapCars, damageOf, damageStep, damaged, DAMAGE } from './collision.js';
import { makeCar } from './physics.js';

const I = (BODY.length ** 2 + BODY.width ** 2) / 12;
const energy = (s) => 0.5 * (s.vx * s.vx + s.vz * s.vz) + 0.5 * I * s.w * s.w;
const momentum = (...ss) => [ss.reduce((a, s) => a + s.vx, 0), ss.reduce((a, s) => a + s.vz, 0)];
const wallMap = (segs = [[3, -50, 3, 50]], obstacles = []) => ({ segs: Float64Array.from(segs.flat()), obstacles });
const car = (x, z, h, vx = 0, vz = 0, w = 0) => ({ ...makeCar(x, z, h), vx, vz, w });
const maxX = (s) => Math.max(...corners(s).map((c) => c[0]));

test('a head-on hit on a wall: out of the wall, thrown back at the restitution, no spin, the hit speed is the approach speed', () => {
  const s = collideBody(wallMap(), car(1.5, 0, Math.PI / 2, 20, 0));   // facing +x, the nose is in the wall at x = 3 (1.5 + 2.2 = 3.7)
  assert.ok(maxX(s) <= 3 + 1e-6, `the nose is at ${maxX(s)}`);
  assert.ok(Math.abs(s.vx + 20 * BODY.restitution) < 0.05, `vx ${s.vx}`);
  assert.ok(Math.abs(s.w) < 1e-6, 'a straight hit does not turn the car');
  assert.ok(Math.abs(s.hit - 20) < 0.05);
});

test('a hit at an angle turns the car, keeps most of the speed along the wall, and never gains energy', () => {
  for (const h of [Math.PI / 2 - 0.4, Math.PI / 2 + 0.4, Math.PI / 2 - 0.9, 0.2]) {
    const sp = 22, v = [Math.sin(h) * sp, Math.cos(h) * sp];
    const before = car(0.9, 0, h, v[0], v[1]);
    const s = collideBody(wallMap(), before);
    assert.ok(maxX(s) <= 3 + 1e-6, `h ${h}: penetration ${maxX(s)}`);
    assert.ok(energy(s) <= energy(before) + 1e-6, `energy ${energy(before)} -> ${energy(s)} at ${h}`);
    if (Math.abs(Math.cos(h)) > 0.3 && Math.sin(h) > 0.3) {
      assert.ok(Math.abs(s.w) > 0.05, `a glancing hit turns the car (${s.w})`);
      assert.ok(Math.abs(s.vz) > 0.6 * Math.abs(v[1]) - 1, `most of the sliding speed stays: ${s.vz} of ${v[1]}`);
    }
  }
});

test('a car that touches a wall while moving away gets nothing, and one that sits clear of everything is untouched', () => {
  const clear = car(-20, 0, 1, 10, 3, 0.4);
  assert.deepEqual(collideBody(wallMap(), clear), { ...clear, hit: 0 });
  const leaving = collideBody(wallMap(), car(1.0, 0, Math.PI / 2, -5, 0));   // inside the wall's reach but moving away: pushed out, speed unchanged
  assert.equal(leaving.vx, -5); assert.equal(leaving.hit, 0);
});

test('a round obstacle (a pole, a planter) pushes the car out and turns it when hit off centre', () => {
  const map = wallMap([], [{ x: 3, z: 0.7, r: 1 }]);
  const s = collideBody(map, car(0.8, 0, Math.PI / 2, 15, 0));
  const d = Math.min(...corners(s).map((c) => Math.hypot(c[0] - 3, c[1] - 0.7)));
  assert.ok(d >= 1 - 0.05 || maxX(s) < 3, `still in the pole: ${d}`);
  assert.ok(Math.abs(s.w) > 0.1, 'a hit beside the middle turns the car');
  assert.ok(s.hit > 5);
});

test('a car cannot be pushed through a wall at any speed: ten thousand random hits end outside the wall', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 10000; i++) {
    const h = rnd() * 6.283, sp = rnd() * 40;
    const s = collideBody(wallMap(), car(3 - 2.5 + rnd() * 2, (rnd() - 0.5) * 20, h, Math.sin(h) * sp, Math.cos(h) * sp, (rnd() - 0.5) * 4));
    assert.ok(maxX(s) <= 3 + 1e-3 || Math.min(...corners(s).map((c) => c[0])) >= 3 - 1e-3, `through the wall at ${i}`);
    assert.ok(Number.isFinite(s.vx) && Number.isFinite(s.w));
  }
});

test('two cars head on: momentum is kept, the energy is not increased, and they come apart', () => {
  const a = car(-2.0, 0, Math.PI / 2, 15, 0), b = car(2.0, 0, -Math.PI / 2, -10, 0);
  assert.ok(overlapCars(a, b));
  const r = collideCars(a, b);
  const m0 = momentum(a, b), m1 = momentum(r.a, r.b);
  assert.ok(Math.abs(m0[0] - m1[0]) < 1e-9 && Math.abs(m0[1] - m1[1]) < 1e-9, `momentum ${m0} -> ${m1}`);
  assert.ok(energy(r.a) + energy(r.b) <= energy(a) + energy(b) + 1e-6);
  assert.equal(overlapCars(r.a, r.b), null, 'no longer overlapping');
  assert.ok(r.a.vx < a.vx && r.b.vx > b.vx, 'a slows, b is pushed on');
  assert.ok(Math.abs(r.hit - 25) < 0.1, `the approach speed is the closing speed: ${r.hit}`);
});

test('a hit on the side or the tail turns the other car', () => {
  const target = car(0, 0, 0);                                 // facing +z, still
  const rammer = car(-3.0, 1.4, Math.PI / 2, 14, 0);           // comes from the side, at the rear
  const r = collideCars(rammer, target);
  assert.ok(Math.abs(r.b.w) > 0.2, `the target turns: ${r.b.w}`);
  assert.ok(r.b.vx > 1, 'and is pushed along');
});

test('both players\' games agree: each moves only its own car from the other\'s state, and the results match the full resolution', () => {
  const a = car(-1.9, 0.3, Math.PI / 2 - 0.1, 18, 1), b = car(1.9, -0.2, -Math.PI / 2 + 0.2, -9, 0.5);
  const full = collideCars(a, b);
  const mine = collideCars(a, b, { applyB: false }).a;        // player A's game: only a moves
  const theirs = collideCars(a, b, { applyA: false }).b;      // player B's game: only b moves
  assert.ok(Math.abs(mine.vx - full.a.vx) < 1e-9 && Math.abs(mine.vz - full.a.vz) < 1e-9 && Math.abs(mine.w - full.a.w) < 1e-9, 'a gets the same velocity either way');
  assert.ok(Math.abs(theirs.vx - full.b.vx) < 1e-9 && Math.abs(theirs.w - full.b.w) < 1e-9, 'so does b');
  // and after both moved out by their own full share the overlap is gone from either side
  const afterA = collideCars(a, b, { applyB: false }).a, afterB = collideCars(a, b, { applyA: false }).b;
  const gone = (o) => o === null || o.depth < 1e-9;   // touching is not overlapping
  assert.ok(gone(overlapCars(afterA, b)) && gone(overlapCars(a, afterB)));
});

test('what a hit does to a car stays what the relay believes: the struck car never gets more than its limit of 1.15 x top speed + 2', () => {
  // the fastest car (39 m/s) into a car at rest, head on, at the tail and at the side: the car at rest ends up at a speed that the relay accepts for the slowest car (Ox, 28 m/s)
  for (const [x, z, h] of [[-2.2, 0, Math.PI / 2], [-2.4, 1.5, Math.PI / 2 + 0.3], [0.3, -3.5, 0]]) {
    const r = collideCars(car(x, z, h, Math.sin(h) * 39, Math.cos(h) * 39), car(0, 0, 0));
    assert.ok(Math.hypot(r.b.vx, r.b.vz) <= 1.15 * 28 + 2, `struck car at ${Math.hypot(r.b.vx, r.b.vz)}`);
  }
  const w = collideBody(wallMap(), car(1.0, 0, Math.PI / 2, 60, 0));
  assert.ok(Math.abs(w.vx - 60) <= BODY.maxJump + 1e-6);
});

test('damage: small bumps cost nothing, hard hits a lot, it is capped, heals slowly after a pause, and costs only a little power', () => {
  assert.equal(damageOf(2), 0);
  assert.ok(damageOf(10) > 0.15 && damageOf(10) < 0.3);
  assert.equal(damageOf(100), DAMAGE.maxPerHit);
  let level = 0;
  for (let i = 0; i < 5; i++) level = damageStep(level, 30, 0, 1 / 120);
  assert.equal(level, 1, 'capped at 1');
  assert.equal(damageStep(0.5, 0, 2, 1), 0.5, 'no healing right after a hit');
  assert.ok(damageStep(0.5, 0, 10, 10) < 0.5 && damageStep(0.5, 0, 10, 10) > 0.4);
  assert.equal(damageStep(0.001, 0, 10, 10), 0);
  const car0 = { power: 8, top: 35, grip: 1.1 };
  assert.equal(damaged(car0, 0), car0);
  const d = damaged(car0, 1);
  assert.ok(Math.abs(d.power - 6) < 1e-9 && Math.abs(d.top - 31.5) < 1e-9 && d.grip === car0.grip);
});
