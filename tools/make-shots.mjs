// Finds fixed poses for pictures (game/data/shots.json): a run-up on the touge that ends with the car in the middle of a hairpin at about 45 degrees of drift and 80 km/h with no wall
// touched. For each hairpin of the upper half and a few approach speeds and bot settings the sim is run; the best run (closest to the wanted angle and speed) is written as a start
// state, the bot's settings and the time to run before the picture (2026-11-26: on the model the game drives on the road's surface, with the track bot). The page (`?shot=name`) replays exactly that run (the simulation itself is unchanged), so smoke and tyre marks are real.
// Run: node tools/make-shots.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareMap } from '../game/sim/map.js';
import { step, makeCar, bodySlip, speedOf, DT } from '../game/sim/physics.js';
import { trackBot, hairpinsOf } from '../game/sim/trackbot.js';
import { surfaceAt, frameAt } from '../game/sim/track.js';
import { collideBody } from '../game/sim/collision.js';

const json = JSON.parse(readFileSync(new URL('../game/data/maps/06-touge.json', import.meta.url), 'utf8')), map = prepareMap(json), T = map.surface;
const car = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars[0];
const surf = (x, z, o) => surfaceAt(T, x, z, o), pins = hairpinsOf(T);
// The pictures show the car the game drives with the hills switched on: the model on the road's surface (physics.js stepSurface), driven by the track bot
// (sim/trackbot.js). On this road a hairpin is taken sideways at about 45 km/h (the old pictures showed 80: that was the flat model on a road with no limits).
const WANT = { deg: 38, kmh: 46 };
const out = {};
for (const [name, ks] of [['kehre', [1, 3]], ['tal', [2, 4]]]) {
  let best = null;
  for (const k of ks) for (const back of [50, 70, 90]) for (const v0 of [18, 22]) for (const angle of [0.6, 0.7]) {
    const f = frameAt(T, pins[k].from - back, 0), o = { angle };
    let s = { ...makeCar(f.x, f.z, f.head), vx: Math.sin(f.head) * v0, vz: Math.cos(f.head) * v0 };
    const start = { x: +f.x.toFixed(2), z: +f.z.toFixed(2), h: +f.head.toFixed(4), v: v0 }, bot = trackBot(T, { car, ...o });
    let hit = null, touched = false; const q = {};
    for (let i = 0; i < 12 / DT && !touched; i++) {
      s = collideBody(map, step(s, bot(i * DT, s), car, 1, DT, surf)); if (s.hit > 0) touched = true;
      surfaceAt(T, s.x, s.z, q);
      const deg = Math.abs(bodySlip(s)) * 57.3, kmh = speedOf(s) * 3.6;
      if (deg > 33 && deg < 50 && kmh > 38 && kmh < 70 && q.s > pins[k].from + 8 && q.s < pins[k].apex + 5 && Math.abs(q.lat) < 3.2 && (!hit || Math.abs(deg - WANT.deg) < Math.abs(hit.deg - WANT.deg))) hit = { t: +(i * DT).toFixed(2), deg, kmh };
      if (q.s > pins[k].to) break;
    }
    if (!hit || touched) continue;
    const cost = Math.abs(hit.deg - WANT.deg) / 5 + Math.abs(hit.kmh - WANT.kmh) / 10;
    if (!best || cost < best.cost) best = { cost, k, start, driver: 'track', bot: o, t: hit.t, deg: Math.round(hit.deg), kmh: Math.round(hit.kmh) };
  }
  if (!best) throw new Error(`no run found for ${name}`);
  out[name] = best; console.log(name, JSON.stringify({ k: best.k, t: best.t, deg: best.deg, kmh: best.kmh, bot: best.bot }));
}
// the view when somebody arrives on the plaza: the car stands at the lobby spawn, its nose a little towards the valley side (sky, lake, volcano and the torii in the picture, not the slope)
out.platz = { start: { x: json.lobbySpawn.x, z: json.lobbySpawn.z, h: json.lobbySpawn.h, v: 0 }, driver: 'track', bot: out.tal.bot, t: 0 };
writeFileSync(new URL('../game/data/shots.json', import.meta.url), JSON.stringify(out) + '\n');
