// Writes the winter pass (map 4, replacing the older winter track): game/data/maps/05-winter.json (what the simulation and the server read) and game/data/scenes/winter.json
// (how it is drawn, until the look's own winter scene comes). A circuit on a snowy mountainside (mockup drift-mockups/winter.png, "winter drift on a snowed-in alpine pass"):
// the start straight along the foot of the slope, two hairpins up the hill in switchbacks, a long bend over the shoulder, a change of direction (right, left) on the top, the
// run along the top with the view, then down the far side in long sweepers and round onto the start straight. Built with the track system as a closed road (game/sim/track.js:
// `closed: true`): this script writes CONTROL DATA, `buildTrack` makes the road inside the limits and `checkTrack` must find nothing; rails, gates, start slots and clipping
// points come from the road frame. The ground: packed snow on the road (little grip), ice patches in four bends (less still), deep snow beside it.
// Run: node tools/make-winter.mjs
import { writeFileSync } from 'node:fs';
import { round, turtle } from './maplib.mjs';
import { buildTrack, checkTrack, frameAt, surfaceAt, packTrack, LIMITS } from '../game/sim/track.js';

const HW = 6.5, RAIL = HW + LIMITS.shoulder;   // wide: on snow a drift needs room
// ---- the loop as a turtle (tools/maplib.mjs): the hill rises to the north (+z); runs across it, hairpins between them
const { F, A, line, named, end } = turtle(0, 0, Math.PI / 2);
F(140, 'start');                        // the start straight, east along the foot of the slope
A(20, -180, 'pin1');                    // hairpin 1 (left), up onto the second run
F(120, 'run2');                         // west, climbing
A(20, 180, 'pin2');                     // hairpin 2 (right)
F(100, 'run3');                         // east, climbing
A(50, -90, 'shoulder'); F(40);          // the long bend over the shoulder, north
A(40, -90, 'crest');                    // round onto the top, west
A(30, 45, 's1'); A(30, -45, 's2');      // the change of direction on the top
F(85, 'top');                           // the run along the top (the view)
A(50, -90, 'down');                     // over the edge, south
F(40); A(60, 25, 'sw1'); A(60, -25, 'sw2'); F(47);   // down the far side in sweepers
A(40, -90, 'foot');                     // round onto the start straight
if (Math.hypot(end.x, end.z) > 25 || Math.abs(Math.sin(end.h - Math.PI / 2)) > 0.01) throw new Error(`the loop does not come back to the start: ${end.x}, ${end.z}`);

const ctrl = line.slice(0, -1).map(([px, pz]) => ({ x: round(px), z: round(pz), hw: HW }));   // (the closed road joins the last point to the first by itself)
const nearestCtrl = ([px, pz]) => { let b = 0, bd = Infinity; ctrl.forEach((c, i) => { const d = (c.x - px) ** 2 + (c.z - pz) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
// heights: level along the start, up the switchbacks, highest on the top, down the far side
ctrl[0].y = 0;
ctrl[nearestCtrl(named.start.at)].y = 0;
ctrl[nearestCtrl(named.run2.at)].y = 9;
ctrl[nearestCtrl(named.run3.at)].y = 18;
ctrl[nearestCtrl(named.crest.apex)].y = 23;
ctrl[nearestCtrl(named.top.at)].y = 24;
const spec = { version: 2, closed: true, ctrl };
const T = buildTrack(spec), check = checkTrack(T);
if (!check.ok) { console.error('the winter pass breaks the limits of the track system:\n  ' + check.problems.map((p) => p.text).join('\n  ')); process.exit(1); }

// ---- beside the road, from the road frame
const at = (s, lat = 0) => frameAt(T, s, lat);
const pt = (s, lat) => { const f = at(s, lat); return [round(f.x), round(f.z)]; };
const sOf = ([px, pz]) => surfaceAt(T, px, pz).s;
const ring = (lat, step) => { const a = []; for (let i = 0, n = Math.round(T.len / step); i < n; i++) a.push(pt((T.len * i) / n, lat)); return a; };
const centre = ring(0, 3.5);
const walls = [{ pts: ring(RAIL, 3), closed: true, style: 'rail' }, { pts: ring(-RAIL, 3), closed: true, style: 'rail' }];
// gates: 8 round the loop, the first is the start and finish line
const gates = Array.from({ length: 8 }, (_, g) => { const s = (T.len * g) / 8, f = at(s);   // (gate 0 at the first centre point: the server counts a lap there)
 return { a: pt(s, -(HW + 6)), b: pt(s, HW + 6), d: [round(Math.sin(f.head)), round(Math.cos(f.head))] }; });
// the start slots: two by two on the start straight, past the line
const grid = Array.from({ length: 8 }, (_, i) => { const s = 30 + Math.floor(i / 2) * 9, f = at(s, i % 2 ? 2 : -2); return { x: round(f.x), z: round(f.z), h: round(f.head) }; });
// clipping points at the inner edge of each bend worth a drift; ice patches (round zones) in four of them, on the racing line just past the apex
const clips = [], bends = [], zones = [];
for (const key of ['pin1', 'pin2', 'shoulder', 'crest', 's1', 's2', 'down', 'foot']) {
  const b = named[key], s = sOf(b.apex), side = Math.sign(b.turn), f = at(s, side * (HW - 1.5));
  clips.push({ x: round(f.x), z: round(f.z) }); bends.push({ name: key, s: round(s), right: side > 0 });
}
for (const key of ['pin2', 's2', 'down', 'pin1']) { const b = named[key], s = sOf(b.apex) + 8, f = at(s, Math.sign(b.turn) * 1.5); zones.push({ kind: 'ice', x: round(f.x), z: round(f.z), r: 7 }); }
// a few pines beside the road (solid, well clear of the rails) on the inside of the switchbacks; the look adds its own forest
const props = [], obstacles = [];
for (const [key, d] of [['pin1', 14], ['pin2', 14], ['shoulder', 22], ['down', 22]]) {
  const b = named[key], s = sOf(b.apex), f = at(s, Math.sign(b.turn) * (RAIL + d)), q = surfaceAt(T, f.x, f.z);
  if (q.kind === 'land' && Math.abs(Math.abs(q.lat) - RAIL) > 6) { props.push({ type: 'pine', x: round(f.x), z: round(f.z), h: 8 }); obstacles.push({ x: round(f.x), z: round(f.z), r: 0.9 }); }
}
const xs = centre.map((p) => p[0]), zs = centre.map((p) => p[1]);
const bounds = [[Math.min(...xs) - 40, Math.max(...zs) + 40], [Math.max(...xs) + 40, Math.max(...zs) + 40], [Math.max(...xs) + 40, Math.min(...zs) - 40], [Math.min(...xs) - 40, Math.min(...zs) - 40]].map((p) => p.map(round));
const map = {
  id: 4, name: 'Winter pass', kind: 'circuit', closed: true, laps: 3, ground: 'snow', bounds, walls, obstacles, zones,
  road: { kind: 'snow', halfWidth: HW }, centre, halfWidth: HW, loopLength: round(T.len), gates, grid, clips, props,
  track: { ...packTrack(T), ctrl: spec.ctrl, bends },
};
// ---- checks: the slots are clear of the walls and on the road, the gates lie on the road, the ice is on it
const segs = [];
for (const w of walls) for (let i = 0; i < w.pts.length; i++) segs.push([w.pts[i], w.pts[(i + 1) % w.pts.length]]);
const near = (px, pz) => Math.min(...segs.map(([p, q]) => { const ddx = q[0] - p[0], ddz = q[1] - p[1], l2 = ddx * ddx + ddz * ddz, t = l2 ? Math.max(0, Math.min(1, ((px - p[0]) * ddx + (pz - p[1]) * ddz) / l2)) : 0; return Math.hypot(px - p[0] - ddx * t, pz - p[1] - ddz * t); }));
for (const g of grid) { if (near(g.x, g.z) < 2.5) throw new Error(`a start slot at ${g.x}, ${g.z} is too close to a wall`); if (surfaceAt(T, g.x, g.z).kind !== 'road') throw new Error(`a start slot at ${g.x}, ${g.z} is not on the road`); }
for (const p of centre) if (near(p[0], p[1]) < HW + 0.9) throw new Error(`the road is too close to a wall at ${p}`);
for (const g of gates) { const m = surfaceAt(T, (g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2); if (Math.abs(m.lat) > 0.1) throw new Error('a gate is not centred on the road'); }
for (const z of zones) if (surfaceAt(T, z.x, z.z).kind !== 'road') throw new Error('an ice patch is off the road');
writeFileSync(new URL('../game/data/maps/05-winter.json', import.meta.url), JSON.stringify(map) + '\n');

// ---- the theme until the look's own winter scene: the winter look over a hillside that rises to the north like the road (its profile from the road's own heights)
const prof = new Map();
for (let i = 0; i < T.n; i++) { const key = Math.round(-T.z[i] / 20) * 20; const a = prof.get(key) ?? [0, 0]; a[0] += T.y[i]; a[1]++; prof.set(key, a); }
const down = [...prof.entries()].sort((a, b) => a[0] - b[0]).map(([key, [sum, cnt]]) => [key, round(sum / cnt - 0.6)]);
const profile = [[down[0][0] - 300, round(down[0][1] + 60)], [down[0][0] - 120, round(down[0][1] + 20)], ...down, [down.at(-1)[0] + 120, round(down.at(-1)[1] - 6)], [down.at(-1)[0] + 600, round(down.at(-1)[1] - 30)]];
const theme = {
  look: 'winter-blue', rails: 'both', mode: 'slope', note: 'The winter pass: made by tools/make-winter.mjs together with the physics map; the look\'s own winter scene comes later.',
  road: { centreLine: false, bendMin: 0.35, bendSpan: 30, lamps: 24, bendSets: true },
  terrain: { mode: 'slope', dir: [0, -1], profile, extent: [round(Math.min(...xs) - 600), round(Math.min(...zs) - 600), round(Math.max(...xs) + 600), round(Math.max(...zs) + 600)],
    core: [round(Math.min(...xs) - 60), round(Math.min(...zs) - 60), round(Math.max(...xs) + 60), round(Math.max(...zs) + 60)], flat: 1.0, blend: 6, floor: -40, hills: { amp: 10, from: 4, to: 10, near: 0 } },
  rings: [[900, 120, 220], [1150, 180, 300], [1450, 240, 360], [1800, 300, 420]],
  marks: clips.map((c) => ({ type: 'clip', x: c.x, z: c.z })), trees: [], margin: 700,
};
writeFileSync(new URL('../game/data/scenes/winter.json', import.meta.url), JSON.stringify(theme, null, 1) + '\n');
const w = check.worst;
console.log(`winter pass: ${round(T.len)} m round, ${round(Math.max(...T.y) - Math.min(...T.y))} m up and down, ${bends.length} bends with clipping points, ${zones.length} ice patches, ${walls.length} rails`);
console.log(`  steepest: ${w.grade?.shown} on a straight, ${w['grade-bend']?.shown ?? '-'} in a bend; tightest bend ${w.radius?.shown}; side tilt up to ${w.bank?.shown}; inside every limit`);
