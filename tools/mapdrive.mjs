// A bot drives a map's road once (Node, no browser): the line bot (game/sim/linebot.js) with the game's physics, its ground grip and its walls (collideBody, as in game/main.js).
// It says whether the run reached the end without touching a wall, how long it took, and the drift angle in each bend that has a clipping point.
// The bot's numbers: the touge's first, then slower ones, then (little grip) careful ones, last the steady driver of the game's map test, until a run is clean
// (a map is fine when a clean run exists; how fast is the driver's business). `drift` in the result: the drifting bot was clean too.
// Usage: node tools/mapdrive.mjs game/data/maps/07-practice.json [car id = 1]   Prints one JSON line; exit 1 when no clean run was found.
import { readFileSync } from 'node:fs';
import { prepareMap, surfaceAt } from '../game/sim/map.js';
import { collideBody } from '../game/sim/collision.js';
import { step, makeCar, bodySlip, speedOf, DT } from '../game/sim/physics.js';
import { lineBot } from '../game/sim/linebot.js';

export const BOTS = [
  { speed: 30, corner: 11, kick: 0.25, look: 14, hold: 0.55 }, { speed: 26, corner: 10, kick: 0.25, look: 14, hold: 0.55 },
  { speed: 22, corner: 9, kick: 0.25, look: 12, hold: 0.55 }, { speed: 18, corner: 8, kick: 0.3, look: 10, hold: 0.5 }, { speed: 15, corner: 7, kick: 0.35, look: 9, hold: 0.5 },
  // for little grip (snow, ice): slower into the bends, the tail thrown out only in the tight ones
  { speed: 16, corner: 6, kick: 0.6, look: 10, hold: 0.45 }, { speed: 13, corner: 5, kick: 0.8, look: 9, hold: 0.4 }, { speed: 11, corner: 4.5, kick: 1.2, look: 8, hold: 0.35 },
  // last: the steady driver of the game's own map test (game/sim/sim.test.mjs): a fixed speed, braking above it, steering at a point 3 centre points ahead
  { steady: 15 }, { steady: 11 }, { steady: 9 },
];

/** The steady driver: no drifting, a fixed speed. */
function steadyDriver(pts, closed, target) {
  let idx = -1;
  return (t, s) => {
    const n = pts.length, at = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, i)]);
    if (idx < 0) { let b = Infinity; pts.forEach((p, i) => { const d = Math.hypot(p[0] - s.x, p[1] - s.z); if (d < b) { b = d; idx = i; } }); }
    while (Math.hypot(at(idx + 1)[0] - s.x, at(idx + 1)[1] - s.z) < Math.hypot(at(idx)[0] - s.x, at(idx)[1] - s.z) + 1.5 && (closed || idx < n - 1)) idx++;
    const look = at(idx + 3);
    let err = Math.atan2(look[0] - s.x, look[1] - s.z) - s.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    const sp = speedOf(s);
    return { steer: Math.max(-1, Math.min(1, err * 2.2)), throttle: sp < target ? 1 : 0, brake: sp > target + 2 ? 1 : 0, handbrake: 0 };
  };
}

/** One run with one set of bot numbers: { clean, end, seconds, hits, firstHit, bends: [{ clip, deg, kmh }] }. */
export function driveOnce(json, car, bot, { laps = 1 } = {}) {
  const map = prepareMap(json), pts = json.centre, closed = json.closed !== false;
  const drive = bot.steady ? steadyDriver(pts, closed, bot.steady) : lineBot(pts, { closed, ...bot });
  const a = pts[0], b = pts[1];
  let s = makeCar(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])), t = 0, hits = 0, firstHit = null, was = false, along = 0, last = [a[0], a[1]];
  const clips = json.clips ?? [], best = clips.map(() => ({ deg: 0, kmh: 0 }));
  const total = (json.loopLength ?? 0) * (closed ? laps : 1), end = pts.at(-1), tMax = 30 + total / 6;
  while (t < tMax) {
    const mu = surfaceAt(map, s.x, s.z).mu;
    s = collideBody(map, step(s, drive(t, s, DT), car, mu)); t += DT;
    if (s.hit > 0 && !was) { hits++; firstHit ??= { x: +s.x.toFixed(1), z: +s.z.toFixed(1), t: +t.toFixed(1) }; }
    was = s.hit > 0;
    along += Math.hypot(s.x - last[0], s.z - last[1]); last = [s.x, s.z];
    clips.forEach((c, i) => { if (Math.hypot(s.x - c.x, s.z - c.z) < 12) { const deg = Math.abs(bodySlip(s)) * 57.3; if (deg > best[i].deg) best[i] = { deg: Math.round(deg), kmh: Math.round(speedOf(s) * 3.6) }; } });
    if (!closed && Math.hypot(s.x - end[0], s.z - end[1]) < 14 && along > total * 0.8) break;
    if (closed && along > total) break;
  }
  const done = closed ? along > total : Math.hypot(s.x - end[0], s.z - end[1]) < 14;
  return { clean: done && hits === 0, end: done, seconds: +t.toFixed(1), hits, firstHit, bends: best };
}

/** The fastest clean run of the bot list for one car. */
export function mapDrive(json, carId = 1, opts = {}) {
  const cars = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars, car = cars.find((c) => c.id === carId) ?? cars[0];
  let r = null;
  for (const bot of BOTS) { r = { car: car.name, bot, ...driveOnce(json, car, bot, opts) }; if (r.clean) break; }
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const json = JSON.parse(readFileSync(process.argv[2], 'utf8')), r = mapDrive(json, +(process.argv[3] ?? 1));
  console.log(JSON.stringify({ map: json.name, ...r }));
  process.exit(r.clean ? 0 : 1);
}
