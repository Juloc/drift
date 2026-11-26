// The other visitors' cars: near ones are clones of the look's car model in their colour (view/look/fleet.js), far ones (the world's interest areas) a light clay body without wheels or
// smoke; shadow blobs through the shared pool, smoke and skid marks of the stage while they drift (on the road's drawn height), and an HTML name label above each (text only, nearest 8).
import * as THREE from '../../vendor/three/three.module.js';
import { icon } from './icons.js';
import { buildCar } from './carmodel.js';
import { makeClay } from '../core/materials.js';
import { Fleet } from './look/fleet.js';
import { makePose, settle, wheelPoints, heightSurface } from '../sim/carpose.js';
import { X, HEAD } from './space.js';

const WHEEL_R = 0.358, BLOB = [1.15, 2.3];
const farCache = new Map();
const farBody = (hue, model) => { const k = `${hue}:${model}`; if (!farCache.has(k)) farCache.set(k, buildCar({ paint: hueColour(hue).getHex(), lite: true, model }).body); return farCache.get(k); };
/** The garage's hue index (0..23, steps of 15 degrees) as the paint of a car. */
/** The garage's paint index as a colour: 0..23 hues (steps of 15 degrees), 24 white, 25 black, 26 silver (anything else: a hue by its remainder). */
export const PAINTS = { 24: '#e6e1d8', 25: '#18181d', 26: '#b9bec8' };
export const hueColour = (hue) => PAINTS[hue] ? new THREE.Color(PAINTS[hue]) : new THREE.Color().setHSL(((hue * 15) % 360) / 360, 0.62, 0.42);

export class Remotes {
  /** @param {{ stage, fleet, pool, camera, tagsEl, glowPool, glowOf, glowBoost, maxNear? }} o  (`fleet` may be swapped after another look was loaded) */
  constructor({ scene, stage, fleet, pool, camera, tagsEl, glowPool, glowOf, glowBoost, maxNear = 6, surface = null }) {
    Object.assign(this, { scene, stage, fleet, pool, camera, tagsEl, glowPool, glowOf, glowBoost, maxNear });
    // the road's surface (sim axes: (x, z, out) -> out.y, gx, gz); the game passes the track's when the map has one, else the drawn height field's
    this.surface = surface ?? heightSurface((x, z) => this.stage.field.groundY(x, z));
    this.s = { y: 0, gx: 0, gz: 0 };
    this.cars = new Map();
    this.clay = makeClay();
    this.frame = 0;
    this.v = new THREE.Vector3();
  }
  /** Draw the cars in `list` (from WorldClient.sample); `roster` is Map(id -> { name, car, hue }). Call between pool.begin() and pool.end(). */
  update(list, roster, dt) {
    this.frame++;
    const seen = new Set(), { smoke, skids } = this.stage;
    let near = 0;
    for (const o of list) {
      const info = roster.get(o.id);
      if (!info) continue;
      seen.add(o.id);
      let rc = this.cars.get(o.id);
      const far = o.far === true || (++near > this.maxNear);   // a far car: the light clay body, no lamps, no wheels, no smoke (docs/PLAN-0.2.md step 3a)
      if (!rc || rc.hue !== info.hue || rc.model !== info.car || rc.far !== far || rc.fleet !== this.fleet) {
        if (rc) this.scene.remove(rc.group);
        let group, car = null;
        if (far) group = new THREE.Mesh(farBody(info.hue, info.car), this.clay);
        else { car = this.fleet.spawn(hueColour(info.hue)); group = car.group; }
        this.scene.add(group);
        const label = rc?.label ?? Object.assign(document.createElement('div'), { className: 'tag' });
        if (!rc) this.tagsEl.append(label);
        label.textContent = info.name;
        rc = { group, car, label, hue: info.hue, model: info.car, spin: rc?.spin ?? 0, far, fleet: this.fleet, pose: rc?.pose ?? makePose() };
        this.cars.set(o.id, rc);
      }
      // on its four wheel points on the road (sim/carpose.js), the body leaning in the bend as far as its speed and steering say (the frame has no acceleration)
      const g = rc.group, W = wheelPoints(this.fleet?.dims), p = settle(rc.pose, this.surface, o.x, o.z, o.h, W, dt, { side: (o.vf * o.vf * Math.tan(o.steer)) / 40 }), gy = p.y;
      Fleet.place(rc.car ?? g, p);
      rc.pos = [X(o.x), o.z, gy];
      this.pool.blob(X(o.x), o.z, BLOB[0], BLOB[1], HEAD(o.h), gy);
      if (far) continue;
      rc.spin += (o.vf * dt) / WHEEL_R;
      rc.car.setWheels(o.steer, rc.spin);
      const gl = this.glowOf?.(o.id);
      if (gl !== undefined && gl >= 0) this.glowPool.add(X(o.x), o.z, HEAD(o.h), gl, this.glowBoost?.() ?? 1, gy, -p.pitch);   // on the road's height and slope (it lay at height 0: under a hill or floating)
      const drifting = (o.flags & 2) !== 0 || (o.flags & 1) !== 0;
      for (let i = 0; i < 2; i++) {   // the rear wheels as settled: right (i 0), left (i 1); each on the surface under it
        const w = p.wheels[i ? 2 : 3], wx = X(w.x);
        if (drifting && this.frame % 3 === 0) smoke.emit(wx, 0.35 + w.y, w.z, 0, 0, 0.5);
        skids.mark(2 + o.id * 2 + i, wx, w.z, 0, 0, drifting, w.y, -w.gx, w.gz);
      }
    }
    for (const [id, rc] of this.cars) if (!seen.has(id)) { this.scene.remove(rc.group); rc.label.remove(); this.cars.delete(id); for (let i = 0; i < 2; i++) skids.mark(2 + id * 2 + i, 0, 0, 0, 0, false); }
    this.labels();
  }
  /** A fixed symbol over a car for three seconds (never text from a player). */
  emote(id, symbol) {
    const rc = this.cars.get(id);
    if (!rc || typeof symbol !== 'string') return;
    rc.label.querySelector('.emo')?.remove();
    const span = Object.assign(document.createElement('span'), { className: 'emo' });
    span.append(icon(symbol, 1.6));   // `symbol` is the name of one of our own icons
    rc.label.append(span);
    setTimeout(() => span.remove(), 3000);
  }
  /** Take every car away (the lobby is left for a race, or the race for the lobby). */
  clear() {
    for (const rc of this.cars.values()) { this.scene.remove(rc.group); rc.label.remove(); }
    this.cars.clear();
  }
  labels() {
    const cam = this.camera, list = [];
    for (const rc of this.cars.values()) {
      this.v.set(rc.pos[0], 2.3 + rc.pos[2], rc.pos[1]);
      const dist = this.v.distanceTo(cam.position);
      this.v.project(cam);
      list.push({ rc, dist, ok: this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && dist < 90, x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight });
    }
    list.sort((a, b) => a.dist - b.dist);
    list.forEach((l, i) => {
      const show = l.ok && !l.rc.far && i < 8;
      l.rc.label.hidden = !show;
      if (show) l.rc.label.style.transform = `translate(-50%, -100%) translate(${l.x.toFixed(0)}px, ${l.y.toFixed(0)}px)`;
    });
  }
}
