// Makes the small model files of the nature kit (Quaternius, "Stylized Nature MegaKit", CC0 1.0: docs/ASSETS.md) into game/assets/env/*.glb: one file per model, standing on y = 0
// and centred on x, z; plants and grass 1 m high (the slots scale them), trees, pebbles and bushes in true size (their sizes are noted below and in docs/ASSETS.md);
// only the colour texture of each material (the normal maps go), 256 px (512 where it matters), WebP with alpha for leaves and flowers (EXT_texture_webp) and JPEG for bark and stone, the vertex colour as
// bytes, matte (no metal, rough); nothing else of the kit is kept. Needs the kit UNPACKED OUTSIDE the repository and the headless Chromium (it resizes the pictures).
// Run: node tools/make-nature.mjs --kit=/path/to/unpacked/kit [--out=game/assets/env]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { GL_FLAGS } from './chrome.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
if (!opt.kit) { console.error('usage: node tools/make-nature.mjs --kit=/path/to/unpacked/kit'); process.exit(1); }
const KIT = opt.kit, OUT = new URL(`../${opt.out ?? 'game/assets/env'}/`, import.meta.url).pathname;

// name of the file, the kit's model, height to scale to (null: true size), texture size (default 256)
export const MODELS = [
  ['bush-a', 'Bush_Common', 1], ['bush-b', 'Bush_Common_Flowers', 1],
  ['fern', 'Fern_1', 1],
  ['plant-a', 'Plant_1', 1], ['plant-b', 'Clover_2', 1],
  ['grass-a', 'Grass_Common_Short', 1], ['grass-b', 'Grass_Wispy_Tall', 1],
  ['flowers-a', 'Flower_3_Group', 1, 256], ['flowers-b', 'Flower_4_Group', 1, 256],
  ['tree-a', 'CommonTree_5', null], ['tree-b', 'CommonTree_3', null], ['tree-c', 'CommonTree_4', null],
  ['pebble-a', 'Pebble_Round_1', null], ['pebble-b', 'Pebble_Square_3', null],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const stops = []; process.on('exit', () => stops.forEach((f) => f()));
const wp = 23000 + Math.floor(Math.random() * 2000);
const web = spawn('python3', ['-m', 'http.server', String(wp), '--bind', '127.0.0.1', '--directory', KIT], { stdio: 'ignore', detached: true });
stops.push(() => { try { process.kill(-web.pid, 'SIGKILL'); } catch {} }); await sleep(800);
const port = 24000 + Math.floor(Math.random() * 3000), profile = `/tmp/claude-1000/drift-nature-${port}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
stops.push(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} rmSync(profile, { recursive: true, force: true }); });
let target; for (let i = 0; i < 60 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Page.navigate', { url: `http://127.0.0.1:${wp}/Textures/Grass.png` }); await sleep(800);
/** A texture of the kit as a smaller picture: { bytes, mime }. */
async function smallPicture(file, size, alpha) {
  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `new Promise((res) => { const im = new Image(); im.onload = () => { const s = Math.min(${size}, im.width), c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.drawImage(im, 0, 0, s, s); res(c.toDataURL('${alpha ? 'image/webp' : 'image/jpeg'}', 0.8)); }; im.onerror = () => res(null); im.src = '/Textures/${file}'; })` });
  const url = r.result?.result?.value; if (!url) throw new Error(`cannot read ${file}`);
  return { bytes: Buffer.from(url.split(',')[1], 'base64'), mime: alpha ? 'image/webp' : 'image/jpeg' };
}

const pad4 = (b, fill = 0) => { const n = (4 - (b.length % 4)) % 4; return n ? Buffer.concat([b, Buffer.alloc(n, fill)]) : b; };
const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

async function build([name, src, height, texSize = 256]) {
  const g = JSON.parse(readFileSync(`${KIT}/glTF/${src}.gltf`, 'utf8')), bin = readFileSync(`${KIT}/glTF/${src}.bin`);
  for (const n of g.nodes) if (n.translation || n.rotation || n.scale) throw new Error(`${src}: a node with its own transform`);
  const chunks = [], views = [], accessors = [];
  const addView = (data, target) => { const off = chunks.reduce((a, c) => a + c.length, 0); const b = pad4(data); chunks.push(b); views.push({ buffer: 0, byteOffset: off, byteLength: data.length, ...(target ? { target } : {}) }); return views.length - 1; };
  const meshes = g.meshes.map((m) => ({ name: m.name, primitives: m.primitives.map((p) => {
    const attrs = {};
    for (const [k, ai] of Object.entries(p.attributes)) {
      const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], comp = TYPES[a.type], size = SIZES[a.componentType], stride = bv.byteStride ?? comp * size;
      const raw = Buffer.alloc(a.count * comp * size); for (let i = 0; i < a.count; i++) bin.copy(raw, i * comp * size, (bv.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride, (bv.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride + comp * size);
      if (k === 'COLOR_0') continue;   // the kit's vertex colour is a dark mask (it made every plant nearly black under the look's light): left out
      {
        accessors.push({ bufferView: addView(raw, 34962), componentType: a.componentType, count: a.count, type: a.type, ...(a.min ? { min: a.min, max: a.max } : {}) });
      }
      attrs[k] = accessors.length - 1;
    }
    const ia = g.accessors[p.indices], ibv = g.bufferViews[ia.bufferView], isz = SIZES[ia.componentType], ioff = (ibv.byteOffset ?? 0) + (ia.byteOffset ?? 0);
    accessors.push({ bufferView: addView(bin.subarray(ioff, ioff + ia.count * isz), 34963), componentType: ia.componentType, count: ia.count, type: 'SCALAR' });
    return { attributes: attrs, indices: accessors.length - 1, material: p.material, mode: p.mode };
  }) }));
  // the colour textures only, small
  const images = [], textures = [], materials = []; let webp = false;
  for (const m of g.materials) {
    const bc = m.pbrMetallicRoughness?.baseColorTexture, nm = { name: m.name, doubleSided: m.doubleSided ?? false, alphaMode: m.alphaMode ?? 'OPAQUE', pbrMetallicRoughness: { baseColorFactor: m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } };
    if (m.alphaCutoff !== undefined) nm.alphaCutoff = m.alphaCutoff;
    if (bc) {
      const file = g.images[g.textures[bc.index].source].uri, alpha = nm.alphaMode !== 'OPAQUE' || /Leaves|Leaf|Flowers|Grass/.test(file);
      const pic = await smallPicture(file, texSize, alpha);
      images.push({ bufferView: addView(pic.bytes), mimeType: pic.mime, name: file.replace(/\.png$/, '') }); textures.push(pic.mime === 'image/webp' ? { sampler: 0, extensions: { EXT_texture_webp: { source: images.length - 1 } } } : { source: images.length - 1, sampler: 0 }); if (pic.mime === 'image/webp') webp = true;
      nm.pbrMetallicRoughness.baseColorTexture = { index: textures.length - 1 };
    }
    materials.push(nm);
  }
  // stand on y = 0, centred on x and z, scaled to `height` (or true size)
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const m of g.meshes) for (const p of m.primitives) { const a = g.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); } }
  const k = height ? height / (mx[1] - mn[1]) : 1;
  const root = { name, children: g.scenes[0].nodes, scale: [k, k, k], translation: [(-(mn[0] + mx[0]) / 2) * k, -mn[1] * k, (-(mn[2] + mx[2]) / 2) * k] };
  const nodes = [...g.nodes, root], json = {
    asset: { version: '2.0', generator: 'tools/make-nature.mjs (Quaternius Stylized Nature MegaKit, CC0 1.0)' },
    scene: 0, scenes: [{ nodes: [nodes.length - 1] }], nodes, meshes, materials, textures, images, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    ...(webp ? { extensionsUsed: ['EXT_texture_webp'], extensionsRequired: ['EXT_texture_webp'] } : {}),
    accessors, bufferViews: views, buffers: [{ byteLength: chunks.reduce((a, c) => a + c.length, 0) }],
  };
  const jb = pad4(Buffer.from(JSON.stringify(json)), 0x20), bb = Buffer.concat(chunks), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bb.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([head, jh, jb, bh, bb]); writeFileSync(`${OUT}${name}.glb`, glb);
  return { name, src, kb: Math.round(glb.length / 1024), size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => +(v * k).toFixed(2)), scale: +k.toFixed(3) };
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const m of MODELS) { const r = await build(m); total += r.kb; console.log(`${r.name.padEnd(10)} ${String(r.kb).padStart(5)} KB  ${r.size.join(' x ')} m  (${r.src}, scale ${r.scale})`); }
console.log(`total ${total} KB`);
ws.close(); stops.forEach((f) => f()); process.exit(0);
