// The car of the mock stage: a model file of the game (parts named body_paint, body_glass, wheel_fl, ... as the car pipeline writes them) with
// physical materials that mirror the stage's sky: white paint under clear lacquer, dark glass, satin rims, glowing tail lamps. Unlike the world
// (toon.js) the car is lit physically: the eye reads it as the one smooth, real thing in a drawn land, as in the mockups.
import * as THREE from '../../vendor/three/three.module.js';
import { loadGlb } from './props.js';

/** Loads and dresses a car. Returns { scene (nose towards +z, standing on y = 0), lamps: { set(brake 0..1) } }. */
export async function loadCar(url, envMap, { paint = '#f1ecf0' } = {}) {
  const car = (await loadGlb(url)).scene, P = (o) => new THREE.MeshPhysicalMaterial({ envMap, ...o });
  const rear = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.3, 0.5), toneMapped: false });
  const mats = { paint: P({ color: paint, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.85 }), glass: P({ color: '#171222', roughness: 0.06, envMapIntensity: 1.5 }),
    chrome: P({ color: '#e4dfe8', metalness: 0.7, roughness: 0.3 }), plastic: P({ color: '#1c1822', roughness: 0.7, envMapIntensity: 0.4 }), carbon: P({ color: '#15121a', roughness: 0.45, envMapIntensity: 0.6 }),
    rubber: P({ color: '#1b1820', roughness: 0.92, envMapIntensity: 0.2 }), light_front: P({ color: '#fff4dc', emissive: '#fff0cc', emissiveIntensity: 0.6, roughness: 0.2 }), light_rear: rear };
  let frontZ = 1; car.updateMatrixWorld(true);
  car.traverse((o) => { if (!o.isMesh) return; const key = Object.keys(mats).find((k) => (o.material.name ?? '').startsWith(k)); if (key) o.material = mats[key]; o.castShadow = true; o.receiveShadow = key !== 'light_rear';
    if (o.name.includes('light_front')) frontZ = Math.sign(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).z) || 1; });
  if (frontZ < 0) { const turn = new THREE.Matrix4().makeRotationY(Math.PI); for (const ch of car.children) ch.applyMatrix4(turn); car.updateMatrixWorld(true); }   // every part turned, so the file's nose looks along +z
  return { scene: car, lamps: { set(brake) { rear.color.setRGB(2.6 + 4.4 * brake, 0.3 + 0.3 * brake, 0.5 + 0.5 * brake); } } };
}

/** A soft dark patch that lies under a car (the low sun's own shadow is long and thin; this keeps the car on the road). Add it to the car's group. */
export function groundPatch() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 6.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0x1a0c26, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  patch.position.y = 0.03; patch.renderOrder = 2; return patch;
}
