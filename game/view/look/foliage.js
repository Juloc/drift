// Grass and low plants beside the road: clumps of thin blades (a fan of three triangles, dark at the foot, lighter at the tip) and soft low bushes, each kind ONE
// instanced mesh (one draw call), placed along the road where the camera looks (densest 1 to 12 m from the road's edge, thinning to the sides), on ground that is not
// steep, not on the road and not on the plaza. Counts come from the tier (`tier.grass`, `tier.plants`; none on the phone: it keeps the tufts of world.js details()).
// The blades sway a little in a light wind (the tip moves by at most 5 cm; one time uniform, on the GPU). Nothing here casts or receives a shadow.
import * as THREE from '../../../vendor/three/three.module.js';
import { X } from '../space.js';
import { insidePoly } from './field.js';
import { noise2 } from '../../core/rng.js';

const C = (hex) => new THREE.Color(hex);

/** One clump: eight blades in a fan, short (25 to 35 cm) and wide (a clump 50 cm across), leaning out; the foot has the colour of the ground, the tip is clearly lighter. */
function clumpGeometry(foot, tip) {
  const pos = [], col = [], nor = [];
  for (let b = 0; b < 8; b++) {
    const a = (b / 8) * Math.PI * 2 + (b % 2) * 0.4, lean = 0.1 + (b % 3) * 0.045, h = 0.24 + (b % 3) * 0.05 + (b % 2) * 0.03, w = 0.055, r0 = 0.05 + (b % 2) * 0.03;
    const cx = Math.cos(a) * r0, cz = Math.sin(a) * r0, tx = cx + Math.cos(a) * lean, tz = cz + Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, tx, h, tz);
    col.push(foot.r, foot.g, foot.b, foot.r, foot.g, foot.b, tip.r, tip.g, tip.b);
    for (let k = 0; k < 3; k++) nor.push(0, 1, 0);   // lit from above like the ground: a clump is not shaded blade by blade
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A fern: seven arched fronds from one point, each a long thin triangle bending down at the tip (a flat fan, dark green, lighter at the tips). */
function fernGeometry(dark, light) {
  const pos = [], col = [], nor = [];
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2 + 0.3, dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.07, pz = dx * 0.07;
    // base, a point half way (up and out), the tip (out and down): two triangles a frond
    const mx = dx * 0.28, mz = dz * 0.28, tx = dx * 0.55, tz = dz * 0.55;
    pos.push(-px * 0.3, 0.02, -pz * 0.3, px * 0.3, 0.02, pz * 0.3, mx - px, 0.3, mz - pz, px * 0.3, 0.02, pz * 0.3, mx + px, 0.3, mz + pz, mx - px, 0.3, mz - pz, mx - px, 0.3, mz - pz, mx + px, 0.3, mz + pz, tx, 0.16, tz);
    const c = [dark, dark, light, dark, light, light, light, light, light];
    for (const k of c) col.push(k.r, k.g, k.b);
    for (let k = 0; k < 9; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A low bush: three soft faceted blobs, darker below. */
function bushGeometry(dark, light, blobs = [[0, 0.22, 0, 0.3], [0.22, 0.17, 0.1, 0.2], [-0.16, 0.16, -0.16, 0.22]], detail = 0) {
  const parts = [];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, detail); g.translate(x, y, z); g.scale(1, 0.8, 1);
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
 * @param f the field (view/look/field.js)  @param scene the scene (plaza, lake)  @param look the look (land colours, foliage {...})  @param tier the tier ({ grass, plants, ferns, blossoms })
 * @param rockSpots places of the rock models ([x, z, size], world space: ferns grow at their foot)
 * @returns a group of instanced meshes, or null when the tier has none
 */
export function makeFoliage(f, scene, look, tier, rnd, rockSpots = []) {
  const nGrass = tier.grass ?? 0, nPlants = tier.plants ?? 0, nFerns = tier.ferns ?? 0, nBlossom = tier.blossoms ?? 0;
  if (!nGrass && !nPlants && !nFerns && !nBlossom) return null;
  const F = look.foliage ?? {}, L = look.land, K = scene.lake, plaza = scene.plaza?.pts ?? null;
  const nearLake = (x, z) => !!K && Math.hypot((x - K.x) / K.rx, (z - K.z) / K.rz) < 1.9;
  const group = new THREE.Group(); group.name = 'foliage';
  const time = { value: 0 };
  const okAt = (x, z) => f.edge(x, z) >= 0.5 && f.slope(x, z) <= 0.6 && !f.wet(x, z, 3) && !nearLake(x, z) && !(plaza && insidePoly(plaza, x, z));
  // `count` places along the road in groups: the position along the road and the distance from the edge come from noise, so there are patches of thick growth and bare spots between;
  // the distance from the road is squared towards 0: densest at 1 to 8 m, thinning to `reach`
  const places = (count, reach, groupScale = 9, cut = -0.12) => {
    const out = [], len = f.info.length;
    for (let tries = 0; out.length < count && tries < count * 14; tries++) {
      const d = rnd() * len, side = rnd() < 0.5 ? -1 : 1, e = 0.7 + Math.pow(rnd(), 2.0) * reach;
      const i = Math.min(f.road.length - 2, Math.max(0, Math.floor((d / len) * (f.road.length - 1)))), p = f.road[i], dir = f.info.dir[i], r = [dir[1], -dir[0]], o = f.hw + e;
      const x = p[0] + r[0] * side * o, z = p[1] + r[1] * side * o;
      if (noise2(x / groupScale + 4, z / groupScale - 6) < cut) continue;   // a gap between two groups
      if (!okAt(x, z)) continue;
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
  const lambert = (side) => new THREE.MeshLambertMaterial({ vertexColors: true, side });
  if (nGrass) {
    // the foot is the colour of the ground it grows from (the moss colour of the land, look.land.moss), the tip clearly lighter and a little rosier in the dusk
    const foot = C(L.moss ?? L.cool).lerp(C(L.cool), 0.3).multiplyScalar(0.8), tip = C(F.tip ?? '#6f9a54').lerp(C('#b8a4cc'), 0.15);
    const mat = lambert(THREE.DoubleSide);
    // the tips move in a light wind: by their height over the foot, with a phase from the clump's place (mid and high tier)
    if (tier.wind !== false) mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = instanceMatrix[3].xyz; float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.12 * position.y; transformed.x += sway; transformed.z += sway * 0.6; }`);
    };
    const mesh = make(clumpGeometry(foot, tip), mat, places(nGrass, F.reach ?? 14), [0.8, 1.5]);
    mesh.name = 'grass'; mesh.onBeforeRender = () => { time.value = performance.now() / 1000; };
    group.add(mesh);
  }
  if (nPlants) {
    // two kinds of low round bush, faceted like the trees: a broad one (three blobs) and a tall narrow one (two blobs); half of each, in groups
    const dark = C(F.plantDark ?? '#2c4a42'), light = C(F.plantLight ?? '#4e7a62'), list = places(nPlants, F.reach ?? 14, 11, -0.05), half = list.length >> 1;
    group.add(Object.assign(make(bushGeometry(dark, light), lambert(THREE.FrontSide), list.slice(0, half), [0.8, 1.7], true), { name: 'plants' }));
    group.add(Object.assign(make(bushGeometry(dark.clone().lerp(C(L.moss ?? '#5f8a5e'), 0.25), light.clone().lerp(C('#a8c47e'), 0.3), [[0, 0.3, 0, 0.2], [0.05, 0.55, 0.03, 0.16]], 1), lambert(THREE.FrontSide), list.slice(half), [0.9, 1.8], true), { name: 'plants2' }));
  }
  if (nFerns) {
    // ferns at the foot of the rocks (the rock models' places), a few more along the road
    const list = [];
    for (const [rx, rz, size] of rockSpots) for (let n = 0; n < 3 && list.length < nFerns; n++) { const a = rnd() * 6.3, d = size * (0.55 + rnd() * 0.6), x = rx + Math.cos(a) * d, z = rz + Math.sin(a) * d; if (okAt(x, z)) list.push([x, f.height(x, z), z]); }
    for (const p of places(Math.max(0, nFerns - list.length), 8, 7, 0.1)) list.push(p);
    group.add(Object.assign(make(fernGeometry(C('#2c5a46'), C('#6a9a62')), lambert(THREE.DoubleSide), list, [0.9, 1.7], true), { name: 'ferns' }));
  }
  if (nBlossom) {
    // pink bushes in clumps (three to five together), the same look as the single ones of the hairpin sets
    const blob = bushGeometry(C(look.cherry?.blossom?.[2] ?? '#e0507e'), C(look.cherry?.blossom?.[3] ?? '#ffa3c2'), [[0, 0.32, 0, 0.34], [0.3, 0.24, 0.1, 0.24], [-0.22, 0.22, 0.2, 0.26]], 1), list = [];
    for (const c0 of places(Math.ceil(nBlossom / 4), F.reach ?? 14, 14, 0.1)) for (let n = 0; n < 4 && list.length < nBlossom; n++) { const a = rnd() * 6.3, d = 0.4 + rnd() * 1.1, x = c0[0] + Math.cos(a) * d, z = c0[2] + Math.sin(a) * d; if (okAt(x, z)) list.push([x, f.height(x, z), z]); }
    group.add(Object.assign(make(blob, lambert(THREE.FrontSide), list, [0.9, 1.6], true), { name: 'blossoms' }));
  }
  return group;
}
