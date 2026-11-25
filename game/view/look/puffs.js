// Tyre smoke as big soft clouds: round puffs in one instanced mesh (one draw call), lit by the sun, fading out through a per-puff
// opacity, towards their own edges (so no hard outline) and close to the camera (so the camera never sits in a wall of smoke). Same calls as fx.js's Smoke (emit, update), plus sync() once per drawn frame.
import * as THREE from '../../../vendor/three/three.module.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Puffs {
  constructor(look, capacity = 160, detail = 0) {
    this.cap = capacity; this.next = 0;
    this.pos = new Float32Array(capacity * 3); this.vel = new Float32Array(capacity * 3); this.rot = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(9); this.life = new Float32Array(capacity).fill(1); this.grow = new Float32Array(capacity);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.IcosahedronGeometry(1, detail);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.MeshLambertMaterial({ color: look.smoke.colour, emissive: new THREE.Color(look.smoke.shade).multiplyScalar(look.smoke.glow ?? 0.5), transparent: true, depthWrite: false });
    this.opacity = look.smoke.opacity ?? 0.45;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      sh.uniforms.uNear = { value: look.smoke.near ?? 3 };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;\nuniform float uNear;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= smoothstep(0.0, 0.5, abs(dot(normalize(vNormal), normalize(vViewPosition)))) * smoothstep(uNear, uNear + 2.5, length(vViewPosition));');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.seed = 1;
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  emit(x, y, z, vx, vz, strength) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx * 0.3 + (this.rnd() - 0.5) * 0.6, 0.45 + strength * 0.8, vz * 0.3 + (this.rnd() - 0.5) * 0.6], i * 3);
    this.rot.set([this.rnd() * 6, this.rnd() * 6, this.rnd() * 6], i * 3);
    this.age[i] = 0; this.life[i] = 0.8 + strength * 0.8; this.grow[i] = 0.8 + this.rnd() * 0.5;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      this.vel[i * 3] *= 1 - dt * 1.2; this.vel[i * 3 + 2] *= 1 - dt * 1.2;
      this.rot[i * 3] += dt * 0.4;
    }
  }
  /** Write the puffs into the instanced mesh (once per drawn frame). */
  sync() {
    for (let i = 0; i < this.cap; i++) {
      const k = this.age[i] / this.life[i];
      if (k >= 1) { this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); this.alpha.array[i] = 0; continue; }
      const size = (0.65 + k * 2.8) * this.grow[i];
      _p.fromArray(this.pos, i * 3); _q.setFromEuler(_e.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2])); _s.set(size, size * 0.75, size);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.alpha.array[i] = this.opacity * (1 - k) * Math.min(1, k * 6);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}
