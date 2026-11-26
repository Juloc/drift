// Writes the practice ground: game/data/maps/07-practice.json (what the simulation and the server read) and game/data/scenes/practice.json (how it is drawn, until the
// look's own scene comes). Everything a driver needs to learn to drift, on one level asphalt pad and one short road:
//   the pad (220 x 140 m, level): a free corner for donuts, a drift circle of 15 m and one of 25 m (a ring of cones inside the line, a cone in the middle), a figure eight of two
//   15 m circles (the change from left to right), two slalom lanes (cones 15 m and 22 m apart);
//   the course: out of the pad to the east, a gentle climb, a long left-hand bend, a change of direction (right, left), a hairpin, a gentle descent and back into the pad from the
//   north. Built with the track system (game/sim/track.js): this script writes CONTROL DATA, `buildTrack` makes the road inside the limits and `checkTrack` must find nothing;
//   rails, gates, start slots and clipping points come from the road frame. Cones are soft (`cones`: drawn, knocked over, never a wall), so a missed line costs points, not the car.
// Run: node tools/make-practice.mjs
import { writeFileSync } from 'node:fs';
import { round, turtle } from './maplib.mjs';
import { buildTrack, checkTrack, frameAt, surfaceAt, packTrack, LIMITS } from '../game/sim/track.js';

const HW = 5, RAIL = HW + LIMITS.shoulder;
// the pad: a level rectangle; the course leaves it on the east side and comes back on the north side
const PAD = { x0: -125, x1: 95, z0: -100, z1: 40 };
const padPts = [[PAD.x0, PAD.z0], [PAD.x1, PAD.z0], [PAD.x1, PAD.z1], [PAD.x0, PAD.z1]];

// ---- the course as a turtle (tools/maplib.mjs): F = straight on, A = an arc of radius R turning by deg (+ to the right)
const { F, A, line, named } = turtle(PAD.x1, 20, Math.PI / 2);
F(30); F(90, 'top');           // out of the pad, then a gentle climb (about 6 %)
A(50, -90, 'long');             // the long bend (left), on the climb's crest
F(30);
A(28, 50, 's1'); A(28, -50, 's2');   // the change of direction: right, then left
F(72);
A(21, -180, 'pin');            // the hairpin (left)
F(75); A(40, 90, 'turn');      // down again (long enough for the hairpin's tilt to turn round), a right-hand bend onto the way back
F(120, 'back');                // the gentle descent home, level at the end
A(25, -90, 'home'); F(47);     // into the pad from the north, straight over its edge

const ctrl = line.map(([px, pz]) => ({ x: round(px), z: round(pz), hw: HW }));   // a little wider than the touge: room to learn
const nearestCtrl = ([px, pz]) => { let b = 0, bd = Infinity; ctrl.forEach((c, i) => { const d = (c.x - px) ** 2 + (c.z - pz) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
ctrl[0].y = 0;
ctrl[nearestCtrl(named.top.at)].y = 5.5;
ctrl[nearestCtrl(named.pin.apex)].y = 8.5;
ctrl[nearestCtrl(named.back.at)].y = 0;   // level for the last 40 m: the road meets the pad at its height
ctrl.at(-1).y = 0;
const spec = { version: 2, closed: false, ctrl, plaza: { pts: padPts, mouth: 0 } };
const T = buildTrack(spec), check = checkTrack(T);
if (!check.ok) { console.error('the practice course breaks the limits of the track system:\n  ' + check.problems.map((p) => p.text).join('\n  ')); process.exit(1); }

// ---- beside the road, from the road frame
const at = (s, lat = 0) => frameAt(T, Math.max(0, Math.min(T.len, s)), lat);
const pt = (s, lat) => { const f = at(s, lat); return [round(f.x), round(f.z)]; };
const inPad = ([px, pz]) => px > PAD.x0 - 0.01 && px < PAD.x1 + 0.01 && pz > PAD.z0 - 0.01 && pz < PAD.z1 + 0.01;
const centre = []; for (let i = 0, n = Math.round(T.len / 3.5); i <= n; i++) centre.push(pt((T.len * i) / n, 0));
// the rails: the line at the outer edge of the shoulder on both sides, cut where it runs over the pad (the pad's own wall takes over there, open at both mouths)
const railLine = (lat) => { const a = []; for (let i = 0, n = Math.round(T.len / 3); i <= n; i++) { const p = pt((T.len * i) / n, lat); if (!inPad(p)) a.push(p); } return a; };
const sOf = ([px, pz]) => surfaceAt(T, px, pz).s;
const mouthIn = at(0), mouthOut = at(T.len);
const walls = [{ pts: railLine(RAIL), closed: false, style: 'rail' }, { pts: railLine(-RAIL), closed: false, style: 'rail' }];
// the pad's wall: round the rectangle, open RAIL either side of where the road leaves (east, z 20) and comes back (north, at the road's end)
// where the road crosses the pad's north edge on its way home (the end itself lies a little inside the pad)
let ex = mouthOut.x;
for (let i = T.n - 1; i > 0; i--) if (T.z[i - 1] >= PAD.z1 && T.z[i] < PAD.z1) { ex = T.x[i - 1] + ((T.x[i] - T.x[i - 1]) * (T.z[i - 1] - PAD.z1)) / (T.z[i - 1] - T.z[i]); break; }
ex = round(ex);
walls.push({ pts: [[PAD.x1, round(mouthIn.z - RAIL)], [PAD.x1, PAD.z0], [PAD.x0, PAD.z0], [PAD.x0, PAD.z1], [round(ex - RAIL), PAD.z1]], closed: false, style: 'wall' });
walls.push({ pts: [[round(ex + RAIL), PAD.z1], [PAD.x1, PAD.z1], [PAD.x1, round(mouthIn.z + RAIL)]], closed: false, style: 'wall' });
// the rails end where the pad's wall begins: join each to its corner of the mouth
for (const w of walls.slice(0, 2)) {
  const first = w.pts[0], last = w.pts.at(-1), fs = sOf(first), ls = sOf(last);
  if (fs < 20) { const side = Math.sign(surfaceAt(T, first[0], first[1]).lat); w.pts.unshift([PAD.x1, round(mouthIn.z - side * RAIL)]); }
  if (ls > T.len - 40) { const side = Math.sign(surfaceAt(T, last[0], last[1]).lat); w.pts.push([round(ex - side * RAIL), PAD.z1]); }
}
// gates: 8 across the course from the pad's mouth to the way home (a run is judged between the first and the last)
const gates = Array.from({ length: 8 }, (_, g) => { const s = 12 + ((T.len - 50) * g) / 7, f = at(s); return { a: pt(s, -(HW + 6)), b: pt(s, HW + 6), d: [round(Math.sin(f.head)), round(Math.cos(f.head))] }; });
// the start slots: two by two on the first straight, past the first gate
const grid = Array.from({ length: 8 }, (_, i) => { const s = 30 + Math.floor(i / 2) * 9, f = at(s, i % 2 ? 2 : -2); return { x: round(f.x), z: round(f.z), h: round(f.head) }; });
// clipping points: at the inner edge of the long bend, both halves of the change and the hairpin (zones as on the touge: game/sim/zones.js)
const clips = [], bends = [];
for (const key of ['long', 's1', 's2', 'pin', 'turn']) {
  const b = named[key], s = sOf(b.apex), side = Math.sign(b.turn), f = at(s, side * (HW - 1.5));
  clips.push({ x: round(f.x), z: round(f.z) }); bends.push({ name: key, s: round(s), right: side > 0 });
}
// ---- the pad's exercises: cones (soft) and painted lines
const cones = [], paint = [];
const ring = (cx, cz, R, n, what) => {
  paint.push({ type: 'ring', x: cx, z: cz, r: R, what });
  cones.push({ x: cx, z: cz, what });   // the middle
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; cones.push({ x: round(cx + Math.cos(a) * (R - 3)), z: round(cz + Math.sin(a) * (R - 3)), what }); }
};
ring(-95, 15, 15, 10, 'circle-15');
ring(-35, 5, 25, 16, 'circle-25');
ring(-95, -62, 15, 10, 'eight'); ring(-65, -62, 15, 10, 'eight');
for (let i = 0; i < 8; i++) cones.push({ x: -30 + 15 * i, z: -48, what: 'slalom-15' });
for (let i = 0; i < 6; i++) cones.push({ x: -30 + 22 * i, z: -80, what: 'slalom-22' });
paint.push({ type: 'line', a: [-38, -48], b: [83, -48], what: 'slalom-15' }, { type: 'line', a: [-38, -80], b: [88, -80], what: 'slalom-22' });

const xs = centre.map((p) => p[0]).concat([PAD.x0, PAD.x1]), zs = centre.map((p) => p[1]).concat([PAD.z0, PAD.z1]);
const bounds = [[Math.min(...xs) - 40, Math.max(...zs) + 40], [Math.max(...xs) + 40, Math.max(...zs) + 40], [Math.max(...xs) + 40, Math.min(...zs) - 40], [Math.min(...xs) - 40, Math.min(...zs) - 40]].map((p) => p.map(round));
const map = {
  id: 5, name: 'Practice ground', kind: 'descent', closed: false, laps: 1, ground: 'grass', bounds, walls, obstacles: [],
  zones: [{ kind: 'asphalt', x0: PAD.x0, z0: PAD.z0, x1: PAD.x1, z1: PAD.z1 }],
  road: { kind: 'asphalt', halfWidth: HW }, centre, halfWidth: HW, loopLength: round(T.len), gates, grid, clips, lobbySpawn: { x: 40, z: 0, h: round(Math.PI / 2) }, props: [],
  cones, paint, practice: { pad: padPts, exercises: ['free', 'circle-15', 'circle-25', 'eight', 'slalom-15', 'slalom-22', 'course'] },
  track: { ...packTrack(T), ctrl: spec.ctrl, bends, rev: 1 },   // rev 1: the course of 755 m (it was 691 m): bests set on the shorter one are another board (RaceTrack.Rev)
};
// ---- checks: the slots and the spawn are clear of the walls and on the pad, the cones are on the pad and clear of each other's lines, the gates lie on the road
const segs = [];
for (const w of walls) for (let i = 0; i < w.pts.length - 1; i++) segs.push([w.pts[i], w.pts[i + 1]]);
const near = (px, pz) => Math.min(...segs.map(([p, q]) => { const ddx = q[0] - p[0], ddz = q[1] - p[1], l2 = ddx * ddx + ddz * ddz, t = l2 ? Math.max(0, Math.min(1, ((px - p[0]) * ddx + (pz - p[1]) * ddz) / l2)) : 0; return Math.hypot(px - p[0] - ddx * t, pz - p[1] - ddz * t); }));
for (const g of [...grid, map.lobbySpawn]) if (near(g.x, g.z) < 2.5) throw new Error(`a start place at ${g.x}, ${g.z} is too close to a wall`);
for (const g of grid) if (surfaceAt(T, g.x, g.z).kind !== 'road') throw new Error(`a start slot at ${g.x}, ${g.z} is not on the road`);
if (surfaceAt(T, map.lobbySpawn.x, map.lobbySpawn.z).kind !== 'plaza') throw new Error('the spawn is not on the pad');
for (const c of cones) { if (!inPad([c.x, c.z]) || near(c.x, c.z) < 8) throw new Error(`a cone at ${c.x}, ${c.z} is off the pad or too near its wall`); }
for (const p of centre) if (!inPad(p) && near(p[0], p[1]) < HW + 0.9) throw new Error(`the road is too close to a wall at ${p}`);
for (const g of gates) { const m = surfaceAt(T, (g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2); if (m.kind !== 'plaza' && Math.abs(m.lat) > 0.1) throw new Error('a gate is not centred on the road'); }
if (!(mouthOut.z < PAD.z1 - 3 && mouthOut.z > PAD.z1 - 20) || Math.abs(Math.abs(mouthOut.head) - Math.PI) > 0.05) throw new Error(`the road comes back at ${mouthOut.z.toFixed(1)} heading ${mouthOut.head.toFixed(2)}, not straight into the pad from the north`);
if (Math.abs(T.y[T.n - 1]) > 0.01) throw new Error('the road does not come back at the pad\'s height');
writeFileSync(new URL('../game/data/maps/07-practice.json', import.meta.url), JSON.stringify(map) + '\n');

// ---- the theme until the look's own: the touge's dusk over open land, the pad as the area
const theme = {
  look: 'touge-dusk', rails: 'both', mode: 'area', note: 'The practice ground: made by tools/make-practice.mjs together with the physics map; the look\'s own scene comes later.',
  road: { centreLine: false, bendMin: 0.35, bendSpan: 30, lamps: 16 },
  terrain: { profile: [[0, 0], [40, 1], [160, 6], [400, 20], [2000, 60]], floor: -30, hills: { amp: 8, from: 4, to: 10, near: 0 } },
  rings: [[900, 50, 140], [1150, 80, 200], [1450, 110, 250], [1800, 140, 300]],   // far ridges all round (the look's own scene will place its land)
  marks: [...clips.map((c) => ({ type: 'clip', x: c.x, z: c.z }))], margin: 600, trees: [],
};
writeFileSync(new URL('../game/data/scenes/practice.json', import.meta.url), JSON.stringify(theme, null, 1) + '\n');
const w = check.worst;
console.log(`practice: course ${round(T.len)} m, ${round(Math.max(...T.y) - Math.min(...T.y))} m up and down, ${bends.length} bends with clipping points, ${cones.length} cones, ${walls.length} walls`);
console.log(`  steepest: ${w.grade?.shown} on a straight, ${w['grade-bend']?.shown ?? '-'} in a bend; tightest bend ${w.radius?.shown}; side tilt up to ${w.bank?.shown}; inside every limit`);
