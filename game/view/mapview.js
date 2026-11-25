// Draws a map from its JSON: ground, walls, islands, painted bays, puddles, the loop's dashes, poles and planters.
// Everything static is merged into two meshes (clay and glow): two draw calls.
import * as THREE from '../../vendor/three/three.module.js';
import { Builder, glow } from '../core/build.js';
import { bakeGroup } from '../core/bake.js';
import { makeClay, makeGlow } from '../core/materials.js';
import { mulberry32 } from '../core/rng.js';
import { X } from './space.js';

const PI = Math.PI;

export function buildMap(map, { lite = false } = {}) {
  const S = new Builder({ seed: 3, jitter: 0.025, wobble: 0.01, bake: false });
  const G = new Builder({ seed: 4, jitter: 0, wobble: 0, bake: false });
  S.lite = lite;
  const rnd = mulberry32(11);
  const P = (p) => [X(p[0]), p[1]]; // physics point -> drawing point
  const asphalt = 0x6b6f78, kerb = 0xb9b6ae, grass = 0x8fc46a, bush = 0x5fa557, white = 0xf2efe6, yellow = 0xf0c24a;

  // the ground: a big grass slab under everything, the asphalt slab on top
  S.box(900, 1, 900, 0, -0.65, 0, 0x9ccf7a, { r: 0, wobble: 0, jitter: 0.02 });
  const xs = map.bounds.map((p) => p[0]), zs = map.bounds.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  S.box(x1 - x0, 0.4, z1 - z0, 0, -0.2, (z0 + z1) / 2, asphalt, { r: 0.05, wobble: 0.004, jitter: 0.015 });

  // a wall along p -> q (drawing points)
  const wall = (p, q, h, t, color) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    S.box(t, h, len + t, (p[0] + q[0]) / 2, h / 2, (p[1] + q[1]) / 2, color, { r: Math.min(0.12, t / 3), ry: Math.atan2(dx, dz) });
  };
  const ring = (pts, h, t, color) => { for (let i = 0; i < pts.length; i++) wall(P(pts[i]), P(pts[(i + 1) % pts.length]), h, t, color); };
  ring(map.bounds, 1.0, 1.2, kerb);
  ring(map.bounds, 1.2, 0.4, 0xd24a3d); // a red stripe on top of the barrier

  // islands: kerb ring, grass top, a bush or two
  for (const w of map.walls) {
    const wx = w.pts.map((p) => p[0]), wz = w.pts.map((p) => p[1]);
    const [ax, bx, az, bz] = [Math.min(...wx), Math.max(...wx), Math.min(...wz), Math.max(...wz)];
    const cx = X((ax + bx) / 2), cz = (az + bz) / 2;
    S.box(bx - ax, 0.5, bz - az, cx, 0.25, cz, kerb, { r: 0.18, seg: 2 });
    S.box(bx - ax - 1.2, 0.56, bz - az - 1.2, cx, 0.28, cz, grass, { r: 0.2, seg: 2 });
    const n = Math.max(2, Math.round(((bx - ax) * (bz - az)) / 150));
    for (let i = 0; i < n; i++) {
      const bxp = cx + (rnd() - 0.5) * (bx - ax - 4), bzp = cz + (rnd() - 0.5) * (bz - az - 4), r = 0.9 + rnd() * 0.8;
      S.cyl(0.14, 0.18, 1.2, bxp, 1.1, bzp, 0x7a5a3a, { seg: 6 });
      S.ball(r, bxp, 2.2 + r * 0.4, bzp, bush, { detail: lite ? 0 : 1, sy: 0.85 });
    }
  }
  // puddles
  for (const z of map.zones) if (z.kind === 'wet') S.cyl(z.r, z.r, 0.03, X(z.x), 0.012, z.z, 0x4f6f8e, { seg: 24, jitter: 0, wobble: 0 });

  // painted bays
  for (const p of map.props) if (p.type === 'bays') {
    for (let v = p.z0; v <= p.z1 + 0.01; v += p.pitch) S.box(p.x1 - p.x0, 0.03, 0.18, X((p.x0 + p.x1) / 2), 0.02, v, white, { r: 0, wobble: 0, jitter: 0.01 });
    S.box(0.18, 0.03, p.z1 - p.z0, X(p.x0), 0.02, (p.z0 + p.z1) / 2, white, { r: 0, wobble: 0, jitter: 0.01 });
  }

  // the race loop: yellow dashes along the centre line, and the start line
  const c = map.centre;
  let acc = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += len;
    if (acc >= 7) { acc = 0; S.box(0.35, 0.03, 2.6, X((a[0] + b[0]) / 2), 0.025, (a[1] + b[1]) / 2, yellow, { r: 0, wobble: 0, jitter: 0, ry: Math.atan2(-(b[0] - a[0]), b[1] - a[1]) }); }
  }
  {
    const a = c[0], b = c[1], ry = Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
    for (let i = -4; i < 4; i++) for (let j = 0; j < 2; j++) {
      const ox = i * 1.4 + 0.7, oz = (j - 0.5) * 1.4;
      S.box(1.4, 0.03, 1.4, X(a[0]) + Math.cos(ry) * ox + Math.sin(ry) * oz, 0.03, a[1] - Math.sin(ry) * ox + Math.cos(ry) * oz, (i + j) % 2 ? 0x1c1d22 : white, { r: 0, wobble: 0, jitter: 0, ry });
    }
  }

  // poles and planters
  for (const p of map.props) {
    if (p.type === 'pole') {
      S.cyl(0.14, 0.22, 7, X(p.x), 3.5, p.z, 0x8c9099, { seg: 8 });
      S.box(1.4, 0.16, 0.5, X(p.x), 7.05, p.z, 0x8c9099, { r: 0.05 });
      G.box(1.1, 0.07, 0.34, X(p.x), 6.93, p.z, glow(0xfff2c8, 2.2), { r: 0, jitter: 0 });
    } else if (p.type === 'planter') {
      S.cyl(p.r, p.r + 0.15, 0.6, X(p.x), 0.3, p.z, kerb, { seg: 14 });
      S.cyl(p.r - 0.25, p.r - 0.25, 0.64, X(p.x), 0.32, p.z, 0x6b4a33, { seg: 14 });
      S.ball(p.r * 0.8, X(p.x), 1.5, p.z, bush, { detail: lite ? 0 : 1, sy: 0.9 });
    }
  }

  bakeGroup([S], { strength: 0.8 });
  const group = new THREE.Group();
  const solid = new THREE.Mesh(S.build(), makeClay());
  solid.receiveShadow = true;
  const lamps = new THREE.Mesh(G.build(), makeGlow());
  group.add(solid, lamps);
  return group;
}
