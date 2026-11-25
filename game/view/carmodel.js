// The five cars, built from rounded boxes by code. Front is +z, the ground is y = 0. Wheels are not part of a body:
// they are one instanced mesh for all cars (wheels.js) with the same layout on every car (x = +-0.82, z = +-1.3,
// radius 0.36), so each body is shaped around that. Lights are a second, unlit geometry.
import { Builder, glow } from '../core/build.js';

export const WHEEL = { x: 0.82, z: 1.3, r: 0.36, w: 0.3 };
/** Half width and half length of the shadow blob under each car, by car id. */
export const BLOB = [[1.25, 2.1], [1.1, 1.9], [1.35, 2.3], [1.2, 2.0], [1.35, 2.3]];
export const CAR_NAMES = ['Dart', 'AE86', 'Bruno', 'Marlin', 'Ox'];   // car 1 was 'Pip'; its code model below stays the fallback when the AE86's file cannot be used

const dark = 0x2a2d36, glass = 0x9cc4e8, cream = 0xece6d6, chrome = 0xb8bcc6;
const arches = (S, w = 0.84) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.ball(0.5, sx * w, 0.46, sz * WHEEL.z, dark, { detail: 1, sx: 0.3, sy: 0.85, sz: 1.05 }); };
const head = (L, x, y, z, w = 0.42, h = 0.14) => L.box(w, h, 0.06, x, y, z, glow(0xfff0c0, 2.4), { r: 0, jitter: 0 });
const tail = (L, x, y, z, w = 0.42, h = 0.12) => L.box(w, h, 0.06, x, y, z, glow(0xff3a30, 1.8), { r: 0, jitter: 0 });

/** Dart: a low rear-drive coupe with a stripe and a spoiler. */
function dart(S, L, paint) {
  S.box(1.84, 0.5, 3.7, 0, 0.55, 0, paint, { r: 0.22, seg: 2 });
  S.box(1.7, 0.16, 1.1, 0, 0.84, 1.15, paint, { r: 0.07, rx: 0.07 });
  S.box(1.7, 0.18, 0.8, 0, 0.86, -1.4, paint, { r: 0.07, rx: -0.05 });
  S.box(1.52, 0.46, 1.75, 0, 1.0, -0.2, paint, { r: 0.2, seg: 2 });
  S.box(1.4, 0.3, 0.06, 0, 1.03, 0.68, glass, { r: 0, rx: -0.5, wobble: 0 });
  S.box(1.4, 0.28, 0.06, 0, 1.03, -1.06, glass, { r: 0, rx: 0.5, wobble: 0 });
  for (const sx of [-1, 1]) {
    S.box(0.06, 0.28, 1.3, sx * 0.77, 1.04, -0.2, glass, { r: 0, wobble: 0 });
    S.box(0.05, 0.12, 0.2, sx * 0.94, 0.8, 0.45, dark, { r: 0.03 });
    S.box(0.05, 0.4, 0.05, sx * 0.93, 0.6, -0.15, dark, { r: 0, wobble: 0 });
    S.box(0.08, 0.3, 0.12, sx * 0.6, 1.1, -1.7, dark, { r: 0.02 });
    head(L, sx * 0.6, 0.62, 1.86); tail(L, sx * 0.6, 0.66, -1.86);
  }
  arches(S);
  S.box(0.34, 0.03, 3.2, 0, 0.82, 0, cream, { r: 0, wobble: 0, jitter: 0 });
  S.box(0.34, 0.03, 1.2, 0, 1.24, -0.2, cream, { r: 0, wobble: 0, jitter: 0 });
  S.box(1.8, 0.2, 0.2, 0, 0.36, 1.82, dark, { r: 0.08 });
  S.box(1.8, 0.2, 0.2, 0, 0.36, -1.82, dark, { r: 0.08 });
  S.box(1.7, 0.07, 0.4, 0, 1.28, -1.7, dark, { r: 0.03, rx: 0.08 });
}

/** Pip (now the fallback of car 1, the AE86): a short, tall little hatchback with big round lights. */
function pip(S, L, paint) {
  S.box(1.72, 0.56, 3.2, 0, 0.62, 0, paint, { r: 0.26, seg: 2 });
  S.box(1.56, 0.7, 2.0, 0, 1.17, -0.25, paint, { r: 0.28, seg: 2 });
  S.box(1.4, 0.4, 0.06, 0, 1.2, 0.77, glass, { r: 0, rx: -0.35, wobble: 0 });
  S.box(1.3, 0.4, 0.06, 0, 1.22, -1.28, glass, { r: 0, rx: 0.2, wobble: 0 });
  for (const sx of [-1, 1]) {
    S.box(0.06, 0.38, 1.5, sx * 0.79, 1.22, -0.25, glass, { r: 0, wobble: 0 });
    S.ball(0.2, sx * 0.55, 0.78, 1.55, cream, { detail: 1, sz: 0.5 });
    L.box(0.26, 0.26, 0.06, sx * 0.55, 0.78, 1.62, glow(0xfff0c0, 2.4), { r: 0, jitter: 0 });
    tail(L, sx * 0.62, 0.7, -1.62, 0.3, 0.2);
    S.box(0.05, 0.1, 0.16, sx * 0.9, 0.95, 0.5, dark, { r: 0.03 });
  }
  arches(S, 0.8);
  S.box(1.7, 0.18, 0.2, 0, 0.4, 1.62, dark, { r: 0.08 });
  S.box(1.7, 0.18, 0.2, 0, 0.4, -1.62, dark, { r: 0.08 });
  S.box(0.5, 0.05, 0.5, 0, 1.55, -0.3, cream, { r: 0.02 }); // a sun roof
  S.cyl(0.02, 0.02, 0.5, 0.6, 1.8, -0.9, dark, { seg: 4, rx: -0.3, wobble: 0 });
}

/** Bruno: long, wide muscle car with a bonnet scoop, twin stripes and fat rear arches. */
function bruno(S, L, paint) {
  S.box(1.96, 0.58, 3.98, 0, 0.6, 0, paint, { r: 0.2, seg: 2 });
  S.box(1.84, 0.16, 1.5, 0, 0.93, 1.1, paint, { r: 0.06, rx: 0.04 });
  S.box(1.6, 0.44, 1.4, 0, 1.06, -0.6, paint, { r: 0.18, seg: 2 });
  S.box(1.46, 0.28, 0.06, 0, 1.08, 0.1, glass, { r: 0, rx: -0.55, wobble: 0 });
  S.box(1.46, 0.26, 0.06, 0, 1.08, -1.3, glass, { r: 0, rx: 0.55, wobble: 0 });
  S.box(0.7, 0.16, 0.8, 0, 1.08, 1.0, dark, { r: 0.05 }); // scoop
  for (const sx of [-1, 1]) {
    S.box(0.06, 0.26, 1.1, sx * 0.81, 1.08, -0.6, glass, { r: 0, wobble: 0 });
    S.box(0.18, 0.025, 3.9, sx * 0.3, 1.0, 0, cream, { r: 0, wobble: 0, jitter: 0 });
    S.ball(0.6, sx * 0.9, 0.55, -WHEEL.z, paint, { detail: 1, sx: 0.28, sy: 0.85, sz: 1.2 });
    S.box(0.05, 0.12, 0.2, sx * 1.0, 0.85, 0.7, dark, { r: 0.03 });
    S.cyl(0.1, 0.1, 0.5, sx * 0.55, 0.38, -2.05, chrome, { seg: 8, rx: Math.PI / 2 }); // twin exhausts
    head(L, sx * 0.62, 0.7, 1.99, 0.5, 0.16); tail(L, sx * 0.64, 0.72, -1.99, 0.5, 0.14);
  }
  arches(S, 0.9);
  S.box(1.9, 0.22, 0.24, 0, 0.38, 1.95, dark, { r: 0.08 });
  S.box(1.9, 0.22, 0.24, 0, 0.38, -1.95, dark, { r: 0.08 });
  S.box(1.7, 0.06, 0.36, 0, 1.0, -1.8, paint, { r: 0.03, rx: 0.1 }); // duck tail
}

/** Marlin: a planted hot hatch: wide stance, a big wing on posts, a splitter and skirts. */
function marlin(S, L, paint) {
  S.box(1.9, 0.5, 3.45, 0, 0.55, 0, paint, { r: 0.2, seg: 2 });
  S.box(1.6, 0.56, 1.9, 0, 1.06, -0.3, paint, { r: 0.22, seg: 2 });
  S.box(1.46, 0.34, 0.06, 0, 1.1, 0.68, glass, { r: 0, rx: -0.45, wobble: 0 });
  S.box(1.36, 0.34, 0.06, 0, 1.1, -1.25, glass, { r: 0, rx: 0.3, wobble: 0 });
  for (const sx of [-1, 1]) {
    S.box(0.06, 0.32, 1.4, sx * 0.81, 1.1, -0.3, glass, { r: 0, wobble: 0 });
    S.box(0.1, 0.12, 2.6, sx * 0.97, 0.4, 0, dark, { r: 0.04 }); // skirts
    S.box(0.1, 0.5, 0.1, sx * 0.62, 1.5, -1.55, dark, { r: 0.02 }); // wing posts
    S.box(0.05, 0.12, 0.2, sx * 0.97, 0.85, 0.5, dark, { r: 0.03 });
    head(L, sx * 0.62, 0.64, 1.74, 0.46, 0.12); tail(L, sx * 0.64, 0.7, -1.74, 0.4, 0.12);
    L.box(0.16, 0.12, 0.06, sx * 0.3, 0.42, 1.76, glow(0xfff6d0, 2.0), { r: 0, jitter: 0 }); // fog lights
  }
  arches(S, 0.9);
  S.box(1.9, 0.1, 0.5, 0, 0.3, 1.9, dark, { r: 0.04 }); // splitter
  S.box(1.84, 0.2, 0.2, 0, 0.38, -1.8, dark, { r: 0.08 });
  S.box(1.96, 0.08, 0.55, 0, 1.78, -1.6, dark, { r: 0.03, rx: 0.12 }); // wing
  for (const sx of [-1, 1]) S.box(0.06, 0.2, 0.55, sx * 0.99, 1.74, -1.6, paint, { r: 0.02 });
  S.box(0.5, 0.02, 3.3, 0, 0.8, 0, cream, { r: 0, wobble: 0, jitter: 0 });
}

/** Ox: a tall pick-up: cab on a high chassis, open bed with a roll bar, a bull bar. */
function ox(S, L, paint) {
  S.box(1.96, 0.5, 4.0, 0, 0.78, 0, dark, { r: 0.12 }); // chassis
  S.box(1.92, 0.62, 1.5, 0, 1.32, 0.55, paint, { r: 0.2, seg: 2 }); // cab
  S.box(1.84, 0.4, 0.8, 0, 1.0, 1.55, paint, { r: 0.1 }); // bonnet
  S.box(1.7, 0.36, 0.06, 0, 1.46, 1.27, glass, { r: 0, rx: -0.3, wobble: 0 });
  S.box(1.7, 0.36, 0.06, 0, 1.46, -0.15, glass, { r: 0, wobble: 0 });
  S.box(1.86, 0.1, 1.5, 0, 1.06, -1.2, paint, { r: 0.04 }); // bed floor
  for (const sx of [-1, 1]) {
    S.box(0.1, 0.5, 1.6, sx * 0.93, 1.34, -1.2, paint, { r: 0.04 }); // bed sides
    S.box(0.06, 0.34, 1.1, sx * 0.97, 1.34, 0.55, glass, { r: 0, wobble: 0 });
    S.box(0.08, 0.7, 0.08, sx * 0.7, 1.5, -0.55, chrome, { r: 0.02 }); // roll bar
    S.box(0.1, 0.5, 0.1, sx * 0.55, 0.62, 2.12, chrome, { r: 0.03 }); // bull bar
    S.ball(0.22, sx * 0.62, 0.96, 1.98, cream, { detail: 1, sz: 0.5 });
    L.box(0.28, 0.28, 0.06, sx * 0.62, 0.96, 2.05, glow(0xfff0c0, 2.4), { r: 0, jitter: 0 });
    tail(L, sx * 0.78, 1.0, -1.97, 0.26, 0.24);
  }
  S.box(1.8, 0.5, 0.1, 0, 1.34, -1.95, paint, { r: 0.04 }); // tailgate
  S.box(1.1, 0.08, 0.08, 0, 1.55, -0.55, chrome, { r: 0.02 });
  S.box(1.1, 0.1, 0.1, 0, 0.62, 2.12, chrome, { r: 0.03 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.ball(0.52, sx * 0.88, 0.6, sz * WHEEL.z, dark, { detail: 1, sx: 0.28, sy: 0.9, sz: 1.05 });
  S.box(1.94, 0.18, 0.24, 0, 0.62, 2.0, dark, { r: 0.06 });
}

const MODELS = [dart, pip, bruno, marlin, ox];

/** model = car id 0..4. Returns { body, lights } geometries. */
export function buildCar({ paint = 0x3a7de0, lite = false, model = 0 } = {}) {
  const S = new Builder({ seed: 7 + model, jitter: 0.02, wobble: 0.012 });
  const L = new Builder({ seed: 8, jitter: 0, wobble: 0, bake: false });
  S.lite = lite;
  (MODELS[model] ?? dart)(S, L, paint);
  return { body: S.build(), lights: L.build() };
}

/**
 * A car from a model file, or `null` (then the caller builds the code model with buildCar): `game/assets/cars/<name>.glb`,
 * on the high tier `<name>-hi.glb` first. The loader is imported only here, so a page that never asks for a file never loads it.
 * @param {string} name file name without extension (the car id, or a test name)
 * @param {{ tier: 'high'|'low', materials: Record<string, object> }} o
 */
export async function loadCarModel(name, { tier, materials }) {
  const [{ GLTFLoader }, { loadCarGlb, modelUrls }] = await Promise.all([import('../../vendor/three/addons/loaders/GLTFLoader.js'), import('./carglb.js')]);
  const loader = new GLTFLoader();
  for (const url of modelUrls(new URL('../assets/cars/', import.meta.url), name, tier)) {
    const car = await loadCarGlb(url, materials, (u) => loader.loadAsync(u));
    if (car) return { ...car, url };
  }
  return null;
}
