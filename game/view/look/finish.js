// The picture's finish in few passes, made to be cheap on a phone and to give the drawn look of the mockups.
// The scene is rendered once (with its depth). A glow is made from its bright parts at a quarter and an eighth of the size (small pictures: cheap to
// blur). Then ONE pass over the whole picture does everything else: the streaks at speed, the drawn outlines (where the depth breaks: silhouettes and
// creases), a soft contact shade, the glow, the film curve, soft colour steps, colour and a dark edge. A chain of ready-made passes does each of these
// in a picture-sized pass of its own (and the ambient occlusion pass even renders the scene a second time); here it is one scene render, six small
// passes and one large one.
// `makeFinish({ renderer, scene, camera, low })` returns `{ render(), setSize(w, h), setPixelRatio(r), uniforms, dispose() }`; `render()` draws to the screen.
import * as THREE from '../../../vendor/three/three.module.js';

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function makeFinish({ renderer, scene, camera, low = false, opts = {} }) {
  const o = { glow: 0.5, glowWide: 0.55, glowFrom: 1.5, line: 0.6, lineWidth: 1.0, steps: 0.3, shade: low ? 0 : 0.45, sat: 1.12, con: 1.04, vig: 0.2, taps: low ? 3 : 5, samples: low ? 0 : 4, ...opts };
  let ratio = renderer.getPixelRatio(), W = 2, H = 2;
  const sceneRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: o.samples });
  sceneRT.depthTexture = new THREE.DepthTexture(2, 2); sceneRT.depthTexture.minFilter = sceneRT.depthTexture.magFilter = THREE.NearestFilter;
  const small = () => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const q0 = small(), q1 = small(), e0 = small(), e1 = small();   // a quarter and an eighth of the picture
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); qs.add(quad); quad.frustumCulled = false;
  const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  // the bright parts, made smaller (four samples a pixel; the ceiling keeps one burning pixel from flooding the glow)
  const bright = mat(`uniform sampler2D tMap; uniform vec2 uPx; uniform float uFrom; varying vec2 vUv;
    void main() { vec3 c = vec3(0.0); for (int i = 0; i < 4; i++) { vec2 off = vec2(i == 0 || i == 2 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * uPx; vec3 s = min(texture2D(tMap, vUv + off).rgb, vec3(24.0)); float l = max(s.r, max(s.g, s.b)); c += s * max(l - uFrom, 0.0) / max(l, 1e-4); } gl_FragColor = vec4(c * 0.25, 1.0); }`,
  { tMap: { value: sceneRT.texture }, uPx: { value: new THREE.Vector2() }, uFrom: { value: o.glowFrom } });
  const blur = mat(`uniform sampler2D tMap; uniform vec2 uStep; varying vec2 vUv;
    void main() { vec3 c = texture2D(tMap, vUv).rgb * 0.227; c += (texture2D(tMap, vUv + uStep * 1.385).rgb + texture2D(tMap, vUv - uStep * 1.385).rgb) * 0.316; c += (texture2D(tMap, vUv + uStep * 3.231).rgb + texture2D(tMap, vUv - uStep * 3.231).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }`,
  { tMap: { value: null }, uStep: { value: new THREE.Vector2() } });   // (nine samples' worth in five: the pairs sit between two pixels)
  const copy = mat('uniform sampler2D tMap; varying vec2 vUv; void main() { gl_FragColor = texture2D(tMap, vUv); }', { tMap: { value: null } });
  const uniforms = { tScene: { value: sceneRT.texture }, tDepth: { value: sceneRT.depthTexture }, tGlow: { value: q0.texture }, tWide: { value: e0.texture }, uPx: { value: new THREE.Vector2() }, uNear: { value: camera.near }, uFar: { value: camera.far },
    toneMappingExposure: { value: renderer.toneMappingExposure }, uGlow: { value: o.glow }, uWide: { value: o.glowWide }, uLine: { value: o.line }, uLineWidth: { value: o.lineWidth }, uLineCol: { value: new THREE.Color(0.2, 0.08, 0.2) }, uSteps: { value: o.steps }, uShade: { value: o.shade },
    uSat: { value: o.sat }, uCon: { value: o.con }, uVig: { value: o.vig }, uBlur: { value: 0 }, uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uCarC: { value: new THREE.Vector2(0.5, 0.5) }, uCarR: { value: new THREE.Vector2(0, 0) } };
  const last = mat(`const int TAPS = ${o.taps};
    ${o.shade > 0 ? '#define SHADE' : ''}
    uniform sampler2D tScene, tDepth, tGlow, tWide; uniform vec2 uPx, uCarC, uCarR; uniform float uNear, uFar, uGlow, uWide, uLine, uLineWidth, uSteps, uShade, uSat, uCon, uVig, uBlur; uniform vec3 uLineCol, uCam; uniform mat4 uInvVP, uPrevVP; varying vec2 vUv;
    ${THREE.ShaderChunk.tonemapping_pars_fragment}
    float metres(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float inv(vec2 uv) { return 1.0 / metres(texture2D(tDepth, uv).x); }   // one over the distance: on a flat surface it changes evenly across the screen, so only breaks stand out
    void main() { vec3 c = texture2D(tScene, vUv).rgb; float d = texture2D(tDepth, vUv).x;
      // the streaks at speed: the world moves past as if every point lay on the ground; the car (an ellipse round it) stays sharp
      if (uBlur > 0.0) { vec4 w = uInvVP * vec4(vUv * 2.0 - 1.0, 0.5, 1.0); vec3 dir = normalize(w.xyz / w.w - uCam); float ground = dir.y < -0.004 ? 1.0 : 0.0, t = ground > 0.5 ? min(-uCam.y / dir.y, 300.0) : 300.0; vec4 pc = uPrevVP * vec4(uCam + dir * t, 1.0);
        if (pc.w > 0.05) { vec2 vel = (vUv - (pc.xy / pc.w * 0.5 + 0.5)) * uBlur; vec2 e2 = (vUv - uCarC) / max(uCarR, vec2(1e-4)); vel *= smoothstep(1.0, 1.7, length(e2)) * mix(0.3, 1.0, ground * (1.0 - smoothstep(40.0, 140.0, t))); float len = length(vel);
          if (len > 0.0008) { vel *= min(1.0, 0.032 / len); vec3 a = c; for (int i = 1; i <= TAPS; i++) { float f = float(i) / float(TAPS); a += texture2D(tScene, vUv - vel * f).rgb + texture2D(tScene, vUv + vel * f * 0.6).rgb; } c = a / float(2 * TAPS + 1); } } }
      if (d < 0.99995) { float z = metres(d), w0 = 1.0 / z; vec2 px = uPx * uLineWidth;
        float wl = inv(vUv - vec2(px.x, 0.0)), wr = inv(vUv + vec2(px.x, 0.0)), wu = inv(vUv + vec2(0.0, px.y)), wd = inv(vUv - vec2(0.0, px.y));
        #ifdef SHADE
        // a soft shade where something stands close in front (the four neighbours a little further out, read once more): corners, wheel arches, feet
        { vec2 far2 = uPx * (6.0 + 26.0 / z); float near = 0.0; for (int i = 0; i < 4; i++) { vec2 off = vec2(i == 0 ? -far2.x : i == 1 ? far2.x : 0.0, i == 2 ? far2.y : i == 3 ? -far2.y : 0.0); float zi = 1.0 / inv(vUv + off), gap = z - zi; near += smoothstep(0.04, 0.5, gap) * (1.0 - smoothstep(0.9, 2.2, gap)); } c *= 1.0 - uShade * near * 0.25; }
        #endif
        // the drawn line: where one-over-distance bends or jumps between a pixel's neighbours
        float bend = (abs(wl + wr - 2.0 * w0) + abs(wu + wd - 2.0 * w0)) / w0, edge = smoothstep(0.012, 0.05, bend) * (1.0 - smoothstep(70.0, 260.0, z));
        c = mix(c, c * uLineCol, edge * uLine); }
      c += texture2D(tGlow, vUv).rgb * uGlow + texture2D(tWide, vUv).rgb * uWide;
      c = ACESFilmicToneMapping(c); c = mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));   // the film curve, then the screen's curve
      // soft colour steps (the drawn look): the brightness leans towards a few levels, the colour stays
      { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), n = 6.0, q = (floor(l * n) + smoothstep(0.35, 0.65, fract(l * n))) / n; c *= mix(1.0, q / max(l, 1e-3), uSteps * (d < 0.99995 ? 1.0 : 0.35)); }
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l2), c, uSat); c = (c - 0.5) * uCon + 0.5; vec2 e = vUv - 0.5; c *= 1.0 - uVig * dot(e, e) * 1.6; gl_FragColor = vec4(c, 1.0); }`, uniforms);
  const draw = (material, target) => { quad.material = material; renderer.setRenderTarget(target); renderer.render(qs, qc); };
  const api = { uniforms, options: o, material: last,
    setPixelRatio(r) { ratio = r; },
    setSize(w, h) { W = Math.max(2, Math.floor(w * ratio)); H = Math.max(2, Math.floor(h * ratio)); sceneRT.setSize(W, H); const a = Math.max(2, W >> 2), b = Math.max(2, H >> 2), a2 = Math.max(2, W >> 3), b2 = Math.max(2, H >> 3); q0.setSize(a, b); q1.setSize(a, b); e0.setSize(a2, b2); e1.setSize(a2, b2); uniforms.uPx.value.set(1 / W, 1 / H); bright.uniforms.uPx.value.set(1 / W, 1 / H); },
    render() { const before = renderer.getRenderTarget(); uniforms.uNear.value = camera.near; uniforms.uFar.value = camera.far; uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
      draw(bright, q0); blur.uniforms.tMap.value = q0.texture; blur.uniforms.uStep.value.set(1 / q0.width, 0); draw(blur, q1); blur.uniforms.tMap.value = q1.texture; blur.uniforms.uStep.value.set(0, 1 / q0.height); draw(blur, q0);
      copy.uniforms.tMap.value = q0.texture; draw(copy, e0); blur.uniforms.tMap.value = e0.texture; blur.uniforms.uStep.value.set(1.6 / e0.width, 0); draw(blur, e1); blur.uniforms.tMap.value = e1.texture; blur.uniforms.uStep.value.set(0, 1.6 / e0.height); draw(blur, e0);
      draw(last, null); renderer.setRenderTarget(before); },
    dispose() { for (const t of [sceneRT, q0, q1, e0, e1]) t.dispose(); sceneRT.depthTexture.dispose(); for (const m of [bright, blur, copy, last]) m.dispose(); quad.geometry.dispose(); } };
  const s = renderer.getSize(new THREE.Vector2()); api.setSize(s.x, s.y); return api;
}
