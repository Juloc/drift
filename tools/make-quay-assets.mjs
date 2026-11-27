// Shrinks the four Sketchfab models of the quay (game/assets/skfb/*.glb, CC BY 4.0: docs/ASSETS.md) to what view/look/quay.js loads, with smaller pictures. Repeatable: it reads the raw
// downloads (default ~/projects/drift-mockups/assets-download/sketchfab) and writes the files of the repository. What stays:
//   crane, ship, lighthouse, container, palm-pack, stand   whole (every mesh and name), pictures at most 512 px (the stand's pictures 256: dropping its normal and roughness maps doubled the difference to the raw picture, so they stay).
//   barriers.glb   the one mesh quay.js picks (of the meshes higher than 1 unit, sorted by their x size, the second: the look-up falls back to the first when only one is there). 1024 px.
//   fence-set.glb  the first mesh (the long panel with barbed wire); the alpha stays. 1024 px.
//   crowd.glb      as it is (skin and animation are needed: the figures are frozen at load).
// Pictures: opaque ones as JPEG, the one with alpha as lossless WebP (EXT_texture_webp; lossy alpha made the fence's veil lighter: measured, see docs/STATE.md). Needs headless Chromium (it resizes the pictures).
// Run: node tools/make-quay-assets.mjs [--raw=/path/to/sketchfab] [--out=game/assets/skfb]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { GL_FLAGS } from './chrome.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const RAW = opt.raw ?? `${homedir()}/projects/drift-mockups/assets-download/sketchfab`, OUT = new URL(`../${opt.out ?? 'game/assets/skfb'}/`, import.meta.url).pathname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, port = 24000 + Math.floor(Math.random() * 3000), profile = `/tmp/claude-1000/drift-quayassets-${port}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} rmSync(profile, { recursive: true, force: true }); }; process.on('exit', stop);
let target; for (let i = 0; i < 60 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
/** A picture (bytes) as a smaller one: { bytes, mime }. */
async function smaller(bytes, mime, size, alpha) {
  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => { const bin = atob('${Buffer.from(bytes).toString('base64')}'), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u], { type: '${mime}' })), s = Math.min(${size}, bmp.width), c = document.createElement('canvas'); c.width = s; c.height = Math.round(s * bmp.height / bmp.width); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('${alpha ? 'image/webp' : 'image/jpeg'}', ${alpha ? 1 : 0.85}); })()` });
  const url = r.result?.result?.value; if (!url) throw new Error('cannot shrink a picture: ' + JSON.stringify(r.result).slice(0, 200));
  return { bytes: Buffer.from(url.split(',')[1], 'base64'), mime: alpha ? 'image/webp' : 'image/jpeg' };
}

const pad4 = (b, fill = 0) => { const n = (4 - (b.length % 4)) % 4; return n ? Buffer.concat([b, Buffer.alloc(n, fill)]) : b; };
const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readGlb(file) { const b = readFileSync(file), jl = b.readUInt32LE(12), json = JSON.parse(b.toString('utf8', 20, 20 + jl)), bl = b.readUInt32LE(20 + jl); return { json, bin: b.subarray(28 + jl, 28 + jl + bl) }; }
function accessorData(g, ai) { const a = g.json.accessors[ai], bv = g.json.bufferViews[a.bufferView], comp = TYPES[a.type], size = SIZES[a.componentType], stride = bv.byteStride ?? comp * size, out = Buffer.alloc(a.count * comp * size), off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < a.count; i++) g.bin.copy(out, i * comp * size, off + i * stride, off + i * stride + comp * size); return { a, data: out }; }
const positions = (g, ai) => { const { a, data } = accessorData(g, ai); const f = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)); return { f, n: a.count }; };
const sizeOfMesh = (g, mi) => { const p = g.json.meshes[mi].primitives[0], { f, n } = positions(g, p.attributes.POSITION), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], f[i * 3 + c]); mx[c] = Math.max(mx[c], f[i * 3 + c]); } return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]; };

/** Writes a GLB with only `keepNodes` (and their ancestors); `stand` = mesh indexes that become one triangle; `maxPx` the size of every picture; `alpha` image indexes that keep alpha. */
async function write(g, keepNodes, { stand = new Set(), maxPx, alpha = new Set(), name }) {
  const J = g.json, parent = new Map(); J.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const keep = new Set(); for (const n of keepNodes) { for (let o = n; o !== undefined; o = parent.get(o)) keep.add(o); }
  const order = [...keep].sort((a, b) => a - b), nmap = new Map(order.map((n, i) => [n, i]));
  const chunks = [], views = [], accessors = [], meshes = [], mmap = new Map(), materials = [], matMap = new Map(), textures = [], texMap = new Map(), images = [];
  const addView = (data, target) => { const off = chunks.reduce((a, c) => a + c.length, 0); chunks.push(pad4(data)); views.push({ buffer: 0, byteOffset: off, byteLength: data.length, ...(target ? { target } : {}) }); return views.length - 1; };
  const tex = async (ti, px = typeof maxPx === 'function' ? maxPx('base', '') : maxPx, isAlpha = false) => {   // a texture of a material: the picture made smaller
    const key = `${ti}:${px}`; if (ti === undefined) return undefined; if (texMap.has(key)) return texMap.get(key);
    const src = J.textures[ti].source, im = J.images[src], bv = J.bufferViews[im.bufferView], bytes = g.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const a = alpha.has(src) || isAlpha, pic = await smaller(bytes, im.mimeType, px, a);
    images.push({ bufferView: addView(pic.bytes), mimeType: pic.mime }); textures.push(a ? { sampler: J.textures[ti].sampler ?? 0, extensions: { EXT_texture_webp: { source: images.length - 1 } } } : { sampler: J.textures[ti].sampler ?? 0, source: images.length - 1 });
    texMap.set(key, textures.length - 1); return textures.length - 1;
  };
  const material = async (mi, flat) => {
    if (mi === undefined) return undefined; const key = `${mi}${flat ? 'f' : ''}`; if (matMap.has(key)) return matMap.get(key);
    const m = structuredClone(J.materials[mi]), pb = m.pbrMetallicRoughness ?? {};
    if (flat) { delete pb.baseColorTexture; delete pb.metallicRoughnessTexture; delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; }   // the crown's stand-in: the colour only
    else {
      const blend = (m.alphaMode ?? 'OPAQUE') !== 'OPAQUE', size = (role) => (typeof maxPx === 'function' ? maxPx(role, m.name ?? '') : maxPx);
      // every texture reference of the material, also inside extensions (the lighthouse's old specular-glossiness form): the picture made smaller, or the map dropped when its size is 0
      const walk = async (o, role) => { if (!o || typeof o !== 'object') return;
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === 'object' && typeof v.index === 'number' && /Texture$/.test(k)) {
            const r = /^(baseColor|diffuse)/.test(k) ? 'base' : /^normal/.test(k) ? 'normal' : /^(metallicRoughness|specularGlossiness|specular)/.test(k) ? 'rough' : /^occlusion/.test(k) ? 'occlusion' : 'other', px = size(r);
            if (!px) { delete o[k]; continue; } o[k] = { ...v, index: await tex(v.index, px, blend && r === 'base') };
          } else if (v && typeof v === 'object') await walk(v, role);
        } };
      await walk(pb, 'pbr');
      for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[k]) { const r = k === 'normalTexture' ? 'normal' : k === 'occlusionTexture' ? 'occlusion' : 'other', px = size(r); if (!px) delete m[k]; else m[k] = { ...m[k], index: await tex(m[k].index, px) }; }
      if (m.extensions) await walk(m.extensions, 'ext');
      if (m.normalTexture === undefined) delete m.normalTexture;
    }
    m.pbrMetallicRoughness = pb; materials.push(m); matMap.set(key, materials.length - 1); return materials.length - 1;
  };
  const copyAccessor = (ai, target) => { const { a, data } = accessorData(g, ai); accessors.push({ bufferView: addView(data, target), componentType: a.componentType, count: a.count, type: a.type, ...(a.normalized ? { normalized: true } : {}), ...(a.min ? { min: a.min, max: a.max } : {}) }); return accessors.length - 1; };
  const useMesh = async (mi) => {
    if (mmap.has(mi)) return mmap.get(mi);
    const m = J.meshes[mi], prims = [];
    for (const p of m.primitives) {
      if (stand.has(mi)) {   // one triangle at the origin, with the attributes quay.js reads
        const tri = (arr, type, comp) => { accessors.push({ bufferView: addView(Buffer.from(arr.buffer), 34962), componentType: 5126, count: 3, type, ...(type === 'VEC3' ? { min: [0, 0, 0], max: [0.001, 0.001, 0] } : {}) }); return accessors.length - 1; };
        const pos = tri(new Float32Array([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0]), 'VEC3'), nor = tri(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 'VEC3'), uv = tri(new Float32Array([0, 0, 1, 0, 0, 1]), 'VEC2');
        accessors.push({ bufferView: addView(Buffer.from(new Uint16Array([0, 1, 2]).buffer), 34963), componentType: 5123, count: 3, type: 'SCALAR' });
        prims.push({ attributes: { POSITION: pos, NORMAL: nor, TEXCOORD_0: uv }, indices: accessors.length - 1, material: await material(p.material, true), mode: 4 });
      } else {
        const attrs = {}; for (const [k, ai] of Object.entries(p.attributes)) attrs[k] = copyAccessor(ai, 34962);
        prims.push({ attributes: attrs, ...(p.indices !== undefined ? { indices: copyAccessor(p.indices, 34963) } : {}), material: await material(p.material, false), mode: p.mode ?? 4 });
      }
    }
    meshes.push({ name: m.name, primitives: prims }); mmap.set(mi, meshes.length - 1); return meshes.length - 1;
  };
  const nodes = []; for (const n of order) { const o = { ...J.nodes[n] }; if (o.children) o.children = o.children.filter((c) => keep.has(c)).map((c) => nmap.get(c)); if (!o.children?.length) delete o.children; if (o.mesh !== undefined) o.mesh = await useMesh(o.mesh); nodes.push(o); }
  const scenes = J.scenes.map((s) => ({ ...s, nodes: s.nodes.filter((n) => keep.has(n)).map((n) => nmap.get(n)) }));
  const json = { asset: J.asset, scene: J.scene ?? 0, scenes, nodes, meshes, materials, ...(textures.length ? { textures, images, samplers: J.samplers ?? [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] } : {}), accessors, bufferViews: views, buffers: [{ byteLength: chunks.reduce((a, c) => a + c.length, 0) }],
    ...(() => { const used = new Set((J.extensionsUsed ?? []).filter((e) => e !== 'KHR_materials_pbrSpecularGlossiness' || JSON.stringify(materials).includes('pbrSpecularGlossiness'))), req = new Set(J.extensionsRequired ?? []); if (textures.some((t) => t.extensions)) { used.add('EXT_texture_webp'); req.add('EXT_texture_webp'); } return { ...(used.size ? { extensionsUsed: [...used] } : {}), ...(req.size ? { extensionsRequired: [...req] } : {}) }; })() };
  const jb = pad4(Buffer.from(JSON.stringify(json)), 0x20), bb = Buffer.concat(chunks), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bb.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([head, jh, jb, bh, bb]); writeFileSync(`${OUT}${name}.glb`, glb); return glb.length;
}
const byName = (g, re) => g.json.nodes.map((n, i) => ({ n, i })).filter(({ n }) => re.test(n.name ?? '')).map(({ i }) => i);
const report = [];

{   // the models that stay whole (every mesh, every name; only the pictures get smaller, the camera and light nodes of a file go): the harbour's, the pack's palms and the stand
  const whole = async (name, maxPx) => { const g = readGlb(`${RAW}/${name}.glb`), keep = g.json.nodes.map((n, i) => (n.mesh !== undefined ? i : -1)).filter((i) => i >= 0); report.push([name, await write(g, keep, { maxPx, name })]); };
  await whole('crane', 512); await whole('ship', 512); await whole('lighthouse', 512); await whole('container', 512);
  await whole('palm-pack', 512);   // (the fronds' alpha lossless)
  { const base = +(opt.standBase ?? 256), maps = +(opt.standMaps ?? 256); await whole('stand', (role, mat) => (role === 'base' ? (/Adverts/.test(mat) ? Math.max(512, base) : base) : maps)); }   // plain colours: small colour pictures, no normal or roughness maps
}
{   // barriers: the second of the meshes higher than 1 unit sorted by their x size (what quay.js picks), alone
  const g = readGlb(`${RAW}/barriers.glb`), J = g.json, parts = J.nodes.map((n, i) => ({ i, mesh: n.mesh })).filter((p) => p.mesh !== undefined).map((p) => ({ ...p, s: sizeOfMesh(g, p.mesh) })).filter((p) => p.s[1] > 1).sort((a, b) => a.s[0] - b.s[0]);
  const pick = parts[1] ?? parts[0]; report.push(['barriers', await write(g, [pick.i], { maxPx: 1024, name: 'barriers' })]);
}
{   // the fence: the first mesh (the long panel with barbed wire); its alpha stays
  const g = readGlb(`${RAW}/fence-set.glb`), J = g.json, first = J.nodes.findIndex((n) => n.mesh !== undefined), mat = J.meshes[J.nodes[first].mesh].primitives[0].material, alpha = new Set();
  const bc = J.materials[mat].pbrMetallicRoughness.baseColorTexture; if (bc) alpha.add(J.textures[bc.index].source);
  report.push(['fence-set', await write(g, [first], { maxPx: +(opt.fencePx ?? 1024), alpha, name: 'fence-set' })]);
}
copyFileSync(`${RAW}/crowd.glb`, `${OUT}crowd.glb`); report.push(['crowd', readFileSync(`${OUT}crowd.glb`).length]);
let total = 0; for (const [n, b] of report) { total += b; console.log(`${n.padEnd(10)} ${String(Math.round(b / 1024)).padStart(6)} KB`); }
console.log(`total ${Math.round(total / 1024)} KB`);
ws.close(); stop(); process.exit(0);
