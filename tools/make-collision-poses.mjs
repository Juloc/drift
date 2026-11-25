// Writes tests/vectors/collision-poses.json: the poses (15 a second, as the page sends them) of cars that crash into walls, a planter, a pole and each other with the game's own
// physics and contact code. The server's C# test replays them through the relay with the map's walls and expects every pose to be accepted: the relay's checks (speed, the way a car
// may move between two poses, turning, walls) must still hold when cars bounce and spin. Run: node tools/make-collision-poses.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareMap, surfaceAt } from '../game/sim/map.js';
import { step, makeCar, bodyVelocity, bodySlip, DT } from '../game/sim/physics.js';
import { collideBody, collideCars } from '../game/sim/collision.js';

const map = prepareMap(JSON.parse(readFileSync(new URL('../game/data/maps/01-car-park.json', import.meta.url), 'utf8')));
const cars = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars;
const every = Math.round(1 / 15 / DT);   // one pose in 8 steps
let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const pose = (s) => ({ x: +s.x.toFixed(3), z: +s.z.toFixed(3), h: +(((s.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toFixed(4), vf: +bodyVelocity(s).vf.toFixed(3), beta: +bodySlip(s).toFixed(4), flags: s.hit > 0 ? 4 : 0 });
/** Drives with `inputs(t, s)` for `seconds`, a pose every 8 steps; the other car (if any) is driven the same way. */
function run(starts, carIds, inputs, seconds) {
  let st = starts.map((s) => makeCar(s.x, s.z, s.h));
  const out = st.map(() => []);
  for (let i = 0; i < seconds / DT; i++) {
    st = st.map((s, k) => step(s, inputs(i * DT, s, k), cars[carIds[k]], surfaceAt(map, s.x, s.z).mu));
    st = st.map((s) => collideBody(map, s));
    if (st.length === 2) { const r = collideCars(st[0], st[1]); st = [{ ...r.a, hit: Math.max(st[0].hit, r.hit) }, { ...r.b, hit: Math.max(st[1].hit, r.hit) }]; }
    if (i % every === every - 1) st.forEach((s, k) => out[k].push(pose(s)));
  }
  return out;
}
const flatOut = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
const wander = (t, s, k) => ({ steer: Math.sin(t * 1.7 + k) , throttle: 1, brake: 0, handbrake: t % 3 < 0.4 ? 1 : 0 });
const scenarios = {
  'full throttle into the planter wall, then wandering': { cars: [{ car: 2, poses: run([{ x: -75, z: 0, h: Math.PI / 2 }], [2], (t, s) => (t < 3.5 ? flatOut : wander(t, s, 0)), 7)[0] }] },
  'a glancing hit on the outer wall': { cars: [{ car: 0, poses: run([{ x: 60, z: 66, h: Math.PI / 2 + 0.25 }], [0], (t, s) => (t < 3 ? flatOut : wander(t, s, 1)), 7)[0] }] },
  'a drift into a pole': { cars: [{ car: 1, poses: run([{ x: -20, z: -56, h: Math.PI / 2 }], [1], (t, s) => ({ steer: t > 1 ? 0.15 : 0, throttle: 1, brake: 0, handbrake: 0 }), 6)[0] }] },
  'two cars head on': { cars: (() => { const r = run([{ x: -30, z: -40, h: Math.PI / 2 }, { x: 30, z: -39, h: -Math.PI / 2 }], [2, 0], (t, s, k) => (t < 3.5 ? flatOut : wander(t, s, k)), 7); return [{ car: 2, poses: r[0] }, { car: 0, poses: r[1] }]; })() },
  'two cars side swipe': { cars: (() => { const r = run([{ x: -50, z: -40, h: Math.PI / 2 }, { x: -45, z: -37, h: Math.PI / 2 + 0.3 }], [3, 4], (t, s, k) => (t < 2.5 ? flatOut : { steer: k ? -0.6 : 0.6, throttle: 1, brake: 0, handbrake: 0 }), 6); return [{ car: 3, poses: r[0] }, { car: 4, poses: r[1] }]; })() },
};
let worst = { dh: 0, d: 0 }; let hits = 0;
for (const sc of Object.values(scenarios)) for (const c of sc.cars) for (let i = 1; i < c.poses.length; i++) {
  const a = c.poses[i - 1], b = c.poses[i]; let dh = Math.abs(b.h - a.h); if (dh > Math.PI) dh = 2 * Math.PI - dh;
  worst.dh = Math.max(worst.dh, dh); worst.d = Math.max(worst.d, Math.hypot(b.x - a.x, b.z - a.z)); if (b.flags) hits++;
}
writeFileSync(new URL('../tests/vectors/collision-poses.json', import.meta.url), JSON.stringify({ hz: 15, scenarios }) + '\n');
console.log('wrote', Object.keys(scenarios).length, 'scenarios;', hits, 'poses with a hit; largest turn between two poses', worst.dh.toFixed(2), 'rad (relay allows 1.29), largest move', worst.d.toFixed(2), 'm');
