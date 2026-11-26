// Renders the game's own engine (game/view/sound.js, the same code) through a drive in an OfflineAudioContext: idle, full throttle
// through the gears to the limiter, the limiter held, the throttle shut (off load and pops), coasting. Draws a spectrogram and makes a
// WAV of it. window.__ramp = { png, wav } (base64) for tools/sound/ramp.mjs. Address: ?car=1 (the car id), ?sr=22050.
import { SoundSystem } from '../../game/view/sound.js';

const q = new URLSearchParams(location.search), car = +(q.get('car') ?? 1), SR = +(q.get('sr') ?? 22050), top = 33;
const tyres = q.get('scene') === 'tyres';   // ?scene=tyres: the tyres alone (the engine muted) through roll, turn-in, drift, a switch, a big angle, roll-out
const SECS = tyres ? 10 : 13;
class Offline { constructor() { return new OfflineAudioContext(1, SR * SECS, SR); } }
const store = { getItem: (k) => ({ 'drift.mute': '0', 'drift.volume': '1' })[k] ?? null, setItem() {} };
const s = new SoundSystem({ AudioCtx: Offline, storage: store, keepAllLoops: q.has('all') });   // ?all=1: all ten loops play all the time (to compare the cost)
s.unlock();
const ctx = s.ctx;
if (tyres) s.own.lowCut.disconnect();   // the engine's loops out of the mix: only the tyres are heard
// the drive: [time, speed m/s, throttle]
const lerp = (a, b, t0, t1, t) => a + (b - a) * Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
// the tyre drive: [speed, throttle, slide]
const tyreDrive = (t) => {
  if (t < 2) return [lerp(0, 20, 0, 2, t), 0.6, 0];   // rolling away
  if (t < 3) return [20, 0.5, lerp(0, 0.18, 2, 3, t)];   // turning in: a little slip
  if (t < 5.5) return [20, 0.85, lerp(0.18, 0.6, 3, 3.6, t)];   // the drift held
  if (t < 6.5) return [19, 0.7, t < 6 ? lerp(0.6, 0.08, 5.5, 6, t) : lerp(0.08, 0.65, 6, 6.5, t)];   // the switch left to right
  if (t < 8) return [18, 0.9, lerp(0.65, 0.95, 6.5, 7, t)];   // a big angle: scrubbing
  return [lerp(18, 4, 8, 10, t), 0, lerp(0.95, 0, 8, 8.8, t)];   // rolling out
};
const drive = (t) => {
  if (t < 1) return [0, 0];
  if (t < 8) return [top * ((t - 1) / 7) ** 0.8, 1];   // full throttle through the gears
  if (t < 9.5) return [top, 1];   // at the limiter
  return [Math.max(0, top - (t - 9.5) * 4), 0];   // throttle shut, coasting
};
const marks = tyres ? [[0, 'rolling away'], [2, 'turn-in'], [3, 'drift held'], [5.5, 'switch'], [6.5, 'big angle'], [8, 'rolling out']] : [[0, 'idle'], [1, 'full throttle through the gears'], [8, 'limiter'], [9.5, 'throttle shut: off load, pops']];
const step = 128 / SR * 4;   // every four render quanta (23 ms at 22 kHz)
let lastThrottle = 0;
for (let t = 0; t < SECS - step; t += step) {
  const at = Math.round(t * SR / 128) * 128 / SR;
  ctx.suspend(at).then(() => {
    const [speed, throttle, slide = 0] = tyres ? tyreDrive(at) : drive(at);
    s.update({ speed, throttle, slide, car, top }, [], { x: 0, z: 0, heading: 0 });
    if (!tyres && lastThrottle > 0.7 && throttle < 0.2) s.pop(1, at * 1000);   // as the game does it (main.js)
    lastThrottle = throttle;
    ctx.resume();
  });
}
const tr0 = performance.now(), buf = await ctx.startRendering(), renderMs = performance.now() - tr0, d = buf.getChannelData(0);

// ---- spectrogram: 2048-point FFT, hop 256, log frequency 40..6000 Hz, dB
const N = 2048, hop = 256, frames = Math.floor((d.length - N) / hop), W = 1400, H = 520, top0 = 20;
const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const c = document.getElementById('c'), x = c.getContext('2d'), img = x.createImageData(W, H);
const fLo = 40, fHi = 6000, rowBin = Array.from({ length: H }, (_, y) => Math.round((fLo * (fHi / fLo) ** (1 - y / (H - 1))) / (SR / N)));
const col = (v) => { const t = Math.max(0, Math.min(1, v)); return [Math.round(255 * Math.min(1, t * 1.6)), Math.round(255 * Math.max(0, t * 1.6 - 0.45)), Math.round(255 * Math.max(0, (t - 0.7) * 3.3) + 60 * (1 - t))]; };
let eLow = 0, eAll = 0;   // energy under 100 Hz and in all, over the full-throttle part (1 to 9.5 s)
for (let px = 0; px < W; px++) {
  const f = Math.floor((px / W) * frames), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = d[f * hop + i] * win[i];
  fft(re, im);
  const tSec = (f * hop) / SR; if (tSec > 1 && tSec < 9.5) for (let b = 1; b < N / 2; b++) { const e = re[b] * re[b] + im[b] * im[b]; eAll += e; if (b * SR / N < 100) eLow += e; }
  for (let y = 0; y < H; y++) {
    const b = rowBin[y], mag = Math.hypot(re[b], im[b]) + 1e-9, db = 20 * Math.log10(mag);
    const [r, g, bl] = col((db + 30) / 70), k = (y * W + px) * 4;
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bl; img.data[k + 3] = 255;
  }
}
x.fillStyle = '#000'; x.fillRect(0, 0, W, 560); x.putImageData(img, 0, top0);
x.font = '14px sans-serif'; x.fillStyle = '#fff';
x.fillText(`${tyres ? 'tyres' : 'engine'} of car ${car}: spectrogram of the game's own sound (game/view/sound.js), ${SECS} s, 40 to 6000 Hz on a log scale`, 8, 15);
for (const [t, label] of marks) { const px = (t / (d.length / SR)) * W; x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(px, top0, 1, H); x.fillStyle = '#fff'; x.fillText(label, px + 4, top0 + 16); }
for (const f of [100, 200, 500, 1000, 2000, 5000]) { const y = top0 + (H - 1) * (1 - Math.log(f / fLo) / Math.log(fHi / fLo)); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, y, 30, 1); x.fillStyle = '#ddd'; x.fillText(f + ' Hz', 34, y + 4); }

// ---- WAV (16 bit mono)
const pcm = new DataView(new ArrayBuffer(44 + d.length * 2));
const w4 = (o, sv) => [...sv].forEach((ch, i) => pcm.setUint8(o + i, ch.charCodeAt(0)));
w4(0, 'RIFF'); pcm.setUint32(4, 36 + d.length * 2, true); w4(8, 'WAVE'); w4(12, 'fmt '); pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true);
pcm.setUint32(24, SR, true); pcm.setUint32(28, SR * 2, true); pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true); w4(36, 'data'); pcm.setUint32(40, d.length * 2, true);
let peak = 1e-9; for (const v of d) peak = Math.max(peak, Math.abs(v));
for (let i = 0; i < d.length; i++) pcm.setInt16(44 + i * 2, Math.round((d[i] / peak) * 0.89 * 32767), true);
const b64 = (u8) => { let s2 = ''; for (let i = 0; i < u8.length; i += 0x8000) s2 += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s2); };
window.__ramp = { png: c.toDataURL('image/png').split(',')[1], wav: b64(new Uint8Array(pcm.buffer)), peak, lowShare: eLow / eAll, renderMs: Math.round(renderMs), seconds: SECS, maxPlaying: s.own.maxPlaying };
