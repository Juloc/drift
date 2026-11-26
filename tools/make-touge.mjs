// Writes the touge (map 0, the lobby: its plaza is where people meet): game/data/maps/06-touge.json (what the simulation and the server read) and game/data/scenes/touge.json (how it is drawn).
// A plaza at the top, then a road of about 2 km that zigzags down a hillside in nine runs joined by eight hairpins, built with the track system (game/sim/track.js,
// design: drift-mockups/DESIGN-PHYSIK-STRECKE.md): this script only writes CONTROL DATA (where the road goes, where it starts and how deep it ends); `buildTrack` makes the
// road inside the limits (grade spread over runs and hairpins, bends of at least 15 m that begin gently, side tilt into the bends, level out of the plaza), `checkTrack` must
// find nothing, and everything beside the road (rails as physics walls, gates, start slots, clipping points, the centre line the server reads) comes from the road frame.
// The runs fan out (each falls away from the one above), so two branches are never steep above one another. Run: node tools/make-touge.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { round } from './maplib.mjs';
import { buildTrack, checkTrack, frameAt, surfaceAt, packTrack, LIMITS } from '../game/sim/track.js';

const HW = 4.5, RAIL = HW + LIMITS.shoulder, RUNS = 9, RUN = 165, FAN = (5 * Math.PI) / 180, R = 22, DROP = 105, WOBBLE = 3.5;
const probe = JSON.parse(readFileSync(new URL('../game/data/probe-touge.json', import.meta.url), 'utf8'));

// ---- the control line: start at the plaza's east edge (30, 0) heading east; even runs go east, odd runs west, every run also falls away down the hill (-z) by the fan angle;
//      a hairpin is an arc of radius R that turns the rest of the half circle. A gentle wobble on each run dies away towards both ends.
const line = [];
let x = 30, z = 0;
const push = (px, pz) => line.push([px, pz]);
for (let k = 0; k < RUNS; k++) {
  const east = k % 2 === 0, dx = (east ? 1 : -1) * Math.cos(FAN), dz = -Math.sin(FAN), nx = -dz, nz = dx;
  // the first run leaves the plaza straight east and level, and only then swings into its fan angle
  const lead = k === 0 ? 40 : 0;
  if (k === 0) { for (let s = 0; s < lead; s += 5) push(x + s, z); x += lead; }
  const len = RUN - lead, n = Math.round(len / 10);
  for (let i = k === 0 ? 0 : 1; i <= n; i++) { const t = i / n, w = WOBBLE * Math.sin(Math.PI * t * 3) * Math.sin(Math.PI * t) ** 2 * (k % 2 ? -1 : 1); push(x + dx * len * t + nx * w, z + dz * len * t + nz * w); }
  x += dx * len; z += dz * len;
  if (k === RUNS - 1) break;
  // the hairpin: from heading (dx, dz) round to the next run's heading, turning towards -z (east end: to the right, west end: to the left)
  const turn = Math.PI - 2 * FAN, sign = east ? 1 : -1;   // + = to the right
  const h0 = Math.atan2(dx, dz), cx = x + Math.cos(h0) * R * sign, cz = z - Math.sin(h0) * R * sign;   // the centre is to the right (or left) of the way
  const steps = 10;
  for (let i = 1; i <= steps; i++) { const h = h0 + sign * turn * (i / steps); push(cx - Math.cos(h) * R * sign, cz + Math.sin(h) * R * sign); }
  x = line.at(-1)[0]; z = line.at(-1)[1];
}
const ctrl = line.map(([px, pz]) => ({ x: round(px), z: round(pz) }));
ctrl[0].y = 0;
ctrl.at(-1).y = -DROP;
// the plaza, 1.5 times as big as the look's probe made it (it was x -44 to 30, z -6 to 30: 2660 square metres; now x -64 to 30, z -6 to 36: 3900). The new part lies WEST and NORTH
// of the old: the road's mouth (30, 0), the start slots and the way down are as they were; the lobby's spawn area (x -32 to 16, z 4 to 24) stays free of obstacles.
const plazaPts = [[-60, -6], [26, -6], [30, -2], [30, 36], [-60, 36], [-64, 30], [-64, 0]];
const spec = { version: 2, closed: false, ctrl, plaza: { pts: plazaPts, mouth: 0 } };
const T = buildTrack(spec), check = checkTrack(T);
if (!check.ok) { console.error('the touge breaks the limits of the track system:\n  ' + check.problems.map((p) => p.text).join('\n  ')); process.exit(1); }

// ---- everything beside the road comes from the road frame
const at = (s, lat = 0) => frameAt(T, Math.max(0, Math.min(T.len, s)), lat);
const pt = (s, lat) => { const f = at(s, lat); return [round(f.x), round(f.z)]; };
// the centre line as the server, the minimap and the old drawing read it (every 3.5 m)
const centre = []; for (let i = 0, n = Math.round(T.len / 3.5); i <= n; i++) centre.push(pt((T.len * i) / n, 0));
// the guardrails: the line at the outer edge of the shoulder on both sides (the drawing puts the rail on the same line), joined by a wall across the dead end
const railLine = (lat) => { const a = []; for (let i = 0, n = Math.round(T.len / 3); i <= n; i++) a.push(pt((T.len * i) / n, lat)); return a; };
const rightRail = railLine(RAIL), leftRail = railLine(-RAIL), end = at(T.len), ex = Math.sin(end.head) * 8, ez = Math.cos(end.head) * 8;
const walls = [{ pts: rightRail, closed: false, style: 'rail' }, { pts: leftRail, closed: false, style: 'rail' },
  { pts: [rightRail.at(-1), [round(rightRail.at(-1)[0] + ex), round(rightRail.at(-1)[1] + ez)], [round(leftRail.at(-1)[0] + ex), round(leftRail.at(-1)[1] + ez)], leftRail.at(-1)], closed: false, style: 'wall' }];
// the plaza's walls leave the road mouth (as wide as the rails) open
walls.push({ pts: [[30, RAIL], [30, 36], [-60, 36], [-64, 30], [-64, 0], [-60, -6], [26, -6], [30, -RAIL]].map((p) => p.map(round)), closed: false, style: 'wall' });
// things to practise on, in the new west part (low and short, so a hit costs speed and not the car): a ring of ten tyres to drift round, two parallel concrete barriers as a gate
// (6 m between them), and two gates of cones in the north strip (cones are soft: knocked over, never a wall; the page draws them)
const obstacles = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return { x: round(-55 + Math.cos(a) * 6), z: round(24 + Math.sin(a) * 6), r: 0.55, what: 'tyre' }; });
walls.push({ pts: [[-62, 2], [-55, 2]], closed: false, style: 'barrier' }, { pts: [[-62, 8], [-55, 8]], closed: false, style: 'barrier' });
const cones = [[-40, 33.5], [-34, 33.5], [-26, 33.5], [-20, 33.5]].map(([cx, cz]) => ({ x: cx, z: cz, what: 'plaza-gate' }));
// gates: 8 across the road from the plaza's mouth to the end (a run is judged between the first and the last)
const gates = Array.from({ length: 8 }, (_, g) => { const s = 12 + ((T.len - 40) * g) / 7, f = at(s); return { a: pt(s, -11), b: pt(s, 11), d: [round(Math.sin(f.head)), round(Math.cos(f.head))] }; });
// the start slots: two by two on the first straight
const grid = Array.from({ length: 8 }, (_, i) => { const s = 30 + Math.floor(i / 2) * 9, f = at(s, i % 2 ? 2 : -2); return { x: round(f.x), z: round(f.z), h: round(f.head) }; });
// clipping points (game/sim/zones.js): one near the inner edge at the apex of each hairpin
const clips = [], pins = [];
for (let i = 0; i < T.n; ) {
  if (Math.abs(T.k[i]) <= 1 / 40) { i++; continue; }
  let j = i, turn = 0; while (j < T.n && Math.abs(T.k[j]) > 1 / 60) { turn += T.k[j] * T.ds; j++; }
  if (Math.abs(turn) > 1.75) { const s = ((i + j) / 2) * T.ds, f = at(s, Math.sign(turn) * (HW - 1.5)); clips.push({ x: round(f.x), z: round(f.z) }); pins.push({ s: round(s), right: turn > 0 }); }
  i = j + 1;
}
const xs = centre.map((p) => p[0]), zs = centre.map((p) => p[1]);
const bounds = [[-90, Math.max(...zs) + 60], [Math.max(...xs) + 40, Math.max(...zs) + 60], [Math.max(...xs) + 40, Math.min(...zs) - 40], [-90, Math.min(...zs) - 40]].map((p) => p.map(round));
const map = {
  id: 0, name: 'Touge', lobby: true, kind: 'descent', closed: false, laps: 1, ground: 'grass', bounds, walls, obstacles, cones, zones: [{ kind: 'asphalt', x0: -64, z0: -6, x1: 30, z1: 36 }],
  road: { kind: 'asphalt', halfWidth: HW }, centre, halfWidth: HW, loopLength: round(T.len), gates, grid, clips, lobbySpawn: { x: -8, z: 12, h: round(Math.PI / 2 - 0.2) }, props: [],
  track: { ...packTrack(T), ctrl: spec.ctrl, hairpins: pins },
};
// ---- checks: start slots and the spawn are clear of the walls and stand on the surface, the walls are where the rails are, the gates lie on the road
const segs = [];
for (const w of walls) for (let i = 0; i < w.pts.length - 1; i++) segs.push([w.pts[i], w.pts[i + 1]]);
const near = (px, pz) => Math.min(...segs.map(([p, q]) => { const ddx = q[0] - p[0], ddz = q[1] - p[1], l2 = ddx * ddx + ddz * ddz, t = l2 ? Math.max(0, Math.min(1, ((px - p[0]) * ddx + (pz - p[1]) * ddz) / l2)) : 0; return Math.hypot(px - p[0] - ddx * t, pz - p[1] - ddz * t); }));
for (const g of [...grid, map.lobbySpawn]) if (near(g.x, g.z) < 2.5) throw new Error(`a start slot at ${g.x}, ${g.z} is too close to a wall`);
for (const g of grid) if (surfaceAt(T, g.x, g.z).kind !== 'road') throw new Error(`a start slot at ${g.x}, ${g.z} is not on the road`);
if (surfaceAt(T, map.lobbySpawn.x, map.lobbySpawn.z).kind !== 'plaza') throw new Error('the lobby spawn is not on the plaza');
// the obstacles and cones are on the plaza and not in the spawn area (where the lobby puts up to 18 people: game/sim/spawn.js), the barriers' gap is wide enough
const spawns = Array.from({ length: 18 }, (_, id) => ({ x: map.lobbySpawn.x + ((id % 6) - 2.5) * 9, z: map.lobbySpawn.z + (Math.floor(id / 6) % 3) * 8 - 6 }));
for (const o of [...obstacles, ...cones]) { if (surfaceAt(T, o.x, o.z).kind !== 'plaza') throw new Error(`an obstacle at ${o.x}, ${o.z} is not on the plaza`); for (const sp of spawns) if (Math.hypot(o.x - sp.x, o.z - sp.z) < 7) throw new Error(`an obstacle at ${o.x}, ${o.z} is in the spawn area (near ${sp.x}, ${sp.z})`); if (near(o.x, o.z) < 2.5) throw new Error(`an obstacle at ${o.x}, ${o.z} is too close to a wall`); }
const [b1, b2] = walls.slice(-2); if (Math.abs(b2.pts[0][1] - b1.pts[0][1]) < 5) throw new Error('the barrier gate is too narrow');
for (const p of centre) if (near(p[0], p[1]) < HW + 0.9) throw new Error(`the road is too close to a wall at ${p}`);
for (const w of [rightRail, leftRail]) for (const p of w) { const q = surfaceAt(T, p[0], p[1]); if (q.kind !== 'plaza' && Math.abs(Math.abs(q.lat) - RAIL) > 0.05) throw new Error(`a rail point at ${p} is ${Math.abs(q.lat).toFixed(2)} m from the centre, not ${RAIL}`); }
for (const g of gates) { const m = surfaceAt(T, (g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2); if (Math.abs(m.lat) > 0.1) throw new Error('a gate is not centred on the road'); }
if (Math.max(...xs.map(Math.abs), ...zs.map(Math.abs)) > LIMITS.bound) throw new Error('the map is too big for the wire format');
writeFileSync(new URL('../game/data/maps/06-touge.json', import.meta.url), JSON.stringify(map) + '\n');

// ---- the theme: the look's probe scene (hillside, lake, volcanoes, moon) with this map's plaza, marks and road. The hillside's profile down the slope (-z) is taken from the
//      road's own heights, so the land lies where the road is (until the drawing follows the road by itself: slice 3 of the design)
const prof = new Map();
for (let i = 0; i < T.n; i++) { const key = Math.round(-T.z[i] / 20) * 20; const a = prof.get(key) ?? [0, 0]; a[0] += T.y[i]; a[1]++; prof.set(key, a); }
const down = [...prof.entries()].sort((a, b) => a[0] - b[0]).map(([key, [sum, cnt]]) => [key, round(sum / cnt)]).filter(([key]) => key > 0);
const last = down.at(-1), profile = [...probe.terrain.profile.filter(([key]) => key <= 0), ...down, [last[0] + 60, round(last[1] - 6)], [last[0] + 400, round(last[1] - 12)]];
const zMin = Math.min(...zs), xMax = Math.max(...xs);
const theme = {
  look: 'touge-dusk', rails: 'both', note: 'The touge: a hillside with a crater lake far below; made by tools/make-touge.mjs together with the physics map.', mode: 'slope',
  road: { centreLine: false, bendMin: probe.road.bendMin, bendSpan: probe.road.bendSpan, grade: 'slope', cut: probe.road.cut, lamps: probe.road.lamps, bendSets: probe.road.bendSets },
  terrain: { ...probe.terrain, profile, extent: [-300, round(zMin - 560), 820, 320], core: [-100, round(zMin - 80), round(xMax + 60), 80] },
  plaza: { ...probe.plaza, pts: plazaPts }, marks: [...probe.marks, ...clips.map((c) => ({ type: 'clip', x: c.x, z: c.z }))], lake: probe.lake, volcanoes: probe.volcanoes, ridges: probe.ridges, mist: probe.mist, trees: [],
};
writeFileSync(new URL('../game/data/scenes/touge.json', import.meta.url), JSON.stringify(theme, null, 1) + '\n');
const w = check.worst;
console.log(`touge: ${round(T.len)} m, ${round(Math.max(...T.y) - Math.min(...T.y))} m down, ${pins.length} hairpins, ${centre.length} centre points, ${walls.length} walls, z from ${Math.max(...zs)} down to ${zMin}, x ${Math.min(...xs)} to ${xMax}`);
console.log(`  steepest: ${w.grade?.shown} on a run, ${w['grade-bend']?.shown} in a bend, ${w.slope?.shown} at an edge; tightest bend ${w.radius?.shown}; side tilt up to ${w.bank?.shown}; inside every limit`);
