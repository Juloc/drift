// Ogg Opus files without an encoder program: the browser's own Opus encoder (WebCodecs AudioEncoder) makes the packets, this file puts them into Ogg pages
// (RFC 7845: an OpusHead page, an OpusTags page, then the audio with the granule position in 48 kHz samples). `muxOggOpus` is pure (tested in Node),
// `encodeOggOpus` needs a browser with WebCodecs (headless Chromium in tools/sound/run.mjs).

// the Ogg checksum: CRC-32 with the polynomial 0x04c11db7, not reflected, starting at 0
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();
export function oggCrc(bytes) { let c = 0; for (const b of bytes) c = ((c << 8) ^ CRC[((c >>> 24) ^ b) & 0xff]) >>> 0; return c >>> 0; }

/** One Ogg page holding whole packets (each packet under 255 * 255 bytes in all). flags: 2 = first page, 4 = last page. */
function page(packets, { granule, serial, seq, flags = 0 }) {
  const lacing = [];
  for (const p of packets) { let n = p.length; while (n >= 255) { lacing.push(255); n -= 255; } lacing.push(n); }
  if (lacing.length > 255) throw new Error('too many packets for one page');
  const body = packets.reduce((a, p) => a + p.length, 0), out = new Uint8Array(27 + lacing.length + body), v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53], 0); out[4] = 0; out[5] = flags;
  v.setUint32(6, granule % 2 ** 32, true); v.setUint32(10, Math.floor(granule / 2 ** 32), true);
  v.setUint32(14, serial, true); v.setUint32(18, seq, true); v.setUint32(22, 0, true);
  out[26] = lacing.length; out.set(lacing, 27);
  let o = 27 + lacing.length; for (const p of packets) { out.set(p, o); o += p.length; }
  v.setUint32(22, oggCrc(out), true);
  return out;
}

/** The OpusHead packet (RFC 7845 5.1): channels, pre-skip in 48 kHz samples, the original sample rate. */
export function opusHead(channels, preSkip = 312, rate = 48000) {
  const h = new Uint8Array(19), v = new DataView(h.buffer);
  h.set([...'OpusHead'].map((c) => c.charCodeAt(0)), 0); h[8] = 1; h[9] = channels; v.setUint16(10, preSkip, true); v.setUint32(12, rate, true); v.setInt16(16, 0, true); h[18] = 0;
  return h;
}
const opusTags = (vendor) => { const enc = new TextEncoder().encode(vendor), t = new Uint8Array(8 + 4 + enc.length + 4), v = new DataView(t.buffer); t.set([...'OpusTags'].map((c) => c.charCodeAt(0)), 0); v.setUint32(8, enc.length, true); t.set(enc, 12); v.setUint32(12 + enc.length, 0, true); return t; };

/**
 * The Ogg file: `head` the OpusHead packet, `packets` the audio packets in order, each `frame` samples at 48 kHz (960 = 20 ms), `samples` the length of the sound
 * itself (the last page's granule is pre-skip plus that, so a player cuts the padding off the end).
 */
export function muxOggOpus({ head, packets, frame = 960, samples, serial = 0x64726674 }) {
  const preSkip = new DataView(head.buffer, head.byteOffset).getUint16(10, true);
  const pages = [page([head], { granule: 0, serial, seq: 0, flags: 2 }), page([opusTags('drift tools/sound/oggopus.js')], { granule: 0, serial, seq: 1 })];
  let seq = 2, done = 0;
  for (let i = 0; i < packets.length; ) {
    const group = []; let bytes = 0;
    while (i < packets.length && group.length < 50 && bytes + packets[i].length < 60000) { group.push(packets[i]); bytes += packets[i].length; i++; }
    done += group.length * frame;
    const last = i >= packets.length;
    pages.push(page(group, { granule: last ? preSkip + samples : Math.min(done, preSkip + samples), serial, seq: seq++, flags: last ? 4 : 0 }));
  }
  const out = new Uint8Array(pages.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of pages) { out.set(p, o); o += p.length; }
  return out;
}

/** Browser only: channels (Float32Array each, 48 kHz) -> an Ogg Opus file (Uint8Array). bitrate in bits per second. */
export async function encodeOggOpus(channels, { bitrate = 48000, application = 'audio' } = {}) {
  const sr = 48000, nch = channels.length, len = channels[0].length, frame = 960, packets = [];
  let head = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); packets.push(b); if (meta?.decoderConfig?.description && !head) head = new Uint8Array(meta.decoderConfig.description); },
    error: (e) => { throw e; },
  });
  enc.configure({ codec: 'opus', sampleRate: sr, numberOfChannels: nch, bitrate, opus: { application, frameDuration: 20000, complexity: 10 } });
  for (let at = 0; at < len; at += frame * 50) {
    const n = Math.min(frame * 50, len - at), data = new Float32Array(n * nch);
    for (let c = 0; c < nch; c++) data.set(channels[c].subarray(at, at + n), c * n);   // planar
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: nch, timestamp: Math.round((at / sr) * 1e6), data }));
  }
  await enc.flush(); enc.close();
  // the encoder's own OpusHead when it gives one (it knows its pre-skip), else the usual 312 samples
  const h = head && head.length >= 19 && String.fromCharCode(...head.subarray(0, 8)) === 'OpusHead' ? head : opusHead(nch, 312);
  return muxOggOpus({ head: h, packets, frame, samples: len });
}
