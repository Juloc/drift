// Writes the touge (map 5): game/data/maps/06-touge.json (what the simulation and the server read) and game/data/scenes/touge.json (how it is drawn).
// A plaza at the top by the crater lake, then a narrow road of about 2 km that zigzags down a steep hillside in nine runs joined by eight hairpins; guardrails on both sides are
// physics walls (the plaza's walls leave the road mouth open), the road ends in a dead end where a run is over (the page then takes the car back to the top).
// The height is only drawn (the 'slope' terrain mode of the look: the road takes its height from the hillside), the physics stays flat. Run: node tools/make-touge.mjs
import { writeFileSync } from 'node:fs';
import { round } from './maplib.mjs';

const HW = 4.5, RAIL = HW + 1.5, RUNS = 9, GAP_Z = 36, R = GAP_Z / 2, X_EAST = 170, X_WEST = 0;
const probe = JSON.parse((await import('node:fs')).readFileSync(new URL('../game/data/probe-touge.json', import.meta.url), 'utf8'));
// ---- the road: start at the plaza's east edge (30, 0); even runs go east, odd runs go west; hairpins are half circles of radius R
const pts = [];
const run = (x0, x1, z) => {   // a run with a gentle wobble that dies away towards both ends
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 10));
  for (let i = 0; i <= n; i++) { const t = i / n, w = 5 * Math.sin(Math.PI * t * 3) * Math.sin(Math.PI * t) ** 2; pts.push([x0 + (x1 - x0) * t, z + w]); }
};
const hairpin = (x, z, dir) => {   // from (x, z) round to (x, z - GAP_Z), bulging towards +x (dir 1) or -x (dir -1)
  for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI; pts.push([x + dir * R * Math.sin(a), z - R + R * Math.cos(a)]); }
};
let x = 30, z = 0;
for (let k = 0; k < RUNS; k++) {
  const east = k % 2 === 0, x1 = east ? X_EAST : X_WEST;
  run(x, x1, z);
  if (k < RUNS - 1) { hairpin(x1, z, east ? 1 : -1); pts.push([x1, z - GAP_Z]); }
  x = x1; z -= GAP_Z;
}
z += GAP_Z;
// dedupe near points and resample every 3.5 m so that the walls and the gates are smooth
const dense = [pts[0]];
for (const p of pts.slice(1)) { const q = dense.at(-1), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < 0.5) continue; const n = Math.ceil(d / 3.5); for (let i = 1; i <= n; i++) dense.push([q[0] + ((p[0] - q[0]) * i) / n, q[1] + ((p[1] - q[1]) * i) / n]); }
// a smooth centre line: a few passes of averaging (the corners of the polyline are rounded, the hairpins keep their radius)
let centre = dense;
for (let pass = 0; pass < 3; pass++) centre = centre.map((p, i) => (i === 0 || i === centre.length - 1 ? p : [(centre[i - 1][0] + p[0] * 2 + centre[i + 1][0]) / 4, (centre[i - 1][1] + p[1] * 2 + centre[i + 1][1]) / 4]));
centre = centre.map((p) => p.map(round));
const cum = [0]; for (let i = 1; i < centre.length; i++) cum.push(cum[i - 1] + Math.hypot(centre[i][0] - centre[i - 1][0], centre[i][1] - centre[i - 1][1]));
const length = cum.at(-1);
const dirAt = (i) => { const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
// ---- the guardrails: both sides of the road as open polylines (a car cannot leave the road), joined by a wall across the dead end
const side = (o) => centre.map((p, i) => { const d = dirAt(i); return [round(p[0] + d[1] * o), round(p[1] - d[0] * o)]; });
const rightRail = side(RAIL), leftRail = side(-RAIL);
const dEnd = dirAt(centre.length - 1);
const walls = [{ pts: rightRail, closed: false, style: 'rail' }, { pts: leftRail, closed: false, style: 'rail' }, { pts: [rightRail.at(-1), [round(rightRail.at(-1)[0] + dEnd[0] * 8), round(rightRail.at(-1)[1] + dEnd[1] * 8)], [round(leftRail.at(-1)[0] + dEnd[0] * 8), round(leftRail.at(-1)[1] + dEnd[1] * 8)], leftRail.at(-1)], closed: false, style: 'rail' }];
// ---- the plaza (from the look's probe: a flat meeting place with the road mouth on its east side); its walls leave the mouth (z -6 to 6 at x = 30) open
const plaza = probe.plaza.pts;
const plazaWall = { pts: [[30, 6], [30, 30], [-40, 30], [-44, 24], [-44, 0], [-40, -6], [30, -6]], closed: false, style: 'wall' };
walls.push(plazaWall);
// ---- gates: 8 across the road from the plaza's mouth to the end (a run is judged between the first and the last), grid on the first straight
const gates = Array.from({ length: 8 }, (_, g) => {
  const s = 12 + ((length - 40) * g) / 7; let i = 0; while (i < centre.length - 2 && cum[i + 1] < s) i++;
  const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1), cx = centre[i][0] + (centre[i + 1][0] - centre[i][0]) * t, cz = centre[i][1] + (centre[i + 1][1] - centre[i][1]) * t, d = dirAt(i), half = 11;
  return { a: [round(cx - d[1] * half), round(cz + d[0] * half)], b: [round(cx + d[1] * half), round(cz - d[0] * half)], d: [round(d[0]), round(d[1])] };
});
const at = (sAlong) => { let i = 0; while (i < centre.length - 2 && cum[i + 1] < sAlong) i++; const t = (sAlong - cum[i]) / (cum[i + 1] - cum[i] || 1); return { x: centre[i][0] + (centre[i + 1][0] - centre[i][0]) * t, z: centre[i][1] + (centre[i + 1][1] - centre[i][1]) * t, d: dirAt(i) }; };
const grid = Array.from({ length: 8 }, (_, i) => { const q = at(30 + Math.floor(i / 2) * 9), o = i % 2 ? 2 : -2; return { x: round(q.x + q.d[1] * o), z: round(q.z - q.d[0] * o), h: round(Math.atan2(q.d[0], q.d[1])) }; });
const xs = centre.map((p) => p[0]), zs = centre.map((p) => p[1]);
const bounds = [[-70, Math.max(...zs) + 40], [Math.max(...xs) + 40, Math.max(...zs) + 40], [Math.max(...xs) + 40, Math.min(...zs) - 40], [-70, Math.min(...zs) - 40]];
const map = {
  id: 5, name: 'Touge', kind: 'descent', closed: false, laps: 1, ground: 'grass', bounds, walls, obstacles: [], zones: [{ kind: 'asphalt', x0: -44, z0: -6, x1: 30, z1: 30 }],
  road: { kind: 'asphalt', halfWidth: HW }, centre, halfWidth: HW, loopLength: round(length), gates, grid, lobbySpawn: { x: -8, z: 12, h: round(Math.PI / 2) }, props: [],
};
// ---- checks: the grid and the spawn are clear of the walls
const segs = [];
for (const w of walls) for (let i = 0; i < w.pts.length - 1; i++) segs.push([w.pts[i], w.pts[i + 1]]);
const near = (px, pz) => Math.min(...segs.map(([p, q]) => { const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - p[0]) * dx + (pz - p[1]) * dz) / l2)) : 0; return Math.hypot(px - p[0] - dx * t, pz - p[1] - dz * t); }));
for (const g of [...grid, map.lobbySpawn]) if (near(g.x, g.z) < 2.5) throw new Error(`a start slot at ${g.x}, ${g.z} is too close to a wall`);
for (const p of centre) if (near(p[0], p[1]) < HW + 0.9) throw new Error(`the road is too close to a wall at ${p}`);
writeFileSync(new URL('../game/data/maps/06-touge.json', import.meta.url), JSON.stringify(map) + '\n');
// ---- the theme: the look's probe scene (hillside, lake, volcanoes, moon) with this map's plaza, marks and road
const theme = {
  look: 'touge-dusk', rails: 'both', note: 'The touge: a hillside with a crater lake far below; made by tools/make-touge.mjs together with the physics map.', mode: 'slope',
  road: { bendMin: probe.road.bendMin, bendSpan: probe.road.bendSpan, grade: 'slope', cut: probe.road.cut, lamps: probe.road.lamps },
  terrain: { ...probe.terrain, extent: [-300, -1100, 600, 320], core: [-60, round(Math.min(...zs) - 80), round(Math.max(...xs) + 60), 60] },
  plaza: { ...probe.plaza, pts: plaza }, marks: probe.marks, lake: probe.lake, volcanoes: probe.volcanoes, ridges: probe.ridges, mist: probe.mist, trees: [],
};
writeFileSync(new URL('../game/data/scenes/touge.json', import.meta.url), JSON.stringify(theme, null, 1) + '\n');
console.log(`touge: ${round(length)} m, ${centre.length} points, ${walls.length} walls, z from ${Math.max(...zs)} down to ${Math.min(...zs)}, x ${Math.min(...xs)} to ${Math.max(...xs)}`);
