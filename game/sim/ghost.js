// The ghost: a run recorded as a car's place every tenth of a second, played back as a see-through car on the same track, with the time you are ahead or behind at
// your own place. Pure data and arithmetic (no drawing, no storage), so it can be tested. The best run is kept on the device by the page.
export const STEP = 0.1;

/** Records x, z and heading every STEP seconds of run time. `data(ms)` is the compact form kept on the device: whole tenths of a metre and hundredths of a radian. */
export class GhostRecorder {
  constructor() { this.t = 0; this.next = 0; this.v = []; }
  /** one simulation step of `dt` seconds; the car is where it is at the end of it */
  add(dt, x, z, h) { this.t += dt; while (this.next <= this.t + 1e-9) { this.v.push(Math.round(x * 10), Math.round(z * 10), Math.round(h * 100)); this.next += STEP; } }
  data(ms) { return { ms, v: this.v.slice() }; }
}

/** Plays a recorded run: where the car was at a time, and the time at which it was nearest to a place (searching only forwards, as the run goes on). */
export class GhostPlayer {
  constructor(data) { this.ms = data.ms; this.v = data.v; this.n = Math.floor(data.v.length / 3); this.i = 0; }
  get length() { return this.n * STEP; }
  rewind() { this.i = 0; }
  /** the place at `t` seconds (the last one after the end); heading goes the short way round */
  at(t) {
    if (this.n === 0) return null;
    const f = Math.max(0, Math.min(this.n - 1, t / STEP)), i = Math.min(this.n - 2, Math.floor(f)), k = this.n < 2 ? 0 : f - i, a = i * 3, b = Math.min(this.n - 1, i + 1) * 3, v = this.v;
    let dh = (v[b + 2] - v[a + 2]) / 100; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { x: (v[a] + (v[b] - v[a]) * k) / 10, z: (v[a + 1] + (v[b + 1] - v[a + 1]) * k) / 10, h: v[a + 2] / 100 + dh * k };
  }
  /** the ghost's time at the recorded place nearest to (x, z): moves on from the last answer, at most 3 s ahead, so a hairpin's other branch is never taken */
  timeNear(x, z) {
    const d2 = (j) => (this.v[j * 3] / 10 - x) ** 2 + (this.v[j * 3 + 1] / 10 - z) ** 2;
    let best = this.i, bd = d2(best);
    for (let j = this.i; j < Math.min(this.n, this.i + 30); j++) { const d = d2(j); if (d < bd) { bd = d; best = j; } }
    this.i = best;
    return best * STEP;
  }
  /** seconds ahead (negative) or behind (positive) the ghost, at run time `t` and the car's place */
  delta(t, x, z) { return t - this.timeNear(x, z); }
}
