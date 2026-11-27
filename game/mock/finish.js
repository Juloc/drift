// The picture's finish for the mock stage: the scene is drawn once into a wide-range picture; its bright parts (sun, lamps, tail lights, boards)
// are blurred at a quarter, an eighth and a sixteenth of the size and laid back as a glow; then one pass bends the bright end softly (colours below
// that stay exactly as the stage's colours say), tints the shadows violet, adds a little colour and a dark edge. On the high tier two more things
// come from the picture's depth and its bright parts: a soft violet shade where something stands close in front of something else (in creases, under
// trees, round the car) and shafts of light that fan out from the sun past whatever stands before it. `low` drops those and the two wide glows.
import * as THREE from '../../vendor/three/three.module.js';

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function makeFinish(renderer, { low = false, sun = null } = {}) {
  const rt = (depth, samples = 0) => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: depth, samples });
  const scene = rt(true, low ? 0 : 4); if (!low) { scene.depthTexture = new THREE.DepthTexture(2, 2); scene.depthTexture.minFilter = scene.depthTexture.magFilter = THREE.NearestFilter; }
  const raysRT = low ? null : rt(false), levels = (low ? [4] : [4, 8, 16]).map(() => [rt(false), rt(false)]);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); qs.add(quad); quad.frustumCulled = false;
  const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const bright = mat('uniform sampler2D tMap; uniform float uFrom; varying vec2 vUv; void main() { vec3 c = min(texture2D(tMap, vUv).rgb, vec3(16.0)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * max(l - uFrom, 0.0) / max(l, 1e-4), 1.0); }', { tMap: { value: null }, uFrom: { value: 1.4 } });
  const blur = mat(`uniform sampler2D tMap; uniform vec2 uStep; varying vec2 vUv;
    void main() { vec3 c = texture2D(tMap, vUv).rgb * 0.227; c += (texture2D(tMap, vUv + uStep * 1.385).rgb + texture2D(tMap, vUv - uStep * 1.385).rgb) * 0.316; c += (texture2D(tMap, vUv + uStep * 3.231).rgb + texture2D(tMap, vUv - uStep * 3.231).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }`, { tMap: { value: null }, uStep: { value: new THREE.Vector2() } });
  const rays = mat(`uniform sampler2D tMap; uniform vec2 uSunUV; uniform float uOn; varying vec2 vUv;
    void main() { vec2 d = (uSunUV - vUv) * 0.045, uv = vUv; vec3 c = vec3(0.0); float w = 1.0; for (int i = 0; i < 20; i++) { c += texture2D(tMap, uv).rgb * w; w *= 0.93; uv += d; } gl_FragColor = vec4(c * 0.085 * uOn, 1.0); }`, { tMap: { value: null }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uOn: { value: 0 } });
  const U = { tDepth: { value: scene.depthTexture ?? null }, tRays: { value: raysRT?.texture ?? null }, uNear: { value: 0.3 }, uFar: { value: 9000 }, uAspect: { value: 1 }, uAO: { value: 0.75 }, uRays: { value: 0.4 }, tScene: { value: scene.texture }, tG0: { value: levels[0][0].texture }, tG1: { value: (levels[1] ?? levels[0])[0].texture }, tG2: { value: (levels[2] ?? levels[0])[0].texture },
    uGlow: { value: low ? new THREE.Vector3(0.7, 0, 0) : new THREE.Vector3(0.36, 0.24, 0.16) }, uSat: { value: 1.06 }, uCon: { value: 1.04 }, uVig: { value: 0.3 }, uShadowTint: { value: new THREE.Color(0.012, 0.0, 0.008) } };
  const last = mat(`${low ? '' : '#define RICH'}
    uniform sampler2D tScene, tG0, tG1, tG2, tDepth, tRays; uniform float uNear, uFar, uAspect, uAO, uRays;
    float metres(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); } uniform vec3 uGlow, uShadowTint; uniform float uSat, uCon, uVig; varying vec2 vUv;
    vec3 knee(vec3 x) { const float k = 0.74; vec3 over = max(x - k, 0.0) / (1.0 - k); return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over)); }   // straight up to k, then a soft shoulder
    void main() { vec3 c = texture2D(tScene, vUv).rgb;
      #ifdef RICH
      { float z = metres(texture2D(tDepth, vUv).x);
        if (z < 260.0) { float occ = 0.0, turn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832, rad = clamp(0.75 / z, 0.0025, 0.07);
          for (int i = 0; i < 8; i++) { float a = turn + float(i) * 2.39996, r = rad * (0.3 + 0.7 * fract(float(i) * 0.618 + 0.25)); float dz = z - metres(texture2D(tDepth, vUv + vec2(cos(a) / uAspect, sin(a)) * r).x); occ += smoothstep(0.03, 0.3, dz) * (1.0 - smoothstep(0.7, 2.0, dz)); }
          c *= mix(vec3(1.0), vec3(0.42, 0.3, 0.36), occ * 0.125 * uAO * (1.0 - smoothstep(70.0, 260.0, z))); } }
      c += texture2D(tRays, vUv).rgb * uRays;
      #endif
      c += texture2D(tG0, vUv).rgb * uGlow.x + texture2D(tG1, vUv).rgb * uGlow.y + texture2D(tG2, vUv).rgb * uGlow.z;
      c = knee(c); float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)); // (the stage's colours carry the evening: the finish only deepens the darks a touch)
      c = mix(vec3(l), c, uSat); c = (c - 0.4) * uCon + 0.4;
      vec2 e = vUv - 0.5; c *= 1.0 - uVig * smoothstep(0.25, 0.95, length(e * vec2(1.0, 1.25)));
      c = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
      c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;                 // a grain of one step against banding in the sky
      gl_FragColor = vec4(c, 1.0); }`, U);
  const v = new THREE.Vector3();
  const draw = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); };
  return {
    uniforms: U,
    setSize(w, h) { scene.setSize(w, h); raysRT?.setSize(Math.max(2, Math.floor(w / 4)), Math.max(2, Math.floor(h / 4))); levels.forEach((l, i) => { const d = low ? 4 : [4, 8, 16][i]; l.forEach((t) => t.setSize(Math.max(2, Math.floor(w / d)), Math.max(2, Math.floor(h / d)))); }); },
    render(s, camera) {
      U.uNear.value = camera.near; U.uFar.value = camera.far; U.uAspect.value = camera.aspect;
      renderer.setRenderTarget(scene); renderer.render(s, camera);
      let src = scene.texture, first = true;
      for (const [a, b] of levels) { if (first) { bright.uniforms.tMap.value = src; draw(bright, a); first = false; } else { blur.uniforms.tMap.value = src; blur.uniforms.uStep.value.set(0, 0); draw(blur, a); }
        for (let k = 0; k < 2; k++) { blur.uniforms.tMap.value = a.texture; blur.uniforms.uStep.value.set(1 / a.width, 0); draw(blur, b); blur.uniforms.tMap.value = b.texture; blur.uniforms.uStep.value.set(0, 1 / a.height); draw(blur, a); }
        src = a.texture;
        if (raysRT && sun && a === levels[0][0]) { v.copy(camera.position).addScaledVector(sun, 1000).project(camera); const off = Math.max(Math.abs(v.x), Math.abs(v.y));
          rays.uniforms.uOn.value = v.z < 1 ? Math.max(0, Math.min(1, (1.7 - off) / 0.6)) : 0; rays.uniforms.uSunUV.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5); rays.uniforms.tMap.value = a.texture; draw(rays, raysRT); } }
      draw(last, null);
    },
  };
}
