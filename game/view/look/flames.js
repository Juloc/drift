// Flames at the tail pipe: when the engine pops (unburnt mixture going off in the exhaust), a short tongue of fire shoots out of the pipe: white-blue at
// the mouth, yellow, then orange, torn by noise, gone in a tenth of a second, and it lights the road and the smoke behind the car for that moment.
// `makeFlames({ parent, flats })` gives `fire(pos, dir, k)` (the pipe's mouth and the way it points, in the parent's axes; k 0..1 how hard the pop was)
// and `update(dt)`. The flames add light to the picture (additive), so they go into `flats` (out of the ambient occlusion's shape pass).
import * as THREE from '../../../vendor/three/three.module.js';

export function makeFlames({ parent, flats = [], max = 6, light = true }) {
  // a tongue: two crossed sheets along +z, one unit long; the shader shapes and colours it
  const sheet = new THREE.PlaneGeometry(1, 1, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5), geo = new THREE.BufferGeometry(), a = sheet.clone(), b = sheet.clone().rotateZ(Math.PI / 2);
  const pos = [...a.attributes.position.array, ...b.attributes.position.array], uv = [...a.attributes.uv.array, ...b.attributes.uv.array], n = a.attributes.position.count, idx = [...a.index.array, ...Array.from(b.index.array, (v) => v + n)];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const make = () => { const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uAge: { value: 1 }, uSeed: { value: 0 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uAge, uSeed, uK; varying vec2 vUv;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() { float along = 1.0 - vUv.y, across = abs(vUv.x - 0.5) * 2.0;                                  // 0 at the pipe's mouth, 1 at the tip
        float reach = mix(0.35, 1.0, smoothstep(0.0, 0.25, uAge)) * (1.0 - smoothstep(0.55, 1.0, uAge));          // it shoots out, then dies back
        float nz = vn(vec2(across * 3.0 + uSeed, along * 6.0 - uAge * 9.0 + uSeed)), width = (0.25 + 0.75 * sin(3.14159 * min(1.0, along / max(reach, 0.05)) * 0.8)) * (0.75 + 0.5 * nz);
        float body = (1.0 - smoothstep(width * 0.55, width, across)) * (1.0 - smoothstep(reach * 0.75, reach, along + (nz - 0.5) * 0.25));
        vec3 col = mix(vec3(0.75, 0.85, 1.6), vec3(1.6, 1.2, 0.45), smoothstep(0.02, 0.22, along)); col = mix(col, vec3(1.5, 0.42, 0.08), smoothstep(0.3, 0.9, along / max(reach, 0.05)));
        float fade = 1.0 - smoothstep(0.6, 1.0, uAge); gl_FragColor = vec4(col * body * fade * (0.55 + 0.6 * uK), 1.0); }` }); return m; };
  const pool = Array.from({ length: max }, () => { const m = new THREE.Mesh(geo, make()); m.visible = false; m.frustumCulled = false; m.renderOrder = 6; parent.add(m); flats.push(m); return { mesh: m, age: 1, life: 0.1, k: 0 }; });
  const lamp = light ? new THREE.PointLight(new THREE.Color(1, 0.55, 0.2), 0, 9, 1.8) : null; if (lamp) parent.add(lamp);
  const z = new THREE.Vector3(0, 0, 1), d = new THREE.Vector3(); let next = 0;
  return { pool, lamp,
    /** A pop: fire out of the pipe. `pos` its mouth, `dir` the way it points (both THREE.Vector3 in the parent's axes), `k` 0..1 its strength. */
    fire(pos, dir, k = 1) { const f = pool[next]; next = (next + 1) % max; f.age = 0; f.life = 0.085 + 0.07 * k; f.k = k; const m = f.mesh; m.visible = true; m.position.copy(pos); m.quaternion.setFromUnitVectors(z, d.copy(dir).normalize()); const len = 0.4 + 0.6 * k; m.scale.set(0.2 + 0.12 * k, 0.2 + 0.12 * k, len); m.material.uniforms.uSeed.value = Math.random() * 20; m.material.uniforms.uK.value = k; m.material.uniforms.uAge.value = 0; if (lamp) lamp.position.copy(pos).addScaledVector(d, 0.5); },
    update(dt) { let glow = 0; for (const f of pool) { if (!f.mesh.visible) continue; f.age += dt / f.life; if (f.age >= 1) { f.mesh.visible = false; continue; } f.mesh.material.uniforms.uAge.value = f.age; glow = Math.max(glow, (1 - f.age) * (0.4 + 0.6 * f.k)); } if (lamp) lamp.intensity = glow * 7; },
    /** For a still picture: one flame held at a moment of its life (0..1). */
    hold(pos, dir, k = 1, at = 0.3) { this.fire(pos, dir, k); const f = pool[(next + max - 1) % max]; f.age = at; f.life = 1e9; f.mesh.material.uniforms.uAge.value = at; if (lamp) lamp.intensity = 7 * (1 - at) * (0.4 + 0.6 * k); } };
}
