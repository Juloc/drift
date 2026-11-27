// An engine you can hear, computed instead of recorded: every cylinder fires, its hot gas leaves through the exhaust valve into a pipe, and the pipes
// ring as real ones do (waves run along them and bounce at their ends: digital waveguides). The sound follows the revs and the throttle with no loops and
// no seams: the pulse of each firing, the header where the cylinders' pulses meet, the long pipe, a silencer, the tail pipe; the intake's growl under load;
// a little of the engine's own rattle. Lifting off at high revs leaves unburnt mixture that goes off in the pipe: pops, heard through the same pipe.
// At the limiter firings are cut. Pure numbers (no WebAudio), so Node can render it to a file and the browser runs it in an AudioWorklet.
//
// Units: pressures are plain numbers around 1; lengths in metres; `rate` in samples a second.

const SOUND = 343;   // m/s in cold air; the hot exhaust is faster, the pipes' `hot` factor takes that

/** A pipe: two delay lines, one for the wave running away from the engine, one for the wave coming back. */
class Pipe {
  constructor(metres, rate, hot = 1) { this.n = Math.max(2, Math.round((metres / (SOUND * hot)) * rate)); this.fwd = new Float32Array(this.n); this.back = new Float32Array(this.n); this.i = 0; }
  /** what arrives at the far end, and what arrives back at the near end, this sample */
  get farOut() { return this.fwd[this.i]; }
  get nearOut() { return this.back[this.i]; }
  /** what goes in at the near end (forward) and at the far end (backward); then one step on */
  push(nearIn, farIn) { this.fwd[this.i] = nearIn; this.back[this.i] = farIn; this.i = (this.i + 1) % this.n; }
}
/** One-pole low-pass: `k` 0..1, the share of the new sample. */
class Low { constructor(k) { this.k = k; this.y = 0; } run(x) { return (this.y += this.k * (x - this.y)); } }

export const ENGINE_DEFAULTS = {
  cylinders: 4,
  order: [0, 2, 3, 1],          // firing order 1-3-4-2: when in the cycle each cylinder fires (in quarters)
  idle: 900, limit: 7600,
  runner: [0.31, 0.47, 0.38, 0.55],   // header pipes, each a little different: the engine's own voice
  uneven: [1.0, 0.9, 1.08, 0.94],     // and no two cylinders burn quite alike
  pipe: 1.7, tail: 0.55, branch: 0.28, intake: 0.32,
  hot: 1.35,                   // how much faster the waves run in the hot exhaust
  silencer: 0.45,              // low-pass share at the silencer (smaller = more muffled)
  through: 0.3,                // what passes the silencer unmuffled
  bite: 0.45,
  endLow: 0.14, endBack: 0.62,  // the open end: low notes turn back (and make the pipe ring), high ones leave
  valveBack: 0.78, loss: 0.97,                  // how much the pressure waves steepen (the rasp)
  exhaust: 1.0, induction: 0.5, rattle: 0.12,   // the three voices' levels
  popChance: 0.05,             // of an unburnt charge going off in the pipe, per exhaust stroke, on the overrun above `popRpm`
  popRpm: 3200, popLevel: 0.4,
  level: 3.6,
  seed: 12345,
};

export class EngineModel {
  constructor(rate, options = {}) {
    const o = this.o = { ...ENGINE_DEFAULTS, ...options }; this.rate = rate; this.N = o.cylinders;
    this.runners = o.runner.slice(0, this.N).map((m) => new Pipe(m, rate, o.hot)); this.pipe = new Pipe(o.pipe, rate, o.hot); this.branch = new Pipe(o.branch, rate, o.hot); this.tail = new Pipe(o.tail, rate, o.hot); this.intake = new Pipe(o.intake, rate, 1);
    this.cyl = Array.from({ length: this.N }, () => ({ p: 0, last: 1, fired: false, popped: false, strength: 0 }));
    this.cycle = 0; this.rpm = o.idle; this.throttle = 0; this.rpmNow = o.idle; this.thrNow = 0; this.seed = o.seed >>> 0; this.pops = 0; this.cut = 0;
    this.lowSil = new Low(o.silencer); this.lowEnd = new Low(o.endLow); this.lowIn = new Low(0.25); this.lowRattle = new Low(0.05); this.lowNoise = new Low(0.12); this.lowPop = new Low(0.35);
    this.dcX = 0; this.dcY = 0; this.gulp = 0; this.popEnv = 0; this.popGain = 0;
  }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  /** Where the engine should go: revs and throttle 0..1 (it follows them smoothly). */
  set(rpm, throttle) { this.rpm = rpm; this.throttle = Math.min(1, Math.max(0, throttle)); }

  /** Fill `out` (Float32Array) with the next samples. Returns the number of pops that went off meanwhile (for the flames). */
  process(out, n = out.length) {
    const o = this.o, N = this.N, rate = this.rate, popsBefore = this.pops, M = N + 1, lift = (ph, a, b) => { if (ph < a || ph > b) return 0; const s = Math.sin(Math.PI * (ph - a) / (b - a)); return s * s; };
    for (let s = 0; s < n; s++) {
      this.rpmNow += (this.rpm - this.rpmNow) * 0.0008; this.thrNow += (this.throttle - this.thrNow) * 0.002;
      const rpm = Math.max(300, this.rpmNow), thr = this.thrNow, dCycle = rpm / 120 / rate; this.cycle += dCycle; if (this.cycle >= 1) this.cycle -= 1;
      const limiting = rpm > o.limit, overrun = thr < 0.06 && rpm > o.popRpm;
      // how full the cylinders get: a little at idle (enough to turn), all of it with the throttle open; the engine breathes best in the upper middle
      const breath = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, rpm / (o.limit * 1.05)) ** 0.8), charge = (0.12 + 0.88 * thr ** 1.3) * breath;
      const noise = this.lowNoise.run(this.rnd() * 2 - 1);
      let rattle = 0, intakeFlow = 0;
      // ---- the cylinders: fire, blow down through the exhaust valve, push the rest out, draw in new mixture
      for (let c = 0; c < N; c++) {
        const cy = this.cyl[c], ph = (this.cycle + 1 - o.order[c] / N) % 1;   // 0 = this cylinder's firing
        if (ph < cy.last) {                                                   // a new cycle: fire (or not)
          const miss = limiting && this.rnd() < 0.7; cy.fired = !miss; cy.strength = miss ? 0 : charge * o.uneven[c % o.uneven.length] * (0.88 + 0.24 * this.rnd()); cy.p = cy.strength; cy.popped = false; if (miss) this.cut++;
        }
        cy.last = ph;
        const ex = lift(ph, 0.2, 0.52), into = lift(ph, 0.48, 0.8);
        const piston = Math.sin(2 * Math.PI * ph * 2);                        // + going down (power, intake), - going up
        cy.p *= 1 - 3.2 * dCycle;                                             // the gas cools and expands
        const open = Math.min(1, Math.max(0, (ph - 0.2) / 0.025)), flow = cy.p * open * open * (1 - Math.exp(-dCycle / 0.011)); cy.p -= flow;   // blow-down: what is left leaves in a rush as the valve cracks open (a sharp pulse: that is the engine's bark)
        let src = flow * 9 + Math.max(0, -piston) * ex * 0.006 * (0.3 + charge);   // and the piston pushes the rest out
        // an unburnt charge in the pipe goes off: on the overrun, and after a cut firing at the limiter
        if (!cy.popped && ph > 0.24 && (overrun || (!cy.fired && limiting))) { cy.popped = true; if (this.rnd() < (cy.fired ? o.popChance * (0.4 + 1.2 * this.lowNoise.y * this.lowNoise.y * 30) : 0.22)) { this.popEnv = 1; this.popGain = (0.25 + 0.75 * this.rnd() ** 2) * o.popLevel; this.pops++; } }
        src += noise * flow * 14;                                             // the rush of the gas
        // the header pipe of this cylinder: its near end is the valve (closed: the wave bounces back; open: the cylinder feeds it)
        const r = this.runners[c]; r._near = src + r.nearOut * (o.valveBack - 0.5 * ex);
        intakeFlow += Math.max(0, piston) * into * (0.25 + thr) * (ph > 0.5 ? 1 : 0);
        rattle += cy.p * 0.12 + ex * 0.02;
      }
      // ---- the header: the cylinders' pipes meet the long pipe; a wave arriving there partly goes on, partly returns (all pipes alike: junction pressure = 2/M of the sum)
      let sum = this.pipe.nearOut; for (let c = 0; c < N; c++) sum += this.runners[c].farOut;
      const pj = (2 / M) * sum;
      // a pop: a hard, short burst right behind the header
      this.popEnv *= 1 - 1 / (0.0016 * rate); const pop = this.lowPop.run((this.rnd() * 2 - 1 + 0.6) * this.popEnv * this.popGain * 1.6);
      // ---- the silencer: the long pipe ends in a junction of three (the pipe, a closed side branch, the tail pipe), the tail's share muffled
      const j2 = (2 / 3) * (this.pipe.farOut + this.branch.nearOut + this.tail.nearOut);
      const tailIn = this.lowSil.run(j2 - this.tail.nearOut) * (1 - o.through) + (j2 - this.tail.nearOut) * o.through;
      // ---- the tail pipe's open end: most of the wave turns back upside down, the rest is what we hear
      const end = this.tail.farOut, back = -o.endBack * this.lowEnd.run(end), heard = end + back;
      for (let c = 0; c < N; c++) { const r = this.runners[c]; r.push(r._near, (pj - r.farOut) * o.loss); }
      this.pipe.push((pj - this.pipe.nearOut) * o.loss + pop, (j2 - this.pipe.farOut) * o.loss);
      this.branch.push(j2 - this.branch.nearOut, this.branch.farOut * 0.85);
      this.tail.push(tailIn, back);
      // ---- the intake: each cylinder draws a gulp; the pipe ends at the throttle (shut: a wall; open: the open air, and we hear it)
      const inEnd = this.intake.farOut, inBack = inEnd * (0.9 - 1.7 * thr) * 0.9; const gulp = (intakeFlow - this.gulp) / dCycle * 0.004; this.gulp = intakeFlow;   // the pipe hears the valves snap open and shut, not the slow breath itself
      this.intake.push(-gulp + this.intake.nearOut * 0.7 + noise * intakeFlow * 0.8, this.lowIn.run(inBack));
      const induction = (inEnd + inBack) * (0.15 + 0.85 * thr);
      // ---- together: exhaust, induction, the block's rattle; no standing pressure; a soft ceiling
      const h = heard * 2.2, x = (h + o.bite * (Math.abs(h) * h * 2.5)) * o.exhaust * 3 + induction * o.induction + this.lowRattle.run(rattle + noise * (0.1 + 1.2 * rpm / o.limit)) * o.rattle;
      const y = x - this.dcX + 0.9985 * this.dcY; this.dcX = x; this.dcY = y;
      out[s] = Math.tanh(y * o.level);
    }
    return this.pops - popsBefore;
  }
}
