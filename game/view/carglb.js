// A car from a model file (docs/CAR-MODELS.md): materials replaced by slot name, wheels found by name, and a plain `null`
// (so that the caller keeps the code model) whenever the file is missing or does not follow the rules. No DOM here: testable in Node.
import * as THREE from '../../vendor/three/three.module.js';

export const SLOTS = ['paint', 'glass', 'chrome', 'rubber', 'plastic', 'carbon', 'light_front', 'light_rear', 'interior'];
export const WHEEL_NAMES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];

/** 'paint', 'paint.001' and 'Paint' all mean the slot `paint` (Blender numbers copies); anything else is no slot. */
export function slotOf(materialName) {
  const n = String(materialName ?? '').toLowerCase().replace(/\.\d+$/, '');
  return SLOTS.includes(n) ? n : null;
}

/**
 * Replaces the material of every mesh by the game's material of its slot. Meshes with several primitives (a material array) are handled per entry.
 * What a file may bring along and keeps: a base colour texture (`map`) and vertex colours (COLOR_0). Both multiply the slot's
 * colour (so the garage paint still decides the paint), on a copy of the slot's material that all meshes with the same texture share.
 * @returns {{ unknown: string[], used: Set<string> }} material names that are no slot (they get the plastic material, so nothing is left unlit) and the slots in use
 */
export function applySlots(root, materials) {
  const unknown = [], used = new Set(), copies = new Map();
  const pick = (m, geometry) => {
    const slot = slotOf(m?.name);
    if (!slot) unknown.push(m?.name ?? '(none)'); else used.add(slot);
    const base = materials[slot ?? 'plastic'], map = m?.map ?? null, vc = !!geometry.attributes.color && !base.vertexColors;
    if (!map && !vc) return base;
    const key = `${slot}|${map?.uuid ?? ''}|${vc}`;
    if (!copies.has(key)) { const c = base.clone(); c.name = base.name; if (map) c.map = map; if (vc) c.vertexColors = true; copies.set(key, c); }
    return copies.get(key);
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => pick(m, o.geometry)) : pick(o.material, o.geometry);
    o.castShadow = !(Array.isArray(o.material) ? o.material[0] : o.material).isMeshBasicMaterial;   // the lamps (unlit) cast none
    o.receiveShadow = false;
  });
  return { unknown, used };
}

/**
 * Turns the four wheel nodes into pivot (steering, at the wheel centre) > spin (rolling, around the axle = local x) > the wheel's meshes.
 * @returns {{ wheels: {pivot: THREE.Group, spin: THREE.Group, front: boolean}[], missing: string[] }}
 */
export function findWheels(root) {
  const wheels = [], missing = [];
  for (const name of WHEEL_NAMES) {
    const node = root.getObjectByName(name);
    if (!node) { missing.push(name); continue; }
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.name = name + '_pivot'; pivot.position.copy(node.position);
    for (const c of [...node.children]) spin.add(c);
    pivot.add(spin);
    node.parent.add(pivot); node.parent.remove(node);
    wheels.push({ pivot, spin, front: name.startsWith('wheel_f') });
  }
  return { wheels, missing };
}

/** Counts what the renderer will draw: one call per mesh primitive. */
export function countOf(root) {
  let triangles = 0, drawCalls = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    triangles += n; drawCalls += Array.isArray(o.material) ? o.material.length : 1;
  });
  return { triangles: Math.round(triangles), drawCalls };
}

/**
 * Makes a loaded scene ready: slots, wheels, setWheels(steer, spin). Returns null when it cannot be a car (no wheels).
 * @param {THREE.Object3D} scene the root of the file
 * @param {Record<string, THREE.Material>} materials the game's materials by slot name
 */
export function prepareCar(scene, materials) {
  const { unknown } = applySlots(scene, materials);
  const { wheels, missing } = findWheels(scene);
  if (missing.length) return null;
  const group = new THREE.Group();
  group.name = 'carModel'; group.add(scene);
  const setWheels = (steer, spin) => { for (const w of wheels) { w.pivot.rotation.y = w.front ? -steer : 0; w.spin.rotation.x = spin; } };
  return { group, wheels, setWheels, unknown, ...countOf(group) };
}

/**
 * Loads one model file. `load(url)` gives a glTF result ({ scene }); it is the loader's job in the browser and a stub in tests.
 * Any failure (404, broken file, no wheels) is a `null`: the caller keeps the code model.
 */
export async function loadCarGlb(url, materials, load) {
  try {
    const gltf = await load(url);
    return prepareCar(gltf.scene, materials);
  } catch (e) {
    console.warn('car model not used:', url, e?.message ?? e);
    return null;
  }
}

/** The files to try for a tier, best first: the high tier prefers `<name>-hi.glb`, every tier ends at `<name>.glb`. */
export function modelUrls(base, name, tier) {
  return (tier === 'high' ? [`${name}-hi.glb`, `${name}.glb`] : [`${name}.glb`]).map((f) => new URL(f, base).href);
}
