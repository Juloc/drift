// A small after-pass of our own (no extra library): the scene is drawn into a half-float target, its bright parts (sun, lamps,
// tail lights, signs) are blurred at half and quarter size and added back as a soft glow (bloom), then the renderer's tone
// mapping (ACES) and a gentle colour grade make the painted mood. The phone tier skips this and draws straight to the screen
// with the same tone mapping (no bloom). Cost: six extra full-screen draws, most of them at a quarter of the pixels.
import * as THREE from '../../../vendor/three/three.module.js';

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(fragmentShader, uniforms, toneMapped = false) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped });
}

export class Post {
  /** grade: { bloom, threshold, warmth, saturation } from the look */
  constructor(renderer, grade, { samples = 4 } = {}) {
    this.renderer = renderer;
    const rt = (scale) => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: scale === 1, samples: scale === 1 ? samples : 0 });
    this.scene = rt(1); this.a = [rt(2), rt(4)]; this.b = [rt(2), rt(4)];
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bright = pass(/* glsl */ `uniform sampler2D tMap; uniform float uThreshold; varying vec2 vUv;
      void main() { vec3 c = texture2D(tMap, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold * 1.6, l), 1.0); }`,
    { tMap: { value: null }, uThreshold: { value: grade.threshold } });
    this.blur = pass(/* glsl */ `uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tMap, vUv).rgb * 0.2270270270;
        c += texture2D(tMap, vUv + uDir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tMap, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
        c += texture2D(tMap, vUv + uDir * 3.2307692308).rgb * 0.0702702703; c += texture2D(tMap, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(c, 1.0); }`,
    { tMap: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.down = pass(/* glsl */ `uniform sampler2D tMap; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0); }`, { tMap: { value: null } });
    this.final = pass(/* glsl */ `uniform sampler2D tScene, tB1, tB2; uniform float uBloom, uWarm, uSat, uContrast, uGrain; uniform vec3 uLift; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb + (texture2D(tB1, vUv).rgb * 0.6 + texture2D(tB2, vUv).rgb * 0.9) * uBloom;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);                                   // saturation
        c += vec3(0.06, 0.02, 0.04) * uWarm * (1.0 - smoothstep(0.0, 0.5, l)); // warm, rosy lift in the shadows
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        // a softer curve as in the mockup: contrast round the middle grey, the shadows lifted towards mauve, a fine film grain
        gl_FragColor.rgb = (gl_FragColor.rgb - 0.42) * uContrast + 0.42 + uLift * (1.0 - gl_FragColor.rgb);
        gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
        #include <colorspace_fragment>
      }`,
    { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uBloom: { value: grade.bloom }, uWarm: { value: grade.warmth }, uSat: { value: grade.saturation }, uContrast: { value: grade.contrast ?? 1 }, uGrain: { value: grade.grain ?? 0 }, uLift: { value: new THREE.Color(grade.lift ?? '#000000') } }, true);
  }

  setSize(w, h) {
    this.scene.setSize(w, h);
    this.a.forEach((t, i) => t.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
    this.b.forEach((t, i) => t.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
  }

  draw(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.renderer.render(this.quad, this.cam); }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.scene); r.render(scene, camera);
    // bright parts at half size, blurred; then the same at quarter size, blurred again (wider glow)
    this.bright.uniforms.tMap.value = this.scene.texture; this.draw(this.bright, this.a[0]);
    for (let i = 0; i < 2; i++) {
      if (i) { this.down.uniforms.tMap.value = this.a[0].texture; this.draw(this.down, this.a[1]); }
      const t = this.a[i];
      this.blur.uniforms.tMap.value = t.texture; this.blur.uniforms.uDir.value.set(1 / t.width, 0); this.draw(this.blur, this.b[i]);
      this.blur.uniforms.tMap.value = this.b[i].texture; this.blur.uniforms.uDir.value.set(0, 1 / t.height); this.draw(this.blur, t);
    }
    const f = this.final.uniforms;
    f.tScene.value = this.scene.texture; f.tB1.value = this.a[0].texture; f.tB2.value = this.a[1].texture;
    this.draw(this.final, null);
  }
}
