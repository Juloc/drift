// The quay ring: the drift training place as the owner's harbour mockup shows it. A ring of track round (CX, CZ) on a quay at sunset: concrete barriers and
// chain-link fences on both sides, the kerb inside, a stand full of single people outside, palms, the harbour basin with cranes, a ship and a lighthouse
// behind it, a painted sky of our own, scanned asphalt with puddles and rubber, and things that move (palms, flags, people, sea, clouds, smoke).
// `buildQuay` makes the scene (it does not draw): the page owns the renderer and the loop and calls `tick(dt)` before each `composer.render()`.
// `still: true` adds what belongs to the still picture only: the car posed mid-drift with its smoke and the camera at the mockup's place.
// `still: false` is the scene for driving: `walls` and `bounds` in the scene's own axes (no turn: `yaw` is 0, `toWorld` leaves a point as it is),
// `smoke.emit(...)` for the tyres, `dressCar(model)` for the car's shadows and tail lights, `flats` for flat pictures the page adds.
// Models: palms' trunks, barriers, fence and people are Sketchfab models (CC BY, see docs/ASSETS.md); crowns, stand, cranes, ship and lighthouse are made here.
import * as THREE from '../../../vendor/three/three.module.js';
import { GLTFLoader } from '../../../vendor/three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from '../../../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../../vendor/three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from '../../../vendor/three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from '../../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../../../vendor/three/addons/postprocessing/ShaderPass.js';
import { hollowAt } from './harbour.js';

export async function buildQuay({ renderer, params = new URLSearchParams(), still = true, tier = 'high' }) {
const q = (k, d) => (params.has(k) ? +params.get(k) : d), OFF = new Set((params.get('off') || '').split(','));   // ?off=crowd,smoke,palms,shadow,ao,bloom switches a part off, to see what it costs
const SIZE = renderer.getSize(new THREE.Vector2());
renderer.shadowMap.enabled = !OFF.has('shadow'); renderer.shadowMap.type = THREE.PCFShadowMap;
const EXP = q('exp', 0.78); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = EXP;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(q('fov', 58), SIZE.x / SIZE.y, 0.3, 6000);
const rnd = (() => { let s = 77123; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
const time = { value: q('t', 0) }, up = new THREE.Vector3(0, 1, 0);
// a colour as it should come out on the screen: back through the screen curve and the exposure (the film curve's own squeeze is tuned by eye with `skyK`)
const SKYK = q('skyK', 0.95) / EXP, shown = (r, g, b, k = SKYK) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace).multiplyScalar(k);

// ---- the sky, painted: violet above, pink in the middle, orange at the horizon, a big low sun with its glow, small cloud streaks lit from the sun's side
const sunDir = new THREE.Vector3(q('sx', 0.72), q('sy', 0.085), -1).normalize();
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: sunDir }, uTime: time, uK: { value: SKYK },
  uTop: { value: shown(0.47, 0.36, 0.8, 1) }, uMid: { value: shown(0.97, 0.47, 0.62, 1) }, uHor: { value: shown(1.0, 0.68, 0.32, 1) }, uLow: { value: shown(0.8, 0.45, 0.5, 1) } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uSun, uTop, uMid, uHor, uLow; uniform float uTime, uK; varying vec3 vDir;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.27 + vn(p * 4.1 + 3.7) * 0.15 + vn(p * 8.3) * 0.08; }
    void main() {
      vec3 d = normalize(vDir); float y = d.y, s = max(dot(d, uSun), 0.0);
      vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.2, y)); c = mix(c, uTop, smoothstep(0.16, 0.6, y)); c = mix(uLow, c, smoothstep(-0.06, 0.0, y));
      c += vec3(1.0, 0.5, 0.16) * pow(s, 5.0) * 0.3 + vec3(1.0, 0.72, 0.3) * pow(s, 60.0) * 0.4;              // the glow round the sun
      if (y > 0.0) {                                                                                         // clouds: thin streaks, warm towards the sun, mauve away from it
        vec2 p = d.xz / (y + 0.2) * vec2(0.5, 2.2) + vec2(uTime * 0.004, 0.0);
        float m = smoothstep(0.5, 0.6, fbm(p * 2.6)) * smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.5, 0.85, y));
        vec3 cl = mix(vec3(0.99, 0.56, 0.7), vec3(1.0, 0.74, 0.44), pow(s, 2.0) * 0.8 + 0.2) * mix(0.8, 1.15, smoothstep(0.08, 0.4, y));
        c = mix(c, cl, m * 0.9);
      }
      c *= uK;
      float disc = smoothstep(0.99915, 0.99935, s); c = mix(c, vec3(1.0, 0.78, 0.4) * ${q('disc', 2.6).toFixed(2)}, disc);             // the sun itself, bright enough to bloom
      gl_FragColor = vec4(c, 1.0);
    }` });
scene.add(new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), skyMat));
// what the paint and the wet road mirror: the same sky, rendered once into a reflection map
{ const pm = new THREE.PMREMGenerator(renderer), s2 = new THREE.Scene(); s2.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat)); scene.environment = pm.fromScene(s2, 0, 1, 200).texture; scene.environmentIntensity = q('env', 0.9); }
const sun = new THREE.DirectionalLight(shown(1, 0.66, 0.4, 1), q('sun', 3.0));
const sunLift = new THREE.Vector3(sunDir.x, Math.max(sunDir.y, q('sunEl', 0.24)), sunDir.z).normalize();
sun.castShadow = true; sun.shadow.mapSize.set(q('shadowMap', 2048), q('shadowMap', 2048)); Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 300 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4; sun.shadow.intensity = q('shadowK', 0.5);
sun.target.position.set(-2, 0, -14); sun.position.copy(sun.target.position).addScaledVector(sunLift, 140); scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(shown(0.95, 0.62, 0.74, 1), shown(1, 0.64, 0.5, 1), q('hemi', 1.45)));   // violet from above, warm from the ground: the shadows' colour
{ const fill = new THREE.DirectionalLight(shown(1, 0.72, 0.74, 1), q('fill', 1.1)); fill.position.set(-30, 40, 60); scene.add(fill); }   // a soft pink light from behind the viewer, without shadow: what faces us is never left dark
scene.fog = new THREE.FogExp2(shown(1.0, 0.62, 0.42), q('fogD', 0.0034));

// ---- the place: a right-hand bend round (CX, CZ) on a quay; the harbour basin lies behind the bend's outside wall, a pier runs out on the left
const CX = 30, CZ = -4, R_INF = 17.95, R_IN = 18.4, R_KERB = 20.1, R_OUT = 33.2, R_OUTF = 33.8, R_QUAY = 40;
const onArc = (r, t) => [CX - r * Math.cos(t), CZ - r * Math.sin(t)], facing = (t) => -Math.PI / 2 - t;   // `facing`: the turn that points an object's own -z at the bend's middle (its x along the wall)
const arcTs = (r, t0, t1, step) => { const out = []; for (let t = t0; t < t1; t += step / r) out.push(t); return out; };
const ringTs = (r, step, even = 1) => { const n = Math.round(2 * Math.PI * r / step / even) * even, out = []; for (let i = 0; i < n; i++) out.push(-0.9 + i * 2 * Math.PI / n); return out; };   // a whole ring of pieces without a gap (`even`: a count that divides by it)
const tex = new THREE.TextureLoader(), wrap = (t, rep, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const REP = 1 / 4.5;
const asphalt = new THREE.MeshStandardMaterial({ map: wrap(await tex.loadAsync('assets/tex/asphalt_02_diff_1k.jpg'), REP, true), normalMap: wrap(await tex.loadAsync('assets/tex/asphalt_02_nor_gl_1k.jpg'), REP), roughnessMap: wrap(await tex.loadAsync('assets/tex/asphalt_02_rough_1k.jpg'), REP), color: new THREE.Color(params.get('asph') || '#d0b0a8').multiplyScalar(q('asphK', 1.7)), roughness: 1, envMapIntensity: 0.7 });
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
    float rr = distance(vWp.xz, vec2(${CX.toFixed(1)}, ${CZ.toFixed(1)})), lane = smoothstep(${(R_KERB + 1.2).toFixed(1)}, ${(R_KERB + 2.2).toFixed(1)}, rr) * (1.0 - smoothstep(${(R_OUT - 1.2).toFixed(1)}, ${(R_OUT - 0.4).toFixed(1)}, rr)), rub = 0.0;
    for (int j = 0; j < 7; j++) { float fj = float(j); vec2 cj = vec2(${CX.toFixed(1)}, ${CZ.toFixed(1)}) + vec2(sin(fj * 2.4), cos(fj * 1.7)) * 2.6; float rj = 23.6 + fj * 1.15 + sin(fj * 5.1) * 0.6, dj = distance(vWp.xz, cj) - rj, gap = 0.72, wj = 0.035 + 0.02 * sin(fj * 3.3);   // seven slides, each two tyre lines
      float on = smoothstep(0.35, 0.6, fbm(vWp.xz * 0.11 + fj * 9.0)); rub += (exp(-(dj - gap) * (dj - gap) / wj) + exp(-(dj + gap) * (dj + gap) / wj)) * on * (0.45 + 0.3 * sin(fj * 1.9)); }
    rub += exp(-(rr - 26.6) * (rr - 26.6) / 9.0) * 0.14;                                                       // and the line itself a shade darker
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.022, 0.035), clamp(rub, 0.0, 0.8) * lane);
    wetK = smoothstep(${q('wet0', 0.6).toFixed(3)}, ${q('wet1', 0.74).toFixed(3)}, hollow) * 0.95 + 0.06 * smoothstep(0.35, 0.6, big);
    diffuseColor.rgb *= mix(1.0, 0.62, wetK);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${q('wetR', 0.66).toFixed(2)}, wetK);`)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, wetK));');
};
{ const pts = [[-260, 90], [69, 90], [69, CZ]]; for (let t = Math.PI; t > 0.72; t -= 0.04) pts.push(onArc(R_QUAY, t)); pts.push([-2, -37], [-2, -300], [-260, -300]);
  const land = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? land.lineTo(x, -z) : land.moveTo(x, -z)));
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(land, { depth: 3, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -3, 0), asphalt); m.receiveShadow = true; scene.add(m); }
const seaMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(params.get('seaC') || '#8a5f96'), roughness: 0.16, metalness: 0, envMapIntensity: 2.0 });
seaMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = time;   // small waves that move: the sun's path on the water glitters
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 p = vWp.xz * 0.9; float t = uTime * 1.1; vec3 w = vec3(sin(p.x * 1.3 + t) + sin(p.y * 2.1 - t * 1.3) * 0.7 + sin((p.x + p.y) * 3.7 + t * 1.7) * 0.4, 0.0, cos(p.y * 1.7 + t * 1.1) + cos(p.x * 2.9 - t) * 0.6 + cos((p.x - p.y) * 4.3 + t * 2.1) * 0.4); normal = normalize(normal + (viewMatrix * vec4(w.x, 0.0, w.z, 0.0)).xyz * 0.085); }'); };
const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), seaMat); sea.position.set(0, -1.6, -1500); scene.add(sea);

// ---- helpers: each file once; a part of a model as geometry standing on the ground; copies as instances
const loader = new GLTFLoader(), files = new Map();
const file = (name) => { if (!files.has(name)) files.set(name, loader.loadAsync(`assets/${name}`)); return files.get(name); };
/** Files in the older "specular-glossiness" material format come out without their colour picture: fetch it from the file's own description. */
async function oldMaterials(gltf) { const defs = gltf.parser.json.materials ?? []; for (const [obj, ref] of gltf.parser.associations) { const ext = obj.isMaterial && ref.materials !== undefined ? defs[ref.materials]?.extensions?.KHR_materials_pbrSpecularGlossiness : null; if (!ext) continue;
    if (ext.diffuseTexture) { obj.map = await gltf.parser.getDependency('texture', ext.diffuseTexture.index); obj.map.colorSpace = THREE.SRGBColorSpace; } if (ext.diffuseFactor) obj.color.setRGB(ext.diffuseFactor[0], ext.diffuseFactor[1], ext.diffuseFactor[2]); obj.metalness = 0; obj.roughness = 1 - (ext.glossinessFactor ?? 0.3); obj.needsUpdate = true; } return gltf; }
const meshesOf = (root) => { const out = []; root.updateMatrixWorld(true); root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const sizeOf = (g) => { g.computeBoundingBox(); return g.boundingBox.getSize(new THREE.Vector3()); };
/** A mesh's geometry in the world's axes, centred, standing on y = 0, `height` metres high. */
function standing(mesh, height) { const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); g.computeBoundingBox(); const b = g.boundingBox, s = height / (b.max.y - b.min.y); g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.scale(s, s, s); return g; }
function instances(geo, mat, spots, { shadow = true, parent = scene, colors = null } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length), m = new THREE.Matrix4(), qt = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  spots.forEach(([x, z, ry = 0, sc = 1, y = 0], i) => { mesh.setMatrixAt(i, m.compose(p.set(x, y, z), qt.setFromAxisAngle(up, ry), s.set(sc, sc, sc))); if (colors) mesh.setColorAt(i, colors[i]); });
  mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere(); parent.add(mesh); return mesh;
}
/** A whole model file as parts (one per mesh) in one common measure: centred, standing on y = 0, `size` metres along `dim` (0 x, 1 y, 2 z, or 'long' for the longer of x and z). */
function modelParts(gltf, dim, size) { const ms = meshesOf(gltf.scene), box = new THREE.Box3(), geos = ms.map((o) => { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.computeBoundingBox(); box.union(g.boundingBox); return g; });
  const c = box.getCenter(new THREE.Vector3()), ext = box.getSize(new THREE.Vector3()), d = dim === 'long' ? (ext.x >= ext.z ? 0 : 2) : dim, k = size / ext.getComponent(d);
  const out = ms.map((o, i) => ({ geo: geos[i].translate(-c.x, -box.min.y, -c.z).scale(k, k, k), mat: o.material })); out.size = ext.multiplyScalar(k); return out; }
const placeParts = (ps, spots, opts) => ps.map((pt) => instances(pt.geo, pt.mat, spots, opts));
const flat = (c, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, envMapIntensity: 0.5, ...extra });
/** A slim box from a to b: the beams of cranes and rails. */
const beamO = new THREE.Object3D();
function beam(a, b, th) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), g = new THREE.BoxGeometry(th, th, A.distanceTo(B)); beamO.position.copy(A).add(B).multiplyScalar(0.5); beamO.lookAt(B); beamO.updateMatrix(); return g.applyMatrix4(beamO.matrix); }
const along = (g) => { const s = sizeOf(g); return s.x >= s.z ? 0 : Math.PI / 2; }, lengthOf = (g) => { const s = sizeOf(g); return Math.max(s.x, s.z); };

// ---- the walls of the bend: concrete barriers outside and inside, chain-link fences with barbed wire on both, the kerb inside
{ const g = await file('skfb/barriers.glb'), parts = meshesOf(g.scene).map((o) => ({ o, s: sizeOf(o.geometry) })).filter((p) => p.s.y > 1).sort((a, b) => a.s.x - b.s.x);
  const pick = parts[q('barrier', 1)] ?? parts[0], geo = standing(pick.o, 1.05), len = lengthOf(geo), a = along(geo), mat = pick.o.material.clone(); mat.envMapIntensity = 0.2; mat.roughness = 1; mat.color.multiplyScalar(q('barK', 0.85));
  instances(geo, mat, [...ringTs(R_OUT, len + 0.05).map((t) => [...onArc(R_OUT, t), facing(t) + a]), ...ringTs(R_IN, len + 0.05).map((t) => [...onArc(R_IN, t), facing(t) + a])]); }
{ const g = await file('skfb/fence-set.glb'), parts = meshesOf(g.scene), mat = parts[0].material.clone(); mat.side = THREE.DoubleSide; mat.alphaTest = 0.02; mat.transparent = true; mat.depthWrite = false; mat.envMapIntensity = 0.3; mat.color.multiplyScalar(0.6); mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a = min(1.0, diffuseColor.a * 1.9);'); };   // blended, not cut out: a far chain-link fence is a grey veil, a cut-out one vanishes
  const tall = standing(parts[q('fence', 0)], 4.5), low = standing(parts[q('fence2', 0)], 2.9);
  instances(tall, mat, ringTs(R_INF, lengthOf(tall) - 0.04).map((t) => [...onArc(R_INF, t), facing(t) + along(tall) + Math.PI]), { shadow: false });
  instances(low, mat, ringTs(R_OUTF, lengthOf(low) - 0.04).map((t) => [...onArc(R_OUTF, t), facing(t) + along(low)]), { shadow: false }); }
{ const shape = new THREE.Shape(); shape.moveTo(-1.2, 0); shape.lineTo(1.2, 0); shape.lineTo(1.2, 0.14); shape.lineTo(-1.2, 0.02); shape.closePath();   // low at the road, higher at the wall
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }).translate(0, 0, -0.6).rotateY(Math.PI / 2);
  const ts = ringTs(R_KERB, 1.24, 2), spot = (t) => [...onArc(R_KERB, t), facing(t) + Math.PI / 2];   // the block's own x points at the middle
  instances(geo, flat('#cf3640', 1), ts.filter((_, i) => i % 2 === 0).map(spot), { shadow: false }); instances(geo, flat('#d8cdc8', 1), ts.filter((_, i) => i % 2 === 1).map(spot), { shadow: false }); }
// boards on the outside fence: the bend goes right
{ const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#f6efe9'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#d92f52'; x.lineWidth = 30; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(60 + i * 110, 6); x.lineTo(122 + i * 110, 64); x.lineTo(60 + i * 110, 122); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const mat = new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.6 });
  for (const tt of [0.42, 0.95]) { const [x2, z2] = onArc(R_OUTF - 0.35, tt), b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 0.08), mat); b.position.set(x2, 1.95, z2); b.rotation.y = facing(tt); b.castShadow = true; scene.add(b); } }

// ---- people: every figure of the crowd file, frozen in two moments of its motion, as plain shapes that can be copied by the hundred
const people = await (async () => { const g = await file('skfb/crowd.glb'), mixer = new THREE.AnimationMixer(g.scene), out = []; if (g.animations[0]) mixer.clipAction(g.animations[0]).play();
  const skinned = []; g.scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); }); const v = new THREE.Vector3();
  for (const at of [0.3, 1.9]) { mixer.setTime(at); g.scene.updateMatrixWorld(true);
    for (const o of skinned) { o.skeleton.update(); const src = o.geometry, n = src.attributes.position.count, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', src.attributes.uv); geo.setIndex(src.index); geo.computeVertexNormals(); geo.computeBoundingBox();
      const b = geo.boundingBox, k = 1 / (b.max.y - b.min.y); geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.scale(k, k, k); out.push(geo); } }
  const mat = skinned[0].material.clone(); mat.roughness = 1; mat.metalness = 0; mat.envMapIntensity = 0.4; mat.emissive = new THREE.Color(1, 0.8, 0.7); mat.emissiveMap = mat.map; mat.emissiveIntensity = q('crowdGlow', 0.45);   // a little light of their own: the glow under the roof
  mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float ph = instanceMatrix[3][0] * 7.3 + instanceMatrix[3][2] * 3.1; transformed.y *= 1.0 + 0.035 * max(0.0, sin(uTime * 5.0 + ph)); transformed.x += sin(uTime * 2.3 + ph) * 0.03 * transformed.y; }'); };
  return { geos: out, mat }; })();
const CROWD_YAW = q('crowdYaw', Math.PI);
const crowdMeshes = [];
function crowd(spots, parent = scene) { if (OFF.has('crowd')) return; const by = people.geos.map(() => []); for (const s of spots) by[Math.floor(rnd() * by.length)].push(s);
  by.forEach((list, i) => list.length && crowdMeshes.push(instances(people.geos[i], people.mat, list.map(([x, z, ry, y = 0]) => [x, z, ry + CROWD_YAW + (rnd() - 0.5) * 0.7, 1.62 + rnd() * 0.22, y]), { parent, colors: list.map(() => new THREE.Color().setHSL(rnd(), 0.3, 0.7 + rnd() * 0.25).multiplyScalar(1.35)), shadow: false }))); }   // (no shadows of the people: they stand under a roof and behind a wall, and they are most of the scene's triangles)

// ---- the stand outside the bend: steps full of people under a flat roof with lamps, a rail, banners in front
{ // a grandstand model, three of it side by side (seats, stairs, rails), a person at most of its seats, a slim roof with lamps over it
  const T = q('standT', 0.45), MODW = q('standModW', 14), stand = new THREE.Group(), dark = flat('#3f3a4c', 0.6, { metalness: 0.3 }), roofM = flat('#8b8296', 0.7);
  const sg = await file('skfb/stand.glb'), sm = meshesOf(sg.scene), sbox = new THREE.Box3(), sgeo = sm.map((o) => { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); g.computeBoundingBox(); sbox.union(g.boundingBox); return g; });
  const ext = sbox.getSize(new THREE.Vector3()), cen = sbox.getCenter(new THREE.Vector3()), alongZ = ext.z > ext.x, k = MODW / Math.max(ext.x, ext.z), isSeat = (o) => /seat|lambert/i.test(o.material.name);
  for (const g of sgeo) { g.translate(-cen.x, -sbox.min.y, -cen.z).scale(k, k, k); if (alongZ) g.rotateY(Math.PI / 2); g.computeBoundingBox(); }   // the width along x
  { let lo = 0, hi = 0, nl = 0, nh = 0; sm.forEach((o, n) => { if (!isSeat(o)) return; const c = sgeo[n].boundingBox.getCenter(new THREE.Vector3()); if (c.z < 0) { lo += c.y; nl++; } else { hi += c.y; nh++; } }); if (lo / Math.max(1, nl) > hi / Math.max(1, nh)) for (const g of sgeo) { g.rotateY(Math.PI); g.computeBoundingBox(); } }   // the low rows to the front (-z)
  const SD = (alongZ ? ext.x : ext.z) * k, SH = ext.y * k, MODS = q('standMods', 3), W = MODW * MODS, byMat = new Map(); sm.forEach((o, n) => { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(sgeo[n]); });
  const modSpots = Array.from({ length: MODS }, (_, n) => [(n - (MODS - 1) / 2) * MODW, SD / 2]);
  for (const [mat, geos] of byMat) { const m = mat.clone(); m.envMapIntensity = 0.4; instances(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), m, modSpots, { parent: stand }); }
  const rb = (w, h, d, r = 0.06) => { const sh2 = new THREE.Shape(); sh2.moveTo(-w / 2 + r, 0); sh2.lineTo(w / 2 - r, 0); sh2.quadraticCurveTo(w / 2, 0, w / 2, r); sh2.lineTo(w / 2, h - r); sh2.quadraticCurveTo(w / 2, h, w / 2 - r, h); sh2.lineTo(-w / 2 + r, h); sh2.quadraticCurveTo(-w / 2, h, -w / 2, h - r); sh2.lineTo(-w / 2, r); sh2.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0); return new THREE.ExtrudeGeometry(sh2, { depth: d, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); };
  const add = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; stand.add(m); return m; };
  const RY = SH + q('roofUp', 2.3);
  add(rb(W + 2.4, 0.3, SD + 3.6), roofM, 0, RY, -2.4).rotation.x = -0.05; add(rb(W + 2.4, 0.5, 0.3), flat('#ec3f86', 0.6), 0, RY - 0.35, -2.7);
  for (let x = -W / 2; x <= W / 2 + 0.1; x += W / 6) { add(new THREE.CylinderGeometry(0.15, 0.18, RY + 0.3, 12), dark, x, (RY + 0.3) / 2, SD + 0.5); add(new THREE.CylinderGeometry(0.09, 0.09, RY + 0.2, 10), dark, x, (RY + 0.2) / 2, -1.4); }
  for (let x = -W / 2 + 3.5; x < W / 2; x += 7) { add(new THREE.BoxGeometry(1.8, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5).multiplyScalar(q('roofLamp', 3)) }), x, RY - 0.1, SD * 0.4, false); const l = new THREE.PointLight(shown(1, 0.8, 0.55, 1), 9, 14, 1.6); l.position.set(x, RY - 0.7, SD * 0.4); stand.add(l); }
  const seats = []; for (const [mx, mz] of modSpots) sm.forEach((o, n) => { if (!isSeat(o) || rnd() > q('seatsFull', 0.82)) return; const b = sgeo[n].boundingBox; seats.push([mx + (b.min.x + b.max.x) / 2, mz + (b.min.z + b.max.z) / 2 - 0.1, 0, b.min.y - q('seatDrop', 0.3)]); });
  window.__stand = { SD: +SD.toFixed(2), SH: +SH.toFixed(2), seats: seats.length, mats: [...byMat.keys()].map((m) => m.name) };
  crowd(seats, stand);
  const [sx, sz] = onArc(q('standR', 44), T); stand.position.set(sx, 0, sz); stand.rotation.y = facing(T); scene.add(stand);
  // feather banners between the fence and the stand: they wave
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#ec3f86'; x.fillRect(0, 0, 64, 256); x.strokeStyle = '#ffd9e8'; x.lineWidth = 7; for (let i = -2; i < 9; i++) { x.beginPath(); x.moveTo(-10, i * 44); x.lineTo(74, i * 44 - 50); x.stroke(); } x.fillStyle = '#ffffff'; x.fillRect(0, 96, 64, 46);
  const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace; const flagMat = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color('#ec3f86'), emissiveIntensity: 0.15 });
  flagMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float e = position.x + 0.6; transformed.z += sin(position.y * 1.7 + uTime * 3.2 + instanceMatrix[3][0]) * 0.22 * e; transformed.x += sin(position.y * 2.3 - uTime * 2.6) * 0.04 * e; }'); };
  const flags = [0.2, 0.33, 0.5, 0.64, 0.78].map((t) => [...onArc(R_OUTF + 1.0, t), facing(t) + 0.5, 1, 4.6]);
  instances(new THREE.PlaneGeometry(1.2, 5.4, 4, 18), flagMat, flags); instances(new THREE.CylinderGeometry(0.045, 0.06, 7.6, 8).translate(-0.64, -0.8, 0), flat('#e8e2dc', 0.5), flags); }
// people along the fence where the bend closes, and a rail at the water behind them
{ const spots = []; for (const t of arcTs(35.4, 0.7, 1.02, 0.8)) if (rnd() < 0.7) { const r = 35 + rnd() * 2.6; spots.push([...onArc(r, t), facing(t)]); } crowd(spots);
  const t0 = 0.74, t1 = 2.2, railM = flat('#4a4458', 0.5, { metalness: 0.4 }), rg = []; for (const t of arcTs(R_QUAY - 0.5, t0, t1, 2)) { const [ax, az] = onArc(R_QUAY - 0.5, t), [bx, bz] = onArc(R_QUAY - 0.5, t + 2 / (R_QUAY - 0.5)); rg.push(beam([ax, 0, az], [ax, 1.1, az], 0.07), beam([ax, 1.1, az], [bx, 1.1, bz], 0.06), beam([ax, 0.6, az], [bx, 0.6, bz], 0.04)); }
  const m = new THREE.Mesh(mergeGeometries(rg), railM); m.castShadow = true; scene.add(m); }

// a palm's crown: fronds from young (upright, light) to old (hanging, dark), each a drooping rib with slim leaflets hanging from both sides, and a few nuts
const frondMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, emissive: new THREE.Color(0.12, 0.14, 0.02), emissiveIntensity: q('frondGlow', 0.35) });
function frondCrown(seed) { let s0 = seed; const R = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 2147483647; }, pos = [], col = [], V = THREE.Vector3;
  const dark = new THREE.Color('#245f2c'), light = new THREE.Color('#8fae36'), ribC = new THREE.Color('#b99a45'), c = new THREE.Color(), tri = (a, b2, d, ca, cb, cd) => { pos.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, d.x, d.y, d.z); col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cd.r, cd.g, cd.b); };
  const N = 30; for (let f = 0; f < N; f++) { const age = f / (N - 1), az = f * 2.39996 + R() * 0.5, L = 3.0 + 1.3 * Math.sin(Math.PI * Math.min(1, age * 1.15)) + R() * 0.4, droop = 1.1 + 0.9 * R() + age * 0.5; let el = 1.25 - 1.75 * age ** 0.85 + (R() - 0.5) * 0.2; const p = new V(0, 0, 0), SEG = 12, pts = [], tans = [];
    for (let i = 0; i <= SEG; i++) { const t = new V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)); pts.push(p.clone()); tans.push(t); p.addScaledVector(t, L / SEG); el -= droop / SEG * (0.4 + 1.2 * i / SEG); }
    const base = c.copy(dark).lerp(light, 0.25 + 0.6 * (1 - age) + R() * 0.15).clone();
    for (let i = 0; i < SEG; i++) { const side = new V().crossVectors(tans[i], new V(0, 1, 0)).normalize().multiplyScalar(0.03 * (1 - i / SEG) + 0.012); tri(pts[i].clone().sub(side), pts[i].clone().add(side), pts[i + 1], ribC, ribC, ribC); }
    const ST = 15; for (let k = 2; k <= ST; k++) { const u = k / ST, fi = u * SEG, i = Math.min(SEG - 1, Math.floor(fi)), at = pts[i].clone().lerp(pts[i + 1], fi - i), T = tans[i], S = new V().crossVectors(T, new V(0, 1, 0)).normalize(), ll = (0.25 + 1.05 * Math.sin(Math.PI * u ** 0.75) ** 0.7) * (0.9 + R() * 0.2), w = 0.13;
      for (const sg of [-1, 1]) { const dir = new V().addScaledVector(T, 0.55).addScaledVector(S, sg).add(new V(0, -0.5 - 0.5 * u, 0)).normalize(), a = at.clone().addScaledVector(T, -w), b2 = at.clone().addScaledVector(T, w), m = at.clone().addScaledVector(dir, ll * 0.55), ma = m.clone().addScaledVector(T, -w * 0.8), mb = m.clone().addScaledVector(T, w * 0.8), tip = at.clone().addScaledVector(dir, ll).add(new V(0, -0.22 * ll, 0));
        const c0 = base.clone().multiplyScalar(0.8), c1 = base, c2 = base.clone().lerp(light, 0.5); tri(a, b2, mb, c0, c0, c1); tri(a, mb, ma, c0, c1, c1); tri(ma, mb, tip, c1, c1, c2); } } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const nut = new THREE.SphereGeometry(0.17, 8, 6).toNonIndexed(), nuts = []; for (let i = 0; i < 6; i++) { const a = i * 1.05, n = nut.clone().translate(Math.cos(a) * 0.28, -0.3 - (i % 2) * 0.12, Math.sin(a) * 0.28), cc = new Float32Array(n.attributes.position.count * 3); for (let j = 0; j < cc.length; j += 3) { cc[j] = 0.2; cc[j + 1] = 0.11; cc[j + 2] = 0.04; } n.setAttribute('color', new THREE.BufferAttribute(cc, 3)); n.deleteAttribute('uv'); nuts.push(n); }
  return mergeGeometries([g, ...nuts]); }
// ---- palms (the set's straightest two, their trunks drawn out so they stand tall): a row behind the outside fence, more behind the stand and on the pier; they sway
{ const sway = (src, top, crown) => { const m = src.clone(); m.envMapIntensity = 0.25; m.roughness = 0.9; m.metalness = 0; m.roughnessMap = null; m.metalnessMap = null; m.side = THREE.DoubleSide; if (crown && !m.vertexColors) m.color.multiply(new THREE.Color(1.0, 0.86, 0.6));
    m.onBeforeCompile = (sh) => { sh.uniforms.uTime = time; sh.uniforms.uTop = { value: top }; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uTop;').replace('#include <begin_vertex>', `#include <begin_vertex>\n{ float hh = max(transformed.y, 0.0) / 12.0; float ph = instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;${crown ? ' float tip = length(transformed.xz - uTop.xz); transformed.y += sin(uTime * 2.6 + ph + tip * 1.3) * 0.07 * tip;' : ''} transformed.x += sin(uTime * 1.1 + ph) * 0.35 * hh * hh; transformed.z += cos(uTime * 0.8 + ph) * 0.25 * hh * hh; }`); }; return m; };
  const spots = [[...onArc(35.6, 0.12), 13.5], [...onArc(36.4, -0.12), 12.5]];
  for (const t of [0.62, 0.86, 1.06, 1.24, 1.4, 1.56]) spots.push([...onArc(35.3 + rnd() * 1.2, t + (rnd() - 0.5) * 0.04), 8.5 + rnd() * 3]);
  for (let i = 0; i < 4; i++) spots.push([...onArc(54 + rnd() * 6, -0.05 + i * 0.22 + rnd() * 0.05), 12 + rnd() * 4]);
  for (let z = -52; z > -230; z -= 13 + rnd() * 10) spots.push([-5 - rnd() * 3, z, 10 + rnd() * 4]);
  for (let t = 1.9; t < 5.9; t += 0.34) spots.push([...onArc(36 + (t * 7 % 1) * 1.5, t), 9.5 + (t * 13 % 1) * 3.5]);   // and on round the rest of the ring
  if (q('palmPack', 1)) {   // three tall palms from a pack (trunk, fronds as cards, root), each brought to 12 m in its own measure; the fronds a fresher green, and the low sun shines through them
    const g = await file('skfb/palm-pack.glb'), groups = new Map(); for (const o of meshesOf(g.scene)) { const key = o.parent.name; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o); }
    const kinds = [...groups.values()].map((ms) => { const geos = ms.map((o) => o.geometry.clone().applyMatrix4(o.matrixWorld)), box = new THREE.Box3(); for (const gg of geos) { gg.computeBoundingBox(); box.union(gg.boundingBox); }
      const bi = Math.max(0, ms.findIndex((o) => /Base/i.test(o.name))), fi = ms.findIndex((o) => /Frond/i.test(o.name)), bc = geos[bi].boundingBox.getCenter(new THREE.Vector3()), fc = geos[Math.max(0, fi)].boundingBox.getCenter(new THREE.Vector3()), k = 12 / (box.max.y - box.min.y);
      const top = new THREE.Vector3((fc.x - bc.x) * k, (fc.y - box.min.y) * k, (fc.z - bc.z) * k);
      return ms.map((o, n) => { const m = sway(o.material, top, n === fi); if (n === fi) { m.transparent = false; m.alphaTest = q('frondCut', 0.35); m.depthWrite = true; m.color.setRGB(1.25, 1.6, 0.85); m.emissive = new THREE.Color(0.55, 0.75, 0.18); m.emissiveMap = m.map; m.emissiveIntensity = q('frondGlow', 0.55); } else m.color.multiplyScalar(1.5); return { geo: geos[n].translate(-bc.x, -box.min.y, -bc.z).scale(k, k, k), mat: m }; }); });
    if (!OFF.has('palms')) kinds.forEach((parts, n) => { const mine = spots.filter((_, k2) => k2 % kinds.length === n).map(([x, z, h]) => [x, z, rnd() * 6.28, h / 12]); for (const pt of parts) instances(pt.geo, pt.mat, mine); });
  } else { const g = await file('skfb/palm-set.glb'), groups = new Map(); for (const o of meshesOf(g.scene)) { const key = o.parent.name; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o); }
  const kinds = ['PalmTreeSet_LP020', 'PalmTreeSet_LP024'].map((name, n) => { const ms = groups.get(name) ?? [...groups.values()][n], trunkM = ms.find((o) => /Palm\.001/.test(o.name)) ?? ms[0], crownM = ms.find((o) => /Plam\.002/.test(o.name)) ?? ms[1], K = n ? 1.6 : 1.45;
    const trunk = trunkM.geometry.clone().applyMatrix4(trunkM.matrixWorld), crown = crownM.geometry.clone().applyMatrix4(crownM.matrixWorld); trunk.computeBoundingBox(); const b = trunk.boundingBox, p = trunk.attributes.position; let bx = 0, bz = 0, bn = 0, tx = 0, tz = 0, tn = 0;
    for (let i = 0; i < p.count; i++) { if (p.getY(i) < b.min.y + 0.4) { bx += p.getX(i); bz += p.getZ(i); bn++; } if (p.getY(i) > b.max.y - 0.4) { tx += p.getX(i); tz += p.getZ(i); tn++; } }
    const H = b.max.y - b.min.y, lx = tx / tn - bx / bn, lz = tz / tn - bz / bn, keep = q('lean', 0.25); trunk.translate(-bx / bn, -b.min.y, -bz / bn); crown.translate(-bx / bn, -b.min.y, -bz / bn);
    { const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const k = (tp.getY(i) / H) * (1 - keep); tp.setX(i, tp.getX(i) - lx * k); tp.setZ(i, tp.getZ(i) - lz * k); } }   // the set's palms lean far over: most of the lean is taken out, the curve stays
    crown.translate(-lx * (1 - keep), -H, -lz * (1 - keep)).translate(-lx * keep, 0, -lz * keep).scale(1.3, 1.3, 1.3).translate(lx * keep, H * K, lz * keep); trunk.scale(1, K, 1);
    const U = 12 / (H * K); trunk.scale(U, U, U); crown.scale(U, U, U);   // every palm 12 m high in its own measure, so the sway is in metres
    const top = new THREE.Vector3(lx * keep * U, 12, lz * keep * U), own = q('ownCrown', 1) ? frondCrown(31 + n * 17).translate(top.x, top.y - 0.25, top.z) : null;
    return { trunk, crown: own ?? crown, tm: sway(trunkM.material, top, false), cm: sway(own ? frondMat : crownM.material, top, true), H: 12 }; });
  if (!OFF.has('palms')) kinds.forEach((kd, n) => { const mine = spots.filter((_, i) => (i % 3 === 2 ? 1 : 0) === n).map(([x, z, h]) => [x, z, rnd() * 6.28, h / kd.H]); instances(kd.trunk, kd.tm, mine); instances(kd.crown, kd.cm, mine); }); }
}

// ---- the harbour: containers on the pier, cranes and a ship across the basin, a lighthouse on its rock, a sail
const rib = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 16, 0); gr.addColorStop(0, '#8a8a8a'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#8a8a8a'); x.fillStyle = gr; for (let i = 0; i < 4; i++) { x.save(); x.translate(i * 16, 0); x.fillRect(0, 0, 16, 8); x.restore(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const boxCols = ['#c9564a', '#4f79a8', '#dcb25a', '#5b9a8c', '#c35f84', '#e9e1d8', '#7a62a8', '#d9773f'], boxGeo = new THREE.BoxGeometry(12.2, 2.6, 2.44), boxMats = boxCols.map((c) => new THREE.MeshStandardMaterial({ color: c, map: rib, roughness: 0.7, envMapIntensity: 0.4 }));
const boxModel = await (async () => { const ps = modelParts(await file('skfb/container.glb'), 'long', 12.2), g = ps[0].geo; if (ps.size.z > ps.size.x) g.rotateY(Math.PI / 2); const m = ps[0].mat.clone(); m.envMapIntensity = 0.4; m.color.set('#ffffff'); return { geo: g, mat: m, h: ps.size.y }; })();
function containers(stacks, parent = scene, near = false) { if (near) { const spots = [], cols = []; for (const [x, z, ry, h, y0 = 0] of stacks) for (let k2 = 0; k2 < h; k2++) { spots.push([x, z, ry + (rnd() - 0.5) * 0.02 + (rnd() < 0.5 ? Math.PI : 0), 1, y0 + k2 * (boxModel.h + 0.02)]); cols.push(new THREE.Color(boxCols[Math.floor(rnd() * boxCols.length)]).multiplyScalar(1.5)); } instances(boxModel.geo, boxModel.mat, spots, { parent, colors: cols }); return; }
  const by = boxCols.map(() => []); for (const [x, z, ry, h, y0 = 0] of stacks) for (let k = 0; k < h; k++) by[Math.floor(rnd() * by.length)].push([x, z, ry + (rnd() - 0.5) * 0.02, 1, y0 + 1.3 + k * 2.62]); by.forEach((l, i) => l.length && instances(boxGeo, boxMats[i], l, { parent })); }
{ const stacks = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) stacks.push([-52 + i * 12.7, -58 - r * 2.7, 0, r === 0 ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 2)]);
  for (let z = -95; z > -280; z -= 16) for (let c = 0; c < 2; c++) if (rnd() < 0.8) stacks.push([-22 - c * 3 - rnd(), z, Math.PI / 2, 1 + Math.floor(rnd() * 4)]); containers(stacks.filter((st) => st[1] > -150), scene, true); containers(stacks.filter((st) => st[1] <= -150)); }
const FQX = q('fqx', 8), farQuay = new THREE.Mesh(new THREE.BoxGeometry(104, 3, 30), flat('#a39aa4', 0.9)); farQuay.position.set(FQX, -0.6, -265); scene.add(farQuay);
{ // ship-to-shore cranes on the far quay (one model, four times), their booms out over the water
  const cr = modelParts(await file('skfb/crane.glb'), 1, q('craneH', 46)), turn = (cr.size.x > cr.size.z ? Math.PI / 2 : 0) + q('craneTurn', 0); for (const pt of cr) { pt.mat = pt.mat.clone(); pt.mat.envMapIntensity = 0.4; }
  placeParts(cr, [[FQX - 36, -253, turn, 1], [FQX - 6, -253, turn, 1.08], [FQX + 20, -253, turn, 1], [FQX + 42, -253, turn, 0.95]]);
  containers([-44, -30, -18, 2, 14, 34, 44].map((dx) => [FQX + dx, -270, 0, 1 + Math.floor(rnd() * 4), 0.9])); }
{ // the container ship, lying side on in front of the far quay
  const sp = modelParts(await file('skfb/ship.glb'), 'long', q('shipL', 110)), turn = (sp.size.x >= sp.size.z ? 0 : Math.PI / 2) + q('shipYaw', 0.06); for (const pt of sp) { pt.mat = pt.mat.clone(); pt.mat.envMapIntensity = 0.4; }
  placeParts(sp, [[q('shipX', 62), q('shipZ', -232), turn, 1, q('shipY', -2.2)]]); }
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const glow = (x, y, z, size, col, k) => { const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(...col).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); g.position.set(x, y, z); g.scale.setScalar(size); scene.add(g); return g; };
{ // the lighthouse (a model: white with red bands), its lamp glowing, on rocks in the basin
  const lhParts = modelParts(await oldMaterials(await file('skfb/lighthouse.glb')), 1, q('lhH', 22)); for (const pt of lhParts) { pt.mat = pt.mat.clone(); pt.mat.envMapIntensity = 0.4; }
  const rocks = await file('env/rocks.glb'), rm = meshesOf(rocks.scene)[0], rg = standing(rm, 1), rmat = rm.material.clone(); rmat.color = new THREE.Color('#8d7a86'); rmat.envMapIntensity = 0.3;
  const LX = q('lhx', 96), LZ = q('lhz', -160); placeParts(lhParts, [[LX, LZ, q('lhTurn', 0), 1, 3.2]]); glow(LX, 3.2 + q('lhH', 22) * 0.86, LZ, 7, [1, 0.8, 0.5], 1.6);
  instances(rg, rmat, [[LX, LZ, 0.4, 6.5, -2.2], [LX - 9, LZ + 2, 2.1, 4.2, -2.4], [LX + 8, LZ - 1, 4.0, 4.6, -2.6], [LX + 3, LZ + 6, 1.2, 3.4, -2.3], [LX - 4, LZ - 6, 5.2, 3.8, -2.5], [LX + 15, LZ + 3, 0.9, 2.2, -1.9], [LX - 16, LZ + 5, 3.3, 2.0, -1.9]]);
  const sail = new THREE.Group(), tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#fff3e6', side: THREE.DoubleSide, roughness: 0.8 })); };
  sail.add(tri([[0, 1, 0], [0, 11, 0], [4.6, 1.4, 0]]), tri([[-0.3, 1, 0], [-0.3, 9, 0], [-3.4, 1.2, 0]])); const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8).scale(4.2, 0.9, 1.2), flat('#f1e9e2', 0.5)); hull.position.y = 0.2; sail.add(hull);
  sail.position.set(q('sailX', 150), -1.5, q('sailZ', -215)); sail.rotation.y = 0.5; scene.add(sail); }
// lamps on slim masts behind the outside fence
{ const masts = [0.74].map((t) => onArc(R_OUTF + 0.9, t)); instances(new THREE.CylinderGeometry(0.08, 0.13, 10, 10).translate(0, 5, 0), flat('#4a4654', 0.5, { metalness: 0.4 }), masts);
  for (const [x, z] of masts) glow(x, 10.1, z, 1.3, [1, 0.85, 0.6], q('lamp', 1.2)); }


// ---- smoke as bodies, not pictures: round lumps that melt into one mass (a solid core each, a soft shell round it that fades at its outline),
// lit like everything else: bright towards the sun and from above, pink-mauve underneath, a warm rim where the low sun shines through.
// A lump is born small at a tyre, grows and rises, loses its core and then fades. `emit` is for the driving page, `pose` for the still.
const flats = [];   // what stays out of the ambient occlusion's shape pass: flat pictures and the smoke's shells
const smoke = (() => { const MAX = q('smokeMax', 240), K = q('smokeK', 0.82) / EXP, uni = { uTime: time, uSun: { value: sunLift }, uLit: { value: shown(1.0, 0.78, 0.78, K) }, uShade: { value: shown(0.86, 0.42, 0.6, K) }, uRim: { value: shown(1.0, 0.7, 0.45, K * q('smokeRim', 0.5)) } };
  const geo = new THREE.IcosahedronGeometry(1, q('lumpDetail', tier === 'low' ? 4 : 6)), aFade = new THREE.InstancedBufferAttribute(new Float32Array(MAX).fill(1), 1), aSeed = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1); for (let i = 0; i < MAX; i++) aSeed.array[i] = (i * 0.6180339) % 1 * 40; geo.setAttribute('aFade', aFade); geo.setAttribute('aSeed', aSeed);
  const mat = (shell) => { const m = new THREE.MeshLambertMaterial({ transparent: shell, depthWrite: !shell }); m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aFade, aSeed; varying float vFade;').replace('#include <begin_vertex>', `#include <begin_vertex>
      { vFade = aFade; vec3 p = position * 2.6 + aSeed; transformed *= 1.0 + 0.13 * (sin(p.x * 1.7 + p.y * 1.1) * sin(p.y * 1.9 - p.z * 1.3) + 0.5 * sin(p.z * 3.1 + p.x * 2.3 + uTime * 0.6)) + 0.03 * sin(uTime * 1.1 + aSeed); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSun, uLit, uShade, uRim; varying float vFade;').replace('#include <opaque_fragment>', `
      { vec3 nV = normalize(vNormal), nW = normalize((vec4(nV, 0.0) * viewMatrix).xyz), vD = normalize(vViewPosition); float fres = 1.0 - max(dot(nV, vD), 0.0), w = dot(nW, uSun) * 0.5 + 0.5, k = smoothstep(0.22, 0.86, 0.6 * (nW.y * 0.5 + 0.5) + 0.4 * w);
        outgoingLight = mix(uShade, uLit, k) + uRim * pow(fres, 2.5) * w; ${shell ? 'diffuseColor.a = (1.0 - smoothstep(0.3, 1.0, fres)) * 0.92 * vFade;' : ''} }
      #include <opaque_fragment>`); }; return m; };
  const core = new THREE.InstancedMesh(geo, mat(false), MAX), shell = new THREE.InstancedMesh(geo, mat(true), MAX); for (const m of [core, shell]) { m.count = 0; m.frustumCulled = false; scene.add(m); } core.castShadow = tier !== 'low'; shell.renderOrder = 5; flats.push(shell);
  const P = [], m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), SHELL = q('shell', 1.22), sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const write = () => { let n = 0; for (const p of P) { const u = p.age / p.life, r = p.r0 + (p.r1 - p.r0) * (1 - Math.exp(-2.6 * p.age)), y = p.y0 + r * 0.62 + p.lift * (1 - Math.exp(-1.5 * p.age)), ck = p.fixed ? 1 : 1 - sm(0.3, 0.75, u); qt.setFromAxisAngle(up, p.turn);
      core.setMatrixAt(n, m4.compose(pos.set(p.x, y, p.z), qt, sc.setScalar(Math.max(1e-4, r * ck)))); shell.setMatrixAt(n, m4.compose(pos, qt, sc.setScalar(r * SHELL))); aFade.array[n] = p.fixed ? 1 : 1 - sm(0.5, 1, u); aSeed.array[n] = p.seed; n++; }
    core.count = shell.count = n; core.instanceMatrix.needsUpdate = shell.instanceMatrix.needsUpdate = aFade.needsUpdate = aSeed.needsUpdate = true; };
  return { core, shell, get alive() { return P.length; },
    /** A new lump at a tyre: the place in the scene's axes, `k` 0..1 how hard the tyre smokes, the car's speed there (m/s; the lump keeps a little of it). */
    emit(x, z, k = 1, vx = 0, vz = 0) { if (OFF.has('smoke')) return; if (P.length >= MAX) P.shift(); P.push({ x, z, y0: 0, vx: vx * 0.15, vz: vz * 0.15, r0: 0.16 + 0.1 * k, r1: 0.7 + 1.3 * k + rnd() * 0.4, lift: 0.3 + 1.2 * k * rnd(), life: 1.3 + 0.9 * k, age: 0, turn: rnd() * 6.28, seed: rnd() * 40 }); },
    /** Lumps that stand still, for the still picture: [x, z, radius, lift]. */
    pose(list) { for (const [x, z, r, lift] of list) P.push({ x, z, y0: 0, vx: 0, vz: 0, r0: r, r1: r, lift: 0, life: 1, age: 0, turn: rnd() * 6.28, seed: rnd() * 40, fixed: true, }), (P[P.length - 1].y0 = lift); write(); },
    update(dt) { if (!P.length) { if (core.count) write(); return; } for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; if (p.fixed) continue; p.age += dt; if (p.age >= p.life) { P.splice(i, 1); continue; } const d = Math.exp(-3 * p.age); p.x += p.vx * d * dt; p.z += p.vz * d * dt; } write(); },
    clear() { P.length = 0; write(); } }; })();

/** The car's look in this light: it casts and takes shadows, its tail lamps glow a deep red that stays red through the film curve. */
function dressCar(model) { model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (/lamp_rear/.test(o.material.name)) { o.material = o.material.clone(); o.material.color = new THREE.Color(0.4, 0.0, 0.02); o.material.emissive = new THREE.Color(1, 0.0, 0.04); o.material.emissiveIntensity = q('tail', 1.5); } } }); return model; }

// ---- the still: the car sliding through the bend with its smoke, the camera at the mockup's place
const CAR_T = q('carT', 0.09), carAt = (([x, z]) => new THREE.Vector3(x, 0, z))(onArc(q('carR', 26.6), CAR_T)), bearing = CAR_T + q('slip', 0.3), carYaw = Math.PI - bearing;
let car = null;
if (still) { car = dressCar((await loader.loadAsync('assets/cars/ae86-hi.glb')).scene); const carHold = new THREE.Group(); carHold.add(car); carHold.position.copy(carAt); carHold.rotation.y = carYaw; car.rotation.z = q('roll', -0.045); scene.add(carHold);
  car.traverse((o) => { if (/^wheel_f[lr]$/.test(o.name)) o.rotation.y = q('steer', 0.42); });
  carHold.updateMatrixWorld(true); const wheels = ['wheel_rl', 'wheel_rr'].map((n) => car.getObjectByName(n).getWorldPosition(new THREE.Vector3())), dirOf = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), back = Math.atan2(-Math.sin(bearing), Math.cos(bearing)), lumps = [];
  const lump = (at, r, lift = 0) => lumps.push([at.x, at.z, r, lift]);
  for (let i = 0; i < (OFF.has('smoke') ? 0 : q('fan', 34)); i++) { const d = 0.2 + rnd() ** 1.2 * 3.0, a = back + q('fanA', -0.6) + (rnd() - 0.5) * 1.1; lump(wheels[i % 2].clone().addScaledVector(dirOf(a), d), 0.16 + d * 0.07 + rnd() * 0.1); }   // low smoke creeping over the ground behind both wheels
  const trail = dirOf(q('trail', -1.25)), side = new THREE.Vector3(trail.z, 0, -trail.x), N = OFF.has('smoke') ? 0 : q('smoke', 110);                                                       // the plume: off to the outside of the bend, growing and rising
  for (let i = 0; i < N; i++) { const t = (i / N) ** 1.15, r = 0.3 + 1.9 * t ** 1.05 + rnd() * (0.12 + t * 0.6); lump(wheels[0].clone().addScaledVector(trail, 1.5 + t * 9.5).addScaledVector(side, (rnd() - 0.5) * (0.5 + t * 4.2)), r, rnd() * (0.15 + t * 2.6)); }
  smoke.pose(lumps); }

// ---- the camera's place and the picture's finish
if (q('top', 0)) { scene.fog = null; camera.position.set(q('cx', 10), q('cy', 190), q('cz', -60)); camera.lookAt(q('cx', 10), 0, q('cz', -60) - 0.01); }
else { const tan = new THREE.Vector3(Math.sin(CAR_T), 0, -Math.cos(CAR_T)), inside = new THREE.Vector3(Math.cos(CAR_T), 0, Math.sin(CAR_T)), cam = carAt.clone().addScaledVector(tan, -q('back', 5.0)).addScaledVector(inside, q('in', 1.5));
  camera.position.set(q('cx', cam.x), q('cy', 1.95), q('cz', cam.z)); const aim = camera.position.clone().addScaledVector(tan, 15).addScaledVector(inside, q('aim', -1.45)); camera.lookAt(q('lx', aim.x), q('ly', 0.5), q('lz', aim.z)); }
const composer = new EffectComposer(renderer); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(SIZE.x, SIZE.y); composer.addPass(new RenderPass(scene, camera));
scene.traverse((o) => { if (o.isSprite) flats.push(o); });
let aoPass = null; const AOS = q('aoScale', 0.5);   // the ambient occlusion at half size: it is soft anyway, and it was the dearest part of the picture
if (q('ao', 1) && !OFF.has('ao')) { const ao = aoPass = new GTAOPass(scene, camera, SIZE.x, SIZE.y), size = ao.setSize.bind(ao); ao.setSize = (w, h) => size(Math.ceil(w * AOS), Math.ceil(h * AOS));
  const hide = ao._overrideVisibility.bind(ao), show = ao._restoreVisibility.bind(ao), was = []; ao._overrideVisibility = () => { hide(); was.length = 0; for (const o of flats) { was.push(o.visible); o.visible = false; } }; ao._restoreVisibility = () => { show(); flats.forEach((o, i) => { o.visible = was[i]; }); };
  ao.updateGtaoMaterial({ radius: q('aoR', 0.9), distanceExponent: 1.4, thickness: 1.2, scale: q('aoS', 1.3), samples: 16 }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); composer.addPass(ao); }
const bloom = OFF.has('bloom') ? null : new UnrealBloomPass(new THREE.Vector2(SIZE.x, SIZE.y), q('bloom', 0.26), 0.6, q('bloomT', 1.6)); if (bloom) composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSat: { value: q('sat', 1.12) }, uCon: { value: q('con', 1.04) }, uVig: { value: q('vig', 0.2) }, uSpeed: { value: q('speed', 0) }, uAim: { value: new THREE.Vector2(0.5, 0.56) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // the picture's finish: colour and a soft dark edge. (`uSpeed` streaks the edges away from the point the car drives to; it smears the car too, so it stays at 0 until the car is masked out.)
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig, uSpeed; uniform vec2 uAim; varying vec2 vUv;
    void main() { vec2 d = vUv - uAim; float far = smoothstep(0.24, 0.62, length(d * vec2(1.0, 1.25))) * uSpeed; vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (far > 0.002) { vec3 a = c; for (int i = 1; i < 7; i++) a += texture2D(tDiffuse, vUv - d * far * 0.05 * float(i)).rgb; c = a / 7.0; }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat); c = (c - 0.5) * uCon + 0.5; vec2 e = vUv - 0.5; c *= 1.0 - uVig * dot(e, e) * 1.6; gl_FragColor = vec4(c, 1.0); }` });
composer.addPass(grade);

// ---- what the driving page needs
const circle = (r) => { const pts = []; for (let i = 0; i <= 96; i++) pts.push(onArc(r, i * Math.PI / 48).map((v) => +v.toFixed(2))); return pts; };
const walls = [circle(R_OUT - 0.32), circle(R_IN + 0.32)], bounds = [[CX - 36, CZ - 36], [CX + 36, CZ - 36], [CX + 36, CZ + 36], [CX - 36, CZ + 36]];
const sunOffset = sun.position.clone().sub(sun.target.position);
const api = { scene, root: scene, camera, composer, sun, sunOffset, yaw: 0, toWorld: (x, y, z) => new THREE.Vector3(x, y, z), still: still ? { car } : null, walls, bounds, cones: [], coneSpots: [], flats, smoke, dressCar,
  /** The ring: its middle, the walls' radii, the line a car slides on, and where the still's car stands (start there, heading along the ring). */
  ring: { cx: CX, cz: CZ, inner: R_IN, outer: R_OUT, line: 26.6, start: { x: carAt.x, z: carAt.z, yaw: Math.PI - CAR_T } },   // (`yaw` as three.js turns a model whose nose is +z: here along the ring, clockwise seen from above, a right-hand bend)
  /** how deep the puddle is at a point (0 dry .. 1 water): the asphalt shader's own noise */
  puddleAt: (x, z) => hollowAt(x, z, q('wet0', 0.6), q('wet1', 0.74)),
  /** Once a frame before the render: the time of everything that moves, the smoke's lumps; `speed` 0..1 streaks the picture's edges. */
  tick(dt, speed) { time.value += dt; smoke.update(dt); if (speed !== undefined) grade.uniforms.uSpeed.value = speed; },
  resize(w, h) { renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); },
  /** 'high' or 'low' (the phone): low has no ambient occlusion, a smaller shadow map, a pixel ratio of at most 1.5, four people in ten. */
  async setTier(name) { const low = name === 'low'; if (aoPass) aoPass.enabled = !low;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.5 : 2)); composer.setPixelRatio(renderer.getPixelRatio()); const s = renderer.getSize(new THREE.Vector2()); composer.setSize(s.x, s.y);
    sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); sun.shadow.map?.dispose(); sun.shadow.map = null;
    for (const m of crowdMeshes) { m.userData.full ??= m.count; m.count = low ? Math.ceil(m.userData.full * 0.4) : m.userData.full; }
    smoke.core.castShadow = !low; return api; },
  memoryEstimate() { const seen = new Set(); let tex = 0; scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) { const t = m[k]; if (t && t.image && !seen.has(t)) { seen.add(t); tex += (t.image.width ?? 0) * (t.image.height ?? 0) * 4 * 1.33; } } });
    const pr = renderer.getPixelRatio(), s = renderer.getSize(new THREE.Vector2()), W = s.x * pr, H = s.y * pr, targets = 2 * W * H * 8 + (aoPass?.enabled ? W * H * AOS * AOS * 20 : 0) + W * H * 8 * 1.33 + sun.shadow.mapSize.x ** 2 * 4;
    return { texturesMB: +(tex / 1048576).toFixed(1), skyMB: 0, targetsMB: +(targets / 1048576).toFixed(1), totalMB: +((tex + targets) / 1048576).toFixed(1), note: 'estimate: sizes of the uploaded pictures, not what the driver reports' }; },
  dispose() { scene.traverse((o) => { o.geometry?.dispose?.(); for (const m of [].concat(o.material ?? [])) { for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) m[k]?.dispose?.(); m.dispose?.(); } }); composer.dispose?.(); },
};
if (tier === 'low') await api.setTier('low');
return api;
}
