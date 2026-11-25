// Writes the meeting place (map 0, the lobby and a race map): game/data/maps/01-meeting-place.json (what the simulation and the server read) and game/data/scenes/meeting.json (how
// it is drawn). A plaza cut into a mountain slope, a mountain road running round it as a loop (open to the plaza along one straight), guardrails on both sides of the road as
// physics walls, lanterns and a shrine gate on the plaza. Run: node tools/make-meeting.mjs   (then node tools/make-maps.mjs rewrites maps.json with this file as map 0).
import { writeFileSync } from 'node:fs';
import { spline, round, loopLength, offsetLoop, makeGates, makeGrid, distToLoop, inside } from './maplib.mjs';
import { distToPoly } from '../game/view/look/field.js';

const HW = 6.5, RAIL = HW + 1.5, GAP = 14;   // road half width, where the rail stands, how far from the plaza the rail is left open
// the road: a straight along the plaza (z = 44, running east), then once round the mountain
const ctrl = [[-120, 44], [-60, 44], [0, 44], [60, 44], [120, 44], [185, 40], [232, 8], [252, -44], [236, -92], [196, -118], [150, -104], [118, -138], [66, -172], [0, -184], [-70, -168], [-122, -132], [-172, -150], [-226, -108], [-252, -48], [-238, 6], [-196, 38], [-156, 44]];
const sampled = spline(ctrl, 8).map((p) => p.map(round));
const length = loopLength(sampled);
// the plaza: a rounded rectangle, open to the road along its south edge (z = 36.5, the road's inner edge)
const plaza = [[-55, 36.5], [55, 36.5], [55, -14], [48, -23], [40, -26], [-40, -26], [-48, -23], [-55, -14]];
const plazaWall = plaza.slice(1).concat([plaza[0]]).slice(0, plaza.length - 1);   // from the south-east corner round the north to the south-west corner (the south edge stays open)
// the rails: both sides of the road as physics walls; the inner one is open beside the plaza
const a = offsetLoop(sampled, RAIL).map((p) => p.map(round)), b = offsetLoop(sampled, -RAIL).map((p) => p.map(round));
const [outer, inner] = inside(sampled, ...a[0]) ? [b, a] : [a, b];
const cut = inner.map((p) => distToPoly(plaza, p[0], p[1]) < GAP);
const s0 = cut.findIndex((c) => c);   // rotate so that the open part is at the ends
const rot = [...inner.slice(s0), ...inner.slice(0, s0)], rcut = [...cut.slice(s0), ...cut.slice(0, s0)];
const runs = []; let run = [];
rot.forEach((p, i) => { if (!rcut[i]) run.push(p); else { if (run.length > 1) runs.push(run); run = []; } });
if (run.length > 1) runs.push(run);
const walls = [{ pts: outer, closed: true, style: 'rail' }, ...runs.map((pts) => ({ pts, closed: false, style: 'rail' })), { pts: plazaWall, closed: false, style: 'wall' }];
// things on the plaza: lanterns along the road side and a shrine gate in front of the mountain; their feet are solid
const marks = [{ type: 'lantern', x: -30, z: 28, ry: 0 }, { type: 'lantern', x: 30, z: 28, ry: 0 }, { type: 'lantern', x: -30, z: -17, ry: 0 }, { type: 'lantern', x: 30, z: -17, ry: 0 }, { type: 'gate', x: 0, z: -19, ry: 0 }];
const obstacles = marks.filter((m) => m.type === 'lantern').map((m) => ({ x: m.x, z: m.z, r: 0.6 }));
obstacles.push({ x: -1.3, z: -19, r: 0.35 }, { x: 1.3, z: -19, r: 0.35 });
// gates and grid
const { gates, centre, length: L } = makeGates(sampled, 8, 16, 0);
const grid = makeGrid(gates[0], 3.5);
const map = {
  id: 0, name: 'Meeting place', laps: 2, ground: 'grass',
  bounds: [[-300, -230], [300, -230], [300, 90], [-300, 90]], walls, obstacles,
  zones: [{ kind: 'asphalt', x0: -55, z0: -26, x1: 55, z1: 37 }],
  road: { kind: 'asphalt', halfWidth: HW }, centre, halfWidth: HW, loopLength: round(L), gates, grid,
  lobbySpawn: { x: 0, z: 14, h: round(Math.PI / 2) }, props: [],
};
// checks: the grid and the spawn are clear of walls and obstacles
const segs = [];
for (const w of walls) for (let i = 0; i < w.pts.length - (w.closed ? 0 : 1); i++) segs.push([w.pts[i], w.pts[(i + 1) % w.pts.length]]);
const near = (x, z) => Math.min(...segs.map(([p, q]) => { const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2)) : 0; return Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t); }));
for (const g of [...grid, map.lobbySpawn]) if (near(g.x, g.z) < 2.5) throw new Error(`a start slot at ${g.x}, ${g.z} is too close to a wall`);
for (const p of centre) if (near(p[0], p[1]) < HW + 0.9) throw new Error(`the road is too close to a wall at ${p}`);
writeFileSync(new URL('../game/data/maps/01-meeting-place.json', import.meta.url), JSON.stringify(map) + '\n');
// the theme: the land (a mountain inside the loop, a valley outside), the plaza and what stands on it
const theme = {
  look: 'sunset', note: 'The meeting place: a plaza cut into the slope inside a mountain road loop; made by tools/make-meeting.mjs together with the physics map.', mode: 'road', rails: 'both', railGap: GAP,
  grade: { amp: 8, waves: 3, phase: 0.8, flatAt: [0.04, 0.14] },
  terrain: { profile: [[-2000, 300], [-700, 150], [-320, 82], [-140, 40], [-70, 19], [-28, 7], [-9, 1.4], [0, 0], [9, -1.5], [28, -9], [70, -30], [160, -80], [420, -150], [2000, -220]], drop: [0.5, 4.5], openValley: 40, hills: { amp: 16, from: -35, to: -55, near: 0 }, floor: -70 },
  plaza: { pts: plaza, bays: { x0: -48, x1: 20, z0: -20, z1: -12, pitch: 5.5 }, wall: 0.7, kerb: false, rail: false,
    lamps: [[-44, 30], [-12, 30], [20, 30], [44, 30]], benches: [[28, -20, 3.1416], [36, -20, 3.1416]],
    trees: [[-50, -30, 'cherry'], [-34, -31, 'cherry'], [34, -31, 'cherry'], [50, -29, 'cherry'], [-60, -14, 'pine'], [60, -16, 'pine'], [-62, 10, 'cherry'], [64, 8, 'cherry']] },
  marks, rings: [[1000, 40, 120], [1200, 80, 180], [1450, 110, 240], [1750, 140, 300], [2100, 170, 360]], mistCount: 8,
};
writeFileSync(new URL('../game/data/scenes/meeting.json', import.meta.url), JSON.stringify(theme, null, 1) + '\n');
console.log(`meeting place: loop ${round(L)} m, ${centre.length} points, ${walls.length} walls (${runs.length} inner rail runs), grid slot 0 at ${grid[0].x}, ${grid[0].z}`);
