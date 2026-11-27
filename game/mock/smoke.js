// Tyre smoke as the mockup paints it: big lumpy clouds with a lit top and a mauve underside, dense in the middle and soft at the edge. Each lump is
// a coarse ball whose corners are pushed in and out by a slow noise; it is shaded by the stage's light model (half faceted, half round) and fades
// where its surface turns away from the eye, so many of them melt into one cloud. One instanced draw call; sorted far to near.
import * as THREE from '../../vendor/three/three.module.js';
import { shared, HAZE_PARS } from './toon.js';

export class Smoke {
  constructor(max = 160) {
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.IcosahedronGeometry(1, 3));
    this.max = max; this.puffs = [];
    this.aSeed = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); g.setAttribute('aSeed', this.aSeed);
    this.uniforms = { ...shared, uTime: { value: 0 }, uLit: { value: new THREE.Color(1.12, 0.97, 1.0) }, uShade: { value: new THREE.Color(0.66, 0.5, 0.76) }, uGround: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; uniform float uTime; varying vec3 vN, vW; varying float vA, vG;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
        void main() {
          vec3 d = normalize(position), q = d * 1.5 + aSeed.x * 37.0 + vec3(0.0, uTime * 0.12, uTime * 0.05);
          float b = n3(q) * 0.6 + n3(q * 2.3) * 0.3;                                   // lumps
          vec3 p = d * (0.66 + 0.5 * b);
          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0); vW = w.xyz;
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normalize(d + (b - 0.45) * d * 0.6)); vA = aSeed.y; vG = aSeed.z;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLit, uShade, uRim; uniform float uGround; varying vec3 vN, vW; varying float vA, vG; ${HAZE_PARS}
        void main() {
          vec3 flatN = normalize(cross(dFdx(vW), dFdy(vW))), n = normalize(mix(normalize(vN), flatN, 0.3)), v = normalize(cameraPosition - vW);
          float ndv = max(dot(normalize(vN), v), 0.0);
          float lit = smoothstep(-0.3, 0.8, dot(n, uSun)) * 0.5 + 0.5 * smoothstep(-0.1, 0.95, n.y);
          vec3 c = mix(uShade, uLit, pow(lit, 1.5));
          c += uRim * pow(1.0 - ndv, 2.0) * max(dot(-v, uSun), 0.0) * 0.9;              // the low sun shines through the thin edge
          float a = smoothstep(0.0, 0.4, ndv) * vA * smoothstep(0.9, 2.8, distance(cameraPosition, vW)) * smoothstep(uGround + vG - 0.05, uGround + vG + 0.55, vW.y);
          gl_FragColor = vec4(hazed(c, vW, 1.0), a); }` });
    this.mesh = new THREE.InstancedMesh(g, mat, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.name = 'smoke';
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.v = new THREE.Vector3();
  }
  /** A lump: where, how big (radius in metres), how dense (0..1). */
  add(x, y, z, size, alpha = 1) { if (this.puffs.length < this.max) this.puffs.push({ p: new THREE.Vector3(x, y, z), size, alpha, ground: 0, seed: Math.random() * 10, spin: Math.random() * 6.28 }); }
  /** A lump from a sliding tyre: at the contact point (ground height y), strength k 0..1, drifting with (vx, vz) m/s; it grows, rises and fades over its life. The oldest goes when the pool is full. */
  emit(x, y, z, k, vx = 0, vz = 0) { if (this.puffs.length >= this.max) this.puffs.splice(this.puffs.findIndex((u) => u.life), 1);
    const size0 = 0.26 + 0.24 * k; this.puffs.push({ p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, y + size0 * 0.6, z + (Math.random() - 0.5) * 0.3), v: new THREE.Vector3(vx * 0.12 + (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.5, vz * 0.12 + (Math.random() - 0.5) * 0.5),
      size: size0, size0, grow: (0.85 + Math.random() * 0.8) * (0.5 + k), alpha: 0, top: 0.62 + 0.34 * k, age: 0, life: 2.0 + 2.2 * k + Math.random() * 0.9, ground: y - this.uniforms.uGround.value, seed: Math.random() * 10, spin: Math.random() * 6.28 }); }
  /** Moves the living lumps on by dt seconds. */
  tick(dt) { for (let i = this.puffs.length - 1; i >= 0; i--) { const u = this.puffs[i]; if (!u.life) continue; u.age += dt; if (u.age >= u.life) { this.puffs.splice(i, 1); continue; }
    const t = u.age / u.life; u.p.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - 1.4 * dt); u.v.y = Math.max(u.v.y, 0.12); u.size = u.size0 + u.grow * (1 - Math.exp(-u.age * 1.1)); u.alpha = u.top * Math.min(1, u.age * 9) * (1 - t * t); } }
  clear() { this.puffs = this.puffs.filter((u) => !u.life); }
  update(t, camera) {
    this.uniforms.uTime.value = t;
    for (const u of this.puffs) u.d = u.p.distanceToSquared(camera.position);
    this.puffs.sort((a, b) => b.d - a.d);
    this.puffs.forEach((u, i) => { const k = u.size * (1 + 0.04 * Math.sin(t * 0.7 + u.seed * 5));
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), u.spin + t * 0.03); this.mesh.setMatrixAt(i, this.m.compose(u.p, this.q, this.s.set(k * 1.15, k * 0.92, k * 1.15))); this.aSeed.setXYZ(i, u.seed, u.alpha, u.ground ?? 0); });
    this.mesh.count = this.puffs.length; this.mesh.instanceMatrix.needsUpdate = true; this.aSeed.needsUpdate = true;
  }
}
