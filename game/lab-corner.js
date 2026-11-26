// The hero corner: one small, dense piece of the drift training place, built from real models (Kenney and Quaternius kits, CC0), lit by a real sunset
// sky (Poly Haven, CC0) with a sun that casts soft shadows, ambient occlusion, bloom and fog. A fixed camera: this page exists to make ONE picture stand
// next to the owner's mockup before anything wider is built. Nothing of the game's old look is used here.
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from '../vendor/three/addons/loaders/HDRLoader.js';
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
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = q('exp', 0.42);
const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
const camera = new THREE.PerspectiveCamera(q('fov', 42), innerWidth / innerHeight, 0.3, 4000);
const rnd = (() => { let s = 20261127; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

// ---- the sky: a real sunset as background, as the light of everything and as what the wet asphalt and the paint mirror. The sun is found in the
// picture itself; the whole place is turned so that the sea lies towards it.
const skyName = params.get('sky') || 'belfast_sunset_puresky';
const hdr = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(`assets/sky/${skyName}_2k.hdr`);
hdr.mapping = THREE.EquirectangularReflectionMapping;
const sunDir = (() => {
  const { data, width, height } = hdr.image; let best = 0, bu = 0, bv = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) { const i = (y * width + x) * 4, l = data[i] + data[i + 1] + data[i + 2]; if (l > best) { best = l; bu = x / width; bv = y / height; } }
  const phi = (bu - 0.5) * Math.PI * 2, el = Math.max(0.06, Math.abs((0.5 - bv) * Math.PI));
  return new THREE.Vector3(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi)).normalize();
})();
scene.background = hdr; scene.backgroundIntensity = q('bg', 0.5); scene.environment = hdr; scene.environmentIntensity = q('env', 0.75);
// the place's own axes: -z looks to the sea; the sun stands a little to the right of that
const sunAz = Math.atan2(sunDir.x, -sunDir.z), yaw = -(sunAz - q('sunSide', -0.3));
root.rotation.y = yaw;
const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.72, 0.5), q('sun', 3.2));
const sunLift = new THREE.Vector3(sunDir.x, Math.max(sunDir.y, q('sunEl', 0.24)), sunDir.z).normalize();   // lit from a little higher than the sun stands, so shadows are not endless
sun.position.copy(sunLift.clone().multiplyScalar(90)); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 5;
scene.add(sun, sun.target);
scene.fog = new THREE.FogExp2(new THREE.Color(params.get('fog') || '#e9a98f'), q('fogD', 0.0007));

// ---- models: each file once; many copies as instances (one draw call per material of a model)
const loader = new GLTFLoader(), cache = new Map();
const load = (path) => { if (!cache.has(path)) cache.set(path, loader.loadAsync(`assets/${path}`).then((g) => g.scene)); return cache.get(path); };
const up = new THREE.Vector3(0, 1, 0);
/** Places a model at many spots: [[x, z, turn, scale, y?]...]. */
async function scatter(path, spots, { shadow = true, receive = true, tint = null, green = null } = {}) {
  if (!spots.length) return;
  const src = await load(path); src.updateMatrixWorld(true);
  // the kits' models stand anywhere in their own file: bring each to its own middle, standing on the ground
  const bb = new THREE.Box3().setFromObject(src), c = bb.getCenter(new THREE.Vector3()), fix = new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z);
  const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), hc = { h: 0, s: 0, l: 0 };
  src.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material.clone(); if (tint) mat.color.multiply(new THREE.Color(tint)); mat.envMapIntensity = 0.6;
    mat.color.getHSL(hc); if (green && hc.h > 0.36 && hc.h < 0.56 && hc.s > 0.2) mat.color.setHSL(hc.h - 0.14 + (green[0] ?? 0), hc.s * (green[1] ?? 0.75), hc.l * (green[2] ?? 0.82));   // the kit's teal greens to the place's warm green
    const mesh = new THREE.InstancedMesh(o.geometry, mat, spots.length);
    spots.forEach(([x, z, ry = 0, sc = 1, y = 0], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), qt.setFromAxisAngle(up, ry), s.set(sc, sc, sc)).multiply(fix).multiply(o.matrixWorld)));
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = shadow; mesh.receiveShadow = receive; mesh.computeBoundingSphere(); root.add(mesh);
  });
}

// ---- the ground: real asphalt (colour, bumps, roughness from a scanned surface), with puddles that mirror the sky; grass beyond it; the sea
const tex = new THREE.TextureLoader(), wrap = (t, rep, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const PAD = 84, REP = PAD / 4.5;
const asphalt = new THREE.MeshStandardMaterial({ map: wrap(await tex.loadAsync('assets/tex/asphalt_02_diff_1k.jpg'), REP, true), normalMap: wrap(await tex.loadAsync('assets/tex/asphalt_02_nor_gl_1k.jpg'), REP), roughnessMap: wrap(await tex.loadAsync('assets/tex/asphalt_02_rough_1k.jpg'), REP), color: new THREE.Color(params.get('asph') || '#8f8a90'), roughness: 1, envMapIntensity: 1.2 });
asphalt.normalScale.set(0.9, 0.9);
asphalt.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 vWp; float wetK;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.2; }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
    float big = fbm(vWp.xz * 0.05), hollow = fbm(vWp.xz * 0.16 + 31.0);
    diffuseColor.rgb *= 0.86 + 0.26 * big;                                   // lighter and darker areas, so it is not one grey
    wetK = smoothstep(${q('wet0', 0.46).toFixed(3)}, ${q('wet1', 0.58).toFixed(3)}, hollow) * 0.95 + 0.25 * smoothstep(0.35, 0.6, big);   // puddles in the hollows, damp around them
    diffuseColor.rgb *= mix(1.0, 0.6, wetK);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.03, wetK);')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, wetK));');   // water lies flat over the bumps
};
const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD, PAD).rotateX(-Math.PI / 2), asphalt); pad.receiveShadow = true; pad.position.set(0, 0, -PAD / 2 + 26); root.add(pad);
const grassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(params.get('grassC') || '#6f8a45'), roughness: 1, envMapIntensity: 0.5 });
const land = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), grassMat); land.receiveShadow = true; land.position.set(-200 - PAD / 2, -0.04, 0); root.add(land);
const land2 = new THREE.Mesh(new THREE.PlaneGeometry(700, 300).rotateX(-Math.PI / 2), grassMat); land2.receiveShadow = true; land2.position.set(0, -0.04, 26 + 150); root.add(land2);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(params.get('seaC') || '#22304f'), roughness: 0.1, metalness: 0, envMapIntensity: 1.25 }));
sea.position.set(0, -1.6, -PAD + 26 - 1500 - 4); root.add(sea);
const quay = new THREE.Mesh(new THREE.BoxGeometry(700, 3, 6), new THREE.MeshStandardMaterial({ color: '#b7a79b', roughness: 0.9 })); quay.position.set(0, -1.5 + 0.02, -PAD + 26 - 1); quay.receiveShadow = true; quay.castShadow = true; root.add(quay);
// painted lines and rubber: a curve of the exercise through the picture
const paint = new THREE.MeshStandardMaterial({ color: '#efeae2', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), rubber = new THREE.MeshBasicMaterial({ color: '#08070a', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
const arc = (cx, cz, r, a0, a1, w, mat, y) => { const g = new THREE.RingGeometry(r - w / 2, r + w / 2, 96, 1, a0, a1 - a0).rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.set(cx, y, cz); m.receiveShadow = true; root.add(m); };
arc(14, -4, 16, 1.6, 4.9, 0.28, paint, 0.012); arc(14, -4, 22, 1.4, 5.0, 0.28, paint, 0.012);
for (const [r, w] of [[17.6, 0.5], [18.5, 0.42], [19.6, 0.55], [20.4, 0.36]]) arc(14, -4, r, 1.9 + rnd() * 0.5, 4.4 + rnd() * 0.5, w, rubber, 0.016);

// ---- the place's things, all from the kits. Scales bring the kits' small units to metres.
const R = 8, lineOf = (ax, az, bx, bz, step) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step)), ry = Math.atan2(bx - ax, bz - az); return Array.from({ length: n }, (_, i) => [ax + ((bx - ax) * (i + 0.5)) / n, az + ((bz - az) * (i + 0.5)) / n, ry]); };
const jobs = [];
// barriers: red and white in turn, along the left edge, the quay and a curve in the foreground
const bl = [...lineOf(-42, 22, -42, -52, 2.05), ...lineOf(-42, -55, 40, -55, 2.05), ...lineOf(-16, 22, -42, 22, 2.05)];
for (let a = 2.1; a < 4.6; a += 0.082) bl.push([14 + Math.sin(a) * 25.5, -4 + Math.cos(a) * 25.5, a + Math.PI / 2]);
jobs.push(scatter('kit/racing/barrierRed.gltf', bl.filter((_, i) => i % 2 === 0).map(([x, z, ry]) => [x, z, ry + Math.PI / 2, R])), scatter('kit/racing/barrierWhite.gltf', bl.filter((_, i) => i % 2 === 1).map(([x, z, ry]) => [x, z, ry + Math.PI / 2, R])));
// cones on the inner ring
const cones = []; for (let a = 1.7; a < 4.8; a += 0.16) cones.push([14 + Math.sin(a) * 15.2, -4 + Math.cos(a) * 15.2, rnd() * 6, 5.2]);
jobs.push(scatter('kit/racing/pylon.gltf', cones, { tint: '#ff8a3a' }));
// the grandstand on the left with flags, a fence in front of it, floodlights
jobs.push(scatter('kit/racing/grandStandCovered.gltf', [[-30, -40, 0.9 + Math.PI, R], [-36.4, -35, 0.9 + Math.PI, R], [-42.8, -30, 0.9 + Math.PI, R], [-49.2, -25, 0.9 + Math.PI, R]]));
jobs.push(scatter('kit/racing/fenceStraight.gltf', lineOf(-44.5, 6, -44.5, -42, 8).map(([x, z]) => [x, z, Math.PI / 2, R])));
jobs.push(scatter('kit/racing/flagCheckers.gltf', [[-46, 10, 0, 7], [-46, -46, 0, 7]]), scatter('kit/racing/flagRed.gltf', [[-46, 14, 0, 7]]), scatter('kit/racing/flagGreen.gltf', [[-46, -50, 0, 7]]));
const masts = [[-45, 18], [-45, -22], [-12, -58], [26, -58], [44, -20]];
jobs.push(scatter('kit/racing/lightColored.gltf', masts.map(([x, z]) => [x, z, Math.atan2(-x, -z), 16])));
jobs.push(scatter('kit/racing/pitsGarage.gltf', [[46, 2, -Math.PI / 2, R], [46, 10, -Math.PI / 2, R]]), scatter('kit/racing/pitsOffice.gltf', [[46, -6, -Math.PI / 2, R]]), scatter('kit/racing/tent.gltf', [[36, 16, 0.3, 6]]), scatter('kit/racing/billboard.gltf', [[-30, -60, 0, 7], [8, -60, 0, 7]]));
// containers stacked on the quay to the right, harbour buildings behind, a cargo ship and sail boats at sea
const cont = []; for (let i = 0; i < 9; i++) { const x = 8 + i * 3.3, h = 1 + Math.floor(rnd() * 3); for (let k = 0; k < h; k++) cont.push([x + (rnd() - 0.5) * 0.3, -62 + (rnd() - 0.5) * 0.4, Math.PI / 2 + (rnd() - 0.5) * 0.05, 2, k * 2.58, i + k]); }
for (const [f, n] of [['a', 0], ['b', 1], ['c', 2]]) jobs.push(scatter(`kit/city/shipping-container-${f}.glb`, cont.filter((c) => c[5] % 3 === n)));
jobs.push(scatter('kit/city/building-a.glb', [[70, -40, -Math.PI / 2, 9]]), scatter('kit/city/building-d.glb', [[72, -14, -Math.PI / 2, 9]]), scatter('kit/city/detail-tank-large.glb', [[60, -60, 0, 8], [70, -60, 0, 8]]), scatter('kit/city/chimney-large.glb', [[84, -44, 0, 9]]));
jobs.push(scatter('kit/watercraft/ship-cargo-a.glb', [[-70, -210, 1.2, 11, -1.6]]), scatter('kit/watercraft/ship-cargo-b.glb', [[150, -380, -0.4, 11, -1.6]]), scatter('kit/watercraft/boat-sail-a.glb', [[-24, -120, 0.6, 3, -1.6], [50, -170, -1.0, 3, -1.6]]), scatter('kit/watercraft/boat-sail-b.glb', [[10, -260, 0.2, 3, -1.6]]), scatter('kit/watercraft/buoy.glb', [[-10, -80, 0, 4, -1.6], [30, -95, 0, 4, -1.6]]));
// palms: a row behind the stand and the barriers, and two close to the camera
const palms = []; for (let z = 30; z > -52; z -= 9 + rnd() * 5) palms.push([-47.5 - rnd() * 3, z, rnd() * 6, 6.5 + rnd() * 2.5]);
for (let x = -40; x < 40; x += 11 + rnd() * 6) palms.push([x, 27 + rnd() * 5, rnd() * 6, 6.5 + rnd() * 2.5]);
for (let x = -40; x < 44; x += 7 + rnd() * 6) palms.push([x, -58.5 - rnd() * 1.5, rnd() * 6, 6 + rnd() * 3]);
for (const [x, z, sc] of [[-17, 9, 8.5], [-21, 3, 7], [-15, -3, 9.5]]) palms.push([x, z, rnd() * 6, sc]);
['tree_palmDetailedTall', 'tree_palmBend', 'tree_palmTall'].forEach((f, k) => jobs.push(scatter(`kit/nature/${f}.glb`, palms.filter((_, i) => i % 3 === k), { green: [0, 0.8, 0.85] })));
// the green: bushes, grass and flowers, thick along the edges of the asphalt (and in the foreground of the picture)
const green = (n, f) => { const out = []; for (let i = 0; i < n; i++) { const side = rnd(); let x, z; if (side < 0.5) { x = -43.2 - rnd() * rnd() * 9; z = 24 - rnd() * 78; } else { x = -44 + rnd() * 92; z = 23.2 + rnd() * rnd() * 9; } out.push([x, z, rnd() * 6, f * (0.75 + rnd() * 0.6)]); } return out; };
jobs.push(scatter('kit/nature/grass_large.glb', green(900, 3.2), { shadow: false, green: [] }), scatter('kit/nature/grass.glb', green(700, 3.2), { shadow: false, green: [] }), scatter('kit/nature/grass_leafsLarge.glb', green(260, 3), { shadow: false, green: [] }));
jobs.push(scatter('kit/nature/plant_bushLarge.glb', green(70, 4.5), { green: [] }), scatter('kit/nature/plant_bushDetailed.glb', green(60, 4.5), { green: [] }), scatter('kit/nature/plant_bush.glb', green(60, 4), { green: [] }));
jobs.push(scatter('kit/nature/flower_redA.glb', green(110, 2.6), { shadow: false, green: [] }), scatter('kit/nature/flower_yellowA.glb', green(110, 2.6), { shadow: false, green: [] }), scatter('kit/nature/flower_purpleA.glb', green(90, 2.6), { shadow: false, green: [] }));
jobs.push(scatter('kit/nature/rock_largeA.glb', green(10, 3)), scatter('kit/nature/rock_smallA.glb', green(24, 3)));

// ---- the car, mid-drift, with smoke rolling off the rear tyres
const car = (await loader.loadAsync('assets/cars/ae86-hi.glb')).scene;
car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const carYaw = q('carYaw', 3.5); car.position.set(q('carX', 0), 0, q('carZ', 0)); car.rotation.y = carYaw; root.add(car);
const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 60, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const travel = q('travel', 2.72), trail = new THREE.Vector3(-Math.sin(travel), 0, -Math.cos(travel)), across = new THREE.Vector3(Math.cos(carYaw), 0, -Math.sin(carYaw)), rear = new THREE.Vector3(-Math.sin(carYaw), 0, -Math.cos(carYaw));
for (let i = 0; i < q('smoke', 70); i++) {
  // thick and small at the two rear tyres, rolling up and thinning along the way the car came
  const t = (i / 70) ** 1.3, d = t * 17, sc = 0.7 + t * 5 + rnd() * 0.6, wheel = i % 2 ? 0.72 : -0.72;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: new THREE.Color().setRGB(1.0, 0.8 + 0.08 * rnd(), 0.76 + 0.1 * rnd()), opacity: 0.62 * (1 - t) ** 0.8 + 0.06, depthWrite: false, fog: true }));
  sp.position.copy(car.position).addScaledVector(rear, 1.25).addScaledVector(across, wheel * (1 - t * 0.5) + (rnd() - 0.5) * t * 4).addScaledVector(trail, d); sp.position.y = 0.3 + t * 1.9 + rnd() * 0.4 * t; sp.scale.setScalar(sc); root.add(sp);
}
// lamps that glow: a soft warm disc at every mast's head (the bloom takes it from there)
for (const [x, z] of masts) { const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: new THREE.Color(1, 0.82, 0.55).multiplyScalar(q('lamp', 5)), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); g.position.set(x, 9.6, z); g.scale.setScalar(3.2); root.add(g); }
await Promise.all(jobs);

// ---- the camera's fixed place and the picture's finish: ambient occlusion (corners and contacts get dark), bloom on what really is bright, tone mapping
const camAt = toWorld(q('cx', 5.6), q('cy', 1.3), q('cz', 7.6)), lookAt = toWorld(q('lx', -1.6), q('ly', 0.95), q('lz', -5));
camera.position.copy(camAt); camera.lookAt(lookAt);
sun.target.position.copy(toWorld(0, 0, -10)); sun.position.copy(sun.target.position).addScaledVector(sunLift, 110);
const composer = new EffectComposer(renderer); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
if (q('ao', 1)) { const ao = new GTAOPass(scene, camera, innerWidth, innerHeight); ao.updateGtaoMaterial({ radius: q('aoR', 0.9), distanceExponent: 1.4, thickness: 1.2, scale: q('aoS', 1.25), samples: 16 }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); composer.addPass(ao); }
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), q('bloom', 0.18), 0.5, q('bloomT', 1.6)));
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSat: { value: q('sat', 1.12) }, uCon: { value: q('con', 1.06) }, uVig: { value: q('vig', 0.32) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig; varying vec2 vUv; void main() { vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat); c = (c - 0.5) * uCon + 0.5; vec2 d = vUv - 0.5; c *= 1.0 - uVig * dot(d, d) * 1.6; gl_FragColor = vec4(c, 1.0); }' }));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
window.__dbg = () => ({ sun: sunDir.toArray().map((v) => +v.toFixed(3)), yaw: +yaw.toFixed(3), cam: camera.position.toArray().map((v) => +v.toFixed(1)), children: root.children.length, hdr: [hdr.image.width, hdr.image.height, hdr.image.data?.constructor?.name], px: Array.from(hdr.image.data.slice(0, 4)) });
let frames = 0;
const frame = () => { composer.render(); if (frames === 5) window.__ready = true; if (++frames === 30) info.textContent = `${renderer.info.render.calls} calls, ${Math.round(renderer.info.render.triangles / 1000)}k triangles`; requestAnimationFrame(frame); };
frame();
