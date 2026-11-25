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

/** A material the file keeps as it is ('own_<name>'), or keeps and lets glow ('lamp_front_<name>', 'lamp_rear_<name>'). */
export function ownOf(materialName) {
  const n = String(materialName ?? '').toLowerCase();
  return n.startsWith('lamp_front_') ? 'lamp_front' : n.startsWith('lamp_rear_') ? 'lamp_rear' : n.startsWith('own_') ? 'own' : null;
}

/**
 * The file's own material, made ready for the game: the game's room (envMap) for its reflections; a lamp glows with its own
 * colour or texture (emissive), as bright as the game's lamps.
 */
function keepOwn(m, kind, materials) {
  const k = m.clone();
  k.name = m.name;
  const env = materials.paint?.envMap ?? null;
  if (env && 'envMap' in k) { k.envMap = env; k.envMapIntensity = kind === 'own' ? 1.0 : 0.6; }
  if (kind !== 'own' && k.emissive) {
    if (!k.emissiveMap && k.map) k.emissiveMap = k.map;
    if (k.emissive.getHex() === 0) k.emissive.set(k.emissiveMap ? 0xffffff : k.color);
    k.emissiveIntensity = kind === 'lamp_front' ? 2.6 : 2.0;
  }
  return k;
}

/**
 * Gives every mesh its material by the material's name (docs/CAR-MODELS.md). Meshes with several primitives (a material array) are handled per entry.
 * - a slot name ('paint', 'glass', ...): the game's material of that slot (the garage colour goes on 'paint'). A base colour
 *   texture (`map`) and vertex colours (COLOR_0) of the file multiply the slot's colour, on one shared copy per texture.
 * - 'own_<name>': the file's material as it is (PBR, its textures), with the game's room for reflections.
 * - 'lamp_front_<name>', 'lamp_rear_<name>': the file's material, glowing in its own colour or texture.
 * - anything else: the plastic material, and the name is reported.
 * @returns {{ unknown: string[], used: Set<string> }} material names that are none of these, and the slots and kinds in use
 */
export function applySlots(root, materials) {
  const unknown = [], used = new Set(), copies = new Map();
  const pick = (m, geometry) => {
    const own = ownOf(m?.name);
    if (own) {
      used.add(own);
      if (!copies.has(m)) copies.set(m, keepOwn(m, own, materials));
      return copies.get(m);
    }
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
