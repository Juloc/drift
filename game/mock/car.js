// The car of the mock stage: a model file of the game (parts named body_paint, body_glass, wheel_fl, ... as the car pipeline writes them) with
// physical materials that mirror the stage's sky: white paint under clear lacquer, dark glass, satin rims, glowing tail lamps. Unlike the world
// (toon.js) the car is lit physically: the eye reads it as the one smooth, real thing in a drawn land, as in the mockups.
import * as THREE from '../../vendor/three/three.module.js';
import { loadGlb } from './props.js';

/** Loads and dresses a car. Returns { scene (nose towards +z, standing on y = 0), lamps: { set(brake 0..1) } }. */
export async function loadCar(url, envMap, { paint = '#f7f5f2' } = {}) {
  const car = (await loadGlb(url)).scene, P = (o) => new THREE.MeshPhysicalMaterial({ envMap, ...o });
  const rear = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.12, 0.22), toneMapped: false });
  const mats = { paint: P({ color: paint, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.5 }), glass: P({ color: '#171222', roughness: 0.06, envMapIntensity: 1.5 }),
    chrome: P({ color: '#e4dfe8', metalness: 0.7, roughness: 0.3 }), plastic: P({ color: '#1c1822', roughness: 0.7, envMapIntensity: 0.4 }), carbon: P({ color: '#15121a', roughness: 0.45, envMapIntensity: 0.6 }),
    rubber: P({ color: '#1b1820', roughness: 0.92, envMapIntensity: 0.2 }), light_front: P({ color: '#fff4dc', emissive: '#fff0cc', emissiveIntensity: 0.6, roughness: 0.2 }), light_rear: rear };
  let frontZ = 1; car.updateMatrixWorld(true);
  car.traverse((o) => { if (!o.isMesh) return; const key = Object.keys(mats).find((k) => (o.material.name ?? '').startsWith(k)); if (key) o.material = mats[key]; o.castShadow = true; o.receiveShadow = key !== 'light_rear';
    if (o.name.includes('light_front')) frontZ = Math.sign(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).z) || 1; });
  if (frontZ < 0) { const turn = new THREE.Matrix4().makeRotationY(Math.PI); for (const ch of car.children) ch.applyMatrix4(turn); car.updateMatrixWorld(true); }   // every part turned, so the file's nose looks along +z
  return { scene: car, lamps: { set(brake) { rear.color.setRGB(1.5 + 5.0 * brake, 0.12 + 0.4 * brake, 0.22 + 0.6 * brake); } } };
}

/** Which part of the car a material of the full MX-5 file is (the file as its author uploaded it: parts by material, wheels as four nodes). */
export const MX5 = { url: new URL('../assets/cars/mx5-full/scene.gltf', import.meta.url).href, length: 3.95, skip: /^Plane/, wheels: /^Circle/,
  parts: { 'Material.002': 'paint', 'Material.001': 'plastic', 'Material.012': 'lamps', 'Material.013': 'chrome', 'Material.010': 'glass', 'Material.004': 'glass', 'Material.005': 'plastic', 'Material.008': 'lens', 'Material.009': 'chrome', 'Material.015': 'rim', 'Material.014': 'rubber', 'Material.017': 'plastic' },
  rearUv: [0.27, 0.4, 0.75, 0.6] };   // where the tail lamps lie in the lamp picture: the faces that use it are the car's rear

/**
 * Loads a car file as its author made it and makes the game's car of it: every mesh brought into one space (`spec.length` metres long, standing on y = 0, the middle at the
 * origin, the nose towards +z), dressed by `spec.parts` (material name to part), the four wheels as nodes `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` (by where they are).
 * The lamp picture lights the lamps (and gets brighter on the brake). Returns { scene, lamps: { set(brake 0..1) } }.
 */
export async function loadCarSource(spec, envMap, { paint = '#f7f5f2' } = {}) {
  const src = (await loadGlb(spec.url)).scene, P = (o) => new THREE.MeshPhysicalMaterial({ envMap, ...o }); src.updateMatrixWorld(true);
  const found = []; src.traverse((o) => { if (!o.isMesh) return; let a = o, wheel = null, skip = false; while (a) { if (spec.skip?.test(a.name)) skip = true; if (!wheel && spec.wheels.test(a.name)) wheel = a.name.split('_')[0]; a = a.parent; } if (!skip) found.push({ o, wheel, part: spec.parts[o.material.name] ?? 'plastic' }); });
  const box = new THREE.Box3(); for (const f of found) box.expandByObject(f.o); const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const along = size.x > size.z, k = spec.length / Math.max(size.x, size.z);
  let M = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeRotationY(along ? Math.PI / 2 : 0)).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -box.min.y, -mid.z));
  // which end is the rear: the faces that carry the tail lamps' part of the lamp picture
  { let z = 0, n = 0; const v = new THREE.Vector3(), [u0, v0, u1, v1] = spec.rearUv; for (const f of found) { if (f.part !== 'lamps') continue; const uv = f.o.geometry.attributes.uv, pos = f.o.geometry.attributes.position; if (!uv) continue;
      for (let i = 0; i < uv.count; i++) if (uv.getX(i) > u0 && uv.getX(i) < u1 && uv.getY(i) > v0 && uv.getY(i) < v1) { z += v.fromBufferAttribute(pos, i).applyMatrix4(f.o.matrixWorld).applyMatrix4(M).z; n++; } }
    if (n && z / n > 0) M = new THREE.Matrix4().makeRotationY(Math.PI).multiply(M); }
  const lampMap = found.find((f) => f.part === 'lamps')?.o.material.map ?? null;
  const lampMat = new THREE.MeshStandardMaterial({ map: lampMap, emissiveMap: lampMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.1, roughness: 0.25, envMap, envMapIntensity: 0.6 });
  const mats = { paint: P({ color: paint, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.5 }), glass: P({ color: '#171222', roughness: 0.05, envMapIntensity: 1.4, transparent: true, opacity: 0.72 }), lens: P({ color: '#2a2630', roughness: 0.05, envMapIntensity: 1.2, transparent: true, opacity: 0.5 }),
    chrome: P({ color: '#e4dfe8', metalness: 0.8, roughness: 0.2 }), rim: P({ color: '#c9c5cc', metalness: 0.75, roughness: 0.32 }), plastic: P({ color: '#1c181e', roughness: 0.75, envMapIntensity: 0.3 }), rubber: P({ color: '#1a171c', roughness: 0.92, envMapIntensity: 0.15 }), lamps: lampMat };
  const car = new THREE.Group(), wheels = new Map(); car.name = 'car';
  for (const f of found) { const g = f.o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, f.o.matrixWorld)), mesh = new THREE.Mesh(g, mats[f.part]); mesh.name = `${f.wheel ? 'wheel' : 'body'}_${f.part}`; mesh.castShadow = true; mesh.receiveShadow = f.part !== 'lamps';
    if (f.wheel) { if (!wheels.has(f.wheel)) wheels.set(f.wheel, new THREE.Group()); wheels.get(f.wheel).add(mesh); } else car.add(mesh); }
  for (const w of wheels.values()) { const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()); w.name = `wheel_${c.z > 0 ? 'f' : 'r'}${c.x > 0 ? 'l' : 'r'}`; car.add(w); }
  return { scene: car, lamps: { set(brake) { lampMat.emissiveIntensity = 1.1 + 2.6 * brake; } } };
}

/** A soft dark patch that lies under a car (the low sun's own shadow is long and thin; this keeps the car on the road). Add it to the car's group. */
export function groundPatch() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 6.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0x1a0c26, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  patch.position.y = 0.03; patch.renderOrder = 2; return patch;
}
