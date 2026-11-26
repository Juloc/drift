// The garage of the lab in 3D: a small room at dusk (a dark glossy floor, a wide window onto the evening sky over the mountains, warm light
// bars under the ceiling, a tool cabinet and a tyre rack) and the real car of the game (game/assets/cars/<model>.glb, loaded the way the game
// loads it), turned by dragging; when nobody touches it, it turns slowly by itself. Everything is drawn here, no outside files.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { loadCarModel } from '../view/carmodel.js';
import { carMaterials } from '../view/carmaterials.js';
import { dressCar } from '../view/carfx.js';
import { contactShadow } from '../view/studio.js';

/** The evening sky with mountain ridges, painted on a canvas (the window's view). */
function windowView() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3a3e98'); g.addColorStop(0.45, '#8a64aa'); g.addColorStop(0.72, '#e08aa0'); g.addColorStop(0.86, '#ffb07a'); g.addColorStop(1, '#ffc890');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 256);
  const ridge = (base, amp, col, seed) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 256);
    for (let px = 0; px <= 1024; px += 8) x.lineTo(px, base - amp * (0.5 + 0.5 * Math.sin(px / 90 + seed) * Math.sin(px / 37 + seed * 2)));
    x.lineTo(1024, 256); x.fill();
  };
  ridge(205, 50, '#9a78b8', 1); ridge(222, 40, '#6e5a9a', 3); ridge(240, 30, '#4a3e78', 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ tier: 'high'|'low', model: string, paint: string, spec: object }} o
 */
export async function createGarage(canvas, { tier = 'high', model = 'ae86', paint = '#e6e4e4', spec = {} } = {}) {
  const high = tier === 'high';
  const t0 = performance.now();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.75 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = high; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3a2c34');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  // the room
  const room = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, ...o });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), mat('#4a3c44', { roughness: 0.72, envMapIntensity: 0.15 }));
  floor.receiveShadow = high;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), mat('#7a6068')); back.position.set(0, 4.5, -7);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.4), new THREE.MeshBasicMaterial({ map: windowView(), toneMapped: false }));
  win.position.set(0.5, 3.2, -6.95);
  const frame = mat('#1e1824');
  for (const fx of [-6, -2.75, 0.5, 3.75, 7]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.12), frame); b.position.set(fx, 3.2, -6.9); room.add(b); }
  for (const fy of [1.45, 4.95]) { const b = new THREE.Mesh(new THREE.BoxGeometry(13.3, 0.18, 0.14), frame); b.position.set(0.5, fy, -6.9); room.add(b); }
  const left = new THREE.Mesh(new THREE.PlaneGeometry(20, 9), mat('#6a525c')); left.rotation.y = Math.PI / 2; left.position.set(-9, 4.5, 0);
  const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = 9;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(Math.PI / 2), mat('#4a3a42')); ceiling.position.y = 6;
  // warm light bars under the ceiling (they glow; the real light comes from the lamps below)
  const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd8a8').multiplyScalar(2.2), toneMapped: true });
  for (const [bx, bz] of [[-3, -1], [3, -1], [-3, 3.5], [3, 3.5]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.22), barMat); b.position.set(bx, 5.6, bz); room.add(b); }
  // a red tool cabinet on the left, a tyre rack on the right
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.7), mat('#b0303e', { roughness: 0.4 })); cab.position.set(-6.4, 0.55, -5.4);
  for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.02), mat('#d8d0d8', { metalness: 0.6, roughness: 0.3 })); d.position.set(-6.4, 0.25 + k * 0.25, -5.04); room.add(d); }
  const tyre = new THREE.TorusGeometry(0.33, 0.14, 8, 18), tyreMat = mat('#141216', { roughness: 0.9 });
  for (let k = 0; k < 6; k++) { const ty = new THREE.Mesh(tyre, tyreMat); ty.position.set(6.6 + (k % 2) * 0.05, 0.5 + Math.floor(k / 2) * 0.62, -5.3 + (k % 2) * 0.9); ty.rotation.y = Math.PI / 2; room.add(ty); }
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 2.4), mat('#4a4052', { metalness: 0.4 })); rack.position.set(7.1, 1.1, -4.85);
  // a plant in a pot by the window, shelves with boxes on the left wall
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.8, 16), mat('#c8b8a8', { roughness: 0.6 })); pot.position.set(3.6, 0.4, -4.6); room.add(pot);
  const leaf = mat('#4a7a4a', { roughness: 0.7 }), leaf2 = mat('#5f9256', { roughness: 0.7 });
  for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.25 + (k % 3) * 0.18; const l = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), k % 2 ? leaf : leaf2); l.scale.set(1, 1.5, 0.6); l.position.set(3.6 + Math.cos(a) * r, 1.15 + (k % 4) * 0.3, -4.6 + Math.sin(a) * r * 0.6); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.4); room.add(l); }
  const shelfMat = mat('#8a7468', { roughness: 0.7 });
  for (const sy of [1.6, 2.5, 3.4]) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 3.2), shelfMat); sh.position.set(-8.7, sy, -3.4); room.add(sh);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3 + (k % 2) * 0.15, 0.5), mat(['#c86a5a', '#d8c0a0', '#6a7aa0', '#a88a6a'][(k + sy * 2) % 4 | 0])); b.position.set(-8.7, sy + 0.2 + (k % 2) * 0.07, -4.6 + k * 0.8); room.add(b); }
  }
  room.add(floor, back, win, left, right, ceiling, cab, rack);
  // one draw per material: the room's many small parts are merged
  room.updateMatrixWorld(true);
  const byMat = new Map();
  room.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g.index ? g.toNonIndexed() : g); } });
  for (const [m, gs] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(gs), m); mesh.receiveShadow = m === floor.material ? high : false; scene.add(mesh); }

  // light: a mauve fill, warm key from the lamps, a rosy rim from the window
  scene.add(new THREE.HemisphereLight('#ffe0d0', '#6a5058', 2.0));
  // the light from above onto the car (the warm lamps under the ceiling)
  const top = new THREE.SpotLight('#ffe2c0', 60, 14, 0.6, 0.6, 1.2); top.position.set(0, 5.8, 0.8); top.target.position.set(0, 0, 0);
  top.castShadow = high; top.shadow.mapSize.set(1024, 1024); top.shadow.bias = -0.0005;
  scene.add(top, top.target);
  const key = new THREE.DirectionalLight('#ffd6b0', 1.2); key.position.set(3, 8, 6);
  key.castShadow = false; key.shadow.mapSize.set(1024, 1024);   // only the light from above casts the shadow (each caster draws the car again)
  key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4; key.shadow.bias = -0.0004; key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight('#ff9ab8', 0.9); rim.position.set(-2, 3, -8);
  scene.add(key, rim);

  // the car's reflection: the room itself, blurred (a window, light bars, dark walls)
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(scene, 0.03, 0.1, 100, { size: high ? 128 : 64 }).texture;
  pm.dispose();

  const turntable = new THREE.Group(); scene.add(turntable);
  const shadow = contactShadow(2.6, 4.9); shadow.position.y = 0.01; turntable.add(shadow);
  let car = null, materials = null;
  const make = async () => {
    materials = carMaterials({ tier, paint: new THREE.Color(paint).getHex(), env });
    // the paint as in the touge look: the shine comes from the reflection, no sparkling points of the direct light
    const p = materials.paint; p.envMapIntensity = 1.3; p.roughness = 0.3; if (p.clearcoat !== undefined) { p.clearcoat = 0.2; p.clearcoatRoughness = 0.25; } if (p.specularIntensity !== undefined) p.specularIntensity = 0.3;
    const m = await loadCarModel(model, { tier, materials });
    if (!m) return;
    dressCar(m.group, spec, { lite: !high });
    m.group.traverse((o) => { if (o.isMesh) { o.castShadow = high; for (const mm of [].concat(o.material)) if (mm.envMap === undefined || mm.envMap === null) mm.envMap = env; } });
    car = m.group; turntable.add(car);
  };
  await make();

  // turning: drag with mouse or finger; after a few seconds without touch it turns slowly by itself
  let yaw = -0.55, vel = 0, dragging = false, lastX = 0, idle = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; idle = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw += dx * 0.008; vel = dx * 0.008; });
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  const api = {
    renderer, scene, camera, frames: 0, buildMs: 0, spin: true,
    /** the car's place in the picture: x of its middle as a share of the width (the UI keeps it free) */
    frame: { x: 0.5, y: 0.55, dist: 7.6 },
    setPaint(hex) { if (materials) materials.paint.color.set(hex); },
    resize() {
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // narrow screens (a phone held across is still wide, but low): the camera steps back so the car fits between the bars
      const f = api.frame, k = Math.max(1, 1.5 / camera.aspect);
      camera.position.set(Math.sin(0.5) * f.dist * k, 1.75, Math.cos(0.5) * f.dist * k);
      camera.lookAt(0, 0.62, 0);
      // shift the picture so the car sits at frame.x / frame.y of the screen
      camera.setViewOffset(w, h, (0.5 - f.x) * w, (0.5 - f.y) * h, w, h);
      camera.updateProjectionMatrix();
    },
    render() { renderer.info.reset(); renderer.render(scene, camera); },
  };
  addEventListener('resize', () => api.resize());
  api.resize();
  let prev = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (!dragging) { idle += dt; vel *= Math.exp(-3 * dt); yaw += vel; if (api.spin && idle > 3) yaw += dt * 0.18; }
    turntable.rotation.y = yaw;
    if (!api.paused) api.render(); api.frames++;   // paused while another view shows a picture instead
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  api.buildMs = performance.now() - t0;
  return api;
}
