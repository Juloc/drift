// The engine sound as short loops at fixed revs, the way racing games play recordings: for each car a few revs points from idle
// to the limit, each in two layers (on load: the throttle open; off load: the throttle shut, the car pushing the engine).
// game/view/sound.js plays them like recordings (crossfaded by the revs, the pitch following them, the layers mixed by the
// throttle). Until recordings are allowed the loops are made here, from a model of a four-stroke engine:
//   one pressure pulse per firing (a sharp rise and a decay, each cylinder a little different, the order of the firings kept),
//   a ring of the exhaust valve opening, the pipe's resonances (band-passes), the silencer (a low-pass), a soft overdrive on load,
//   and the intake (noise pulsed with the firings). Off load the pulses are weak and dull, some come late, and the pipe crackles.
// A loop holds whole engine cycles and is made from four repeats of itself, of which the last is kept: the filters are in their
// steady state there, so the loop's end runs into its start without a click. Pure functions: no WebAudio, testable in Node.

/** Revs points of the loops for an engine: idle, three between, the limit. */
export const loopRpms = (eng) => { const n = 5; return Array.from({ length: n }, (_, i) => Math.round(eng.idle + ((eng.max - eng.idle) * i) / (n - 1))); };

/** A small seeded random generator (the same loop every time). */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** An RBJ biquad (cookbook): 'lowpass' or 'bandpass' (constant 0 dB peak); returns a function that filters one sample. */
export function biquad(type, f, q, sr) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

/**
 * One loop. eng = an entry of sim/engine.js's ENGINES; layer 'on' | 'off'; returns { data: Float32Array, rpm, seconds }.
 * The loop is about `want` seconds long (whole engine cycles).
 */
export function renderLoop(eng, rpm, layer, sr, want = 0.45) {
  const on = layer === 'on', cycle = 120 / rpm;   // a four-stroke cycle: two revolutions
  const cycles = Math.max(2, Math.round(want / cycle)), len = Math.round(cycles * cycle * sr);
  const fires = cycles * eng.cyl, gap = len / fires;
  const r = rng(eng.idle * 7 + eng.cyl * 13 + (on ? 1 : 2));
  // each cylinder its own strength and a tiny delay (no engine is perfectly even); off load some firings are weak or late
  const cylAmp = Array.from({ length: eng.cyl }, () => 1 + (r() - 0.5) * (0.1 + 0.2 * eng.grit));
  const fireAmp = Array.from({ length: fires }, (_, k) => cylAmp[k % eng.cyl] * (on ? 1 : 0.3 + 0.7 * r() ** 2));
  const fireLate = Array.from({ length: fires }, () => (on ? (r() - 0.5) * 0.02 : (r() - 0.5) * 0.12) * gap);
  const crackle = Array.from({ length: fires }, () => (!on && r() < 0.18 ? 0.5 + r() : 0));
  const noise = Float32Array.from({ length: len }, () => r() * 2 - 1);
  const tau = (on ? 0.00055 : 0.0011) * (1 + 0.6 * (1 - (rpm - eng.idle) / (eng.max - eng.idle)));   // sharper pulses at high revs
  const ringF = 1500 + 900 * eng.grit, ringT = 0.0018;
  // the pulse train of one loop
  const dry = new Float32Array(len);
  for (let k = 0; k < fires; k++) {
    const t0 = k * gap + fireLate[k];
    for (let j = 0; j < Math.min(len, Math.round(sr * 0.012)); j++) {
      const t = j / sr, i = (Math.round(t0) + j) % len;
      const pulse = (t / tau) * Math.exp(1 - t / tau);
      const ring = 0.35 * Math.sin(2 * Math.PI * ringF * t) * Math.exp(-t / ringT);
      dry[i] += fireAmp[k] * (pulse + ring) + crackle[k] * (j < sr * 0.0004 ? noise[i] : 0) * Math.exp(-t / 0.0003) * 2;
    }
  }
  // the exhaust: three pipe modes, the silencer; the intake: noise in time with the firings (on load)
  const f1 = 95 + rpm / 60, sr2 = sr;
  const modes = [[biquad('bandpass', f1, 2.2, sr2), 1.0], [biquad('bandpass', f1 * 3.1, 3, sr2), 0.55], [biquad('bandpass', 1050 + 300 * eng.grit, 2.5, sr2), 0.35]];
  const silencer = biquad('lowpass', on ? 1900 + 800 * eng.grit : 1000, 0.7, sr2);
  const intake = biquad('bandpass', 2200, 1.4, sr2), env = biquad('lowpass', 40, 0.7, sr2);
  const out = new Float32Array(len);
  for (let rep = 0; rep < 4; rep++) {
    for (let i = 0; i < len; i++) {
      const x = dry[i];
      let y = 0.25 * x;
      for (const [f, g] of modes) y += g * f(x);
      y = silencer(y);
      const pulseEnv = Math.max(0, env(Math.abs(x)));
      if (on) y += 0.4 * intake(noise[i]) * Math.min(1, pulseEnv * 4);
      if (rep === 3) out[i] = on ? Math.tanh(y * (1.2 + eng.grit)) : y;
    }
  }
  // the same loudness for every loop (the player sets the levels): peak at 0.9 after taking the mean out
  let m = 0; for (const v of out) m += v; m /= len;
  let peak = 1e-9; for (let i = 0; i < len; i++) { out[i] -= m; peak = Math.max(peak, Math.abs(out[i])); }
  for (let i = 0; i < len; i++) out[i] *= 0.9 / peak;
  return { data: out, rpm, seconds: len / sr };
}

/** Equal-power weights of the loops for revs: the two neighbours share, the rest are 0. */
export function loopWeights(rpm, rpms) {
  const w = rpms.map(() => 0);
  if (rpm <= rpms[0]) { w[0] = 1; return w; }
  if (rpm >= rpms.at(-1)) { w[w.length - 1] = 1; return w; }
  const i = rpms.findIndex((p, k) => rpm >= p && rpm <= rpms[k + 1]), x = (rpm - rpms[i]) / (rpms[i + 1] - rpms[i]);
  w[i] = Math.cos((x * Math.PI) / 2); w[i + 1] = Math.sin((x * Math.PI) / 2);
  return w;
}

/** The two layers' levels for the throttle: on load rises with it, off load is the rest (a little quieter). */
export const layerLevels = (throttle, rpm = Infinity, eng = null) => {
  const t = Math.max(0, Math.min(1, throttle));
  // at idle the engine still works against itself: some of the on-load layer, so it does not go quiet
  const idleOn = eng ? 0.45 * Math.max(0, 1 - (rpm - eng.idle) / (eng.idle * 0.6)) : 0;
  return { on: Math.max(Math.sin((t * Math.PI) / 2), idleOn), off: 0.7 * Math.cos((t * Math.PI) / 2) };
};

/** At the limit with the foot down the ignition cuts in and out: 0 = no flutter, 1 = full (the depth of a 13 Hz cut). */
export const limiterDepth = (rpm, eng, throttle) => (throttle > 0.7 && rpm > eng.max * 0.985 ? 0.85 : 0);
