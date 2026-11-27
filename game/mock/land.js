// The land of the mock stage (the mountain pass at sunset): a road on a ledge that bends right, a rock slope on its left, the drop into a wide
// valley with a river, a lake, wooded hills and rings of faceted mountains behind. Everything is made from a height function and a few colours;
// the facets are real (every triangle has its own normal), the softness comes from the light model and the haze (toon.js).
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { toon, shared, HAZE_PARS } from './toon.js';

export const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const h2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h2(xi, zi) * (1 - u) + h2(xi + 1, zi) * u) * (1 - v) + (h2(xi, zi + 1) * (1 - u) + h2(xi + 1, zi + 1) * u) * v; };
export const fbm = (x, z, o = 4) => { let a = 0.5, s = 0; for (let i = 0; i < o; i++) { s += a * vn(x, z); x = x * 2.03 + 7.1; z = z * 2.03 + 3.7; a *= 0.5; } return s; };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the road's centre line: from behind the camera straight ahead (towards -z), then a long right-hander, then away to the right
export const HALF = 4.6, SHOULDER = 6.4;
const yAt = (s) => (s > 0 ? -0.048 * s + 0.00006 * s * s : 0);   // the road falls away towards the bend
export const path = (() => {
  const pts = [], STEP = 2; let x = 0, z = 70, th = 0, s = -70;
  const push = () => pts.push({ x, z, s, tx: Math.sin(th), tz: -Math.cos(th), y: yAt(s) });
  for (; z > -16; z -= STEP, s += STEP) push();
  const R = 66; for (let a = 0; a < 1.3; a += STEP / R, s += STEP) { th = a; push(); x += Math.sin(th) * STEP; z -= Math.cos(th) * STEP; }
  for (let i = 0; i < 150; i++, s += STEP) { th = 1.3 - 0.5 * ss(10, 90, i) + 0.3 * ss(100, 150, i); push(); x += Math.sin(th) * STEP; z -= Math.cos(th) * STEP; }
  return pts;
})();
/** The road's nearest point: { d (metres from the centre line, left of the driving direction positive), s, y, i }. */
export function nearest(x, z) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < path.length; i++) { const p = path[i], dx = x - p.x, dz = z - p.z, q = dx * dx + dz * dz; if (q < best) { best = q; bi = i; } }
  const p = path[bi], side = (x - p.x) * p.tz - (z - p.z) * p.tx;
  const sx = p.s + (x - p.x) * p.tx + (z - p.z) * p.tz;                                       // along the road, to the centimetre (the height must not step)
  return { d: Math.sqrt(best) * (side >= 0 ? 1 : -1), s: sx, y: yAt(Math.min(sx, path[path.length - 1].s)), i: bi };
}
export const at = (s, off = 0) => { const f = Math.min(path.length - 1.001, Math.max(0, (s + 70) / 2)), i = Math.floor(f), t = f - i, p = path[i], q = path[i + 1], tx = p.tx + (q.tx - p.tx) * t, tz = p.tz + (q.tz - p.tz) * t;
  return { x: p.x + (q.x - p.x) * t + tz * off, z: p.z + (q.z - p.z) * t - tx * off, y: p.y + (q.y - p.y) * t, tx, tz, th: Math.atan2(tx, -tz) }; };

// ---- the height of the land
const VALLEY = -44;
const HILLS = [[-150, -560, 180, 130, 60], [260, -700, 200, 150, 70], [640, -800, 220, 160, 80], [-430, -720, 220, 170, 96], [1000, -940, 260, 200, 110], [60, -960, 240, 170, 90], [1320, -620, 240, 180, 90], [470, -470, 120, 90, 28]];
/** The river runs across the view, a few hundred metres beyond the bend: its z at x, and a place's distance from it. */
export const riverZ = (x) => -340 - 0.4 * x + 70 * Math.sin(x / 170 + 0.9) + 26 * Math.sin(x / 67);
export const riverAway = (x, z) => Math.abs(z - riverZ(x)) * 0.93;
/** The land away from the road: a rock flank on the left as far as the bend; from there the outside of the bend looks into the valley. Inside the bend lies a low bank. */
function wild(x, z, dR, right, s) {
  const flank = right ? 0 : 1 - ss(34, 74, s);
  let h = flank * (30 * ss(3, 46, dR) + 34 * ss(46, 190, dR) + 60 * ss(190, 600, dR));
  if (right) h += -1.6 * ss(0, 5, dR - SHOULDER) - 7 * ss(12, 60, dR) + 5 * Math.exp(-(((dR - 26) / 14) ** 2)) + VALLEY * 0.85 * ss(70, 240, dR);
  else { const v = 1 - flank; h += v * (VALLEY * ss(4, 78, dR) - 2.4 * ss(0, 5, dR - SHOULDER));
    const far = v * ss(70, 170, dR); for (const [hx, hz, rx, rz, hh] of HILLS) h += far * hh * Math.exp(-(((x - hx) / rx) ** 2 + ((z - hz) / rz) ** 2)); }
  h += (fbm(x * 0.03, z * 0.03) - 0.5) * (flank > 0.5 ? 16 : 9) * ss(8, 45, dR) + (fbm(x * 0.11, z * 0.11, 3) - 0.5) * 3.2 * ss(7, 20, dR);
  if (h < VALLEY + 30) { const rv = riverAway(x, z); h = Math.min(h, VALLEY - 1.5 + 10 * ss(18, 70, rv) + (h - VALLEY) * ss(20, 90, rv)); }   // the river's bed
  return h;
}
export function heightAt(x, z) {
  const n = nearest(x, z), ad = Math.abs(n.d);
  if (ad <= SHOULDER) return n.y - 0.2;
  const w = n.d > 0 && n.s < 50 ? 3.5 : 10;                                                  // a steep cut on the rock side, a rounder edge elsewhere
  const t = ss(SHOULDER, SHOULDER + w, ad);
  return (n.y - 0.2) * (1 - t) + (n.y + wild(x, z, ad, n.d < 0, n.s)) * t;
}

// ---- colours of the land (before the light)
const C = { grass: new THREE.Color('#7f9647'), grassDry: new THREE.Color('#a39a4c'), rock: new THREE.Color('#9a7480'), rockDark: new THREE.Color('#7a5d76'), floor: new THREE.Color('#55805a'), wood: new THREE.Color('#3f6b58'), gravel: new THREE.Color('#a78d95') };

function landMesh() {
  const r = rnd(77), axis = (from, to, mid) => { const out = [from]; while (out[out.length - 1] < to) { const v = out[out.length - 1]; out.push(v + 2.6 + 13 * ss(70, 460, Math.abs(v - mid))); } return out; };
  const xs = axis(-560, 1500, 20), zs = axis(-1300, 160, -40), nx = xs.length - 1, nz = zs.length - 1;
  const P = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = xs[i], z = zs[j]; const sx = (xs[Math.min(nx, i + 1)] - xs[Math.max(0, i - 1)]) / 2, sz = (zs[Math.min(nz, j + 1)] - zs[Math.max(0, j - 1)]) / 2;
    if (Math.abs(nearest(x, z).d) > SHOULDER + 1) { x += (r() - 0.5) * sx * 0.7; z += (r() - 0.5) * sz * 0.7; } else { r(); r(); }
    const k = (j * (nx + 1) + i) * 3; P[k] = x; P[k + 1] = heightAt(x, z); P[k + 2] = z;
  }
  const pos = [], col = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), k = new THREE.Color();
  const tri = (ia, ib, ic) => {
    a.fromArray(P, ia * 3); b.fromArray(P, ib * 3); c.fromArray(P, ic * 3); n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3, nr = nearest(cx, cz), rel = cy - nr.y, ad = Math.abs(nr.d);
    k.copy(C.grass).lerp(C.grassDry, fbm(cx * 0.02, cz * 0.02, 2));
    if (rel < -30) k.lerp(C.floor, ss(-30, -48, rel)).lerp(C.wood, 0.55 * ss(0.45, 0.6, fbm(cx * 0.012 + 5, cz * 0.012, 3)));
    { const rk = ss(0.86, 0.68, n.y); k.lerp(r() > 0.5 ? C.rock : C.rockDark, rk).multiplyScalar(1 + rk * (r() - 0.5) * 0.3); }
    if (ad < SHOULDER + 2.5) k.lerp(C.gravel, ss(SHOULDER + 2.5, SHOULDER, ad));
    k.multiplyScalar(0.93 + r() * 0.14);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); for (let q = 0; q < 3; q++) col.push(k.r, k.g, k.b);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const p = j * (nx + 1) + i, q = p + nx + 1; if ((i + j) & 1) { tri(p, q, p + 1); tri(p + 1, q, q + 1); } else { tri(p, q, q + 1); tri(p, q + 1, p + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, toon({ vertexColors: true, soft: 0.3, rim: 0.25 })); mesh.receiveShadow = true; mesh.name = 'land';
  return mesh;
}

/** The asphalt: `uv.x` is metres from the centre line, `uv.y` metres along the road. Lines, worn patches, wheel tracks and a gravel shoulder are painted from those. */
export function roadMaterial() {
  return toon({ color: 0xffffff, gloss: 0.4, rim: 0.0, soft: 0.5,
    pars: /* glsl */ `float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1.0, 0.0)), f.x), mix(rh(i + vec2(0.0, 1.0)), rh(i + vec2(1.0, 1.0)), f.x), f.y); }`,
    paint: /* glsl */ `{ float u = vUv2.x, au = abs(u), s = vUv2.y;
      float big = rn(vec2(u * 0.35, s * 0.08)), grain = rn(vec2(u * 9.0, s * 9.0)), wear = rn(vec2(u * 1.7, s * 0.5));
      vec3 c = vec3(0.335, 0.285, 0.38) * (0.92 + 0.12 * big + 0.05 * grain);
      c *= 1.0 - 0.07 * (smoothstep(0.75, 0.15, abs(au - 2.3)) );                                   // the lanes' wheel tracks, a shade darker
      c = mix(c, vec3(0.42, 0.36, 0.45), 0.5 * smoothstep(0.62, 0.8, rn(vec2(u * 0.22 + 3.0, s * 0.045))));   // lighter patches
      float edge = smoothstep(0.1, 0.06, abs(au - 4.12)) * (0.55 + 0.45 * smoothstep(0.25, 0.55, wear));
      c = mix(c, vec3(0.93, 0.88, 0.9), edge);
      float dash = smoothstep(0.085, 0.055, abs(u)) * step(fract(s / 9.0), 0.36) * (0.6 + 0.4 * smoothstep(0.2, 0.5, wear));
      c = mix(c, vec3(0.98, 0.7, 0.26), dash);
      c = mix(c, vec3(0.6, 0.5, 0.55) * (0.85 + 0.3 * grain), smoothstep(4.45, 4.75, au));         // the gravel shoulder
      diffuseColor.rgb = c; }` });
}

function roadMesh() {
  const pos = [], uv = [], idx = [], W = SHOULDER + 0.6;
  path.forEach((p, i) => { for (const o of [-W, W]) { pos.push(p.x + p.tz * o, p.y + (Math.abs(o) > HALF ? -0.03 : 0), p.z - p.tx * o); uv.push(o, p.s); } if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const mat = roadMaterial();
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.name = 'road';
  return mesh;
}

/** Old tyre marks: thin dark ribbons that swing across the lanes through the bend. `extra`: [{ pts: [[x, z]...], w, a }] lays more (the car's own). */
function tyreMarks(extra = []) {
  const pos = [], al = [], idx = [], r = rnd(5);
  const ribbon = (pts, w, alpha) => { const base = pos.length / 3;
    pts.forEach(([x, z], i) => { const q = pts[Math.min(pts.length - 1, i + 1)], p = pts[Math.max(0, i - 1)]; let tx = q[0] - p[0], tz = q[1] - p[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const y = nearest(x, z).y + 0.012, f = Math.min(1, i / 4, (pts.length - 1 - i) / 4) * alpha;
      pos.push(x + tz * w, y, z - tx * w, x - tz * w, y, z + tx * w); al.push(f, f);
      if (i) { const k = base + i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } }); };
  for (let m = 0; m < 9; m++) {
    const s0 = -30 + r() * 150, len = 30 + r() * 60, off = (r() - 0.5) * 5, amp = 0.8 + r() * 1.8, ph = r() * 6, a = 0.25 + r() * 0.4;
    for (const tw of [-0.75, 0.75]) { const pts = []; for (let s = s0; s < s0 + len; s += 2) { const p = at(s, off + tw + amp * Math.sin((s - s0) / len * 3.1 + ph)); pts.push([p.x, p.z]); } ribbon(pts, 0.1, a * 0.8); }
  }
  for (const e of extra) ribbon(e.pts, e.w ?? 0.15, e.a ?? 0.8);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('alpha', new THREE.Float32BufferAttribute(al, 1)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ uniforms: shared, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
    vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(0.07, 0.045, 0.1, vA); }' });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'marks'; mesh.renderOrder = 1; return mesh;
}

/** Rings of faceted peaks round the valley; the haze makes the far ones pale. */
export function mountains(cx = 0, cz = 0, base = VALLEY - 20) {
  const r = rnd(31), parts = [], RINGS = [[900, 1150, 34, 150, 300, '#5f4f98'], [1500, 1900, 40, 260, 520, '#5b4d96'], [2500, 3000, 44, 420, 760, '#584b93'], [3900, 4500, 46, 620, 1000, '#554990']];
  for (const [r0, r1, n, h0, h1, hex] of RINGS) for (let i = 0; i < n; i++) {
    const az = (i + r() * 0.8) / n * Math.PI * 2, R = r0 + r() * (r1 - r0), h = h0 + r() * r() * (h1 - h0) * 1.3, rad = h * (1.1 + r() * 0.9);
    if (Math.abs(az - 0.72) < 0.2 && R < 3500) continue;                                                   // the valley stays open towards the sun
    const g = new THREE.ConeGeometry(rad, h, 7, 3, true).toNonIndexed(), p = g.attributes.position, seen = new Map();
    for (let v = 0; v < p.count; v++) { const key = `${p.getX(v).toFixed(1)}|${p.getY(v).toFixed(1)}|${p.getZ(v).toFixed(1)}`; let j = seen.get(key); if (!j) { const top = p.getY(v) > h * 0.49; j = top ? [0, 0, 0] : [(r() - 0.5) * rad * 0.34, (r() - 0.5) * h * 0.16, (r() - 0.5) * rad * 0.34]; seen.set(key, j); } p.setXYZ(v, p.getX(v) + j[0], p.getY(v) + j[1], p.getZ(v) + j[2]); }
    g.rotateY(r() * 6.28); g.translate(cx + Math.sin(az) * R, base + h / 2, cz - Math.cos(az) * R); g.computeVertexNormals();
    const k = new THREE.Color(hex).multiplyScalar(0.9 + r() * 0.2), col = new Float32Array(p.count * 3); for (let v = 0; v < p.count; v++) k.toArray(col, v * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv');
    parts.push(g);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), toon({ vertexColors: true, soft: 0.25, rim: 0.2 })); mesh.name = 'mountains'; return mesh;
}

/** The river and the lake: flat sheets that take the sky's colour and glitter towards the sun. */
function water() {
  const pos = [], idx = [];
  let k = 0; for (let x = -700; x < 1700; x += 14, k++) { const z = riverZ(x), w = 16 + 10 * Math.sin(x / 210); pos.push(x, VALLEY - 1.2, z - w, x, VALLEY - 1.2, z + w); if (k) { const i = k * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const lake = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); lake.scale(560, 1, 250); lake.translate(1050, VALLEY - 1.2, -1380); lake.deleteAttribute('uv'); lake.deleteAttribute('normal');
  const mat = new THREE.ShaderMaterial({ uniforms: { ...shared, uA: { value: new THREE.Color('#c79ad2') }, uB: { value: new THREE.Color('#ffe2b8') } }, toneMapped: false,
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform vec3 uA, uB; ${HAZE_PARS}
      void main() { vec3 v = normalize(vW - cameraPosition); float t = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 6.0);
        vec3 c = mix(uA, uB * 1.25, t) ; gl_FragColor = vec4(hazed(c, vW, 0.55), 1.0); }` });
  const mesh = new THREE.Mesh(mergeGeometries([g, lake]), mat); mesh.name = 'water'; return mesh;
}

/** Mist banks: soft flat sheets low over the river and between the hills. */
function mist() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv), r = rnd(9), parts = [];
  for (let i = 0; i < 26; i++) { const x = -500 + r() * 1900, z = riverZ(x) + (r() - 0.6) * 560, g = new THREE.PlaneGeometry(260 + r() * 420, 90 + r() * 130).rotateX(-Math.PI / 2); g.rotateY((r() - 0.5) * 0.8); g.translate(x, VALLEY + 6 + r() * 16, z); parts.push(g); }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.02, 1.06), transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  mesh.name = 'mist'; mesh.renderOrder = 2; return mesh;
}

/** An arched bridge far down in the valley. */
function bridge() {
  const parts = [], x0 = 330, z = riverZ(x0) - 150, n = 7, span = 44, y = VALLEY + 24;
  parts.push(new THREE.BoxGeometry(8, 2.4, n * span + 20).translate(x0, y, z + (n * span) / 2));
  for (let i = 0; i <= n; i++) parts.push(new THREE.BoxGeometry(7, 26, 4.5).translate(x0, y - 13, z + i * span));
  for (let i = 0; i < n; i++) parts.push(new THREE.TorusGeometry(span / 2 - 2, 1.6, 4, 10, Math.PI).rotateY(Math.PI / 2).translate(x0, y - 20, z + (i + 0.5) * span));
  const g = mergeGeometries(parts.map((p) => { const q = p.toNonIndexed(); q.deleteAttribute('uv'); q.computeVertexNormals(); return q; }));
  const mesh = new THREE.Mesh(g, toon({ color: '#a892b8', flat: true })); mesh.name = 'bridge'; return mesh;
}

export function buildLand({ marks = [] } = {}) {
  const group = new THREE.Group(); group.name = 'land';
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7000, 48).rotateX(-Math.PI / 2), toon({ color: C.floor })); floor.position.y = VALLEY - 3;
  group.add(floor, landMesh(), roadMesh(), tyreMarks(marks), mountains(), water(), mist(), bridge());
  return group;
}
