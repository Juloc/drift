// The Dart: a low rear-drive coupe built from rounded boxes. Front is +z, the ground is y = 0.
// Wheels are not part of the body: they are drawn as one instanced mesh (see wheels.js) so that all cars of a lobby
// share a single draw call. Fixed numbers other code relies on: wheel x = +-0.82, z = +-1.3, radius 0.36.
import { Builder, glow } from '../core/build.js';

export const WHEEL = { x: 0.82, z: 1.3, r: 0.36, w: 0.3 };

export function buildCar({ paint = 0x3a7de0, lite = false } = {}) {
  const S = new Builder({ seed: 7, jitter: 0.02, wobble: 0.012 });
  const L = new Builder({ seed: 8, jitter: 0, wobble: 0, bake: false }); // lights
  S.lite = lite;
  const dark = 0x2a2d36, glass = 0x9cc4e8, cream = 0xece6d6, red = 0xd2433a;
  // body, hood and boot
  S.box(1.84, 0.5, 3.7, 0, 0.55, 0, paint, { r: 0.22, seg: 2 });
  S.box(1.7, 0.16, 1.1, 0, 0.84, 1.15, paint, { r: 0.07, rx: 0.07 });
  S.box(1.7, 0.18, 0.8, 0, 0.86, -1.4, paint, { r: 0.07, rx: -0.05 });
  // cabin and windows
  S.box(1.52, 0.46, 1.75, 0, 1.0, -0.2, paint, { r: 0.2, seg: 2 });
  S.box(1.4, 0.3, 0.06, 0, 1.03, 0.68, glass, { r: 0, rx: -0.5, wobble: 0 });
  S.box(1.4, 0.28, 0.06, 0, 1.03, -1.06, glass, { r: 0, rx: 0.5, wobble: 0 });
  for (const sx of [-1, 1]) {
    S.box(0.06, 0.28, 1.3, sx * 0.77, 1.04, -0.2, glass, { r: 0, wobble: 0 });
    S.box(0.05, 0.12, 0.2, sx * 0.94, 0.8, 0.45, dark, { r: 0.03 }); // mirror
    S.box(0.05, 0.4, 0.05, sx * 0.93, 0.6, -0.15, dark, { r: 0, wobble: 0 }); // door line
    // wheel arches: dark discs behind the wheels
    for (const sz of [-1, 1]) S.ball(0.5, sx * 0.84, 0.46, sz * 1.3, dark, { detail: 1, sx: 0.3, sy: 0.85, sz: 1.05 });
  }
  // stripe, bumpers, spoiler
  S.box(0.34, 0.03, 3.2, 0, 0.82, 0, cream, { r: 0, wobble: 0, jitter: 0 });
  S.box(0.34, 0.03, 1.2, 0, 1.24, -0.2, cream, { r: 0, wobble: 0, jitter: 0 });
  S.box(1.8, 0.2, 0.2, 0, 0.36, 1.82, dark, { r: 0.08 });
  S.box(1.8, 0.2, 0.2, 0, 0.36, -1.82, dark, { r: 0.08 });
  S.box(0.08, 0.3, 0.12, -0.6, 1.1, -1.7, dark, { r: 0.02 });
  S.box(0.08, 0.3, 0.12, 0.6, 1.1, -1.7, dark, { r: 0.02 });
  S.box(1.7, 0.07, 0.4, 0, 1.28, -1.7, dark, { r: 0.03, rx: 0.08 });
  // lights (unlit, brighter than white)
  for (const sx of [-1, 1]) {
    L.box(0.42, 0.14, 0.06, sx * 0.6, 0.62, 1.86, glow(0xfff0c0, 2.4), { r: 0, jitter: 0 });
    L.box(0.42, 0.12, 0.06, sx * 0.6, 0.66, -1.86, glow(0xff3a30, 1.8), { r: 0, jitter: 0 });
  }
  return { body: S.build(), lights: L.build() };
}
