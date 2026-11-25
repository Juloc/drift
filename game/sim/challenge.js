// Challenges with stars: the data format (game/data/challenges.json) and the judging, as pure functions (no DOM, no clock; the page feeds the simulation's numbers in).
// A challenge has a type that says what is measured, a time limit and three star thresholds (ascending: 1, 2 and 3 stars). Higher is better for every type.
//   drift-points  the points of the best drift chain (what is still running at the end counts)
//   drift-hold    the longest unbroken slide, seconds (slip over 20 degrees at over 8 m/s)
//   drift-fast    seconds of drifting above 18 m/s
//   chain-mult    the highest chain multiplier reached (the drift score's x1 to x5)
//   tandem        the tandem bonus points (the caller passes the running total, e.g. from sim/practice.js)
//   clean-sheet   the points banked (plus the running chain) before the first wall hit, which ends the run
// Progress per account (the best stars of each challenge) is the next step: a table and an endpoint, with the same ids.
import { newScore, scoreStep } from './score.js';

export const TYPES = ['drift-points', 'drift-hold', 'drift-fast', 'chain-mult', 'tandem', 'clean-sheet'];
export const HOLD_SLIP = 0.35, HOLD_SPEED = 8, FAST_SPEED = 18;

/** Is a definition well formed? Returns a list of problems (empty = fine). */
export function check(def, maps = null) {
  const bad = [];
  if (!/^[a-z0-9-]+$/.test(def.id ?? '')) bad.push('id');
  if (!TYPES.includes(def.type)) bad.push('type');
  if (!(def.time > 0 && def.time <= 600)) bad.push('time');
  if (!Array.isArray(def.stars) || def.stars.length !== 3 || !def.stars.every((v, i) => v > 0 && (i === 0 || v > def.stars[i - 1]))) bad.push('stars');
  for (const k of ['title', 'text']) if (!def[k]?.en || !def[k]?.de) bad.push(k);
  if (maps && !maps.includes(def.map)) bad.push('map');
  return bad;
}

export function newRun(def) {
  return { def, t: 0, score: newScore(), current: 0, longest: 0, fast: 0, maxMult: 1, tandem: 0, done: false, failed: false };
}

/**
 * One step of dt. `obs` = { slip, speed, hit, turned, tandem } (body slip rad, speed m/s, the speed of a wall hit in this step or 0, the angle between nose and travel, the running tandem total).
 * Returns a new run; once `done` it no longer changes.
 */
export function runStep(run, obs, dt) {
  if (run.done) return run;
  const t = run.t + dt;
  let score = scoreStep(run.score, { slip: obs.slip, speed: obs.speed, hit: obs.hit, turned: obs.turned }, dt);
  const holding = Math.abs(obs.slip) > HOLD_SLIP && obs.speed > HOLD_SPEED && obs.hit <= 0;
  const current = holding ? run.current + dt : 0;
  const fast = run.fast + (Math.abs(obs.slip) > 0.26 && obs.speed > FAST_SPEED && obs.hit <= 0 ? dt : 0);
  const failed = run.def.type === 'clean-sheet' && obs.hit > 2;
  return {
    def: run.def, t, score, current, longest: Math.max(run.longest, current), fast, maxMult: Math.max(run.maxMult, score.mult),
    tandem: Math.max(run.tandem, obs.tandem ?? 0), failed, done: failed || t >= run.def.time,
  };
}

/** What the challenge measures, so far. */
export function valueOf(run) {
  const s = run.score;
  switch (run.def.type) {
    case 'drift-points': return Math.max(s.best, s.pending);
    case 'drift-hold': return run.longest;
    case 'drift-fast': return run.fast;
    case 'chain-mult': return run.maxMult;
    case 'tandem': return run.tandem;
    case 'clean-sheet': return s.banked + s.pending;
    default: return 0;
  }
}

/** 0 to 3 stars for a value. */
export const starsFor = (def, value) => def.stars.filter((t) => value >= t).length;

/** The result of a run: { value, stars, done, failed, left } (left = seconds remaining). */
export function resultOf(run) {
  const value = valueOf(run);
  return { value, stars: starsFor(run.def, value), done: run.done, failed: run.failed, left: Math.max(0, run.def.time - run.t) };
}
