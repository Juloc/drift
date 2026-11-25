// Rewrites a palette material's two textures in a .glb made by tools/blender/car_normalize.py ("materials": "own"), without Blender:
// the colour (sRGB) and the metal/roughness picture (G roughness, B metal) are drawn again from a list of entries and stored as PNG.
// For a change of a few material values (darker glass, shinier rims) when the GPU PC is not at hand; the car file gets the same
// change so that the next export from Blender agrees.
// Usage: node tools/glb-palette.mjs <in.glb> <out.glb> <palette material, e.g. own_palette> <entries.json>
//   entries.json: [{ "name": "own_Material.002", "color": [r, g, b] (linear), "metal": m, "rough": r }, ...] in the palette's order:
//   the materials' names sorted, 8 x 8 texels each, ceil(sqrt(n)) a row, from the bottom left of Blender's picture (the top left
//   of the glTF's, so rows are written upside down here), the picture's side the next power of two.
import fs from 'node:fs';
import zlib from 'node:zlib';

const [inFile, outFile, palName, entriesFile] = process.argv.slice(2);
const entries = JSON.parse(fs.readFileSync(entriesFile, 'utf8')).filter((e) => e.name);

// ---- a PNG writer (RGBA 8 bit, no filter)
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

// ---- the layout of car_normalize.py's palette()
const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
let size = 1; while (size < cols * 8) size *= 2;
const at = (x, yGltf) => {   // the entry under a texel of the glTF picture (row 0 at the top = Blender's last row)
  const yb = size - 1 - yGltf, i = Math.floor(yb / 8) * cols + Math.floor(x / 8);
  return Math.floor(x / 8) < cols && i < entries.length ? entries[i] : null;
};
const colourPng = png(size, (x, y) => { const e = at(x, y); return e ? [...e.color.map((c) => byte(srgb(c))), 255] : [0, 0, 0, 255]; });
const mrPng = png(size, (x, y) => { const e = at(x, y); return e ? [255, byte(e.rough), byte(e.metal), 255] : [255, 255, 0, 255]; });

// ---- the .glb: append the two PNGs, point the palette's textures at them
const b = fs.readFileSync(inFile);
const jsonLen = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8, binLen = b.readUInt32LE(20 + jsonLen);
let bin = b.subarray(binStart, binStart + binLen);
const mat = json.materials.find((m) => m.name === palName);
if (!mat) throw new Error('no material ' + palName);
const pad = (buf) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
function addImage(data, name) {
  bin = pad(bin);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length });
  bin = Buffer.concat([bin, data]);
  json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: 'image/png', name });
  json.samplers.push({ magFilter: 9728, minFilter: 9728 });   // nearest, no mipmaps: one entry never bleeds into the next
  json.textures.push({ source: json.images.length - 1, sampler: json.samplers.length - 1 });
  return json.textures.length - 1;
}
mat.pbrMetallicRoughness.baseColorTexture = { index: addImage(colourPng, palName + '_colour') };
mat.pbrMetallicRoughness.metallicRoughnessTexture = { index: addImage(mrPng, palName + '_mr') };
if (mat.emissiveTexture) mat.emissiveTexture = { index: mat.pbrMetallicRoughness.baseColorTexture.index };
bin = pad(bin);
json.buffers[0].byteLength = bin.length;
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
fs.writeFileSync(outFile, Buffer.concat([head, jh, js, bh, bin]));
console.log(`${palName}: ${entries.length} entries, ${size}x${size}, ${outFile} ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB (the old pictures stay unused in the buffer)`);
