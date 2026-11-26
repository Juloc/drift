// What a model car gets besides its file: an underbody (frame, axles, drive shaft, exhaust pipe in rough strokes), a contact
// shadow in the car's own shape, a pool of headlight on the road ahead, brake lights that brighten when braking, underglow as
// a soft pad of underglow on the road, and flames with a flash at the exhaust when the throttle is lifted or the box shifts up.
// The pops come from the game: it fires `car.pop` on window ({ strength 0..1 }) when the throttle is lifted at speed and plays the
// bang itself (game/main.js); the flames listen to that one event, so picture and sound go off together. No canvas in Node: the
// textures are made only where a document exists.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

/** Measures a car group made by prepareCar: its box (car axes: x left, y up, z front) and the wheel centres. */
export function measure(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3(), v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.fx) return;
    const p = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m));
  });
  const wheels = [];
  group.traverse((o) => { if (/^wheel_..(_pivot)?$/.test(o.name)) wheels.push(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); });
  const zs = wheels.map((w) => w.z), xs = wheels.map((w) => Math.abs(w.x));
  const front = wheels.length ? Math.max(...zs) : 1.3, rear = wheels.length ? Math.min(...zs) : -1.3;
  const halfTrack = wheels.length ? Math.min(...xs) : 0.75, radius = wheels.length ? wheels[0].y : 0.32;
  // each tyre as it is drawn (the box of its meshes, not its pivot): the middle, the width, the radius, the point it touches the road
  const tyres = [];
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    const node = group.getObjectByName(`wheel_${k}_pivot`) ?? group.getObjectByName(`wheel_${k}`), b = new THREE.Box3();
    node?.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const p = o.geometry.attributes.position, mm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < p.count; i++) b.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mm));
    });
    if (b.isEmpty()) continue;
    const at = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    tyres.push({ at, width: size.x, radius: size.y / 2, contact: new THREE.Vector3(at.x, b.min.y, at.z) });
  }
  // the two rear tyres' contact points, the right one (-x) first (by their place: older files name their sides the wrong way round)
  const midZ = tyres.length ? tyres.reduce((a, t) => a + t.at.z, 0) / tyres.length : 0;
  const rearTyres = tyres.filter((t) => t.at.z < midZ).sort((a, b) => a.at.x - b.at.x);
  return { box, front, rear, halfTrack, radius, tyres, rearTyres };
}

/** A soft shape drawn on a canvas (null in Node). */
function canvasTexture(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const shadowTexture = () => canvasTexture(128, 256, (x, w, h) => {
  // the footprint of a car: a rounded rectangle, darkest in the middle and under the four wheels, soft at the edges
  const blur = (r, a, cx, cy, sx, sy) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(cx, cy); x.scale(sx, sy); x.fillStyle = g; x.fillRect(-r, -r, 2 * r, 2 * r); x.restore(); };
  blur(w * 0.5, 0.75, w / 2, h / 2, 0.9, 1.9);
  for (const sx of [0.22, 0.78]) for (const sy of [0.24, 0.76]) blur(w * 0.16, 0.5, w * sx, h * sy, 1, 1.4);
});
const poolTexture = () => canvasTexture(128, 256, (x, w, h) => {
  // the light of two headlamps on the road, seen from above: a wide fan from the lamps (bottom of the picture) forward,
  // a fairly hard near edge, fading out far ahead; brightest a little in front of the bumper, not at it
  const img = x.createImageData(w, h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const along = 1 - py / h, across = (px / w - 0.5) * 2;   // along 0 at the bumper, 1 far ahead; across -1..1
    const spread = 0.28 + 0.72 * along;   // the fan widens
    const side = Math.max(0, 1 - (Math.abs(across) / spread) ** 2.2);
    const near = Math.min(1, along / 0.06), far = Math.max(0, 1 - along) ** 1.6;
    const v = side * near * far * (0.55 + 0.45 * Math.min(1, along / 0.25));
    const i = (py * w + px) * 4; img.data[i] = 255; img.data[i + 1] = 236; img.data[i + 2] = 205; img.data[i + 3] = Math.round(255 * v);
  }
  x.putImageData(img, 0, 0);
});
const flameTexture = () => canvasTexture(64, 128, (x, w, h) => {
  // a sharp tongue seen from the side, the root at the pipe (bottom) and the tip at the top: blue at the root, white-yellow, orange at the tip; hard edges (no fog)
  const g = x.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(110,150,255,1)'); g.addColorStop(0.18, 'rgba(170,200,255,1)'); g.addColorStop(0.4, 'rgba(255,235,170,1)'); g.addColorStop(0.7, 'rgba(255,150,50,1)'); g.addColorStop(1, 'rgba(255,100,20,0.9)');
  x.fillStyle = g; x.beginPath(); x.moveTo(w * 0.5, 0); x.bezierCurveTo(w * 0.62, h * 0.3, w * 0.98, h * 0.62, w * 0.62, h); x.lineTo(w * 0.38, h); x.bezierCurveTo(w * 0.02, h * 0.62, w * 0.38, h * 0.3, w * 0.5, 0); x.fill();
});
const glowTexture = () => canvasTexture(64, 64, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const haloTexture = () => canvasTexture(64, 64, (x, w) => {
  // a lamp's glow: a small hot core and a long soft tail (the old round spot was a flat disc that read as a pink balloon beside the body)
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.07, 'rgba(255,255,255,0.9)'); g.addColorStop(0.2, 'rgba(255,255,255,0.32)'); g.addColorStop(0.45, 'rgba(255,255,255,0.09)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const padTexture = () => canvasTexture(128, 256, (x, w, h) => {
  // underglow on the road: a soft rounded rectangle, strongest just outside the sills, fading under the middle and outwards
  const img = x.createImageData(w, h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = Math.abs(px / w - 0.5) * 2, v = Math.abs(py / h - 0.5) * 2;   // 0 in the middle, 1 at the edge
    const ring = (Math.exp(-(((u - 0.6) / 0.22) ** 2)) + 0.3 * (1 - u)) * (1 - u ** 4) * (1 - v ** 4) ** 2;   // zero at every edge
    const i = (py * w + px) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * Math.min(1, ring));
  }
  x.putImageData(img, 0, 0);
});

const flat = (geo) => geo.rotateX(-Math.PI / 2);
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4(), _hp = new THREE.Vector3(), _fw = new THREE.Vector3(), _cd = new THREE.Vector3();
/** Moves each vertex of a flat sheet (child of a car) to 1.5 cm above the ground under it; keeps its own x and z. */
function layOnGround(mesh, groundAt, lift = 0.015) {
  if (!mesh.userData.flatY) {   // its own geometry first: the copies of a car share it, and each lies on its own piece of road
    mesh.geometry = mesh.geometry.clone();
    const p = mesh.geometry.attributes.position;
    mesh.userData.flatY = Float32Array.from({ length: p.count }, (_, i) => p.getY(i));
  }
  const p = mesh.geometry.attributes.position;
  mesh.updateWorldMatrix(true, false);
  _inv.copy(mesh.matrixWorld).invert();
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), mesh.userData.flatY[i], p.getZ(i)).applyMatrix4(mesh.matrixWorld);
    _v.y = groundAt(_v.x, _v.z) + lift;
    _v.applyMatrix4(_inv);
    p.setY(i, _v.y);
  }
  p.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}
const tag = (o) => { o.userData.fx = true; o.traverse((c) => { c.userData.fx = true; }); return o; };

/**
 * The parts every copy of a car shares (put on the template once, before the copies are made): underbody, contact shadow,
 * headlight pool. `spec` = cars.json's `fx` ({ exhaust: [[x, y, z]], pool: 0..1 }).
 */
/**
 * Takes the faces of one palette field (a UV point, glTF axes) out of a palette mesh into their own mesh with `material`:
 * the AE86's windows share the palette material with the black trim, and glass must reflect much less than trim.
 * @returns the new mesh, or null when no face lies on that field
 */
export function splitPalette(group, uvAt, material, tol = 0.06, { all = false, only = null, where = null } = {}) {
  let made = null; const list = [];
  group.traverse((o) => { if (o.isMesh) list.push(o); });
  for (const o of list) {
    if ((made && !all) || (only && !only.test(o.name)) || !o.isMesh || !/palette/i.test(o.material?.name ?? '') || !o.geometry.attributes.uv) continue;
    const g = o.geometry, uv = g.attributes.uv, idx = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    const on = (i) => Math.abs(uv.getX(i) - uvAt[0]) < tol && Math.abs(uv.getY(i) - uvAt[1]) < tol;
    const keep = [], take = [];
    const pos = g.attributes.position, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
    const inPlace = (t) => {   // `where(centre, normal)`: only faces in a place (car axes), e.g. the bonnet's top
      if (!where) return true;
      A.fromBufferAttribute(pos, idx[t]); B.fromBufferAttribute(pos, idx[t + 1]); C.fromBufferAttribute(pos, idx[t + 2]);
      N.subVectors(C, B).cross(_v.subVectors(A, B)).normalize();
      return where(A.add(B).add(C).multiplyScalar(1 / 3), N);
    };
    for (let t = 0; t < idx.length; t += 3) (on(idx[t]) && on(idx[t + 1]) && on(idx[t + 2]) && inPlace(t) ? take : keep).push(idx[t], idx[t + 1], idx[t + 2]);
    if (!take.length) continue;
    const g2 = g.clone(); g2.setIndex(take); g.setIndex(keep);
    made = new THREE.Mesh(g2, material); made.name = o.name + '_' + (material.name ?? 'part');
    made.position.copy(o.position); made.quaternion.copy(o.quaternion); made.scale.copy(o.scale);
    o.parent.add(made);
  }
  return made;
}

/** A tread for a normal map, drawn: angled blocks between two grooves round the tyre, smooth shoulders (null in Node). */
const treadTexture = () => {
  if (typeof document === 'undefined') return null;
  const W = 256, H = 128, h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y / H, u = x / W;
    const shoulder = Math.min(1, Math.min(v, 1 - v) / 0.12);   // the edges stay smooth (the rounded shoulder is in the model)
    const groove = Math.abs(v - 0.36) < 0.025 || Math.abs(v - 0.64) < 0.025 ? -1 : 0;   // two grooves round the tyre
    const slant = ((u * 8 + (v < 0.5 ? v : 1 - v) * 1.2) % 1) < 0.12 ? -1 : 0;   // angled sipes between the blocks
    h[y * W + x] = shoulder * (groove || slant);
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
    const at = (a, b) => h[((b + H) % H) * W + ((a + W) % W)];
    const dx = (at(x2 + 1, y) - at(x2 - 1, y)) * 1.5, dy = (at(x2, y + 1) - at(x2, y - 1)) * 1.5, l = Math.hypot(dx, dy, 1), k = (y * W + x2) * 4;
    img.data[k] = 128 - (dx / l) * 127; img.data[k + 1] = 128 - (dy / l) * 127; img.data[k + 2] = 128 + (1 / l) * 127; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.anisotropy = 4;
  return t;
};

/**
 * Tyres with a tread: the faces of the tyre's palette field come out of each wheel into their own mesh, get UVs (u round the axle,
 * v across the tyre; no seam: each triangle's u is kept together) and a matt rubber with the tread as a normal map.
 */
export function treadTyres(group, uvAt, colour = 0x2e2f34) {
  // dark grey rubber (not black: black has no shape in the dusk), matt, shaded by vertex colours: the sidewall darkest at the rim, lighter at the shoulder with a thin lighter ring
  // where the lettering would be, the tread a little darker; the tread's normal map as before
  const mat = new THREE.MeshStandardMaterial({ name: 'fx_tyre', color: colour, roughness: 0.92, metalness: 0, vertexColors: true, normalMap: treadTexture(), normalScale: new THREE.Vector2(1.6, 1.6) });
  let n = 0;
  splitPalette(group, uvAt, mat, 0.06, { all: true, only: /^wheel_.._own$/ });
  group.traverse((o) => {
    if (!o.isMesh || o.material !== mat) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    let xmin = Infinity, xmax = -Infinity; for (let i = 0; i < p.count; i++) { xmin = Math.min(xmin, p.getX(i)); xmax = Math.max(xmax, p.getX(i)); }
    for (let t = 0; t < p.count; t += 3) {
      const us = [0, 1, 2].map((k) => (Math.atan2(p.getY(t + k), p.getZ(t + k)) / (2 * Math.PI) + 1) % 1);
      const lo = Math.min(...us); for (let k = 0; k < 3; k++) { if (us[k] - lo > 0.5) us[k] -= 1; uv[(t + k) * 2] = us[k]; uv[(t + k) * 2 + 1] = (p.getX(t + k) - xmin) / Math.max(1e-6, xmax - xmin); }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // the shade of each vertex (the axle is x: a side face has its normal along x, its radius is hypot(y, z))
    let rmin = Infinity, rmax = 0; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getY(i), p.getZ(i)); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
    const col = new Float32Array(p.count * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), sm = (t) => t * t * (3 - 2 * t);
    for (let t = 0; t < p.count; t += 3) {
      a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2); nrm.crossVectors(b.sub(a), c.sub(a)).normalize();
      const side = Math.abs(nrm.x) > 0.6;
      for (let k = 0; k < 3; k++) {
        let v = 0.78;   // the tread
        if (side) { const r = (Math.hypot(p.getY(t + k), p.getZ(t + k)) - rmin) / Math.max(1e-6, rmax - rmin); v = 0.5 + 0.5 * sm(Math.min(1, r)) + 0.16 * Math.exp(-(((r - 0.7) / 0.07) ** 2)); }
        col.set([v, v, v], (t + k) * 3);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry = g; n++;
  });
  return n;
}

/** Puts the faces of `from` (a mesh) into `into` (a mesh, same material), in its space; only the attributes both have. */
export function mergeInto(into, from) {
  into.updateWorldMatrix(true, false); from.updateWorldMatrix(true, false);
  const a = into.geometry, b0 = from.geometry.index ? from.geometry.toNonIndexed() : from.geometry.clone();
  b0.applyMatrix4(new THREE.Matrix4().copy(into.matrixWorld).invert().multiply(from.matrixWorld));
  const names = Object.keys(a.attributes).filter((k) => b0.attributes[k] && b0.attributes[k].itemSize === a.attributes[k].itemSize);
  const ga = new THREE.BufferGeometry(), gb = new THREE.BufferGeometry();
  for (const k of names) { ga.setAttribute(k, a.attributes[k]); gb.setAttribute(k, b0.attributes[k]); }
  ga.setIndex(a.index ?? [...Array(a.attributes.position.count).keys()]);
  gb.setIndex([...Array(b0.attributes.position.count).keys()]);
  const g = mergeGeometries([ga, gb]);
  if (!g) return false;
  into.geometry = g;
  from.parent?.remove(from);
  return true;
}

/**
 * Depth for the rims: every rim vertex is shaded by how far in it lies (the car's x, nearer its middle = deeper = darker: the dark dish between the spokes) and by its radius
 * (the outer lip lighter, the light edge of the rim), so the spokes stand in front of a dark inside. The material's colour is the light metal; vertex colours darken it.
 */
export function shadeRims(group, mat) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), v = new THREE.Vector3(), cen = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || o.material !== mat) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    // the wheel's middle in the car's axes (the centre of the mesh's bounding box), the axle direction x, the radius in y and z
    g.computeBoundingBox(); cen.copy(g.boundingBox.getCenter(new THREE.Vector3())).applyMatrix4(m);
    const out = Math.sign(cen.x) || 1, depth = [], rad = []; let dmin = Infinity, dmax = -Infinity, rmax = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      const d = (v.x - cen.x) * out, r = Math.hypot(v.y - cen.y, v.z - cen.z);   // d: how far outward of the rim's middle plane
      depth.push(d); rad.push(r); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); rmax = Math.max(rmax, r);
    }
    const col = new Float32Array(p.count * 3), sm = (t) => t * t * (3 - 2 * t);
    for (let i = 0; i < p.count; i++) {
      const t = (depth[i] - dmin) / Math.max(1e-6, dmax - dmin), r = rad[i] / Math.max(1e-6, rmax);
      const k = 0.22 + 0.5 * sm(t) + 0.3 * sm(Math.max(0, (r - 0.82) / 0.18));   // inside dark, the front of the spokes lighter, the outer lip lightest
      col.set([k, k, k * 1.03], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); o.geometry = g;
  });
  mat.vertexColors = true; mat.needsUpdate = true;
}

/**
 * The four wheels of a model car as one draw call (the phone tier): an instanced copy of the front left wheel, its four matrices
 * taken from the wheels' pivot > spin > mesh before every frame it is drawn (the right ones turned round: outward is -x).
 * The original wheel meshes stay in the tree (hidden), so steering and spinning work as before.
 */
export class WheelSet extends THREE.InstancedMesh {
  constructor(geometry, material) { super(geometry, material, 4); this.name = 'fx_wheels'; this.frustumCulled = false; this.userData.fx = true; }
  clone() { return new WheelSet(this.geometry, this.material).copy(this, false); }
  onBeforeRender() {
    const root = this.parent;
    if (!root) return;
    if (!this.userData.found) {   // the pivots of this copy of the car (found once per copy, kept outside userData: it holds plain data only)
      this._wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => root.getObjectByName(n + '_pivot')).filter(Boolean)
        .map((pivot, i, all) => { const spin = pivot.children[0], mesh = spin.children.find((c) => c.isMesh); if (mesh) mesh.visible = false;
          return { pivot, spin, mesh, right: Math.sign(pivot.position.x) !== Math.sign(all[0].position.x) }; });   // turned round: the wheels on the other side than the one whose shape is used (the older files name their sides the wrong way round)
      this.userData.found = true;
    }
    const m = WheelSet._m;
    this._wheels.forEach((w, i) => {
      m.multiplyMatrices(w.pivot.matrix, w.spin.matrix);
      if (w.mesh) m.multiply(w.mesh.matrix);
      if (w.right) m.multiply(WheelSet._turn);
      this.setMatrixAt(i, m);
    });
    this.instanceMatrix.needsUpdate = true;   // (used from the next frame: the wheels' spin is a frame late, not their place)
  }
}
WheelSet._m = new THREE.Matrix4();
WheelSet._turn = new THREE.Matrix4().makeRotationY(Math.PI);

export function dressCar(group, spec = {}, { lite = false } = {}) {
  // windows: their own dark tinted glass, a weak reflection of the sky (the palette's glass reflected it fully: a pale plate)
  if (spec.tyreUv && !lite) treadTyres(group, spec.tyreUv);   // (the phone: the tyres stay in the wheel's palette, one draw call for all four wheels)
  // rims: their own part (later: wheel size, rim colour and finish); a satin metal with a calm reflection of the sky, not a mirror
  // that turns orange or blue in the dusk
  if (spec.rimUv && !lite) {
    let env = null; group.traverse((o) => { if (o.isMesh && !env) env = o.material?.envMap ?? null; });
    const r = spec.rim ?? {};
    const rim = new THREE.MeshStandardMaterial({ name: 'fx_rim', color: new THREE.Color().setRGB(...(r.color ?? [0.7, 0.72, 0.76])), metalness: r.metal ?? 0.55, roughness: r.rough ?? 0.35, envMap: env, envMapIntensity: r.env ?? 0.7 });
    splitPalette(group, spec.rimUv, rim, 0.06, { all: true, only: /^wheel_.._own$/ });
    shadeRims(group, rim);
  }
  // parts of the model's own dark trim that are body panels (the AE86's bonnet): they take the garage paint like the rest of the body
  const paintMesh = group.getObjectByName('body_paint');
  for (const part of spec.paintParts ?? []) {
    if (!paintMesh) break;
    const [lo, hi] = [new THREE.Vector3(...part.lo), new THREE.Vector3(...part.hi)];
    const n = splitPalette(group, part.uv, paintMesh.material, 0.06, { only: /^body_/, where: (c, nrm) => c.x >= lo.x && c.x <= hi.x && c.y >= lo.y && c.y <= hi.y && c.z >= lo.z && c.z <= hi.z && nrm.y >= (part.up ?? -1) });
    if (n && !mergeInto(paintMesh, n)) n.name = 'body_paint_' + (part.name ?? 'part');   // into the paint mesh: no extra draw call
  }
  if (spec.glassUv) {
    let env = null; group.traverse((o) => { if (o.isMesh && !env) env = o.material?.envMap ?? null; });
    splitPalette(group, spec.glassUv, new THREE.MeshPhysicalMaterial({ name: 'fx_glass', color: 0x05070b, metalness: 0, roughness: 0.3, specularIntensity: 0.18, envMap: env, envMapIntensity: 0.9 }));   // not a mirror: the sun's direct highlight on a side window was a white-orange ball (with the bloom it looked like a light beside the car), so the specular is turned down and the sky reflection kept
  }
  const m = measure(group), { box } = m;
  const len = box.max.z - box.min.z, half = Math.max(0.3, m.halfTrack - 0.14);
  // underbody: a dark floor pan between the wheels, two axles, a drive shaft to the rear axle (rear-wheel drive), a differential, the exhaust pipe
  const tip = new THREE.Vector3(...(spec.exhaust?.[0] ?? [0.4, 0.3, box.min.z + 0.08]));
  const parts = [
    new THREE.BoxGeometry(half * 1.6, 0.03, m.front - m.rear + 0.4).translate(0, 0.2, (m.front + m.rear) / 2),   // between the axles only: nothing shows under the bumpers
    new THREE.CylinderGeometry(0.035, 0.035, m.halfTrack * 2 - 0.25, 8).rotateZ(Math.PI / 2).translate(0, m.radius, m.front),
    new THREE.CylinderGeometry(0.04, 0.04, m.halfTrack * 2 - 0.25, 8).rotateZ(Math.PI / 2).translate(0, m.radius, m.rear),
    new THREE.BoxGeometry(0.28, 0.2, 0.26).translate(0, m.radius, m.rear),
    new THREE.CylinderGeometry(0.03, 0.03, m.front - m.rear - 0.4, 8).rotateX(Math.PI / 2).translate(0, 0.21, (m.front + m.rear) / 2),
  ];
  const from = new THREE.Vector3(tip.x * 0.4, 0.2, m.front - 0.3), dir = new THREE.Vector3().subVectors(tip, from);
  const pipe = new THREE.CylinderGeometry(0.03, 0.03, dir.length(), 8).translate(0, dir.length() / 2, 0);
  pipe.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())).translate(from.x, from.y, from.z);
  parts.push(pipe, new THREE.CylinderGeometry(0.09, 0.09, 0.42, 12).rotateX(Math.PI / 2).scale(1.5, 1, 1).translate(tip.x * 0.8, 0.26, m.rear - 0.25));   // the silencer: an oval drum, tucked up
  const under = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ name: 'fx_underbody', color: 0x1a1b1e, roughness: 0.75, metalness: 0.35 }));
  under.name = 'fx_underbody'; under.castShadow = false;
  // contact shadow: the car's own footprint, a little bigger than the body, lying on the road
  const shadowMap = shadowTexture();
  const shadow = new THREE.Mesh(flat(new THREE.PlaneGeometry(box.max.x - box.min.x + 0.7, len + 0.9, 2, 8)), new THREE.MeshBasicMaterial({ name: 'fx_shadow', color: 0xffffff, map: shadowMap, transparent: true, opacity: 0.85, depthWrite: false }));   // black pixels, the shape in their alpha
  shadow.position.set(0, 0.012, (box.max.z + box.min.z) / 2); shadow.renderOrder = 1; shadow.name = 'fx_shadow';
  // headlight pool on the road ahead
  const poolMap = poolTexture();
  const pool = new THREE.Mesh(flat(new THREE.PlaneGeometry(5, 11, 2, 6)), new THREE.MeshBasicMaterial({ name: 'fx_pool', color: new THREE.Color(1, 0.93, 0.8).multiplyScalar(spec.pool ?? 0.45), map: poolMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.set(0, 0.015, box.max.z - 0.2 + 5.5); pool.renderOrder = 2; pool.name = 'fx_pool';   // its near edge just under the bumper
  const fx = new THREE.Group(); fx.name = 'fx'; fx.add(under, shadow, pool);
  group.add(tag(fx));
  if (lite) {
    // the underbody into the body's own palette mesh (its faces on the black field): one draw call less
    const pal = group.getObjectByName('body_own_palette');
    if (pal) {
      const uv = under.geometry.attributes.uv, cell = spec.trimUv ?? [0.125, 0.875];
      if (uv) { for (let i = 0; i < uv.count; i++) uv.setXY(i, cell[0], cell[1]); mergeInto(pal, under); }
    }
    // the four wheels as one instanced mesh
    const fl = group.getObjectByName('wheel_fl_pivot')?.children[0]?.children.find((c) => c.isMesh);
    if (fl) { const ws = new WheelSet(fl.geometry, fl.material); ws.castShadow = fl.castShadow; fl.parent.parent.parent.add(ws); }
  }
  return m;
}

/**
 * The body apart from the wheels (call on the template, after dressCar): every part of the model except the wheels goes into `body_lean`, a group that turns
 * about a point 35 cm above the road (about where a car rolls and pitches about), so the game can dive and lean the body while the chassis and its wheels stay
 * on the road (sim/carpose.js). The copies of the car get it with the rest. Returns the group (null when the model has no wheels).
 */
export function leanBody(group) {
  const pivot = group.getObjectByName('wheel_fl_pivot') ?? group.getObjectByName('wheel_fl'), holder = pivot?.parent;
  if (!holder || group.getObjectByName('body_lean')) return group.getObjectByName('body_lean') ?? null;
  const lean = new THREE.Group(), inner = new THREE.Group(), centre = 0.35;
  lean.name = 'body_lean'; inner.name = 'body_lean_in'; lean.position.y = centre; inner.position.y = -centre; lean.add(inner);
  for (const c of [...holder.children]) if (!/^wheel_/.test(c.name) && !c.isInstancedMesh) inner.add(c);
  holder.add(lean);
  return lean;
}

/**
 * The parts and the behaviour of one car (call for each spawned copy): brake lights, flames and flash, underglow on the road.
 * `listen` (default: when there is a window): the flames follow the window event `car.pop`; dispose() stops listening.
 * @returns {{ update(dt, s): void, pop(strength, hold?): void, setGlow(hue|null): void, dispose(): void }} s = { brake 0..1 }
 */
export function carFx(car, spec = {}, { lite = false, listen = typeof window !== 'undefined' } = {}) {
  const m = measure(car.group), { box } = m;
  const lampCentres = (re) => {   // the middle of each side's lamp faces (car axes): [left, right]
    const sides = [new THREE.Box3(), new THREE.Box3()], v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(car.group.matrixWorld).invert();
    car.group.traverse((o) => {
      if (!o.isMesh || !re.test(o.material?.name ?? '')) return;
      const p = o.geometry.attributes.position, mm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mm); sides[v.x > 0 ? 0 : 1].expandByPoint(v); }
    });
    return sides.filter((b) => !b.isEmpty()).map((b) => ({ at: b.getCenter(new THREE.Vector3()), size: b.getSize(new THREE.Vector3()) }));
  };
  // brake lights: this car's own copies of the glowing rear lamps
  const brakeMats = new Map();
  car.group.traverse((o) => {
    if (!o.isMesh) return;
    const own = (mat) => {
      if (!/^lamp_rear_/i.test(mat?.name ?? '')) return mat;
      if (!brakeMats.has(mat)) {
        // the red lamp (the brake light): dim when only the lights are on, 3.5x brighter and a pink-red (a pure red over-exposed turns orange-white and the two states
        // looked the same) when braking: 11 on the red channel, well over the bloom threshold (2.8, the brightest channel counts), so the bloom catches it; the white parts (reverse, reflector) stay as they are
        const c = mat.clone(), red = c.emissive && c.emissive.r > 0.8 && c.emissive.g < 0.3 && c.emissive.b < 0.3;
        if (red) c.emissive.setRGB(1, 0.06, 0.16);
        c.userData.base = red ? 1.7 : 2.2; c.userData.boost = red ? 6.5 : 1; c.emissiveIntensity = c.userData.base; brakeMats.set(mat, c);
      }
      return brakeMats.get(mat);
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  // the wheels' pivots, for the squat (`side` +1 = left = +x, as the model's axes: older files name their sides the wrong way round, so the sign comes from the place)
  const wheelNodes = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => car.group.getObjectByName(n + '_pivot') ?? car.group.getObjectByName(n)).filter(Boolean)
    .map((node) => ({ node, front: node.position.z > 0, side: Math.sign(node.position.x) || 1 }));
  // flames: two crossed planes along the pipe (backwards), plus a round flash at the tip; a point light on the high tier
  const tips = (spec.exhaust ?? [[0.4, 0.3, box.min.z + 0.08]]).map((p) => new THREE.Vector3(...p));
  const flameMat = new THREE.MeshBasicMaterial({ name: 'fx_flame', map: flameTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const flashMat = new THREE.SpriteMaterial({ name: 'fx_flash', map: glowTexture(), color: new THREE.Color(1, 0.6, 0.25).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const groundFlashMat = new THREE.MeshBasicMaterial({ name: 'fx_flash_ground', map: glowTexture(), color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = tips.map((tip) => {
    const g = new THREE.Group(); g.position.copy(tip);
    const plane = new THREE.PlaneGeometry(0.13, 0.3).translate(0, 0.15, 0).rotateX(-Math.PI / 2);   // 30 cm long at most, pointing along -z (backwards)
    g.add(new THREE.Mesh(plane, flameMat), new THREE.Mesh(plane.clone().rotateZ(Math.PI / 2), flameMat));
    const flash = new THREE.Sprite(flashMat); flash.scale.setScalar(0.2); g.add(flash);
    // warm on the road under the rear: NOT in the flame's group (that one is turned about the pipe at every pop)
    const ground = new THREE.Mesh(flat(new THREE.PlaneGeometry(0.3, 0.3)), groundFlashMat); ground.position.set(tip.x, 0.02, tip.z - 0.1); ground.visible = false;
    g.visible = false; g.userData.flash = flash; g.userData.ground = ground;
    return g;
  });
  const lights = [];   // no real light: a point light this close over the glossy road drew a long streak towards the camera (the warm quad on the road is enough)
  // halos: a soft glow in front of each lamp (camera-facing, depth-tested so the body hides them), on every tier
  const haloTex = haloTexture(), haloMat = (c, k) => new THREE.SpriteMaterial({ name: 'fx_halo', map: haloTex, color: new THREE.Color(c).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rearHaloMat = haloMat(0xff2a18, 1.4), frontHaloMat = haloMat(0xfff0d8, 1.0);
  let rearOpacity = 0.55, haloK = 1;   // haloK: 0.5 when the post pass (bloom) is on: the bloom already glows every bright lamp, so the halo is half as strong then
  const halos = [];
  const haloPoints = [];   // the phone: all halos as one Points draw call
  for (const [re, mat, out, k] of [[/^lamp_rear_/i, rearHaloMat, -1, 0.62], [/^lamp_front_/i, frontHaloMat, 1, 0.55]]) {   // k * 0.5 m: a glow about as wide as the lamp's glass, not a balloon beside the body
    for (const l of lampCentres(re)) {
      if (lite) { haloPoints.push({ at: l.at.clone().add(new THREE.Vector3(0, 0, out * 0.05)), out, rear: out < 0, size: k * 0.55 }); continue; }
      const h = new THREE.Sprite(mat); h.position.copy(l.at).add(new THREE.Vector3(0, 0, out * 0.05)); h.scale.setScalar(k * 0.55);   // a fixed soft spot (about 30 cm), not the lamp's whole width
      h.userData.base = h.scale.x; h.userData.rear = out < 0; h.userData.out = out; halos.push(h);
      // a lamp's glow only shows from the side it shines to: faded out by the angle between the lamp's direction and the camera
      // (seen from behind, the front halos stuck out over the bonnet as two warm dots above the roof)
      h.onBeforeRender = (renderer, scene, camera) => {
        h.getWorldPosition(_hp); car.group.getWorldDirection(_fw).multiplyScalar(out);
        const facing = _fw.dot(_cd.subVectors(camera.position, _hp).normalize());
        h.material.opacity = (h.userData.rear ? rearOpacity : 1) * haloK * Math.max(0, Math.min(1, (facing - 0.05) / 0.35));
      };
    }
  }
  // underglow: one soft pad of light on the road under the whole car, no strips (seen from the side a lit strip was a hard line
  // under the door). It lies on the ground under each of its points, so it follows a slope and a crest (a flat sheet in the car's
  // axes cut into the road at every change of slope and flickered), and a polygon offset keeps it off the road's depth.
  const groundMat = new THREE.MeshBasicMaterial({ name: 'fx_glow_ground', map: padTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const glow = new THREE.Group(); glow.name = 'fx_glow';
  const mid = (box.max.z + box.min.z) / 2;
  const pad = new THREE.Mesh(flat(new THREE.PlaneGeometry(box.max.x - box.min.x + 1.0, box.max.z - box.min.z + 0.6, 4, 10)), groundMat); pad.name = 'fx_glow_pad'; pad.position.set(0, 0.02, mid); pad.renderOrder = 3; glow.add(pad);
  glow.visible = false;
  let haloCloud = null;
  if (haloPoints.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(haloPoints.flatMap((h) => h.at.toArray()), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(haloPoints.length * 3), 3));
    haloCloud = new THREE.Points(g, new THREE.PointsMaterial({ name: 'fx_halo_points', map: haloTex, size: Math.max(...haloPoints.map((h) => h.size)), sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    haloCloud.frustumCulled = false;
    const rearC = new THREE.Color(0xff2a18).multiplyScalar(1.4), frontC = new THREE.Color(0xfff0d8).multiplyScalar(1.0), c = g.attributes.color;
    haloCloud.onBeforeRender = (renderer, scene, camera) => {   // each halo by its own angle to the camera, the rear ones brighter when braking
      haloCloud.updateWorldMatrix(true, false); car.group.getWorldDirection(_fw);
      haloPoints.forEach((h, i) => {
        _hp.copy(h.at).applyMatrix4(haloCloud.matrixWorld);
        const facing = _fw.dot(_cd.subVectors(camera.position, _hp).normalize()) * h.out;
        const k = Math.max(0, Math.min(1, (facing - 0.05) / 0.35)) * (h.rear ? rearOpacity : 1) * haloK;
        const col = h.rear ? rearC : frontC; c.setXYZ(i, col.r * k, col.g * k, col.b * k);
      });
      c.needsUpdate = true;
    };
  }
  const fxg = new THREE.Group(); fxg.name = 'fx_live'; fxg.add(...flames, ...flames.map((f) => f.userData.ground), ...lights, ...halos, ...(haloCloud ? [haloCloud] : []), glow);
  (car.group.getObjectByName('body_lean_in') ?? car.group).add(tag(fxg));   // with the body: the flames stay at the pipe and the halos at the lamps when it dives

  const poolMesh = car.group.getObjectByName('fx_pool'), shadowMesh = car.group.getObjectByName('fx_shadow');
  // pops: one burst per event, its strength sets the size and one or two smaller after-bangs
  let queue = [], life = 0, strength = 0;
  const fire = (s) => {
    life = 0.033 + 0.033 * s; strength = s;   // 2 to 4 frames: a flame is only seen for an instant
    for (const f of flames) { f.visible = true; f.rotation.z = Math.random() * Math.PI; }
  };
  const onPop = (e) => {
    const st = Math.max(0.2, Math.min(1, e.detail?.strength ?? 1));
    fire(st);
    for (let i = 1, t = life + 0.03; i <= Math.round(st * 2); i++, t += 0.12 + Math.random() * 0.05) queue.push({ t, s: st * (1 - 0.3 * i) });   // each after-bang after the last one went out
  };
  if (listen) window.addEventListener('car.pop', onPop);
  return {
    flames, glow, brakeMats, halos,
    /** A pop now as if the event came (for pictures and tests); `hold` keeps the flame that many seconds. */
    pop(strength = 1, hold = 0) { onPop({ detail: { strength } }); if (hold) { life = hold; queue = []; } },   // held for a picture: no after-bangs (they would end it)
    dispose() { if (listen) window.removeEventListener('car.pop', onPop); },
    setGlow(hue) {
      glow.visible = hue !== null && hue !== undefined;
      if (glow.visible) groundMat.color.setHSL(hue / 24, 1, 0.55).multiplyScalar(0.6);
    },
    update(dt, s) {
      const braking = s.brake > 0.1;
      // the tyres squat a little under load: braking and the outer wheels of a bend (s.dive, s.lean: the body's own dive and lean from the pose; the tyre loses up to 4 %
      // of its height and bulges a little along the road). The wheel pivots carry it, so the phone's instanced wheels follow it too.
      if (s.dive !== undefined) for (const w of wheelNodes) {
        const load = Math.max(0, w.front ? s.dive / 0.05 : -s.dive / 0.05) * 0.45 + Math.max(0, -w.side * (s.lean ?? 0) / 0.08);
        const k = 0.045 * Math.min(1, load); w.node.scale.set(1, 1 - k, 1 + k * 0.5);
      }
      for (const mat of brakeMats.values()) mat.emissiveIntensity = mat.userData.base * (braking ? mat.userData.boost : 1);
      rearOpacity = braking ? 1 : 0.55; haloK = s.post ? 0.5 : 1;
      for (const h of halos) if (h.userData.rear) h.scale.setScalar(h.userData.base * (braking ? 1.6 : 1));   // braking: the glow jumps in size and strength
      // the headlight pool lies on the road: each of its points 1.5 cm over the ground under it (s.groundAt(x, z) in world space)
      // the contact shadow and the underglow too (a flat sheet cut into the road wherever the slope changes under the car)
      if (s.groundAt) {
        if (poolMesh) layOnGround(poolMesh, s.groundAt);
        if (shadowMesh) layOnGround(shadowMesh, s.groundAt, 0.012);
        if (glow.visible) layOnGround(pad, s.groundAt, 0.025);
      }
      for (const q of queue) q.t -= dt;
      const due = queue.filter((q) => q.t <= 0); queue = queue.filter((q) => q.t > 0);
      for (const q of due) fire(q.s);
      life -= dt;
      const on = life > 0, k = on ? Math.min(1, life / 0.05) : 0;
      flameMat.color.setRGB(1, 0.9 + 0.1 * strength, 0.7 + 0.6 * (1 - strength)).multiplyScalar(1.4 + 1.2 * strength);   // a weak pop is small and bluish
      for (const f of flames) {
        f.visible = on; f.userData.ground.visible = on;
        if (!on) continue;
        const len = (0.5 + 0.5 * strength) * (0.8 + 0.2 * k);   // 15 to 30 cm
        f.scale.set(0.7 + 0.3 * strength, 1, len);
        f.userData.flash.scale.setScalar((0.1 + 0.12 * strength) * k);   // at most 22 cm
        groundFlashMat.opacity = 0.15 * k * strength;
      }
      for (const l of lights) l.intensity = on ? 6 * strength * k : 0;
    },
  };
}
