// Several headless browsers (default 3, at most 3) open the demo page together and drive for a few seconds.
// Prints what each one sees (visitors, other cars drawn, bytes on the wire) and writes a picture of the first.
// Usage: node tools/crowd.mjs [browsers=3] [seconds=14] [picture-name]   (software graphics; its own free ports)
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

const K = Math.min(3, +(process.argv[2] ?? 3)), SECS = +(process.argv[3] ?? 14), NAME = process.argv[4] ?? 'demo-crowd';
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const stopAll = () => { for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {} };
process.on('exit', stopAll);

async function open(i) {
  const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-crowd-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  procs.push(proc);
  let target;
  for (let t = 0; t < 50 && !target; t++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:8150/game/demo.html?tier=low&car=${i % 5}` });
  for (let t = 0; t < 60 && !(await ev('!!window.__net && __net.me')); t++) await sleep(500);
  const key = (type, code, key, vk) => send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk });
  return { i, send, ev, key, ws, profile };
}

const bs = [];
for (let i = 0; i < K; i++) bs.push(await open(i)); // one after the other: the browsers do not start together
for (const b of bs) { await b.key('rawKeyDown', 'ArrowUp', 'ArrowUp', 38); }
const t0 = Date.now();
for (let s = 0; Date.now() - t0 < SECS * 1000; s++) {
  for (const b of bs) { if (s % 2 === 0) await b.key('rawKeyDown', 'ArrowRight', 'ArrowRight', 39); else await b.key('keyUp', 'ArrowRight', 'ArrowRight', 39); if (s % 5 === 3) await b.key('rawKeyDown', 'Space', ' ', 32); if (s % 5 === 4) await b.key('keyUp', 'Space', ' ', 32); }
  await sleep(700);
}
const report = [];
for (const b of bs) report.push(JSON.parse(await b.ev(`JSON.stringify({ me: __net.me?.name, visitorsInRoster: __net.roster.size, othersDrawn: __net.sample().length, drawnNames: [...document.querySelectorAll('.tag')].filter(t=>!t.hidden).map(t=>t.textContent), counterText: document.getElementById('online-n').textContent, framesInPerSec: +(__net.framesIn/${SECS + 2}).toFixed(1), bytesInPerSec: Math.round(__net.bytesIn/${SECS + 2}), bytesOutPerSec: Math.round(__net.bytesOut/${SECS + 2}), speedKmh: Math.round(Math.hypot(__drift.state.vx,__drift.state.vz)*3.6), triangles: __drift.renderer.info.render.triangles, calls: __drift.renderer.info.render.calls })`)));
const shot = await bs[0].send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`docs/screenshots/${NAME}.png`, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ browsers: K, report, relay: await (await fetch('http://127.0.0.1:8150/relay-stats')).json() }, null, 1));
for (const b of bs) b.ws.close();
stopAll(); await sleep(400);
for (const b of bs) rmSync(b.profile, { recursive: true, force: true });
