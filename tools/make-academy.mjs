// Writes the drift training place: game/data/maps/09-academy.json (what the simulation and the test page read) and game/data/scenes/academy.json (the plain scene until the
// look's own). The place is a pad of 250 x 180 m with a barrier all round and the exercises of game/sim/exercise.js on it, from ONE config below: which generator, its numbers,
// where it stands and how it is turned. The tool stops when
//   - two exercises' boxes touch (each box is 3 m round its exercise, so the parts are at least 6 m apart),
//   - a cone lies within 7 m of any start place,
//   - a part of an exercise leaves the pad (2 m from the barrier at least).
// Run: node tools/make-academy.mjs
import { writeFileSync } from 'node:fs';
import { GENERATORS, place } from '../game/sim/exercise.js';

export const PAD = { x0: -125, x1: 125, z0: -90, z1: 90 };
export const CONFIG = [
  { key: 'circle', gen: 'circle', at: [-92, 55], turn: 0, label: 'Kreis', opts: { radii: [12, 18, 25] } },
  { key: 'eight', gen: 'eight', at: [-12, 62], turn: 0, label: 'Acht', opts: {} },
  { key: 'slalom', gen: 'slalom', at: [-95, -55], turn: Math.PI / 2, label: 'Slalom', opts: {} },
  { key: 'straight', gen: 'straight', at: [-105, -80], turn: Math.PI / 2, label: 'Gerade', opts: { length: 170 } },
  { key: 'wetPad', gen: 'wetPad', at: [0, 0], turn: 0, label: 'Nasse Fläche', opts: {} },
  { key: 'hairpin', gen: 'hairpin', at: [90, -70], turn: 0, label: 'Kehre', opts: { approach: 45 } },
  { key: 'wallBend', gen: 'wallBend', at: [46, 18], turn: 0, label: 'Wandkurve', opts: {} },
  { key: 'sBends', gen: 'sBends', at: [-106, -8], turn: Math.PI / 2, label: 'S-Kurven', opts: { angle: 40, lead: 15 } },
];
export const FREE = { x: 62, z: -28, h: 0, label: 'Freie Fläche' };   // an open stretch of the pad with nothing on it
export const MAIN_SPAWN = { x: -115, z: 10, h: Math.PI / 2 };

export function build(config = CONFIG) {
  const placed = config.map((c) => ({ ...c, ex: place(GENERATORS[c.gen](c.opts), c.at[0], c.at[1], c.turn) }));
  const problems = [];
  const gapBetween = (a, b) => Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);   // < 0: the boxes overlap
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) { const g = gapBetween(placed[i].ex.box, placed[j].ex.box); if (g < 0) problems.push(`${placed[i].key} and ${placed[j].key} overlap by ${(-g).toFixed(1)} m (boxes 3 m round each)`); }
  const spawns = [...placed.map((p) => ({ name: p.key, ...p.ex.spawn })), { name: 'free', ...FREE }, { name: 'main', ...MAIN_SPAWN }];
  for (const p of placed) for (const [x, z] of p.ex.cones) for (const s of spawns) if (Math.hypot(x - s.x, z - s.z) < 7) problems.push(`a cone of ${p.key} at ${x}, ${z} is within 7 m of the start of ${s.name}`);
  for (const p of placed) { const [x0, z0, x1, z1] = p.ex.box, m = 3 - 2; if (x0 + 3 < PAD.x0 + 2 || z0 + 3 < PAD.z0 + 2 || x1 - 3 > PAD.x1 - 2 || z1 - 3 > PAD.z1 - 2) problems.push(`${p.key} leaves the pad (box ${p.ex.box.join(', ')})`); void m; }
  for (const s of spawns) if (s.x < PAD.x0 + 2 || s.x > PAD.x1 - 2 || s.z < PAD.z0 + 2 || s.z > PAD.z1 - 2) problems.push(`the start of ${s.name} is off the pad`);
  const freeBox = [FREE.x - 15, FREE.z - 15, FREE.x + 15, FREE.z + 15];
  for (const p of placed) if (gapBetween(p.ex.box, freeBox) < 0) problems.push(`${p.key} is on the free pad`);
  return { placed, spawns, problems };
}

export function mapOf({ placed, spawns }) {
  const cones = [], paint = [], clips = [], zones = [], walls = [], exercises = [];
  const bounds = [[PAD.x0, PAD.z1], [PAD.x1, PAD.z1], [PAD.x1, PAD.z0], [PAD.x0, PAD.z0]];
  for (const p of placed) {
    const e = p.ex, first = cones.length;
    for (const [x, z] of e.cones) cones.push({ x, z, what: p.key });
    for (const l of e.lines) paint.push({ type: 'polyline', pts: l, what: p.key });
    for (const [x, z, r] of e.clips) clips.push({ x, z, r, what: p.key });
    for (const zn of e.zones) zones.push({ ...zn, what: p.key });
    for (const w of e.walls) walls.push({ pts: w.pts, closed: false, style: w.style });
    exercises.push({ key: p.key, name: e.name, label: p.label, spawn: e.spawn, box: e.box, cones: [first, cones.length] });
  }
  exercises.push({ key: 'free', name: 'free', label: FREE.label, spawn: { x: FREE.x, z: FREE.z, h: FREE.h }, box: [FREE.x - 15, FREE.z - 15, FREE.x + 15, FREE.z + 15], cones: [0, 0] });
  const wet = zones.find((z) => z.kind === 'wet');
  return {
    id: 7, name: 'Drift Academy', kind: 'area', closed: false, laps: 1, ground: 'asphalt', bounds, walls, obstacles: [],
    zones: [{ kind: 'asphalt', x0: PAD.x0, z0: PAD.z0, x1: PAD.x1, z1: PAD.z1 }], centre: [[-300, 0], [-312, 0]], halfWidth: 3, loopLength: 12,   // (a stub of road far outside the pad: the scene builder wants a road; the look work will place its own world)
    gates: [], grid: [], clips, props: [],
    lobbySpawn: { ...MAIN_SPAWN }, cones, paint,
    academy: { pad: PAD, exercises, grip: zones.filter((z) => z.mu != null).map((z) => ({ poly: z.poly, kind: z.kind, mu: z.mu, what: z.what })), zones, wetMu: wet?.mu ?? 0.55 },
  };
}

const theme = {
  look: 'academy-sunset', rails: 'none', mode: 'area', note: 'The drift training place: a pier in a harbour; its look is view/look/place.js; made by tools/make-academy.mjs.',
  road: { centreLine: false }, terrain: { profile: [[0, 0], [10, 0], [28, -5], [2000, -8]], floor: -30, hills: { amp: 0, from: 4, to: 10, near: 0 } },   // under the sea all round: the place stands on its own platform
  rings: [[900, 50, 140], [1150, 80, 200], [1450, 110, 250], [1800, 140, 300]], marks: [], margin: 600, trees: [], mist: false,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = build();
  if (r.problems.length) { console.error('the academy does not fit:\n  ' + r.problems.join('\n  ')); process.exit(1); }
  const map = mapOf(r);
  writeFileSync(new URL('../game/data/maps/09-academy.json', import.meta.url), JSON.stringify(map) + '\n');
  writeFileSync(new URL('../game/data/scenes/academy.json', import.meta.url), JSON.stringify({ ...theme, marks: map.clips.map((c) => ({ type: 'clip', x: c.x, z: c.z })) }, null, 1) + '\n');
  console.log(`academy: pad ${PAD.x1 - PAD.x0} x ${PAD.z1 - PAD.z0} m, ${r.placed.length} exercises, ${map.cones.length} cones, ${map.walls.length} wall pieces, ${map.academy.grip.length} grip zone(s)`);
}
