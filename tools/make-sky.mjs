// Makes the 1k version of a Radiance sky picture (the phone tier's sky): every 2 x 2 texels averaged in linear light, written as a flat .hdr (RGBE, no run-length coding).
// Usage: node tools/make-sky.mjs game/assets/sky/the_sky_is_on_fire_2k.hdr game/assets/sky/the_sky_is_on_fire_1k.hdr
import { readFileSync, writeFileSync } from 'node:fs';
const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: node tools/make-sky.mjs <2k.hdr> <1k.hdr>'); process.exit(1); }
const b = readFileSync(inFile);
let p = 0; const line = () => { let e = b.indexOf(10, p); const s = b.toString('latin1', p, e); p = e + 1; return s; };
let l; const head = []; while ((l = line()) !== '') head.push(l);
const m = /^-Y (\d+) \+X (\d+)$/.exec(line()); if (!m) throw new Error('only "-Y h +X w" files'); const H = +m[1], W = +m[2];
const rgbe = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {   // new-style run-length scanlines
  if (b[p] !== 2 || b[p + 1] !== 2 || ((b[p + 2] << 8) | b[p + 3]) !== W) throw new Error(`scanline ${y}: not run-length coded as expected`);
  p += 4;
  for (let c = 0; c < 4; c++) for (let x = 0; x < W;) { let n = b[p++]; if (n > 128) { n -= 128; const v = b[p++]; for (let i = 0; i < n; i++) rgbe[(y * W + x++) * 4 + c] = v; } else for (let i = 0; i < n; i++) rgbe[(y * W + x++) * 4 + c] = b[p++]; }
}
const lin = (i) => { const e = rgbe[i * 4 + 3]; if (!e) return [0, 0, 0]; const f = 2 ** (e - 136); return [rgbe[i * 4] * f, rgbe[i * 4 + 1] * f, rgbe[i * 4 + 2] * f]; };
const w2 = W >> 1, h2 = H >> 1, out = Buffer.alloc(w2 * h2 * 4);
for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
  const a = [0, 0, 0]; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = lin((2 * y + dy) * W + 2 * x + dx); for (let c = 0; c < 3; c++) a[c] += v[c] / 4; }
  const mx = Math.max(...a), o = (y * w2 + x) * 4;
  if (mx < 1e-32) continue;
  const e = Math.ceil(Math.log2(mx)), k = 256 / 2 ** e; let ee = e + 128;
  let r = Math.floor(a[0] * k), g = Math.floor(a[1] * k), bl = Math.floor(a[2] * k); if (Math.max(r, g, bl) > 255) { ee++; r >>= 1; g >>= 1; bl >>= 1; }
  out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = ee;
}
writeFileSync(outFile, Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h2} +X ${w2}\n`, 'latin1'), out]));
console.log(`${inFile} ${W}x${H} -> ${outFile} ${w2}x${h2}, ${Math.round(out.length / 1024)} KB`);
