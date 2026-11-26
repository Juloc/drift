// Tyre smoke as painted billows: camera-facing quads in one instanced mesh (one draw call) with a cloud texture drawn here (a cluster
// of round puffs, light on top, rosy-grey underneath, soft edges). Same calls as puffs.js (emit, update, sync, car). Cheap on a phone:
// two triangles a puff.
import * as THREE from '../../../vendor/three/three.module.js';

/** A soft wisp (look.smoke.texture 'wisp'): one blurred blob whose alpha is frayed by value noise, light on top, shaded below; no round edges. */
function wispTexture(light, shade, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size), L = new THREE.Color(light), D = new THREE.Color(shade);
  const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv; };
  const fbm = (u, v) => vn(u, v) * 0.5 + vn(u * 2.1, v * 2.1) * 0.3 + vn(u * 4.3, v * 4.3) * 0.2;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size - 0.5, v = py / size - 0.5, r = Math.hypot(u, v * 1.15) * 2, n = fbm(px / size * 5 + 3, py / size * 5 + 7);
    const a = Math.max(0, Math.min(1, (1 - r * r * 1.15) * 1.25 - (1 - n) * 0.75)) ** 1.6;
    const t = Math.min(1, Math.max(0, 0.65 - v * 1.3 + (n - 0.5) * 0.3)), i = (py * size + px) * 4;
    img.data[i] = (D.r + (L.r - D.r) * t) * 255; img.data[i + 1] = (D.g + (L.g - D.g) * t) * 255; img.data[i + 2] = (D.b + (L.b - D.b) * t) * 255; img.data[i + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
      uniforms: { tMap: { value: S.texture === 'wisp' ? wispTexture(S.colour, S.shade) : billowTexture(S.colour, S.shade) }, uCar: this.car, uCarView: { value: new THREE.Vector4(0, 0, 0, 0) }, uTop: { value: S.screenTop ?? 1.2 }, uClear: { value: S.clear ?? 0 }, uNear: { value: S.near ?? 3 }, uTint: { value: new THREE.Color(S.tint ?? '#ffffff').multiplyScalar(S.bright ?? 1) } },   // brighter than white: lit by the low sun
      vertexShader: /* glsl */ `
        attribute vec4 aData; attribute vec2 aAlpha;
        uniform vec4 uCarView; uniform float uTop;   // the car in view space (xyz) and its radius on screen (w, in view units at its depth)
        varying vec2 vUv; varying float vA; varying vec3 vW; varying float vDist;
        void main() {
          vUv = uv; vA = aAlpha.x; vW = aData.xyz;
          float c = cos(aAlpha.y), s = sin(aAlpha.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aData.w;
          vec4 mv = modelViewMatrix * vec4(aData.xyz, 1.0);
          // a puff in front of the car that would cover it on screen fades out: the car is always seen, the smoke beside and behind it stays
          if (uCarView.w > 0.0 && -mv.z < -uCarView.z - 0.5) { vec2 onCar = mv.xy * (-uCarView.z / -mv.z) - uCarView.xy; float r = uCarView.w + aData.w * 0.25 * (-uCarView.z / -mv.z); vA *= smoothstep(r * 0.6, r * 1.0, length(onCar)); }
          mv.xy += p; vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
          // never in the upper part of the picture (look.smoke.screenTop, in -1..1 of the screen height): no smoke behind the HUD cards or over the view
          vA *= smoothstep(uTop + 0.25, uTop, gl_Position.y / gl_Position.w);
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
    this.scale = S.size ?? 1;   // how big the billows grow
    // the mockups' smoke: soft trails behind the rear wheels that grow with the drift angle and thin out fast; a little more at the start
    // of a slide (`burst` times as big for `burstTime` s after a pause of more than 0.4 s), never a wall over the picture
    this.life0 = S.life ?? 2.0; this.lifeK = S.lifeGrow ?? 1.6; this.grow0 = S.start ?? 2.0; this.growK = S.spread ?? 6.5;
    this.burst = S.burst ?? 1; this.burstTime = S.burstTime ?? 0.5; this.fade = S.fade ?? 0.5;
    this.clock = 0; this.lastEmit = -9; this.slideStart = 0;
    // never a wall: the puffs rise at most `maxRise` m over where they started and grow to at most `maxSize` m
    this.maxRise = S.maxRise ?? 99; this.maxSize = S.maxSize ?? 99; this.base = new Float32Array(this.cap);
  }
  /** The car's place for the fade (drawing space) and the camera: puffs in front of the car that would cover it fade out. */
  aim(camera, radius = 1.6) {
    const v = this.material.uniforms.uCarView.value, p = this.car.value.clone().add(new THREE.Vector3(0, 0.7, 0)).applyMatrix4(camera.matrixWorldInverse);
    v.set(p.x, p.y, p.z, radius);
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  emit(x, y, z, vx, vz, strength) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos.set([x, y + 0.3, z], i * 3); this.base[i] = y;
    this.vel.set([vx + (this.rnd() - 0.5) * 1.4, 0.35 + strength * 0.4, vz + (this.rnd() - 0.5) * 1.4], i * 3);
    if (this.clock - this.lastEmit > 0.4) this.slideStart = this.clock;
    this.lastEmit = this.clock;
    const fresh = this.clock - this.slideStart < this.burstTime ? this.burst : 1;
    this.age[i] = 0; this.life[i] = (this.life0 + strength * this.lifeK) * (fresh > 1 ? 1.2 : 1); this.grow[i] = (0.8 + this.rnd() * 0.6) * (0.45 + strength * 0.75) * fresh; this.spin[i] = this.rnd() * 6.28;
  }
  update(dt) {
    this.clock += dt;
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      if (this.pos[i * 3 + 1] > this.base[i] + this.maxRise) { this.pos[i * 3 + 1] = this.base[i] + this.maxRise; this.vel[i * 3 + 1] = 0; }
      this.vel[i * 3] *= 1 - dt * 0.7; this.vel[i * 3 + 2] *= 1 - dt * 0.7;
    }
  }
  sync() {
    const d = this.data.array, al = this.alpha.array;
    for (let i = 0; i < this.cap; i++) {
      const k = this.age[i] / this.life[i];
      d[i * 4] = this.pos[i * 3]; d[i * 4 + 1] = this.pos[i * 3 + 1]; d[i * 4 + 2] = this.pos[i * 3 + 2];
      d[i * 4 + 3] = k >= 1 ? 0 : Math.min(this.maxSize, (this.grow0 + k * this.growK) * this.grow[i] * this.scale);
      al[i * 2] = k >= 1 ? 0 : this.opacity * Math.pow(1 - k, 1 / this.fade) * Math.min(1, k * 20);   // fade < 1: thins out sooner al[i * 2 + 1] = this.spin[i] + k * 0.6;
    }
    this.data.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}
