// A contact sheet of the nature kit's models (game/assets/env/nature.json, made by tools/make-nature.mjs): every model three times, turned by 0, 120 and 240 degrees, in a grid,
// framed by its own size, with its name, file size and measures; plain light, no look. Development only. `?cols=4` (models per row), `?cell=140` (one view's size in pixels).
import * as THREE from '../vendor/three/three.module.js';
import { readModel } from './view/look/models.js';

const params = new URLSearchParams(location.search), COLS = +(params.get('cols') ?? 4), CELL = +(params.get('cell') ?? 140), LABEL = 34, ANGLES = [0, 120, 240];
const list = (await fetch('assets/env/nature.json').then((r) => r.json())).models;
const W = COLS * CELL * ANGLES.length, rows = Math.ceil(list.length / COLS), H = rows * (CELL + LABEL);
const canvas = document.getElementById('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true); renderer.setClearColor(0x2a2340);
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, 0.01, 500);
scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x7a6a6a, 1.6)); const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); sun.position.set(-2, 3, 2.5); scene.add(sun);
const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4a62 })); disc.position.y = -0.002; scene.add(disc);
const labels = document.getElementById('labels'), box = new THREE.Box3(), size = new THREE.Vector3(), centre = new THREE.Vector3();
for (let i = 0; i < list.length; i++) {
  const m = list[i], gltf = await readModel(m.file), cx = (i % COLS) * CELL * ANGLES.length, top = Math.floor(i / COLS) * (CELL + LABEL);
  if (gltf) {
    scene.add(gltf.scene); box.setFromObject(gltf.scene); box.getSize(size); box.getCenter(centre);
    const r = Math.max(size.length() / 2, 0.05), d = (r / Math.sin((cam.fov / 2) * Math.PI / 180)) * 1.02; disc.scale.setScalar(Math.max(size.x, size.z) * 0.62);
    ANGLES.forEach((a, k) => {
      gltf.scene.rotation.y = (a * Math.PI) / 180; gltf.scene.updateMatrixWorld(true);
      cam.position.set(centre.x + d * 0.0, centre.y + d * 0.28, centre.z + d * 0.96); cam.lookAt(centre); cam.updateMatrixWorld();
      const x = cx + k * CELL, y = H - top - CELL;
      renderer.setViewport(x, y, CELL, CELL); renderer.setScissor(x, y, CELL, CELL); renderer.render(scene, cam);
    });
    scene.remove(gltf.scene);
  }
  const lab = Object.assign(document.createElement('div'), { innerHTML: `<b>${m.file}</b> (${m.kit})<br>${m.kb} KB &middot; ${m.size.join(' x ')} m${m.scale === 1 ? ' (true size)' : ''}` });
  Object.assign(lab.style, { left: `${cx}px`, top: `${top + CELL + 1}px`, width: `${CELL * ANGLES.length}px` }); labels.append(lab);
}
window.__look = { frames: 999 };   // (the checking tool waits for this)
