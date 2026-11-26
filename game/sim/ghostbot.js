// The ghost the practice bot drives for the training mode when you have no run of your own yet: the bot goes down the whole road once (here, at load, in the pure simulation:
// about a hundred seconds of driving take a tenth of a second to compute) and its places are recorded as any ghost (sim/ghost.js), so the page plays it back the same way.
// With the hills on it drives the surface model with the track bot (sim/trackbot.js), else the flat model with the line bot.
import { step, makeCar, DT } from './physics.js';
import { collideBody } from './collision.js';
import { surfaceAt } from './track.js';
import { surfaceAt as groundAt } from './map.js';
import { trackBot } from './trackbot.js';
import { lineBot } from './linebot.js';
import { GhostRecorder } from './ghost.js';

/** `{ ms, v, bot: true }` (the ghost's data) of a drift driver down `map`'s road, or null when the map has no road to go down. `lineOf` gives the flat model's road points. */
export function botGhost(map, car, { hills = true, lineOf = null, maxSeconds = 400 } = {}) {
  const T = map.surface; if (!T || map.closed !== false) return null;
  const surf = hills ? (x, z, o) => surfaceAt(T, x, z, o) : null, g = map.grid[0];
  const mu = groundAt(map, g.x, g.z).mu;
  const bot = hills ? trackBot(T, { car, mu }) : lineBot(lineOf ?? map.centre, { closed: false, speed: 30, corner: 11, kick: 0.25, look: 14, hold: 0.55 });
  const rec = new GhostRecorder(), q = {};
  let s = makeCar(g.x, g.z, g.h), t = 0;
  for (; t < maxSeconds; t += DT) {
    s = collideBody(map, step(s, bot(t, s), car, groundAt(map, s.x, s.z).mu, DT, surf));
    rec.add(DT, s.x, s.z, s.h);
    surfaceAt(T, s.x, s.z, q);
    if (q.s > T.len - 12) break;
  }
  return t >= maxSeconds ? null : { ...rec.data(Math.round(t * 1000)), bot: true };
}
