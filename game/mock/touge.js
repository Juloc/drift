// The touge in the mock stage's look: the land, the road and everything beside it, made from the map's own track (sim/track.js) so that what is
// drawn is what the physics drives on. The mountain's flank is a smooth surface through the road's heights (every leg of the pass lies on it as a
// bench), rock where it is steep, a valley floor below, rings of peaks around. Rails stand exactly on the map's walls. Scene axes: x is the
// simulation's x mirrored (view/space.js).
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { surfaceAt, frameAt } from '../sim/track.js';
import { toon, shared } from './toon.js';
import { roadMaterial, waterMaterial, fbm, rnd } from './land.js';
import { faceted, paintGeo, chevronTexture } from './props.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = { grass: new THREE.Color('#7f9647'), grassDry: new THREE.Color('#a39a4c'), rock: new THREE.Color('#9a7480'), rockDark: new THREE.Color('#7a5d76'), floor: new THREE.Color('#55805a'), wood: new THREE.Color('#3f6b58'), gravel: new THREE.Color('#a78d95') };

/** The land's height for a track: `field.at(x, z)` in the simulation's axes, and what the road says there (`field.road`: surfaceAt's answer, `edge` metres beyond the road's edge). */
export function makeField(T) {
  const sh = T.limits.shoulder, VERGE = sh + 3.4, n = T.x.length, P = [];
  for (let i = 0; i < n; i += 5) P.push([T.x[i], T.z[i], T.y[i]]);
  // the flank's mean plane (least squares), then the road's heights pull the surface to them
  let sx = 0, sz = 0, sy = 0; for (const p of P) { sx += p[0]; sz += p[1]; sy += p[2]; } const mx = sx / P.length, mz = sz / P.length, my = sy / P.length;
  let xx = 0, xz = 0, zz = 0, xy = 0, zy = 0; for (const p of P) { const dx = p[0] - mx, dz = p[1] - mz, dy = p[2] - my; xx += dx * dx; xz += dx * dz; zz += dz * dz; xy += dx * dy; zy += dz * dy; }
  const det = xx * zz - xz * xz, a = (xy * zz - zy * xz) / det, b = (zy * xx - xy * xz) / det, plane = (x, z) => my + a * (x - mx) + b * (z - mz);
  const res = P.map((p) => p[2] - plane(p[0], p[1])), yMin = Math.min(...T.y), yMax = Math.max(...T.y), lo = yMin - 34, hi = yMax + 70;
  const out = {};
  const base = (x, z) => { let w = 0, r = 0, near = 1e9; for (let i = 0; i < P.length; i++) { const dx = x - P[i][0], dz = z - P[i][1], d2 = dx * dx + dz * dz, k = 1 / ((d2 + 30) ** 1.5); w += k; r += k * res[i]; if (d2 < near) near = d2; }
    const far = Math.sqrt(near); let h = plane(x, z) + (r / w) * Math.exp(-((far / 220) ** 2));
    h += (fbm(x * 0.004 + 3, z * 0.004, 3) - 0.5) * 90 * ss(120, 500, far);                                    // rolling land far from the pass
    h = lo + (hi - lo) / (1 + Math.exp(-(h - (lo + hi) / 2) / ((hi - lo) / 4.4)));                             // it ends in a valley floor below and a shoulder above
    return h; };
  const road = (x, z) => { const q = surfaceAt(T, x, z, out); q.edge = q.kind === 'plaza' ? 0 : Math.max(0, q.lat > 0 ? q.lat - T.hwR[0] : -q.lat - T.hwL[0]); return q; };
  const at = (x, z) => { const q = road(x, z), yr = q.y - 0.22; if (q.edge < VERGE) return yr;
    const f = base(x, z), e = q.edge - VERGE, up = f > q.y;
    const t = up ? ss(0, 4.5, e) : ss(0, 11, e), rough = (fbm(x * 0.035, z * 0.035) - 0.5) * 10 * ss(2, 30, e) + (fbm(x * 0.12, z * 0.12, 3) - 0.5) * 2.6 * ss(0.5, 10, e);
    return yr * (1 - t) + (f + rough + (up ? 2.2 : -1.6) * ss(0, 6, e)) * t; };
  return { at, road, base, VERGE, lo, hi, yMin, yMax, cx: mx, cz: mz };
}

function landMesh(T, F) {
  const r = rnd(77), X0 = Math.min(...T.x) - 70, X1 = Math.max(...T.x) + 70, Z0 = Math.min(...T.z) - 70, Z1 = Math.max(...T.z) + 70;
  const axis = (a, b) => { const out = []; let v = a; while (v > a - 1500) { out.unshift(v); v -= 3.1 + 0.16 * (a - v); } v = a + 3.1; while (v < b) { out.push(v); v += 3.1; } while (v < b + 1500) { out.push(v); v += 3.1 + 0.16 * (v - b); } return out; };
  const xs = axis(X0, X1), zs = axis(Z0, Z1), nx = xs.length - 1, nz = zs.length - 1, P = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = xs[i], z = zs[j]; const stepX = (xs[Math.min(nx, i + 1)] - xs[Math.max(0, i - 1)]) / 2, stepZ = (zs[Math.min(nz, j + 1)] - zs[Math.max(0, j - 1)]) / 2;
    if (F.road(x, z).edge > F.VERGE + 4) { x += (r() - 0.5) * stepX * 0.6; z += (r() - 0.5) * stepZ * 0.6; } else { r(); r(); }
    const k = (j * (nx + 1) + i) * 3; P[k] = -x; P[k + 1] = F.at(x, z); P[k + 2] = z;
  }
  const pos = [], col = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), k = new THREE.Color();
  const tri = (ia, ib, ic) => {
    a.fromArray(P, ia * 3); b.fromArray(P, ib * 3); c.fromArray(P, ic * 3); n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    const cx = -(a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3, q = F.road(cx, cz);
    k.copy(C.grass).lerp(C.grassDry, fbm(cx * 0.02, cz * 0.02, 2));
    if (cy < F.yMin - 14) k.lerp(C.floor, ss(F.yMin - 14, F.yMin - 28, cy)).lerp(C.wood, 0.5 * ss(0.45, 0.6, fbm(cx * 0.012 + 5, cz * 0.012, 3)));
    { const rk = ss(0.88, 0.7, n.y); k.lerp(r() > 0.5 ? C.rock : C.rockDark, rk).multiplyScalar(1 + rk * (r() - 0.5) * 0.3); }
    if (q.edge < F.VERGE + 1.5) k.lerp(C.gravel, ss(F.VERGE + 1.5, F.VERGE - 1.5, q.edge) * 0.8);
    k.multiplyScalar(0.93 + r() * 0.14);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); for (let v = 0; v < 3; v++) col.push(k.r, k.g, k.b);
  };
  // (x is mirrored, so the corners go round the other way to face up)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const p = j * (nx + 1) + i, q = p + nx + 1; if ((i + j) & 1) { tri(p, p + 1, q); tri(p + 1, q + 1, q); } else { tri(p, q + 1, q); tri(p, p + 1, q + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, toon({ vertexColors: true, soft: 0.3, rim: 0.25 })); mesh.receiveShadow = true; mesh.name = 'land';
  return mesh;
}

function roadMesh(T) {
  const pos = [], uv = [], idx = [], n = T.x.length, cols = 5;
  for (let i = 0; i < n; i++) { const s = Math.min(T.len, i * T.ds), hl = T.hwL[i], hr = T.hwR[i];
    for (const lat of [-hl - 1.5, -hl, 0, hr, hr + 1.5]) { const f = frameAt(T, s, lat); pos.push(-f.x, f.y - (Math.abs(lat) > Math.max(hl, hr) ? 0.03 : 0), f.z); uv.push(lat * (4.6 / hl), s); }
    if (i) for (let k = 0; k < cols - 1; k++) { const p = (i - 1) * cols + k, q = i * cols + k; idx.push(p, q, p + 1, p + 1, q, q + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(2) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  const mesh = new THREE.Mesh(g, roadMaterial()); mesh.receiveShadow = true; mesh.name = 'road';
  const group = new THREE.Group(); group.add(mesh);
  if (T.plaza) { const shape = new THREE.Shape(T.plaza.pts.map(([x, z]) => new THREE.Vector2(-x, -z))), pg = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2); pg.translate(0, T.plaza.y - 0.02, 0);
    const pm = new THREE.Mesh(pg, toon({ color: new THREE.Color(0.335, 0.285, 0.38), gloss: 0.3, rim: 0 })); pm.receiveShadow = true; pm.name = 'plaza'; group.add(pm); }
  return group;
}

/** Many small meshes into one per material (a group of boards or lanterns is then a few draw calls instead of hundreds). */
function mergedByMaterial(group, name) {
  group.updateMatrixWorld(true); const by = new Map(), shadow = new Set();
  group.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(g); if (o.castShadow) shadow.add(o.material); });
  const out = new THREE.Group(); out.name = name;
  for (const [m, list] of by) { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = shadow.has(m); if (m.isMeshLambertMaterial) m.side = THREE.DoubleSide; out.add(mesh); }
  return out;
}

/** Rails on the map's walls (what the car hits is what stands there), with posts and small lamps. */
function rails(T, walls) {
  const parts = [], posts = [], lamps = [], PROFILE = [[0.0, 0.42], [0.07, 0.5], [0.0, 0.58], [0.0, 0.62], [0.07, 0.7], [0.0, 0.78]], out = {}, np = PROFILE.length;
  for (const w of walls) { const pts = w.pts; if (pts.length < 2) continue; const pos = [], idx = [];
    pts.forEach(([x, z], i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const q = surfaceAt(T, x, z, out), y = q.y, side = q.lat > 0 ? 1 : -1, nx = tz * side, nz = -tx * side;                     // (nx, nz): away from the road
      for (const [o, h] of PROFILE) pos.push(-(x + nx * o), y + h, z + nz * o);
      if (i) for (let k = 0; k < np - 1; k++) { const p = (i - 1) * np + k, r = i * np + k; idx.push(p, r, p + 1, p + 1, r, r + 1); }
      if (i % 2 === 0) { posts.push([-x, y, z]); if (i % 8 === 0) lamps.push([-x, y + 0.92, z]); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); parts.push(g); }
  const group = new THREE.Group(), rail = new THREE.Mesh(mergeGeometries(parts), toon({ color: '#c9b8cf', side: THREE.DoubleSide, gloss: 0.35, soft: 0.5 })); rail.castShadow = true;
  const m = new THREE.Matrix4(), post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.86, 0.14).translate(0, 0.43, 0), toon({ color: '#8d7c96' }), posts.length);
  posts.forEach((p, i) => post.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])));
  const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 3.3, 0.7), toneMapped: false }), lamps.length);
  lamps.forEach((p, i) => lamp.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])));
  for (const im of [post, lamp]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  group.add(rail, post, lamp); group.name = 'rails'; return group;
}

/** Chevron boards round the outside of every hairpin, their arrows pointing the way of the climb. */
function chevrons(T, F, hairpins, down) {
  const tex = chevronTexture(), face = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.6, 2.2, 2.4), toneMapped: false, side: THREE.DoubleSide }), back = toon({ color: '#4a3a5a' }), group = new THREE.Group();
  for (const hp of hairpins) for (const ds of [-21, -14, -7, 0, 7, 14, 21]) {
    const s = hp.s + ds; if (s < 0 || s > T.len) continue; const i = Math.min(T.x.length - 1, Math.round(s / T.ds)), lat = (hp.right ? -1 : 1) * ((hp.right ? T.hwL[i] : T.hwR[i]) + 2.6), f = frameAt(T, s, lat);
    const g = new THREE.Group(), w = ds === 0 ? 2.4 : 1.7, h = w / 2, inX = (hp.right ? 1 : -1) * f.r[0], inZ = (hp.right ? 1 : -1) * f.r[2];   // (inX, inZ): towards the road, in the simulation's axes
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face); plate.position.y = 1.0 + h / 2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08), back); board.position.set(0, 1.0 + h / 2, -0.05);
    const legs = [-0.36, 0.36].map((k) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0 + h / 2, 0.09), back); l.position.set(k * w, (1.0 + h / 2) / 2, -0.09); return l; });
    g.add(plate, board, ...legs); g.position.set(-f.x, F.at(f.x, f.z), f.z); const th = Math.atan2(-inX, inZ); g.rotation.y = th;
    if ((Math.cos(th) * f.t[0] + Math.sin(th) * f.t[2] < 0) !== down) plate.scale.x = -1;                                           // the plate's own right against the climb's direction (the climb runs against the track's): mirror it
    group.add(g);
  }
  return mergedByMaterial(group, 'chevrons');
}

/** Old tyre marks through every hairpin: pairs of thin dark lines that swing from the inside of the bend out to its edge. */
function oldMarks(T, hairpins, r) {
  const pos = [], al = [], idx = [];
  for (const hp of hairpins) for (let m = 0; m < 6; m++) { const len = 34 + r() * 30, s0 = hp.s - len / 2 + (r() - 0.5) * 16, i0 = Math.min(T.x.length - 1, Math.max(0, Math.round(hp.s / T.ds))), hw = T.hwL[i0], out = hp.right ? -1 : 1, amp = 1.2 + r() * 2.2, mid = (r() - 0.5) * 2.6, a = 0.22 + r() * 0.4;
    for (const tw of [-0.75, 0.75]) { const base = pos.length / 3; let k = 0;
      for (let d = 0; d <= len; d += 1.5, k++) { const s = s0 + d; if (s < 1 || s > T.len - 1) { k--; continue; } const u = d / len, lat = Math.max(-hw + 0.4, Math.min(hw - 0.4, mid + tw + out * amp * Math.sin(u * Math.PI))), f = frameAt(T, s, lat), w = 0.11, fade = Math.min(1, u * 5, (1 - u) * 5) * a;
        pos.push(-(f.x + f.r[0] * w), f.y + 0.014, f.z + f.r[2] * w, -(f.x - f.r[0] * w), f.y + 0.014, f.z - f.r[2] * w); al.push(fade, fade);
        if (k) { const q = base + k * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); } } } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('alpha', new THREE.Float32BufferAttribute(al, 1)); g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
    vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(0.06, 0.04, 0.09, vA); }' }));
  mesh.name = 'old-marks'; mesh.renderOrder = 1; return mesh;
}

/** Where the pass reaches the plaza: a red gate over the road and stone lanterns with a warm light, up the last stretch. */
function plazaGate(T, F) {
  const group = new THREE.Group(), red = toon({ color: '#d8483f', soft: 0.4, rim: 0.4 }), stone = toon({ color: '#9b8a9c', flat: true }), glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 2.9, 0.9), toneMapped: false });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; };
  { const f = frameAt(T, 16, 0), gate = new THREE.Group(), half = T.hwL[8] + 1.6;
    for (const k of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 7.4, 8), red); post.position.set(k * half, 3.7, 0); post.castShadow = true; gate.add(post, box(1.1, 0.5, 1.1, k * half, 0.25, 0, stone)); }
    gate.add(box(half * 2 + 3.4, 0.5, 0.75, 0, 7.5, 0, red), box(half * 2 + 4.6, 0.36, 1.0, 0, 7.95, 0, toon({ color: '#3a2a3c' })), box(half * 2 + 1.2, 0.42, 0.5, 0, 6.2, 0, red), box(0.5, 0.9, 0.55, 0, 6.85, 0, red));
    gate.position.set(-f.x, f.y, f.z); gate.rotation.y = -f.head; group.add(gate); }
  for (let s = 40; s < Math.min(T.len, 330); s += 26) for (const side of [-1, 1]) { const i = Math.round(s / T.ds), f = frameAt(T, s, side * ((side > 0 ? T.hwR[i] : T.hwL[i]) + F.VERGE - 1.1)), l = new THREE.Group();
    l.add(box(0.5, 0.2, 0.5, 0, 0.1, 0, stone), box(0.2, 0.9, 0.2, 0, 0.65, 0, stone), box(0.5, 0.12, 0.5, 0, 1.14, 0, stone), box(0.34, 0.34, 0.34, 0, 1.37, 0, glow), box(0.66, 0.1, 0.66, 0, 1.6, 0, stone), box(0.3, 0.14, 0.3, 0, 1.72, 0, stone));
    l.position.set(-f.x, F.at(f.x, f.z), f.z); l.rotation.y = -f.head; group.add(l); }
  return mergedByMaterial(group, 'gate');
}

/** Mist: soft flat sheets over the lake and low land round the pass. */
function mistBanks(F, r) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const parts = [];
  for (let i = 0; i < 400 && parts.length < 34; i++) { const a = r() * 6.28, d = 260 + r() * 1300, x = F.cx + Math.cos(a) * d, z = F.cz + Math.sin(a) * d; if (F.base(x, z) > F.lo + 22) continue;
    const g = new THREE.PlaneGeometry(240 + r() * 460, 80 + r() * 150).rotateX(-Math.PI / 2); g.rotateY(r() * 3.14); g.translate(-x, F.lo + 7 + r() * 16, z); parts.push(g); }
  const mesh = new THREE.Mesh(parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(1.2, 1.0, 1.06), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  mesh.name = 'mist'; mesh.renderOrder = 2; return mesh;
}

/** A pine as the mockup draws it: a trunk and four tiers of faceted cones. */
function pineGeometry(r) {
  const parts = [], green = [new THREE.Color('#3f7a5a'), new THREE.Color('#35694f'), new THREE.Color('#487f58')], trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5, 1, true).translate(0, 0.15, 0).toNonIndexed(); trunk.deleteAttribute('uv'); trunk.computeVertexNormals(); parts.push(paintGeo(trunk, new THREE.Color('#5a4252')));
  for (let t = 0; t < 4; t++) { const g = faceted(new THREE.ConeGeometry(0.3 - t * 0.055, 0.34 - t * 0.02, 7, 1, true), r, 0.22); g.translate(0, 0.33 + t * 0.19, 0); parts.push(paintGeo(g, green[t % 3].clone().multiplyScalar(0.9 + t * 0.07))); }
  return mergeGeometries(parts);
}

/**
 * Builds the touge's world. `map`: the map file, `T`: its baked track, `tier`: 'high' or 'low'.
 * Returns { group, field }. Everything is made here from code: no model file is read.
 */
export function buildTouge(map, T, { tier = 'high', down = false } = {}) {
  const F = makeField(T), group = new THREE.Group(), r = rnd(5151), low = tier === 'low'; group.name = 'touge';
  shared.uHazeLow.value = F.lo + 24;                                                                                    // the valley's mist lies under the pass, not on it
  // a lake fills the valley's floor; mist banks lie over it and in the hollows of the far land
  const lake = new THREE.Mesh(new THREE.CircleGeometry(8000, 48).rotateX(-Math.PI / 2), waterMaterial()); lake.position.set(-F.cx, F.lo + 2.2, F.cz); lake.name = 'lake';
  group.add(lake, mistBanks(F, r), landMesh(T, F), roadMesh(T), rails(T, map.walls ?? []), chevrons(T, F, map.track?.hairpins ?? [], down), oldMarks(T, map.track?.hairpins ?? [], r), plazaGate(T, F));

  // ---- where things may stand: beside the road (by the road's own distance and side), never on a verge of any leg
  const free = (x, z, clear = 1.2) => F.road(x, z).edge > F.VERGE + clear;
  const beside = (s, off) => { const i = Math.min(T.x.length - 1, Math.max(0, Math.round(s / T.ds))), side = off > 0 ? 1 : -1, f = frameAt(T, s, off + side * (off > 0 ? T.hwR[i] : T.hwL[i])); return [f.x, f.z]; };
  const pines = [[], []], rocks = [], cherries = [], tufts = [[], []], m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  for (let i = 0; i < (low ? 1500 : 3600); i++) { const [x, z] = beside(r() * T.len, (r() < 0.5 ? 1 : -1) * (F.VERGE + 2 + r() * r() * 70)); if (!free(x, z, 2) || fbm(x * 0.03 + 9, z * 0.03, 2) < 0.44) continue; pines[i & 1].push([-x, F.at(x, z) - 0.3, z, r() * 6.28, 7 + r() * 9]); }
  for (let i = 0; i < (low ? 1200 : 3000); i++) { const x = F.cx + (r() - 0.5) * 1500, z = F.cz + (r() - 0.5) * 1700; if (!free(x, z, 40) || fbm(x * 0.012 + 5, z * 0.012, 3) < 0.46) continue; pines[i & 1].push([-x, F.at(x, z) - 0.5, z, r() * 6.28, 11 + r() * 12]); }
  for (let i = 0; i < 520; i++) { const [x, z] = beside(r() * T.len, (r() < 0.5 ? 1 : -1) * (F.VERGE + 0.8 + r() * r() * 34)); if (!free(x, z, 0.6)) continue; rocks.push([x, z, 0.7 + r() * r() * 3.6]); }
  for (let s = 20; s < T.len; s += 16 + r() * 26) { const [x, z] = beside(s, (r() < 0.5 ? 1 : -1) * (F.VERGE + 2.5 + r() * 9)); if (free(x, z, 2)) cherries.push([x, z, 6.5 + r() * 5]); }
  for (let i = 0; i < (low ? 1400 : 4200); i++) { const [x, z] = beside(r() * T.len, (r() < 0.5 ? 1 : -1) * (F.VERGE - 2.6 + r() * r() * 9)); if (F.road(x, z).edge < T.limits.shoulder + 0.9) continue; tufts[i & 1].push([-x, F.at(x, z) - 0.04, z, r() * 6.28, 0.3 + r() * 0.45]); }

  // pines: one instanced mesh per shape
  for (const list of pines) { const mesh = new THREE.InstancedMesh(pineGeometry(r), toon({ vertexColors: true, soft: 0.55, rim: 0.45 }), list.length);
    list.forEach(([x, y, z, ry, h], i) => mesh.setMatrixAt(i, m4.compose(p3.set(x, y, z), q4.setFromAxisAngle(up, ry), s3.set(h * 1.05, h, h * 1.05)))); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.name = 'pines'; group.add(mesh); }
  // rocks and blossom: merged, faceted
  { const parts = [], cA = new THREE.Color('#a47f88'), cB = new THREE.Color('#86688a');
    for (const [x, z, size] of rocks) { const g = faceted(new THREE.IcosahedronGeometry(1, 1), r, 0.5); g.scale(size * (0.8 + r() * 0.6), size * (0.6 + r() * 0.5), size * (0.8 + r() * 0.6)); g.rotateY(r() * 6.28); g.translate(-x, F.at(x, z) + size * 0.1, z); g.computeVertexNormals(); parts.push(paintGeo(g, cA.clone().lerp(cB, r()).multiplyScalar(0.9 + r() * 0.2))); }
    const mesh = new THREE.Mesh(mergeGeometries(parts), toon({ vertexColors: true, soft: 0.25, rim: 0.4 })); mesh.receiveShadow = true; mesh.name = 'rocks'; group.add(mesh); }
  { const parts = [], pinks = ['#f48fb9', '#ea76ab', '#f9aecb', '#dd6aa2'].map((h) => new THREE.Color(h)), places = [];
    for (const [x, z, h] of cherries) { const y = F.at(x, z) - 0.3; places.push([-x, y, z, r() * 6.28, h * 0.82]);
      const n = low ? 7 : 11 + Math.floor(r() * 5); for (let i = 0; i < n; i++) { const a = r() * 6.28, rad = h * 0.36 * Math.sqrt(r()), size = h * (0.13 + r() * 0.12), g = faceted(new THREE.IcosahedronGeometry(1, 1), r, 0.35);
        g.scale(size * 1.25, size * 0.9, size * 1.25); g.rotateY(r() * 6.28); g.translate(-x + Math.cos(a) * rad, y + h * (0.62 + r() * 0.36) - rad * 0.25, z + Math.sin(a) * rad); parts.push(paintGeo(g, pinks[Math.floor(r() * 4)].clone().multiplyScalar(0.92 + r() * 0.16))); } }
    const blossom = new THREE.Mesh(mergeGeometries(parts), toon({ vertexColors: true, soft: 0.55, rim: 0.5 })); blossom.name = 'blossom';
    group.add(blossom);
    // the trunks: a leaning stem that forks into three boughs (a few faceted tubes), one instanced mesh
    const tube = (x0, y0, z0, x1, y1, z1, r0, r1) => { const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r1, r0, len, 5, 1, true).translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize())); g.translate(x0, y0, z0); const n = g.toNonIndexed(); n.deleteAttribute('uv'); n.computeVertexNormals(); return n; };
    const stem = mergeGeometries([tube(0, 0, 0, 0.06, 0.5, 0.02, 0.07, 0.05), tube(0.06, 0.5, 0.02, 0.3, 0.86, 0.1, 0.045, 0.02), tube(0.06, 0.5, 0.02, -0.24, 0.9, -0.08, 0.045, 0.02), tube(0.06, 0.5, 0.02, 0.02, 0.95, -0.26, 0.04, 0.02)]);
    const trunks = new THREE.InstancedMesh(stem, toon({ color: '#5a3d52', soft: 0.5 }), places.length);
    places.forEach(([x, y, z, ry, h], i) => trunks.setMatrixAt(i, m4.compose(p3.set(x, y, z), q4.setFromAxisAngle(up, ry), s3.set(h, h, h)))); trunks.instanceMatrix.needsUpdate = true; trunks.computeBoundingSphere(); trunks.castShadow = true; trunks.name = 'cherry-trunk'; group.add(trunks); }
  { // grass: a tuft is five thin blades, dark at the foot and light at the tip
    const pos = [], col = [], dark = new THREE.Color('#5d7d3c'), light = new THREE.Color('#b9b25a');
    for (let b = 0; b < 5; b++) { const a = (b / 5) * 6.28 + 0.4, lean = 0.25 + (b % 2) * 0.2, cx = Math.cos(a), cz = Math.sin(a), w = 0.09, tx = cx * lean, tz = cz * lean, h = 0.75 + (b % 3) * 0.14;
      pos.push(cx * 0.08 - cz * w, 0, cz * 0.08 + cx * w, cx * 0.08 + cz * w, 0, cz * 0.08 - cx * w, tx, h, tz); col.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const all = [...tufts[0], ...tufts[1]], grass = new THREE.InstancedMesh(g, toon({ vertexColors: true, side: THREE.DoubleSide, soft: 0.8, rim: 0.2 }), all.length);
    all.forEach(([x, y, z, ry, h], i) => grass.setMatrixAt(i, m4.compose(p3.set(x, y, z), q4.setFromAxisAngle(up, ry), s3.set(h * 1.3, h * 1.2, h * 1.3)))); grass.instanceMatrix.needsUpdate = true; grass.computeBoundingSphere(); grass.name = 'grass'; group.add(grass); }
  group.userData = { pines: pines[0].length + pines[1].length, rocks: rocks.length, cherries: cherries.length };
  return { group, field: F };
}
