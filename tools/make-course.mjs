// Writes the autumn drift course (map 6): game/data/maps/08-autumn-course.json (what the simulation and the server read) and game/data/scenes/autumn.json (how it is drawn,
// until the look's own autumn scene comes). A circuit for drifting (mockup drift-mockups/drift-rennstrecke.png): a long start and finish straight in front of the
// grandstand, a fast right-hand sweeper, a change of direction, a hairpin, a short climb, a chicane on the back straight and two long right-hand drift bends round onto the
// start. Built with the track system as a closed road (game/sim/track.js `closed: true`): this script writes CONTROL DATA, `buildTrack` makes the road inside the limits and
// `checkTrack` must find nothing. Beside the road: run-off on the outside of every bend (grass, the barrier of tyre stacks further out), kerbs at the apexes and exits, the
// grandstand and the paddock along the start (as marks for the look). Run: node tools/make-course.mjs
import { writeFileSync } from 'node:fs';
import { round, turtle } from './maplib.mjs';
import { buildTrack, checkTrack, frameAt, surfaceAt, packTrack, LIMITS } from '../game/sim/track.js';

const HW = 6.5, RAIL = HW + LIMITS.shoulder, RUNOFF = 8;   // the barrier stands RUNOFF metres further out on the outside of a bend
// ---- the loop as a turtle (tools/maplib.mjs), clockwise; the land falls gently to the south (-z)
const { F, A, line, named, end } = turtle(0, 0, Math.PI / 2);
F(200, 'start');                                 // start and finish, east, in front of the grandstand
A(60, 90, 't1');                                 // the fast sweeper (right), south
F(40); A(35, -45, 's1'); A(35, 45, 's2');        // the change of direction: left, right
F(40); A(22, 180, 'pin');                        // the hairpin (right), back north
F(70); A(30, -90, 't5');                         // up the short climb, left onto the back straight, west
F(70); A(35, -30, 'c1'); A(35, 30, 'c2');        // the chicane
F(116, 'back');
A(45, 90, 't8'); F(9); A(45, 90, 't9');          // two long drift bends (right) round onto the start
if (Math.hypot(end.x, end.z) > 25 || Math.abs(Math.sin(end.h - Math.PI / 2)) > 0.01) throw new Error(`the loop does not come back to the start: ${end.x}, ${end.z}`);

const ctrl = line.slice(0, -1).map(([px, pz]) => ({ x: round(px), z: round(pz), hw: HW }));
const nearestCtrl = ([px, pz]) => { let b = 0, bd = Infinity; ctrl.forEach((c, i) => { const d = (c.x - px) ** 2 + (c.z - pz) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
ctrl[0].y = 0;
ctrl[nearestCtrl(named.start.at)].y = 0;
ctrl[nearestCtrl(named.s2.apex)].y = -4;
ctrl[nearestCtrl(named.pin.apex)].y = -6;
ctrl[nearestCtrl(named.t5.apex)].y = -2.5;
ctrl[nearestCtrl(named.back.at)].y = -3;
const spec = { version: 2, closed: true, ctrl };
const T = buildTrack(spec), check = checkTrack(T);
if (!check.ok) { console.error('the drift course breaks the limits of the track system:\n  ' + check.problems.map((p) => p.text).join('\n  ')); process.exit(1); }

// ---- beside the road, from the road frame
const at = (s, lat = 0) => frameAt(T, s, lat);
const pt = (s, lat) => { const f = at(s, lat); return [round(f.x), round(f.z)]; };
const sOf = ([px, pz]) => surfaceAt(T, px, pz).s;
const centre = []; for (let i = 0, n = Math.round(T.len / 3.5); i < n; i++) centre.push(pt((T.len * i) / n, 0));
// run-off: on the outside of each bend (k > 0 is a right-hand bend: its outside is the left), as much as the bend is tight, smoothed along the road so the barrier never kinks
const kAt = (s) => T.k[Math.max(0, Math.min(T.n - 1, Math.round((((s % T.len) + T.len) % T.len) / T.ds)))];
const smooth = (f, span) => (s) => { let a = 0, n = 0; for (let d = -span; d <= span; d += 2) { a += f(s + d); n++; } return a / n; };
const ramp = (v) => Math.max(0, Math.min(1, (v - 1 / 250) / (1 / 80 - 1 / 250)));
const outL = smooth((s) => RUNOFF * ramp(kAt(s)), 30), outR = smooth((s) => RUNOFF * ramp(-kAt(s)), 30);
const barrier = (side) => { const a = []; for (let i = 0, n = Math.round(T.len / 3); i < n; i++) { const s = (T.len * i) / n; a.push(pt(s, side * (RAIL + (side > 0 ? outR(s) : outL(s))))); } return a; };
const walls = [{ pts: barrier(1), closed: true, style: 'tyres' }, { pts: barrier(-1), closed: true, style: 'tyres' }];
// gates: 8 round the loop, the first is the start and finish line
const gates = Array.from({ length: 8 }, (_, g) => { const s = (T.len * g) / 8, f = at(s);   // (gate 0 at the first centre point: the server counts a lap there)
 return { a: pt(s, -(HW + 6)), b: pt(s, HW + 6), d: [round(Math.sin(f.head)), round(Math.cos(f.head))] }; });
const grid = Array.from({ length: 8 }, (_, i) => { const s = 30 + Math.floor(i / 2) * 9, f = at(s, i % 2 ? 2.5 : -2.5); return { x: round(f.x), z: round(f.z), h: round(f.head) }; });
// clipping points at the inner edge of every bend, kerbs (red and white, for the look) at each apex on the inside and on the outside where the bend lets go
const clips = [], bends = [], kerbs = [];
for (const key of ['t1', 's1', 's2', 'pin', 't5', 'c1', 'c2', 't8', 't9']) {
  const b = named[key], s = sOf(b.apex), side = Math.sign(b.turn), f = at(s, side * (HW - 1.5));
  clips.push({ x: round(f.x), z: round(f.z) }); bends.push({ name: key, s: round(s), right: side > 0 });
  const len = Math.min(40, (Math.abs(b.turn) / 90) * 25 + 10);
  kerbs.push({ s0: round(s - len / 2), s1: round(s + len / 2), side: side > 0 ? 'right' : 'left' }, { s0: round(s + len / 2), s1: round(s + len / 2 + 25), side: side > 0 ? 'left' : 'right' });
}
const xs = centre.map((p) => p[0]), zs = centre.map((p) => p[1]);
const bounds = [[Math.min(...xs) - 50, Math.max(...zs) + 60], [Math.max(...xs) + 50, Math.max(...zs) + 60], [Math.max(...xs) + 50, Math.min(...zs) - 50], [Math.min(...xs) - 50, Math.min(...zs) - 50]].map((p) => p.map(round));
// the grandstand and the paddock: beside the start straight on its outside (north), behind the barrier
const stand = at(110, -(RAIL + 10)), paddock = at(40, -(RAIL + 14));
const map = {
  id: 6, name: 'Autumn drift course', kind: 'circuit', closed: true, laps: 3, ground: 'grass', bounds, walls, obstacles: [], zones: [],
  road: { kind: 'asphalt', halfWidth: HW }, centre, halfWidth: HW, loopLength: round(T.len), gates, grid, clips, props: [],
  track: { ...packTrack(T), ctrl: spec.ctrl, bends, kerbs },
};
// ---- checks: the slots are clear and on the road, the gates on the road, the barriers clear of every piece of road (also another branch's) and of each other
const segs = [];
for (const w of walls) for (let i = 0; i < w.pts.length; i++) segs.push([w.pts[i], w.pts[(i + 1) % w.pts.length]]);
const near = (px, pz) => Math.min(...segs.map(([p, q]) => { const ddx = q[0] - p[0], ddz = q[1] - p[1], l2 = ddx * ddx + ddz * ddz, t = l2 ? Math.max(0, Math.min(1, ((px - p[0]) * ddx + (pz - p[1]) * ddz) / l2)) : 0; return Math.hypot(px - p[0] - ddx * t, pz - p[1] - ddz * t); }));
for (const g of grid) { if (near(g.x, g.z) < 2.5) throw new Error(`a start slot at ${g.x}, ${g.z} is too close to a wall`); if (surfaceAt(T, g.x, g.z).kind !== 'road') throw new Error(`a start slot at ${g.x}, ${g.z} is not on the road`); }
for (let s = 0; s < T.len; s += 1) for (const lat of [-HW, 0, HW]) { const f = at(s, lat); if (near(f.x, f.z) < 1.4) throw new Error(`a barrier comes within reach of the road at ${round(s)} m`); }
for (const w of walls) for (const p of w.pts) { const q = surfaceAt(T, p[0], p[1]); if (Math.abs(q.lat) < RAIL - 0.05) throw new Error(`a barrier point at ${p} stands on the road of another branch`); }
for (const g of gates) { const m = surfaceAt(T, (g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2); if (Math.abs(m.lat) > 0.1) throw new Error('a gate is not centred on the road'); }
writeFileSync(new URL('../game/data/maps/08-autumn-course.json', import.meta.url), JSON.stringify(map) + '\n');

// ---- the theme until the look's own autumn scene: the sunset look over land that falls gently to the south like the road
const prof = new Map();
for (let i = 0; i < T.n; i++) { const key = Math.round(-T.z[i] / 20) * 20; const a = prof.get(key) ?? [0, 0]; a[0] += T.y[i]; a[1]++; prof.set(key, a); }
const down = [...prof.entries()].sort((a, b) => a[0] - b[0]).map(([key, [sum, cnt]]) => [key, round(sum / cnt - 0.6)]);
const profile = [[down[0][0] - 400, round(down[0][1] + 40)], [down[0][0] - 120, round(down[0][1] + 6)], ...down, [down.at(-1)[0] + 120, round(down.at(-1)[1] - 6)], [down.at(-1)[0] + 600, round(down.at(-1)[1] - 40)]];
const theme = {
  look: 'sunset', rails: 'both', mode: 'slope', note: 'The autumn drift course: made by tools/make-course.mjs together with the physics map; the look\'s own autumn scene comes later.',
  road: { centreLine: false, bendMin: 0.35, bendSpan: 30, lamps: 0, kerbs: map.track.kerbs },
  terrain: { mode: 'slope', dir: [0, -1], profile, extent: [round(Math.min(...xs) - 600), round(Math.min(...zs) - 600), round(Math.max(...xs) + 600), round(Math.max(...zs) + 600)],
    core: [round(Math.min(...xs) - 60), round(Math.min(...zs) - 60), round(Math.max(...xs) + 60), round(Math.max(...zs) + 60)], flat: 1.0, blend: 6, floor: -40, hills: { amp: 10, from: 4, to: 10, near: 0 } },
  rings: [[900, 120, 220], [1150, 180, 300], [1450, 240, 360], [1800, 300, 420]],
  marks: [...clips.map((c) => ({ type: 'clip', x: c.x, z: c.z })), { type: 'grandstand', x: round(stand.x), z: round(stand.z), h: round(stand.head) }, { type: 'paddock', x: round(paddock.x), z: round(paddock.z), h: round(paddock.head) }],
  trees: [], margin: 700,
};
writeFileSync(new URL('../game/data/scenes/autumn.json', import.meta.url), JSON.stringify(theme, null, 1) + '\n');
const w = check.worst;
console.log(`autumn drift course: ${round(T.len)} m round, ${round(Math.max(...T.y) - Math.min(...T.y))} m up and down, ${bends.length} bends with clipping points, ${kerbs.length} kerbs, run-off up to ${RUNOFF} m`);
console.log(`  steepest: ${w.grade?.shown} on a straight, ${w['grade-bend']?.shown ?? '-'} in a bend; tightest bend ${w.radius?.shown}; side tilt up to ${w.bank?.shown}; inside every limit`);
