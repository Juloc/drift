// Tyre smoke as painted billows: camera-facing quads in one instanced mesh (one draw call) with a cloud texture drawn here (a cluster
// of round puffs, light on top, rosy-grey underneath, soft edges). Same calls as puffs.js (emit, update, sync, car). Cheap on a phone:
// two triangles a puff.
import * as THREE from '../../../vendor/three/three.module.js';

/** A cluster of soft round puffs on a canvas (no file). */
function billowTexture(light, shade, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), s = size / 128;
  const blobs = [[64, 70, 34], [40, 76, 24], [88, 78, 24], [52, 50, 24], [78, 52, 22], [64, 36, 18], [30, 92, 15], [98, 94, 15]];
  for (const [bx, by, r] of blobs) {
    const g = x.createRadialGradient((bx - r * 0.3) * s, (by - r * 0.45) * s, r * 0.1 * s, bx * s, by * s, r * s);
    g.addColorStop(0, light); g.addColorStop(0.55, light); g.addColorStop(0.9, shade); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(bx * s, by * s, r * s, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Billows {
  constructor(look, capacity = 120) {
    this.cap = capacity; this.next = 0; this.seed = 7;
    this.pos = new Float32Array(capacity * 3); this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(9); this.life = new Float32Array(capacity).fill(1); this.grow = new Float32Array(capacity); this.spin = new Float32Array(capacity);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);   // centre xyz, size
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);  // opacity, turn
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    geo.setAttribute('aData', this.data); geo.setAttribute('aAlpha', this.alpha); geo.instanceCount = capacity;
    this.car = { value: new THREE.Vector3(0, -999, 0) };
    const S = look.smoke;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: billowTexture(S.colour, S.shade) }, uCar: this.car, uClear: { value: S.clear ?? 0 }, uNear: { value: S.near ?? 3 }, uTint: { value: new THREE.Color(S.tint ?? '#ffffff').multiplyScalar(S.bright ?? 1) } },   // brighter than white: lit by the low sun
      vertexShader: /* glsl */ `
        attribute vec4 aData; attribute vec2 aAlpha;
        varying vec2 vUv; varying float vA; varying vec3 vW; varying float vDist;
        void main() {
          vUv = uv; vA = aAlpha.x; vW = aData.xyz;
          float c = cos(aAlpha.y), s = sin(aAlpha.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aData.w;
          vec4 mv = modelViewMatrix * vec4(aData.xyz, 1.0);
          mv.xy += p; vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform vec3 uCar, uTint; uniform float uClear, uNear;
        varying vec2 vUv; varying float vA; varying vec3 vW; varying float vDist;
        void main() {
          vec4 t = texture2D(tMap, vUv);
          float a = t.a * vA * smoothstep(uNear, uNear + 2.5, vDist) * (uClear > 0.0 ? smoothstep(uClear * 0.6, uClear + 1.5, distance(vW.xz, uCar.xz)) : 1.0);
          if (a < 0.01) discard;
          gl_FragColor = vec4(t.rgb * uTint, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.opacity = S.opacity ?? 0.9;
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  emit(x, y, z, vx, vz, strength) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos.set([x, y + 0.3, z], i * 3);
    this.vel.set([vx + (this.rnd() - 0.5) * 1.4, 0.35 + strength * 0.4, vz + (this.rnd() - 0.5) * 1.4], i * 3);
    this.age[i] = 0; this.life[i] = 1.6 + strength * 1.4; this.grow[i] = 0.8 + this.rnd() * 0.6; this.spin[i] = this.rnd() * 6.28;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      this.vel[i * 3] *= 1 - dt * 0.7; this.vel[i * 3 + 2] *= 1 - dt * 0.7;
    }
  }
  sync() {
    const d = this.data.array, al = this.alpha.array;
    for (let i = 0; i < this.cap; i++) {
      const k = this.age[i] / this.life[i];
      d[i * 4] = this.pos[i * 3]; d[i * 4 + 1] = this.pos[i * 3 + 1]; d[i * 4 + 2] = this.pos[i * 3 + 2];
      d[i * 4 + 3] = k >= 1 ? 0 : (1.6 + k * 5.5) * this.grow[i];
      al[i * 2] = k >= 1 ? 0 : this.opacity * Math.sqrt(1 - k) * Math.min(1, k * 5); al[i * 2 + 1] = this.spin[i] + k * 0.6;
    }
    this.data.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}
