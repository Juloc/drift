// The play check: opens the game in headless Chromium at a phone held upright, a phone held sideways, a small phone sideways, a tablet and a PC, resizes the window in the middle of a game,
// and checks what the owner found by hand on a phone: (a) the buffer of the picture, the camera and the screen have the same shape (nothing is stretched), (b) every place a car is put
// stands on the drawn ground (under 5 cm), (c) every key has a button by touch, (d) no part of the HUD overlaps another or is cut off. Prints a text report, writes a picture per
// size and an overview picture to docs/screenshots/playcheck/, and exits with 1 when anything fails. The machine's graphics when there is a render node (tools/chrome.mjs), else software; one browser at a time (a few minutes).
// Usage: node tools/playcheck.mjs [--tier=low] [--only=phone-landscape,pc] [--out=docs/screenshots/playcheck]
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { KEYS } from '../game/view/touchmap.js';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const out = opt.out ?? 'docs/screenshots/playcheck', tier = opt.tier ?? 'low';
const SIZES = [
  { name: 'phone-portrait', w: 390, h: 844, touch: true },
  { name: 'phone-landscape', w: 844, h: 390, touch: true },
  { name: 'phone-small-landscape', w: 667, h: 375, touch: true },
  { name: 'tablet', w: 820, h: 1180, touch: true },
  { name: 'pc', w: 1600, h: 900, touch: false },
].filter((s) => !opt.only || opt.only.split(',').includes(s.name));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(out, { recursive: true });

// a static server for the repository (the game page and the vendor files)
const webPort = 21000 + Math.floor(Math.random() * 3000);
const web = spawn('python3', ['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], { stdio: 'ignore', detached: true });
const stops = [() => { try { process.kill(-web.pid, 'SIGKILL'); } catch {} }];
process.on('exit', () => stops.forEach((f) => f()));
await sleep(800);

async function browser() {
  const port = 22000 + Math.floor(Math.random() * 6000), profile = `/tmp/claude-1000/drift-playcheck-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  if (!target) throw new Error('no browser');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(), logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')) logs.push(JSON.stringify(m.params).slice(0, 300)); };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  const close = () => { try { ws.close(); } catch {} try { process.kill(-proc.pid, 'SIGKILL'); } catch {} setTimeout(() => rmSync(profile, { recursive: true, force: true }), 600); };
  stops.push(close);
  return { send, ev, logs, close };
}

const shape = `(() => { const c = __drift.renderer.domElement, cam = __drift.camera, r = c.getBoundingClientRect();
  return JSON.stringify({ win: innerWidth / innerHeight, buffer: c.width / c.height, css: r.width / r.height, camera: cam.aspect, cssBox: [Math.round(r.width), Math.round(r.height)], bufferBox: [c.width, c.height] }); })()`;
// the parts of the HUD that are on the screen: id or class, the box
const hudBoxes = `(() => { const sel = ['#phud .card', '#phud .c-angle', '#chips-toggle', '#reset', '#back', '#fs', '#touch .btn', '#hud > *:not([hidden])', '#tip:not([hidden])', '#chips.open > *'];
  const seen = new Set(), list = [];
  for (const s of sel) for (const el of document.querySelectorAll(s)) { if (seen.has(el)) continue; seen.add(el); const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    list.push({ name: el.id ? '#' + el.id : el.className.toString().split(' ').filter((c) => c !== 'card' && c !== 'btn').join('.') || el.tagName, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }); }
  return JSON.stringify({ list, w: innerWidth, h: innerHeight, rotate: !document.getElementById('rotate').hidden }); })()`;
const keyButtons = (ids) => `(() => JSON.stringify(${JSON.stringify(ids)}.map((id) => { const el = document.getElementById(id); if (!el) return [id, 'missing']; const open = el.closest('#chips'); const cs = getComputedStyle(open && !open.classList.contains('open') ? document.getElementById('chips-toggle') : el); return [id, cs.display === 'none' || cs.visibility === 'hidden' ? 'not shown' : 'ok']; })))()`;

const report = [], fails = [], rows = [];
const fail = (size, text) => { fails.push(`${size}: ${text}`); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) / b < tol;
const wait = async (b, frames = 3) => { const f0 = await b.ev('__drift.info.frames'); for (let i = 0; i < 200 && (await b.ev('__drift.info.frames')) < f0 + frames; i++) await sleep(250); };

for (const sz of SIZES) {
  const b = await browser();
  try {
    await b.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: sz.touch });
    if (sz.touch) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/game/index.html?map=touge&tier=${tier}${sz.touch ? '&touch=1' : ''}&shot=platz` });
    for (let i = 0; i < 240 && !(await b.ev('!!window.__drift && __drift.info.frames > 2')); i++) await sleep(500);
    if (!(await b.ev('!!window.__drift'))) { fail(sz.name, 'the game did not start: ' + b.logs.slice(0, 2).join(' ')); continue; }
    await wait(b);
    const rec = { size: sz.name, box: `${sz.w}x${sz.h}` };
    // (a) the shape: a start, then a change of size in the middle of the game
    const shapes = [];
    const check = async (label) => { await wait(b, 3); const s = JSON.parse(await b.ev(shape)); shapes.push({ label, ...s }); const ok = near(s.buffer, s.win) && near(s.camera, s.win) && near(s.css, s.win); if (!ok) fail(sz.name, `${label}: window ${s.win.toFixed(3)}, picture buffer ${s.buffer.toFixed(3)}, camera ${s.camera.toFixed(3)}, canvas ${s.css.toFixed(3)} are not the same shape`); };
    await check('at the start');
    if (sz.name === 'phone-landscape' || sz.name === 'pc') {
      for (const [w, h, label] of [[Math.round(sz.w * 0.85), Math.round(sz.h * 0.85), 'smaller window'], [Math.round(sz.h * 0.7), Math.round(sz.w * 0.7), 'turned upright'], [sz.w, sz.h, 'back to the first size']]) {
        await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: sz.touch });
        await check(`resized to ${w}x${h} (${label})`);
      }
      await b.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: sz.touch });
      await check('back to the start size');
    }
    rec.shapes = shapes;
    // (b) the ground under every place a car is put
    const spots = JSON.parse(await b.ev('JSON.stringify(__drift.startSpots())'));
    rec.spots = spots.length;
    for (const p of spots) {
      if (p.floor === null) fail(sz.name, `${p.what} (${p.x}, ${p.z}): no ground drawn under the car`);
      else if (Math.abs(p.floor - p.car) > 0.05) fail(sz.name, `${p.what} (${p.x}, ${p.z}): the car stands at ${p.car}, the drawn ground is at ${p.floor} (${p.floor > p.car ? 'the car is under the ground' : 'the car floats'} by ${Math.abs(p.floor - p.car).toFixed(2)} m; drawn by ${p.by})`);
    }
    // (b2) the whole road, every 5 m at the centre and near both edges (once, at the PC size): the car's height must be the drawn road's (under 5 cm), the height along the road must be smooth
    //      (no step, no kink: the second difference over 5 m), and the road must not tilt sideways more than a car can lean (the owner: "the car floats in bends", "physics breaks at height changes")
    if (sz.name === 'pc') {
      const probe = JSON.parse(await b.ev('JSON.stringify(__drift.roadProbe(5))'));
      let worstGap = 0, worstKink = 0, worstStep = 0, atGap = '', atKink = '', atStep = '';
      for (const off of [0, 1, 2]) {
        const col = probe.filter((_, i) => i % 3 === off);
        col.forEach((p, i) => {
          if (p.floor === null) { fail(sz.name, `road at ${p.s} m (offset ${p.off}): no ground drawn`); return; }
          const gap = Math.abs(p.floor - p.car); if (gap > worstGap) { worstGap = gap; atGap = `${p.s} m, offset ${p.off}: car ${p.car}, drawn ${p.floor}`; }
          if (i > 0 && col[i - 1].floor !== null) { const st = Math.abs(p.car - col[i - 1].car); if (st > worstStep) { worstStep = st; atStep = `${p.s} m`; } }
          if (i > 0 && i < col.length - 1) { const k = Math.abs(col[i + 1].car - 2 * p.car + col[i - 1].car); if (k > worstKink) { worstKink = k; atKink = `${p.s} m`; } }
        });
      }
      if (process.env.ROAD_DUMP) writeFileSync(process.env.ROAD_DUMP, JSON.stringify(probe));
      rec.road = { samples: probe.length, worstGap: +worstGap.toFixed(3), worstStep: +worstStep.toFixed(2), worstKink: +worstKink.toFixed(3) };
      if (worstGap > 0.05) fail(sz.name, `the car's height is off the drawn road by ${worstGap.toFixed(2)} m (${atGap})`);
      if (worstStep > 1.1) fail(sz.name, `the road's height steps by ${worstStep.toFixed(2)} m in 5 m (${atStep}): too steep for a car`);
      if (worstKink > 0.35) fail(sz.name, `the road's height kinks by ${worstKink.toFixed(2)} m over 5 m (${atKink}): the car would jump`);
    }
    // (c) every key has a button by touch (on the touch sizes)
    if (sz.touch) {
      const ids = Object.values(KEYS).filter((v) => v.touch && !v.appOnly).map((v) => v.touch);   // (the garage arrow and the emotes belong to the app's page, which needs the server: the unit test checks them)
      const res = JSON.parse(await b.ev(keyButtons(ids)));
      for (const [id, st] of res) if (st !== 'ok') fail(sz.name, `the button #${id} for a key is ${st}`);
      rec.touchButtons = res.length;
    }
    // (d) the HUD: nothing cut off, nothing on top of something else
    const hud = JSON.parse(await b.ev(hudBoxes));
    rec.hudParts = hud.list.length;
    if (!hud.rotate) {
      for (const e of hud.list) if (e.x0 < -1 || e.y0 < -1 || e.x1 > hud.w + 1 || e.y1 > hud.h + 1) fail(sz.name, `${e.name} is cut off (${Math.round(e.x0)},${Math.round(e.y0)} to ${Math.round(e.x1)},${Math.round(e.y1)} on ${hud.w}x${hud.h})`);
      for (let i = 0; i < hud.list.length; i++) for (let j = i + 1; j < hud.list.length; j++) {
        const a = hud.list[i], c = hud.list[j], ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0), oy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
        if (ox > 3 && oy > 3) fail(sz.name, `${a.name} and ${c.name} overlap by ${Math.round(ox)}x${Math.round(oy)} px`);
      }
    } else rec.note = 'the turn hint covers the screen (a phone held upright)';
    rec.errors = b.logs.slice(0, 3);
    if (b.logs.length) fail(sz.name, 'the page reported errors: ' + b.logs.slice(0, 2).join(' '));
    const shot = await b.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${sz.name}.png`, Buffer.from(shot.result.data, 'base64'));
    rows.push(rec);
  } finally { b.close(); }
}

// the overview: one picture with every size and the verdict, drawn by the browser
const status = fails.length ? 'FAILED' : 'passed';
const lines = [`play check ${status}: ${rows.length} sizes, ${fails.length} problem(s)`, ...rows.map((r) => `${r.size} ${r.box}: ${r.shapes.length} shape check(s), ${r.spots} start places, ${r.touchButtons ?? '-'} touch buttons, ${r.hudParts} HUD parts${r.note ? ' (' + r.note + ')' : ''}`), ...fails.map((f) => 'PROBLEM ' + f)];
writeFileSync(`${out}/report.txt`, lines.join('\n') + '\n');
const html = `<body style="margin:0;background:#16131c;color:#fff;font:14px monospace;padding:14px;width:1870px"><h2 style="margin:0 0 8px;color:${fails.length ? '#ff7a7a' : '#7affb0'}">${lines[0]}</h2>
<div style="display:flex;gap:14px;align-items:flex-start">${rows.map((r) => `<figure style="margin:0"><img src="data:image/png;base64,${readFileSync(`${out}/${r.size}.png`).toString('base64')}" style="height:${r.size === 'tablet' || r.size === 'phone-portrait' ? 300 : 200}px;border:1px solid #555"><figcaption>${r.size}<br>${r.box}</figcaption></figure>`).join('')}</div>
<pre style="margin-top:10px;white-space:pre-wrap">${lines.slice(1).map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n')}</pre></body>`;
writeFileSync('/tmp/claude-1000/playcheck-overview.html', html);
const ov = await browser();
try {
  await ov.send('Emulation.setDeviceMetricsOverride', { width: 1900, height: 700, deviceScaleFactor: 1, mobile: false });
  await ov.send('Page.navigate', { url: 'file:///tmp/claude-1000/playcheck-overview.html' }); await sleep(1500);
  const shot = await ov.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/overview.png`, Buffer.from(shot.result.data, 'base64'));
} finally { ov.close(); }
console.log(lines.join('\n'));
await sleep(700);
process.exit(fails.length ? 1 : 0);
