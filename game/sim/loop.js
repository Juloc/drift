// The fixed-step loop: real frame times go in, whole steps of DT come out, so a 30 Hz phone and a 144 Hz desk
// run exactly the same simulation. The leftover fraction (alpha) is for drawing between the last two states.
import { DT } from './physics.js';

export class FixedLoop {
  constructor(dt = DT, maxFrame = 0.25) {   // (0.25 s: a hitch of a tenth of a second is caught up, so the car does not fall behind and seem pulled back; it used to be 0.1)
    this.dt = dt;
    this.maxFrame = maxFrame; // a stall longer than this is dropped, not caught up (no spiral of death)
    this.acc = 0;
    this.steps = 0;
  }
  /** Add `frameSeconds`; calls `step()` once per whole step; returns alpha in 0..1. */
  advance(frameSeconds, step) {
    this.acc += Math.min(frameSeconds, this.maxFrame);
    while (this.acc >= this.dt) {
      step(this.steps++);
      this.acc -= this.dt;
    }
    return this.acc / this.dt;
  }
}
