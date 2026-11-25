// Geometry builder: collects many small primitives (with a transform and a colour each)
// and merges them into ONE BufferGeometry with vertex colours. This keeps the whole static
// town at a handful of draw calls, and it is where the "handmade" irregularity is added:
// a little colour jitter per part, a slight wobble of the surface, darker feet near the ground.

import * as THREE from '../../vendor/three/three.module.js';
import { roundedBox } from './roundbox.js';
import { mulberry32, noise3, smoothstep } from './rng.js';
import { bakeGroup } from './bake.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
const ONE = new THREE.Vector3(1, 1, 1);

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

/** Local transform helper: position, Euler rotation, scale. */
export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** Colour with brightness above 1 for things that glow (windows, bulbs, neon). */
export function glow(hex, k = 1.6) {
  return new THREE.Color(hex).multiplyScalar(k);
}

export class Builder {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {number} o.jitter  lightness jitter per part (0 = exact colours)
   * @param {number} o.wobble  surface wobble in world units
   * @param {number|null} o.aoBase  ground height for the soft dark "feet", null = off
   * @param {boolean} o.sway  write a per-vertex sway weight (trees, flags)
   * @param {boolean} o.bake  darken corners and seams in the colours when build() runs (see
   *   bake.js). Default: on for clay builders, off for glow builders (jitter 0 and wobble 0),
   *   whose bright colours must stay bright.
   */
  constructor({ seed = 1, jitter = 0.035, wobble = 0.025, aoBase = null, sway = false, bake } = {}) {
    this.bakeAO = bake ?? (jitter > 0 || wobble > 0);
    this.baked = false;
    /** Phone tier: every primitive gets fewer triangles (set by the town on its builders). */
    this.lite = false;
    this.rng = mulberry32(seed);
    this.jitter = jitter;
    this.wobble = wobble;
    this.aoBase = aoBase;
    this.sway = sway;
    this.stack = [new THREE.Matrix4()];
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.swy = [];
    this.idx = [];
    this.count = 0;
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }
  push(m) {
    this.stack.push(new THREE.Matrix4().multiplyMatrices(this.top, m));
    return this;
  }
  /** Shorthand: place a sub-model at x,y,z turned by heading ry. */
  at(x, y, z, ry = 0, s = 1) {
    return this.push(trs(x, y, z, 0, ry, 0, s));
  }
  pop() {
    this.stack.pop();
    return this;
  }

  /**
   * Add a geometry.
   * opts: m (local Matrix4), jitter (override), wobble (override), ao (false = no dark feet),
   *       sway (number or fn(localY, localX) -> weight), keepColors (use the geometry's own colours)
   */
  add(geo, color, opts = {}) {
    const m = opts.m ? _m.multiplyMatrices(this.top, opts.m) : _m.copy(this.top);
    _nm.getNormalMatrix(m);
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const gc = opts.keepColors ? geo.attributes.color : null;
    const base = this.count;

    _c.set(color ?? 0xffffff);
    const jit = opts.jitter ?? this.jitter;
    if (jit > 0 && !gc) {
      // keep bright (glowing) colours untouched; HSL only makes sense below 1
      if (Math.max(_c.r, _c.g, _c.b) <= 1) {
        _c.getHSL(_hsl);
        _c.setHSL(
          _hsl.h + (this.rng() - 0.5) * 0.012,
          THREE.MathUtils.clamp(_hsl.s + (this.rng() - 0.5) * 0.05, 0, 1),
          THREE.MathUtils.clamp(_hsl.l + (this.rng() - 0.5) * 2 * jit, 0, 1),
        );
      }
    }
    const wob = opts.wobble ?? this.wobble;
    const ao = opts.ao === false ? null : this.aoBase;

    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      const localY = _v.y, localX = _v.x;
      _v.applyMatrix4(m);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      if (wob > 0) {
        const k = noise3(_v.x * 0.9, _v.y * 0.9, _v.z * 0.9) * wob;
        _v.addScaledVector(_n, k);
      }
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      let r = _c.r, g = _c.g, b = _c.b;
      if (gc) {
        r = gc.getX(i); g = gc.getY(i); b = gc.getZ(i);
      }
      if (ao !== null) {
        const k = 0.74 + 0.26 * smoothstep(ao, ao + 1.5, _v.y);
        r *= k; g *= k; b *= k;
      }
      this.col.push(r, g, b);
      if (this.sway) {
        const s = opts.sway;
        this.swy.push(typeof s === 'function' ? s(localY, localX) : s || 0);
      }
    }
    if (geo.index) {
      const ix = geo.index;
      for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
    this.count += p.count;
    return this;
  }

  // ----- primitives (all centred at x,y,z unless noted) -----

  /** Rounded box. r = edge radius, opts: rx, ry, rz, seg */
  box(w, h, d, x, y, z, color, opts = {}) {
    const r = Math.min(this.lite ? Math.min(opts.r ?? 0.1, 0.035) : opts.r ?? 0.1, w / 2, h / 2, d / 2);
    // small or thin parts get fewer triangles: nobody sees the difference at toy scale
    const big = Math.max(w, h, d), thin = Math.min(w, h, d);
    const plain = r <= 0.035 || big < 0.45;
    const seg = opts.seg ?? (big > 2.4 && thin > 0.3 ? 2 : 1);
    const key = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${seg}:${r.toFixed(3)}:${plain}`;
    const geo = cached(key, () => (plain ? new THREE.BoxGeometry(w, h, d) : roundedBox(w, h, d, seg, r)));
    return this.add(geo, color, { ...opts, m: trs(x, y, z, opts.rx, opts.ry, opts.rz) });
  }

  /** Cylinder / tapered cylinder along y. opts: seg, rx, ry, rz */
  cyl(rTop, rBot, h, x, y, z, color, opts = {}) {
    const seg = this.lite ? Math.min(opts.seg ?? 14, 8) : opts.seg ?? 14;
    const key = `cy:${rTop.toFixed(3)}:${rBot.toFixed(3)}:${h.toFixed(3)}:${seg}`;
    const geo = cached(key, () => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1));
    return this.add(geo, color, { ...opts, m: trs(x, y, z, opts.rx, opts.ry, opts.rz) });
  }

  cone(r, h, x, y, z, color, opts = {}) {
    const seg = this.lite ? Math.min(opts.seg ?? 12, 8) : opts.seg ?? 12;
    const geo = cached(`co:${r.toFixed(3)}:${h.toFixed(3)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));
    return this.add(geo, color, { ...opts, m: trs(x, y, z, opts.rx, opts.ry, opts.rz) });
  }

  /** Soft blob (icosphere). opts: detail, sx, sy, sz */
  ball(r, x, y, z, color, opts = {}) {
    const detail = this.lite && r < 1 ? 0 : opts.detail ?? 1;
    const geo = cached(`ic:${detail}`, () => smoothIco(detail));
    return this.add(geo, color, {
      ...opts,
      m: trs(x, y, z, opts.rx, opts.ry, opts.rz, r * (opts.sx ?? 1), r * (opts.sy ?? 1), r * (opts.sz ?? 1)),
    });
  }

  /** Capsule along y (total height h, radius r). */
  capsule(r, h, x, y, z, color, opts = {}) {
    const geo = cached(`cap:${r.toFixed(3)}:${h.toFixed(3)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 4, 10));
    return this.add(geo, color, { ...opts, m: trs(x, y, z, opts.rx, opts.ry, opts.rz) });
  }

  /** Gable roof / pediment: triangle of width w and height h, extruded along z by d. Base centre at x,y,z. */
  gable(w, h, d, x, y, z, color, opts = {}) {
    const bevel = this.lite ? 0 : opts.bevel ?? 0.07;
    const key = `ga:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${bevel}`;
    const geo = cached(key, () => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0);
      s.lineTo(w / 2, 0);
      s.lineTo(0, h);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {
        depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1,
      });
      g.translate(0, 0, -d / 2);
      return g;
    });
    return this.add(geo, color, { ...opts, m: trs(x, y, z, opts.rx, opts.ry, opts.rz) });
  }

  /** Any flat outline (array of [x, y]) extruded along z by `depth`, centred in z. */
  prism(pts, depth, x, y, z, color, opts = {}) {
    const bevel = this.lite ? 0 : opts.bevel ?? 0.04;
    const key = `pr:${pts.flat().map((n) => n.toFixed(2)).join(',')}:${depth}:${bevel}`;
    const geo = cached(key, () => {
      const s = new THREE.Shape();
      pts.forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py)));
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {
        depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1,
      });
      g.translate(0, 0, -depth / 2);
      return g;
    });
    return this.add(geo, color, { ...opts, m: trs(x, y, z, opts.rx, opts.ry, opts.rz) });
  }

  /** Flat disc lying on the ground plane (thin cylinder). */
  disc(r, x, y, z, color, opts = {}) {
    return this.cyl(r, r, opts.h ?? 0.06, x, y, z, color, { seg: opts.seg ?? 20, ...opts });
  }

  /** Merge everything into one geometry. */
  build() {
    if (this.bakeAO) bakeGroup([this]); // alone, unless the caller baked a group together before
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.sway) g.setAttribute('sway', new THREE.Float32BufferAttribute(this.swy, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Icosphere with shared vertices (smooth normals), radius 1. */
export function smoothIco(detail) {
  const src = new THREE.IcosahedronGeometry(1, detail);
  const p = src.attributes.position;
  const map = new Map();
  const pos = [];
  const idx = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = pos.length / 3;
      map.set(key, j);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos, 3)); // unit sphere: normal = position
  g.setIndex(idx);
  return g;
}

/**
 * Angular, paper-cut look: displace the corners of a geometry, then give every face its own
 * flat normal. `colorFn(cx, cy, cz, out)` may colour each face by its centre.
 */
export function faceted(geo, displace, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position;
  if (displace) {
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      displace(_v);
      p.setXYZ(i, _v.x, _v.y, _v.z);
    }
  }
  g.computeVertexNormals();
  if (colorFn) {
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      colorFn(cx, cy, cz, _c);
      for (let k = 0; k < 3; k++) col.set([_c.r, _c.g, _c.b], (i + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

export { ONE };
