// Ambient occlusion baked into the vertex colours with a coarse voxel grid, once when a model is
// built: darker corners, seams and feet, no cost per frame (the colours are just colours).
// Engine independent: it only touches the builders' arrays. Called by Builder.build() and, for
// a group that must shade itself together (the town), through bakeGroup().
// 1) mark every cell a triangle touches; 2) for each vertex look a few steps along 8 directions
// around its normal and count marked cells.

// ?nobake in the address switches the bake off (for before/after pictures and timing).
const OFF = typeof location !== 'undefined' && /[?&]nobake\b/.test(location.search);

/** Bounds of the builders' vertices. */
function bounds(builders) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of builders) for (let i = 0; i < b.pos.length; i += 3) for (let a = 0; a < 3; a++) {
    const v = b.pos[i + a];
    if (v < min[a]) min[a] = v;
    if (v > max[a]) max[a] = v;
  }
  return { min: min.map((v) => v - 3), max: max.map((v) => v + 3) };
}

/**
 * Bake the builders in `solids` against each other (they occlude and are darkened). A cell size
 * that follows the size of the thing keeps the dark band about as wide as a small corner:
 * 0.08 for a car, 0.4 for the whole town. Builders already baked are skipped.
 */
export function bakeGroup(solids, { strength = 0.9 } = {}) {
  if (OFF) return;
  const list = solids.filter((b) => b && b.count && !b.baked);
  if (!list.length) return;
  const { min, max } = bounds(list);
  const ext = Math.max(max[0] - min[0], max[2] - min[2]);
  const cell = Math.min(0.4, Math.max(0.08, ext / 60));
  // never more than about 12 million cells (one byte each)
  const cells = ((max[0] - min[0]) / cell) * ((max[1] - min[1]) / cell) * ((max[2] - min[2]) / cell);
  const c = cells > 12e6 ? cell * Math.cbrt(cells / 12e6) : cell;
  bakeAO(list, { cell: c, min, max, strength });
  for (const b of list) b.baked = true;
}

function bakeAO(builders, { cell, min, max, strength = 0.5, paint = builders }) {
  const nx = Math.ceil((max[0] - min[0]) / cell), ny = Math.ceil((max[1] - min[1]) / cell), nz = Math.ceil((max[2] - min[2]) / cell);
  const grid = new Uint8Array(nx * ny * nz);
  const at = (x, y, z) => {
    const i = Math.floor((x - min[0]) / cell), j = Math.floor((y - min[1]) / cell), k = Math.floor((z - min[2]) / cell);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
    return (k * ny + j) * nx + i;
  };
  for (const b of builders) {
    const p = b.pos, ix = b.idx;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, bb = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const e1 = Math.hypot(p[bb] - p[a], p[bb + 1] - p[a + 1], p[bb + 2] - p[a + 2]);
      const e2 = Math.hypot(p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]);
      const n = Math.min(60, Math.max(1, Math.ceil(Math.max(e1, e2) / (cell * 0.7))));
      for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
        const s = u / n, r = v / n, q = 1 - s - r;
        const i = at(p[a] * q + p[bb] * s + p[c] * r, p[a + 1] * q + p[bb + 1] * s + p[c + 1] * r, p[a + 2] * q + p[bb + 2] * s + p[c + 2] * r);
        if (i >= 0) grid[i] = 1;
      }
    }
  }
  const STEPS = [0.7, 1.5, 2.8];
  const W = [0.5, 0.3, 0.2];
  for (const b of paint) {
    const p = b.pos, nrm = b.nor, col = b.col;
    for (let v = 0; v < b.count; v++) {
      const px = p[v * 3], py = p[v * 3 + 1], pz = p[v * 3 + 2];
      const nxn = nrm[v * 3], nyn = nrm[v * 3 + 1], nzn = nrm[v * 3 + 2];
      // any tangent pair
      let tx, ty, tz;
      if (Math.abs(nyn) < 0.9) { tx = nzn; ty = 0; tz = -nxn; } else { tx = 1; ty = 0; tz = 0; }
      let l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
      const bx = nyn * tz - nzn * ty, by = nzn * tx - nxn * tz, bz = nxn * ty - nyn * tx;
      let occ = 0, tot = 0;
      for (let d = 0; d < 8; d++) {
        const ph = (d / 8) * Math.PI * 2, cx = Math.cos(ph) * 0.7, cy = Math.sin(ph) * 0.7;
        const dx = nxn * 0.72 + tx * cx + bx * cy, dy = nyn * 0.72 + ty * cx + by * cy, dz = nzn * 0.72 + tz * cx + bz * cy;
        const dl = Math.hypot(dx, dy, dz);
        for (let s = 0; s < 3; s++) {
          const m = STEPS[s] / dl;
          const i = at(px + nxn * 0.25 + dx * m, py + nyn * 0.25 + dy * m, pz + nzn * 0.25 + dz * m);
          tot += W[s];
          if (i >= 0 && grid[i]) occ += W[s];
        }
      }
      const k = 1 - strength * (occ / tot);
      col[v * 3] *= k; col[v * 3 + 1] *= k; col[v * 3 + 2] *= k;
    }
  }
}
