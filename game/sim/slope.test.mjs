// The 2.5D physics on a surface (design: DESIGN-PHYSIK-STRECKE.md, section 2.9, tests 1 to 6, 9 and 11): the slope pulls, the wheel load follows slope, crest and dip,
// the car is held on a hill, a banked bend holds the car, the height never jumps, and downhill no car outruns the relay's speed check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { step, makeCar, speedOf, DT, G, K } from './physics.js';
import { prepareMap, collide } from './map.js';
import { surfaceAt as trackSurface, LIMITS } from './track.js';
import { applyFeel, PRO } from './feel.js';
import { topFactor } from './tuning.js';

const CARS = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars, dart = CARS[0];
const NONE = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
/** a plane that rises by `g` per metre along +z (so a car facing +z looks uphill, facing -z downhill) */
const plane = (g) => (x, z, o = {}) => { o.y = g * z; o.gx = 0; o.gz = g; return o; };
const down = (x = 0, z = 0) => makeCar(x, z, Math.PI);   // facing -z: downhill on `plane(g > 0)`
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const energy = (s, car) => 0.5 * (s.vx ** 2 + s.vz ** 2) + 0.5 * ((K.inertia * K.a * K.b) / car.agility) * s.w ** 2 + G * s.y;

test('slope 1: on a 10 % hill a car with no pedal stands still, with the handbrake too; with gas it drives off', () => {
  for (const car of CARS) for (const input of [NONE, { ...NONE, handbrake: 1 }]) for (const start of [down(), makeCar(0, 0, 0), makeCar(0, 0, 1.2)]) {
    let s = start; for (let i = 0; i < 10 / DT; i++) s = step(s, input, car, 1, DT, plane(0.1));
    assert.ok(Math.hypot(s.x, s.z) < 0.01, `${car.name}: moved ${Math.hypot(s.x, s.z).toFixed(3)} m in 10 s`);
  }
  let s = makeCar(0, 0, 0); for (let i = 0; i < 3 / DT; i++) s = step(s, { ...NONE, throttle: 1 }, dart, 1, DT, plane(0.1));
  assert.ok(s.z > 5 && s.y > 0.5, 'with gas it climbs');
  // a car that coasts up the hill comes to rest and stays there (it does not roll back)
  s = { ...makeCar(0, 0, 0), vz: 6 }; for (let i = 0; i < 20 / DT; i++) s = step(s, NONE, dart, 1, DT, plane(0.1));
  assert.ok(speedOf(s) === 0 && s.z > 5, `it stands at ${s.z.toFixed(1)} m up the hill`);
});

test('slope 2: rolling down a 10 % hill (the hold let go), the speed after 50 m is what the height gives, less the rolling loss', () => {
  const car = { ...dart, hold: false }; let s = down(), loss = 0;
  while (s.z > -50) { s = step(s, NONE, car, 1, DT, plane(0.1)); loss += K.rolling * speedOf(s) ** 2 * DT; }
  const v2 = speedOf(s) ** 2, ideal = 2 * (G * 5 * (-s.z / 50) - loss);
  assert.ok(v2 <= ideal && v2 >= ideal * 0.97, `v^2 ${v2.toFixed(1)} against ${ideal.toFixed(1)} (the height less the rolling loss)`);
  // and the slope is felt: the same car rolls out further downhill than on the level, and brakes longer
  const stop = (surf, face) => { let c = { ...makeCar(0, 0, face), vz: face ? -25 : 25 }; for (let i = 0; i < 2000 && speedOf(c) > 0.2; i++) c = step(c, { ...NONE, brake: 1 }, dart, 1, DT, surf); return Math.abs(c.z); };
  const level = stop(plane(0), 0), downhill = stop(plane(0.1), Math.PI), uphill = stop(plane(0.1), 0);
  assert.ok(downhill > level * 1.05 && uphill < level * 0.97, `braking from 90 km/h: ${level.toFixed(1)} m level, ${downhill.toFixed(1)} m downhill, ${uphill.toFixed(1)} m uphill`);
});

test('slope 3: no energy from nowhere: coasting, the energy never rises, on any slope and against a wall; steering adds no more than it does on level ground', () => {
  const walls = prepareMap({ bounds: [[-40, -400], [40, -400], [40, 400], [-40, 400]], walls: [], ground: 'asphalt' });
  // coasting straight (also into the walls at an angle): every single step
  for (const g of [0, 0.05, 0.1, 0.13]) for (const h of [0, Math.PI, 0.7, 2.4, -1.9]) {
    let s = { ...makeCar(0, 0, h), vx: Math.sin(h) * 22, vz: Math.cos(h) * 22, y: 0 }, last = energy(s, dart), worst = 0;
    for (let i = 0; i < 30 / DT; i++) { s = collide(walls, step(s, NONE, dart, 1, DT, plane(g))); s.y = plane(g)(s.x, s.z).y; const e = energy(s, dart); worst = Math.max(worst, e - last); last = e; }
    assert.ok(worst <= 2e-4, `grade ${g}, heading ${h}: the energy rose by ${worst.toExponential(2)} in a step`);
  }
  // random steering and handbrake, no gas: today's tyre model itself can add a little energy (a steered front tyre pushes sideways without the drag it should cost;
  // the tyre comes new in the next slice). The slope must add nothing on top: the rise above the start is no bigger on a hill than on level ground
  const rise = (g) => { const rnd = rng(11); let worst = 0;
    for (let runs = 0; runs < 120; runs++) { const car = CARS[runs % 5], h = rnd() * 6.28, v = 6 + rnd() * 28; let s = { ...makeCar(0, 0, h), vx: Math.sin(h) * v, vz: Math.cos(h) * v, y: 0 }; const e0 = energy(s, car); let steer = 0, hb = 0;
      for (let i = 0; i < 1200; i++) { if (i % 30 === 0) { steer = rnd() * 2 - 1; hb = rnd() < 0.2 ? 1 : 0; } s = step(s, { steer, throttle: 0, brake: 0, handbrake: hb }, car, 1, DT, plane(g)); worst = Math.max(worst, energy(s, car) - e0); } }
    return worst; };
  const level = rise(0);
  for (const g of [0.05, 0.1, 0.13]) { const r = rise(g); assert.ok(r <= level + 0.5, `on ${g * 100} % the energy rose ${r.toFixed(2)} above the start, on level ground ${level.toFixed(2)}`); }
});

test('slope 4 and 5: over a crest of 120 m radius at 25 m/s the car is light (0.4 to 0.5 g) and grips less; in a dip it is heavy, never more than 1.8 g; it stays on the surface', () => {
  const crest = (x, z, o = {}) => { o.y = -(z * z) / 240; o.gx = 0; o.gz = -z / 120; return o; };
  let s = { ...makeCar(0, -1, 0), vz: 25 }; s = step(s, NONE, dart, 1, DT, crest);
  assert.ok(s.nLoad > 0.4 && s.nLoad < 0.5, `load on the crest ${s.nLoad.toFixed(2)} g`);
  assert.ok(Math.abs(s.y - crest(s.x, s.z).y) < 1e-9);
  // less load, less side grip: the same turn of the wheel bends the way less on the crest than on level ground
  const side = (surf) => { let c = { ...makeCar(0, -4, 0), vz: 25 }; for (let i = 0; i < 0.3 / DT; i++) c = step(c, { ...NONE, steer: 1 }, dart, 1, DT, surf); return Math.abs(c.vx); };
  assert.ok(side(crest) < side(plane(0)) * 0.75, `sideways speed after 0.3 s of full lock: ${side(crest).toFixed(2)} on the crest, ${side(plane(0)).toFixed(2)} on level ground`);
  const dip = (R) => (x, z, o = {}) => { o.y = (z * z) / (2 * R); o.gx = 0; o.gz = z / R; return o; };
  s = step({ ...makeCar(0, -1, 0), vz: 25 }, NONE, dart, 1, DT, dip(150));
  assert.ok(s.nLoad > 1.35 && s.nLoad < 1.5, `load in a dip of 150 m: ${s.nLoad.toFixed(2)} g`);
  s = step({ ...makeCar(0, -1, 0), vz: 30 }, NONE, dart, 1, DT, dip(40));
  assert.equal(s.nLoad, 1.8);
  s = step({ ...makeCar(0, -1, 0), vz: 38 }, NONE, dart, 1, DT, (x, z, o = {}) => { o.y = -(z * z) / 80; o.gx = 0; o.gz = -z / 40; return o; });
  assert.equal(s.nLoad, 0.25, 'a sharp crest makes the car light, it never lifts off');
});

test('slope 6: a bend tilted to its inside holds the car on a tighter circle, one that hangs outwards lets it run wide', () => {
  // a round bowl: the height rises (or falls) with the distance from the middle; the car circles the middle to the right with the same wheel and the same gas
  const bowl = (b) => (x, z, o = {}) => { const r = Math.hypot(x, z) || 1; o.y = b * r; o.gx = (b * x) / r; o.gz = (b * z) / r; return o; };
  const radius = (b) => { let s = { ...makeCar(-40, 0, 0), vz: 14 }, sum = 0, n = 0; for (let i = 0; i < 12 / DT; i++) { s = step(s, { steer: 0.5, throttle: 0.35, brake: 0, handbrake: 0 }, dart, 1, DT, bowl(b)); if (i > 6 / DT) { sum += Math.hypot(s.x, s.z); n++; } } return sum / n; };
  const flat = radius(0), banked = radius(0.06), hanging = radius(-0.04);
  assert.ok(banked < flat - 0.3 && hanging > flat + 0.2, `distance from the middle: ${banked.toFixed(1)} m tilted in by 6 %, ${flat.toFixed(1)} m level, ${hanging.toFixed(1)} m hanging out by 4 %`);
});

const touge = prepareMap(JSON.parse(readFileSync(new URL('../data/maps/06-touge.json', import.meta.url), 'utf8')));
const surf = (x, z, o) => trackSurface(touge.surface, x, z, o);
/** a steady driver down the touge (the one of sim.test.mjs), with the surface */
function descend(car, target, each) {
  const c = touge.centre, g = touge.grid[0]; let s = makeCar(g.x, g.z, g.h), idx = 0, best = Infinity, hits = 0;
  for (let i = 0; i < 30; i++) { const d = Math.hypot(c[i][0] - g.x, c[i][1] - g.z); if (d < best) { best = d; idx = i; } }
  for (let i = 0; i < 400 / DT && idx < c.length - 2; i++) {
    const look = c[Math.min(c.length - 1, idx + 3)]; let err = Math.atan2(look[0] - s.x, look[1] - s.z) - s.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    const sp = speedOf(s), bend = Math.abs(touge.surface.k[Math.min(touge.surface.n - 1, Math.round((idx * 3.5 + 25) / touge.surface.ds))]) > 1 / 60, want = bend ? Math.min(target, 12) : target;
    const next = collide(touge, step(s, { steer: Math.max(-1, Math.min(1, err * 2.2)), throttle: sp < want ? 1 : 0, brake: sp > want + 2 ? 1 : 0, handbrake: 0 }, car, 1, DT, surf));
    if (next.hit > 2) hits++;
    each?.(s, next); s = next;
    if (Math.hypot(c[idx + 1][0] - s.x, c[idx + 1][1] - s.z) < Math.hypot(c[idx][0] - s.x, c[idx][1] - s.z) + 1.5) idx++;
  }
  return { s, idx, hits };
}

test('slope 9: down the whole touge the height is the surface\'s and never jumps (at most 13 % of the way in a step), the load stays between 0.6 and 1.5 g', () => {
  let worst = 0, lo = 9, hi = 0, off = 0;
  const r = descend(dart, 11, (a, b) => { if (a.y !== undefined) worst = Math.max(worst, Math.abs(b.y - a.y) - 0.13 * Math.hypot(b.x - a.x, b.z - a.z)); lo = Math.min(lo, b.nLoad); hi = Math.max(hi, b.nLoad); off = Math.max(off, Math.abs(b.y - surf(b.x, b.z, {}).y)); });
  assert.ok(r.idx >= touge.centre.length - 3 && r.hits === 0, `the driver came to point ${r.idx} of ${touge.centre.length} with ${r.hits} hits`);
  assert.ok(worst <= 0.001, `a jump of ${worst.toFixed(4)} m beyond 13 % of the way`);
  assert.ok(off < 0.02, `the height is ${off.toFixed(3)} m off the surface after a wall pushed the car`);
  assert.ok(lo > 0.6 && hi < 1.5, `wheel load from ${lo.toFixed(2)} to ${hi.toFixed(2)} g`);
  assert.ok(r.s.y < -95, 'the car is a hundred metres lower at the end');
});

test('slope 11: downhill no car outruns the relay\'s speed check: at most 1.1 times its top speed, on the steepest slope a road may have and down the touge', () => {
  // the relay allows 1.15 * top + 2 (server/Relay/WorldRelay.cs, Check); the steepest surface a road may have is LIMITS.slopeBoth
  for (const base of CARS) for (const car of [base, applyFeel(base, PRO), { ...base, top: base.top * topFactor({ steer: -3 }) }]) {
    const flatOut = (g) => { let s = down(), fastest = 0; for (let i = 0; i < 90 / DT; i++) { s = step(s, { ...NONE, throttle: 1 }, car, 1, DT, plane(g)); fastest = Math.max(fastest, speedOf(s)); } return fastest; };
    const fastest = flatOut(LIMITS.slopeBoth), level = flatOut(0);
    assert.ok(fastest <= 1.1 * car.top, `${base.name}: ${fastest.toFixed(1)} m/s down ${LIMITS.slopeBoth * 100} %, top ${car.top.toFixed(1)}`);
    assert.ok(fastest > level + 0.5, `and the slope is felt: ${fastest.toFixed(1)} m/s downhill, ${level.toFixed(1)} m/s on level ground`);
  }
  let fastest = 0; const bruno = CARS[2];
  descend(bruno, 99, (a, b) => { fastest = Math.max(fastest, speedOf(b)); });
  assert.ok(fastest <= 1.1 * bruno.top, `flat out down the touge: ${fastest.toFixed(1)} m/s, top ${bruno.top}`);
});
