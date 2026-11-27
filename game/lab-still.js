// The still: the owner's picture of the pass at sunset, rebuilt part by part in real 3D from the picture's own camera. The picture without car and
// smoke (assets/mock/pass-plate.png) lies behind the scene as the thing to build after; every part that is built covers its place in it. Keys: B
// the picture behind on or off (off shows only what is really built), O the picture laid over the scene half see-through (to check that a part
// sits where the picture has it), 1 to 9 one part on or off. `?hide=road,car` hides parts from the start, `?plate=0` starts without the picture.
// The camera, the road's line and the car's place are the measurements of the picture (frame 1671 x 941, a lens 27.4 degrees high).
import * as THREE from '../vendor/three/three.module.js';
import { KEY, toon } from './mock/toon.js';
import { roadMaterial } from './mock/land.js';
import { skyEnv } from './mock/sky.js';
import { loadCarSource, MX5, groundPatch } from './mock/car.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search), canvas = document.getElementById('view'), over = document.getElementById('over'), info = document.getElementById('info');
const FRAME = { w: 1671, h: 941, fov: 27.395, yaw: 0.35, pitch: -0.03492, eye: [-2.741, 1.219, 7.316] };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FRAME.fov, FRAME.w / FRAME.h, 0.1, 9000);
camera.position.fromArray(FRAME.eye); camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(FRAME.yaw), FRAME.pitch, -Math.cos(FRAME.yaw)))); camera.updateMatrixWorld(true);
/** The direction from the eye through a pixel of the picture. */
const through = (px, py) => new THREE.Vector3((px / FRAME.w) * 2 - 1, 1 - (py / FRAME.h) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
KEY.sunDir.copy(through(1378, 215));                                                             // the sun stands where the picture has it

const plate = await new THREE.TextureLoader().loadAsync(new URL('./assets/mock/pass-plate.png', import.meta.url).href); plate.colorSpace = THREE.SRGBColorSpace;
let showPlate = params.get('plate') !== '0'; const setPlate = () => { scene.background = showPlate ? plate : new THREE.Color('#201824'); }; setPlate();

// ---- light for the car's physical materials and for the shadows (the world's own light is toon.js)
const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.56, 0.5), 1.7); sun.position.copy(KEY.sunDir).multiplyScalar(60); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 5, far: 140 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun, sun.target, new THREE.HemisphereLight(new THREE.Color(0.95, 0.5, 0.62), new THREE.Color(0.34, 0.16, 0.2), 0.95));

// ---- the road's line, measured from the picture: way[i] every 0.5 m or so; `beside(i, off, h)` is a point `off` metres to the right of it
const route = new THREE.CatmullRomCurve3([[-3.2, 0, 21], [-0.3, 0, -1], [4.25, 0.06, -12], [15.4, 0.21, -22.5], [30.8, 0.32, -26], [48.0, 0.52, -27.5], [63.8, 0.6, -32]].map((p) => new THREE.Vector3(...p)), false, 'centripetal');
const way = route.getSpacedPoints(200), LEN = route.getLength();
const beside = (i, off, h = 0) => { const a = way[Math.max(0, i - 1)], b = way[Math.min(way.length - 1, i + 1)], t = b.clone().sub(a).normalize(); return way[i].clone().add(new THREE.Vector3(-t.z * off, h, t.x * off)); };

const parts = new Map(), add = (name, obj) => { obj.name = name; parts.set(name, obj); scene.add(obj); obj.visible = !(params.get('hide') ?? '').split(',').includes(name); return obj; };

// ---- part: the road. The asphalt as the picture paints it: dark plum, a fine grain, lighter patches, a thin white line on the left, a broad one on the right, faint
// orange dashes only far ahead; then the tyre marks as broad soft bands that follow the bend
{ const HALF = 5.4, cols = [-HALF, -2.7, 0, 2.7, HALF], pos = [], uv = [], idx = [];
  way.forEach((_, i) => { for (const c of cols) { const p = beside(i, c); pos.push(p.x, p.y, p.z); uv.push(c, (i / 200) * LEN); } if (i) for (let k = 0; k < cols.length - 1; k++) { const a = (i - 1) * cols.length + k, b = i * cols.length + k; idx.push(a, a + 1, b, a + 1, b + 1, b); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  const asphalt = toon({ color: 0xffffff, gloss: 0.1, vary: 0.15, rim: 0, soft: 0.5,
    pars: `float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1.0, 0.0)), f.x), mix(rh(i + vec2(0.0, 1.0)), rh(i + vec2(1.0, 1.0)), f.x), f.y); }`,
    paint: `{ float u = vUv2.x, s = vUv2.y, big = rn(vec2(u * 0.3, s * 0.07)), grain = rn(vec2(u * 11.0, s * 11.0)), fine = rn(vec2(u * 37.0, s * 37.0));
      vec3 c = vec3(0.2, 0.158, 0.178) * (0.88 + 0.2 * big + 0.07 * grain + 0.05 * fine);
      c = mix(c, vec3(0.26, 0.2, 0.22), 0.45 * smoothstep(0.6, 0.8, rn(vec2(u * 0.2 + 3.0, s * 0.04))));
      c = mix(c, vec3(0.86, 0.8, 0.82), smoothstep(0.02, 0.0, abs(u + 5.2) - 0.07) * (0.7 + 0.3 * rn(vec2(u * 3.0, s * 0.6))));
      c = mix(c, vec3(0.9, 0.84, 0.86), smoothstep(0.03, 0.0, abs(u - 5.0) - 0.17));
      c = mix(c, vec3(0.9, 0.52, 0.28), 0.4 * smoothstep(0.03, 0.0, abs(u) - 0.06) * step(fract(s / 8.0), 0.4) * smoothstep(40.0, 48.0, s));
      diffuseColor.rgb = c; }` });
  const road = new THREE.Mesh(g, asphalt); road.receiveShadow = true;
  // tyre marks: broad soft dark bands
  const mp = [], mu = [], ma = [], mi = []; let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [off, w, a, i0, i1, drift] of [[-3.3, 0.42, 0.5, 0, 150, 1.2], [-2.5, 0.36, 0.42, 0, 160, 1.0], [-1.25, 0.5, 0.62, 0, 170, 0.5], [-0.45, 0.44, 0.55, 0, 175, 0.3], [0.7, 0.4, 0.45, 4, 165, -0.3], [1.5, 0.46, 0.5, 8, 170, -0.5], [2.6, 0.34, 0.36, 20, 150, -0.7], [-4.2, 0.3, 0.3, 30, 140, 1.6], [3.4, 0.3, 0.3, 40, 160, -0.4]]) {
    const base = mp.length / 3; for (let i = i0; i <= i1; i++) { const t = (i - i0) / (i1 - i0), o = off + drift * Math.sin(t * Math.PI) + (r() - 0.5) * 0.02, fade = Math.min(1, t * 6, (1 - t) * 6) * a;
      for (const e of [-1, 1]) { const p = beside(i, o + e * w, 0.012); mp.push(p.x, p.y, p.z); mu.push(e, i * 0.3); ma.push(fade); }
      if (i > i0) { const k = base + (i - i0) * 2; mi.push(k - 2, k - 1, k, k - 1, k + 1, k); } } }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mg.setAttribute('uv', new THREE.Float32BufferAttribute(mu, 2)); mg.setAttribute('alpha', new THREE.Float32BufferAttribute(ma, 1)); mg.setIndex(mi);
  const marks = new THREE.Mesh(mg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'attribute float alpha; varying float vA; varying vec2 vU; void main() { vA = alpha; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying float vA; varying vec2 vU; float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() { float across = 1.0 - smoothstep(0.35, 1.0, abs(vU.x)), streak = 0.75 + 0.25 * h(vec2(floor(vU.x * 9.0), floor(vU.y * 0.5))); gl_FragColor = vec4(0.07, 0.035, 0.055, vA * across * streak); #include <colorspace_fragment>
      }` }));
  marks.renderOrder = 1; const group = new THREE.Group(); group.add(road, marks); add('road', group); }

// ---- part: the car, where the picture's car stands
{ const { scene: car } = await loadCarSource(MX5, skyEnv(renderer), { paint: '#f4efee' }), pose = new THREE.Group(), K = 4.25 / MX5.length;
  for (const n of ['wheel_fl', 'wheel_fr']) { const w = car.getObjectByName(n); if (w) { const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()), p = new THREE.Group(); car.add(p); p.position.copy(c); p.attach(w); p.rotation.y = 0.39; } }   // counter-steer
  pose.add(car, groundPatch()); pose.scale.setScalar(K); pose.position.set(-0.15, 0.012, -1.45); pose.rotation.y = Math.PI - 0.61753; add('car', pose); }

// ---- the picture, the keys, the loop
const fit = () => { const w = Math.min(innerWidth, innerHeight * FRAME.w / FRAME.h), h = w * FRAME.h / FRAME.w; for (const e of [canvas, over]) { e.style.width = `${w}px`; e.style.height = `${h}px`; e.style.left = `${(innerWidth - w) / 2}px`; e.style.top = `${(innerHeight - h) / 2}px`; } renderer.setSize(w, h, false); };
fit(); addEventListener('resize', fit);
addEventListener('keydown', (e) => { if (e.code === 'KeyB') { showPlate = !showPlate; setPlate(); } else if (e.code === 'KeyO') over.hidden = !over.hidden; else if (/^Digit[1-9]$/.test(e.code)) { const p = [...parts.values()][+e.code.slice(5) - 1]; if (p) p.visible = !p.visible; } label(); });
const label = () => { info.textContent = `${showPlate ? 'picture behind' : 'only what is built'}${over.hidden ? '' : ' · picture laid over'} · ${[...parts].map(([n, p], i) => `${i + 1} ${n}${p.visible ? '' : ' (off)'}`).join(' · ')}`; }; label();
let frames = 0; const frame = () => { renderer.render(scene, camera); if (++frames === 6) window.__ready = true; requestAnimationFrame(frame); }; frame();
window.__still = { scene, camera, renderer, parts, way, beside, through, KEY, plate: (v) => { showPlate = v; setPlate(); label(); }, overlay: (v) => { over.hidden = !v; label(); } };
