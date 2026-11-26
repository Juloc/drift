// The sound of the game in the browser (WebAudio). Your own engine plays loops at fixed revs in two layers, on and off load (cut from a recording where the
// car has one: game/assets/sound/, tools/sound/work.js; else made by sim/enginesynth.js), crossfaded by the revs, the pitch following them, a dip at each upshift and a
// flutter at the limiter; the other cars' engines are cheaper (two oscillators, a low-pass filter); the revs come from a virtual gearbox (sim/engine.js); tyre squeal
// (filtered noise from the slide), an optional turbo whistle, and the nearest four other cars with a volume by distance and a pan by side. Nothing starts before a click or a key
// (browsers forbid it, and a page that makes noise by itself is rude); mute is kept on the device; music (game/view/music.js) has its own switch and volume, off by default.
import { MusicPlayer } from './music.js';
import { ENGINES, revs, firing, engineGain, squeal, turboWhistle, nearest } from '../sim/engine.js';
import { loopRpms, renderLoop, loopWeights, layerLevels, limiterDepth } from '../sim/enginesynth.js';
import { tyreLayers, surfaceMix, looseLevel } from '../sim/tyresound.js';

export const MAX_OTHERS = 4;

/** Loose stuff under the tyres (gravel, grass, snow): sparse clicks of random strength, each a few milliseconds of decaying noise; two seconds, looped (one per context). */
const crunchCache = new WeakMap();
function crunchBuffer(ctx) {
  if (crunchCache.has(ctx)) return crunchCache.get(ctx);
  const sr = ctx.sampleRate, n = Math.round(sr * 2), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let at = 0; at < n; at += Math.max(1, Math.round(sr / (90 + 260 * rnd())))) {   // 90 to 350 clicks a second
    const amp = 0.25 + 0.75 * rnd() ** 2, len = Math.round(sr * (0.002 + 0.004 * rnd()));
    for (let i = 0; i < len && at + i < n; i++) d[at + i] += amp * (rnd() * 2 - 1) * Math.exp(-(i / len) * 4);
  }
  crunchCache.set(ctx, buf);
  return buf;
}

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
    // tyres (sim/tyresound.js): one looped noise into four layers: roll (low-pass), hiss (band-pass high), squeal (two narrow band-passes,
    // the pitch wobbling at 5.5 Hz), scrub (a wide band-pass low); `tyreGain` is the level of all four (the distance)
    this.tyre = ctx.createBufferSource(); this.tyre.buffer = noise; this.tyre.loop = true;
    this.tyreGain = ctx.createGain(); this.tyreGain.gain.value = 0;
    // nothing under 80 Hz (a phone's speaker only distorts it), nothing over about 3.2 kHz (white noise up there is only hiss)
    this.tyreLow = ctx.createBiquadFilter(); this.tyreLow.type = 'highpass'; this.tyreLow.frequency.value = 80; this.tyreLow.Q.value = 0.7;
    const top = () => { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000; f.Q.value = 0.7; return f; };
    this.tyreTop = top(); this.tyreTop2 = top();   // two stages: 24 dB per octave over 3 kHz
    this.tyreGain.connect(this.tyreLow); this.tyreLow.connect(this.tyreTop); this.tyreTop.connect(this.tyreTop2); this.tyreTop2.connect(this.pan ?? out);
    const layer = (type, f, q) => { const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; this.tyre.connect(fl); fl.connect(g); g.connect(this.tyreGain); return { fl, g }; };
    this.roll = layer('lowpass', 300, 0.7); this.hiss = layer('bandpass', 2300, 1.3); this.squealA = layer('bandpass', 1000, 18); this.squealB = layer('bandpass', 1500, 22); this.scrub = layer('bandpass', 450, 1.2);
    this.wobble = ctx.createOscillator(); this.wobble.frequency.value = 5.5; this.wobbleDepth = ctx.createGain(); this.wobbleDepth.gain.value = 0;
    this.wobble.connect(this.wobbleDepth); this.wobbleDepth.connect(this.squealA.fl.frequency); this.wobble.start();
    this.tyreFilter = this.squealA.fl;   // (the name the first tests used)
    this.tyre.start();
    // loose stuff (gravel, grass, snow): clicks through a band-pass, only on those grounds
    this.crunchSrc = ctx.createBufferSource(); this.crunchSrc.buffer = crunchBuffer(ctx); this.crunchSrc.loop = true;
    const lf = ctx.createBiquadFilter(); lf.type = 'bandpass'; lf.frequency.value = 1500; lf.Q.value = 0.8; this.crunchG = ctx.createGain(); this.crunchG.gain.value = 0;
    this.crunchSrc.connect(lf); lf.connect(this.crunchG); this.crunchG.connect(this.tyreGain); this.crunchSrc.start();
    this.sq = null; this.sqPrev = 0;   // the recorded squeal (useSqueal), for your own car
    // the turbo's whistle
    this.whistle = ctx.createOscillator(); this.whistle.type = 'sine'; this.whistle.frequency.value = 2600;
    this.whistleGain = ctx.createGain(); this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain); this.whistleGain.connect(this.gain); this.whistle.start();
    this.car = -1; this.active = false;
  }
  /**
   * A recorded squeal loop (assets/sound/squeal.ogg, tools/sound/work.js): it plays over the made one, faster for a higher pitch; at the start of a squeal a short chirp
   * (the pitch glides down from a third higher, the level overshoots), then it holds, and at the end it sags in pitch while it fades.
   */
  useSqueal(buf, baseHz) {
    if (this.sq || !buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.tyreGain); src.start();
    this.sq = { src, g, baseHz };
  }
  setEngine(car) { this.eng = ENGINES[car] ?? ENGINES[0]; this.car = car; this.gear = 1; this.filter.frequency.value = this.eng.tone; this.bGain.gain.value = this.eng.sub; }
  /** Sets the voice for a car: speed (m/s), throttle 0..1, the slide 0..1, the car's top speed; `level` scales everything (the distance), `pan` is -1..1. */
  set({ speed, throttle, slide, top, surface }, level, pan, now) {
    const t = this.ctx.currentTime, eng = this.eng;
    const r = revs(speed, top, eng, this.gear); this.gear = r.gear;
    const f = Math.min(900, Math.max(20, firing(r.rpm, eng)));
    this.a.frequency.setTargetAtTime(f, t, 0.04); this.b.frequency.setTargetAtTime(f / 2, t, 0.04);
    this.filter.frequency.setTargetAtTime(eng.tone + 2200 * throttle + 1200 * ((r.rpm - eng.idle) / (eng.max - eng.idle)), t, 0.06);
    this.gain.gain.setTargetAtTime(engineGain(throttle, r.rpm, eng) * level * 0.3, t, 0.05);
    const ty = tyreLayers(slide, speed, throttle), mix = surfaceMix(surface);
    this.tyreGain.gain.setTargetAtTime(level * 0.35, t, 0.05);
    this.roll.g.gain.setTargetAtTime(ty.roll * mix.roll, t, 0.08); this.roll.fl.frequency.setTargetAtTime(ty.rollF * (mix.roll > 1.5 ? 0.8 : 1), t, 0.08);
    this.hiss.g.gain.setTargetAtTime(ty.hiss * mix.hiss, t, 0.18);   // in and out softly
    const synthK = this.sq ? 0.3 : 1;   // with the recorded squeal the made one only adds body
    this.squealA.g.gain.setTargetAtTime(ty.squeal * 2.2 * mix.squeal * synthK, t, 0.04); this.squealA.fl.frequency.setTargetAtTime(ty.squealF, t, 0.06);   // (a narrow band lets little through: louder)
    this.squealB.g.gain.setTargetAtTime(ty.squeal * 1.1 * mix.squeal * synthK, t, 0.04); this.squealB.fl.frequency.setTargetAtTime(ty.squealF * 1.52, t, 0.06);
    this.wobbleDepth.gain.setTargetAtTime(ty.squealF * 0.025, t, 0.1);
    this.scrub.g.gain.setTargetAtTime(ty.scrub * mix.scrub, t, 0.05); this.scrub.fl.frequency.setTargetAtTime(ty.scrubF, t, 0.08);
    this.crunchG.gain.setTargetAtTime(looseLevel(surface, speed) * 1.4, t, 0.1);
    if (this.sq) {
      const sqv = ty.squeal * mix.squeal, rate = Math.max(0.5, Math.min(2, ty.squealF / this.sq.baseHz)) * (0.86 + 0.14 * Math.min(1, sqv * 3)), p = this.sq;
      p.g.gain.cancelScheduledValues?.(t); p.src.playbackRate.cancelScheduledValues?.(t);
      if (this.sqPrev < 0.08 && sqv >= 0.08) {   // the chirp: the pitch glides down from a third above, the level overshoots and settles
        p.src.playbackRate.setValueAtTime(rate * 1.33, t); p.src.playbackRate.exponentialRampToValueAtTime?.(rate, t + 0.16);
        p.g.gain.setValueAtTime(sqv * 2.6, t); p.g.gain.setTargetAtTime(sqv * 1.5, t + 0.04, 0.09);
      } else { p.src.playbackRate.setTargetAtTime(rate, t, 0.05); p.g.gain.setTargetAtTime(sqv * 1.5, t, sqv < this.sqPrev ? 0.12 : 0.04); }   // held; a slower fade-out
      this.sqPrev = sqv;
    }
    this.whistleGain.gain.setTargetAtTime(turboWhistle(throttle, this.prevThrottle, r.rpm, eng) * level * 0.03, t, 0.03);
    this.prevThrottle = throttle;
    if (this.pan) this.pan.pan.setTargetAtTime(pan, t, 0.1);
    this.active = true;
  }
  silence() { const t = this.ctx.currentTime; this.gain.gain.setTargetAtTime(0, t, 0.05); this.tyreGain.gain.setTargetAtTime(0, t, 0.05); for (const l of [this.roll, this.hiss, this.squealA, this.squealB, this.scrub]) l.g.gain.setTargetAtTime(0, t, 0.05); this.crunchG.gain.setTargetAtTime(0, t, 0.05); if (this.sq) { this.sq.g.gain.cancelScheduledValues?.(t); this.sq.g.gain.setTargetAtTime(0, t, 0.05); this.sqPrev = 0; } this.whistleGain.gain.setTargetAtTime(0, t, 0.05); this.active = false; }
}

/**
 * Your own engine: a bank of loops (two layers x five revs points), each with its gain; only the loops that are heard play (at most four:
 * two revs neighbours in two layers), a loop that has been silent for 0.15 s is stopped (`keepAll` keeps all ten playing, for a comparison);
 * per frame the weights follow the revs and the throttle, the playback rate follows the revs. `dip` takes the upshift's 70 ms cut and the
 * limiter's flutter (a 13 Hz square wave added to its gain). The tyres and the turbo stay as in Voice.
 */
class LoopVoice extends Voice {
  constructor(ctx, out, noise, loopsFor, keepAll = false, { cheap = false } = {}) {
    super(ctx, out, noise);
    this.loopsFor = loopsFor; this.keepAll = keepAll; this.cheap = cheap; this.playing = 0; this.maxPlaying = 0;   // cheap: the other cars, the on-load layer only (at most two loops)
    try { this.a.disconnect?.(); this.bGain.disconnect?.(); this.a.stop?.(); this.b.stop?.(); } catch { /* the fake context in tests */ }
    this.dip = ctx.createGain(); this.dip.gain.value = 1;
    // a low cut after the pitch follows the revs (the loops' own cut moves down when they play slower): nothing under 80 Hz reaches a phone's speaker
    this.lowCut = ctx.createBiquadFilter(); this.lowCut.type = 'highpass'; this.lowCut.frequency.value = 80; this.lowCut.Q.value = 0.7;
    this.dip.connect(this.lowCut); this.lowCut.connect(this.filter);
    this.flutter = ctx.createOscillator(); this.flutter.type = 'square'; this.flutter.frequency.value = 13;
    this.flutterDepth = ctx.createGain(); this.flutterDepth.gain.value = 0;
    this.flutter.connect(this.flutterDepth); this.flutterDepth.connect(this.dip.gain); this.flutter.start();
    this.bank = [];
  }
  setEngine(car) {
    super.setEngine(car);
    for (const b of this.bank) this.stopLoop(b);
    const loops = this.loopsFor(car);   // { rpms, on: [{data, rpm}], off: [...] }
    this.rpms = loops.rpms;
    this.bank = [];
    for (const layer of this.cheap ? ['on'] : ['on', 'off']) loops[layer].forEach((l, i) => {
      const buf = this.ctx.createBuffer(1, l.data.length, this.ctx.sampleRate); buf.getChannelData(0).set(l.data);
      const gain = this.ctx.createGain(); gain.gain.value = 0; gain.connect(this.dip);
      const b = { layer, i, rpm: l.rpm, buf, gain, src: null, quietSince: 0 };
      this.bank.push(b);
      if (this.keepAll) this.startLoop(b);
    });
    this.filter.frequency.value = 9000; this.filter.Q.value = 0.5;   // the loops are already shaped: the filter only takes the hiss off
  }
  startLoop(b) {
    const src = this.ctx.createBufferSource(); src.buffer = b.buf; src.loop = true; src.connect(b.gain); src.start();
    b.src = src; this.playing++; this.maxPlaying = Math.max(this.maxPlaying, this.playing);
  }
  stopLoop(b) {
    if (!b.src) return;
    try { b.src.stop?.(); b.src.disconnect?.(); } catch { /* gone */ }
    b.src = null; this.playing--;
  }
  silence() { super.silence(); if (!this.keepAll) for (const b of this.bank) this.stopLoop(b); }
  set(o, level, pan) {
    const gearBefore = this.gear;
    super.set(o, level, pan);   // tyres, turbo, pan, the gear and the overall gain
    const t = this.ctx.currentTime, eng = this.eng, r = revs(o.speed, o.top, eng, gearBefore);
    this.rpm = r.rpm;
    const w = loopWeights(r.rpm, this.rpms), lv = this.cheap ? { on: 0.6 + 0.4 * Math.max(0, Math.min(1, o.throttle)) } : layerLevels(o.throttle, r.rpm, eng);
    for (const b of this.bank) {
      const want = w[b.i] * lv[b.layer];
      b.gain.gain.setTargetAtTime(want, t, 0.03);
      if (want > 0.002) { if (!b.src) this.startLoop(b); b.quietSince = t; }
      else if (b.src && !this.keepAll && (b.gain.gain.value < 0.01 || t - b.quietSince > 0.15)) this.stopLoop(b);   // faded out (its gain under 1 %, so no click), or 0.15 s gone: stop it
      if (b.src) { if (b.src.playbackRate?.setTargetAtTime) b.src.playbackRate.setTargetAtTime(r.rpm / b.rpm, t, 0.03); }
    }
    if (r.gear > gearBefore && o.throttle > 0.3) { this.dip.gain.setTargetAtTime?.(0.25, t, 0.008); this.dip.gain.setTargetAtTime?.(1, t + 0.05, 0.03); }   // the clutch: a short cut at the upshift, soft edges (no click)
    this.flutterDepth.gain.setTargetAtTime(limiterDepth(r.rpm, eng, o.throttle) * 0.5, t, 0.01);   // the gain swings 1 +- 0.43: clearly cut, never silent
    this.gain.gain.setTargetAtTime((0.55 + 0.25 * o.throttle) * level * 0.3, t, 0.05);   // the loops carry the character; the level only moves a little with the throttle
  }
}

export class SoundSystem {
  /** @param {{AudioCtx?: any, storage?: Storage|null}} o (both injected in tests) */
  constructor({ AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext, storage = globalThis.localStorage ?? null, keepAllLoops = false, recorded = {}, music = null, pops = null, squeal = null } = {}) {
    this.AudioCtx = AudioCtx; this.storage = storage; this.keepAllLoops = keepAllLoops; this.ctx = null; this.own = null; this.others = new Map(); this.pool = [];
    this.recorded = recorded;   // car index -> the manifest of its recorded loops (assets/sound/<name>-engine.json); until they are loaded (or where they cannot be) the made loops play
    this.recordedReady = Promise.resolve();
    this.squealUrl = squeal;   // the manifest of the recorded squeal loop (assets/sound/squeal.json); the made squeal stays when it is not there
    this.popsUrl = pops;   // the manifest of recorded exhaust pops (assets/sound/pops.json, tools/sound/work.js job pops); the made crack stays the fallback
    this.popBuffers = null;
    const get = (k, d) => { try { return storage?.getItem(k) ?? d; } catch { return d; } };
    this.muted = get('drift.mute', '1') === '1';   // off until the player switches it on (the generated sound was far too loud)
    this.volume = Math.max(0, Math.min(1, +get('drift.volume', '0.3')));
    this.music = get('drift.music', '0') === '1';   // music: off until the player switches it on
    this.musicVolume = Math.max(0, Math.min(1, +get('drift.musicVolume', '0.5')));
    this.musicSpec = music;   // { tracks, first, onTrack } (game/data/music.json); null: no music
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
      this.own = new LoopVoice(this.ctx, this.master, noise, loopsFor, this.keepAllLoops);
      for (let i = 0; i < MAX_OTHERS; i++) this.pool.push(new LoopVoice(this.ctx, this.master, noise, loopsFor, false, { cheap: true }));   // the other drivers: the same engine, one layer
      this.recordedReady = this.loadRecorded();
      // the music: its own way to the speakers (not through the engine's limiter, which would pump with it), silenced with everything else by the sound switch
      if (this.musicSpec && typeof Audio !== 'undefined' && this.ctx.createMediaElementSource) {
        this.musicOut = this.ctx.createGain(); this.musicOut.gain.value = this.muted ? 0 : 1; this.musicOut.connect(this.ctx.destination);
        this.player = new MusicPlayer({ ctx: this.ctx, out: this.musicOut, ...this.musicSpec });
        this.player.setVolume(this.musicVolume * 0.6);
        if (this.music) this.player.setOn(true);
      }
      return true;
    } catch { this.ctx = null; return false; }   // no audio here: the game goes on without it
  }
  /**
   * The recorded loops (tools/sound/work.js, job engine): one Ogg Opus file per car with every loop three times in a row, the manifest says where the middle copy
   * of each starts. Decoded once, sliced into the loops, then every voice of that car takes them. Any failure (no Opus decoder, no file) keeps the made loops.
   */
  async loadRecorded() {
    const jobs = Object.entries(this.recorded ?? {}).map(async ([car, url]) => {
      try {
        if (!this.ctx?.decodeAudioData || typeof fetch !== 'function') return;
        const m = await (await fetch(url)).json(), bytes = await (await fetch(url.replace(/\.json$/, '.ogg'))).arrayBuffer();
        const buf = await this.ctx.decodeAudioData(bytes), d = buf.getChannelData(0), sr = buf.sampleRate;
        const slice = (l) => { const a = Math.round(l.start * sr), n = Math.round(l.seconds * sr); return { data: d.slice(a, a + n), rpm: l.rpm }; };
        const rpms = m.rpms, on = rpms.map((r) => slice(m.loops.find((l) => l.layer === 'on' && l.rpm === r))), off = rpms.map((r) => slice(m.loops.find((l) => l.layer === 'off' && l.rpm === r)));
        this.loopCache.set(+car, { rpms, on, off, recorded: true });
        for (const v of [this.own, ...this.pool]) if (v && v.car === +car) v.setEngine(+car);   // the voices of this car take the recorded loops now
      } catch { /* the made loops stay */ }
    });
    await Promise.all(jobs);
    await this.loadPops(); await this.loadSqueal();
  }
  /** The recorded squeal loop for your own car (three copies in the file, the middle one is the loop). */
  async loadSqueal() {
    if (!this.squealUrl || !this.ctx?.decodeAudioData || typeof fetch !== 'function') return;
    try {
      const m = await (await fetch(this.squealUrl)).json(), bytes = await (await fetch(this.squealUrl.replace(/\.json$/, '.ogg'))).arrayBuffer();
      const buf = await this.ctx.decodeAudioData(bytes), sr = buf.sampleRate, a = Math.round(m.start * sr), n = Math.round(m.seconds * sr), loop = this.ctx.createBuffer(1, n, sr);
      loop.getChannelData(0).set(buf.getChannelData(0).subarray(a, a + n));
      this.own?.useSqueal(loop, m.baseHz); this.recordedSqueal = true;
    } catch { /* the made squeal stays */ }
  }
  /** The recorded exhaust pops: one Ogg file, the manifest says where each pop starts and how long it is. */
  async loadPops() {
    if (!this.popsUrl || !this.ctx?.decodeAudioData || typeof fetch !== 'function') return;
    try {
      const m = await (await fetch(this.popsUrl)).json(), bytes = await (await fetch(this.popsUrl.replace(/\.json$/, '.ogg'))).arrayBuffer();
      const buf = await this.ctx.decodeAudioData(bytes), d = buf.getChannelData(0), sr = buf.sampleRate;
      this.popBuffers = m.pops.map((p) => { const a = Math.round(p.start * sr), n = Math.round(p.seconds * sr), b = this.ctx.createBuffer(1, n, sr); b.getChannelData(0).set(d.subarray(a, a + n)); return { buf: b, gain: p.gain ?? 1 }; });
    } catch { /* the made crack stays */ }
  }
  /** Whether a car plays recorded loops (false while they load, or where they could not be). */
  recordedFor(car) { return !!this.loopCache?.get(car)?.recorded; }
  setMuted(m) {
    this.muted = !!m;
    try { this.storage?.setItem('drift.mute', this.muted ? '1' : '0'); } catch { /* not kept */ }
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.5, this.ctx.currentTime, 0.35);   // fades in and out, no click
    this.musicOut?.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.35);
  }
  /** The volume 0..1 (kept on the device); the master gain is at most half of it, behind the limiter. */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, +v || 0));
    try { this.storage?.setItem('drift.volume', String(this.volume)); } catch { /* not kept */ }
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.5, this.ctx.currentTime, 0.1);
  }
  setMusic(on) { this.music = !!on; try { this.storage?.setItem('drift.music', this.music ? '1' : '0'); } catch { /* not kept */ } this.player?.setOn(this.music); }
  /** The music's own volume 0..1 (kept on the device). */
  setMusicVolume(v) { this.musicVolume = Math.max(0, Math.min(1, +v || 0)); try { this.storage?.setItem('drift.musicVolume', String(this.musicVolume)); } catch { /* not kept */ } this.player?.setVolume(this.musicVolume * 0.6); }
  /** A hit: a short burst of low noise, louder with the hit (at most one every 120 ms). */
  bump(approach, now = performance.now()) {
    if (!this.ctx || this.muted || approach < 2 || now - (this.lastBump ?? -1e9) < 120) return;
    this.lastBump = now;
    const t = this.ctx.currentTime, level = Math.min(1, approach / 25);
    // a dull body (low-passed noise) and a low thump under it: a sine falling from 150 to 65 Hz in a sixth of a second (a phone's speaker has nothing under about 100 Hz), stronger with the hit; a hard hit also rattles (a band of
    // noise around 1.8 kHz, short)
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + 900 * level;
    const g = this.ctx.createGain(); g.gain.value = 0.42 * level;
    g.gain.setTargetAtTime?.(0, t + 0.02, 0.07 + 0.08 * level);   // dies away in a fraction of a second
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); src.stop?.(t + 0.6);
    if (this.ctx.createOscillator) {
      const o = this.ctx.createOscillator(), og = this.ctx.createGain(); o.type = 'sine';
      o.frequency.value = 150; o.frequency.exponentialRampToValueAtTime?.(65, t + 0.16);
      og.gain.value = 0.55 * level; og.gain.setTargetAtTime?.(0, t + 0.03, 0.06 + 0.05 * level);
      o.connect(og); og.connect(this.master); o.start(t); o.stop?.(t + 0.5);
    }
    if (approach > 9) {
      const r = this.ctx.createBufferSource(); r.buffer = this.noise;
      const rf = this.ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 1.1;
      const rg = this.ctx.createGain(); rg.gain.value = 0.2 * level; rg.gain.setTargetAtTime?.(0, t + 0.005, 0.03);
      r.connect(rf); rf.connect(rg); rg.connect(this.master); r.start(); r.stop?.(t + 0.3);
    }
  }
  /** An exhaust pop (lifting off the throttle at speed, a gear change): one to three short, dry cracks, a little exaggerated, not loud (behind the limiter like everything else). */
  pop(strength = 1, now = performance.now()) {
    if (!this.ctx || this.muted || now - (this.lastPop ?? -1e9) < 150) return;
    this.lastPop = now;
    const t0 = this.ctx.currentTime, n = strength > 0.7 ? 3 : strength > 0.4 ? 2 : 1;
    if (this.popBuffers?.length) {   // recorded: one to three real pops, none twice in a row, each a little different in pitch and level
      for (let i = 0; i < n; i++) {
        let k; do { k = Math.floor(Math.random() * this.popBuffers.length); } while (this.popBuffers.length > 1 && k === this.lastPopK);
        this.lastPopK = k;
        const p = this.popBuffers[k], src = this.ctx.createBufferSource(), g = this.ctx.createGain(), t = t0 + i * (0.06 + 0.05 * Math.random());
        src.buffer = p.buf; if (src.playbackRate) src.playbackRate.value = 0.92 + 0.16 * Math.random();
        g.gain.value = p.gain * Math.min(1, 0.45 + 0.7 * strength) * (1 - i * 0.18);
        src.connect(g); g.connect(this.master); src.start(t);
      }
      return;
    }
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
  /** Loop sources playing now (yours and the others'): at most 4 + 4 x 2 = 12; plus one noise source per voice for the tyres. */
  get loopsPlaying() { return (this.own?.playing ?? 0) + this.pool.reduce((n, v) => n + (v.playing ?? 0), 0); }

  /**
   * Every frame. own = { speed, throttle, slide, car, top }, others = [{ id, x, z, speed, throttle, slide, car, top }], listener = { x, z, heading }.
   * Without a context (before the first click) or while muted, nothing is computed.
   */
  update(own, others, listener) {
    if (!this.ctx || this.muted) { if (this.ctx) { this.own.silence(); for (const v of this.pool) v.silence(); } return; }
    if (this.own.car !== own.car) this.own.setEngine(own.car);
    this.own.set(own, 1, 0);   // (own.surface: the ground kind under the car)
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
