// Rounded box: a subdivided box whose corners are pushed out to a sphere of radius r.
// Own code (about 25 lines); replaces three.js's RoundedBoxGeometry addon, which imports the bare
// name 'three' and so would need an import map, which the base's content policy forbids.
import * as THREE from '../../vendor/three/three.module.js';

/** w, h, d: size. seg: extra segments per rounded edge (1 = a bevel with one extra step). r: edge radius. */
export function roundedBox(w, h, d, seg, r) {
  const n = 2 * seg + 1;
  const g = new THREE.BoxGeometry(w, h, d, n, n, n);
  const p = g.attributes.position;
  const nor = g.attributes.normal;
  const half = [w / 2 - r, h / 2 - r, d / 2 - r];
  const v = new THREE.Vector3(), c = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(
      Math.max(-half[0], Math.min(half[0], v.x)),
      Math.max(-half[1], Math.min(half[1], v.y)),
      Math.max(-half[2], Math.min(half[2], v.z)),
    );
    o.subVectors(v, c);
    if (o.lengthSq() > 1e-12) {
      o.normalize();
      v.copy(c).addScaledVector(o, r);
      p.setXYZ(i, v.x, v.y, v.z);
      nor.setXYZ(i, o.x, o.y, o.z);
    }
  }
  return g;
}
