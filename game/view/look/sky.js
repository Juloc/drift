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
      // a moon (look.sky.moon: dir in simulation axes, size in degrees, colour, glow): a disc with a soft halo, a little darker on the side away from the sun
      uMoonDir: { value: s.moon ? new THREE.Vector3(X(s.moon.dir[0]), s.moon.dir[1], s.moon.dir[2]).normalize() : new THREE.Vector3(0, -1, 0) },
      uMoonCos: { value: Math.cos(((s.moon?.size ?? 0) * Math.PI) / 180) }, uMoon: { value: new THREE.Color(s.moon?.colour ?? '#ffffff').multiplyScalar(s.moon?.bright ?? 1) }, uMoonGlow: { value: s.moon?.glow ?? 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uBelow, uSun, uGlow, uSunDir, uCloudLit, uCloudShade;
      uniform float uSunCos, uMidH, uStrength, uClouds, uMoonCos, uMoonGlow;
      uniform vec3 uMoonDir, uMoon;
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
        // azimuth measured from the sun, so the seam of atan (at +-pi) lies behind the viewer when looking towards the sun side
        vec2 sh = normalize(uSunDir.xz + vec2(1e-4)); float az = atan(d.x * sh.y - d.z * sh.x, d.x * sh.x + d.z * sh.y);
        float n = fbm(vec2(az * 3.2 + 1.7, e * 26.0)) * 0.75 + fbm(vec2(az * 10.0, e * 60.0)) * 0.25 + pow(c, 5.0) * 0.18;   // long thin streaks, gathered round the sun
        float dens = smoothstep(0.44, 0.52, n) * smoothstep(0.035, 0.07, e) * (1.0 - smoothstep(0.22, 0.32, e)) * uClouds;
        vec3 cc = mix(uCloudShade, uCloudLit, clamp(pow(c, 3.0) * 1.2 + 0.1, 0.0, 1.0)) + uGlow * pow(c, 40.0) * 0.5;   // golden edges near the sun
        col = mix(col, cc, dens);
        float disc = smoothstep(uSunCos - 0.0004, uSunCos + 0.0001, dot(d, uSunDir));
        col = mix(col, uSun, disc * (1.0 - dens * 0.15));
        if (uMoonGlow > 0.0) {
          float m = dot(d, uMoonDir);
          col += uMoon * (pow(max(m, 0.0), 2400.0) + 0.25 * pow(max(m, 0.0), 300.0)) * uMoonGlow;
          float disc = smoothstep(uMoonCos - 0.00015, uMoonCos + 0.00005, m);
          float mare = 0.88 + 0.12 * fbm(vec2(d.x, d.y) * 900.0);
          col = mix(col, uMoon * mare, disc * (1.0 - dens * 0.3));
        }
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
  // a patch is [x, z, width, depth] or [x, z, width, depth, height] (absolute; without it the look's mist height)
  const geos = patches.map(([x, z, w, d, y], i) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(X(x), (y ?? look.mist.y) + (i % 3) * 2.5, z));
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
  if (look.sky.bands) scene.add(makeClouds(look, look.sky.bands, 48));   // the clouds in the paint too
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.land.mid).lerp(new THREE.Color(look.fog.colour), 0.5) }));
  ground.position.y = -2;
  scene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.02, 0.1, 100, { size }).texture;
  pm.dispose();
  scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return tex;
}

/**
 * A layer of cloud bands of its own (in front of the sky dome, so the bloom does not wash them out): soft, long quads at the sky's
 * distance, following the camera like the dome. `bands`: [{ az, el, w, h }] in degrees from the sun's direction (az to the right) and
 * above the horizon, width and height in degrees. Lit warm on the sun's side and underneath, rosy-violet away from it.
 */
export function makeClouds(look, bands, radius = 1700) {
  const C = look.sky.clouds ?? {}, sun = sunDirection(look), sunAz = Math.atan2(sun.x, -sun.z);
  const geos = bands.map((b, i) => {
    const az = sunAz + (b.az * Math.PI) / 180, el = (b.el * Math.PI) / 180, w = 2 * radius * Math.tan((b.w * Math.PI) / 360), h = 2 * radius * Math.tan((b.h * Math.PI) / 360);
    const g = new THREE.PlaneGeometry(w, h, 8, 1);
    const seed = new Float32Array(g.attributes.position.count).fill(i * 7.31);
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    g.lookAt(dir.clone().negate());
    return g.translate(dir.x * radius, dir.y * radius, dir.z * radius);
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLit: { value: new THREE.Color(C.lit ?? '#ffc9a0').multiplyScalar(C.bright ?? 1.2) }, uShade: { value: new THREE.Color(C.shade ?? '#b05a88') }, uSun: { value: sun }, uOpacity: { value: C.layer ?? 0.85 } },
    vertexShader: /* glsl */ `attribute float seed; varying vec2 vUv; varying float vSeed; varying vec3 vDir;
      void main(){ vUv = uv; vSeed = seed; vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uLit, uShade, uSun; uniform float uOpacity; varying vec2 vUv; varying float vSeed; varying vec3 vDir;
      float h1(float x) { return fract(sin(x * 91.7 + vSeed) * 43758.5); }
      float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      void main(){
        float u = vUv.x, v = vUv.y;
        // a wavy band: its middle line and thickness change along it; the ends fade out
        float mid = 0.5 + (n1(u * 5.0) - 0.5) * 0.35, th = 0.18 + n1(u * 3.0 + 4.0) * 0.22;
        float a = (1.0 - smoothstep(th * 0.5, th, abs(v - mid))) * smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u) * (0.6 + 0.4 * n1(u * 11.0 + 2.0));
        if (a < 0.01) discard;
        float c = pow(max(dot(normalize(vDir), uSun), 0.0), 3.0);
        vec3 col = mix(uShade, uLit, clamp(c * 1.4 + (mid - v) * 1.2 + 0.25, 0.0, 1.0));
        gl_FragColor = vec4(col, a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -0.5;
  mesh.onBeforeRender = (r, sc, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}
