// The same shots in two looks (A and B) on one sheet, with frame time, draw calls and triangles for each: node tools/lookshots.mjs [--out=docs/screenshots/look-b] [--tier=low]
// Shots: ?map=touge&shot=tal and shot=kehre, at 1280x720 (PC) and 844x390 (phone landscape, touch). The repository is served by a python http.server of its own.
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const out = opt.out ?? 'docs/screenshots/look-b', tier = opt.tier ?? 'low';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const stops = []; process.on('exit', () => stops.forEach((f) => f()));
const wp = 21000 + Math.floor(Math.random() * 3000);
const web = spawn('python3', ['-m', 'http.server', String(wp), '--bind', '127.0.0.1'], { stdio: 'ignore', detached: true });
stops.push(() => { try { process.kill(-web.pid, 'SIGKILL'); } catch {} }); await sleep(800);
const port = 22000 + Math.floor(Math.random() * 6000), profile = `/tmp/claude-1000/drift-lookshots-${port}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
stops.push(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} });
let target; for (let i = 0; i < 60 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(), logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(m.params).slice(0, 200)); };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable'); mkdirSync(out, { recursive: true });
const rows = [];
for (const [sizeName, w, h, touch] of [['pc', 1280, 720, false], ['phone', 844, 390, true]]) for (const shot of ['tal', 'kehre']) for (const look of ['a', 'b']) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: touch });
  await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `http://127.0.0.1:${wp}/game/index.html?lang=de&map=touge&shot=${shot}&look=${look}&tier=${tier}${touch ? '&touch=1' : ''}` });
  await sleep(1500);
  for (let i = 0; i < 240 && !(await ev('!!window.__drift && __drift.info.frames > 30')); i++) await sleep(500);
  await sleep(1500);
  const st = JSON.parse(await ev(`new Promise((res) => { let n = 0, t0 = performance.now(); const f = () => { if (++n === 40) { const r = __drift.renderer.info.render; res(JSON.stringify({ ms: (performance.now() - t0) / 40, calls: r.calls, triangles: r.triangles, lookName: __drift.stage.look.name })); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })`));
  const file = `${out}/${shot}-${look}-${sizeName}.png`; writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  rows.push({ sizeName, shot, look, file, ...st });
}
if (opt.chip) {   // the menu chip: A -> B -> A live, kept on the device; and the test page with ?look=b
  await send('Page.navigate', { url: `http://127.0.0.1:${wp}/game/index.html?lang=de&map=touge&tier=${tier}` });
  for (let i = 0; i < 240 && !(await ev('!!window.__drift && __drift.info.frames > 30')); i++) await sleep(500);
  console.log('chip:', await ev(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), c = () => document.getElementById('look-chip'), n = () => __drift.stage.look.name, a0 = [n(), c().textContent, localStorage.getItem('drift.look')]; c().click(); await w(4000); const a1 = [n(), c().textContent, localStorage.getItem('drift.look')]; c().click(); await w(4000); return JSON.stringify([a0, a1, [n(), c().textContent, localStorage.getItem('drift.look')], __drift.info.frames]); })()`));
  await send('Page.navigate', { url: `http://127.0.0.1:${wp}/game/lab-sim.html?look=b&tier=low` });
  for (let i = 0; i < 240 && !(await ev('!!window.__sim && __sim.frames > 5')); i++) await sleep(500);
  console.log('lab-sim look:', await ev('__sim.stage.look.name'));
}
const sheet = `<body style="margin:0;background:#16131c;color:#cfc;font:13px monospace;padding:8px;width:1900px">${['pc', 'phone'].map((sn) => `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">${rows.filter((r) => r.sizeName === sn).map((r) => `<figure style="margin:0"><img style="width:100%" src="data:image/png;base64,${readFileSync(r.file).toString('base64')}"><figcaption>${sn} ${r.shot} look ${r.look.toUpperCase()}: ${r.ms.toFixed(1)} ms, ${r.calls} draw calls, ${r.triangles} triangles (${r.lookName})</figcaption></figure>`).join('')}</div>`).join('')}</body>`;
const sf = `${profile}.html`; writeFileSync(sf, sheet);
await send('Emulation.setTouchEmulationEnabled', { enabled: false }); await send('Emulation.setDeviceMetricsOverride', { width: 1916, height: 2400, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `file://${sf}` }); await sleep(1500);
const dim = JSON.parse(await ev('JSON.stringify({h: document.body.scrollHeight})'));
await send('Emulation.setDeviceMetricsOverride', { width: 1916, height: dim.h + 16, deviceScaleFactor: 1, mobile: false }); await sleep(400);
writeFileSync(`${out}/sheet.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); rmSync(sf, { force: true });
console.log(JSON.stringify({ sheet: `${out}/sheet.png`, rows: rows.map(({ file, ...r }) => r), errors: logs.slice(0, 3) }, null, 1));
ws.close(); stops.forEach((f) => f()); rmSync(profile, { recursive: true, force: true }); process.exit(0);
