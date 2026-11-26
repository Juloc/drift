// Every candidate model side by side under the corner's sky and sun, each brought to its real height, with the car for scale: do they fit the game and each other?
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from '../vendor/three/addons/loaders/HDRLoader.js';
window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true });
renderer.setSize(innerWidth, innerHeight, false); renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.5;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.3, 2000);
const hdr = await new HDRLoader().loadAsync(`assets/sky/${params.get('sky') || 'qwantani_sunset_puresky'}_2k.hdr`); hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.background = hdr; scene.backgroundIntensity = 0.5; scene.environment = hdr; scene.environmentIntensity = 0.8;
const sun = new THREE.DirectionalLight(new THREE.Color(1, 0.75, 0.55), 3); sun.position.set(-30, 26, 30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5a585e', roughness: 0.9 })); ground.receiveShadow = true; scene.add(ground);
const loader = new GLTFLoader(), list = (params.get('m') || 'cars/ae86-hi:1.3,skfb/barriers:1.0,skfb/fence-set:2.6,skfb/crowd:1.8,skfb/palm-set:9').split(',').map((s) => s.split(':'));
let x = 0; const report = [];
for (const [name, h] of list) {
  const g = (await loader.loadAsync(`assets/${name}.glb`)).scene; g.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(g); const size = bb.getSize(new THREE.Vector3()), k = +h / size.y; g.scale.multiplyScalar(k); g.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(g);
  const s2 = bb.getSize(new THREE.Vector3()); g.position.x += x - bb.min.x; g.position.y -= bb.min.y; g.position.z -= (bb.min.z + bb.max.z) / 2;
  let tris = 0, meshes = 0; g.traverse((o) => { if (o.isMesh) { meshes++; o.castShadow = true; o.receiveShadow = true; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  report.push(`${name}: ${s2.x.toFixed(1)} x ${s2.y.toFixed(1)} x ${s2.z.toFixed(1)} m, ${meshes} meshes, ${Math.round(tris / 1000)}k triangles`);
  scene.add(g); x += s2.x + 2.5;
}
camera.position.set(x / 2 + +(params.get('dx') || 0), +(params.get('cy') || 5.5), +(params.get('cz') || Math.max(22, x * 0.62))); camera.lookAt(x / 2 + +(params.get('dx') || 0), +(params.get('ly') || 2.6), 0);
window.__report = report; document.getElementById('info').textContent = report.join('\n');
let f = 0; const frame = () => { renderer.render(scene, camera); if (++f === 5) window.__ready = true; requestAnimationFrame(frame); }; frame();
