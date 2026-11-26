// Finds fixed poses for pictures (game/data/shots.json): a run-up on the touge that ends with the car in the middle of a hairpin at about 45 degrees of drift and 80 km/h with no wall
// touched. For each hairpin of the upper half and a few approach speeds and bot settings the sim is run; the best run (closest to the wanted angle and speed) is written as a start
// state, the bot's settings and the time to run before the picture. The page (`?shot=name`) replays exactly that run (the simulation itself is unchanged), so smoke and tyre marks are real.
// Run: node tools/make-shots.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareMap } from '../game/sim/map.js';
import { step, makeCar, bodySlip, speedOf, DT } from '../game/sim/physics.js';
import { lineBot } from '../game/sim/linebot.js';
import { collideBody } from '../game/sim/collision.js';
import { sampleOpen } from '../game/view/look/field.js';

const json = JSON.parse(readFileSync(new URL('../game/data/maps/06-touge.json', import.meta.url), 'utf8')), map = prepareMap(json);
const car = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars[0];
const road = sampleOpen(json.centre, 2), c = json.centre;
const cum = [0]; for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]));
const nearest = (x, z) => c.reduce((b, p, i) => (Math.hypot(p[0] - x, p[1] - z) < b[0] ? [Math.hypot(p[0] - x, p[1] - z), i] : b), [1e9, 0])[1];
const WANT = { deg: 45, kmh: 80 };
const out = {};
for (const [name, ks] of [['kehre', [1, 3]], ['tal', [2, 4]]]) {
  let best = null;
  for (const k of ks) for (const back of [60, 80, 100]) for (const v0 of [22, 26, 30]) for (const corner of [12, 15, 18, 22]) for (const kick of [0.25, 0.4]) {
    const apex = nearest(json.clips[k].x, json.clips[k].z), i0 = Math.max(1, apex - Math.round(back / 3.5));
    const p = c[i0], q = c[i0 + 1], h = Math.atan2(q[0] - p[0], q[1] - p[1]);
    let s = { ...makeCar(p[0], p[1], h), vx: Math.sin(h) * v0, vz: Math.cos(h) * v0 };
    const start = { x: p[0], z: p[1], h: +h.toFixed(4), v: v0 }, o = { closed: false, speed: 32, corner, kick, look: 14, hold: 0.55 }, bot = lineBot(road, o);
    let hits = 0, hit = null;
    for (let i = 0; i < 12 / DT && !hit; i++) {
      s = collideBody(map, step(s, bot(i * DT, s), car, 1)); if (s.hit > 0) { hits++; break; }
      const deg = Math.abs(bodySlip(s)) * 57.3, kmh = speedOf(s) * 3.6, near = Math.hypot(s.x - c[apex][0], s.z - c[apex][1]);
      if (deg > 38 && deg < 55 && kmh > 60 && kmh < 95 && near < 30 && i * DT > 3) hit = { t: +(i * DT).toFixed(2), deg, kmh };
    }
    if (!hit || hits) continue;
    const cost = Math.abs(hit.deg - WANT.deg) / 5 + Math.abs(hit.kmh - WANT.kmh) / 10;
    if (!best || cost < best.cost) best = { cost, k, start, bot: o, t: hit.t, deg: Math.round(hit.deg), kmh: Math.round(hit.kmh) };
  }
  if (!best) throw new Error(`no run found for ${name}`);
  out[name] = best; console.log(name, JSON.stringify({ k: best.k, t: best.t, deg: best.deg, kmh: best.kmh, bot: best.bot }));
}
// the view when somebody arrives on the plaza: the car stands at the lobby spawn, its nose a little towards the valley side (sky, lake, volcano and the torii in the picture, not the slope)
out.platz = { start: { x: json.lobbySpawn.x, z: json.lobbySpawn.z, h: json.lobbySpawn.h, v: 0 }, bot: out.tal.bot, t: 0 };
writeFileSync(new URL('../game/data/shots.json', import.meta.url), JSON.stringify(out) + '\n');
