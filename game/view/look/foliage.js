// Grass and low plants beside the road: clumps of thin blades (a fan of three triangles, dark at the foot, lighter at the tip) and soft low bushes, each kind ONE
// instanced mesh (one draw call), placed along the road where the camera looks (densest 1 to 12 m from the road's edge, thinning to the sides), on ground that is not
// steep, not on the road and not on the plaza. Counts come from the tier (`tier.grass`, `tier.plants`; none on the phone: it keeps the tufts of world.js details()).
// The blades sway a little in a light wind (the tip moves by at most 5 cm; one time uniform, on the GPU). Nothing here casts or receives a shadow.
import * as THREE from '../../../vendor/three/three.module.js';
import { X } from '../space.js';
import { insidePoly } from './field.js';

const C = (hex) => new THREE.Color(hex);

/** One clump: three blades leaning a little apart, each a triangle; the colour runs from the foot to the tip. */
function clumpGeometry(foot, tip) {
  const pos = [], col = [], nor = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + b * 0.7, lean = 0.14 + b * 0.07, h = 0.7 + (b % 2) * 0.4 - (b === 2 ? 0.25 : 0), w = 0.06;
    const cx = Math.cos(a) * 0.05, cz = Math.sin(a) * 0.05, tx = cx + Math.cos(a) * lean, tz = cz + Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, tx, h, tz);
    col.push(foot.r, foot.g, foot.b, foot.r, foot.g, foot.b, tip.r, tip.g, tip.b);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);   // lit from above like the ground: a clump is not shaded blade by blade
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A low bush: three soft faceted blobs, darker below. */
function bushGeometry(dark, light) {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0.22, 0, 0.3], [0.22, 0.17, 0.1, 0.2], [-0.16, 0.16, -0.16, 0.22]]) {
    const g = new THREE.IcosahedronGeometry(r, 0); g.translate(x, y, z); g.scale(1, 0.8, 1);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), k = new THREE.Color();
    for (let i = 0; i < p.count; i++) { k.copy(dark).lerp(light, Math.min(1, Math.max(0, p.getY(i) / 0.45))); c.set([k.r, k.g, k.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv');
    parts.push(g);
  }
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * @param f the field (view/look/field.js)  @param scene the scene (plaza, lake)  @param look the look (land colours, foliage {...})  @param tier the tier ({ grass, plants })
 * @returns a group of two instanced meshes, or null when the tier has none
 */
export function makeFoliage(f, scene, look, tier, rnd) {
  const nGrass = tier.grass ?? 0, nPlants = tier.plants ?? 0;
  if (!nGrass && !nPlants) return null;
  const F = look.foliage ?? {}, L = look.land, K = scene.lake, plaza = scene.plaza?.pts ?? null;
  const nearLake = (x, z) => !!K && Math.hypot((x - K.x) / K.rx, (z - K.z) / K.rz) < 1.9;
  const group = new THREE.Group(); group.name = 'foliage';
  const time = { value: 0 };
  /** Walk along the road and drop `count` places: x, z, ground height; the nearer to the road, the likelier. */
  const places = (count, reach) => {
    const out = [], len = f.info.length;
    for (let tries = 0; out.length < count && tries < count * 8; tries++) {
      const d = rnd() * len, side = rnd() < 0.5 ? -1 : 1, e = 0.6 + Math.pow(rnd(), 2.2) * reach;
      const i = Math.min(f.road.length - 2, Math.max(0, Math.floor((d / len) * (f.road.length - 1)))), p = f.road[i], dir = f.info.dir[i], r = [dir[1], -dir[0]], o = f.hw + e;
      const x = p[0] + r[0] * side * o, z = p[1] + r[1] * side * o;
      if (f.edge(x, z) < 0.5 || f.slope(x, z) > 0.6 || f.wet(x, z, 3) || nearLake(x, z) || (plaza && insidePoly(plaza, x, z))) continue;
      out.push([x, f.height(x, z), z]);
    }
    return out;
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3(), k = new THREE.Color();
  const make = (geo, material, list, scale, tint) => {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach(([x, y, z], i) => {
      const sc = scale[0] + rnd() * (scale[1] - scale[0]);
      mesh.setMatrixAt(i, m.compose(v.set(X(x), y - 0.02, z), q.setFromAxisAngle(up, rnd() * 6.3), s.set(sc * (0.85 + rnd() * 0.3), sc, sc * (0.85 + rnd() * 0.3))));
      if (tint) { k.setScalar(0.8 + rnd() * 0.4); mesh.setColorAt(i, k); }
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.frustumCulled = true; mesh.castShadow = false; mesh.receiveShadow = false;
    return mesh;
  };
  if (nGrass) {
    const foot = C(F.foot ?? L.cool).multiplyScalar(0.85), tip = C(F.tip ?? L.high).lerp(C(L.moss ?? '#7a9a62'), 0.45);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // the tips move in a light wind: by their height over the foot, with a phase from the clump's place (set by `tier.wind`, mid and high tier)
    if (tier.wind !== false) mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = instanceMatrix[3].xyz; float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.05 * position.y; transformed.x += sway; transformed.z += sway * 0.6; }`);
    };
    const mesh = make(clumpGeometry(foot, tip), mat, places(nGrass, F.reach ?? 12), [0.8, 1.5]);
    mesh.name = 'grass'; mesh.onBeforeRender = () => { time.value = performance.now() / 1000; };
    group.add(mesh);
  }
  if (nPlants) {
    const dark = C(F.plantDark ?? '#2c4a42'), light = C(F.plantLight ?? '#4e7a62');
    group.add(Object.assign(make(bushGeometry(dark, light), new THREE.MeshLambertMaterial({ vertexColors: true }), places(nPlants, F.reach ?? 12), [0.7, 1.5], true), { name: 'plants' }));
  }
  return group;
}
