// The harbour frame, second approach: the owner's mockup rebuilt as one fixed picture with smooth, detailed models (Sketchfab, CC BY: palms, concrete
// barriers, chain-link fence, people), a painted sky of our own (no photograph), scanned asphalt with puddles, and things that move (palms, flags, sea,
// smoke). Same camera idea as the mockup: behind the sliding car, the stand on the left, kerb and fence on the right, the harbour and the low sun ahead.
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from '../vendor/three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search), q = (k, d) => (params.has(k) ? +params.get(k) : d);
const canvas = document.getElementById('view'), info = document.getElementById('info');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = q('exp', 0.95);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(q('fov', 46), innerWidth / innerHeight, 0.3, 6000);
const rnd = (() => { let s = 77123; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
const time = { value: 0 };

// ---- the sky, painted: violet above, pink in the middle, orange at the horizon, a big low sun with its glow, soft cloud bands lit from the sun's side
const sunDir = new THREE.Vector3(q('sx', 0.62), q('sy', 0.085), -1).normalize();
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: sunDir }, uTime: time },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uSun; uniform float uTime; varying vec3 vDir;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.27 + vn(p * 4.1 + 3.7) * 0.15 + vn(p * 8.3) * 0.08; }
    void main() {
      vec3 d = normalize(vDir); float y = d.y, s = max(dot(d, uSun), 0.0);
      vec3 top = vec3(0.30, 0.22, 0.62), mid = vec3(0.93, 0.47, 0.62), hor = vec3(1.0, 0.63, 0.32), low = vec3(0.86, 0.5, 0.5);
      vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, y)); c = mix(c, top, smoothstep(0.14, 0.62, y)); c = mix(low, c, smoothstep(-0.08, 0.0, y));
      c += vec3(1.0, 0.55, 0.2) * pow(s, 6.0) * 0.55 + vec3(1.0, 0.75, 0.4) * pow(s, 60.0) * 0.9;            // the glow round the sun
      float disc = smoothstep(0.9987, 0.9991, s); c = mix(c, vec3(1.0, 0.86, 0.5) * 3.2, disc);             // the sun itself, bright enough to bloom
      if (y > 0.0) {                                                                                         // clouds: long soft bands, lit warm towards the sun, mauve away from it
        vec2 p = d.xz / (y + 0.16) * vec2(0.55, 1.5) + vec2(uTime * 0.004, 0.0);
        float m = smoothstep(0.5, 0.78, fbm(p * 1.4)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.42, 0.8, y));
        vec3 cl = mix(vec3(0.62, 0.36, 0.62), vec3(1.0, 0.7, 0.48), pow(s, 2.0) * 0.9 + 0.2);
        c = mix(c, cl, m * (1.0 - disc) * 0.85);
      }
      gl_FragColor = vec4(c, 1.0);
    }` });
scene.add(new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), skyMat));
// what the paint and the wet road mirror: the same sky, rendered once into a reflection map
{ const pm = new THREE.PMREMGenerator(renderer), s2 = new THREE.Scene(); s2.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat)); scene.environment = pm.fromScene(s2, 0, 1, 200).texture; scene.environmentIntensity = q('env', 1.0); }
const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.66, 0.42), q('sun', 4.2));
const sunLift = new THREE.Vector3(sunDir.x, Math.max(sunDir.y, q('sunEl', 0.2)), sunDir.z).normalize();
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
sun.target.position.set(0, 0, -12); sun.position.copy(sun.target.position).addScaledVector(sunLift, 120); scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.42, 0.95), new THREE.Color(0.9, 0.5, 0.42), q('hemi', 0.55)));   // violet from above, warm from the ground: the shadows' colour
scene.fog = new THREE.FogExp2(new THREE.Color(0.95, 0.56, 0.5), q('fogD', 0.0011));

// ---- ground: scanned asphalt with puddles (as in the first corner), the sea, a quay
const tex = new THREE.TextureLoader(), wrap = (t, rep, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const PAD = 220, REP = PAD / 4.5;
const asphalt = new THREE.MeshStandardMaterial({ map: wrap(await tex.loadAsync('assets/tex/asphalt_02_diff_1k.jpg'), REP, true), normalMap: wrap(await tex.loadAsync('assets/tex/asphalt_02_nor_gl_1k.jpg'), REP), roughnessMap: wrap(await tex.loadAsync('assets/tex/asphalt_02_rough_1k.jpg'), REP), color: new THREE.Color(params.get('asph') || '#9a8f98'), roughness: 1, envMapIntensity: 1.1 });
asphalt.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vWp; float wetK;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.2; }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
    float big = fbm(vWp.xz * 0.05), hollow = fbm(vWp.xz * 0.16 + 31.0);
    diffuseColor.rgb *= 0.86 + 0.26 * big;
    float ring = abs(distance(vWp.xz, vec2(${q('rcx', 30).toFixed(1)}, ${q('rcz', -4).toFixed(1)})) - 27.0);                       // rubber laid down along the racing line of the bend
    float rub = (exp(-ring * ring / 3.0) * 0.6 + exp(-(ring - 2.6) * (ring - 2.6) / 1.2) * 0.45 + exp(-(ring + 2.2) * (ring + 2.2) / 0.9) * 0.4) * (0.55 + 0.45 * fbm(vWp.xz * 0.7));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.035), clamp(rub, 0.0, 0.8));
    wetK = smoothstep(${q('wet0', 0.5).toFixed(3)}, ${q('wet1', 0.62).toFixed(3)}, hollow) * 0.95 + 0.22 * smoothstep(0.35, 0.6, big);
    diffuseColor.rgb *= mix(1.0, 0.6, wetK);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.03, wetK);')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, wetK));');
};
const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD, PAD).rotateX(-Math.PI / 2), asphalt); pad.receiveShadow = true; pad.position.set(10, 0, -PAD / 2 + 40); scene.add(pad);
const SEAZ = -150;   // the quay's edge
const seaMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(params.get('seaC') || '#3a2f6a'), roughness: 0.16, metalness: 0, envMapIntensity: 1.5 });
seaMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = time;   // small waves that move: the sun's path on the water glitters
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 p = vWp.xz * 0.35; float t = uTime * 0.9; vec3 w = vec3(sin(p.x * 1.3 + t) + sin(p.y * 2.1 - t * 1.3) * 0.7 + sin((p.x + p.y) * 3.7 + t * 1.7) * 0.4, 0.0, cos(p.y * 1.7 + t * 1.1) + cos(p.x * 2.9 - t) * 0.6); normal = normalize(normal + (viewMatrix * vec4(w.x, 0.0, w.z, 0.0)).xyz * 0.06); }'); };
const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5000).rotateX(-Math.PI / 2), seaMat); sea.position.set(0, -1.8, SEAZ - 2500); scene.add(sea);
const concrete = new THREE.MeshStandardMaterial({ color: '#b9aaa2', roughness: 0.9 });
const quay = new THREE.Mesh(new THREE.BoxGeometry(900, 3, 8), concrete); quay.position.set(0, -1.5 + 0.02, SEAZ - 1); quay.receiveShadow = true; scene.add(quay);

// ---- models: each file once; its parts found, centred and stood on the ground; copies as instances
const loader = new GLTFLoader(), files = new Map();
const file = (name) => { if (!files.has(name)) files.set(name, loader.loadAsync(`assets/${name}`)); return files.get(name); };
const up = new THREE.Vector3(0, 1, 0);
/** A part of a model as geometry in its own middle, standing on y = 0, scaled so that `dim` (0 x, 1 y, 2 z) is `size` metres. */
function normalised(mesh, dim, size) {
  mesh.updateWorldMatrix(true, false); const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); g.computeBoundingBox();
  const b = g.boundingBox, s = size / (b.max.getComponent(dim) - b.min.getComponent(dim)); g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.scale(s, s, s); return g;
}
function instances(geo, mat, spots, { shadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length), m = new THREE.Matrix4(), qt = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  spots.forEach(([x, z, ry = 0, sc = 1, y = 0], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), qt.setFromAxisAngle(up, ry), s.set(sc, sc, sc))));
  mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh); return mesh;
}
const meshesOf = (root) => { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
// the bend: a right-hander round (CX, CZ); the kerb and fence on its inside (right of the car), barriers and the stand on its outside (left)
const CX = q('rcx', 30), CZ = q('rcz', -4), onArc = (r, t) => [CX - r * Math.cos(t), CZ - r * Math.sin(t), -t];
const arcSpots = (r, t0, t1, step) => { const out = []; for (let t = t0; t < t1; t += step / r) out.push(onArc(r, t)); return out; };

// concrete barriers (the plain grey ones of the set): a wall on the outside of the bend, a second line inside behind the kerb
{ const g = await file('skfb/barriers.glb'), parts = meshesOf(g.scene).map((o) => { o.geometry.computeBoundingBox(); const s = o.geometry.boundingBox.getSize(new THREE.Vector3()); return { o, s }; }).filter((p) => p.s.y > 1);
  parts.sort((a, b) => a.s.x - b.s.x); const pick = parts[q('barrier', 1)] ?? parts[0], geo = normalised(pick.o, 1, 1.05), len = (() => { geo.computeBoundingBox(); const s = geo.boundingBox.getSize(new THREE.Vector3()); return Math.max(s.x, s.z); })();
  const along = (() => { geo.computeBoundingBox(); const s = geo.boundingBox.getSize(new THREE.Vector3()); return s.x > s.z ? 0 : Math.PI / 2; })();
  const mat = pick.o.material.clone(); mat.envMapIntensity = 0.5;
  instances(geo, mat, [...arcSpots(38, -0.55, 1.5, len + 0.06), ...arcSpots(19.2, -0.7, 1.45, len + 0.06)].map(([x, z, ry]) => [x, z, ry + Math.PI / 2 + along, 1]));
  window.__barriers = parts.map((p) => p.s.toArray().map((v) => +v.toFixed(1)).join('x')); }
// chain-link fence with barbed wire on the inside of the bend, behind its barriers
{ const g = await file('skfb/fence-set.glb'), parts = meshesOf(g.scene).map((o) => { o.geometry.computeBoundingBox(); return { o, s: o.geometry.boundingBox.getSize(new THREE.Vector3()) }; }).sort((a, b) => b.s.x * b.s.z + b.s.y - (a.s.x * a.s.z + a.s.y));
  const pick = parts[q('fence', 0)], geo = normalised(pick.o, 1, 3.3); geo.computeBoundingBox(); const s = geo.boundingBox.getSize(new THREE.Vector3()), len = Math.max(s.x, s.z), along = s.x > s.z ? 0 : Math.PI / 2;
  const mat = pick.o.material.clone(); mat.side = THREE.DoubleSide; mat.alphaTest = 0.4; mat.envMapIntensity = 0.4;
  instances(geo, mat, arcSpots(18.2, -0.7, 1.45, len - 0.05).map(([x, z, ry]) => [x, z, ry + Math.PI / 2 + along, 1])); }
// the kerb on the inside of the bend: red and white blocks with rounded edges
{ const shape = new THREE.Shape(); shape.moveTo(-0.55, 0); shape.lineTo(0.55, 0); shape.lineTo(0.55, 0.05); shape.lineTo(-0.55, 0.11); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 }).translate(0, 0, -0.75);
  const spots = arcSpots(21.2, -0.7, 1.45, 1.56), paintMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
  instances(geo, paintMat('#d93a3a'), spots.filter((_, i) => i % 2 === 0).map(([x, z, ry]) => [x, z, ry, 1]), { shadow: false }); instances(geo, paintMat('#efe8e0'), spots.filter((_, i) => i % 2 === 1).map(([x, z, ry]) => [x, z, ry, 1]), { shadow: false }); }
// the stand on the outside: steps, a roof on posts with lamps under it, a rail, banners; people on the steps
const standAt = (t) => { const [x, z, ry] = onArc(46, t); return { x, z, ry }; };
{ const stand = new THREE.Group(), grey = new THREE.MeshStandardMaterial({ color: '#8f8a96', roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: '#4b4656', roughness: 0.7 }), roofM = new THREE.MeshStandardMaterial({ color: '#d9d2cc', roughness: 0.6 });
  const W = 46, rb = (w, h, d) => { const sh2 = new THREE.Shape(); const r = Math.min(0.06, h / 3); sh2.moveTo(-w / 2 + r, 0); sh2.lineTo(w / 2 - r, 0); sh2.quadraticCurveTo(w / 2, 0, w / 2, r); sh2.lineTo(w / 2, h - r); sh2.quadraticCurveTo(w / 2, h, w / 2 - r, h); sh2.lineTo(-w / 2 + r, h); sh2.quadraticCurveTo(-w / 2, h, -w / 2, h - r); sh2.lineTo(-w / 2, r); sh2.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0); return new THREE.ExtrudeGeometry(sh2, { depth: d, bevelEnabled: false }); };
  for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(rb(W, 0.5 + k * 0.5, 1.0), grey); m.position.set(0, 0, k * 1.0); m.castShadow = m.receiveShadow = true; stand.add(m); }
  const roof = new THREE.Mesh(rb(W + 3, 0.35, 10.5), roofM); roof.position.set(0, 8.2, -1.5); roof.rotation.x = -0.07; roof.castShadow = true; stand.add(roof);
  for (let x = -W / 2; x <= W / 2 + 0.1; x += W / 6) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8.6, 10), dark); p.position.set(x, 4.3, 7.4); p.castShadow = true; stand.add(p); const f = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9.2, 8), dark); f.position.set(x, 4.2, -0.6); f.rotation.x = 0.12; f.castShadow = true; stand.add(f); }
  for (let x = -W / 2 + 3; x < W / 2; x += 5.2) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.55).multiplyScalar(4) })); l.position.set(x, 7.95, 2.5); stand.add(l); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, 0.07), dark); rail.position.set(0, 1.25, -0.9); stand.add(rail);
  for (let x = -W / 2; x <= W / 2; x += 2.3) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6), dark); p.position.set(x, 0.62, -0.9); stand.add(p); }
  const s0 = standAt(0.42); stand.position.set(s0.x, 0, s0.z); stand.rotation.y = -0.42 + Math.PI / 2; scene.add(stand);
  // banners on tall poles in front of the stand: they wave
  const flagMat = new THREE.MeshStandardMaterial({ color: '#ec3f86', roughness: 0.8, side: THREE.DoubleSide });
  flagMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float k = (position.y + 2.6) / 5.2; transformed.z += sin(position.y * 1.7 + uTime * 3.2 + instanceMatrix[3][0]) * 0.16 * (0.4 + position.x * position.x); transformed.x += sin(position.y * 2.3 - uTime * 2.6) * 0.05; }'); };
  const flags = []; for (let t = 0.02; t < 0.9; t += 0.12) { const [x, z, ry] = onArc(39.4, t); flags.push([x, z, ry + Math.PI / 2, 1, 4.2]); }
  instances(new THREE.PlaneGeometry(1.15, 5.2, 4, 16), flagMat, flags, { shadow: true });
  instances(new THREE.CylinderGeometry(0.05, 0.06, 7.2, 8).translate(-0.62, -0.6, 0), new THREE.MeshStandardMaterial({ color: '#e8e2dc', roughness: 0.5 }), flags);
  // people: the crowd file's figures, copied onto the steps, each group frozen at another moment of its motion and tinted lighter
  const cg = await file('skfb/crowd.glb'); cg.scene.updateMatrixWorld(true); const cb = new THREE.Box3().setFromObject(cg.scene), ch = cb.getSize(new THREE.Vector3()), ck = 1.75 / ch.y;
  window.__mixers = [];
  for (let i = 0; i < q('crowd', 14); i++) { const c = cloneSkinned(cg.scene), row = i % 5, col = Math.floor(i / 5); c.scale.setScalar(ck);
    const holder = new THREE.Group(); holder.add(c); c.position.set(-(cb.min.x + cb.max.x) / 2 * ck, -cb.min.y * ck, -(cb.min.z + cb.max.z) / 2 * ck);
    holder.position.set(-W / 2 + 6 + col * 16 + (row % 2) * 4 + rnd() * 2, 0.5 + (1 + row) * 0.5, 0.5 + (1 + row) * 1.0); holder.rotation.y = Math.PI + (rnd() - 0.5) * 0.5; holder.scale.set(1, 1, 0.35);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.color.multiplyScalar(1.5).offsetHSL(rnd() * 0.2, 0.1, 0.05); o.frustumCulled = false; } });
    if (cg.animations[0]) { const mx = new THREE.AnimationMixer(c); mx.clipAction(cg.animations[0]).play(); mx.setTime(rnd() * 10); window.__mixers.push(mx); }
    stand.add(holder); }
}
// a chevron board on the outside wall: the bend goes right
{ const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#e83a8c'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#fff5f8'; x.lineWidth = 26; x.lineJoin = 'miter'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(40 + i * 96, 14); x.lineTo(96 + i * 96, 64); x.lineTo(40 + i * 96, 114); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const mat = new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#ff4a98'), emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.6 });
  for (const tt of [0.16, 0.62]) { const [x2, z2, ry] = onArc(37.3, tt), b = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.15, 0.08), mat); b.position.set(x2, 1.75, z2); b.rotation.y = ry + Math.PI / 2; b.castShadow = true; scene.add(b); } }
// palms (the set's five trees, each trunk with its crown): behind the stand, behind the wall, along the quay; they sway
{ const g = await file('skfb/palm-set.glb'); g.scene.updateMatrixWorld(true); const groups = new Map();
  for (const o of meshesOf(g.scene)) { const key = (o.name.match(/LP\.(\d+)/) || [0, o.parent.name])[1]; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o); }
  const trees = [...groups.values()].filter((a) => a.length >= 2).slice(0, 5).map((ms) => { const b = new THREE.Box3(); for (const o of ms) b.expandByObject(o); const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); return { ms, b, size, c }; });
  const sway = (mat) => { const m = mat.clone(); m.envMapIntensity = 0.5; m.onBeforeCompile = (sh) => { sh.uniforms.uTime = time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float hh = max(transformed.y, 0.0); float ph = instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2; transformed.x += sin(uTime * 1.1 + ph) * 0.012 * hh * hh * 0.25; transformed.z += cos(uTime * 0.8 + ph) * 0.008 * hh * hh * 0.25; }'); }; return m; };
  const spots = []; for (let t = -0.2; t < 1.25; t += 0.11 + rnd() * 0.06) { const [x, z] = onArc(58 + rnd() * 8, t); spots.push([x, z]); }
  for (let t = -0.45; t < 1.4; t += 0.2 + rnd() * 0.08) { const [x, z] = onArc(40.5 + rnd() * 1.5, t); spots.push([x, z]); }
  for (let x = -90; x < 150; x += 12 + rnd() * 9) spots.push([x, SEAZ + 5 + rnd() * 5]);
  for (let t = 0.1; t < 1.3; t += 0.3) { const [x, z] = onArc(12 + rnd() * 3, t); spots.push([x, z]); }
  trees.forEach((tr, k) => { const mine = spots.filter((_, i) => i % trees.length === k).map(([x, z]) => [x, z, rnd() * 6.28, (9 + rnd() * 4) / tr.size.y]);
    for (const o of tr.ms) { const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).translate(-tr.c.x, -tr.b.min.y, -tr.c.z); const mat = sway(o.material); mat.side = THREE.DoubleSide; mat.alphaTest = 0.45; instances(geo, mat, mine); } }); }
// the harbour ahead: stacked containers with ribbed sides on the quay; (crane and ship models join when their files are there)
{ const rib = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 16, 0); gr.addColorStop(0, '#6a6a6a'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#6a6a6a'); x.fillStyle = gr; for (let i = 0; i < 4; i++) { x.save(); x.translate(i * 16, 0); x.fillRect(0, 0, 16, 8); x.restore(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const cols = ['#c9564a', '#4f79a8', '#dcb25a', '#5b9a8c', '#c35f84', '#e9e1d8', '#7a62a8'], by = cols.map(() => []);
  for (let x = -70; x < 140; x += 13.4) { if (rnd() < 0.2) continue; const h = 1 + Math.floor(rnd() * 4); for (let k = 0; k < h; k++) by[Math.floor(rnd() * cols.length)].push([x + (rnd() - 0.5) * 0.5, SEAZ + 16 + (rnd() - 0.5) * 0.4 + (rnd() < 0.3 ? 3 : 0), Math.PI / 2 + (rnd() - 0.5) * 0.03, 1, k * 2.62]); }
  const geo = new THREE.BoxGeometry(2.44, 2.6, 12.2); cols.forEach((c, i) => by[i].length && instances(geo, new THREE.MeshStandardMaterial({ color: c, map: rib, roughness: 0.7, envMapIntensity: 0.5 }), by[i])); }
for (const [name, at] of [['skfb/crane', [[40, SEAZ + 6, 0, 46], [86, SEAZ + 6, 0, 52], [130, SEAZ + 6, 0, 44]]], ['skfb/ship', [[20, SEAZ - 70, Math.PI / 2, 26, -1.8]]]]) {
  try { const g = await file(`${name}.glb`); g.scene.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g.scene), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    for (const [x, z, ry, hgt, y = 0] of at) { const o = g.scene.clone(), k = hgt / s.y, h = new THREE.Group(); o.position.set(-c.x, -b.min.y, -c.z); h.add(o); h.scale.setScalar(k); h.position.set(x, y, z); h.rotation.y = ry; o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(h); } } catch (e) { window.__missing = (window.__missing || []).concat(name); }
}
// floodlights along the outside wall: slim masts, glowing heads
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
{ const pole = new THREE.MeshStandardMaterial({ color: '#4a4654', roughness: 0.5, metalness: 0.4 }), masts = [0.05, 0.5, 0.95].map((t) => onArc(40.8, t));
  instances(new THREE.CylinderGeometry(0.09, 0.14, 11, 10).translate(0, 5.5, 0), pole, masts.map(([x, z]) => [x, z]));
  for (const [x, z] of masts) { const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(q('lamp', 6)), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); g.position.set(x, 11.1, z); g.scale.setScalar(3); scene.add(g); } }

// ---- the car, sliding through the bend, and its smoke
const car = (await loader.loadAsync('assets/cars/ae86-hi.glb')).scene; car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const carYaw = q('carYaw', 2.5), carAt = new THREE.Vector3(q('carX', 2.6), 0, q('carZ', -2)); car.position.copy(carAt); car.rotation.y = carYaw; scene.add(car);
const cloudTex = (() => { const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), img = x.createImageData(n, n), lobes = [[0.5, 0.56, 0.3], [0.3, 0.6, 0.2], [0.7, 0.6, 0.22], [0.42, 0.36, 0.2], [0.62, 0.38, 0.19], [0.5, 0.74, 0.2]];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const u = i / n, v = j / n; let d = 0, lit = 0; for (const [cx, cy, r] of lobes) { const q2 = ((u - cx) ** 2 + (v - cy) ** 2) / (r * r); if (q2 < 1) { const h = Math.sqrt(1 - q2); d = Math.max(d, h); lit = Math.max(lit, h * (0.5 + 0.5 * Math.max(0, (u - cx) * 1.1 / r + (cy - v) * 1.3 / r + h))); } }
    const a = Math.min(1, d * 1.6) ** 1.3, k = (j * n + i) * 4, t = Math.min(1, lit); img.data[k] = 170 + 85 * t; img.data[k + 1] = 120 + 110 * t; img.data[k + 2] = 150 + 85 * t; img.data[k + 3] = 255 * a; }
  x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const travel = q('travel', 2.95), trail = new THREE.Vector3(-Math.sin(travel), 0, -Math.cos(travel)), across = new THREE.Vector3(Math.cos(carYaw), 0, -Math.sin(carYaw)), rear = new THREE.Vector3(-Math.sin(carYaw), 0, -Math.cos(carYaw)), puffs = [];
for (let i = 0; i < q('smoke', 40); i++) { const t = (i / 40) ** 1.4, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: new THREE.Color(1.0, 0.86, 0.9), opacity: 0.92 - 0.6 * t, rotation: (rnd() - 0.5) * 0.9, depthWrite: false, fog: true }));
  sp.position.copy(carAt).addScaledVector(rear, 1.2).addScaledVector(across, (i % 2 ? 0.72 : -0.72) * (1 - t * 0.6) + (rnd() - 0.5) * t * 3.4).addScaledVector(trail, t * 17); sp.position.y = 0.35 + t * 1.6 + rnd() * 0.3 * t; sp.scale.setScalar(0.9 + t * 5 + rnd() * 0.5); sp.userData = { y: sp.position.y, s: sp.scale.x, ph: rnd() * 6.28 }; puffs.push(sp); scene.add(sp); }

// ---- the camera's place and the picture's finish
camera.position.set(q('cx', -1.9), q('cy', 1.45), q('cz', 6.4)); camera.lookAt(q('lx', 3.6), q('ly', 1.0), q('lz', -7));
const composer = new EffectComposer(renderer); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); composer.addPass(new RenderPass(scene, camera));
if (q('ao', 1)) { const ao = new GTAOPass(scene, camera, innerWidth, innerHeight); const flats = []; scene.traverse((o) => { if (o.isSprite) flats.push(o); });
  const hide = ao._overrideVisibility.bind(ao), show = ao._restoreVisibility.bind(ao); ao._overrideVisibility = () => { hide(); for (const o of flats) o.visible = false; }; ao._restoreVisibility = () => { show(); for (const o of flats) o.visible = true; };
  ao.updateGtaoMaterial({ radius: q('aoR', 0.9), distanceExponent: 1.4, thickness: 1.2, scale: q('aoS', 1.3), samples: 16 }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); composer.addPass(ao); }
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), q('bloom', 0.3), 0.6, q('bloomT', 1.15)));
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSat: { value: q('sat', 1.1) }, uCon: { value: q('con', 1.05) }, uVig: { value: q('vig', 0.3) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig; varying vec2 vUv; void main() { vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat); c = (c - 0.5) * uCon + 0.5; vec2 d = vUv - 0.5; c *= 1.0 - uVig * dot(d, d) * 1.6; gl_FragColor = vec4(c, 1.0); }' }));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const clock = new THREE.Clock(); let frames = 0; const t0 = q('t', 0);
const frame = () => { const dt = Math.min(clock.getDelta(), 0.05); time.value += dt; const T = time.value + t0;
  for (const p of puffs) { p.position.y = p.userData.y + Math.sin(T * 0.7 + p.userData.ph) * 0.06 * p.userData.s; p.scale.setScalar(p.userData.s * (1 + 0.04 * Math.sin(T * 0.9 + p.userData.ph))); p.material.rotation += dt * 0.05; }
  composer.render(); if (frames === 6) window.__ready = true; if (++frames === 40) info.textContent = `${renderer.info.render.calls} calls, ${Math.round(renderer.info.render.triangles / 1000)}k triangles${window.__missing ? ', missing: ' + window.__missing.join(' ') : ''}`; requestAnimationFrame(frame); };
frame();
