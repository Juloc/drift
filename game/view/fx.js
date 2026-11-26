// Tyre smoke (soft round points, one draw call) and skid marks (a ring of ground quads, one draw call).
import * as THREE from '../../vendor/three/three.module.js';

export class Smoke {
  constructor(capacity = 320) {
    this.cap = capacity; this.next = 0;
    this.pos = new Float32Array(capacity * 3); this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(9); this.life = new Float32Array(capacity).fill(1);
    this.size = new Float32Array(capacity); this.alpha = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float size; attribute float alpha; uniform float uScale; varying float vA;
        void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(size * uScale / -mv.z, 160.0); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.93, 0.93, 0.95), a); }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = 4;
  }
  emit(x, y, z, vx, vz, strength) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx * 0.3, 0.5 + strength, vz * 0.3], i * 3);
    this.age[i] = 0; this.life[i] = 0.7 + strength * 0.6; this.size[i] = 1.2; this.alpha[i] = 0.5;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = 1.2 + k * 3.2; this.alpha[i] = 0.5 * (1 - k) * (k < 0.1 ? k * 10 : 1);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
  resize(bufferHeight, fovDeg) { this.material.uniforms.uScale.value = (bufferHeight * 0.5) / Math.tan((fovDeg * Math.PI) / 360); }
}

export class Skids {
  constructor(quads = 1500) {
    this.cap = quads; this.next = 0;
    this.pos = new Float32Array(quads * 12);
    const idx = new Uint16Array(quads * 6);
    for (let i = 0; i < quads; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.last = new Map();
  }
  /** wheel key (a small integer per wheel), ground position, forward direction (for the width), `on` = marking now, `y` = the ground's drawn height (0 in the game). */
  /** gx, gz: the surface's gradient there (drawing axes), so the mark lies in the road's plane across a banked road, not level */
  mark(wheel, x, z, fx, fz, on, y = 0, gx = 0, gz = 0) {
    const prev = this.last.get(wheel);
    if (!on) { this.last.delete(wheel); return; }
    this.last.set(wheel, [x, z, y, gx, gz]);
    if (!prev) return;
    const dx = x - prev[0], dz = z - prev[1], l = Math.hypot(dx, dz);
    if (l < 0.15) { this.last.set(wheel, prev); return; }
    const nx = (-dz / l) * 0.14, nz = (dx / l) * 0.14, i = this.next * 12;
    this.next = (this.next + 1) % this.cap;
    const y0 = (prev[2] ?? 0) + 0.02, y1 = y + 0.02, t0 = nx * (prev[3] ?? 0) + nz * (prev[4] ?? 0), t1 = nx * gx + nz * gz;   // the height across the mark's width
    this.pos.set([prev[0] - nx, y0 - t0, prev[1] - nz, prev[0] + nx, y0 + t0, prev[1] + nz, x - nx, y1 - t1, z - nz, x + nx, y1 + t1, z + nz], i);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  clear() { this.pos.fill(0); this.last = new Map(); this.mesh.geometry.attributes.position.needsUpdate = true; }
}
