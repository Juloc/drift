// All wheels of all cars in one instanced mesh (one draw call), plus the shadow blobs under the cars (one more).
import * as THREE from '../../vendor/three/three.module.js';
import { makeClay } from '../core/materials.js';
import { WHEEL } from './carmodel.js';

export class WheelPool {
  constructor(capacityCars = 16) {
    const tyre = new THREE.CylinderGeometry(WHEEL.r, WHEEL.r, WHEEL.w, 14, 1).rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(WHEEL.r * 0.55, WHEEL.r * 0.55, WHEEL.w + 0.04, 8, 1).rotateZ(Math.PI / 2);
    const col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), k = new THREE.Color(c); for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const geo = mergeTwo(col(tyre, 0x24262d), col(hub, 0xd8d4c8));
    this.mesh = new THREE.InstancedMesh(geo, makeClay(), capacityCars * 4);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // soft round shadow under each car: a flat disc with a radial alpha ramp, instanced
    const blob = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    const bm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.blobs = new THREE.InstancedMesh(blob, bm, capacityCars);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobs.renderOrder = 1;
    this._m = new THREE.Matrix4();
    this.n = 0;
  }
  begin() { this.n = 0; this.blobCount = 0; }
  /** Matrix of a wheel: parent = car matrix, local position, steering angle (y), spin angle (x). */
  wheel(parent, lx, lz, steer, spin) {
    const m = this._m.makeTranslation(lx, WHEEL.r, lz);
    if (steer) m.multiply(_ry.makeRotationY(steer));
    m.multiply(_rx.makeRotationX(spin));
    m.premultiply(parent);
    this.mesh.setMatrixAt(this.n++, m);
  }
  blob(x, z, sx, sz, ry, y = 0) {
    const m = this._m.compose(_p.set(x, 0.03 + y, z), _q.setFromAxisAngle(_up, ry), _s.set(sx, 1, sz));
    this.blobs.setMatrixAt(this.blobCount++, m);
  }
  end() {
    this.mesh.count = this.n;
    this.blobs.count = this.blobCount;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.blobs.instanceMatrix.needsUpdate = true;
  }
}
const _rx = new THREE.Matrix4(), _ry = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const x = a.attributes[name].array, y = b.attributes[name].array, o = new Float32Array(x.length + y.length);
    o.set(x); o.set(y, x.length);
    g.setAttribute(name, new THREE.BufferAttribute(o, 3));
  }
  const na = a.attributes.position.count;
  const ia = a.index.array, ib = b.index.array, idx = new Uint16Array(ia.length + ib.length);
  idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/**
 * Underglow: one glowing patch under each lit car, all in ONE instanced mesh (one draw call): an additive quad with a soft round fall-off,
 * no real light, so it costs next to nothing on the phone tier. Colour per instance.
 */
export class GlowPool {
  constructor(capacity = 16) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d').createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(0));
    this.n = 0;
    this._c = new THREE.Color();
    this._m = new THREE.Matrix4();
  }
  begin() { this.n = 0; }
  /** x, z in drawing space, ry = the car's yaw there, hue = index 0..23, strength = 1 (a bit more at night). */
  add(x, z, ry, hue, strength = 1, y = 0) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this._m.compose(_p.set(x, 0.1 + y, z), _q.setFromAxisAngle(_up, ry), _s.set(4.4, 1, 6.2));
    this.mesh.setMatrixAt(this.n, this._m);
    this.mesh.setColorAt(this.n, this._c.setHSL((hue * 15) / 360, 1, 0.55).multiplyScalar(strength));
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
