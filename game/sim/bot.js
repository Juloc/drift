// A tiny driver for tests and demo pictures (not a game feature): it drives straight to build speed, kicks the
// handbrake once and then holds a drift in a circle, lifting the throttle when the slide gets too wide.
import { bodySlip, speedOf } from './physics.js';

/** `dir` 1 = circle to the right, -1 = to the left. Returns controls for time t (s) and state s. */
export function orbitBot(t, s, { start = 2.5, handbrake = 0.4, slipTarget = 0.5, speed = 22, dir = 1 } = {}) {
  const sp = speedOf(s);
  if (t < start) return { steer: 0, throttle: sp < speed ? 1 : 0.5, brake: 0, handbrake: 0 };
  const wide = Math.abs(bodySlip(s)) > slipTarget;
  return { steer: dir, throttle: t < start + 0.7 ? 1 : wide ? 0.25 : 1, brake: 0, handbrake: t < start + handbrake ? 1 : 0 };
}
