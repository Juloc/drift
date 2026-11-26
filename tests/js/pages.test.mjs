// Every script a page loads must at least parse and find what it imports: version 0.7.0 went out with `trackSurface` declared twice in game/main.js after a merge
// (two branches each added the same line; git saw no conflict), and the game page did not load. This test reads every script under game/ and src/Drift/wwwroot/
// (not the tests, not the vendored three.js): (1) `node --check` on each, (2) every relative import points at a file that is there, (3) every imported name is
// exported by that file, (4) every page's <script src> is there. Run before any merge is committed (scripts/premerge.sh, the hook .githooks/pre-merge-commit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';

const ROOTS = ['game', 'src/Drift/wwwroot'];
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const all = ROOTS.flatMap((r) => walk(r)), scripts = all.filter((f) => /\.(js|mjs)$/.test(f) && !/\.test\./.test(f)), pages = all.filter((f) => f.endsWith('.html'));
// where a relative import of a file really is: beside it, or (the app's play page is served together with the game's files) under game/
const find = (from, spec) => { const a = resolve(dirname(from), spec); if (existsSync(a)) return a; if (from.includes('wwwroot/play')) { const b = resolve('game', spec); if (existsSync(b)) return b; } return null; };

test('pages: every script parses (node --check), all of them', async () => {
  assert.ok(scripts.length > 60, `only ${scripts.length} scripts found`);
  const check = (f) => new Promise((done) => execFile(process.execPath, ['--check', f], (err, _o, stderr) => done(err ? `${f}: ${stderr.split('\n').find((l) => /Error/.test(l)) ?? stderr.slice(0, 200)}` : null)));
  const bad = [];
  for (let i = 0; i < scripts.length; i += 8) bad.push(...(await Promise.all(scripts.slice(i, i + 8).map(check))).filter(Boolean));
  assert.deepEqual(bad, []);
});

test('pages: every relative import points at a file that is there, and every imported name is exported by it', () => {
  const exportsOf = new Map();
  const names = (file) => {
    if (exportsOf.has(file)) return exportsOf.get(file);
    const src = readFileSync(file, 'utf8'), set = new Set(); let open = false;
    for (const m of src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) set.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([^=;]+?)\s*=/gm)) for (const n of m[1].split(',')) set.add(n.trim());   // export const a = 1, b = 2 (first names of a list)
    for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+.*$/gm)) for (const n of m[0].matchAll(/[,\s]([A-Za-z_$][\w$]*)\s*=(?!=|>)/g)) set.add(n[1]);   // every name of a list on that line (a few names too many do no harm)
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const t = n.trim().split(/\s+as\s+/).pop(); if (t) set.add(t); }
    if (/^export\s+default\b/m.test(src)) set.add('default');
    if (/^export\s*\*/m.test(src)) open = true;
    exportsOf.set(file, { set, open });
    return exportsOf.get(file);
  };
  const bad = [];
  for (const f of scripts) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/^\s*import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)?\s*(?:from\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      const target = find(f, m[3]);
      if (!target) { bad.push(`${f}: imports ${m[3]}, which is not there`); continue; }
      if (!/\.(js|mjs)$/.test(target)) continue;
      const ex = names(target); if (ex.open) continue;
      if (m[1] && !ex.set.has('default')) bad.push(`${f}: imports a default from ${m[3]}, which has none`);
      for (const part of (m[2] ?? '').split(',')) { const n = part.trim().split(/\s+as\s+/)[0]; if (n && !ex.set.has(n)) bad.push(`${f}: imports { ${n} } from ${m[3]}, which does not export it`); }
    }
    for (const m of src.matchAll(/\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) if (!find(f, m[1])) bad.push(`${f}: loads ${m[1]}, which is not there`);
  }
  assert.deepEqual(bad, []);
});

test('pages: every script and style a page names is there', () => {
  const bad = [];
  for (const p of pages) for (const m of readFileSync(p, 'utf8').matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"#?]+)[^"]*"/g)) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('/base/') || ref.startsWith('/vendor/') || ref.startsWith('data:')) continue;   // the base and three.js are served by the app from elsewhere
    const here = ref.startsWith('/') ? [join('src/Drift/wwwroot', ref), join('game', ref.replace(/^\/play\//, ''))] : [resolve(dirname(p), ref), ...(p.includes('wwwroot/play') ? [resolve('game', ref)] : [])];
    if (!here.some((h) => existsSync(h))) bad.push(`${p}: names ${ref}, which is not there`);
  }
  assert.deepEqual(bad, []);
});

test('pages: the development pages of the lab are known (each has its script, no inline script or style) and the vendored addons import three by a relative path', () => {
  const lab = ['game/lab-sim.html', 'game/lab-look.html', 'game/lab-nature.html', 'game/lab-corner.html', 'game/lab-drive.html'].filter((p) => existsSync(p));
  assert.ok(lab.length >= 4 && lab.includes('game/lab-corner.html'));
  for (const p of lab) {
    const html = readFileSync(p, 'utf8');
    assert.match(html, /<script[^>]*\ssrc="[^"]+"/, `${p} loads a script`);
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>\s*\S/.test(html) && !/<style/i.test(html) && !/\sstyle="/.test(html), `${p} has no inline script or style`);
  }
  for (const f of walk('vendor/three/addons').filter((f) => f.endsWith('.js'))) assert.ok(!/from\s+['"]three['"]/.test(readFileSync(f, 'utf8')), `${f} still imports the bare name three`);
});
