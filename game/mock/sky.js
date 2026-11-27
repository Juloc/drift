// The sky of the mock stage: one dome with the sunset's gradient (warm round the sun, rose away from it, lavender on top), a big soft sun and
// drawn cloud bands with a lit and a shaded tone. All from a few colours, no picture file. `skyEnv` renders it once into a small map the car
// paint mirrors.
import * as THREE from '../../vendor/three/three.module.js';
import { KEY } from './toon.js';

export const SKY = { sunSize: 0.05,   // the sun's radius in radians (three times the real one, as the mockup draws it)
  top: new THREE.Color('#d98fba'), mid: new THREE.Color('#f599a5'), warm: new THREE.Color('#fba27e'), cool: new THREE.Color('#ee8f9a'),
  sun: new THREE.Color(2.6, 2.2, 1.45), glow: new THREE.Color('#ffc48a'), cloudLit: new THREE.Color('#ffb98e'), cloudShade: new THREE.Color('#b56f8e'),
};

export function makeSky(radius = 6000) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: SKY.top }, uMid: { value: SKY.mid }, uWarm: { value: SKY.warm }, uCool: { value: SKY.cool }, uSunCol: { value: SKY.sun }, uGlow: { value: SKY.glow },
      uLit: { value: SKY.cloudLit }, uShade: { value: SKY.cloudShade }, uSun: { value: KEY.sunDir }, uTime: { value: 0 }, uSunSize: { value: SKY.sunSize } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uWarm, uCool, uSunCol, uGlow, uLit, uShade, uSun; uniform float uTime, uSunSize; varying vec3 vDir;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, v = 0.0; for (int i = 0; i < 5; i++) { v += a * vn(p); p = p * 2.02 + 11.3; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir); float e = d.y;
        float toSun = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), c = max(dot(d, uSun), 0.0);
        vec3 hor = mix(uCool, uWarm, pow(toSun, 1.6));
        vec3 col = mix(hor, uMid, smoothstep(0.0, 0.2, e)); col = mix(col, uTop, smoothstep(0.16, 0.62, e));
        col = mix(col, hor * 0.86, smoothstep(0.0, -0.12, e));
        col += uGlow * (pow(c, 6.0) * 0.1 + pow(c, 50.0) * 0.22);
        // clouds as the mockup paints them: banks with a clear edge, a bright side towards the sun and below, a violet body; a second, thin layer high up
        float az = atan(d.x, -d.z);
        vec2 p = vec2(az * 1.9 + uTime * 0.003, e * 9.5);
        float warp = fbm(p * 0.7) * 0.9, n = fbm(p + vec2(0.0, warp));
        float belt = smoothstep(0.045, 0.1, e) * (1.0 - smoothstep(0.36, 0.56, e));
        float dens = smoothstep(0.455, 0.49, n) * belt;
        float low = fbm(p + vec2(0.035, 0.3) + vec2(0.0, warp));                                    // the same shape a little lower and towards the sun: where it is thin, the lit rim shows
        float rim = 1.0 - smoothstep(0.44, 0.5, low);
        vec3 cc = mix(uShade, uLit, clamp(rim * 0.85 + pow(toSun, 3.0) * 0.35, 0.0, 1.0));
        cc = mix(cc, uShade * 0.86, smoothstep(0.53, 0.63, n) * 0.6) + uGlow * pow(c, 8.0) * 0.6;   // a darker heart in the thick of a bank
        col = mix(col, cc, dens * 0.95);
        vec2 p2 = vec2(az * 4.4 - uTime * 0.002, e * 30.0); float wisp = smoothstep(0.55, 0.7, fbm(p2 + fbm(p2 * 0.5))) * smoothstep(0.2, 0.32, e) * (1.0 - smoothstep(0.6, 0.8, e));
        col = mix(col, mix(uLit, uMid, 0.45), wisp * 0.4 * (1.0 - dens));
        float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));
        col = mix(col, uSunCol, (1.0 - smoothstep(uSunSize * 0.93, uSunSize * 1.04, ang)) * (1.0 - dens * 0.5));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  return dome;
}

/** The sky as a reflection map (for the car's paint and glass). */
export function skyEnv(renderer) {
  const scene = new THREE.Scene(), dome = makeSky(50); dome.onBeforeRender = () => {}; scene.add(dome);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a4a66 })); ground.position.y = -1.5; scene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(scene, 0.02, 0.1, 100);
  pm.dispose(); dome.geometry.dispose(); dome.material.dispose();
  return rt.texture;
}
