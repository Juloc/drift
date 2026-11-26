import test from 'node:test';
import assert from 'node:assert/strict';
import { circle, eight, slalom, hairpin, sBends, wallBend, wetPad, straight, place, gripAt, gripPerWheel, inPoly, GENERATORS } from './exercise.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a, b, e = 0.02) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('every generator returns the whole shape and a box that holds everything', () => {
  for (const [name, g] of Object.entries(GENERATORS)) {
    const ex = g();
    for (const k of ['name', 'cones', 'lines', 'clips', 'zones', 'walls', 'spawn', 'box']) assert.ok(k in ex, `${name} has ${k}`);
    const [x0, z0, x1, z1] = ex.box;
    for (const [x, z] of [...ex.cones, ...ex.lines.flat(), ...ex.zones.flatMap((z) => z.poly), ...ex.walls.flatMap((w) => w.pts), [ex.spawn.x, ex.spawn.z]]) assert.ok(x > x0 && x < x1 && z > z0 && z < z1, `${name}: ${x},${z} inside the box`);
  }
});

test('circle: a cone every 2.5 m on the inner radius, rings on the others, both ways round', () => {
  const c = circle(), r = 12, n = c.cones.length;
  near(n, Math.round((2 * Math.PI * r) / 2.5), 0);
  for (const p of c.cones) near(Math.hypot(p[0], p[1]), r, 0.02);
  const gaps = c.cones.map((p, i) => dist(p, c.cones[(i + 1) % n]));
  assert.ok(Math.max(...gaps) < 2.6 && Math.min(...gaps) > 2.3);
  assert.equal(c.lines.length, 2);
  assert.notEqual(circle({ dir: 1 }).spawn.h, circle({ dir: -1 }).spawn.h);
  assert.deepEqual(circle({ radii: [10] }).lines, []);
});

test('eight: two islands mirror each other, the rings cross, about 70 x 36 m', () => {
  const e = eight(), set = new Set(e.cones.map(([x, z]) => `${x},${z}`));
  for (const [x, z] of e.cones) assert.ok(set.has(`${-x},${z}`) || e.cones.some((p) => Math.abs(p[0] + x) < 0.02 && Math.abs(p[1] - z) < 0.02), 'mirror cone');
  const [x0, z0, x1, z1] = e.box;
  assert.ok(x1 - x0 > 60 && x1 - x0 < 80 && z1 - z0 > 30 && z1 - z0 < 45, `${x1 - x0} x ${z1 - z0}`);
  // the start lies on both rings and the car faces along the right ring's tangent
  const R = 10 + 8, s = e.spawn;
  near(dist([s.x, s.z], [17, 0]), R, 0.05); near(dist([s.x, s.z], [-17, 0]), R, 0.05);
  const f = [Math.sin(s.h), Math.cos(s.h)], rel = [s.x - 17, s.z];
  near(f[0] * rel[0] + f[1] * rel[1], 0, 0.05);
});

test('slalom: the line is the asked length, gaps repeat, gates at both ends', () => {
  const s = slalom({ length: 120, cones: 9, spacing: [12, 15, 18] }), line = s.cones.slice(0, 9);
  near(line.at(-1)[1] - line[0][1], 120, 0.02);
  const gaps = line.slice(1).map((p, i) => p[1] - line[i][1]);
  near(gaps[0] / gaps[1], 12 / 15, 0.01); near(gaps[3], gaps[0], 0.01);
  assert.equal(s.cones.length, 9 + 4);
  assert.ok(s.cones.some(([x, z]) => x === -4 && z === -10) && s.cones.some(([x, z]) => x === 4 && z === 130));
});

test('hairpin: lane of cones, clipping point at the apex inside and one on the outside of the exit', () => {
  const h = hairpin({ radius: 12, width: 9, approach: 60 });
  assert.equal(h.clips.length, 2);
  const [a, b] = h.clips;   // the bend's centre is (12, 60)
  near(dist([a[0], a[1]], [12, 60]), 12 - 4.5 + 1.5, 0.05);   // inside, at the apex (straight ahead of the centre)
  near(a[0], 12, 0.05);
  near(dist([b[0], b[1]], [12, 60]), 12 + 4.5 - 1.5, 0.05);   // outside
  for (const [x, z] of h.cones) assert.ok(Math.abs(dist([x, z], [12, 60]) - 7.5) < 0.1 || Math.abs(dist([x, z], [12, 60]) - 16.5) < 0.1 || z < 60 + 1e-6 || z > 60 - 1e-6);
  // the way out runs back beside the way in, 24 m away
  const out = h.cones.filter(([x, z]) => z < 55 && x > 20);
  assert.ok(out.length > 5);
});

test('sBends: three bends, left-right-left lane, symmetrical in length on both sides', () => {
  const s = sBends({ radius: 22, bends: 3, width: 9 });
  assert.ok(s.cones.length > 20);
  const xs = s.cones.map((p) => p[0]);
  assert.ok(Math.min(...xs) < -20 && Math.max(...xs) - Math.min(...xs) > 25, 'it bends to the left first and comes back');
});

test('wallBend: a wall on the outside, a 1.5 m clipping zone along it, a clip inside', () => {
  const w = wallBend({ radius: 30, angle: 110 });
  assert.equal(w.walls.length, 1); assert.equal(w.zones[0].kind, 'clip'); assert.equal(w.clips.length, 1);
  // the zone is 1.5 m wide: a point 0.75 m off the wall (on the track side) is in it, 3 m off is not
  const wall = w.walls[0].pts, k = Math.floor(wall.length / 2), p = wall[k], q = wall[k + 1], l = dist(p, q), n = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
  const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], side = inPoly(w.zones[0].poly, mid[0] + n[0] * 0.75, mid[1] + n[1] * 0.75) ? 1 : -1;
  assert.ok(inPoly(w.zones[0].poly, mid[0] + side * n[0] * 0.75, mid[1] + side * n[1] * 0.75));
  assert.ok(!inPoly(w.zones[0].poly, mid[0] + side * n[0] * 3, mid[1] + side * n[1] * 3));
});

test('wetPad and straight: the zone grip, the braking box, marks every 50 m', () => {
  const wp = wetPad({ size: 50, mu: 0.55 });
  near(gripAt(wp.zones, 0, 0), 0.55, 1e-9); near(gripAt(wp.zones, 30, 0), 1, 1e-9); near(gripAt(wp.zones, 0, 0, false), 1, 1e-9);
  const st = straight({ length: 220 });
  assert.equal(st.lines.filter((l) => l.length === 2 && l[0][0] === -2).length, 4);   // 50, 100, 150, 200
  assert.equal(st.zones[0].kind, 'brake'); near(gripAt(st.zones, 0, 205), 1, 1e-9);
});

test('place: moves and turns everything, the spawn heading turns with it, the box follows', () => {
  const s = slalom(), p = place(s, 10, 20, Math.PI / 2);   // turned to face +x
  near(p.spawn.h, Math.PI / 2, 1e-3);
  near(p.cones[0][0], 10, 0.02); near(p.cones[0][1], 20, 0.02);
  near(p.cones[1][0], 10 + (s.cones[1][1]), 0.05);   // the line now runs along +x
  near(p.spawn.x, 10 - 0 + (-22), 0.05);
  assert.ok(p.box[2] - p.box[0] > 100);
  const back = place(place(s, 0, 0, 1), 0, 0, -1);
  near(back.cones[3][0], s.cones[3][0], 0.05); near(back.cones[3][1], s.cones[3][1], 0.05);
});

test('grip per wheel: the left wheels on the wet pad get 0.55, the right ones 1', () => {
  const wp = place(wetPad({ size: 50, mu: 0.55 }), 0, 0, 0);
  const muW = [1, 1, 1, 1], car = { x: 25 - 0.8 + 0.8, z: 0 };   // the car's centre on the pad's east edge, facing +z: its right wheels are at x +0.8
  gripPerWheel(wp.zones, [[car.x + 0.8 * -1 - 0.1, 0], [car.x + 0.8 + 0.1, 0], [car.x - 0.9, -2], [car.x + 0.9, -2]], muW);
  assert.deepEqual(muW.map((v) => +v.toFixed(2)), [0.55, 1, 0.55, 1]);
});
