import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundSystem, MAX_OTHERS } from './sound.js';

/** Just enough of WebAudio to count what the game creates and sets. */
function fakeAudio() {
  const made = { ctx: 0, osc: 0, gain: 0, src: 0 };
  const param = (v = 0) => ({ value: v, setTargetAtTime(x) { this.value = x; } });
  class Ctx {
    constructor() { made.ctx++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'suspended'; }
    resume() { this.state = 'running'; }
    createGain() { made.gain++; return { gain: param(1), connect() {} }; }
    createOscillator() { made.osc++; return { type: '', frequency: param(), connect() {}, start() {} }; }
    createBiquadFilter() { return { type: '', frequency: param(), Q: param(), connect() {} }; }
    createBufferSource() { made.src++; return { buffer: null, loop: false, playbackRate: param(1), connect() {}, start() {} }; }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createStereoPanner() { return { pan: param(), connect() {} }; }
  }
  return { Ctx, made };
}
const store = (muted = '0') => { const m = new Map([['drift.mute', muted]]); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const own = { speed: 18, throttle: 1, slide: 0.7, car: 0, top: 35 };
const cars = Array.from({ length: 10 }, (_, i) => ({ id: i, x: 5 + i * 6, z: 0, speed: 15, throttle: 0.6, slide: i % 2 ? 0.8 : 0, car: i % 5, top: 33 }));

test('nothing exists before the first click: no audio context, and update does nothing and does not fail', () => {
  const { Ctx, made } = fakeAudio();
  const s = new SoundSystem({ AudioCtx: Ctx, storage: store() });
  assert.equal(s.unlocked, false);
  s.update(own, cars, { x: 0, z: 0 });
  assert.equal(made.ctx, 0);
  assert.equal(s.unlock(), true); assert.equal(made.ctx, 1); assert.equal(s.unlock(), true); assert.equal(made.ctx, 1, 'one context only');
});

test('only the four nearest other cars sound, however many there are', () => {
  const { Ctx } = fakeAudio();
  const s = new SoundSystem({ AudioCtx: Ctx, storage: store() }); s.unlock();
  for (let i = 0; i < 20; i++) s.update(own, cars, { x: 0, z: 0, heading: 0 });
  assert.equal(s.activeOthers, MAX_OTHERS);
  assert.deepEqual([...s.others.keys()].sort((a, b) => a - b), [0, 1, 2, 3]);
  // when one drives off and another comes near, the voices move over; still four
  const moved = cars.map((c) => (c.id === 0 ? { ...c, x: 500 } : c));
  s.update(own, moved, { x: 0, z: 0, heading: 0 });
  assert.equal(s.activeOthers, MAX_OTHERS);
  assert.ok(!s.others.has(0) && s.others.has(4));
  s.update(own, [], { x: 0, z: 0 });
  assert.equal(s.activeOthers, 0);
});

test('mute silences everything, is kept on the device and restored; music is only a kept switch', () => {
  const { Ctx } = fakeAudio(); const st = store();
  const s = new SoundSystem({ AudioCtx: Ctx, storage: st }); s.unlock();
  s.update(own, cars, { x: 0, z: 0 });
  assert.ok(s.own.gain.gain.value > 0);
  s.setMuted(true);
  assert.equal(s.master.gain.value, 0); assert.equal(st.m.get('drift.mute'), '1');
  s.update(own, cars, { x: 0, z: 0 });
  assert.equal(s.own.gain.gain.value, 0); assert.equal(s.activeOthers, 0);
  assert.equal(new SoundSystem({ AudioCtx: Ctx, storage: st }).muted, true, 'the next page starts muted');
  s.setMuted(false); assert.ok(s.master.gain.value > 0);
  s.setMusic(true); assert.equal(st.m.get('drift.music'), '1'); assert.equal(s.music, true);
});

test('without WebAudio or with a failing context the game goes on silently', () => {
  assert.equal(new SoundSystem({ AudioCtx: undefined, storage: store() }).unlock(), false);
  const bad = new SoundSystem({ AudioCtx: class { constructor() { throw new Error('no'); } }, storage: store() });
  assert.equal(bad.unlock(), false); bad.update(own, cars, { x: 0, z: 0 });
});

test('the own engine follows the speed: higher speed in a gear, a different car, a different pitch', () => {
  const { Ctx } = fakeAudio();
  const s = new SoundSystem({ AudioCtx: Ctx, storage: store() }); s.unlock();
  const rpm = (speed, car) => { s.update({ ...own, speed, car }, [], { x: 0, z: 0 }); return s.own.rpm; };
  assert.ok(rpm(12, 0) > rpm(2, 0));
  assert.notEqual(rpm(15, 1), rpm(15, 2));
  // the loops: two layers x five revs points; the playing ones are the revs' neighbours, at a rate of revs / loop revs
  s.update({ ...own, speed: 15, car: 1, throttle: 1 }, [], { x: 0, z: 0 });
  assert.equal(s.own.bank.length, 10);
  const loud = s.own.bank.filter((b) => b.gain.gain.value > 0.01);
  assert.ok(loud.length >= 1 && loud.length <= 2 && loud.every((b) => b.layer === 'on'), 'full throttle: the on-load layer only');
  for (const b of loud) assert.ok(b.src && Math.abs(b.src.playbackRate.value - s.own.rpm / b.rpm) < 1e-9);
  assert.ok(s.own.playing <= 4, `only the heard loops play (${s.own.playing})`);
  s.update({ ...own, speed: 15, car: 1, throttle: 0 }, [], { x: 0, z: 0 });
  assert.ok(s.own.bank.filter((b) => b.gain.gain.value > 0.01).every((b) => b.layer === 'off'), 'throttle shut: the off-load layer');
  assert.ok(s.own.tyreGain.gain.value > 0, 'a slide of 0.7 at 18 m/s squeals');
});

test('a hit makes a short burst, louder with the hit, at most one in 120 ms, nothing for a tap, muted or before the click', () => {
  const { Ctx, made } = fakeAudio();
  const s = new SoundSystem({ AudioCtx: Ctx, storage: store() });
  s.bump(20, 0); assert.equal(made.src, 0, 'nothing before the click');
  s.unlock(); const base = made.src;
  s.bump(1, 1000); assert.equal(made.src, base, 'a tap under 2 m/s is silent');
  s.bump(15, 2000); assert.equal(made.src, base + 1);
  s.bump(25, 2050); assert.equal(made.src, base + 1, 'one at a time');
  s.bump(25, 2300); assert.equal(made.src, base + 2);
  s.setMuted(true); s.bump(25, 5000); assert.equal(made.src, base + 2, 'muted');
});

test('a new device starts muted, the volume is kept and capped behind a limiter', () => {
  const { Ctx } = fakeAudio();
  const st = store(null); st.m.delete('drift.mute');
  const s = new SoundSystem({ AudioCtx: Ctx, storage: st });
  assert.equal(s.muted, true, 'sound is off until the player switches it on');
  s.unlock(); s.setMuted(false); s.setVolume(5);
  assert.equal(s.volume, 1); assert.ok(s.master.gain.value <= 0.5 + 1e-9, 'the master gain is at most half');
  assert.equal(st.m.get('drift.volume'), '1');
});
