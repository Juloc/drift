// Parked cars that never move: the parts of several S15 probes are merged by material into one mesh each (the paint gets the
// colour of each car through vertex colours), so three or four parked cars cost as many draw calls as one.
import * as THREE from '../../../vendor/three/three.module.js';
import { mergeGeometries } from '../../../vendor/three/addons/utils/BufferGeometryUtils.js';

/** cars: [{ probe (from buildS15), matrix (THREE.Matrix4 of its place), paint (THREE.Color) }]. Returns a group of merged meshes. */
export function mergeParked(cars) {
  const bySlot = new Map();
  for (const { probe, matrix, paint } of cars) {
    const slots = new Map(Object.entries(probe.materials).map(([k, m]) => [m, k]));
    probe.group.updateMatrixWorld(true);
    probe.group.traverse((o) => {
      if (!o.isMesh) return;
      const slot = slots.get(o.material) ?? 'other';
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld));
      const n = g.attributes.position.count, col = new Float32Array(n * 3), own = g.attributes.color;
      const tint = slot === 'paint' ? paint : new THREE.Color(1, 1, 1);
      for (let i = 0; i < n; i++) col.set(own ? [own.getX(i), own.getY(i), own.getZ(i)] : [tint.r, tint.g, tint.b], i * 3);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!bySlot.has(slot)) bySlot.set(slot, { material: o.material, list: [] });
      bySlot.get(slot).list.push(g);
    });
  }
  const group = new THREE.Group();
  for (const [slot, { material, list }] of bySlot) {
    const m = material.clone();
    m.vertexColors = true;
    if (slot === 'paint') m.color.set(0xffffff);
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.castShadow = slot !== 'lights'; mesh.receiveShadow = slot === 'paint';
    group.add(mesh);
  }
  return group;
}
