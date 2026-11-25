// The cars of the game in the look of the stage: one RX-7 model (docs/CAR-MODELS.md) is loaded once per look, patched with the painted car style (paint.js), and every car on the road
// (yours, the other visitors', the practice bot) is a clone that shares the geometry and the materials and has only its own paint. When the model file cannot be used the code S15 is built
// instead (and again for every car: it is cheap). Nothing here knows about the network or the rules.
import { dressCar } from '../carfx.js';
import * as THREE from '../../../vendor/three/three.module.js';
import { carMaker } from './stage.js';
import { paintCar } from './paint.js';
import { buildS15 } from '../s15.js';

const MAGIC = 0x123456;   // the colour the template is made in, so that the paint material (or a copy a file's texture made of it) is found by its colour
export const CAR_DIMS = { wheelX: 0.8, wheelZ: 1.27 };   // the model's wheels (the S15's numbers, which the RX-7 file follows)

export class Fleet {
  /** @param stage createStage()'s result  @param {{ model?: string }} o the model file's name (data in game/assets/cars/) */
  constructor(stage, { model = 'rx7', fx = {} } = {}) { this.stage = stage; this.model = model; this.fx = fx; this.make = carMaker(stage); this.tpl = null; this.uniforms = null; this.file = false; this.url = null; }
  /** Loads the model (or builds the code car); call again after the stage's look changed. */
  async load() {
    const { stage } = this;
    this.tpl = await this.make(MAGIC, { model: this.model, kit: false });
    this.file = !!this.tpl.url; this.url = this.tpl.url ?? null;
    if (this.file) dressCar(this.tpl.group, this.fx, { lite: stage.carTier !== 'high' });   // underbody, contact shadow, headlight pool: every copy has them
    this.uniforms = paintCar(this.tpl.group, stage.sun, stage.look.car);
    this.paintMat = this.tpl.materials?.paint ?? null;
    return this;
  }
  /** A car with its own paint: { group, setWheels(steer, spin), paintMaterials, uniforms (paint.js: uBase) }. */
  spawn(colour) {
    const t = this.tpl, c = new THREE.Color(colour);
    if (!this.file) {   // the code car: built again (cheap) and patched like the template
      const car = buildS15({ paint: c.getHex(), kit: false, tier: this.stage.carTier, env: this.stage.env });
      return { group: car.group, setWheels: car.setWheels, paintMaterials: [car.materials.paint], uniforms: paintCar(car.group, this.stage.sun, this.stage.look.car) };
    }
    const group = t.group.clone(true), mine = new Map(), src = this.paintMat;
    group.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (m) => {
        if (!m || !(m === src || (m.isMeshStandardMaterial && m.color && m.color.getHex() === MAGIC))) return m;
        if (!mine.has(m)) { const p = m.clone(); p.color.copy(c); p.onBeforeCompile = m.onBeforeCompile; p.customProgramCacheKey = m.customProgramCacheKey; mine.set(m, p); }
        return mine.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
    const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => group.getObjectByName(n + '_pivot')).filter(Boolean).map((pivot, i) => ({ pivot, spin: pivot.children[0], front: i < 2 }));
    const setWheels = (steer, spin) => { for (const w of wheels) { w.pivot.rotation.y = w.front ? -steer : 0; w.spin.rotation.x = spin; } };
    return { group, setWheels, paintMaterials: [...mine.values()], uniforms: this.uniforms };
  }
  /** Sets the paint of a spawned car (a colour as a number, string or THREE.Color), darkened by `dirt` 0..1 (damage). */
  static colour(car, colour, dark = 0) { for (const p of car.paintMaterials) p.color.set(colour).multiplyScalar(1 - 0.5 * dark); }
  dispose() { this.tpl?.group.traverse((o) => o.geometry?.dispose?.()); }
}
