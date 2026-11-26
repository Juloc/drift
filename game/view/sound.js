// The sound of the game, made in the browser (WebAudio, no files). Your own engine plays loops at fixed revs in two layers, on and off load
// (sim/enginesynth.js makes them until recordings are allowed), crossfaded by the revs, the pitch following them, a dip at each upshift and a
// flutter at the limiter; the other cars' engines are cheaper (two oscillators, a low-pass filter); the revs come from a virtual gearbox (sim/engine.js); tyre squeal
// (filtered noise from the slide), an optional turbo whistle, and the nearest four other cars with a volume by distance and a pan by side. Nothing starts before a click or a key
// (browsers forbid it, and a page that makes noise by itself is rude); mute is kept on the device; music is only a switch for now (a placeholder, no sound behind it).
import { ENGINES, revs, firing, engineGain, squeal, turboWhistle, nearest } from '../sim/engine.js';
import { loopRpms, renderLoop, loopWeights, layerLevels, limiterDepth } from '../sim/enginesynth.js';

export const MAX_OTHERS = 4;

class Voice {
  constructor(ctx, out, noise) {
    this.ctx = ctx; this.gear = 1; this.prevThrottle = 0; this.eng = ENGINES[0];
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.pan ? (this.gain.connect(this.pan), this.pan.connect(out)) : this.gain.connect(out);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1400; this.filter.Q.value = 3;
    this.filter.connect(this.gain);
    this.a = ctx.createOscillator(); this.a.type = 'sawtooth';
    this.b = ctx.createOscillator(); this.b.type = 'square';
    this.bGain = ctx.createGain();
    this.a.connect(this.filter); this.b.connect(this.bGain); this.bGain.connect(this.filter);
    this.a.start(); this.b.start();
    // tyres: looped noise through a band-pass
    this.tyre = ctx.createBufferSource(); this.tyre.buffer = noise; this.tyre.loop = true;
    this.tyreFilter = ctx.createBiquadFilter(); this.tyreFilter.type = 'bandpass'; this.tyreFilter.frequency.value = 1200; this.tyreFilter.Q.value = 2.5;
    this.tyreGain = ctx.createGain(); this.tyreGain.gain.value = 0;
    this.tyre.connect(this.tyreFilter); this.tyreFilter.connect(this.tyreGain); this.tyreGain.connect(this.pan ?? out); if (this.pan) { /* the tyres share the pan */ }
    this.tyre.start();
    // the turbo's whistle
    this.whistle = ctx.createOscillator(); this.whistle.type = 'sine'; this.whistle.frequency.value = 2600;
    this.whistleGain = ctx.createGain(); this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain); this.whistleGain.connect(this.gain); this.whistle.start();
    this.car = -1; this.active = false;
  }
  setEngine(car) { this.eng = ENGINES[car] ?? ENGINES[0]; this.car = car; this.gear = 1; this.filter.frequency.value = this.eng.tone; this.bGain.gain.value = this.eng.sub; }
  /** Sets the voice for a car: speed (m/s), throttle 0..1, the slide 0..1, the car's top speed; `level` scales everything (the distance), `pan` is -1..1. */
  set({ speed, throttle, slide, top }, level, pan, now) {
    const t = this.ctx.currentTime, eng = this.eng;
    const r = revs(speed, top, eng, this.gear); this.gear = r.gear;
    const f = Math.min(900, Math.max(20, firing(r.rpm, eng)));
    this.a.frequency.setTargetAtTime(f, t, 0.04); this.b.frequency.setTargetAtTime(f / 2, t, 0.04);
    this.filter.frequency.setTargetAtTime(eng.tone + 2200 * throttle + 1200 * ((r.rpm - eng.idle) / (eng.max - eng.idle)), t, 0.06);
    this.gain.gain.setTargetAtTime(engineGain(throttle, r.rpm, eng) * level * 0.3, t, 0.05);
    const q = squeal(slide, speed);
    this.tyreGain.gain.setTargetAtTime(q.gain * level * 0.3, t, 0.05); this.tyreFilter.frequency.setTargetAtTime(q.freq, t, 0.05);
    this.whistleGain.gain.setTargetAtTime(turboWhistle(throttle, this.prevThrottle, r.rpm, eng) * level * 0.03, t, 0.03);
    this.prevThrottle = throttle;
    if (this.pan) this.pan.pan.setTargetAtTime(pan, t, 0.1);
    this.active = true;
  }
  silence() { const t = this.ctx.currentTime; this.gain.gain.setTargetAtTime(0, t, 0.05); this.tyreGain.gain.setTargetAtTime(0, t, 0.05); this.whistleGain.gain.setTargetAtTime(0, t, 0.05); this.active = false; }
}

/**
 * Your own engine: a bank of loops (two layers x five revs points, all playing all the time, cheap: buffer playback), each with its gain;
 * per frame the weights follow the revs and the throttle, the playback rate follows the revs. `dip` takes the upshift's 70 ms cut and the
 * limiter's flutter (a 13 Hz square wave added to its gain). The tyres and the turbo stay as in Voice.
 */
class LoopVoice extends Voice {
  constructor(ctx, out, noise, loopsFor) {
    super(ctx, out, noise);
    this.loopsFor = loopsFor;
    try { this.a.disconnect?.(); this.bGain.disconnect?.(); } catch { /* the fake context in tests */ }
    this.dip = ctx.createGain(); this.dip.gain.value = 1; this.dip.connect(this.filter);
    this.flutter = ctx.createOscillator(); this.flutter.type = 'square'; this.flutter.frequency.value = 13;
    this.flutterDepth = ctx.createGain(); this.flutterDepth.gain.value = 0;
    this.flutter.connect(this.flutterDepth); this.flutterDepth.connect(this.dip.gain); this.flutter.start();
    this.bank = [];
  }
  setEngine(car) {
    super.setEngine(car);
    for (const b of this.bank) { try { b.src.stop?.(); b.gain.disconnect?.(); } catch { /* gone */ } }
    const loops = this.loopsFor(car);   // { rpms, on: [{data, rpm}], off: [...] }
    this.rpms = loops.rpms;
    this.bank = [];
    for (const layer of ['on', 'off']) loops[layer].forEach((l, i) => {
      const buf = this.ctx.createBuffer(1, l.data.length, this.ctx.sampleRate); buf.getChannelData(0).set(l.data);
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      src.connect(gain); gain.connect(this.dip); src.start();
      this.bank.push({ layer, i, rpm: l.rpm, src, gain });
    });
    this.filter.frequency.value = 9000; this.filter.Q.value = 0.5;   // the loops are already shaped: the filter only takes the hiss off
  }
  set(o, level, pan) {
    const gearBefore = this.gear;
    super.set(o, level, pan);   // tyres, turbo, pan, the gear and the overall gain
    const t = this.ctx.currentTime, eng = this.eng, r = revs(o.speed, o.top, eng, gearBefore);
    this.rpm = r.rpm;
    const w = loopWeights(r.rpm, this.rpms), lv = layerLevels(o.throttle, r.rpm, eng);
    for (const b of this.bank) {
      b.gain.gain.setTargetAtTime(w[b.i] * lv[b.layer], t, 0.03);
      b.src.playbackRate?.setTargetAtTime(r.rpm / b.rpm, t, 0.03);
    }
    if (r.gear > gearBefore && o.throttle > 0.3) { this.dip.gain.setTargetAtTime?.(0.25, t, 0.008); this.dip.gain.setTargetAtTime?.(1, t + 0.05, 0.03); }   // the clutch: a short cut at the upshift, soft edges (no click)
    this.flutterDepth.gain.setTargetAtTime(limiterDepth(r.rpm, eng, o.throttle) * 0.5, t, 0.01);   // the gain swings 1 +- 0.43: clearly cut, never silent
    this.gain.gain.setTargetAtTime((0.55 + 0.25 * o.throttle) * level * 0.3, t, 0.05);   // the loops carry the character; the level only moves a little with the throttle
  }
}

export class SoundSystem {
  /** @param {{AudioCtx?: any, storage?: Storage|null}} o (both injected in tests) */
  constructor({ AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext, storage = globalThis.localStorage ?? null } = {}) {
    this.AudioCtx = AudioCtx; this.storage = storage; this.ctx = null; this.own = null; this.others = new Map(); this.pool = [];
    const get = (k, d) => { try { return storage?.getItem(k) ?? d; } catch { return d; } };
    this.muted = get('drift.mute', '1') === '1';   // off until the player switches it on (the generated sound was far too loud)
    this.volume = Math.max(0, Math.min(1, +get('drift.volume', '0.3')));
    this.music = get('drift.music', '0') === '1';   // a placeholder: the switch is kept, there is no music behind it yet
  }
  get unlocked() { return this.ctx !== null; }
  /** Called from a click, a key or a touch: the first call makes the audio context (before that nothing exists, so nothing can sound). */
  unlock() {
    if (this.ctx || !this.AudioCtx) return this.ctx !== null;
    try {
      this.ctx = new this.AudioCtx();
      if (!this.ctx.startRendering) this.ctx.resume?.()?.catch?.(() => {});   // (an offline context, as in tools/sound/ramp.js, cannot be resumed before it renders)
      this.master = this.ctx.createGain(); this.master.gain.value = 0;
      // a hard limit at the output (no peaks, whatever the voices add up to), then a soft fade in
      this.limiter = this.ctx.createDynamicsCompressor?.();
      if (this.limiter) { Object.assign(this.limiter.threshold, { value: -22 }); Object.assign(this.limiter.knee, { value: 0 }); Object.assign(this.limiter.ratio, { value: 20 }); Object.assign(this.limiter.attack, { value: 0.003 }); Object.assign(this.limiter.release, { value: 0.15 }); this.master.connect(this.limiter); this.limiter.connect(this.ctx.destination); }
      else this.master.connect(this.ctx.destination);
      this.master.gain.setTargetAtTime?.(this.muted ? 0 : this.volume * 0.5, this.ctx.currentTime, 0.4);
      const n = this.ctx.sampleRate * 2, noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = noise.getChannelData(0);
      let seed = 1; for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }   // white noise, the same every time
      this.noise = noise;
      this.loopCache = new Map();
      const loopsFor = (car) => {   // made once per car and kept (about 20 ms for ten loops)
        if (!this.loopCache.has(car)) {
          const eng = ENGINES[car] ?? ENGINES[0], rpms = loopRpms(eng), sr = this.ctx.sampleRate;
          this.loopCache.set(car, { rpms, on: rpms.map((r) => renderLoop(eng, r, 'on', sr)), off: rpms.map((r) => renderLoop(eng, r, 'off', sr)) });
        }
        return this.loopCache.get(car);
      };
      this.own = new LoopVoice(this.ctx, this.master, noise, loopsFor);
      for (let i = 0; i < MAX_OTHERS; i++) this.pool.push(new Voice(this.ctx, this.master, noise));
      return true;
    } catch { this.ctx = null; return false; }   // no audio here: the game goes on without it
  }
  setMuted(m) {
    this.muted = !!m;
    try { this.storage?.setItem('drift.mute', this.muted ? '1' : '0'); } catch { /* not kept */ }
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.5, this.ctx.currentTime, 0.35);   // fades in and out, no click
  }
  /** The volume 0..1 (kept on the device); the master gain is at most half of it, behind the limiter. */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, +v || 0));
    try { this.storage?.setItem('drift.volume', String(this.volume)); } catch { /* not kept */ }
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.5, this.ctx.currentTime, 0.1);
  }
  setMusic(on) { this.music = !!on; try { this.storage?.setItem('drift.music', this.music ? '1' : '0'); } catch { /* not kept */ } }
  /** A hit: a short burst of low noise, louder with the hit (at most one every 120 ms). */
  bump(approach, now = performance.now()) {
    if (!this.ctx || this.muted || approach < 2 || now - (this.lastBump ?? -1e9) < 120) return;
    this.lastBump = now;
    const t = this.ctx.currentTime, level = Math.min(1, approach / 25);
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + 900 * level;
    const g = this.ctx.createGain(); g.gain.value = 0.5 * level;
    g.gain.setTargetAtTime?.(0, t + 0.02, 0.07 + 0.08 * level);   // dies away in a fraction of a second
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); src.stop?.(t + 0.6);
  }
  /** An exhaust pop (lifting off the throttle at speed, a gear change): one to three short, dry cracks, a little exaggerated, not loud (behind the limiter like everything else). */
  pop(strength = 1, now = performance.now()) {
    if (!this.ctx || this.muted || now - (this.lastPop ?? -1e9) < 150) return;
    this.lastPop = now;
    const t0 = this.ctx.currentTime, n = strength > 0.7 ? 3 : strength > 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.05 + 0.04 * ((i * 7) % 3));
      const src = this.ctx.createBufferSource(); src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520 + 260 * ((i * 5) % 3); f.Q.value = 1.4;
      const g = this.ctx.createGain(); g.gain.value = 0.22 * Math.min(1, 0.4 + strength) * (1 - i * 0.2);
      g.gain.setTargetAtTime?.(0, t + 0.012, 0.018);   // a crack: gone in about 60 ms
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop?.(t + 0.15);
    }
  }
  get activeOthers() { return this.pool.filter((v) => v.active).length; }

  /**
   * Every frame. own = { speed, throttle, slide, car, top }, others = [{ id, x, z, speed, throttle, slide, car, top }], listener = { x, z, heading }.
   * Without a context (before the first click) or while muted, nothing is computed.
   */
  update(own, others, listener) {
    if (!this.ctx || this.muted) { if (this.ctx) { this.own.silence(); for (const v of this.pool) v.silence(); } return; }
    if (this.own.car !== own.car) this.own.setEngine(own.car);
    this.own.set(own, 1, 0);
    const near = nearest(listener, others, MAX_OTHERS);
    const keep = new Set(near.map((n) => n.car.id));
    for (const [id, v] of this.others) if (!keep.has(id)) { v.silence(); v.car = -1; this.others.delete(id); }
    for (const n of near) {
      let v = this.others.get(n.car.id);
      if (!v) { v = this.pool.find((p) => !p.active && p.car === -1) ?? this.pool.find((p) => !this.others.has(p.carId)); if (!v) continue; v.carId = n.car.id; this.others.set(n.car.id, v); v.setEngine(n.car.car ?? 0); }
      v.set({ speed: n.car.speed, throttle: n.car.throttle ?? 0.5, slide: n.car.slide ?? 0, top: n.car.top ?? 33 }, n.gain, n.pan);
    }
  }
}
