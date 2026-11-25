// Compares the colours of two pictures (the owner's mockup and a probe picture): mean brightness, contrast (standard deviation of the
// brightness), saturation, and the mean colour of six regions (left/right half × top/middle/bottom third) and of named boxes, plus the
// distance of each region (RGB, 0..441). Runs the measuring in headless Chromium (a canvas reads the pixels; no packages, no PIL).
// Usage: node tools/palette.mjs <mockup image> <probe image> [--boxes=name:x0,y0,x1,y1;...]   (boxes in fractions of the picture)
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const [a, b, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((s) => { const t = s.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const boxes = (opt.boxes ?? '').split(';').filter(Boolean).map((s) => { const [n, v] = s.split(':'); return [n, v.split(',').map(Number)]; });
const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'palette-'));
copyFileSync(a, join(dir, 'a' + extname(a))); copyFileSync(b, join(dir, 'b' + extname(b)));
const page = `<!doctype html><body><script>
const boxes = ${JSON.stringify(boxes)};
const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
const stats = (img) => {
  const c = document.createElement('canvas'), w = c.width = 400, h = c.height = Math.round(400 * img.height / img.width), x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data;
  let s = 0, s2 = 0, sat = 0, n = w * h;
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); sat += mx ? (mx - mn) / mx : 0; }
  const mean = (x0, y0, x1, y1) => { let r = 0, g = 0, bl = 0, k = 0; for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) for (let xx = Math.floor(x0 * w); xx < Math.ceil(x1 * w); xx++) { const i = (y * w + xx) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; k++; } return [r / k, g / k, bl / k].map(Math.round); };
  const regions = {};
  for (const [nx, x0, x1] of [['left', 0, 0.5], ['right', 0.5, 1]]) for (const [ny, y0, y1] of [['top', 0, 1 / 3], ['middle', 1 / 3, 2 / 3], ['bottom', 2 / 3, 1]]) regions[ny + '-' + nx] = mean(x0, y0, x1, y1);
  for (const [name, [x0, y0, x1, y1]] of boxes) regions[name] = mean(x0, y0, x1, y1);
  return { brightness: Math.round(s / n), contrast: Math.round(Math.sqrt(s2 / n - (s / n) ** 2)), saturation: +(sat / n).toFixed(2), regions };
};
Promise.all([load('a${extname(a)}'), load('b${extname(b)}')]).then(([A, B]) => { document.body.textContent = JSON.stringify([stats(A), stats(B)]); });
</script></body>`;
writeFileSync(join(dir, 'p.html'), page);
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const r = spawnSync('timeout', ['90', chrome, '--headless=new', '--no-sandbox', '--allow-file-access-from-files', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=20000', '--dump-dom', 'file://' + join(dir, 'p.html')], { encoding: 'utf8' });
rmSync(dir, { recursive: true, force: true });
const m = /<body>[\s\S]*?(\[\{[\s\S]*\}\])/.exec(r.stdout ?? '');
if (!m) { console.error('no result', (r.stderr ?? '').slice(0, 400)); process.exit(1); }
const [A, B] = JSON.parse(m[1].replace(/<script>[\s\S]*<\/script>/, ''));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const dist = (p, q) => Math.round(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
console.log(`brightness ${A.brightness} / ${B.brightness}   contrast ${A.contrast} / ${B.contrast}   saturation ${A.saturation} / ${B.saturation}`);
let sum = 0;
for (const k of Object.keys(A.regions)) { const dd = dist(A.regions[k], B.regions[k]); sum += dd; console.log(`${k.padEnd(14)} ${hex(A.regions[k])}  ${hex(B.regions[k])}  distance ${dd}`); }
console.log(`mean distance ${Math.round(sum / Object.keys(A.regions).length)}`);
