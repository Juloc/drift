// The track sheet: checks a road against the limits of the track system (game/sim/track.js, design section 3.3) in plain Node, no browser, and draws one sheet per map:
// the plan coloured by grade with the hairpins numbered and the broken places marked, the side view of the hillside (looking along the runs), the road unrolled
// (height, grade, vertical curve, side tilt, reference speed, each with its limits), cross-sections at every hairpin, at the plaza's mouth and at the worst places, and the
// table of every limit with its worst value. Writes docs/screenshots/trackcheck/<map>.svg (and .png, .txt) and exits with 1 when a limit is broken.
// A map without baked track data (the touge before the track system) is measured as it is drawn today: the centre line with the heights the look gives it.
// Usage: node tools/trackcheck.mjs [game/data/maps/06-touge.json ...] [--out=docs/screenshots/trackcheck] [--name=touge-before] [--no-png]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { bakeTrack, loadTrack, checkTrack, frameAt, surfaceAt, resample, LIMITS } from '../game/sim/track.js';

const args = process.argv.slice(2), files = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const t = a.slice(2), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const out = opt.out ?? 'docs/screenshots/trackcheck';
if (!files.length) files.push('game/data/maps/06-touge.json');
mkdirSync(out, { recursive: true });

/** The road of a map: its baked track data, or (a map from before the track system) the centre line with the heights of today's drawing. Also the land's height where known. */
export async function trackOfMap(map, themePath) {
  if (map.track?.version === 2) return { track: loadTrack(map.track), land: null, legacy: false };
  const { sceneFromMap } = await import('../game/view/look/mapscene.js'), { makeField } = await import('../game/view/look/field.js');
  const theme = JSON.parse(readFileSync(themePath, 'utf8')), scene = sceneFromMap(map, theme), f = makeField(scene, { cell: 6 });
  // the look's road points with their heights, resampled every 2 m
  const cum = f.info.s, { pts, ds } = resample(f.road, LIMITS.ds), y = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) { const s = i * ds; while (j < cum.length - 2 && cum[j + 1] < s) j++; const t = cum[j + 1] > cum[j] ? Math.min(1, (s - cum[j]) / (cum[j + 1] - cum[j])) : 0; y.push(f.roadYs[j] + (f.roadYs[j + 1] - f.roadYs[j]) * t); }
  const plaza = scene.plaza?.pts ? { pts: scene.plaza.pts, y: f.plazaLevel } : null;
  return { track: bakeTrack({ pts, ds, y, bank: 0, hw: map.halfWidth ?? f.hw, plaza }), land: (x, z) => f.height(x, z), ground: (x, z) => f.groundY(x, z), legacy: true };
}

/** The bends tighter than 40 m that turn by more than 100 degrees: { from, apex, to } as distances along the road. */
export function hairpins(T) {
  const list = []; let i = 0;
  while (i < T.n) {
    if (Math.abs(T.k[i]) <= 1 / 40) { i++; continue; }
    let j = i, turn = 0, apex = i; while (j < T.n && Math.abs(T.k[j]) > 1 / 60) { turn += T.k[j] * T.ds; if (Math.abs(T.k[j]) > Math.abs(T.k[apex])) apex = j; j++; }
    if (Math.abs(turn) > 1.75) list.push({ from: i * T.ds, apex: ((i + j) / 2) * T.ds, to: (j - 1) * T.ds, right: turn > 0 });
    i = j + 1;
  }
  return list;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (v) => (Math.round(v * 10) / 10).toString();

function sheet(name, T, check, extra) {
  const W = 1640, parts = [], L = T.limits, n = T.n, ds = T.ds, pins = hairpins(T);
  const add = (s) => parts.push(s);
  const text = (x, y, s, o = {}) => add(`<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size ?? 12}" fill="${o.fill ?? '#223'}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.bold ? 'font-weight="700"' : ''}>${esc(s)}</text>`);
  const anyBad = new Uint8Array(n); for (const a of Object.values(check.bad)) for (let i = 0; i < n; i++) if (a[i]) anyBad[i] = 1;
  const gradeColour = (g) => { const a = Math.abs(g); return a > L.grade ? '#d22' : a > 0.08 ? '#e80' : a > 0.05 ? '#cb0' : '#2a8'; };
  let Y = 34;
  text(20, Y, `Track sheet: ${name}`, { size: 22, bold: true });
  text(W - 20, Y, check.ok ? 'INSIDE EVERY LIMIT' : `${check.problems.length} LIMIT${check.problems.length > 1 ? 'S' : ''} BROKEN`, { size: 22, bold: true, anchor: 'end', fill: check.ok ? '#183' : '#c11' });
  Y += 22; text(20, Y, `${T.len.toFixed(0)} m long, ${(Math.max(...T.y) - Math.min(...T.y)).toFixed(0)} m of height, ${pins.length} hairpins, sampled every ${ds.toFixed(2)} m${extra.legacy ? '. Measured as today\'s drawing gives the heights (no track data in the map yet).' : '.'}`, { size: 13 });
  Y += 28;

  // ---- A: the plan, B: the side view
  const boxA = { x: 20, y: Y, w: 790, h: 470 }, boxB = { x: 830, y: Y, w: 790, h: 470 };
  for (const b of [boxA, boxB]) add(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#f6f7fa" stroke="#ccd"/>`);
  text(boxA.x + 8, boxA.y - 5, 'Plan. Colour = grade: green under 5 %, yellow to 8 %, orange to 10 %, red above. Red rings: a limit is broken there. Numbers: metres along the road.', { size: 11 });
  const xs = Array.from(T.x), zs = Array.from(T.z), px_ = (T.plaza?.pts ?? []).map((p) => p[0]), pz_ = (T.plaza?.pts ?? []).map((p) => p[1]), minX = Math.min(...xs, ...px_) - 15, maxX = Math.max(...xs, ...px_) + 15, minZ = Math.min(...zs, ...pz_) - 15, maxZ = Math.max(...zs, ...pz_) + 15;
  const scA = Math.min((boxA.w - 20) / (maxX - minX), (boxA.h - 40) / (maxZ - minZ));
  const ax = (x) => boxA.x + 10 + (x - minX) * scA, az = (z) => boxA.y + 14 + (maxZ - z) * scA;
  if (T.plaza) add(`<polygon points="${T.plaza.pts.map((p) => `${f1(ax(p[0]))},${f1(az(p[1]))}`).join(' ')}" fill="#dde3ee" stroke="#99a"/>`);
  for (let i = 0; i < n - 1; i++) add(`<line x1="${f1(ax(T.x[i]))}" y1="${f1(az(T.z[i]))}" x2="${f1(ax(T.x[i + 1]))}" y2="${f1(az(T.z[i + 1]))}" stroke="${gradeColour(T.grade[i])}" stroke-width="${Math.max(2.5, (T.hwL[i] + T.hwR[i]) * scA).toFixed(1)}" stroke-linecap="round"/>`);
  for (let i = 0; i < n; i += 3) if (anyBad[i] || anyBad[i + 1] || anyBad[i + 2]) add(`<circle cx="${f1(ax(T.x[i]))}" cy="${f1(az(T.z[i]))}" r="${Math.max(4, 7 * scA).toFixed(1)}" fill="none" stroke="#c11" stroke-width="1"/>`);
  for (let s = 0; s < T.len; s += 100) { const f = frameAt(T, s, 0); text(ax(f.x) + 6, az(f.z) - 6, `${s}`, { size: 9, fill: '#556' }); add(`<circle cx="${f1(ax(f.x))}" cy="${f1(az(f.z))}" r="1.8" fill="#223"/>`); }
  pins.forEach((p, i) => { const f = frameAt(T, p.apex, p.right ? -14 : 14); add(`<circle cx="${f1(ax(f.x))}" cy="${f1(az(f.z))}" r="10" fill="#fff" stroke="#223"/>`); text(ax(f.x), az(f.z) + 4, i + 1, { anchor: 'middle', bold: true }); });
  // the side view: looking along the runs (the direction most of the road points in), so the branches of the hillside stand above one another
  let cxx = 0, sxx = 0; for (let i = 0; i < n; i++) { cxx += Math.cos(2 * T.head[i]); sxx += Math.sin(2 * T.head[i]); }
  const main = Math.atan2(sxx, cxx) / 2, ux = Math.cos(main), uz = -Math.sin(main);   // across the runs
  const us = xs.map((x, i) => x * ux + zs[i] * uz), ys = Array.from(T.y), minU = Math.min(...us) - 10, maxU = Math.max(...us) + 10, minY = Math.min(...ys) - 6, maxY = Math.max(...ys) + 6;
  const scB = Math.min((boxB.w - 60) / (maxU - minU), (boxB.h - 50) / (maxY - minY));
  const bu = (u) => boxB.x + 45 + (u - minU) * scB, by = (y) => boxB.y + 30 + (maxY - y) * scB;
  text(boxB.x + 8, boxB.y - 5, 'Side view of the hillside, looking along the runs (true to scale: 1 m up = 1 m across): a run seen end-on is short, a hairpin is the slope between.', { size: 11 });
  for (let yv = Math.ceil(minY / 10) * 10; yv <= maxY; yv += 10) { add(`<line x1="${boxB.x + 40}" y1="${f1(by(yv))}" x2="${boxB.x + boxB.w - 5}" y2="${f1(by(yv))}" stroke="#dde"/>`); text(boxB.x + 36, by(yv) + 4, `${yv} m`, { size: 9, anchor: 'end', fill: '#556' }); }
  for (let i = 0; i < n - 1; i++) add(`<line x1="${f1(bu(us[i]))}" y1="${f1(by(ys[i]))}" x2="${f1(bu(us[i + 1]))}" y2="${f1(by(ys[i + 1]))}" stroke="${gradeColour(T.grade[i])}" stroke-width="2.2"/>`);
  pins.forEach((p, i) => { const k = Math.round(p.apex / ds); text(bu(us[k]) + (i % 2 ? -12 : 12), by(ys[k]) + 4, i + 1, { anchor: 'middle', bold: true, size: 11 }); });
  Y += 470 + 14;

  // ---- C: the road unrolled
  const strips = [
    { name: 'height (m)', v: (i) => T.y[i], rules: ['step', 'plaza-level', 'height'] },
    { name: 'grade (%)', v: (i) => T.grade[i] * 100, lim: [-L.grade * 100, L.grade * 100], rules: ['grade', 'grade-bend', 'slope', 'slope-both', 'plaza-grade'] },
    { name: 'crest (-) and dip (+): load at the reference speed (g)', v: (i) => (T.kv[i] * T.vRef[i] ** 2) / L.G, lim: [-L.crestG, L.sagG], rules: ['crest', 'crest-load', 'dip', 'dip-load'], clip: [-1.2, 1.2] },
    { name: 'side tilt (%, + = right side higher)', v: (i) => T.bank[i] * 100, lim: [-L.bankIn * 100, L.bankIn * 100], rules: ['bank', 'bank-out', 'twist', 'wheel-plane'] },
    { name: 'bend (1000 / radius in m, + = right)', v: (i) => T.k[i] * 1000, lim: [-1000 / L.rMin, 1000 / L.rMin], rules: ['radius', 'radius-inner', 'radius-rail', 'transition'] },
    { name: 'reference speed (km/h)', v: (i) => T.vRef[i] * 3.6, rules: [] },
  ];
  const cx0 = 60, cw = W - cx0 - 20, sx = (s) => cx0 + (s / T.len) * cw;
  text(20, Y + 4, 'The road unrolled', { size: 14, bold: true }); Y += 12;
  for (const st of strips) {
    const h = 74, vals = Array.from({ length: n }, (_, i) => st.v(i)), cl = st.clip ?? [-Infinity, Infinity];
    let lo = Math.max(cl[0], Math.min(...vals, ...(st.lim ?? []))), hi = Math.min(cl[1], Math.max(...vals, ...(st.lim ?? []))); if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const sy = (v) => Y + h - 6 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (h - 14);
    add(`<rect x="${cx0}" y="${Y}" width="${cw}" height="${h}" fill="#f6f7fa" stroke="#ccd"/>`);
    text(cx0 + 6, Y + 12, st.name, { size: 10, bold: true });
    text(cx0 - 4, sy(hi) + 8, f1(hi), { size: 9, anchor: 'end' }); text(cx0 - 4, sy(lo), f1(lo), { size: 9, anchor: 'end' });
    if (lo < 0 && hi > 0) add(`<line x1="${cx0}" y1="${f1(sy(0))}" x2="${cx0 + cw}" y2="${f1(sy(0))}" stroke="#bbc"/>`);
    for (const l of st.lim ?? []) add(`<line x1="${cx0}" y1="${f1(sy(l))}" x2="${cx0 + cw}" y2="${f1(sy(l))}" stroke="#c11" stroke-dasharray="5 4" stroke-width="0.8"/>`);
    for (const p of pins) add(`<rect x="${f1(sx(p.from))}" y="${Y}" width="${f1(sx(p.to) - sx(p.from))}" height="${h}" fill="#445" opacity="0.07"/>`);
    add(`<polyline fill="none" stroke="#235" stroke-width="1.1" points="${vals.map((v, i) => `${f1(sx(i * ds))},${f1(sy(v))}`).join(' ')}"/>`);
    const bad = new Uint8Array(n); for (const r of st.rules) if (check.bad[r]) for (let i = 0; i < n; i++) if (check.bad[r][i]) bad[i] = 1;
    for (let i = 0; i < n; i++) if (bad[i]) add(`<rect x="${f1(sx(i * ds) - 0.8)}" y="${Y + h - 5}" width="1.8" height="5" fill="#c11"/>`);
    Y += h + 4;
  }
  for (let s = 0; s <= T.len; s += 100) text(sx(s), Y + 8, `${s}`, { size: 9, anchor: 'middle', fill: '#556' });
  pins.forEach((p, i) => text(sx(p.apex), Y + 20, `hairpin ${i + 1}`, { size: 9, anchor: 'middle', bold: true }));
  Y += 34;

  // ---- D: cross-sections
  const worstPlaces = check.problems.slice().sort((a, b) => b.value / b.limit - a.value / a.limit).slice(0, 3).map((p) => ({ s: p.s, label: `worst: ${p.rule}` }));
  const cuts = [{ s: Math.min(T.len, 2), label: 'plaza mouth' }, ...pins.flatMap((p, i) => [{ s: p.from, label: `hairpin ${i + 1} entry` }, { s: p.apex, label: `hairpin ${i + 1} apex` }, { s: p.to, label: `hairpin ${i + 1} exit` }]), ...worstPlaces];
  text(20, Y + 4, 'Cross-sections (looking down the road, true to scale; black = road, grey = shoulder with the rails, green = land where it is known, blue dots = the height the car is given today)', { size: 14, bold: true }); Y += 14;
  const cwid = 196, chei = 120, perRow = 8, half = 16, px = (cwid - 16) / (2 * half);
  cuts.forEach((c, q) => {
    const x0 = 20 + (q % perRow) * (cwid + 6), y0 = Y + Math.floor(q / perRow) * (chei + 6), i = Math.min(n - 1, Math.round(c.s / ds)), f0 = frameAt(T, c.s, 0);
    add(`<rect x="${x0}" y="${y0}" width="${cwid}" height="${chei}" fill="#f6f7fa" stroke="${anyBad[i] ? '#c11' : '#ccd'}"/>`);
    const mx = (lat) => x0 + cwid / 2 + lat * px, my = (y) => y0 + 70 - (y - f0.y) * px;
    const hl = T.hwL[i], hr = T.hwR[i], sh = L.shoulder, line = (a, b, col, w) => { const A = frameAt(T, c.s, a), Bq = frameAt(T, c.s, b); add(`<line x1="${f1(mx(a))}" y1="${f1(my(A.y))}" x2="${f1(mx(b))}" y2="${f1(my(Bq.y))}" stroke="${col}" stroke-width="${w}"/>`); };
    if (extra.land) { const pts = []; for (let lat = -half; lat <= half; lat += 0.5) { if (lat > -hl - sh && lat < hr + sh) { if (pts.length) { add(`<polyline fill="none" stroke="#3a3" stroke-width="1.2" points="${pts.join(' ')}"/>`); pts.length = 0; } continue; } const F = frameAt(T, c.s, lat), yv = extra.land(F.x, F.z); pts.push(`${f1(mx(lat))},${f1(Math.max(y0 + 22, Math.min(y0 + chei - 2, my(yv))))}`); } if (pts.length) add(`<polyline fill="none" stroke="#3a3" stroke-width="1.2" points="${pts.join(' ')}"/>`); }
    line(-hl - sh, -hl, '#99a', 2); line(hr, hr + sh, '#99a', 2); line(-hl, hr, '#111', 3);
    for (const lat of [-hl - sh, hr + sh]) { const F = frameAt(T, c.s, lat); add(`<line x1="${f1(mx(lat))}" y1="${f1(my(F.y))}" x2="${f1(mx(lat))}" y2="${f1(my(F.y + 0.8))}" stroke="#667" stroke-width="1.5"/>`); }
    if (extra.ground) for (const lat of [-hl, 0, hr]) { const F = frameAt(T, c.s, lat), gy = extra.ground(F.x, F.z); add(`<circle cx="${f1(mx(lat))}" cy="${f1(Math.max(y0 + 22, Math.min(y0 + chei - 2, my(gy))))}" r="2.2" fill="#26c"/>`); }
    const inner = T.k[i] > 0 ? hr : -hl, gIn = (T.grade[i] + inner * T.dbank[i]) / Math.max(0.05, 1 - inner * T.k[i]);
    text(x0 + 5, y0 + 13, `${c.label}, ${c.s.toFixed(0)} m`, { size: 10, bold: true });
    text(x0 + 5, y0 + chei - 16, `grade ${(T.grade[i] * 100).toFixed(1)} %, inner edge ${(gIn * 100).toFixed(1)} %`, { size: 9 });
    text(x0 + 5, y0 + chei - 5, `tilt ${(T.bank[i] * 100).toFixed(1)} %, radius ${Math.abs(T.k[i]) > 1e-4 ? (1 / Math.abs(T.k[i])).toFixed(0) + ' m' : 'straight'}, width ${(hl + hr).toFixed(1)} m`, { size: 9 });
  });
  Y += Math.ceil(cuts.length / perRow) * (chei + 6) + 12;

  // ---- E: the table
  text(20, Y + 4, 'Every limit, with the worst value on this road', { size: 14, bold: true }); Y += 12;
  const rows = Object.entries(check.worst), colW = (W - 40) / 2, perCol = Math.ceil(rows.length / 2);
  rows.forEach(([rule, w], q) => {
    const x0 = 20 + Math.floor(q / perCol) * colW, y0 = Y + (q % perCol) * 17;
    add(`<rect x="${x0}" y="${y0}" width="${colW - 8}" height="16" fill="${w.ok ? '#eef7f0' : '#fde9e9'}"/>`);
    text(x0 + 4, y0 + 12, w.ok ? 'ok' : 'BROKEN', { size: 10, bold: true, fill: w.ok ? '#183' : '#c11' });
    text(x0 + 58, y0 + 12, `${w.what}`, { size: 10 });
    text(x0 + colW - 14, y0 + 12, `${w.shown} at ${w.s.toFixed(0)} m (limit ${w.limitShown})`, { size: 10, anchor: 'end' });
  });
  Y += perCol * 17 + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Y}" viewBox="0 0 ${W} ${Y}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="${W}" height="${Y}" fill="#fff"/>${parts.join('\n')}</svg>`;
}

let failed = false;
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('trackcheck.mjs')) {
  for (const file of files) {
    const map = JSON.parse(readFileSync(file, 'utf8')), name = opt.name ?? basename(file, '.json').replace(/^\d+-/, '');
    if (!map.track && map.kind !== 'descent') { console.log(`${name}: no track data and not a hillside road, skipped`); continue; }
    const got = await trackOfMap(map, `game/data/scenes/${basename(file, '.json').replace(/^\d+-/, '')}.json`), T = got.track, check = checkTrack(T);
    // the height the game gives the car today against the road (a map from before the track system): the "floating" the owner saw
    const lines = [`track check: ${name} (${file})`, `${T.len.toFixed(0)} m, ${(Math.max(...T.y) - Math.min(...T.y)).toFixed(1)} m of height, ${hairpins(T).length} hairpins, ${T.n} samples every ${T.ds.toFixed(2)} m`];
    if (got.ground) {
      let worst = 0, at = 0, lat0 = 0;
      for (let i = 0; i < T.n; i++) for (const lat of [-T.hwL[i], 0, T.hwR[i]]) { const F = frameAt(T, i * T.ds, lat), d = Math.abs(got.ground(F.x, F.z) - F.y); if (d > worst) { worst = d; at = i * T.ds; lat0 = lat; } }
      lines.push(`the height the car is given today is off the road by up to ${worst.toFixed(2)} m (at ${at.toFixed(0)} m, ${lat0.toFixed(1)} m beside the centre)`);
      if (worst > 0.05) { check.problems.push({ rule: 'car-height', s: at, value: worst, limit: 0.05, text: `the car's height is not the road's: ${worst.toFixed(2)} m off at ${at.toFixed(0)} m (limit 0.05 m)` }); check.ok = false; }
    }
    lines.push(check.ok ? 'INSIDE EVERY LIMIT' : `${check.problems.length} LIMITS BROKEN:`, ...check.problems.map((p) => '  ' + p.text), '', 'every limit (worst value):', ...Object.entries(check.worst).map(([r, w]) => `  ${w.ok ? 'ok    ' : 'BROKEN'} ${r.padEnd(13)} ${w.shown} at ${w.s.toFixed(0)} m (limit ${w.limitShown})`));
    writeFileSync(`${out}/${name}.svg`, sheet(name, T, check, got));
    writeFileSync(`${out}/${name}.txt`, lines.join('\n') + '\n');
    if (!opt['no-png']) {   // a picture of the sheet, by the headless browser (no SVG converter on this machine)
      const svg = readFileSync(`${out}/${name}.svg`, 'utf8'), h = +svg.match(/height="(\d+)"/)[1], chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
      spawnSync(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--disable-gpu', `--user-data-dir=/tmp/claude-1000/drift-trackcheck-${process.pid}`, `--screenshot=${resolve(out, name + '.png')}`, `--window-size=1640,${h}`, 'file://' + resolve(out, name + '.svg')], { stdio: 'ignore', timeout: 60000 });
      rmSync(`/tmp/claude-1000/drift-trackcheck-${process.pid}`, { recursive: true, force: true });
    }
    console.log(lines.join('\n')); console.log(`sheet: ${out}/${name}.svg`);
    if (!check.ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
