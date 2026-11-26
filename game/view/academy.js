// The drift academy drawn with plain shapes (stage A1: no look work): ONE instanced mesh for all cones (they fall when hit and stand up on reset), ONE mesh for all paint (flat strips),
// the grip zones as flat areas, ONE instanced mesh for the barrier and the walls. Everything reads the map file's `academy` part (tools/make-academy.mjs). The view's x is mirrored (view/space.js X).
import * as THREE from '../../vendor/three/three.module.js';
import { X } from './space.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Flat strips of `width` metres along polylines, as one geometry (`y` over the ground). */
function stripGeometry(lines, width, y) {
  const pos = [], idx = [];
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const [x0, z0] = l[i], [x1, z1] = l[i + 1], dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const nx = (-dz / len) * width / 2, nz = (dx / len) * width / 2, b = pos.length / 3;
    pos.push(X(x0 + nx), y, z0 + nz, X(x0 - nx), y, z0 - nz, X(x1 - nx), y, z1 - nz, X(x1 + nx), y, z1 + nz);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

/** A flat filled polygon (may be concave) at height `y`. */
function polyGeometry(poly, y) {
  const pts = poly.map(([x, z]) => new THREE.Vector2(X(x), z)), tri = THREE.ShapeUtils.triangulateShape(pts, []);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, y, p.y]), 3)); g.setIndex(tri.flat());
  return g;
}

const flat = (color, opacity, order) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** The place: paint, zones, walls and barrier. Returns { group, zones: { wet: [meshes] } } (the wet pad can be switched off). */
export function buildPlace(json, groundY = () => 0) {
  const group = new THREE.Group(), y0 = groundY(0, 0), A = json.academy;
  group.name = 'academy';
  // paint: white strips 0.25 m wide
  const paint = new THREE.Mesh(stripGeometry(json.paint.map((p) => p.pts), 0.25, y0 + 0.05), flat(0xf4f1ea, 0.95));
  paint.renderOrder = 2; group.add(paint);
  // the zones: the wet pad darker and bluish, the clipping zone in the accent colour, the braking box amber
  const colours = { wet: [0x1a2a44, 0.6], clip: [0xe0409a, 0.45], brake: [0xffb000, 0.3] }, wet = [];
  for (const z of A.zones) {
    const [c, o] = colours[z.kind] ?? [0x888888, 0.3], m = new THREE.Mesh(polyGeometry(z.poly, y0 + 0.03), flat(c, o));
    m.renderOrder = 1; group.add(m); if (z.kind === 'wet') wet.push(m);
  }
  // barrier all round the pad and the walls of the exercises: plain blocks in one instanced mesh
  const segs = [], ring = [[A.pad.x0, A.pad.z0], [A.pad.x1, A.pad.z0], [A.pad.x1, A.pad.z1], [A.pad.x0, A.pad.z1], [A.pad.x0, A.pad.z0]];
  for (let i = 0; i < ring.length - 1; i++) segs.push([ring[i], ring[i + 1], 0.9, 0.7, 0x8a8f9c]);
  for (const w of json.walls) for (let i = 0; i < w.pts.length - 1; i++) segs.push([w.pts[i], w.pts[i + 1], 1.2, 0.5, 0xb9b4aa]);
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), segs.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  segs.forEach(([a, b, h, th, c], i) => {
    const ax = X(a[0]), bx = X(b[0]), len = Math.hypot(bx - ax, b[1] - a[1]) + th * 0.5, ang = -Math.atan2(b[1] - a[1], bx - ax);
    m4.compose(new THREE.Vector3((ax + bx) / 2, y0 + h / 2, (a[1] + b[1]) / 2), q.setFromAxisAngle(UP, ang), new THREE.Vector3(len, h, th));
    blocks.setMatrixAt(i, m4); blocks.setColorAt(i, col.set(c));
  });
  blocks.instanceMatrix.needsUpdate = true; if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  group.add(blocks);
  return { group, wet };
}

/** All cones of the place as one instanced mesh. `cones`: [{ x, z, what }]; a hit cone falls the way the car went (`fall`), `standAll` stands them up again, both animated by `update(dt)`. */
export class ConeField {
  constructor(cones, groundY = () => 0) {
    this.cones = cones; this.y = groundY(0, 0); this.n = cones.length;
    const g = new THREE.ConeGeometry(0.17, 0.7, 10); g.translate(0, 0.35, 0);   // the base at the ground: a fallen cone turns about it
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xff6a1a, emissive: 0x401800 }), Math.max(1, this.n));
    this.mesh.frustumCulled = false;
    this.ang = new Float32Array(this.n);   // 0 standing .. 1 lying
    this.target = new Float32Array(this.n); this.dir = new Float32Array(this.n * 3);   // the fall direction (view x, z) and how far it slides
    this.dirty = true; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.axis = new THREE.Vector3();
    this.refresh();
  }
  fall(i, dx, dz, v) { this.target[i] = 1; this.dir[i * 3] = -dx; this.dir[i * 3 + 1] = dz; this.dir[i * 3 + 2] = 0.4 + 1.6 * v; this.dirty = true; }
  standAll() { this.target.fill(0); this.dirty = true; }
  update(dt) {
    if (!this.dirty) return;
    let moving = false;
    for (let i = 0; i < this.n; i++) { const d = this.target[i] - this.ang[i]; if (d !== 0) { this.ang[i] = Math.abs(d) < 0.001 ? this.target[i] : this.ang[i] + Math.sign(d) * Math.min(Math.abs(d), dt * (d > 0 ? 7 : 3)); moving = true; } }
    this.refresh(); this.dirty = moving;
  }
  refresh() {
    for (let i = 0; i < this.n; i++) {
      const c = this.cones[i], a = this.ang[i], dx = this.dir[i * 3], dz = this.dir[i * 3 + 1], slide = a * this.dir[i * 3 + 2];
      if (a === 0) { this.q.identity(); this.axis.set(X(c.x), this.y, c.z); }
      else { const l = Math.hypot(dx, dz) || 1; this.q.setFromAxisAngle(this.axis.set(dz / l, 0, -dx / l), a * (Math.PI / 2) * 0.96); this.axis.set(X(c.x) + (dx / l) * slide, this.y, c.z + (dz / l) * slide); }
      this.m4.compose(this.axis, this.q, new THREE.Vector3(1, 1, 1)); this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** How many cones of a group (`what`) lie down. */
  downCount(range) { let n = 0; for (let i = range[0]; i < range[1]; i++) if (this.target[i] === 1) n++; return n; }
}
