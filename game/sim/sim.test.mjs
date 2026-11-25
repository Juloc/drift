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

// ----- the five maps
const MAPS = read('../data/maps.json').maps.map((m) => ({ ...m, json: read('../data/maps/' + m.file) }));
const distToSegs = (segs, x, z) => { let best = Infinity; for (let i = 0; i < segs.length; i += 4) { const dx = segs[i + 2] - segs[i], dz = segs[i + 3] - segs[i + 1], l2 = dx * dx + dz * dz; const t = l2 ? Math.max(0, Math.min(1, ((x - segs[i]) * dx + (z - segs[i + 1]) * dz) / l2)) : 0; best = Math.min(best, Math.hypot(x - (segs[i] + dx * t), z - (segs[i + 1] + dz * t))); } return best; };

test('maps: five maps, the car park first and the lobby, each with its own name and a real loop', () => {
  assert.deepEqual(MAPS.map((m) => m.id), [0, 1, 2, 3, 4]);
  assert.equal(MAPS[0].lobby, true);
  assert.equal(new Set(MAPS.map((m) => m.name)).size, 5);
  for (const m of MAPS) {
    const j = m.json;
    assert.equal(j.id, m.id); assert.equal(j.gates.length, 8); assert.equal(j.grid.length, 8);
    assert.ok(j.loopLength > 350 && j.loopLength < 1500, m.name);
    const c = j.centre;
    assert.ok(Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]) < 12, `${m.name}: the loop closes`);
    assert.ok(j.sky && j.theme !== null, m.name);
  }
});

test('maps: the loop, the grid and the start are clear of walls and obstacles and inside the bounds', () => {
  for (const m of MAPS) {
    const pm = prepareMap(m.json);
    const xs = m.json.bounds.map((p) => p[0]), zs = m.json.bounds.map((p) => p[1]);
    const free = (x, z, margin) => x > Math.min(...xs) + 2 && x < Math.max(...xs) - 2 && z > Math.min(...zs) + 2 && z < Math.max(...zs) - 2 && distToSegs(pm.segs, x, z) >= margin && !pm.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + margin);
    for (const p of m.json.centre) assert.ok(free(p[0], p[1], 3), `${m.name}: the loop at ${p}`);
    for (const g of m.json.grid) assert.ok(free(g.x, g.z, 2), `${m.name}: grid slot ${g.x}, ${g.z}`);
  }
});

test('maps: each has the ground it is meant to have', () => {
  const by = Object.fromEntries(MAPS.map((m) => [m.name, prepareMap(m.json)]));
  const kind = (map, x, z) => surfaceAt(map, x, z).kind;
  const mid = (map) => map.centre[Math.floor(map.centre.length / 3)];
  assert.equal(kind(by['Harbour at night'], ...mid(by['Harbour at night'])), 'wet');
  const mt = by['Mountain pass'], c = mid(mt);
  assert.equal(kind(mt, c[0], c[1]), 'asphalt');
  assert.equal(kind(mt, c[0] + 60, c[1] + 60), 'grass');   // off the road (a car cannot get there: the rails stand in the way)
  const de = by.Desert;
  assert.equal(kind(de, 250, 10), 'asphalt');                                      // the patch at the start
  assert.equal(kind(de, 0, 0), 'sand');
  const wi = by['Winter track'];
  assert.equal(kind(wi, 0, 0), 'snow');
  assert.ok(wi.zones.filter((z) => z.kind === 'ice').length >= 3);
  assert.ok(surfaceAt(wi, wi.zones[0].x, wi.zones[0].z).mu < surfaceAt(wi, 0, 0).mu);
  assert.ok(surfaceAt(de, 0, 0).mu < surfaceAt(mt, c[0], c[1]).mu);
});

test('maps: a steady driver can go round the whole loop on every map without hitting anything', () => {
  const dart = CARS[0];
  for (const m of MAPS) {
    const pm = prepareMap(m.json), c = m.json.centre, g = m.json.grid[0];
    const target = m.name === 'Winter track' ? 9 : m.name === 'Mountain pass' ? 11 : 15;
    let s = makeCar(g.x, g.z, g.h), hits = 0, passed = 0, idx = 0;
    // start at the centre point nearest the grid slot and count how many points of the loop the car passes in order
    let best = Infinity; for (let i = 0; i < c.length; i++) { const d = Math.hypot(c[i][0] - g.x, c[i][1] - g.z); if (d < best) { best = d; idx = i; } }
    const limit = Math.round((m.json.loopLength / target) * 2.5 / DT);
    for (let i = 0; i < limit && passed < c.length - 3; i++) {
      const look = c[(idx + 3) % c.length];   // 3 points ahead
      let err = Math.atan2(look[0] - s.x, look[1] - s.z) - s.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
      const sp = speedOf(s);
      s = collide(pm, step(s, { steer: Math.max(-1, Math.min(1, err * 2.2)), throttle: sp < target ? 1 : 0, brake: sp > target + 2 ? 1 : 0, handbrake: 0 }, dart, surfaceAt(pm, s.x, s.z).mu));
      if (s.hit > 2) hits++;
      if (Math.hypot(c[(idx + 1) % c.length][0] - s.x, c[(idx + 1) % c.length][1] - s.z) < Math.hypot(c[idx][0] - s.x, c[idx][1] - s.z) + 1.5) { idx = (idx + 1) % c.length; passed++; }
    }
    assert.ok(passed >= c.length - 3, `${m.name}: the driver got round only ${passed} of ${c.length} points`);
    assert.equal(hits, 0, `${m.name}: ${hits} hits`);
  }
});

import { applyTuning, cost, valid, isTuned, topFactor, NONE as NO_TUNING, BUDGET } from './tuning.js';

test('tuning: a budget of 10 points over four sliders of -3 to +3', () => {
  assert.equal(cost({ steer: 3, balance: -2, power: 1, handbrake: -1 }), 7);
  assert.ok(valid({ steer: 3, balance: 3, power: 3, handbrake: 1 }) && cost({ steer: 3, balance: 3, power: 3, handbrake: 1 }) === BUDGET);
  assert.ok(!valid({ steer: 3, balance: 3, power: 3, handbrake: 2 }), 'eleven points');
  assert.ok(!valid({ steer: 4, balance: 0, power: 0, handbrake: 0 }) && !valid({ steer: 1.5, balance: 0, power: 0, handbrake: 0 }));
  assert.ok(!isTuned(NO_TUNING) && isTuned({ ...NO_TUNING, power: -1 }));
});

test('tuning: no tuning changes nothing; every slider has its counterweight', () => {
  const base = CARS[0], none = applyTuning(base, NO_TUNING);
  for (const k of ['power', 'top', 'grip', 'slide', 'agility']) assert.equal(none[k], base[k]);
  const up = (k, v) => applyTuning(base, { ...NO_TUNING, [k]: v });
  assert.ok(up('steer', 3).lockScale > 1 && up('steer', 3).top < base.top);            // more angle, less top speed
  assert.ok(up('steer', -3).lockScale < 1 && up('steer', -3).top > base.top);
  assert.ok(up('power', 3).power > base.power && up('power', 3).grip < base.grip);       // more power, less grip
  assert.ok(up('handbrake', 3).hbGrip < 0.2 && up('handbrake', 3).slide < base.slide);   // more bite, a slide that is harder to hold
  assert.ok(up('balance', 3).balance > 0 && up('balance', -3).balance < 0);
  assert.equal(topFactor({ ...NO_TUNING, steer: 3 }), 1 - 0.036);
  // the top speed moves by at most 3.6 %: the server's checks keep their 15 % of room
  assert.ok(topFactor({ ...NO_TUNING, steer: -3 }) <= 1.036 + 1e-9);
});

test('tuning: the physics follows the numbers (every slider changes how the car drives)', () => {
  const circle = (t) => { let s = { ...makeCar(), vz: 14 }, acc = 0, n = 0; const car = applyTuning(CARS[0], { ...NO_TUNING, ...t }); for (let i = 0; i < 5 / DT; i++) { s = step(s, { steer: 0.35, throttle: speedOf(s) < 14 ? 0.6 : 0.1, brake: 0, handbrake: 0 }, car); if (i * DT > 3) { acc += speedOf(s) * Math.abs(s.w); n++; } } return acc / n; };
  assert.deepEqual(circle({}), circle({}));
  assert.notEqual(circle({}), circle({ balance: 3 }));
  assert.notEqual(circle({ steer: 3 }), circle({}));   // more angle is not simply better: past the tyre's peak the front pushes wide
  assert.notEqual(circle({ power: 3 }), circle({}));
});


// ----- tandem: the same vectors as the server's C# test
import { tandemPair, newTandem, tandemStep } from './tandem.js';
test('tandem: pairs and chains give the numbers of the shared vectors', () => {
  const v = JSON.parse(readFileSync(new URL('../../tests/vectors/tandem.json', import.meta.url), 'utf8'));
  for (const [name, c] of Object.entries(v.pairs)) {
    const r = tandemPair(c.a, c.b);
    assert.equal(r.active, c.active, name);
    assert.ok(Math.abs(r.q - c.q) < 1e-5 && Math.abs(r.gap - c.gap) < 1e-5, name);
    assert.deepEqual(r.role.map((x) => x ?? null), c.role.map((x) => x ?? null), name);
  }
  for (const [name, c] of Object.entries(v.chains)) {
    let st = newTandem(); const events = [];
    c.steps.forEach((o, i) => { st = tandemStep(st, o, c.dt); if (st.event) events.push({ step: i, points: st.event.points }); });
    assert.deepEqual(events, c.events, name);
    assert.ok(Math.abs(st.banked - c.banked) < 1e-3, name);
  }
});

test('tandem: the properties that matter - closer is better, either way round, the lead is ahead, the multiplier is capped', () => {
  const car = (x, z, beta = 0.5) => ({ x, z, h: 0, vf: 22, beta });
  assert.ok(tandemPair(car(0, 0), car(5, 0)).q > tandemPair(car(0, 0), car(9, 0)).q);
  assert.equal(tandemPair(car(0, 0), car(5, 0)).q, tandemPair(car(5, 0), car(0, 0)).q);
  assert.deepEqual(tandemPair(car(0, 0), car(0.2, 6)).role, ['chase', 'lead']);
  let st = newTandem();
  for (let i = 0; i < 2000; i++) st = tandemStep(st, { q: 1, role: 'lead', speed: 40, slip: 1.2 }, 1 / 15);
  assert.ok(st.mult <= 2 && st.mult > 1.9);
  assert.ok(st.pending / (2000 / 15) <= 1500, 'points per second are capped');
});

// ----- the practice partner
import { PracticeBot, TandemPractice, poseOf, PRACTICE_START } from './practice.js';

test('practice: the bot drives a held drift circle on the car park and stays on the map', () => {
  const map = prepareMap(JSON.parse(readFileSync(new URL('../data/maps/01-car-park.json', import.meta.url), 'utf8')));
  const cars = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars;
  const bot = new PracticeBot(map, cars[0], PRACTICE_START, 1);
  let drifting = 0, n = 0;
  for (let i = 0; i < 20 / DT; i++) { const s = bot.step(); if (i * DT > 4) { n++; if (Math.abs(bodySlip(s)) > 0.26 && speedOf(s) > 8) drifting++; } assert.ok(Math.abs(s.x) < 120 && Math.abs(s.z) < 84, 'inside the map'); }
  assert.ok(drifting / n > 0.8, `drifts ${(100 * drifting / n).toFixed(0)} % of the time`);
});

test('practice: a car that drives the same circle beside the bot earns the tandem bonus, one far away does not', () => {
  const map = prepareMap(JSON.parse(readFileSync(new URL('../data/maps/01-car-park.json', import.meta.url), 'utf8')));
  const car = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars[0];
  const run = (gap) => {
    const bot = new PracticeBot(map, car, PRACTICE_START, 1);
    let me = makeCar(PRACTICE_START.x + gap, PRACTICE_START.z, PRACTICE_START.h); const scorer = new TandemPractice();
    for (let i = 0; i < 16 / DT; i++) {
      bot.step();
      me = collideCar(map, step(me, orbitBot(i * DT, me, { start: 1.5, dir: 1 }), car, 1, DT));
      if (i % 8 === 0) scorer.update(me, bot.state, 8 * DT);
    }
    return scorer.tandem;
  };
  const near = run(5), far = run(60);
  assert.ok(near.banked + near.pending > 50, `near: ${near.banked + near.pending}`);
  assert.equal(far.banked + far.pending, 0);
});
import { collide as collideCar } from './map.js';


// ----- the feel switch
import { applyFeel, PRO, ARCADE, feelOf } from './feel.js';
test('feel: arcade is the car as it is, pro takes aids away; the switch changes numbers only', () => {
  const car = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars[0];
  assert.equal(applyFeel(car, ARCADE), car);
  const pro = applyFeel(car, PRO);
  assert.ok(pro.assistScale < 0.5 && pro.yawDampScale < 0.7);
  assert.equal(pro.power, car.power);                    // nothing else is touched
  assert.equal(applyFeel(applyFeel(car, PRO), PRO).assistScale, pro.assistScale * 0.35);   // it composes with a tuning's numbers
  assert.equal(feelOf('pro'), PRO); assert.equal(feelOf(undefined), ARCADE); assert.equal(feelOf('x'), ARCADE);
});

test('feel: after a handbrake kick the pro car swings further than the arcade car with hands off the wheel', () => {
  const car = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars[0];
  const run = (c) => {
    let s = makeCar(0, 0, 0), maxSlip = 0, turned = 0;
    for (let i = 0; i < 12 / DT; i++) {
      const t = i * DT;
      const inp = t < 2.5 ? { steer: 0, throttle: 1, brake: 0, handbrake: 0 } : t < 3.0 ? { steer: 1, throttle: 1, brake: 0, handbrake: 1 } : { steer: 0, throttle: 0.6, brake: 0, handbrake: 0 };
      s = step(s, inp, c, 1, DT);
      if (t > 3) { maxSlip = Math.max(maxSlip, Math.abs(bodySlip(s))); turned = Math.max(turned, turnedAngle(s)); }
    }
    return { maxSlip, turned };
  };
  const a = run(car), p = run(applyFeel(car, PRO));
  assert.ok(p.maxSlip > a.maxSlip + 0.1 || p.turned > a.turned + 0.3, `arcade ${JSON.stringify(a)} pro ${JSON.stringify(p)}`);
});
