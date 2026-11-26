// What a model car gets besides its file: an underbody (frame, axles, drive shaft, exhaust pipe in rough strokes), a contact
// shadow in the car's own shape, a pool of headlight on the road ahead, brake lights that brighten when braking, underglow as
// two light strips along the sills, and flames with a flash at the exhaust when the throttle is lifted or the box shifts up.
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
  return { box, front, rear, halfTrack, radius };
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
const flameTexture = () => canvasTexture(64, 64, (x, w, h) => {
  // a short tongue seen from the side: white-blue core at the pipe (bottom), yellow, orange at the edge, gone at the top
  const g = x.createRadialGradient(w / 2, h * 0.92, 0, w / 2, h * 0.92, h * 0.85);
  g.addColorStop(0, 'rgba(225,235,255,1)'); g.addColorStop(0.18, 'rgba(255,230,150,1)'); g.addColorStop(0.45, 'rgba(255,135,40,0.85)'); g.addColorStop(0.75, 'rgba(120,90,255,0.25)'); g.addColorStop(1, 'rgba(60,40,200,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(w * 0.5, 0); x.bezierCurveTo(w * 1.05, h * 0.45, w * 0.8, h, w * 0.5, h); x.bezierCurveTo(w * 0.2, h, -w * 0.05, h * 0.45, w * 0.5, 0); x.fill();
});
const glowTexture = () => canvasTexture(64, 64, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
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
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
/** Moves each vertex of a flat sheet (child of a car) to 1.5 cm above the ground under it; keeps its own x and z. */
function layOnGround(mesh, groundAt) {
  const p = mesh.geometry.attributes.position;
  if (!mesh.userData.flatY) mesh.userData.flatY = Float32Array.from({ length: p.count }, (_, i) => p.getY(i));
  mesh.updateWorldMatrix(true, false);
  _inv.copy(mesh.matrixWorld).invert();
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), mesh.userData.flatY[i], p.getZ(i)).applyMatrix4(mesh.matrixWorld);
    _v.y = groundAt(_v.x, _v.z) + 0.015;
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
export function splitPalette(group, uvAt, material, tol = 0.06, { all = false, only = null } = {}) {
  let made = null; const list = [];
  group.traverse((o) => { if (o.isMesh) list.push(o); });
  for (const o of list) {
    if ((made && !all) || (only && !only.test(o.name)) || !o.isMesh || !/palette/i.test(o.material?.name ?? '') || !o.geometry.attributes.uv) continue;
    const g = o.geometry, uv = g.attributes.uv, idx = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    const on = (i) => Math.abs(uv.getX(i) - uvAt[0]) < tol && Math.abs(uv.getY(i) - uvAt[1]) < tol;
    const keep = [], take = [];
    for (let t = 0; t < idx.length; t += 3) (on(idx[t]) && on(idx[t + 1]) && on(idx[t + 2]) ? take : keep).push(idx[t], idx[t + 1], idx[t + 2]);
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
export function treadTyres(group, uvAt, colour = 0x1b1b1d) {
  const mat = new THREE.MeshStandardMaterial({ name: 'fx_tyre', color: colour, roughness: 0.9, metalness: 0, normalMap: treadTexture(), normalScale: new THREE.Vector2(0.9, 0.9) });
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
    o.geometry = g; n++;
  });
  return n;
}

export function dressCar(group, spec = {}, { lite = false } = {}) {
  // windows: their own dark tinted glass, a weak reflection of the sky (the palette's glass reflected it fully: a pale plate)
  if (spec.tyreUv) treadTyres(group, spec.tyreUv);
  if (spec.glassUv) {
    let env = null; group.traverse((o) => { if (o.isMesh && !env) env = o.material?.envMap ?? null; });
    splitPalette(group, spec.glassUv, new THREE.MeshStandardMaterial({ name: 'fx_glass', color: 0x05070b, metalness: 0, roughness: 0.06, envMap: env, envMapIntensity: 0.32 }));
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
  const shadow = new THREE.Mesh(flat(new THREE.PlaneGeometry(box.max.x - box.min.x + 0.7, len + 0.9)), new THREE.MeshBasicMaterial({ name: 'fx_shadow', color: 0xffffff, map: shadowMap, transparent: true, opacity: 0.85, depthWrite: false }));   // black pixels, the shape in their alpha
  shadow.position.set(0, 0.012, (box.max.z + box.min.z) / 2); shadow.renderOrder = 1; shadow.name = 'fx_shadow';
  // headlight pool on the road ahead
  const poolMap = poolTexture();
  const pool = new THREE.Mesh(flat(new THREE.PlaneGeometry(5, 11, 2, 6)), new THREE.MeshBasicMaterial({ name: 'fx_pool', color: new THREE.Color(1, 0.93, 0.8).multiplyScalar(spec.pool ?? 0.45), map: poolMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.set(0, 0.015, box.max.z - 0.2 + 5.5); pool.renderOrder = 2; pool.name = 'fx_pool';   // its near edge just under the bumper
  const fx = new THREE.Group(); fx.name = 'fx'; fx.add(under, shadow, pool);
  group.add(tag(fx));
  return m;
}

/**
 * The parts and the behaviour of one car (call for each spawned copy): brake lights, flames and flash, underglow strips.
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
      if (!brakeMats.has(mat)) { const c = mat.clone(); c.userData.base = Math.max(3.2, mat.emissiveIntensity); c.emissiveIntensity = c.userData.base; brakeMats.set(mat, c); }
      return brakeMats.get(mat);
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  // flames: two crossed planes along the pipe (backwards), plus a round flash at the tip; a point light on the high tier
  const tips = (spec.exhaust ?? [[0.4, 0.3, box.min.z + 0.08]]).map((p) => new THREE.Vector3(...p));
  const flameMat = new THREE.MeshBasicMaterial({ name: 'fx_flame', map: flameTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const flashMat = new THREE.SpriteMaterial({ name: 'fx_flash', map: glowTexture(), color: new THREE.Color(1, 0.6, 0.25).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const groundFlashMat = new THREE.MeshBasicMaterial({ name: 'fx_flash_ground', map: glowTexture(), color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = tips.map((tip) => {
    const g = new THREE.Group(); g.position.copy(tip);
    const plane = new THREE.PlaneGeometry(0.16, 0.3).translate(0, 0.15, 0).rotateX(-Math.PI / 2);   // 30 cm, pointing along -z (backwards)
    g.add(new THREE.Mesh(plane, flameMat), new THREE.Mesh(plane.clone().rotateZ(Math.PI / 2), flameMat));
    const flash = new THREE.Sprite(flashMat); flash.scale.setScalar(0.3); g.add(flash);
    // warm on the road under the rear: NOT in the flame's group (that one is turned about the pipe at every pop)
    const ground = new THREE.Mesh(flat(new THREE.PlaneGeometry(0.55, 0.55)), groundFlashMat); ground.position.set(tip.x, 0.02, tip.z - 0.1); ground.visible = false;
    g.visible = false; g.userData.flash = flash; g.userData.ground = ground;
    return g;
  });
  const lights = [];   // no real light: a point light this close over the glossy road drew a long streak towards the camera (the warm quad on the road is enough)
  // halos: a soft glow in front of each lamp (camera-facing, depth-tested so the body hides them), on every tier
  const haloMat = (c, k) => new THREE.SpriteMaterial({ name: 'fx_halo', map: glowTexture(), color: new THREE.Color(c).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rearHaloMat = haloMat(0xff2a18, 0.9), frontHaloMat = haloMat(0xfff0d8, 0.7);
  const halos = [];
  for (const [re, mat, out, k] of [[/^lamp_rear_/i, rearHaloMat, -1, 0.62], [/^lamp_front_/i, frontHaloMat, 1, 0.55]]) {
    for (const l of lampCentres(re)) {
      const h = new THREE.Sprite(mat); h.position.copy(l.at).add(new THREE.Vector3(0, 0, out * 0.05)); h.scale.setScalar(k * 0.75);   // a fixed soft spot (35 to 40 cm), not the lamp's whole width
      h.userData.base = h.scale.x; h.userData.rear = out < 0; halos.push(h);
    }
  }
  // underglow: a thin light strip under each sill and one soft pad of light on the road under the whole car
  const stripMat = new THREE.MeshBasicMaterial({ name: 'fx_glow_strip', color: 0xffffff, toneMapped: false });
  const groundMat = new THREE.MeshBasicMaterial({ name: 'fx_glow_ground', map: padTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Group(); glow.name = 'fx_glow';
  const sideX = Math.max(0.4, m.halfTrack - 0.02), glowLen = Math.max(1, m.front - m.rear - 0.75), mid = (box.max.z + box.min.z) / 2;
  for (const s of [-1, 1]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, glowLen), stripMat); strip.position.set(s * sideX, 0.16, (m.front + m.rear) / 2); glow.add(strip); }
  const pad = new THREE.Mesh(flat(new THREE.PlaneGeometry(box.max.x - box.min.x + 1.0, box.max.z - box.min.z + 0.2)), groundMat); pad.position.set(0, 0.018, mid); pad.renderOrder = 3; glow.add(pad);
  glow.visible = false;
  const fxg = new THREE.Group(); fxg.name = 'fx_live'; fxg.add(...flames, ...flames.map((f) => f.userData.ground), ...lights, ...halos, glow);
  car.group.add(tag(fxg));

  const poolMesh = car.group.getObjectByName('fx_pool');
  // pops: one burst per event, its strength sets the size and one or two smaller after-bangs
  let queue = [], life = 0, strength = 0;
  const fire = (s) => {
    life = 0.06 + 0.06 * s; strength = s;   // 60 to 120 ms
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
      if (glow.visible) { const c = new THREE.Color().setHSL(hue / 24, 1, 0.55); stripMat.color.copy(c).multiplyScalar(2.2); groundMat.color.copy(c).multiplyScalar(0.45); }
    },
    update(dt, s) {
      const braking = s.brake > 0.1;
      for (const mat of brakeMats.values()) mat.emissiveIntensity = mat.userData.base * (braking ? 2.5 : 1);
      rearHaloMat.opacity = braking ? 1 : 0.55;
      for (const h of halos) if (h.userData.rear) h.scale.setScalar(h.userData.base * (braking ? 1.35 : 1));
      // the headlight pool lies on the road: each of its points 1.5 cm over the ground under it (s.groundAt(x, z) in world space)
      if (s.groundAt && poolMesh) layOnGround(poolMesh, s.groundAt);
      for (const q of queue) q.t -= dt;
      const due = queue.filter((q) => q.t <= 0); queue = queue.filter((q) => q.t > 0);
      for (const q of due) fire(q.s);
      life -= dt;
      const on = life > 0, k = on ? Math.min(1, life / 0.05) : 0;
      flameMat.color.setRGB(1, 0.9 + 0.1 * strength, 0.7 + 0.6 * (1 - strength)).multiplyScalar(1.4 + 1.2 * strength);   // a weak pop is small and bluish
      for (const f of flames) {
        f.visible = on; f.userData.ground.visible = on;
        if (!on) continue;
        const len = (0.7 + 0.6 * strength) * (0.7 + 0.3 * k);   // 20 to 40 cm
        f.scale.set(0.8 + 0.4 * strength, 1, len);
        f.userData.flash.scale.setScalar((0.2 + 0.25 * strength) * k);
        groundFlashMat.opacity = 0.6 * k * strength;
      }
      for (const l of lights) l.intensity = on ? 6 * strength * k : 0;
    },
  };
}
