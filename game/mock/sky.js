// The sky of the mock stage: one dome with the sunset's gradient (warm round the sun, rose away from it, lavender on top), a big soft sun and
// drawn cloud bands with a lit and a shaded tone. All from a few colours, no picture file. `skyEnv` renders it once into a small map the car
// paint mirrors.
import * as THREE from '../../vendor/three/three.module.js';
import { KEY } from './toon.js';

export const SKY = {
  top: new THREE.Color('#9d86d8'), mid: new THREE.Color('#ee93b4'), warm: new THREE.Color('#ffc890'), cool: new THREE.Color('#e9a0bd'),
  sun: new THREE.Color(3.6, 3.1, 2.0), glow: new THREE.Color('#ffd9a0'), cloudLit: new THREE.Color('#ffc2a8'), cloudShade: new THREE.Color('#b77fc0'),
};

export function makeSky(radius = 6000) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: SKY.top }, uMid: { value: SKY.mid }, uWarm: { value: SKY.warm }, uCool: { value: SKY.cool }, uSunCol: { value: SKY.sun }, uGlow: { value: SKY.glow },
      uLit: { value: SKY.cloudLit }, uShade: { value: SKY.cloudShade }, uSun: { value: KEY.sunDir }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uWarm, uCool, uSunCol, uGlow, uLit, uShade, uSun; uniform float uTime; varying vec3 vDir;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, v = 0.0; for (int i = 0; i < 5; i++) { v += a * vn(p); p = p * 2.02 + 11.3; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir); float e = d.y;
        float toSun = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), c = max(dot(d, uSun), 0.0);
        vec3 hor = mix(uCool, uWarm, pow(toSun, 1.6));
        vec3 col = mix(hor, uMid, smoothstep(0.0, 0.2, e)); col = mix(col, uTop, smoothstep(0.16, 0.62, e));
        col = mix(col, hor * 0.86, smoothstep(0.0, -0.12, e));
        col += uGlow * (pow(c, 6.0) * 0.16 + pow(c, 50.0) * 0.3);
        // cloud bands: long shapes with a flat underside, gathered in two belts; lit from the sun's side and from below
        float az = atan(d.x, -d.z);
        vec2 p = vec2(az * 2.6 + uTime * 0.004, e * 13.0);
        float n = fbm(p + vec2(0.0, fbm(p * 0.6) * 0.7));
        float belt = smoothstep(0.05, 0.11, e) * (1.0 - smoothstep(0.34, 0.5, e));
        float dens = smoothstep(0.47, 0.56, n) * belt;
        float under = smoothstep(0.56, 0.47, fbm(p + vec2(0.02, 0.22) + vec2(0.0, fbm(p * 0.6) * 0.7)));   // the same shape a little lower: where it ends, the underside shows
        vec3 cc = mix(uShade, uLit, clamp(under * 0.75 + pow(toSun, 2.0) * 0.5, 0.0, 1.0)) + uGlow * pow(c, 10.0) * 0.5;
        col = mix(col, cc, dens * 0.92);
        float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));
        col = mix(col, uSunCol, (1.0 - smoothstep(0.050, 0.056, ang)) * (1.0 - dens * 0.5));
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
