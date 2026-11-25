// Small deterministic helpers: seeded random numbers and value noise. No dependencies.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(ix, iy, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/** Value noise in [-1, 1]. */
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), fx), x10 = mix(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), fx), x11 = mix(c(0, 1, 1), c(1, 1, 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz) * 2 - 1;
}

export function noise2(x, y) {
  return noise3(x, y, 7.31);
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = mix;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Frame-rate independent approach of `a` towards `b`. */
export function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}
/** Shortest signed difference between two angles. */
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
