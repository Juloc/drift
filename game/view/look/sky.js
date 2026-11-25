// The sky of a look: one dome with a smooth gradient and a big soft sun (a small shader, no texture), low mist over the valley
// (a few soft quads, one draw call) and a reflection map made from the same sky, so car paint shows the sunset.
import * as THREE from '../../../vendor/three/three.module.js';
import { mergeGeometries } from '../../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { X } from '../space.js';

/** The direction to the sun in drawing space, from the look's `sun.dir` (simulation axes). */
export function sunDirection(look) {
  const [x, y, z] = look.sun.dir;
  return new THREE.Vector3(X(x), y, z).normalize();
}

export function makeSky(look, radius = 1800) {
  const s = look.sky, cl = s.clouds ?? { lit: s.horizon, shade: s.mid, amount: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(s.top) }, uMid: { value: new THREE.Color(s.mid) }, uHorizon: { value: new THREE.Color(s.horizon) },
      uBelow: { value: new THREE.Color(s.below) }, uSun: { value: new THREE.Color(s.sun).multiplyScalar(s.sunGlow ?? 1) }, uGlow: { value: new THREE.Color(s.glow) },
      uSunDir: { value: sunDirection(look) }, uSunCos: { value: Math.cos((s.sunSize * Math.PI) / 180) }, uMidH: { value: s.midHeight }, uStrength: { value: s.glowStrength },
      uCloudLit: { value: new THREE.Color(cl.lit) }, uCloudShade: { value: new THREE.Color(cl.shade) }, uClouds: { value: cl.amount },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uBelow, uSun, uGlow, uSunDir, uCloudLit, uCloudShade;
      uniform float uSunCos, uMidH, uStrength, uClouds;
      varying vec3 vDir;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, v = 0.0; for (int i = 0; i < 4; i++) { v += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col = e < 0.0 ? mix(uHorizon, uBelow, smoothstep(0.0, -0.2, e))
                 : e < uMidH ? mix(uHorizon, uMid, smoothstep(0.0, uMidH, e)) : mix(uMid, uTop, smoothstep(uMidH, 0.8, e));
        float c = max(dot(d, uSunDir), 0.0);
        float band = 1.0 - smoothstep(0.0, 0.35, abs(e - uSunDir.y));
        col = mix(col, uGlow, pow(c, 3.0) * band * 0.5 * uStrength);           // the warm side of the sky
        col += uGlow * (pow(c, 12.0) * 0.45 + pow(c, 80.0) * 0.9) * uStrength;  // the soft halo round the sun
        // soft streaks of cloud above the horizon, lit from below on the sun's side
        float az = atan(d.x, d.z);
        float n = fbm(vec2(az * 3.2 + 1.7, e * 26.0)) * 0.75 + fbm(vec2(az * 10.0, e * 60.0)) * 0.25;   // long thin streaks
        float dens = smoothstep(0.46, 0.62, n) * smoothstep(0.05, 0.09, e) * (1.0 - smoothstep(0.2, 0.28, e)) * uClouds;
        vec3 cc = mix(uCloudShade, uCloudLit, clamp(pow(c, 3.0) * 1.6 + 0.1, 0.0, 1.0)) + uGlow * pow(c, 20.0) * 1.2;   // golden edges near the sun
        col = mix(col, cc, dens);
        float disc = smoothstep(uSunCos - 0.0004, uSunCos + 0.0001, dot(d, uSunDir));
        col = mix(col, uSun, disc * (1.0 - dens * 0.15));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  dome.frustumCulled = false; dome.renderOrder = -1;
  dome.onBeforeRender = (r, sc, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  return dome;
}

/** Soft flat patches of mist at the given places ([x, z, width, depth] in simulation axes) at height y. */
export function makeMist(look, patches) {
  const geos = patches.map(([x, z, w, d], i) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(X(x), look.mist.y + (i % 3) * 2.5, z));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color(look.mist.colour) }, uOpacity: { value: look.mist.opacity } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColour; uniform float uOpacity; varying vec2 vUv;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float a = (1.0 - smoothstep(0.1, 1.0, length(p))) * uOpacity; gl_FragColor = vec4(uColour, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.renderOrder = 3;
  return mesh;
}

/** A reflection map of the sky and a warm ground, for the paint of the cars (PMREM, `size` 128 on the high tier, 32 on a phone). */
export function makeSkyEnvironment(renderer, look, size = 128) {
  const scene = new THREE.Scene();
  scene.add(makeSky(look, 50));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.land.mid).lerp(new THREE.Color(look.fog.colour), 0.5) }));
  ground.position.y = -2;
  scene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.02, 0.1, 100, { size }).texture;
  pm.dispose();
  scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return tex;
}
