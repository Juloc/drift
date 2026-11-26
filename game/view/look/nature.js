// The nature of the training place: small model files of the CC0 kit (game/assets/env/*.glb, tools/make-nature.mjs, docs/ASSETS.md) on the green platform north and west of the pad,
// placed by SLOTS: areas (rectangles in the world's x, z) with a count per tier and a size range for each file; instanced, one mesh per material of the file. Never on the pad, the
// quay or the stand, never within 2 m of the barrier. A file that cannot be read leaves its places empty. Counts: low 7 kinds (~12 draws), medium and high all 14.
import * as THREE from '../../../vendor/three/three.module.js';
import { X } from '../space.js';
import { readModel } from './models.js';

const A = { x0: -122, z0: 93, x1: 122, z1: 97.5 }, B = { x0: -131.5, z0: -86, x1: -127, z1: 88 };       // along the pad's edge (north strip, west strip)
const C = { x0: -102, z0: 94, x1: -6, z1: 100 }, D = { x0: -104, z0: 119.5, x1: -4, z1: 121.5 };         // in front of and behind the stand
const E = { x0: -128, z0: 94, x1: -108, z1: 130 }, E2 = { x0: 4, z0: 94, x1: 34, z1: 130 };              // beside the stand
const F = { x0: -190, z0: 132, x1: 190, z1: 156 }, G = { x0: -195, z0: -100, x1: -140, z1: 80 };         // trees: behind the stand, on the west platform
export const SLOTS = [
  { file: 'bush-a', areas: [C, D, E, E2], n: [6, 10, 16], s: [0.8, 1.3] }, { file: 'bush-b', areas: [C, D, E, E2], n: [0, 6, 12], s: [0.8, 1.3] },
  { file: 'fern', areas: [D, E, E2], n: [2, 4, 8], s: [0.8, 1.4] },
  { file: 'plant-a', areas: [C, D, E, E2], n: [0, 6, 14], s: [0.8, 1.3] }, { file: 'plant-b', areas: [A, C, E], n: [0, 6, 12], s: [0.8, 1.3] },
  { file: 'grass-a', areas: [A, B], n: [40, 70, 130], s: [0.8, 1.4] }, { file: 'grass-b', areas: [A, B], n: [0, 50, 110], s: [0.8, 1.4] },
  { file: 'flowers-a', areas: [C, D], n: [5, 10, 16], s: [0.8, 1.2] }, { file: 'flowers-b', areas: [C, D], n: [0, 8, 14], s: [0.8, 1.2] },
  { file: 'tree-a', areas: [F, G], n: [2, 4, 6], s: [0.8, 1.3], shadow: true }, { file: 'tree-b', areas: [F, G], n: [2, 4, 6], s: [0.8, 1.3], shadow: true }, { file: 'tree-c', areas: [F, G], n: [0, 3, 5], s: [0.8, 1.3], shadow: true },
  { file: 'pebble-a', areas: [A, B], n: [6, 10, 16], s: [0.8, 1.6] }, { file: 'pebble-b', areas: [A, B], n: [0, 8, 14], s: [0.8, 1.6] },
];
const TIER = { low: 0, medium: 1, high: 2 };
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** Is (x, z) a place that may have something: on the platform, off the pad (2 m), off the stand and its masts? `pad`: { x0, z0, x1, z1 } of the pad. */
export function allowed(x, z, pad) {
  const onNorth = x >= -200 && x <= 200 && z >= 91 && z <= 161, onWest = x >= -200 && x <= -126 && z >= -118 && z <= 91;
  if (!onNorth && !onWest) return false;
  if (x > pad.x0 - 2 && x < pad.x1 + 2 && z > pad.z0 - 2 && z < pad.z1 + 2) return false;   // the pad and 2 m round its barrier
  if (x > -98 && x < -10 && z > 100.5 && z < 119.3) return false;   // the stand (its front and back strips, z < 100.5 and z > 119.3, are for bushes and flowers)
  for (const mx of [pad.x0 + 20, (pad.x0 + pad.x1) / 2, pad.x1 - 20]) if (Math.hypot(x - mx, z - (pad.z1 + 12)) < 2.5) return false;   // the floodlight masts
  return true;
}

/** The places of every file for a tier: [{ file, places: [[x, z, ry, s]...] }]; the same every time. */
export function placesFor(pad, tierName, slots = SLOTS) {
  const r = rnd(2718), t = TIER[tierName] ?? 2, out = [];
  for (const sl of slots) {
    const n = sl.n[t], places = [];
    for (let tries = 0; places.length < n && tries < n * 40; tries++) {
      const a = sl.areas[Math.floor(r() * sl.areas.length)], x = a.x0 + r() * (a.x1 - a.x0), z = a.z0 + r() * (a.z1 - a.z0);
      if (allowed(x, z, pad)) places.push([+x.toFixed(2), +z.toFixed(2), +(r() * Math.PI * 2).toFixed(3), +(sl.s[0] + r() * (sl.s[1] - sl.s[0])).toFixed(2)]);
    }
    if (places.length) out.push({ file: sl.file, places, shadow: !!sl.shadow });
  }
  return out;
}

/** Builds the group (async: the files come in). `lite`: no shadows. */
export async function buildNature(json, look, groundY = () => 0, tierName = 'high') {
  const group = new THREE.Group(), pad = json.academy.pad, y0 = groundY(0, 0); group.name = 'place:nature';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), N = look.place?.nature ?? {};
  let draws = 0, instances = 0;
  await Promise.all(placesFor(pad, tierName).map(async ({ file, places, shadow }) => {
    const gltf = await readModel(file); if (!gltf) return;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const material = o.material.clone();
      if (N.saturation !== undefined) material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, ${(+N.saturation).toFixed(3)});`); };
      const mesh = new THREE.InstancedMesh(o.geometry.clone().applyMatrix4(o.matrixWorld), material, places.length);
      places.forEach(([x, z, ry, k], i) => mesh.setMatrixAt(i, m.compose(p.set(X(x), y0, z), q.setFromAxisAngle(up, ry), s.set(k, k, k))));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = shadow && tierName !== 'low'; mesh.name = `nature:${file}`;
      group.add(mesh); draws++; instances += places.length;
    });
  }));
  group.userData = { draws, instances };
  return group;
}
