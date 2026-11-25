// The Nissan Silvia S15 as a showpiece, built by code (no file, no download). Retro and modern: clean, slightly rounded surfaces, sharp edges where a
// car has them, and materials you can tell apart: clearcoat paint, dark tinted glass, chrome and aluminium, matt rubber with a lighter sidewall,
// carbon (a small weave texture made here), matt black plastic, and lights that glow. No logos or emblems: shapes only (docs/ASSETS.md).
// Drift look: lowered, a wider track with fender flares, a little negative camber, and a body kit (front lip, skirts, diffuser, GT wing) as an option.
// Tiers: `high` uses MeshPhysicalMaterial (clearcoat) and finer geometry, `low` (phones) MeshStandardMaterial and coarser geometry.
// Front is +z, the ground is y = 0, the wheel centres are at (+-0.80, 0.335, +-1.27).
import * as THREE from '../../vendor/three/three.module.js';
import { roundedBox } from '../core/roundbox.js';

const TAU = Math.PI * 2;
const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
export const S15 = { wheelX: 0.8, wheelZ: 1.27, wheelY: 0.358, length: 4.5, width: 1.8, camber: 0.07 };

// ---------- geometry helpers
function catmull(a, t) {
  const n = a.length, i = Math.min(n - 2, Math.floor(t)), f = t - i;
  const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(n - 1, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

/** A smooth shell along z through control stations { z, w (half width), yb, yt (bottom and top), e (squareness of the section) }, with closed ends. */
function loft(stations, samples, ring, keep = null) {
  const key = (k) => stations.map((s) => s[k]);
  const pos = [], idx = [], uv = [], info = [];
  for (let k = 0; k < samples; k++) {
    const u = (k / (samples - 1)) * (stations.length - 1);
    const z = catmull(key('z'), u), w = catmull(key('w'), u), yb = catmull(key('yb'), u), yt = catmull(key('yt'), u), e = catmull(key('e'), u);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * TAU, c = Math.cos(a), s = Math.sin(a);
      const x = w * sgnPow(c, 2 / e), y = (yb + yt) / 2 + ((yt - yb) / 2) * sgnPow(s, 2 / e);
      pos.push(x, y, z); uv.push(x * 0.5 + 0.5, z * 0.25);
    }
    info.push({ z, w });
  }
  for (let k = 0; k < samples - 1; k++) for (let j = 0; j < ring; j++) {
    const a = k * ring + j, b = k * ring + ((j + 1) % ring), c = (k + 1) * ring + j, d = (k + 1) * ring + ((j + 1) % ring);
    if (keep) {   // only some of the quads (a window, a pillar): the test sees the middle of the quad as a position and an angle
      const ang = ((j + 0.5) / ring) * TAU, zc = (info[k].z + info[k + 1].z) / 2;
      const yc = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4;
      if (!keep({ z: zc, y: yc, s: Math.sin(ang), c: Math.cos(ang) })) continue;
    }
    idx.push(a, c, b, b, c, d);
  }
  if (!keep) for (const [k, flip] of [[0, true], [samples - 1, false]]) {   // closed ends: a fan to the middle of the last ring
    let cx = 0, cy = 0, cz = 0; for (let j = 0; j < ring; j++) { cx += pos[(k * ring + j) * 3]; cy += pos[(k * ring + j) * 3 + 1]; cz += pos[(k * ring + j) * 3 + 2]; }
    const m = pos.length / 3; pos.push(cx / ring, cy / ring, cz / ring); uv.push(0.5, 0.5);
    for (let j = 0; j < ring; j++) { const a = k * ring + j, b = k * ring + ((j + 1) % ring); idx.push(...(flip ? [m, b, a] : [m, a, b])); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Moves, turns and scales a copy of a geometry. */
function T(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
  return g;
}
const colour = (g, hex, k = 1) => {
  const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(hex).multiplyScalar(k);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const box = (w, h, d, r = 0, seg = 1) => (r > 0 ? roundedBox(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d));

/** Merges geometries into one (positions, normals, uv, colours when every part has them, index). */
function merge(list) {
  if (!list.length) return null;
  const withColour = list.every((g) => g.attributes.color);
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = withColour ? new Float32Array(n * 3) : null;
  const idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) col.set(g.attributes.color.array, o * 3);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + o; else for (let i = 0; i < c; i++) idx[oi++] = i + o;
    o += c;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

/** A small carbon weave (twill) drawn here: no file. */
function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#0c0d0f'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const lit = (i + j) % 2 === 0, g = x.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8);
    g.addColorStop(0, lit ? '#2b2e33' : '#15171a'); g.addColorStop(1, lit ? '#15171a' : '#2b2e33');
    x.fillStyle = g; x.fillRect(i * 8 + 0.5, j * 8 + 0.5, 7, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- the materials
export function s15Materials({ tier = 'high', paint = 0x1d3f8a, env = null } = {}) {
  const high = tier === 'high';
  const M = (cls, o) => new cls({ ...(env ? { envMap: env } : {}), ...o });
  return {
    paint: high
      ? M(THREE.MeshPhysicalMaterial, { color: paint, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 })
      : M(THREE.MeshStandardMaterial, { color: paint, metalness: 0.45, roughness: 0.32, envMapIntensity: 1.0 }),
    glass: M(THREE.MeshStandardMaterial, { color: 0x04070b, metalness: 0.0, roughness: 0.06, envMapIntensity: 0.35 }),   // tinted: dark, with the room in it at a glancing angle
    chrome: M(THREE.MeshStandardMaterial, { color: 0xe3e7ee, metalness: 1, roughness: 0.1, envMapIntensity: 1.3 }),
    rubber: M(THREE.MeshStandardMaterial, { vertexColors: true, metalness: 0, roughness: 0.92 }),
    plastic: M(THREE.MeshStandardMaterial, { color: 0x14161a, metalness: 0, roughness: 0.82, envMapIntensity: 0.4 }),
    carbon: high
      ? M(THREE.MeshPhysicalMaterial, { map: carbonTexture(), metalness: 0.25, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 0.9 })
      : M(THREE.MeshStandardMaterial, { map: carbonTexture(), metalness: 0.25, roughness: 0.42, envMapIntensity: 0.8 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),   // they glow: unlit, brighter than white
  };
}

// ---------- one wheel: a tyre with a lighter sidewall (rubber) and an alloy wheel (chrome), outward is +x
function wheelGeometries(lite) {
  const seg = lite ? 16 : 44, rim = [], rub = [];
  const R = 0.335;
  // tyre: a lathe of the section (radius, along the axis), 205 wide
  const prof = [[0.215, -0.1], [0.262, -0.106], [0.312, -0.098], [0.332, -0.06], [R, -0.02], [R, 0.02], [0.332, 0.06], [0.312, 0.098], [0.262, 0.106], [0.215, 0.1]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.LatheGeometry(prof, seg).rotateZ(Math.PI / 2);
  const p = tyre.attributes.position, n = p.count, cols = new Float32Array(n * 3), dark = new THREE.Color(0x121316), side = new THREE.Color(0x2b2d33);
  for (let i = 0; i < n; i++) { const rad = Math.hypot(p.getY(i), p.getZ(i)), c = rad > 0.322 ? dark : side; cols.set([c.r, c.g, c.b], i * 3); }
  tyre.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  rub.push(tyre);
  rub.push(colour(new THREE.CylinderGeometry(0.17, 0.17, 0.018, lite ? 14 : 24).rotateZ(Math.PI / 2).translate(0.02, 0, 0), 0x4a4d54));   // the brake disc behind the spokes
  // alloy: barrel, lip, ten spokes (five on a phone), a centre cap
  rim.push(new THREE.CylinderGeometry(0.236, 0.236, 0.17, lite ? 14 : 28, 1, true).rotateZ(Math.PI / 2));
  if (!lite) rim.push(new THREE.TorusGeometry(0.238, 0.013, 6, 28).rotateY(Math.PI / 2).translate(0.088, 0, 0));
  const spokes = lite ? 5 : 10;
  for (let k = 0; k < spokes; k++) rim.push(new THREE.BoxGeometry(0.022, 0.22, lite ? 0.06 : 0.036).translate(0, 0.115, 0).rotateX((k / spokes) * TAU).translate(0.062, 0, 0));
  rim.push(new THREE.CylinderGeometry(0.05, 0.05, 0.03, lite ? 10 : 18).rotateZ(Math.PI / 2).translate(0.078, 0, 0));
  for (const g of rim) if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const g of rub) if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return { rubber: merge(rub.map((g) => (g.attributes.color ? g : colour(g, 0x777777)))), alloy: merge(rim) };
}

// ---------- the car
/**
 * @param {{ paint?: number, kit?: boolean, tier?: 'high'|'low', env?: THREE.Texture|null }} o
 * @returns {{ group: THREE.Group, wheels: {pivot: THREE.Group, spin: THREE.Group, front: boolean, left: boolean}[], setWheels: (steer:number, spin:number)=>void, triangles: number, drawCalls: number, dispose: ()=>void }}
 */
export function buildS15({ paint = 0x1d3f8a, kit = false, tier = 'high', env = null } = {}) {
  const lite = tier !== 'high';
  const mats = s15Materials({ tier, paint, env });
  if (typeof location !== 'undefined' && /[?&]debug=colors/.test(location.search)) { mats.glass.color.set(0xff0000); mats.glass.metalness = 0; mats.glass.envMapIntensity = 0; }   // to see which quads are glass
  const parts = { paint: [], glass: [], chrome: [], plastic: [], carbon: [], lights: [] };
  const add = (name, g) => parts[name].push(g);
  const samples = lite ? 22 : 40, ring = lite ? 12 : 20;

  // the body: a smooth shell through twelve stations (rear to front); slightly lowered, flared at the arches
  const body = [
    { z: -2.27, w: 0.5, yb: 0.4, yt: 0.78, e: 3 }, { z: -2.2, w: 0.7, yb: 0.31, yt: 0.84, e: 3.6 }, { z: -2.0, w: 0.8, yb: 0.25, yt: 0.88, e: 4 },
    { z: -1.6, w: 0.9, yb: 0.22, yt: 0.89, e: 4.4 }, { z: -1.2, w: 0.9, yb: 0.2, yt: 0.88, e: 4.4 }, { z: -0.4, w: 0.88, yb: 0.2, yt: 0.87, e: 4.4 },
    { z: 0.6, w: 0.88, yb: 0.2, yt: 0.865, e: 4.4 }, { z: 1.2, w: 0.9, yb: 0.2, yt: 0.8, e: 4.2 }, { z: 1.7, w: 0.84, yb: 0.21, yt: 0.72, e: 3.8 },
    { z: 2.05, w: 0.77, yb: 0.25, yt: 0.64, e: 3.4 }, { z: 2.2, w: 0.68, yb: 0.29, yt: 0.58, e: 3.1 }, { z: 2.27, w: 0.5, yb: 0.32, yt: 0.53, e: 2.8 }, { z: 2.3, w: 0.2, yb: 0.37, yt: 0.48, e: 2.6 },
  ];
  add('paint', loft(body, samples, ring));
  // where the side of the body is at a height and a place along it (the section is a superellipse), so that details sit on the surface and not in the air
  const zs = body.map((b) => b.z);
  const uAt = (z) => { let lo = 0, hi = body.length - 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (catmull(zs, m) < z) lo = m; else hi = m; } return (lo + hi) / 2; };
  const sideAt = (z, y) => {
    const u = uAt(z), w = catmull(body.map((b) => b.w), u), yb = catmull(body.map((b) => b.yb), u), yt = catmull(body.map((b) => b.yt), u), e = catmull(body.map((b) => b.e), u);
    const n = Math.min(0.999, Math.abs((y - (yb + yt) / 2) / ((yt - yb) / 2)));
    return w * Math.pow(Math.max(0, 1 - Math.pow(n, e)), 1 / e);
  };

  // the greenhouse: dark glass all round, a body-coloured roof slab and pillars on top of it
  const cabin = [
    { z: -1.15, w: 0.72, yb: 0.84, yt: 0.9, e: 3 }, { z: -0.85, w: 0.7, yb: 0.84, yt: 1.08, e: 3 }, { z: -0.5, w: 0.68, yb: 0.84, yt: 1.2, e: 3.1 },
    { z: -0.1, w: 0.68, yb: 0.84, yt: 1.225, e: 3.1 }, { z: 0.2, w: 0.68, yb: 0.83, yt: 1.18, e: 3.1 }, { z: 0.45, w: 0.7, yb: 0.82, yt: 1.0, e: 3 }, { z: 0.64, w: 0.73, yb: 0.81, yt: 0.86, e: 3 },
  ];
  // windows and frame come from the same shell: a quad is glass when it is above the belt, off the roof panel and away from the pillars
  const cs = lite ? 16 : 28, cr = lite ? 12 : 20;
  const roofPanel = (q) => q.z > -0.8 && q.z < 0.26 && q.s > 0.76;
  const sideWall = (q) => Math.abs(q.c) > 0.84 && q.z > -1.05 && q.z < 0.36 && !(q.z > -0.2 && q.z < -0.1);   // the door and quarter windows, a post between them
  const screens = (q) => Math.abs(q.c) < 0.5 && (q.z > 0.26 || q.z < -0.8);                                    // windscreen and rear window
  const visible = (q) => q.y > 0.9;   // above the top of the body
  const isGlass = (q) => visible(q) && !roofPanel(q) && (sideWall(q) || screens(q));   // the rest (roof, the corner strips = pillars and roof rails, posts) is paint
  add('glass', loft(cabin, cs, cr, isGlass));
  add('paint', loft(cabin, cs, cr, (q) => visible(q) && !isGlass(q)));
  // arches: a dark well and a flared lip over each wheel (painted, wider in the kit)
  const lipGeo = (R, t) => new THREE.TorusGeometry(R, t, 6, lite ? 10 : 18, Math.PI).rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add('paint', T(lipGeo(kit ? 0.44 : 0.41, kit ? 0.05 : 0.03), { x: sx * 0.9, y: S15.wheelY, z: sz * S15.wheelZ }));
  }

  // seams and details in matt black: door gaps, sills, the hood line, the grille and the lower intake
  for (const s of [-1, 1]) {
    add('plastic', T(box(0.006, 0.17, 0.006), { x: s * (sideAt(-0.52, 0.75) + 0.001), y: 0.75, z: -0.52 }));     // door gaps
    add('plastic', T(box(0.006, 0.17, 0.006), { x: s * (sideAt(0.34, 0.75) + 0.001), y: 0.75, z: 0.34 }));
    add('plastic', T(box(0.07, 0.07, 0.12, 0.02), { x: s * 0.94, y: 0.93, z: 0.42, rx: 0, ry: s * 0.15 }));   // mirror
    add('chrome', T(box(0.012, 0.025, 0.1, 0.005), { x: s * (sideAt(-0.2, 0.78) + 0.004), y: 0.78, z: -0.2 }));   // door handle
    add('chrome', T(new THREE.CylinderGeometry(0.045, 0.045, 0.16, lite ? 8 : 14).rotateX(Math.PI / 2), { x: s * 0.46, y: 0.3, z: -2.27 }));   // exhaust tips
    add('plastic', T(new THREE.CylinderGeometry(0.036, 0.036, 0.17, lite ? 8 : 12).rotateX(Math.PI / 2), { x: s * 0.46, y: 0.3, z: -2.26 }));
  }
  add('plastic', T(box(0.9, 0.1, 0.02, 0.01), { y: 0.55, z: -2.27 }));                 // rear panel between the lamps
  add('plastic', T(box(0.7, 0.07, 0.03, 0.015), { y: 0.37, z: 2.17, rx: -0.2 }));       // lower intake
  add('plastic', T(box(0.6, 0.05, 0.03, 0.012), { y: 0.5, z: 2.23, rx: -0.2 }));       // grille slot
  add('plastic', T(box(1.2, 0.03, 0.03, 0.01), { y: 0.33, z: -2.22 }));                 // rear valance

  // lights: the headlamps are slim and angular, the tail lamps a red bar each with a clear inner part
  for (const s of [-1, 1]) {
    add('plastic', T(box(0.24, 0.07, 0.04, 0.015), { x: s * 0.57, y: 0.645, z: 2.0, ry: s * -0.42, rx: -0.2 }));
    add('lights', colour(T(box(0.22, 0.05, 0.03, 0.01), { x: s * 0.575, y: 0.625, z: 2.03, ry: s * -0.42, rx: -0.2 }), 0xfff3d6, 3.2));
    add('plastic', T(box(0.44, 0.1, 0.03, 0.015), { x: s * 0.56, y: 0.79, z: -2.19, ry: s * 0.25 }));
    add('lights', colour(T(box(0.4, 0.085, 0.03, 0.01), { x: s * 0.56, y: 0.79, z: -2.235, ry: s * 0.25 }), 0xff2a1c, 2.6));
    add('lights', colour(T(box(0.1, 0.06, 0.03), { x: s * 0.3, y: 0.79, z: -2.245 }), 0xffe8d0, 1.8));                       // the reverse light
  }
  add('lights', colour(T(box(0.74, 0.03, 0.03), { y: 0.8, z: -2.24 }), 0xff2a1c, 1.5));                                       // the bar between the tail lamps

  // the body kit (optional): front lip, skirts, diffuser with fins, a GT wing on two posts
  if (kit) {
    add('carbon', T(box(1.62, 0.04, 0.34, 0.015), { y: 0.27, z: 2.18, rx: -0.1 }));
    add('carbon', T(box(1.56, 0.03, 0.12, 0.01), { y: 0.31, z: 2.34, rx: 0.2 }));
    for (const s of [-1, 1]) {
      add('carbon', T(box(0.05, 0.08, 1.7, 0.02), { x: s * 0.88, y: 0.27, z: -0.05 }));
      add('carbon', T(box(0.04, 0.12, 0.26, 0.01), { x: s * 0.62, y: 0.3, z: -2.26 }));
      add('carbon', T(box(0.04, 0.45, 0.08, 0.01), { x: s * 0.5, y: 1.08, z: -2.0, rx: 0.1 }));             // wing posts
      add('carbon', T(box(0.025, 0.14, 0.3, 0.008), { x: s * 0.75, y: 1.3, z: -2.06 }));                     // end plates
    }
    add('carbon', T(box(1.5, 0.03, 0.3, 0.012), { y: 1.31, z: -2.06, rx: -0.14 }));
    add('carbon', T(box(0.9, 0.05, 0.3, 0.012), { y: 0.34, z: -2.18, rx: 0.35 }));
  }

  // assemble: one mesh per material
  const group = new THREE.Group();
  group.name = 'S15';
  const meshes = [];
  let triangles = 0;
  for (const [name, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = merge(list.map((g) => (g.attributes.uv ? g : (g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)), g))));
    const m = new THREE.Mesh(geo, mats[name]);
    m.castShadow = name !== 'lights'; m.receiveShadow = name === 'paint' || name === 'carbon';
    group.add(m); meshes.push(m); triangles += geo.index.count / 3;
  }

  // wheels: pivot (steering) > camber > spin > two meshes; the left wheels are mirrored
  const w = wheelGeometries(lite), wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pivot = new THREE.Group(), camber = new THREE.Group(), spin = new THREE.Group(), flip = new THREE.Group();
    pivot.position.set(sx * S15.wheelX, S15.wheelY, sz * S15.wheelZ);
    camber.rotation.z = sx * S15.camber;
    flip.rotation.y = sx < 0 ? Math.PI : 0;
    const rubber = new THREE.Mesh(w.rubber, mats.rubber), alloy = new THREE.Mesh(w.alloy, mats.chrome);
    rubber.castShadow = alloy.castShadow = true;
    flip.add(rubber, alloy); spin.add(flip); camber.add(spin); pivot.add(camber); group.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0, left: sx < 0 });
    triangles += (w.rubber.index.count + w.alloy.index.count) / 3;
  }
  const setWheels = (steer, spinAngle) => { for (const wh of wheels) { wh.pivot.rotation.y = wh.front ? -steer : 0; wh.spin.rotation.x = wh.left ? -spinAngle : spinAngle; } };
  const drawCalls = meshes.length + wheels.length * 2;
  return {
    group, wheels, setWheels, triangles: Math.round(triangles), drawCalls, materials: mats,
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); for (const m of Object.values(mats)) { m.map?.dispose?.(); m.dispose(); } },
  };
}
