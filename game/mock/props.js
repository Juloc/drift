// What stands on the land of the mock stage: guardrails with small lamps, chevron boards, pines (the CC0 nature kit's models near the road, plain
// cone trees as the far carpet), cherry trees (a kit trunk with faceted blossom lumps), rocks, grass and bushes at the roadside. All through the
// one light model (toon.js); every kind is one or two draw calls.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { toon } from './toon.js';
import { path, at, nearest, heightAt, riverAway, rnd, fbm, SHOULDER } from './land.js';

export function loadGlb(url) {
  const loader = new GLTFLoader();
  loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'drift_plain_images' }; });   // the app's content policy: no blob: fetches
  return loader.loadAsync(url);
}
const env = (name) => loadGlb(new URL(`../assets/env/${name}.glb`, import.meta.url).href);

/** The meshes of a kit file as { geometry (in the file's own space, standing on y = 0), material (toon, with the file's picture), height }. */
export async function kit(name, tint, mono = false) {
  const gltf = await env(name), out = [], box = new THREE.Box3().setFromObject(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (!o.isMesh) return; const m = o.material, g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.translate(0, -box.min.y, 0);
    out.push({ geometry: g, material: toon({ map: m.map, color: tint ?? 0xffffff, alphaTest: m.alphaTest || (m.transparent ? 0.5 : 0), side: m.side, soft: 0.6, rim: 0.3, paint: mono ? 'diffuseColor.rgb = diffuse * (0.55 + 1.3 * dot(diffuseColor.rgb / max(diffuse, vec3(1e-3)), vec3(0.3, 0.59, 0.11)));' : '' }) }); });
  return { parts: out, height: box.max.y - box.min.y };
}

/** places: [[x, y, z, ry, height]...] */
export function instances(k, places, name, shadow = false) {
  const group = new THREE.Group(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const part of k.parts) { const mesh = new THREE.InstancedMesh(part.geometry, part.material, places.length);
    places.forEach(([x, y, z, ry, h], i) => { const f = h / k.height; mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(up, ry), s.set(f, f, f))); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = shadow; mesh.receiveShadow = false; mesh.name = name; group.add(mesh); }
  return group;
}

export function faceted(g, r, amount) {   // moves every corner (the same way for all triangles that share it) and gives each triangle its own normal
  const n = g.toNonIndexed(), p = n.attributes.position, seen = new Map();
  for (let v = 0; v < p.count; v++) { const key = `${p.getX(v).toFixed(3)}|${p.getY(v).toFixed(3)}|${p.getZ(v).toFixed(3)}`; let j = seen.get(key); if (!j) { j = 1 + (r() - 0.5) * amount; seen.set(key, j); } p.setXYZ(v, p.getX(v) * j, p.getY(v) * j, p.getZ(v) * j); }
  n.deleteAttribute('uv'); n.computeVertexNormals(); return n;
}
export const paintGeo = (g, colour) => { const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) colour.toArray(c, i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };

function guardrails() {
  const parts = [], posts = [], lamps = [], PROFILE = [[0.0, 0.42], [0.07, 0.5], [0.0, 0.58], [0.0, 0.62], [0.07, 0.7], [0.0, 0.78]];
  for (const side of [1, -1]) {
    const pos = [], idx = [], off = side * (SHOULDER - 0.9), n = PROFILE.length;
    path.forEach((p, i) => { for (const [o, y] of PROFILE) pos.push(p.x + p.tz * (off - side * o), p.y + y, p.z - p.tx * (off - side * o));
      if (i) for (let k = 0; k < n - 1; k++) { const a = (i - 1) * n + k, b = i * n + k; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      if (i % 2 === 0) { posts.push([p.x + p.tz * (off + side * 0.08), p.y, p.z - p.tx * (off + side * 0.08)]); if (i % 6 === 0) lamps.push([p.x + p.tz * (off + side * 0.08), p.y + 0.92, p.z - p.tx * (off + side * 0.08)]); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); parts.push(g);
  }
  const group = new THREE.Group(), rail = new THREE.Mesh(mergeGeometries(parts), toon({ color: '#c9b8cf', side: THREE.DoubleSide, gloss: 0.35, soft: 0.5 })); rail.castShadow = true; rail.receiveShadow = true;
  const m = new THREE.Matrix4(), post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.86, 0.14).translate(0, 0.43, 0), toon({ color: '#8d7c96' }), posts.length);
  posts.forEach((p, i) => post.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2]))); post.castShadow = true;
  const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 3.3, 0.7), toneMapped: false }), lamps.length);
  lamps.forEach((p, i) => lamp.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])));
  group.add(rail, post, lamp); group.name = 'rails'; return group;
}

export function chevronTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#2a1436'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#ff4f9a'; c.lineWidth = 22; c.lineJoin = 'miter';
  for (const x of [52, 122, 192]) { c.beginPath(); c.moveTo(x - 24, 22); c.lineTo(x + 22, 64); c.lineTo(x - 24, 106); c.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function chevrons() {
  const tex = chevronTexture();
  const face = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.6, 2.2, 2.4), toneMapped: false }), back = toon({ color: '#4a3a5a' }), group = new THREE.Group();
  const board = (s, off, w, turn = 0) => { const p = at(s, off), g = new THREE.Group(), h = w / 2;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face); f.position.y = 0.95 + h / 2; const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08), back); b.position.set(0, 0.95 + h / 2, -0.05); b.castShadow = true;
    const legs = [-0.36, 0.36].map((k) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95 + h / 2, 0.09), back); l.position.set(k * w, (0.95 + h / 2) / 2, -0.09); return l; });
    g.add(f, b, ...legs); g.position.set(p.x, p.y, p.z); g.rotation.y = -p.th + turn; group.add(g); };
  board(41, 7.3, 3.0, -0.3);
  for (const [s, w] of [[58, 1.8], [72, 1.7], [86, 1.7], [100, 1.7]]) board(s, 7.0, w, -0.25);
  for (const [s, w] of [[150, 1.7], [190, 1.7], [230, 1.7]]) board(s, -7.0, w, 0.3);
  group.name = 'chevrons'; return group;
}

function rocks() {
  const r = rnd(41), parts = [], cA = new THREE.Color('#a47f88'), cB = new THREE.Color('#86688a');
  const rock = (x, z, size, sink = 0.35) => { const g = faceted(new THREE.IcosahedronGeometry(1, 1), r, 0.5); g.scale(size * (0.8 + r() * 0.6), size * (0.6 + r() * 0.5), size * (0.8 + r() * 0.6)); g.rotateY(r() * 6.28); g.translate(x, heightAt(x, z) + size * (0.5 - sink), z); g.computeVertexNormals(); parts.push(paintGeo(g, cA.clone().lerp(cB, r()).multiplyScalar(0.9 + r() * 0.2))); };
  for (let sP = -20; sP < 60; sP += 5 + r() * 9) { const p = at(sP, 8.6 + r() * 3.5); rock(p.x, p.z, 1.2 + r() * r() * 3.4); }           // the foot of the flank
  for (let i = 0; i < 150; i++) { const p = at(-40 + r() * 105, 12 + r() * r() * 110); rock(p.x, p.z, 1 + r() * r() * 5.5, 0.45); }                 // on the flank
  for (let i = 0; i < 40; i++) { const p = at(66 + r() * 200, 8.5 + r() * r() * 40); rock(p.x, p.z, 0.5 + r() * 1.5, 0.5); }                       // on the valley's rim
  for (const [sP, d, size] of [[52, -10, 2.3], [60, -12.5, 1.5], [45, -11, 1.2], [74, -11, 1.8], [90, -10.5, 1.3], [38, -13, 1.6], [110, -12, 2.0]]) { const p = at(sP, d); rock(p.x, p.z, size); }   // on the bank inside the bend
  const mesh = new THREE.Mesh(mergeGeometries(parts), toon({ vertexColors: true, soft: 0.25, rim: 0.4 })); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'rocks'; return mesh;
}

/** Cherry trees: where, how tall. The blossom is a cloud of faceted lumps in three pinks. */
const CHERRIES = [[27, 14, 11], [37, 19, 12], [47, 12.5, 8.5], [14, 12, 9], [57, 16, 9], [4, 18, 10], [-14, 13, 9], [62, -13, 7.5], [84, -16, 8], [48, -17, 6.5], [112, -15, 7], [100, 12, 6]].map(([sP, d, h]) => { const p = at(sP, d); return [p.x, p.z, h]; });
async function cherries() {
  const r = rnd(63), trunk = await kit('deadtree-2', '#5a3d52'), pinks = ['#f48fb9', '#ea76ab', '#f9aecb', '#dd6aa2'].map((h) => new THREE.Color(h)), parts = [], places = [];
  for (const [x, z, h] of CHERRIES) { const y = heightAt(x, z) - 0.3; places.push([x, y, z, r() * 6.28, h * 0.82]);
    const n = 10 + Math.floor(r() * 6); for (let i = 0; i < n; i++) { const a = r() * 6.28, rad = h * 0.36 * Math.sqrt(r()), size = h * (0.13 + r() * 0.12);
      const g = faceted(new THREE.IcosahedronGeometry(1, 1), r, 0.35); g.scale(size * 1.25, size * 0.9, size * 1.25); g.rotateY(r() * 6.28); g.translate(x + Math.cos(a) * rad, y + h * (0.62 + r() * 0.36) - rad * 0.25, z + Math.sin(a) * rad);
      parts.push(paintGeo(g, pinks[Math.floor(r() * pinks.length)].clone().multiplyScalar(0.92 + r() * 0.16))); } }
  // far blossom: single lumps among the woods of the valley
  for (let i = 0; i < 260; i++) { const x = -500 + r() * 1900, z = -160 - r() * 1000, y = heightAt(x, z); if (y > nearest(x, z).y - 22 || riverAway(x, z) < 24) continue; const size = 4 + r() * 5, g = faceted(new THREE.IcosahedronGeometry(1, 0), r, 0.3); g.scale(size, size * 0.8, size); g.translate(x, y + size * 0.9, z); parts.push(paintGeo(g, pinks[Math.floor(r() * 4)].clone().multiplyScalar(0.9))); }
  const blossom = new THREE.Mesh(mergeGeometries(parts), toon({ vertexColors: true, soft: 0.55, rim: 0.5 })); blossom.castShadow = true; blossom.name = 'blossom';
  const group = new THREE.Group(); group.add(instances(trunk, places, 'cherry-trunk', true), blossom); return group;
}

async function pines() {
  const r = rnd(17), group = new THREE.Group(), near = [[], [], []], far = [];
  const want = (x, z) => { const n = nearest(x, z); return Math.abs(n.d) > 9.5 && riverAway(x, z) > 26; };
  for (let i = 0; i < 900; i++) { const left = r() < 0.6, p = at(left ? -40 + r() * 110 : 20 + r() * 150, left ? 10 + r() * 120 : -(11 + r() * 60)), x = p.x, z = p.z; if (!want(x, z) || fbm(x * 0.03 + 9, z * 0.03, 2) < 0.46) continue;
    if (!left && r() < 0.5) continue;
    near[Math.floor(r() * 3)].push([x, heightAt(x, z) - 0.4, z, r() * 6.28, (left ? 9 : 10) + r() * 8]); }
  for (let i = 0; i < 14000; i++) { const x = -560 + r() * 2060, z = 100 - r() * 1380; if (!want(x, z)) continue; const nr = nearest(x, z), y = heightAt(x, z);
    if (y > nr.y - 16 || fbm(x * 0.012 + 5, z * 0.012, 3) < 0.44) continue; far.push([x, y, z, 13 + r() * 12]); }
  const kits = await Promise.all(['pine-1', 'pine-3', 'pine-5'].map((n) => kit(n)));
  kits.forEach((k, i) => group.add(instances(k, near[i], 'pine', true)));
  // the far carpet: two stacked cones a tree, in the dark green of the valley's woods
  const cone = mergeGeometries([new THREE.ConeGeometry(0.34, 0.62, 6, 1, true).translate(0, 0.69, 0), new THREE.ConeGeometry(0.44, 0.6, 6, 1, true).translate(0, 0.34, 0)]).toNonIndexed(); cone.computeVertexNormals();
  const carpet = new THREE.InstancedMesh(cone, toon({ color: '#3f6f5f', flat: true, soft: 0.6, rim: 0.5 }), far.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), k = new THREE.Color();
  far.forEach(([x, y, z, h], i) => { carpet.setMatrixAt(i, m.compose(p.set(x, y - 1, z), q, s.set(h * 0.85, h, h * 0.85))); carpet.setColorAt(i, k.set('#ffffff').multiplyScalar(0.8 + r() * 0.4)); });
  carpet.instanceMatrix.needsUpdate = true; carpet.computeBoundingSphere(); carpet.name = 'pine-carpet'; group.add(carpet);
  group.userData = { near: near.reduce((a, b) => a + b.length, 0), far: far.length };
  return group;
}

// (the valley side keeps low grass only: the view stays open)
async function roadside() {
  const r = rnd(23), group = new THREE.Group(), lists = { 'grass-a': [], 'grass-b': [], 'bush-a': [], 'plant-a': [], 'flowers-a': [] }, names = Object.keys(lists);
  for (let i = 0; i < 1500; i++) { const s = -60 + r() * 280, side = r() < 0.5 ? 1 : -1, off = side * (SHOULDER + 0.3 + r() * r() * 9), p = at(s, off), y = heightAt(p.x, p.z); if (Math.abs(y - p.y) > 6) continue;
    const n = r() < 0.72 || side < 0 ? names[Math.floor(r() * 2)] : names[2 + Math.floor(r() * 3)]; lists[n].push([p.x, y - 0.05, p.z, r() * 6.28, n.startsWith('grass') ? 0.35 + r() * 0.45 : n === 'bush-a' ? 0.8 + r() * 0.9 : 0.4 + r() * 0.4]); }
  const kits = await Promise.all(names.map((n) => n === 'bush-a' ? kit(n, '#6f9050', true) : kit(n)));
  kits.forEach((k, i) => group.add(instances(k, lists[names[i]], names[i])));
  return group;
}

export async function buildProps() {
  const group = new THREE.Group(); group.name = 'props';
  group.add(guardrails(), chevrons(), rocks());
  const [c, p, g] = await Promise.all([cherries(), pines(), roadside()]);
  group.add(c, p, g); group.userData = p.userData;
  return group;
}
