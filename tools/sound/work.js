// Sound jobs that need a browser (tools/sound/run.mjs starts them): `?job=probe` what this browser can do; `?job=analyse&file=…` the revs over time of a recording
// (a spectrogram with the firing frequency drawn on it); `?job=music&…` music tracks to small Ogg Opus files; `?job=engine&…` engine loops cut from a recording.
// Every job ends in window.__out = { files: [{ path, b64 }], …summary } (or { error }).
import { encodeOggOpus } from './oggopus.js';

const q = new URLSearchParams(location.search), job = q.get('job');
const SR = 48000;
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

/** A recording decoded and resampled to 48 kHz: { ch: [Float32Array…], seconds }. */
export async function decode(url) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const buf = await new OfflineAudioContext(1, 1, SR).decodeAudioData(bytes);
  return { ch: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), seconds: buf.duration };
}
const mono = (ch) => { if (ch.length === 1) return ch[0]; const m = new Float32Array(ch[0].length); for (const c of ch) for (let i = 0; i < m.length; i++) m[i] += c[i] / ch.length; return m; };

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const h = i + k + len / 2, vr = re[h] * cr - im[h] * ci, vi = re[h] * ci + im[h] * cr;
      re[h] = re[i + k] - vr; im[h] = im[i + k] - vi; re[i + k] += vr; im[i + k] += vi;
      const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}

/** Log magnitude spectra every `hop` seconds with an N-point window: { frames: Float32Array[], bin (Hz per bin), hop }. */
export function spectra(d, N = 8192, hopS = 0.025) {
  const hop = Math.round(hopS * SR), win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)), frames = [];
  for (let at = 0; at + N < d.length; at += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = d[at + i] * win[i];
    fft(re, im);
    const m = new Float32Array(N / 2); for (let b = 0; b < N / 2; b++) m[b] = Math.log(1e-9 + Math.hypot(re[b], im[b]));
    frames.push(m);
  }
  return { frames, bin: SR / N, hop: hopS, N };
}

/**
 * The firing frequency of a four-cylinder over time (twice the crank's frequency): for each frame the f0 between fLo and fHi whose first harmonics stand out most
 * above the spectrum around them, then a path through the frames that may not jump (dynamic programming over the candidates). Returns Hz per frame.
 */
export function firingTrack(S, fLo = 24, fHi = 320, harmonics = 6) {
  const cands = []; for (let f = fLo; f <= fHi; f *= 1.01) cands.push(f);
  const at = (m, f) => { const x = f / S.bin, i = Math.floor(x), t = x - i; return i + 1 < m.length ? m[i] * (1 - t) + m[i + 1] * t : -20; };
  const score = S.frames.map((m) => cands.map((f) => {
    let s = 0; for (let h = 1; h <= harmonics; h++) { const peak = at(m, f * h), around = (at(m, f * (h - 0.5)) + at(m, f * (h + 0.5))) / 2; s += (peak - around) / Math.sqrt(h); }
    return s;
  }));
  // the path: each step may move by at most about 12 % (a fast rev rises ~ 3000 rpm/s; 25 ms later that is under 10 %)
  const n = S.frames.length, K = cands.length, maxStep = 12, best = score[0].slice(), from = [];
  for (let t = 1; t < n; t++) {
    const nb = new Array(K).fill(-Infinity), fr = new Int16Array(K);
    for (let k = 0; k < K; k++) for (let d = -maxStep; d <= maxStep; d++) { const j = k + d; if (j < 0 || j >= K) continue; const v = best[j] - 0.02 * Math.abs(d); if (v > nb[k]) { nb[k] = v; fr[k] = j; } }
    for (let k = 0; k < K; k++) best[k] = nb[k] + score[t][k];
    from.push(fr);
  }
  let k = best.indexOf(Math.max(...best)); const path = new Array(n); path[n - 1] = k;
  for (let t = n - 1; t > 0; t--) { k = from[t - 1][k]; path[t - 1] = k; }
  return path.map((i) => cands[i]);
}

/** A spectrogram picture (log frequency fLo..fHi) with lines drawn over it: lines = [{ hz: Float32Array per frame, colour }]. */
function picture(S, title, lines = [], fLo = 20, fHi = 2500) {
  const c = document.getElementById('c'), x = c.getContext('2d'), W = c.width, H = c.height - 30, img = x.createImageData(W, H);
  const yOf = (f) => (H - 1) * (1 - Math.log(f / fLo) / Math.log(fHi / fLo));
  let mx = -1e9, mn = 1e9; for (const m of S.frames) for (let b = 5; b < m.length; b += 7) { mx = Math.max(mx, m[b]); mn = Math.min(mn, m[b]); }
  for (let px = 0; px < W; px++) {
    const m = S.frames[Math.floor((px / W) * S.frames.length)];
    for (let y = 0; y < H; y++) { const f = fLo * (fHi / fLo) ** (1 - y / (H - 1)), v = Math.max(0, Math.min(1, (m[Math.round(f / S.bin)] - (mx - 9)) / 9)), k = (y * W + px) * 4; img.data[k] = 255 * Math.min(1, v * 1.6); img.data[k + 1] = 255 * Math.max(0, v * 1.6 - 0.5); img.data[k + 2] = 60 * (1 - v) + 200 * Math.max(0, v - 0.7); img.data[k + 3] = 255; }
  }
  x.fillStyle = '#000'; x.fillRect(0, 0, W, c.height); x.putImageData(img, 0, 30);
  for (const l of lines) { x.fillStyle = l.colour; for (let px = 0; px < W; px++) { const f = l.hz[Math.floor((px / W) * l.hz.length)]; if (f > fLo) x.fillRect(px, 30 + yOf(f) - 1, 1, 3); } }
  x.font = '14px sans-serif'; x.fillStyle = '#fff'; x.fillText(title, 8, 18);
  for (const f of [50, 100, 200, 500, 1000, 2000]) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, 30 + yOf(f), 24, 1); x.fillText(String(f), 28, 30 + yOf(f) + 5); }
  const secs = S.frames.length * S.hop; for (let s = 10; s < secs; s += 10) { const px = (s / secs) * W; x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(px, 30, 1, H); x.fillStyle = '#fff'; x.fillText(s + ' s', px + 3, 44); }
  return c.toDataURL('image/png').split(',')[1];
}

/** Smoothed track: a median over 5 frames, then a mean over 3 (the path may still step by a candidate). */
const smoothTrack = (a) => { const m = a.map((_, i) => { const w = a.slice(Math.max(0, i - 2), i + 3).sort((x, y) => x - y); return w[w.length >> 1]; }); return m.map((_, i) => (m[Math.max(0, i - 1)] + m[i] + m[Math.min(m.length - 1, i + 1)]) / 3); };

/**
 * Engine loops from a recording of free revs (a car standing still: the revs rising = the throttle open = on load, falling = shut = off load). For each target revs
 * the best stretch of the recording near them is found, then warped in time so that its firing frequency is exactly the target's all through (each firing put
 * where a steady engine would fire), cut to whole engine cycles (a multiple of four firings) and closed into a loop with a short equal-power crossfade.
 */
export function cutLoops(d, track, hop, targets, { seconds = 0.45, cylinders = 4 } = {}) {
  const fps = 1 / hop, n = track.length, Wn = Math.round(seconds * fps), firePerRev = cylinders / 2;
  const rms = new Float32Array(n); for (let t = 0; t < n; t++) { const a = Math.round(t * hop * SR), b = Math.min(d.length, a + Math.round(hop * SR)); let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; rms[t] = Math.sqrt(e / Math.max(1, b - a)); }
  const loud = [...rms].sort((a, b) => a - b)[Math.floor(n * 0.5)];
  const pick = (rpm, layer) => {
    let best = null;
    for (let t0 = 2; t0 + Wn < n - 2; t0++) {
      let sum = 0, minR = Infinity; for (let t = t0; t < t0 + Wn; t++) { sum += track[t]; minR = Math.min(minR, rms[t]); }
      const mean = (sum / Wn) * (60 / firePerRev), slope = ((track[t0 + Wn - 1] - track[t0]) * (60 / firePerRev)) / seconds;   // rpm, rpm per second
      // how smooth the track is: the largest jump between frames (a tracking error is a jump)
      let jump = 0; for (let t = t0 + 1; t < t0 + Wn; t++) jump = Math.max(jump, Math.abs(track[t] - track[t - 1]) / track[t]);
      if (minR < loud * (rpm < 1600 ? 0.15 : 0.5) || jump > 0.06) continue;   // (idle is quiet)
      // on: steady or rising; off: falling clearly (the throttle shut); at idle both are the engine ticking over, steady
      const idle = rpm < 1600, wrongWay = idle ? Math.abs(slope) / 600 : layer === 'on' ? Math.max(0, -slope - 300) / 1000 : Math.max(0, slope + 900) / 600;
      const cost = Math.abs(Math.log(mean / rpm)) * 4 + wrongWay * 2 + (layer === 'on' ? Math.abs(slope) / 20000 : 0) + jump * 3;
      if (!best || cost < best.cost) best = { t0, mean, slope, cost };
    }
    return best;
  };
  const loops = [];
  for (const rpm of targets) for (const layer of ['on', 'off']) {
    const p = pick(rpm, layer);
    if (!p) { loops.push({ rpm, layer, missing: true }); continue; }
    // the source's firing phase over the stretch (firings counted from its start), from the track
    const fT = (rpm / 60) * firePerRev, cyc = cylinders, M = Math.max(cyc * 2, cyc * Math.round((seconds * fT) / cyc)), N = Math.round((M * SR) / fT), K = cyc, Nk = Math.round((K * SR) / fT);
    const s0 = Math.round(p.t0 * hop * SR), span = Math.min(d.length - s0 - 4, Math.round((Wn * Math.max(1, (rpm / p.mean) * 1.25) + 6) * hop * SR)), phase = new Float64Array(span);   // (a source slower than the target: a longer stretch)
    let ph = 0; for (let i = 0; i < span; i++) { const ft = s0 / SR / hop + i / SR / hop, a = Math.min(n - 1, Math.floor(ft)), w = ft - a, f = track[a] * (1 - w) + track[Math.min(n - 1, a + 1)] * w; phase[i] = ph; ph += f / SR; }
    // the source stretch is longer or shorter than M + K firings: take the middle of it
    const need = M + K, startPh = Math.max(0, (ph - need) / 2);
    if (ph < need) { loops.push({ rpm, layer, missing: true, why: 'stretch too short' }); continue; }
    const warped = new Float32Array(N + Nk);
    let j = 0;
    for (let o = 0; o < warped.length; o++) {
      const want = startPh + (o / (N + Nk)) * need;
      while (j < span - 2 && phase[j + 1] < want) j++;
      const fr = (want - phase[j]) / Math.max(1e-9, phase[j + 1] - phase[j]), at = s0 + j + fr, i0 = Math.floor(at), u = at - i0;
      const x0 = d[i0 - 1] ?? 0, x1 = d[i0] ?? 0, x2 = d[i0 + 1] ?? 0, x3 = d[i0 + 2] ?? 0;   // cubic (Catmull-Rom) between samples
      warped[o] = x1 + 0.5 * u * (x2 - x0 + u * (2 * x0 - 5 * x1 + 4 * x2 - x3 + u * (3 * (x1 - x2) + x3 - x0)));
    }
    const loop = warped.slice(0, N);
    for (let i = 0; i < Nk; i++) { const a = (i / Nk) * (Math.PI / 2); loop[i] = warped[N + i] * Math.cos(a) + warped[i] * Math.sin(a); }
    let m = 0; for (const v of loop) m += v; m /= N;
    let e = 0, pk = 1e-9; for (let i = 0; i < N; i++) { loop[i] -= m; e += loop[i] * loop[i]; pk = Math.max(pk, Math.abs(loop[i])); }
    const g = Math.min(0.2 / Math.sqrt(e / N), 0.95 / pk); for (let i = 0; i < N; i++) loop[i] *= g;
    loops.push({ rpm, layer, data: loop, from: +(p.t0 * hop).toFixed(2), sourceRpm: Math.round(p.mean), slope: Math.round(p.slope), firings: M });
  }
  return loops;
}

/** Little endian 16-bit mono WAV. */
function wav(d) {
  const v = new DataView(new ArrayBuffer(44 + d.length * 2)), w4 = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w4(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); w4(8, 'WAVE'); w4(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w4(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, d[i])) * 32767), true);
  return new Uint8Array(v.buffer);
}

const jobs = {
  async probe() {
    const opus = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: SR, numberOfChannels: 1, bitrate: 32000 }).catch((e) => ({ supported: false, e: String(e) }));
    const tone = new Float32Array(SR).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR));
    const ogg = await encodeOggOpus([tone], { bitrate: 32000 });
    const back = await new OfflineAudioContext(1, 1, SR).decodeAudioData(ogg.buffer.slice(0));
    return { opus: opus.supported, oggBytes: ogg.length, decodedSeconds: back.duration, canPlay: new Audio().canPlayType('audio/ogg; codecs=opus') };
  },
  async analyse() {
    const file = q.get('file'), rec = await decode('/src/' + file), d = mono(rec.ch), S = spectra(d), f0 = firingTrack(S);
    const rpm = f0.map((f) => Math.round(f * 30));   // a four-stroke four: two firings per turn
    const png = picture(S, `${file}: spectrogram 20 to 2500 Hz (log), the firing frequency found (green: x1, x2 faint)`, [{ hz: f0, colour: '#3f6' }, { hz: f0.map((f) => f * 2), colour: 'rgba(80,255,120,0.4)' }]);
    const every = Math.round(0.5 / S.hop), table = []; for (let t = 0; t < rpm.length; t += every) table.push([+(t * S.hop).toFixed(1), rpm[t]]);
    return { files: [{ path: `docs/sound/source-${q.get('name') ?? 'rec'}.png`, b64: png }], seconds: +rec.seconds.toFixed(2), channels: rec.ch.length, rpm: table, hop: S.hop, rpmAll: q.get('all') ? rpm : undefined };
  },
  /** Music: each track (`tracks=id:file,id:file`) evened out in loudness (the same mean level, peaks under 0.95), a 30 ms fade at both ends, as Ogg Opus. */
  async music() {
    const tracks = q.get('tracks').split(',').map((t) => t.split(':')), kbps = +(q.get('kbps') ?? 48), files = [], out = [];
    for (const [id, file] of tracks) {
      const rec = await decode('/src/' + file), ch = rec.ch.map((c) => Float32Array.from(c)), n = ch[0].length;
      let e = 0, pk = 1e-9; for (const c of ch) for (let i = 0; i < n; i++) { e += c[i] * c[i]; pk = Math.max(pk, Math.abs(c[i])); }
      const rms = Math.sqrt(e / (n * ch.length)), g = Math.min(0.12 / rms, 0.95 / pk), fade = Math.round(0.03 * SR);
      for (const c of ch) for (let i = 0; i < n; i++) c[i] *= g * Math.min(1, i / fade, (n - 1 - i) / fade);
      const ogg = await encodeOggOpus(ch, { bitrate: kbps * 1000 * (ch.length > 1 ? 1 : 0.6) });
      files.push({ path: `game/assets/music/${id}.ogg`, b64: b64(ogg) });
      out.push({ id, seconds: +(n / SR).toFixed(2), channels: ch.length, gainDb: +(20 * Math.log10(g)).toFixed(1), kb: Math.round(ogg.length / 1024) });
    }
    return { files, tracks: out };
  },
  /**
   * Exhaust pops from a recording of an exhaust popping (`file`, `name`, `n` pops, `len` seconds each): the loudest sudden rises of the level (an onset: the level jumps
   * by 9 dB within 20 ms), at least 0.35 s apart, each cut from 5 ms before it, a 3 ms fade in, a fade out over the last 60 ms, a high-pass at 100 Hz (nothing a phone
   * speaker only buzzes with), every pop levelled to the same peak. One Ogg file (mono Opus) and a manifest; a WAV with every pop twice to listen.
   */
  async pops() {
    const file = q.get('file'), name = q.get('name') ?? 'pops', want = +(q.get('n') ?? 8), len = +(q.get('len') ?? 0.3), rec = await decode('/src/' + file), x = mono(rec.ch).slice();
    let hp = 0, prev = 0; const rc = 1 / (2 * Math.PI * 100), a = rc / (rc + 1 / SR);   // a one-pole high-pass
    for (let i = 0; i < x.length; i++) { const v = x[i]; hp = a * (hp + v - prev); prev = v; x[i] = hp; }
    const hop = Math.round(0.005 * SR), env = []; for (let i = 0; i + hop <= x.length; i += hop) { let e = 0; for (let k = 0; k < hop; k++) e += x[i + k] * x[i + k]; env.push(10 * Math.log10(e / hop + 1e-12)); }
    const top = Math.max(...env), cand = [];
    for (let t = 6; t < env.length - 2; t++) {
      const before = Math.max(...env.slice(t - 6, t - 1)), rise = Math.max(env[t], env[t + 1]) - before;
      if (rise > 9 && env[t + 1] > top - 30) { let pk = 0; const a0 = t * hop; for (let k = 0; k < Math.round(0.08 * SR); k++) pk = Math.max(pk, Math.abs(x[a0 + k] ?? 0)); cand.push({ t, at: t * hop, rise, pk }); }
    }
    cand.sort((p, q2) => q2.pk - p.pk);
    const keep = []; for (const c of cand) { if (keep.length >= want) break; if (keep.every((k) => Math.abs(k.at - c.at) > 0.35 * SR)) keep.push(c); }
    keep.sort((p, q2) => p.at - q2.at);
    if (keep.length < 3) return { error: `only ${keep.length} onsets found`, cand: cand.length };
    const N = Math.round(len * SR), pre = Math.round(0.005 * SR), cuts = keep.map((k) => {
      const from = Math.max(0, k.at - pre), c = x.slice(from, from + N); let pk = 1e-9; for (const v of c) pk = Math.max(pk, Math.abs(v));
      const fi = Math.round(0.003 * SR), fo = Math.round(0.06 * SR);
      for (let i = 0; i < c.length; i++) c[i] *= (0.9 / pk) * Math.min(1, i / fi, (c.length - 1 - i) / fo);
      return { c, at: from / SR };
    });
    const gapS = Math.round(0.05 * SR), all = new Float32Array(cuts.length * (N + gapS)), pops = [];
    cuts.forEach(({ c, at }, i) => { all.set(c, i * (N + gapS)); pops.push({ start: +((i * (N + gapS)) / SR).toFixed(4), seconds: +(c.length / SR).toFixed(4), gain: 0.5, from: +at.toFixed(2) }); });
    const ogg = await encodeOggOpus([all], { bitrate: 40000 });
    const listen = new Float32Array(cuts.length * 2 * (N + Math.round(0.4 * SR))); let o = 0; for (const { c } of cuts) for (let k = 0; k < 2; k++) { listen.set(c, o); o += N + Math.round(0.4 * SR); }
    return { files: [{ path: `game/assets/sound/${name}.ogg`, b64: b64(ogg) }, { path: `game/assets/sound/${name}.json`, b64: btoa(JSON.stringify({ note: `Exhaust pops cut by tools/sound/work.js (job pops) from ${q.get('credit') ?? file}`, rate: SR, pops }, null, 1) + '\n') }, { path: `docs/sound/${name}-listen.wav`, b64: b64(wav(listen)) }],
      pops, candidates: cand.length, oggKB: Math.round(ogg.length / 1024) };
  },
  async engine() {
    const file = q.get('file'), name = q.get('name'), rec = await decode('/src/' + file), d = mono(rec.ch), S = spectra(d), track = smoothTrack(firingTrack(S));
    const targets = q.get('rpms').split(',').map(Number), loops = cutLoops(d, track, S.hop, targets);
    const missing = loops.filter((l) => l.missing);
    if (missing.length) return { error: 'no stretch for ' + missing.map((l) => `${l.layer} ${l.rpm}`).join(', '), loops: loops.map(({ data, ...r }) => r) };
    // one file: each loop three times in a row (the middle copy is the one played: whatever the decoder does at the edges of a slice, its neighbours are the same sound)
    let total = 0; for (const l of loops) total += l.data.length * 3;
    const all = new Float32Array(total), manifest = [];
    let at = 0; for (const l of loops) { for (let k = 0; k < 3; k++) all.set(l.data, at + k * l.data.length); manifest.push({ layer: l.layer, rpm: l.rpm, start: +((at + l.data.length) / SR).toFixed(6), seconds: +(l.data.length / SR).toFixed(6), from: l.from, sourceRpm: l.sourceRpm, slope: l.slope }); at += l.data.length * 3; }
    const ogg = await encodeOggOpus([all], { bitrate: +(q.get('kbps') ?? 48) * 1000 });
    const json = { note: `Engine loops cut by tools/sound/work.js (job engine) from ${q.get('credit') ?? file}; each loop is stored three times, the middle copy is played`, rate: SR, rpms: targets, loops: manifest };
    // a listening file: every loop four times, a short gap between
    const gap = Math.round(0.15 * SR); let lt = 0; for (const l of loops) lt += l.data.length * 4 + gap; const listen = new Float32Array(lt); let o = 0; for (const l of loops) { for (let k = 0; k < 4; k++) { listen.set(l.data, o); o += l.data.length; } o += gap; }
    return { files: [{ path: `game/assets/sound/${name}-engine.ogg`, b64: b64(ogg) }, { path: `game/assets/sound/${name}-engine.json`, b64: btoa(JSON.stringify(json, null, 1) + '\n') }, { path: `docs/sound/${name}-loops.wav`, b64: b64(wav(listen)) }],
      loops: manifest, oggKB: Math.round(ogg.length / 1024) };
  },
};

try { window.__out = await jobs[job](); } catch (e) { window.__out = { error: String(e?.stack ?? e) }; }
