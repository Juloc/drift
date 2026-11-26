// The road as ONE source of height, slope and side tilt (design: drift-mockups/DESIGN-PHYSIK-STRECKE.md, sections 2.2 and 3). Pure functions, no DOM: the simulation, the
// drawing, the camera, the tyre marks and the checking tools all ask here.
//   buildTrack(spec)        control data (what an editor touches) -> the baked channels every `ds` metres, solved inside the limits
//   bakeTrack(samples)      channels from samples as they are (no solving: for a road that already exists, and for loading a map file)
//   surfaceAt(track, x, z)  { y, gx, gz, s, lat, kind }: height and gradient of the surface under a point
//   frameAt(track, s, lat)  the road frame: point, direction along, direction across, normal
//   checkTrack(track)       every limit of the design at every sample: { ok, problems, worst }
// Axes are the simulation's: x and z on the plan, heading grows to the right, forward = (sin h, cos h), right = (cos h, -sin h). `lat` is metres to the right of the
// centre line, `bank` is height per metre to the right, curvature `k` is positive in a right-hand bend.

export const LIMITS = {
  ds: 2,
  hwMin: 3.5, hwMax: 7, hwDefault: 4.5, hwChange: 0.05,            // half width; it changes by at most 0.5 m in 10 m
  rMin: 15, rInner: 9, rRail: 6, shoulder: 1.5,                    // radius of the centre line, of the inner edge, of the rail's line (hw + shoulder)
  transition: 12,                                                  // the curvature of the tightest bend builds up over at least this many metres
  grade: 0.10, gradeHairpin: 0.08, hairpinK: 1 / 40,               // along the centre line; in a bend tighter than 40 m
  slope: 0.12, slopeBoth: 0.13,                                    // anywhere on the surface: along, and along and across together
  crestR: 80, crestG: 0.30, sagR: 50, sagG: 0.50,                  // vertical curves: radius, and vRef^2 * kv in g
  bankIn: 0.08, bankOut: 0.02,                                     // side tilt towards the inside of the bend, and away from it
  twist: 0.002, wheelPlane: 0.03,                                  // the tilt changes by 1 % in 5 m; four wheel points (2.6 m by 1.6 m) lie within 3 cm of a plane
  branch: 18, branchArc: 60,                                       // two branches of the road (further apart than this along it) keep this distance on the plan
  plazaFlat: 25, plazaStep: 0.01,                                  // the first metres out of the plaza are level at the plaza's height
  step: 0.12, bound: 1500, surface: 0.01,
  G: 9.81, vTop: 40, aLat: 9, aAcc: 5, aBrake: 9, vScale: 1.1,     // for the reference speed (the fastest car, by arithmetic: no bot)
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A polyline resampled at even steps of about `ds` along its length: { pts, ds } (the step is adjusted so that the last point is the line's end). */
export function resample(pts, ds) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1], n = Math.max(2, Math.round(len / ds)), step = len / n, out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(len, i * step);
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const t = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return { pts: out, ds: step };
}

/** Catmull-Rom (centripetal) through the control points, as a dense polyline. */
function spline(ctrl) {
  const P = ctrl.map((c) => [c.x, c.z]), out = [];
  const at = (i) => P[clamp(i, 0, P.length - 1)];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const d = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
    for (let k = 0; k < steps; k++) {
      const t = t1 + ((t2 - t1) * k) / steps, q = [0, 0];
      for (let c = 0; c < 2; c++) {
        const L = (a, b, ta, tb) => (ta === tb ? a : ((tb - t) * a + (t - ta) * b) / (tb - ta));
        const a1 = L(p0[c], p1[c], t0, t1), a2 = L(p1[c], p2[c], t1, t2), a3 = L(p2[c], p3[c], t2, t3);
        const b1 = L(a1, a2, t0, t2), b2 = L(a2, a3, t1, t3);
        q[c] = L(b1, b2, t1, t2);
      }
      out.push(q);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

const headings = (pts, n) => { const h = new Float64Array(n); for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; h[i] = Math.atan2(b[0] - a[0], b[1] - a[1]); } return h; };
const curvature = (head, n, ds) => { const k = new Float64Array(n); for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); k[i] = b > a ? wrap(head[b] - head[a]) / ((b - a) * ds) : 0; } return k; };

/** The reference speed along the road: the bend's limit, then a pass forwards (accelerating) and one backwards (braking), times `vScale`. */
function refSpeed(k, n, ds, L) {
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(L.vTop, Math.sqrt(L.aLat / Math.max(1e-6, Math.abs(k[i]))));
  v[0] = Math.min(v[0], 8);   // from the plaza: a rolling start
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * L.aAcc * ds));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * L.aBrake * ds));
  for (let i = 0; i < n; i++) v[i] *= L.vScale;
  return v;
}

/**
 * The channels of a road from samples at even steps: { pts: [[x, z], ...], ds, y: [...], bank: [...], hwL, hwR (numbers or arrays), closed, plaza: { pts, y } }.
 * Nothing is solved or limited here. Also builds the grid that finds the nearest piece of the centre line.
 */
export function bakeTrack(S, limits = LIMITS) {
  const n = S.pts.length, ds = S.ds;
  const arr = (v, d) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = Array.isArray(v) || ArrayBuffer.isView(v) ? v[i] : (v ?? d); return a; };
  const x = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = S.pts[i][0]; z[i] = S.pts[i][1]; }
  const y = arr(S.y, 0), bank = arr(S.bank, 0), hwL = arr(S.hwL ?? S.hw, limits.hwDefault), hwR = arr(S.hwR ?? S.hw, limits.hwDefault);
  // direction and curvature of the smooth centre line at the samples (the spline's first and second derivative there)
  const head = new Float64Array(n), k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const tx = (smp(x, i + 1, n) - smp(x, i - 1, n)) / 2, tz = (smp(z, i + 1, n) - smp(z, i - 1, n)) / 2, ax = smp(x, i + 1, n) - 2 * x[i] + smp(x, i - 1, n), az = smp(z, i + 1, n) - 2 * z[i] + smp(z, i - 1, n);
    head[i] = Math.atan2(tx, tz); k[i] = (ax * tz - az * tx) / Math.max(1e-9, Math.hypot(tx, tz) ** 3);
  }
  const diff = (a) => { const d = new Float64Array(n); for (let i = 0; i < n; i++) { const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1); d[i] = (a[q] - a[p]) / ((q - p) * ds); } return d; };
  const grade = diff(y), dbank = diff(bank), kv = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) kv[i] = (y[i + 1] - 2 * y[i] + y[i - 1]) / (ds * ds);
  const track = { version: 2, ds, n, len: (n - 1) * ds, closed: false, x, z, y, bank, dbank, hwL, hwR, head, k, grade, kv, vRef: refSpeed(k, n, ds, limits), plaza: S.plaza ?? null, limits };
  // the grid: cells of 8 m, each with the pieces (sample i to i + 1) that start in it
  const cell = 8, grid = new Map();
  for (let i = 0; i < n - 1; i++) { const key = Math.floor(x[i] / cell) * 65536 + Math.floor(z[i] / cell); let g = grid.get(key); if (!g) grid.set(key, (g = [])); g.push(i); }
  track.cell = cell; track.grid = grid;
  return track;
}

// ---- between the samples everything is one smooth curve: a uniform cubic B-spline over the samples (the centre line, the height, the tilt). It has no corners and no kinks
//      (direction and curvature are continuous), so the surface is smooth in height AND in slope, and the grade and curvature channels are exactly its derivatives at the samples.
//      It passes within millimetres of the samples (a sixth of the second difference), which is what "the samples" mean from here on.
const B = [0, 0, 0, 0], D = [0, 0, 0, 0];
function basis(T, s) {
  const f = clamp(s / T.ds, 0, T.n - 1), i = Math.min(T.n - 2, Math.floor(f)), u = f - i, v = 1 - u;
  B[0] = (v * v * v) / 6; B[1] = (3 * u * u * u - 6 * u * u + 4) / 6; B[2] = (-3 * u * u * u + 3 * u * u + 3 * u + 1) / 6; B[3] = (u * u * u) / 6;
  D[0] = (-v * v) / 2; D[1] = (3 * u * u - 4 * u) / 2; D[2] = (-3 * u * u + 2 * u + 1) / 2; D[3] = (u * u) / 2;
  return i;
}
// a sample by index; one step beyond either end the line goes on straight
const smp = (a, j, n) => (j < 0 ? 2 * a[0] - a[1] : j >= n ? 2 * a[n - 1] - a[n - 2] : a[j]);
const _c = { px: 0, pz: 0, tx: 0, tz: 0 };
function centre(T, s) {
  const i = basis(T, s), n = T.n; let px = 0, pz = 0, dx = 0, dz = 0;
  for (let c = 0; c < 4; c++) { const x = smp(T.x, i - 1 + c, n), z = smp(T.z, i - 1 + c, n); px += B[c] * x; pz += B[c] * z; dx += D[c] * x; dz += D[c] * z; }
  const l = Math.hypot(dx, dz) || 1;
  _c.px = px; _c.pz = pz; _c.tx = dx / l; _c.tz = dz / l;
  return _c;
}
/** A channel at `s` with its derivative along the road, written into `out`: [value, derivative]. */
function chan(T, a, s, out) {
  const i = basis(T, s), n = T.n; let v = 0, d = 0;
  for (let c = 0; c < 4; c++) { const q = smp(a, i - 1 + c, n); v += B[c] * q; d += D[c] * q; }
  out[0] = v; out[1] = d / T.ds;
  return out;
}
const lin = (T, a, s) => { const f = clamp(s / T.ds, 0, T.n - 1), i = Math.min(T.n - 2, Math.floor(f)); return a[i] + (a[i + 1] - a[i]) * (f - i); };

function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The piece of the centre line nearest to a point (by its chord): [index, squared distance]. The grid first, every piece when nothing is near. */
function nearestPiece(T, px, pz) {
  let best = -1, bd = Infinity;
  const tryPiece = (i) => {
    const x1 = T.x[i], z1 = T.z[i], dx = T.x[i + 1] - x1, dz = T.z[i + 1] - z1, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((px - x1) * dx + (pz - z1) * dz) / l2, 0, 1) : 0, ex = px - x1 - dx * t, ez = pz - z1 - dz * t, d = ex * ex + ez * ez;
    if (d < bd) { bd = d; best = i; }
  };
  const cx = Math.floor(px / T.cell), cz = Math.floor(pz / T.cell);
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const g = T.grid.get((cx + a) * 65536 + cz + b); if (g) for (const i of g) tryPiece(i); }
  if (best < 0 || bd > (T.cell * 1.9) ** 2) for (let i = 0; i < T.n - 1; i++) tryPiece(i);   // far from the road (land): the grid's reach is not enough to be sure
  return best;
}

const _v = [0, 0], _w = [0, 0];
/**
 * The surface under a point: `y` the height, `gx`, `gz` its gradient, `s` the distance along the road, `lat` metres to the right of the centre line,
 * `kind`: 'plaza' (inside the plaza's polygon: level), 'road', 'shoulder' (the strip beside the road, the same plane), 'land' (beyond: the height of the shoulder's edge;
 * the land's own shape is the drawing's business). The same input gives the same answer: nothing is remembered between calls.
 */
export function surfaceAt(T, px, pz, out = {}) {
  if (T.plaza && inPoly(T.plaza.pts, px, pz)) { out.y = T.plaza.y; out.gx = 0; out.gz = 0; out.s = 0; out.lat = 0; out.kind = 'plaza'; return out; }
  const i = nearestPiece(T, px, pz);
  const x1 = T.x[i], z1 = T.z[i], dx = T.x[i + 1] - x1, dz = T.z[i + 1] - z1, l2 = dx * dx + dz * dz;
  let s = (i + (l2 > 0 ? clamp(((px - x1) * dx + (pz - z1) * dz) / l2, 0, 1) : 0)) * T.ds, c = centre(T, s), lat = 0, k = 0;
  // from the chord to the smooth centre line: a few steps along it until the point lies exactly beside it
  for (let it = 0; it < 4; it++) {
    lat = (px - c.px) * c.tz - (pz - c.pz) * c.tx; k = lin(T, T.k, s);
    const along = (px - c.px) * c.tx + (pz - c.pz) * c.tz;
    if (Math.abs(along) < 1e-7) break;
    s = clamp(s + along / Math.max(0.3, 1 - lat * k), 0, T.len); c = centre(T, s);
  }
  lat = (px - c.px) * c.tz - (pz - c.pz) * c.tx; k = lin(T, T.k, s);
  const hwL = lin(T, T.hwL, s), hwR = lin(T, T.hwR, s), sh = T.limits.shoulder;
  const kind = lat >= -hwL && lat <= hwR ? 'road' : lat >= -hwL - sh && lat <= hwR + sh ? 'shoulder' : 'land';
  const latc = clamp(lat, -hwL - sh, hwR + sh);
  const [yc, grade] = chan(T, T.y, s, _v), [bank, dbank] = chan(T, T.bank, s, _w);
  const gs = (grade + latc * dbank) / Math.max(0.3, 1 - latc * k), gr = kind === 'land' ? 0 : bank;
  out.y = yc + latc * bank; out.gx = gs * c.tx + gr * c.tz; out.gz = gs * c.tz - gr * c.tx; out.s = s; out.lat = lat; out.kind = kind;
  return out;
}

/** The road frame at `s`, `lat` metres to the right: the point, and unit vectors along the road (`t`), across to the right (`r`) and off the surface (`n`). */
export function frameAt(T, s, lat = 0) {
  const c = centre(T, s), k = lin(T, T.k, s);
  const [yc, grade] = chan(T, T.y, s, _v), [bank, dbank] = chan(T, T.bank, s, _w);
  const gs = (grade + lat * dbank) / Math.max(0.3, 1 - lat * k);
  const tl = Math.hypot(1, gs), rl = Math.hypot(1, bank), gx = gs * c.tx + bank * c.tz, gz = gs * c.tz - bank * c.tx, nl = Math.hypot(gx, 1, gz);
  return { x: c.px + c.tz * lat, y: yc + lat * bank, z: c.pz - c.tx * lat, head: Math.atan2(c.tx, c.tz), grade: gs, bank,
    t: [c.tx / tl, gs / tl, c.tz / tl], r: [c.tz / rl, bank / rl, -c.tx / rl], n: [-gx / nl, 1 / nl, -gz / nl] };
}

// ---------------------------------------------------------------- building a road inside the limits
/**
 * Control data -> a baked road. spec: { ctrl: [{ x, z, y?, bank?, hw? }, ...], plaza: { pts: [[x, z], ...] } }.
 * The line through the control points is smoothed where it bends too tightly or too suddenly; the side tilt is proposed from the bend (the inside lower) and limited; the heights
 * hit the control heights as far as the limits on grade and on crests and dips allow (where they do not, `checkTrack` says where and by how much).
 */
export function buildTrack(spec, limits = LIMITS) {
  const L = limits, ctrl = spec.ctrl;
  // 1. the line: the spline, then relaxed until no bend is tighter than the limit and no bend begins too suddenly
  let { pts, ds } = resample(spline(ctrl), L.ds);
  const kMax = (1 / L.rMin) * 0.97, dkMax = (1 / L.rMin / L.transition) * 0.95;
  const flatN = spec.plaza ? Math.ceil(L.plazaFlat / ds) + 1 : 0;   // the mouth of the plaza stays as the control points put it (straight)
  for (let it = 0; it < 6000; it++) {
    const n = pts.length, k = curvature(headings(pts, n), n, ds);
    const bad = new Uint8Array(n); let any = false;
    for (let i = 1; i < n - 1; i++) if (Math.abs(k[i]) > kMax || Math.abs(k[i + 1] - k[i]) / ds > dkMax) { any = true; for (let j = Math.max(1, i - 3); j <= Math.min(n - 2, i + 4); j++) bad[j] = 1; }
    if (!any) break;
    const next = pts.map((p) => p.slice());
    for (let i = Math.max(1, flatN); i < n - 1; i++) if (bad[i]) { next[i][0] = pts[i][0] + 0.5 * ((pts[i - 1][0] + pts[i + 1][0]) / 2 - pts[i][0]); next[i][1] = pts[i][1] + 0.5 * ((pts[i - 1][1] + pts[i + 1][1]) / 2 - pts[i][1]); }
    pts = next;
    if (it % 10 === 9) ({ pts, ds } = resample(pts, L.ds));
  }
  ({ pts, ds } = resample(pts, L.ds));
  // a few light passes over the whole line: the curvature is then free of the noise of the sampling (the bends get a little wider, never tighter)
  for (let r = 0; r < 3; r++) {
    for (let pass = 0; pass < 4; pass++) { const next = pts.map((p) => p.slice()); for (let i = Math.max(1, flatN); i < pts.length - 1; i++) { next[i][0] = (pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4; next[i][1] = (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4; } pts = next; }
    ({ pts, ds } = resample(pts, L.ds));
  }
  const n = pts.length, head = headings(pts, n), k = curvature(head, n, ds);
  // where each control point is along the line now
  const at = ctrl.map((c) => { let b = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = (pts[i][0] - c.x) ** 2 + (pts[i][1] - c.z) ** 2; if (d < bd) { bd = d; b = i; } } return b; });
  at[0] = 0; at[at.length - 1] = n - 1;
  const interp = (key, dflt) => {   // a channel given at some control points: straight between them, the default where nobody said anything
    const a = new Float64Array(n).fill(dflt), given = ctrl.map((c, j) => [at[j], c[key]]).filter((g) => g[1] !== undefined);
    if (!given.length) return a;
    for (let i = 0; i < n; i++) { let p = given[0], q = given[given.length - 1]; for (const g of given) { if (g[0] <= i) p = g; if (g[0] >= i) { q = g; break; } } a[i] = q[0] === p[0] ? p[1] : p[1] + ((q[1] - p[1]) * (i - p[0])) / (q[0] - p[0]); }
    return a;
  };
  // 2. the width
  const hw = interp('hw', L.hwDefault);
  for (let i = 0; i < n; i++) hw[i] = clamp(hw[i], L.hwMin, L.hwMax);
  for (let i = 1; i < n; i++) hw[i] = clamp(hw[i], hw[i - 1] - L.hwChange * ds, hw[i - 1] + L.hwChange * ds);
  for (let i = n - 2; i >= 0; i--) hw[i] = clamp(hw[i], hw[i + 1] - L.hwChange * ds, hw[i + 1] + L.hwChange * ds);
  // 3. the side tilt: towards the inside of the bend, more the tighter it is; level at the plaza; it may change only slowly along the road
  const bank = new Float64Array(n), want = (i) => (i < flatN ? 0 : -Math.sign(k[i]) * Math.min(L.bankIn * 0.9, Math.abs(k[i]) * 1.4));
  const fixed = ctrl.map((c, j) => [at[j], c.bank]).filter((g) => g[1] !== undefined);
  for (let i = 0; i < n; i++) bank[i] = want(i);
  for (const [i, b] of fixed) for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) bank[j] = b;
  const slew = (a, lo, hi) => { for (let r = 0; r < 4; r++) { for (let i = 1; i < n; i++) a[i] = clamp(a[i], a[i - 1] + lo(i) * ds, a[i - 1] + hi(i) * ds); for (let i = n - 2; i >= 0; i--) a[i] = clamp(a[i], a[i + 1] - hi(i) * ds, a[i + 1] - lo(i) * ds); } };
  const tw = L.twist * 0.9;
  for (let r = 0; r < 60; r++) { for (let i = 1; i < n - 1; i++) if (Math.abs(bank[i + 1] - bank[i]) > tw * ds || Math.abs(bank[i] - bank[i - 1]) > tw * ds) bank[i] = i < flatN ? 0 : (bank[i - 1] + 2 * bank[i] + bank[i + 1]) / 4; }
  slew(bank, () => -tw, () => tw);
  for (let i = 0; i < flatN; i++) bank[i] = 0;
  slew(bank, () => -tw, () => tw);
  // 4. the heights: the grade is solved, then added up. Limits per sample: the grade (lower in a bend, and so low that the inner edge and the tilt together stay inside
  //    the surface's limit), and how fast the grade may change (a crest, a dip: by radius and by the reference speed)
  const vRef = refSpeed(k, n, ds, L), gMax = new Float64Array(n), kvLo = new Float64Array(n), kvHi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const inner = 1 - hw[i] * Math.abs(k[i]), db = Math.abs(i > 0 && i < n - 1 ? (bank[i + 1] - bank[i - 1]) / (2 * ds) : 0) * hw[i];
    gMax[i] = Math.max(0, 0.96 * Math.min(Math.abs(k[i]) > L.hairpinK ? L.gradeHairpin : L.grade, L.slope * inner - db, Math.sqrt(Math.max(0, L.slopeBoth ** 2 - bank[i] ** 2)) * inner - db));
    kvLo[i] = -0.9 * Math.min(1 / L.crestR, (L.crestG * L.G) / vRef[i] ** 2); kvHi[i] = 0.9 * Math.min(1 / L.sagR, (L.sagG * L.G) / vRef[i] ** 2);
  }
  // the grade's limit must itself be reachable: it may not fall faster along the road than the grade is allowed to change (else the grade could not follow it into a bend)
  for (let i = 1; i < n; i++) gMax[i] = Math.min(gMax[i], gMax[i - 1] + Math.min(-kvLo[i], kvHi[i]) * ds);
  for (let i = n - 2; i >= 0; i--) gMax[i] = Math.min(gMax[i], gMax[i + 1] + Math.min(-kvLo[i], kvHi[i]) * ds);
  const anchors = ctrl.map((c, j) => [at[j], c.y]).filter((a) => a[1] !== undefined);
  if (!anchors.length || anchors[0][0] !== 0) anchors.unshift([0, anchors[0]?.[1] ?? 0]);
  const y0 = anchors[0][1], g = new Float64Array(n), y = new Float64Array(n);
  for (let a = 0; a < anchors.length - 1; a++) { const [i0, ya] = anchors[a], [i1, yb] = anchors[a + 1], m = (yb - ya) / ((i1 - i0) * ds); for (let i = i0; i < i1; i++) g[i] = m; }
  const limit = () => {
    for (let i = 0; i < n; i++) g[i] = i < flatN ? 0 : clamp(g[i], -gMax[i], gMax[i]);
    slew(g, (i) => kvLo[i], (i) => kvHi[i]);
    for (let i = 0; i < flatN; i++) g[i] = 0;
    slew(g, (i) => kvLo[i], (i) => kvHi[i]);
    for (let i = 0; i < n; i++) g[i] = clamp(g[i], -gMax[i], gMax[i]);
  };
  const add = () => { y[0] = y0; for (let i = 1; i < n; i++) y[i] = y[i - 1] + ((g[i - 1] + g[i]) / 2) * ds; };
  for (let it = 0; it < 80; it++) {
    limit(); add();
    let worst = 0;
    for (let a = 0; a < anchors.length - 1; a++) {
      const [i0] = anchors[a], [i1, yb] = anchors[a + 1], err = yb - y[i1] - (a > 0 ? anchors[a][1] - y[i0] : 0);   // what this stretch itself is off by
      worst = Math.max(worst, Math.abs(yb - y[i1]));
      let room = 0; for (let i = Math.max(i0, flatN); i < i1; i++) room += Math.max(0, gMax[i] - Math.sign(err) * g[i]);
      if (room > 0) for (let i = Math.max(i0, flatN); i < i1; i++) g[i] += (err / ds) * (Math.max(0, gMax[i] - Math.sign(err) * g[i]) / room);
    }
    if (worst < 0.005) break;
  }
  limit(); add();
  const T = bakeTrack({ pts, ds, y, bank, hw, plaza: spec.plaza ? { pts: spec.plaza.pts, y: y0 } : null }, L);
  T.anchors = anchors.map(([i, ya]) => ({ s: i * ds, want: ya, got: y[i] }));
  return T;
}

/** The road as plain data for a map file (millimetres; everything else is worked out again on loading), and back. */
export function packTrack(T) {
  const r = (a, q) => Array.from(a, (v) => Math.round(v * q) / q);
  return { version: 2, ds: +T.ds.toFixed(6), x: r(T.x, 1000), z: r(T.z, 1000), y: r(T.y, 1000), bank: r(T.bank, 100000), hwL: r(T.hwL, 1000), hwR: r(T.hwR, 1000), plaza: T.plaza };
}
export function loadTrack(P, limits = LIMITS) { return bakeTrack({ pts: P.x.map((x, i) => [x, P.z[i]]), ds: P.ds, y: P.y, bank: P.bank, hwL: P.hwL, hwR: P.hwR, plaza: P.plaza }, limits); }

// ---------------------------------------------------------------- checking
/**
 * Every limit at every sample (centre line and both edges). Returns { ok, problems: [{ rule, s, value, limit, text }] (the worst place of each rule that is broken, and how
 * many samples break it), worst: { rule: { value, limit, s } } (for the table of the sheet), bad: { rule: a flag per sample } }.
 */
export function checkTrack(T, limits = T.limits ?? LIMITS) {
  const L = limits, n = T.n, ds = T.ds, worst = {}, count = {}, bad = {};
  const pct = (v) => (v * 100).toFixed(1) + ' %', m = (v) => v.toFixed(2) + ' m';
  // `over`: how far past its limit a value is (> 0 = broken); the worst is kept per rule
  const see = (rule, s, value, limit, over, fmt = m) => {
    if (over > 1e-9) { count[rule] = (count[rule] ?? 0) + 1; (bad[rule] ??= new Uint8Array(n))[clamp(Math.round(s / ds), 0, n - 1)] = 1; }
    if (!worst[rule] || over > worst[rule].over) worst[rule] = { value, limit, s, over, fmt };
  };
  const hi = (rule, s, v, lim, fmt) => see(rule, s, v, lim, v - lim, fmt), lo = (rule, s, v, lim, fmt) => see(rule, s, v, lim, lim - v, fmt);
  const P = { }, Q = { };
  for (let i = 0; i < n; i++) {
    const s = i * ds, k = T.k[i], ak = Math.abs(k), hwIn = k > 0 ? T.hwR[i] : T.hwL[i];
    lo('width', s, Math.min(T.hwL[i], T.hwR[i]), L.hwMin); hi('width-max', s, Math.max(T.hwL[i], T.hwR[i]), L.hwMax);
    if (i > 0) hi('width-change', s, Math.max(Math.abs(T.hwL[i] - T.hwL[i - 1]), Math.abs(T.hwR[i] - T.hwR[i - 1])) / ds, L.hwChange, (v) => (v * 10).toFixed(2) + ' m in 10 m');
    if (ak > 1e-9) { lo('radius', s, 1 / ak, L.rMin); lo('radius-inner', s, 1 / ak - hwIn, L.rInner); lo('radius-rail', s, 1 / ak - hwIn - L.shoulder, L.rRail); }
    if (i > 0) hi('transition', s, Math.abs(k - T.k[i - 1]) / ds, 1 / L.rMin / L.transition, (v) => (1 / L.rMin / Math.max(1e-9, v)).toFixed(1) + ' m to a full bend');
    hi(ak > L.hairpinK ? 'grade-bend' : 'grade', s, Math.abs(T.grade[i]), ak > L.hairpinK ? L.gradeHairpin : L.grade, pct);
    for (const lat of [-T.hwL[i], 0, T.hwR[i]]) {
      const gs = (T.grade[i] + lat * T.dbank[i]) / Math.max(0.05, 1 - lat * k);
      hi('slope', s, Math.abs(gs), L.slope, pct); hi('slope-both', s, Math.hypot(gs, T.bank[i]), L.slopeBoth, pct);
    }
    const v2 = T.vRef[i] ** 2;
    if (T.kv[i] < 0) { hi('crest', s, -T.kv[i], 1 / L.crestR, (v) => 'radius ' + (1 / v).toFixed(0) + ' m'); hi('crest-load', s, (-T.kv[i] * v2) / L.G, L.crestG, (v) => v.toFixed(2) + ' g'); }
    else { hi('dip', s, T.kv[i], 1 / L.sagR, (v) => 'radius ' + (1 / Math.max(1e-9, v)).toFixed(0) + ' m'); hi('dip-load', s, (T.kv[i] * v2) / L.G, L.sagG, (v) => v.toFixed(2) + ' g'); }
    // the side tilt: towards the inside of the bend up to the limit, away from it only a little (on a straight piece either side counts as "away")
    const inward = ak > 1 / 400 ? -Math.sign(k) * T.bank[i] : -Math.abs(T.bank[i]);
    hi('bank', s, inward, L.bankIn, pct); hi('bank-out', s, -inward, L.bankOut, pct);
    hi('twist', s, Math.abs(T.dbank[i]), L.twist, (v) => (v * 500).toFixed(2) + ' % in 5 m');
    if (i > 0) hi('step', s, Math.abs(T.y[i] - T.y[i - 1]), L.step * ds);
    hi('bounds', s, Math.max(Math.abs(T.x[i]), Math.abs(T.z[i])), L.bound);
    if (T.plaza && s <= L.plazaFlat) { hi('plaza-level', s, Math.abs(T.y[i] - T.plaza.y), L.plazaStep); hi('plaza-grade', s, Math.max(Math.abs(T.grade[i]), Math.abs(T.bank[i])), 0.001, pct); }
    // four wheel points on the surface, on the centre line and near both edges: how far the fourth is from the plane of the other three
    if (i > 0 && i < n - 1) for (const lat of [-T.hwL[i] + 1, 0, T.hwR[i] - 1]) {
      const a = frameAt(T, s - 1.3, lat - 0.8).y, b = frameAt(T, s - 1.3, lat + 0.8).y, c = frameAt(T, s + 1.3, lat - 0.8).y, d = frameAt(T, s + 1.3, lat + 0.8).y;
      hi('wheel-plane', s, Math.abs(a - b - c + d) / 2, L.wheelPlane);
    }
    // the surface asked by place must be the surface of the frame (five points across)
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      const lat = f > 0 ? f * T.hwR[i] : f * T.hwL[i], fr = frameAt(T, s, lat);
      if (T.plaza && inPoly(T.plaza.pts, fr.x, fr.z)) continue;
      hi('surface', s, Math.abs(surfaceAt(T, fr.x, fr.z, P).y - fr.y), L.surface);
    }
  }
  // two branches of the road too close on the plan
  const gap = Math.ceil(L.branchArc / ds);
  for (let i = 0; i < n; i++) { let bd = Infinity; for (let j = i + gap; j < n; j++) { const d = (T.x[i] - T.x[j]) ** 2 + (T.z[i] - T.z[j]) ** 2; if (d < bd) bd = d; } if (bd < Infinity) lo('branch', i * ds, Math.sqrt(bd), L.branch); }
  for (const a of T.anchors ?? []) hi('height', a.s, Math.abs(a.got - a.want), 0.05);
  const TEXT = { width: 'the road is too narrow', 'width-max': 'the road is too wide', 'width-change': 'the width changes too fast', radius: 'the bend is too tight', 'radius-inner': 'the inner edge of the bend is too tight',
    'radius-rail': 'the rail inside the bend is too tight', transition: 'the bend begins too suddenly', grade: 'the road is too steep', 'grade-bend': 'the road is too steep in the bend', slope: 'the surface is too steep (at an edge)',
    'slope-both': 'the surface is too steep (along and across together)', crest: 'the crest is too sharp', 'crest-load': 'the crest lifts the car too much at speed', dip: 'the dip is too sharp', 'dip-load': 'the dip presses the car too much at speed',
    bank: 'the road tilts too much into the bend', 'bank-out': 'the road hangs outwards', twist: 'the tilt changes too fast', 'wheel-plane': 'the surface is twisted under the four wheels', step: 'the height jumps', bounds: 'the road leaves the map',
    'plaza-level': 'the road does not start at the plaza\'s height', 'plaza-grade': 'the road is not level at the plaza', surface: 'the surface by place is not the surface of the road frame', branch: 'two branches of the road are too close',
    height: 'a control height is missed (the limits do not allow it)' };
  const problems = Object.keys(count).map((rule) => { const w = worst[rule]; return { rule, s: +w.s.toFixed(1), value: w.value, limit: w.limit, samples: count[rule], text: `${TEXT[rule] ?? rule}: ${w.fmt(w.value)} at ${w.s.toFixed(0)} m (limit ${w.fmt(w.limit)}; ${count[rule]} place${count[rule] > 1 ? 's' : ''})` }; });
  const table = {}; for (const [rule, w] of Object.entries(worst)) table[rule] = { value: w.value, limit: w.limit, s: +w.s.toFixed(1), shown: w.fmt(w.value), limitShown: w.fmt(w.limit), ok: !(count[rule] > 0), what: TEXT[rule] ?? rule };
  return { ok: problems.length === 0, problems, worst: table, bad };
}
