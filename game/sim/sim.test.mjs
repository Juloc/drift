// Physics, collisions, the score and the map file, as pure functions. Run: node --test game/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { step, makeCar, bodySlip, speedOf, turnedAngle, DT, G, K, tyreCurve } from './physics.js';
import { prepareMap, surfaceAt, collide, inside } from './map.js';
import { scoreStep, newScore, SCORE } from './score.js';
import { orbitBot } from './bot.js';
import { FixedLoop } from './loop.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CARS = read('../data/cars.json').cars;
const dart = CARS[0];
const MAP = prepareMap(read('../data/maps/01-car-park.json'));
const NONE = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
const run = (s, seconds, inputOf, car = dart, mu = 1) => {
  for (let i = 0; i < seconds / DT; i++) s = step(s, inputOf(i * DT, s), car, mu);
  return s;
};
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('a car at rest stays at rest', () => {
  const s = run(makeCar(5, 5, 1), 5, () => NONE);
  assert.equal(s.x, 5); assert.equal(s.z, 5); assert.equal(s.vx, 0); assert.equal(s.w, 0);
});

test('full throttle: forward only, monotone, never past the top speed; 0 to 100 km/h in a sensible time', () => {
  let s = makeCar(), prev = 0, t100 = null;
  for (let i = 0; i < 20 / DT; i++) {
    s = step(s, { ...NONE, throttle: 1 }, dart);
    const v = speedOf(s);
    assert.ok(v >= prev - 1e-9, 'speed never drops under throttle');
    assert.ok(v <= dart.top, 'below the top speed');
    if (t100 === null && v * 3.6 >= 100) t100 = i * DT;
    prev = v;
  }
  assert.ok(Math.abs(s.vx) < 1e-9, 'no sideways drift going straight');
  assert.ok(t100 > 3.5 && t100 < 8, `0-100 km/h in ${t100}s`);
});

test('steering right turns right (heading grows), left turns left', () => {
  const warm = run(makeCar(), 3, () => ({ ...NONE, throttle: 1 }));
  const r = run(warm, 1, () => ({ ...NONE, throttle: 0.5, steer: 1 }));
  const l = run(warm, 1, () => ({ ...NONE, throttle: 0.5, steer: -1 }));
  assert.ok(r.h > 0.1 && r.w > 0); assert.ok(l.h < -0.1 && l.w < 0);
  assert.ok(Math.abs(r.h + l.h) < 1e-9, 'mirror symmetry');
});

test('lateral acceleration never passes what the tyres can give', () => {
  for (const car of CARS) for (const mu of [1, 0.6, 0.4]) {
    let s = run(makeCar(), 3, () => ({ ...NONE, throttle: 1 }), car, mu), worst = 0;
    for (let i = 0; i < 4 / DT; i++) {
      const before = { vx: s.vx, vz: s.vz };
      s = step(s, { ...NONE, throttle: 0.4, steer: 1 }, car, mu);
      // acceleration across the car's side: change of velocity across the heading
      const ay = ((s.vx - before.vx) * Math.cos(s.h) - (s.vz - before.vz) * Math.sin(s.h)) / DT;
      worst = Math.max(worst, Math.abs(ay));
    }
    assert.ok(worst <= car.grip * mu * G * 1.05, `${car.name} on mu ${mu}: ${worst.toFixed(1)} m/s2`);
  }
});

test('handbrake and steering start a slide that throttle alone does not', () => {
  const slip = (opts) => {
    let s = makeCar(), sum = 0, n = 0;
    for (let i = 0; i < 9 / DT; i++) {
      const t = i * DT;
      s = step(s, orbitBot(t, s, opts), dart);
      if (t > 6) { sum += Math.abs(bodySlip(s)); n++; }
    }
    return sum / n;
  };
  assert.ok(slip({}) > 0.35, 'with the handbrake kick the car holds a drift');
  assert.ok(slip({ handbrake: 0, start: 99 }) < 0.15, 'driving straight: no slide');
});

test('less grip on the ground, wider slides', () => {
  const peak = (mu) => {
    let s = run(makeCar(), 3, () => ({ ...NONE, throttle: 1 }), dart, mu), m = 0;
    for (let i = 0; i < 3 / DT; i++) { s = step(s, { ...NONE, throttle: 1, steer: 1 }, dart, mu); m = Math.max(m, Math.abs(bodySlip(s))); }
    return m;
  };
  assert.ok(peak(0.4) > peak(1));
});

test('the tyre curve rises to the peak, then falls to the slide level and stays', () => {
  assert.equal(tyreCurve(0, 0.7), 0);
  assert.equal(tyreCurve(1, 0.7), 1);
  assert.ok(tyreCurve(1.6, 0.7) < 1 && tyreCurve(1.6, 0.7) > 0.7);
  assert.ok(Math.abs(tyreCurve(5, 0.7) - 0.7) < 1e-12);
});

test('the same inputs give the same states', () => {
  const go = () => run(makeCar(), 6, (t, s) => orbitBot(t, s));
  assert.deepEqual(go(), go());
});

test('frame rate does not change the result: 30, 60 and 144 fps run the same steps', () => {
  const sim = (fps) => {
    const loop = new FixedLoop();
    let s = makeCar();
    for (let f = 0; f < fps * 8; f++) loop.advance(1 / fps, (i) => { s = step(s, orbitBot(i * DT, s), dart); });
    return { s, steps: loop.steps };
  };
  const a = sim(30), b = sim(60), c = sim(144);
  const n = Math.min(a.steps, b.steps, c.steps);
  // run all three to exactly n steps and compare
  const to = (fps) => {
    const loop = new FixedLoop(); let s = makeCar();
    for (let f = 0; loop.steps < n; f++) loop.advance(1 / fps, (i) => { if (i < n) s = step(s, orbitBot(i * DT, s), dart); });
    return s;
  };
  assert.deepEqual(to(30), to(60)); assert.deepEqual(to(60), to(144));
});

test('a stall is dropped, not caught up', () => {
  const loop = new FixedLoop(); let n = 0;
  loop.advance(5, () => n++);
  assert.ok(n <= 0.1 / DT + 1);
});

test('a million random steps: no NaN, never absurdly fast, never outside the map', () => {
  const rnd = rng(42);
  for (const car of CARS) {
    let s = makeCar(0, 40, 0), input = NONE;
    for (let i = 0; i < 200000; i++) {
      if (i % 30 === 0) input = { steer: rnd() * 2 - 1, throttle: rnd() < 0.6 ? 1 : 0, brake: rnd() < 0.15 ? 1 : 0, handbrake: rnd() < 0.15 ? 1 : 0 };
      s = collide(MAP, step(s, input, car, surfaceAt(MAP, s.x, s.z).mu));
      assert.ok(Number.isFinite(s.x + s.z + s.vx + s.vz + s.w + s.h + s.steer), 'finite');
      assert.ok(speedOf(s) <= car.top * 1.5, `speed ${speedOf(s)}`);
      assert.ok(Math.abs(s.x) <= 111 && Math.abs(s.z) <= 76, `outside at ${s.x}, ${s.z}`);
    }
  }
});

test('walls push out and never let a car through, also at full speed and in corners', () => {
  const box = prepareMap({ bounds: [[-50, -50], [50, -50], [50, 50], [-50, 50]], ground: 'asphalt' });
  for (const h of [0, 0.5, 1.2, 2.2, 3.1, -0.9]) {
    let s = makeCar(0, 0, h);
    for (let i = 0; i < 12 / DT; i++) {
      s = collide(box, step(s, { ...NONE, throttle: 1, steer: 0.3 }, CARS[2]));
      assert.ok(Math.abs(s.x) <= 50 && Math.abs(s.z) <= 50, 'inside');
    }
  }
  const head = collide(box, { ...makeCar(49.5, 0, Math.PI / 2), vx: 30 });
  assert.ok(head.hit > 25 && head.vx < 0 && head.x <= 49.01 && head.x >= 48.9);
});

test('obstacles and islands are solid too', () => {
  let s = makeCar(0, 40, Math.PI), hits = 0; // drive north-west... straight at the central island
  s = { ...s, h: Math.PI }; // facing -z
  for (let i = 0; i < 6 / DT; i++) { s = collide(MAP, step(s, { ...NONE, throttle: 1 }, dart)); if (s.hit) hits++; assert.ok(s.z >= 12 + 1 - 1e-6 || Math.abs(s.x) > 40, 'not inside the island'); }
  assert.ok(hits > 0);
});

test('ground lookup: puddle is wet, the rest asphalt', () => {
  assert.equal(surfaceAt(MAP, -34, 40).kind, 'wet');
  assert.equal(surfaceAt(MAP, 0, 40).kind, 'asphalt');
  assert.ok(surfaceAt(MAP, -34, 40).mu < surfaceAt(MAP, 0, 40).mu);
});

test('score: a clean slide earns points, a straight line none', () => {
  let sc = newScore();
  for (let i = 0; i < 120; i++) sc = scoreStep(sc, { slip: 0.05, speed: 25, hit: 0, turned: 0.05 }, DT);
  assert.equal(sc.pending, 0); assert.equal(sc.drifting, false);
  const sl = 0.6, steps = Math.round(2 / DT);
  for (let i = 0; i < steps; i++) sc = scoreStep(sc, { slip: sl, speed: 25, hit: 0, turned: sl }, DT);
  const want = SCORE.rate * 25 * Math.pow((sl * 180) / Math.PI, SCORE.exponent) * 1 * 2;
  assert.ok(sc.drifting && Math.abs(sc.pending - want) / want < 0.05, `${sc.pending} vs ${want}`);
});

test('score: the multiplier grows with time, up to five; the chain is banked after the grace time', () => {
  let sc = newScore();
  const d = { slip: 0.5, speed: 20, hit: 0, turned: 0.5 }, none = { slip: 0, speed: 20, hit: 0, turned: 0 };
  for (let i = 0; i < 5 / DT; i++) sc = scoreStep(sc, d, DT);
  assert.equal(sc.mult, 3);
  for (let i = 0; i < 30 / DT; i++) sc = scoreStep(sc, d, DT);
  assert.equal(sc.mult, SCORE.maxMult);
  const pending = sc.pending; let ev = null;
  for (let i = 0; i < 3 / DT; i++) { sc = scoreStep(sc, none, DT); ev ??= sc.event; }
  assert.equal(ev.type, 'bank'); assert.ok(Math.abs(sc.banked - pending) < 1e-6 && sc.pending === 0 && sc.mult === 1);
});

test('score: two slides within the grace time are one chain; a hit or a spin loses the pending points', () => {
  let sc = newScore();
  const d = { slip: 0.5, speed: 20, hit: 0, turned: 0.5 }, none = { slip: 0, speed: 20, hit: 0, turned: 0 };
  for (let i = 0; i < 1 / DT; i++) sc = scoreStep(sc, d, DT);
  for (let i = 0; i < 1 / DT; i++) sc = scoreStep(sc, none, DT); // 1 s < 1.5 s grace
  for (let i = 0; i < 1.5 / DT; i++) sc = scoreStep(sc, d, DT);
  assert.ok(sc.chainTime > 2.4 && sc.banked === 0 && sc.mult === 2);
  sc = scoreStep(sc, { slip: 0.5, speed: 20, hit: 8, turned: 0.5 }, DT);
  assert.equal(sc.pending, 0); assert.equal(sc.event.type, 'lost'); assert.equal(sc.banked, 0);
  let sp = newScore();
  for (let i = 0; i < 1 / DT; i++) sp = scoreStep(sp, d, DT);
  sp = scoreStep(sp, { slip: 1, speed: 20, hit: 0, turned: 2.5 }, DT);
  assert.equal(sp.pending, 0); assert.equal(sp.event.type, 'lost');
});

test('score: too slow or too small an angle is not a drift', () => {
  let sc = newScore();
  for (let i = 0; i < 240; i++) sc = scoreStep(sc, { slip: 0.6, speed: 5, hit: 0, turned: 0.6 }, DT);
  for (let i = 0; i < 240; i++) sc = scoreStep(sc, { slip: 0.2, speed: 25, hit: 0, turned: 0.2 }, DT);
  assert.equal(sc.pending, 0);
});

test('the car park map file: closed loop, spawn and grid on free ground inside the bounds', () => {
  const raw = read('../data/maps/01-car-park.json');
  const c = raw.centre;
  assert.ok(Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]) < 8, 'the loop closes');
  assert.ok(raw.loopLength > 300 && raw.loopLength < 600);
  const free = (x, z) => inside(raw.bounds, x, z) && !raw.walls.some((w) => inside(w.pts, x, z)) && !raw.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.5);
  assert.ok(free(raw.lobbySpawn.x, raw.lobbySpawn.z));
  for (const g of raw.grid) assert.ok(free(g.x, g.z), `grid slot ${g.x},${g.z}`);
  for (const p of c) assert.ok(free(p[0], p[1]), `centre point ${p}`);
  assert.equal(surfaceAt(MAP, raw.lobbySpawn.x, raw.lobbySpawn.z).kind, 'asphalt');
});

test('score: the shared vectors (the server\'s C# test reads the same file)', () => {
  const vectors = JSON.parse(readFileSync(new URL('../../tests/vectors/drift-score.json', import.meta.url), 'utf8'));
  for (const [name, c] of Object.entries(vectors)) {
    let sc = newScore();
    c.steps.forEach((st, i) => {
      sc = scoreStep(sc, st, c.dt);
      const t = c.trace.find((x) => x.step === i);
      if (t) { assert.ok(Math.abs(sc.pending - t.pending) < 1e-5 && Math.abs(sc.banked - t.banked) < 1e-5 && sc.mult === t.mult, `${name} at ${i}`); }
    });
    assert.ok(Math.abs(sc.banked - c.banked) < 1e-5, name);
  }
});

test('the five cars differ in the way their names promise', () => {
  const by = Object.fromEntries(CARS.map((c) => [c.name, c]));
  const t80 = (car) => { let s = makeCar(), i = 0; for (; speedOf(s) * 3.6 < 80 && i < 20 / DT; i++) s = step(s, { ...NONE, throttle: 1 }, car); return i * DT; };
  assert.ok(t80(by.Bruno) < t80(by.Dart) && t80(by.Dart) < t80(by.Pip), 'Bruno is the quickest off the line');
  const topAfter = (car) => speedOf(run(makeCar(), 25, () => ({ ...NONE, throttle: 1 }), car));
  assert.ok(topAfter(by.Ox) < topAfter(by.Pip) && topAfter(by.Pip) < topAfter(by.Bruno), 'Ox is the slowest, Bruno the fastest');
  const yaw = (car) => run({ ...makeCar(), vz: 15 }, 0.2, () => ({ ...NONE, throttle: 0.4, steer: 1 }), car).w;
  assert.ok(yaw(by.Pip) > yaw(by.Dart) && yaw(by.Dart) > yaw(by.Bruno) && yaw(by.Bruno) > yaw(by.Ox), 'Pip turns in fastest, the heavy ones slowest');
  // steady cornering with a moderate steering angle: how much sideways acceleration a car holds (v * yaw rate)
  const side = (car) => { let s = { ...makeCar(), vz: 14 }, acc = 0, n = 0; for (let i = 0; i < 5 / DT; i++) { s = step(s, { steer: 0.35, throttle: speedOf(s) < 14 ? 0.6 : 0.1, brake: 0, handbrake: 0 }, car); if (i * DT > 3) { acc += speedOf(s) * Math.abs(s.w); n++; } } return acc / n; };
  assert.ok(side(by.Marlin) > side(by.Dart) && side(by.Dart) > side(by.Bruno) && side(by.Bruno) > side(by.Ox), 'Marlin corners hardest, Ox least');
});

test('the five cars: sane numbers, and different from each other', () => {
  assert.equal(CARS.length, 5);
  for (const c of CARS) {
    assert.ok(c.power >= 5 && c.power <= 11 && c.top >= 25 && c.top <= 42 && c.grip >= 0.9 && c.grip <= 1.4 && c.slide >= 0.5 && c.slide <= 0.95 && c.agility >= 0.6 && c.agility <= 1.4, c.name);
  }
  assert.equal(new Set(CARS.map((c) => c.name)).size, 5);
  assert.ok(K.lockHard > K.lockMax);
});
