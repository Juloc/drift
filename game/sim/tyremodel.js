// Tyres you can hear, computed: a sliding tyre's tread sticks and lets go many hundred times a second, and the rubber rings at a few pitches that rise with
// the sliding speed and fall with the load: the squeal. Under it the rush of the rubber scrubbing over the road, and at low sliding speeds a judder.
// A rolling tyre hums with the speed. Four wheels, each with its own voice (no two howl at the same pitch). Pure numbers (no WebAudio).
//
// Per wheel the page sets: `squeal` 0..1 (how hard it howls: sim2's squealOf), `slide` m/s (the contact patch's speed over the road), `load` 0..1.., and for all: `speed` m/s.

/** A resonator that rings at a pitch when noise hits it (a state-variable band-pass). */
class Ring { constructor() { this.lo = 0; this.bp = 0; } run(x, f, q, rate) { const g = 2 * Math.sin(Math.PI * Math.min(f, rate * 0.24) / rate); this.lo += g * this.bp; const hi = x - this.lo - this.bp / q; this.bp += g * hi; return this.bp; } }

export const TYRE_DEFAULTS = { pitch: 640, pitchBySlide: 300, second: 1.83, tone: 0.75, rush: 0.5, judder: 0.5, roll: 0.35, level: 1.4, seed: 4711 };

export class TyreModel {
  constructor(rate, options = {}) { this.rate = rate; this.o = { ...TYRE_DEFAULTS, ...options }; this.seed = this.o.seed >>> 0; this.speed = 0; this.speedNow = 0; this.t = 0;
    this.w = Array.from({ length: 4 }, (_, i) => ({ squeal: 0, slide: 0, load: 1, sq: 0, sl: 0, a: new Ring(), b: new Ring(), wander: 0, drift: 0, detune: [1, 1.07, 0.94, 1.12][i], phase: i * 1.7, hissLo: 0, hissHi: 0 }));
    this.rollLo = 0; this.rollLo2 = 0; }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 2147483648 - 1; }
  /** One wheel's state (0 front left, 1 front right, 2 rear left, 3 rear right). */
  setWheel(i, squeal, slide, load = 1) { const w = this.w[i]; w.squeal = Math.min(1, Math.max(0, squeal)); w.slide = Math.max(0, slide); w.load = Math.max(0.2, load); }
  setSpeed(v) { this.speed = Math.max(0, v); }
  process(out, n = out.length) { const o = this.o, rate = this.rate;
    for (let s = 0; s < n; s++) { this.t += 1 / rate; this.speedNow += (this.speed - this.speedNow) * 0.0006; let y = 0;
      for (const w of this.w) { w.sq += (w.squeal - w.sq) * 0.0012; w.sl += (w.slide - w.sl) * 0.0012; if (w.sq < 0.002) continue;
        const x = this.rnd();
        // the pitch: up with the sliding speed, down with the load, never quite still
        w.drift += (this.rnd() * 0.02 - w.drift * 0.0004); w.wander += (w.drift - w.wander) * 0.002;
        const f = (o.pitch + o.pitchBySlide * Math.tanh(w.sl / 7)) * w.detune / Math.sqrt(w.load) * (1 + 0.5 * w.wander);
        // stick and slip: at low sliding speeds the howl breaks up into a judder
        const jr = 9 + 5 * w.detune, jud = 1 - o.judder * Math.max(0, 1 - w.sl / 5) * (0.5 + 0.5 * Math.sin(2 * Math.PI * jr * this.t + w.phase + 6 * w.wander));
        const q = 9 + 30 * w.sq, tone = (w.a.run(x, f, q, rate) + 0.55 * w.b.run(x, f * o.second, q * 0.8, rate)) * (0.35 / Math.sqrt(q));
        // the rush: noise between about 1.5 and 6 kHz
        w.hissLo += 0.55 * (x - w.hissLo); w.hissHi += 0.18 * (w.hissLo - w.hissHi); const rush = (w.hissLo - w.hissHi);
        y += (Math.tanh(tone * 5 * o.tone * w.sq) * 0.6 * w.sq ** 0.5 + rush * o.rush * 0.5 * w.sq * Math.min(1, 0.3 + w.sl / 12)) * jud * Math.sqrt(w.load); }
      // rolling: a low hum with the speed
      const r = this.rnd(); this.rollLo += 0.02 * (r - this.rollLo); this.rollLo2 += 0.006 * (this.rollLo - this.rollLo2); y += (this.rollLo - this.rollLo2) * o.roll * 2.2 * Math.min(1, this.speedNow / 45);
      out[s] = Math.tanh(y * o.level); } }
}
