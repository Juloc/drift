// The other visitors' cars: one body per car (geometry shared per colour), wheels and shadow blobs through the
// shared pool, smoke and skid marks while they drift, and an HTML name label above each (text only, nearest 8).
import * as THREE from '../../vendor/three/three.module.js';
import { buildCar, WHEEL, BLOB } from './carmodel.js';
import { makeClay, makeGlow } from '../core/materials.js';
import { X, HEAD } from './space.js';

const bodyCache = new Map();
function partsFor(hue, lite, model) {
  const key = `${hue}:${model}`;
  if (!bodyCache.has(key)) bodyCache.set(key, buildCar({ paint: new THREE.Color().setHSL((hue * 15) / 360, 0.62, 0.52).getHex(), lite, model }));
  return bodyCache.get(key);
}
export const paintFor = (hue, lite, model = 0) => partsFor(hue, lite, model);

export class Remotes {
  constructor({ scene, pool, smoke, skids, camera, tagsEl, lite }) {
    Object.assign(this, { scene, pool, smoke, skids, camera, tagsEl, lite });
    this.cars = new Map();
    this.clay = makeClay(); this.glow = makeGlow();
    this.frame = 0;
    this.v = new THREE.Vector3();
  }
  /** Draw the cars in `list` (from WorldClient.sample); `roster` is Map(id -> { name, car, hue }). Call between pool.begin() and pool.end(). */
  update(list, roster, dt) {
    this.frame++;
    const seen = new Set();
    for (const o of list) {
      const info = roster.get(o.id);
      if (!info) continue;
      seen.add(o.id);
      let rc = this.cars.get(o.id);
      if (!rc || rc.hue !== info.hue || rc.model !== info.car) {
        if (rc) this.scene.remove(rc.group);
        const parts = partsFor(info.hue, this.lite, info.car);
        const group = new THREE.Group();
        group.add(new THREE.Mesh(parts.body, this.clay), new THREE.Mesh(parts.lights, this.glow));
        this.scene.add(group);
        const label = rc?.label ?? Object.assign(document.createElement('div'), { className: 'tag' });
        if (!rc) this.tagsEl.append(label);
        label.textContent = info.name;
        rc = { group, label, hue: info.hue, model: info.car, spin: 0 };
        this.cars.set(o.id, rc);
      }
      const g = rc.group;
      const roll = Math.max(-0.08, Math.min(0.08, -(o.vf * o.vf * Math.tan(o.steer) * 0.0035) / 40));
      g.position.set(X(o.x), 0, o.z);
      g.rotation.set(0, HEAD(o.h), roll, 'YXZ');
      g.updateMatrix();
      rc.spin += (o.vf * dt) / WHEEL.r;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.pool.wheel(g.matrix, sx * WHEEL.x, sz * WHEEL.z, sz > 0 ? -o.steer : 0, rc.spin);
      this.pool.blob(X(o.x), o.z, BLOB[rc.model]?.[0] ?? 1.25, BLOB[rc.model]?.[1] ?? 2.1, HEAD(o.h));
      const drifting = (o.flags & 2) !== 0 || (o.flags & 1) !== 0;
      for (let i = 0; i < 2; i++) {
        const wp = this.v.set((i ? 1 : -1) * WHEEL.x, 0, -WHEEL.z).applyMatrix4(g.matrix);
        if (drifting && this.frame % 3 === 0) this.smoke.emit(wp.x, 0.2, wp.z, 0, 0, 0.5);
        this.skids.mark(2 + o.id * 2 + i, wp.x, wp.z, 0, 0, drifting);
      }
      rc.pos = [X(o.x), o.z];
    }
    for (const [id, rc] of this.cars) if (!seen.has(id)) { this.scene.remove(rc.group); rc.label.remove(); this.cars.delete(id); for (let i = 0; i < 2; i++) this.skids.mark(2 + id * 2 + i, 0, 0, 0, 0, false); }
    this.labels();
  }
  /** Take every car away (the lobby is left for a race, or the race for the lobby). */
  clear() {
    for (const rc of this.cars.values()) { this.scene.remove(rc.group); rc.label.remove(); }
    this.cars.clear();
  }
  labels() {
    const cam = this.camera, list = [];
    for (const rc of this.cars.values()) {
      this.v.set(rc.pos[0], 2.3, rc.pos[1]);
      const dist = this.v.distanceTo(cam.position);
      this.v.project(cam);
      list.push({ rc, dist, ok: this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && dist < 90, x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight });
    }
    list.sort((a, b) => a.dist - b.dist);
    list.forEach((l, i) => {
      const show = l.ok && i < 8;
      l.rc.label.hidden = !show;
      if (show) l.rc.label.style.transform = `translate(-50%, -100%) translate(${l.x.toFixed(0)}px, ${l.y.toFixed(0)}px)`;
    });
  }
}
