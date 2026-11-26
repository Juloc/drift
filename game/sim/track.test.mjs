import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, bakeTrack, checkTrack, surfaceAt, frameAt, packTrack, loadTrack, LIMITS } from './track.js';

// ---- a good road, built from control data: out of a plaza, a right-hand hairpin of radius 30, back, 14 m lower
const goodSpec = () => {
  const ctrl = [{ x: 0, z: 0, y: 50 }, { x: 0, z: 40 }, { x: 0, z: 120 }];
  for (let a = 1; a <= 8; a++) { const t = (a / 8) * Math.PI; ctrl.push({ x: 30 - 30 * Math.cos(t), z: 120 + 30 * Math.sin(t) }); }
  ctrl.push({ x: 60, z: 40 }, { x: 60, z: -60, y: 36 });
  return { ctrl, plaza: { pts: [[-20, -30], [20, -30], [20, 0], [-20, 0]] } };
};
const rules = (T) => checkTrack(T).problems.map((p) => p.rule).sort();

// ---- broken on purpose: straight roads along +z made by hand (bakeTrack takes them as they are)
const straight = (n, y, bank = () => 0, extra = {}) => bakeTrack({ pts: Array.from({ length: n }, (_, i) => [0, i * 2]), ds: 2, y: Array.from({ length: n }, (_, i) => y(i * 2)), bank: Array.from({ length: n }, (_, i) => bank(i * 2)), ...extra });
const ramp = (s, s0, len) => { const u = Math.max(0, Math.min(1, (s - s0) / len)); return u * u * (3 - 2 * u); };   // 0 to 1, smoothly
/** a height that goes from level into a steady grade `g` over `len` metres from s0 (a gentle vertical curve) */
const intoGrade = (g, s0, len) => (s) => (s <= s0 ? 0 : s >= s0 + len ? g * (s - s0 - len / 2) : (g * (s - s0) ** 2) / (2 * len));

test('track: a road built from control data is inside every limit and hits its control heights', () => {
  const T = buildTrack(goodSpec()), c = checkTrack(T);
  assert.deepEqual(c.problems.map((p) => p.text), []);
  assert.ok(Math.abs(T.y[T.n - 1] - 36) < 0.05 && T.y[0] === 50);
  assert.ok(c.worst.radius.value > 15 && c.worst.bank.value > 0.03, 'the hairpin is banked towards its inside');
  const apex = Math.round(T.n / 2); assert.ok(T.k[apex] > 0 && T.bank[apex] < 0, 'a right-hand bend: the right side is lower');
});

test('track: control heights the limits do not allow are reported, and the limits still hold', () => {
  const spec = goodSpec(); spec.ctrl.at(-1).y = -10;   // 60 m down in 390 m: 15 %
  const T = buildTrack(spec);
  assert.deepEqual(rules(T), ['height']);
  assert.ok(Math.max(...Array.from(T.grade, Math.abs)) <= LIMITS.grade);
});

test('track: each kind of broken road is found, and only that', () => {
  // too steep: 11 % on a straight road (under the 12 % of the surface, over the 10 % of the centre line)
  assert.deepEqual(rules(straight(300, intoGrade(-0.11, 100, 400))), ['grade']);
  // far too steep: the surface's limits break too
  assert.deepEqual(rules(straight(300, intoGrade(-0.3, 60, 500))), ['grade', 'slope', 'slope-both', 'step']);
  // a sharp crest: from +4 % to -4 % over 4 m of radius 50 (the grades themselves are fine)
  assert.deepEqual(rules(straight(200, (s) => (s < 200 ? 0.04 * s : 8 - 0.04 * (s - 200)))).filter((r) => r !== 'crest-load'), ['crest']);
  // a sharp dip
  assert.deepEqual(rules(straight(200, (s) => (s < 200 ? -0.04 * s : -8 + 0.04 * (s - 200)))).filter((r) => r !== 'dip-load'), ['dip']);
  // twist: the tilt goes from 0 to 2 % within 4 m (the tilt itself is allowed)
  assert.deepEqual(rules(straight(200, () => 0, (s) => 0.02 * ramp(s, 200, 4))), ['twist']);
  // the road hangs to one side on a straight piece by 5 %
  assert.deepEqual(rules(straight(200, () => 0, (s) => 0.05 * ramp(s, 100, 200))), ['bank-out']);
  // the plaza is half a metre above the start of the road
  assert.deepEqual(rules(straight(100, () => 0, () => 0, { plaza: { pts: [[-10, -20], [10, -20], [10, 0], [-10, 0]], y: 0.5 } })), ['plaza-level']);
  // the road falls away right at the plaza's mouth
  assert.deepEqual(rules(straight(100, intoGrade(-0.05, 4, 60), () => 0, { plaza: { pts: [[-10, -20], [10, -20], [10, 0], [-10, 0]], y: 0 } })), ['plaza-grade', 'plaza-level']);
  // a height step of 40 cm between two samples
  assert.ok(rules(straight(100, (s) => (s < 100 ? 0 : 0.4))).includes('step'));
  // too narrow
  assert.deepEqual(rules(straight(100, () => 0, () => 0, { hw: 3 })), ['width']);
});

test('track: a bend that is too tight, and two branches too close, are found', () => {
  const tight = []; for (let i = 0; i <= 40; i++) tight.push([0, i * 2]);
  for (let a = 1; a <= 16; a++) { const t = (a / 16) * Math.PI; tight.push([10 - 10 * Math.cos(t), 80 + 10 * Math.sin(t)]); }   // radius 10
  for (let i = 1; i <= 40; i++) tight.push([20, 80 - i * 2]);
  const r = rules(bakeTrack({ pts: tight, ds: 2 }));
  for (const rule of ['radius', 'radius-inner', 'radius-rail', 'transition']) assert.ok(r.includes(rule), rule);
  // the same road built from control points is relaxed until the bend is wide enough
  const built = buildTrack({ ctrl: tight.filter((_, i) => i % 4 === 0 || i === tight.length - 1).map(([x, z]) => ({ x, z })) });
  assert.ok(!rules(built).some((x) => x.startsWith('radius') || x === 'transition'), rules(built).join());
  // two long runs 12 m apart, joined by a wide loop far away
  const near = []; for (let i = 0; i <= 60; i++) near.push([0, i * 2]);
  for (let a = 1; a <= 30; a++) { const t = (a / 30) * Math.PI * 1.5; near.push([-30 + 30 * Math.cos(t), 120 + 30 * Math.sin(t)]); }
  const end = near.at(-1); for (let i = 1; i <= 30; i++) near.push([end[0] + i * 2, end[1]]);
  assert.ok(rules(bakeTrack(resampleFor(near))).includes('branch'));
});
const resampleFor = (pts) => ({ pts, ds: 2 });

test('track: the surface is continuous, its gradient is the slope of its height, and nothing is remembered between calls', () => {
  const T = buildTrack(goodSpec());
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  // a random walk on and beside the road in small steps: the height never jumps (the design's rule for every simulation step)
  let x = 0, z = 5, last = surfaceAt(T, x, z).y, worst = 0;
  for (let i = 0; i < 40000; i++) {
    const f = frameAt(T, (i / 40000) * T.len, (rnd() * 2 - 1) * 6.5), nx = f.x, nz = f.z, d = Math.hypot(nx - x, nz - z);
    if (d < 0.6) { const yv = surfaceAt(T, nx, nz).y; worst = Math.max(worst, Math.abs(yv - last) - 0.13 * d); }
    x = nx; z = nz; last = surfaceAt(T, x, z).y;
  }
  assert.ok(worst <= 0.001, `a jump of ${worst.toFixed(4)} m beyond 13 % of the way`);
  // the gradient against differences of the height, on the road and on the shoulder
  for (let i = 0; i < 3000; i++) {
    const f = frameAt(T, 30 + rnd() * (T.len - 40), (rnd() * 2 - 1) * 5.5), a = surfaceAt(T, f.x, f.z), e = 0.01;
    const gx = (surfaceAt(T, f.x + e, f.z).y - surfaceAt(T, f.x - e, f.z).y) / (2 * e), gz = (surfaceAt(T, f.x, f.z + e).y - surfaceAt(T, f.x, f.z - e).y) / (2 * e);
    assert.ok(Math.abs(gx - a.gx) < 0.004 && Math.abs(gz - a.gz) < 0.004, `gradient at s ${a.s.toFixed(1)}, lat ${a.lat.toFixed(1)}: ${a.gx.toFixed(4)}, ${a.gz.toFixed(4)} against ${gx.toFixed(4)}, ${gz.toFixed(4)}`);
  }
  // the same question, the same answer, whatever was asked before
  const q = surfaceAt(T, 31, 148); surfaceAt(T, 0, 10); surfaceAt(T, 500, 500);
  assert.deepEqual(surfaceAt(T, 31, 148), q);
});

test('track: plaza, road, shoulder and land; the frame and the surface agree; a packed road loads the same', () => {
  const T = buildTrack(goodSpec());
  assert.deepEqual(surfaceAt(T, 5, -12), { y: 50, gx: 0, gz: 0, s: 0, lat: 0, kind: 'plaza' });
  const at = (s, lat) => { const f = frameAt(T, s, lat); return surfaceAt(T, f.x, f.z); };
  assert.equal(at(200, 0).kind, 'road'); assert.equal(at(200, 4).kind, 'road'); assert.equal(at(200, 5.5).kind, 'shoulder'); assert.equal(at(200, -9).kind, 'land');
  assert.ok(Math.abs(at(200, -9).y - at(200, -6).y) < 1e-6, 'the land has the height of the edge of the shoulder');
  for (const [s, lat] of [[60, 0], [150, 3], [197, -4], [260, 2.5]]) {
    const f = frameAt(T, s, lat), a = surfaceAt(T, f.x, f.z);
    assert.ok(Math.abs(a.y - f.y) < 0.002 && Math.abs(a.s - s) < 0.01 && Math.abs(a.lat - lat) < 0.01, `s ${s}, lat ${lat}: ${a.s}, ${a.lat}, ${a.y} against ${f.y}`);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    assert.ok(Math.abs(dot(f.n, f.t)) < 1e-6 && Math.abs(dot(f.n, f.r)) < 1e-6 && f.n[1] > 0.98, 'the normal stands on the surface');
  }
  const again = loadTrack(JSON.parse(JSON.stringify(packTrack(T))));
  for (const [x, z] of [[2, 60], [33, 150], [58, 20]]) assert.ok(Math.abs(surfaceAt(again, x, z).y - surfaceAt(T, x, z).y) < 0.002);
  assert.deepEqual(checkTrack(again).problems.map((p) => p.rule), []);
});

test('track: every map file that brings a road of the track system is inside the limits, and its walls, gates and start slots sit on that road', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { prepareMap } = await import('./map.js');
  let seen = 0;
  for (const f of readdirSync('game/data/maps').filter((n) => n.endsWith('.json'))) {
    const json = JSON.parse(readFileSync('game/data/maps/' + f, 'utf8'));
    if (!json.track) continue;
    seen++;
    const map = prepareMap(json), T = map.surface, c = checkTrack(T);
    assert.deepEqual(c.problems.map((p) => p.text), [], f);
    for (const g of json.grid) assert.equal(surfaceAt(T, g.x, g.z).kind, 'road', `${f}: a start slot is on the road`);
    if (json.lobbySpawn) assert.equal(surfaceAt(T, json.lobbySpawn.x, json.lobbySpawn.z).kind, 'plaza');   // (a circuit has no plaza and no spawn of its own)
    // the rails (the physics walls) run along the outer edge of the shoulder
    for (const w of json.walls.filter((x) => x.style === 'rail')) for (const p of w.pts) { const q = surfaceAt(T, p[0], p[1]); if (q.kind !== 'plaza') assert.ok(Math.abs(Math.abs(q.lat) - (json.halfWidth + T.limits.shoulder)) < 0.06, `${f}: rail point ${p} at ${q.lat.toFixed(2)} m`); }
    // the centre line the server reads lies on the road's centre, and the heights fall the whole way down
    for (const p of json.centre) { const q = surfaceAt(T, p[0], p[1]); assert.ok(q.kind === 'plaza' || Math.abs(q.lat) < 0.05, `${f}: centre point ${p}`); }
    if (json.lobby) assert.ok(T.y[0] - T.y[T.n - 1] > 90, 'the touge goes down about a hundred metres');
  }
  assert.ok(seen >= 1, 'the touge has track data');
});
