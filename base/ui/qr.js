/* Makes a QR code in the browser (a small implementation of ISO/IEC 18004 of our own, no library, no network; taken from JulOS).
 * Scope: byte mode (UTF-8), error correction M, versions 1 to 10 (up to 213 bytes). That is enough for the authenticator link (otpauth://...).
 * qrMatrix(text) gives the modules (rows of 0/1), qrSvg(text) a finished SVG with a light border (a QR code needs it in the dark scheme too).
 * A QR code is a picture format, not cryptography: writing it ourselves does not touch CODE-03. */

const VERSIONS = 10;
// error correction M: correction words per block and number of blocks, index = version
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMAT_M = 0;   // the two format bits of level M

/* ---- Reed-Solomon over GF(256), polynomial 0x11D ---- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The remainder of data * x^n divided by the generator polynomial of degree n: the correction words. */
export function reedSolomon(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= mul(gen[j], EXP[i]); }
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift();
    rem.push(0);
    if (f) for (let i = 0; i < n; i++) rem[i] ^= mul(gen[i + 1], f);
  }
  return rem;
}

/* ---- Sizes ---- */
const sizeOf = (v) => 17 + 4 * v;
function rawCodewords(v) {
  let bits = (16 * v + 128) * v + 64;
  if (v >= 2) { const a = Math.floor(v / 7) + 2; bits -= (25 * a - 10) * a - 55; }
  if (v >= 7) bits -= 36;
  return bits >> 3;
}
const dataCodewords = (v) => rawCodewords(v) - ECC_PER_BLOCK[v] * BLOCKS[v];
const lengthBits = (v) => (v < 10 ? 8 : 16);

/** The smallest version the text fits into; null when it is too long. */
function pickVersion(len) {
  for (let v = 1; v <= VERSIONS; v++) if (4 + lengthBits(v) + len * 8 <= dataCodewords(v) * 8) return v;
  return null;
}

/* ---- Data bits, blocks, interleaving ---- */
function codewordsFor(bytes, v) {
  const bits = [];
  const put = (value, count) => { for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, lengthBits(v));
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < dataCodewords(v); pad ^= 0xec ^ 0x11) out.push(pad);

  const nb = BLOCKS[v], eccLen = ECC_PER_BLOCK[v], raw = rawCodewords(v);
  const shortLen = Math.floor(raw / nb), nShort = nb - (raw % nb);
  const blocks = []; let k = 0;
  for (let i = 0; i < nb; i++) {
    const dlen = shortLen - eccLen + (i < nShort ? 0 : 1);
    const data = out.slice(k, k + dlen); k += dlen;
    blocks.push({ data, ecc: reedSolomon(data, eccLen) });
  }
  const result = [];
  for (let i = 0; i <= shortLen - eccLen; i++) for (const b of blocks) if (i < b.data.length) result.push(b.data[i]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) result.push(b.ecc[i]);
  return result;
}

/* ---- Matrix ---- */
function alignmentPositions(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, size = sizeOf(v);
  const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p);
  return r;
}

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function build(v, codewords) {
  const size = sizeOf(v);
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = alignmentPositions(v);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  const formatBits = (mask) => {
    const data = (FORMAT_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true);
  };
  formatBits(0);   // reserve the place so the data leaves it out; the real bits follow once the mask is chosen
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); }
  }

  // data in a zigzag from the bottom right, two columns wide
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && i < codewords.length * 8) { mod[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  // choose the mask: the one with the smallest penalty
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    apply(m); formatBits(m);
    const s = penalty(mod, size);
    if (s < bestScore) { bestScore = s; best = m; }
    apply(m);
  }
  apply(best); formatBits(best);
  return mod;
}

function penalty(mod, size) {
  let score = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(mod[y].map(Number));
  for (let x = 0; x < size; x++) lines.push(mod.map((row) => Number(row[x])));
  for (const line of lines) {
    for (let i = 0, run = 1; i < size; i++) {
      if (i > 0 && line[i] === line[i - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
    }
    const s = line.join('');
    for (const pat of ['10111010000', '00001011101']) for (let at = s.indexOf(pat); at >= 0; at = s.indexOf(pat, at + 1)) score += 40;
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = mod[y][x];
    if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3;
  }
  for (const row of mod) for (const c of row) if (c) dark++;
  score += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
  return score;
}

/** The modules as rows of 0 and 1. Throws when the text does not fit into version 10 (level M). */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  const v = pickVersion(bytes.length);
  if (v === null) throw new Error('QR: the text is too long');
  return build(v, codewordsFor(bytes, v)).map((row) => row.map(Number));
}

/** A finished SVG (light ground, dark modules, a border of 4 modules) that scales with the width of its parent. */
export function qrSvg(text, { border = 4, label = 'QR code' } = {}) {
  const m = qrMatrix(text), n = m.length, total = n + border * 2;
  label = String(label).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) {
    let run = 1; while (x + run < n && m[y][x + run]) run++;
    d += `M${x + border} ${y + border}h${run}v1h-${run}z`;
    x += run - 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
