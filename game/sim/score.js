// The drift score, a pure state machine. A car is drifting while its body slip is over 15 degrees at over 8 m/s
// and nothing is touched. Points per second = 0.35 * speed * degrees^0.8, times a chain multiplier that grows by one
// for every 2 s of drifting (to x5) and is kept for 1.5 s after the slide ends, so linking two slides is one chain.
// Pending points are banked when the chain ends cleanly and lost on a hit or a spin.

export const SCORE = {
  minSlip: 0.26, // rad
  minSpeed: 8, // m/s
  rate: 0.35,
  exponent: 0.8,
  secondsPerStep: 2,
  maxMult: 5,
  grace: 1.5, // s
  spin: 1.9, // rad: past this the car has turned round, the chain is lost
};

export function newScore() {
  return { pending: 0, banked: 0, mult: 1, chainTime: 0, grace: 0, drifting: false, best: 0, event: null, lost: 0 };
}

/**
 * Advance by dt. `slip` = body slip (rad, signed), `speed` m/s, `hit` = speed of a wall hit this step (0 = none),
 * `turned` = |angle between nose and velocity| even when going backwards. Returns a new state; `event` is
 * { type: 'bank' | 'lost', points } for one step when a chain ends.
 */
export function scoreStep(sc, { slip, speed, hit, turned }, dt) {
  let { pending, banked, mult, chainTime, grace, best, lost } = sc;
  let event = null;
  const deg = Math.abs(slip) * (180 / Math.PI);
  const drifting = Math.abs(slip) > SCORE.minSlip && speed > SCORE.minSpeed && !hit && turned < SCORE.spin;
  const live = pending > 0 || chainTime > 0;
  if (hit > 2 || turned >= SCORE.spin) {
    if (live && pending > 0) { event = { type: 'lost', points: Math.round(pending) }; lost += pending; }
    pending = 0; mult = 1; chainTime = 0; grace = 0;
  } else if (drifting) {
    chainTime += dt;
    grace = SCORE.grace;
    mult = Math.min(SCORE.maxMult, 1 + Math.floor(chainTime / SCORE.secondsPerStep));
    pending += SCORE.rate * speed * Math.pow(deg, SCORE.exponent) * mult * dt;
  } else if (chainTime > 0) {
    grace -= dt;
    if (grace <= 0) {
      if (pending > 0) { event = { type: 'bank', points: Math.round(pending) }; banked += pending; best = Math.max(best, pending); }
      pending = 0; mult = 1; chainTime = 0; grace = 0;
    }
  }
  return { pending, banked, mult, chainTime, grace, drifting, best, event, lost };
}
