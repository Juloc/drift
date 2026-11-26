// A short drive sequence of the game: opens the page (default game/index.html), lets the car run (?run=1 keeps a named shot going), takes several pictures
// one after the other and puts them on a sheet, so smoke, lights and the camera can be judged over time, not on one frozen frame.
// Usage: devq node tools/sequence.mjs <width> <height> <name> [--query=map=touge&shot=kehre&run=1] [--frames=6] [--every=350 (ms)] [--touch] [--tier=high|low] [--dpr=1]
//        [--out=/tmp/claude-1000/drift-sequence] [--port=8163 (a static server of the repository)] [--page=game/index.html] [--eval=js run before the first picture]
// Writes <out>/<name>-01.png ... and <out>/<name>-sheet.png (the pictures in a row or a grid, with the time of each).
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const [w, h, name, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const frames = +(opt.frames ?? 6), every = +(opt.every ?? 350), out = opt.out ?? '/tmp/claude-1000/drift-sequence';
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-seq-${port}`;
const url = `http://127.0.0.1:${opt.port ?? 8163}/${opt.page ?? 'game/index.html'}?lang=${opt.lang ?? 'de'}${opt.touch ? '&touch=1' : ''}${opt.tier ? '&tier=' + opt.tier : ''}${opt.query ? '&' + opt.query : ''}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
if (!target) { stop(); throw new Error('no browser'); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(), logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') logs.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split('\n')[0]); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const files = [];
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +(opt.dpr ?? 1), mobile: !!opt.touch });
  if (opt.touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  for (let i = 0; i < 240 && !(await ev('!!window.__drift && __drift.info.frames > 2')); i++) await sleep(500);
  if (!(await ev('!!window.__drift'))) throw new Error('the game did not start: ' + logs.slice(0, 2).join(' '));
  if (opt.eval) await ev(opt.eval);
  for (let k = 0; k < frames; k++) {
    await sleep(every);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const f = `${out}/${name}-${String(k + 1).padStart(2, '0')}.png`;
    writeFileSync(f, Buffer.from(shot.result.data, 'base64')); files.push(f);
  }
  // the sheet: two columns for wide pictures, drawn by the same browser from a file
  const cols = frames <= 3 ? frames : Math.ceil(frames / 2), tw = Math.floor(1880 / cols) - 8, th = Math.round(tw * (+h / +w));
  const html = `<body style="margin:0;background:#16131c;color:#cfc;font:12px monospace;padding:8px;width:1880px"><div style="display:flex;flex-wrap:wrap;gap:8px">${files.map((f, i) => `<figure style="margin:0"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="display:block;width:${tw}px;height:${th}px"><figcaption>${name} ${i + 1}/${frames} · ${((i + 1) * every / 1000).toFixed(1)} s</figcaption></figure>`).join('')}</div></body>`;
  const sheetFile = `${profile}-sheet.html`; writeFileSync(sheetFile, html);
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setDeviceMetricsOverride', { width: 1896, height: (th + 24) * Math.ceil(frames / cols) + 24, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `file://${sheetFile}` }); await sleep(1200);
  const sheet = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}-sheet.png`, Buffer.from(sheet.result.data, 'base64'));
  rmSync(sheetFile, { force: true });
  console.log(JSON.stringify({ name, frames, sheet: `${out}/${name}-sheet.png`, errors: logs.slice(0, 3) }));
} finally { ws.close(); stop(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
