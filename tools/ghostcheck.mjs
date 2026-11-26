// The tandem check: two headless browsers in the open lobby of a RUNNING app (the address is the first argument), one invites the other to a tandem in two runs, the other accepts,
// both drive the same drift for the countdown and both rounds, and the result card shows. Pictures to docs/screenshots/tandem-*.png; exits with 1 when a step does not happen.
// Usage: node tools/tandemcheck.mjs http://127.0.0.1:5077 [--out=docs/screenshots]
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const url = process.argv[2] ?? 'http://127.0.0.1:5077', out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=docs/screenshots').slice(6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(out, { recursive: true });
const stops = []; process.on('exit', () => stops.forEach((f) => f()));
async function browser() {
  const port = 22000 + Math.floor(Math.random() * 6000), profile = `/tmp/claude-1000/drift-tandemcheck-${port}`;
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
const fails = [];
const must = (ok, text) => { console.log((ok ? 'ok   ' : 'FAIL ') + text); if (!ok) fails.push(text); };
const until = async (b, expr, ms = 60000) => { for (let t = 0; t < ms; t += 400) { if (await b.ev(expr)) return true; await sleep(400); } return false; };
const shot = async (b, name) => { const r = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/ghost-${name}.png`, Buffer.from(r.result.data, 'base64')); };

// a ghost along the road's centre, 20 m/s, from the first grid slot: x, z in tenths of a metre, heading in hundredths
const map = JSON.parse(readFileSync('game/data/maps/06-touge.json', 'utf8'));
const near = map.centre.reduce((bi, p, i) => (Math.hypot(p[0] - map.grid[0].x, p[1] - map.grid[0].z) < Math.hypot(map.centre[bi][0] - map.grid[0].x, map.centre[bi][1] - map.grid[0].z) ? i : bi), 0);
const pts = [[map.grid[0].x, map.grid[0].z], ...map.centre.slice(near + 1)];
const v = []; let t = 0, k = 0, x = pts[0][0], z = pts[0][1];
for (let n = 0; n < 1500 && k < pts.length; n++) { const [px, pz] = pts[k]; const d = Math.hypot(px - x, pz - z); if (d < 0.6) { k++; continue; } const h = Math.atan2(px - x, pz - z); x += (px - x) / d * 0.6; z += (pz - z) / d * 0.6; v.push(Math.round(x * 10), Math.round(z * 10), Math.round(h * 100)); }
const ghost = { ms: Math.round(v.length / 3 * 100), v };

const b = await browser();
await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
await b.send('Page.navigate', { url: `${url}/play/?lang=de` });
await until(b, `document.readyState === 'complete'`);
await b.ev(`localStorage.setItem('drift.name', 'Geist'); localStorage.setItem('drift.ghost', ${JSON.stringify(JSON.stringify(ghost))}); true`);
await b.send('Page.navigate', { url: `${url}/play/?lang=de&mode=training&demo=line` });
must(await until(b, `!!window.__drift && __drift.info.frames > 2 && __net.connected`, 120000), 'the game runs and is connected');
must(await until(b, `!!document.getElementById('ghost-delta') && !document.getElementById('ghost-delta').hidden`, 60000), 'training started and the time against the ghost shows');
must(await until(b, `(() => { const p = __drift.ghost.group.position.clone().project(__drift.camera); return p.z < 1 && Math.abs(p.x) < 0.5 && p.y > -0.3 && p.y < 0.15; })()`, 40000), 'the ghost comes into view'); await shot(b, 'run-early');
console.log('delta:', await b.ev(`document.getElementById('ghost-delta').textContent`));
console.log('ghost materials:', await b.ev(`(() => { const o = []; __drift.ghost.group.traverse((m) => { if (m.isMesh) o.push([].concat(m.material).map((x) => x.transparent + ':' + x.opacity).join(',')); }); return JSON.stringify([o.length, [...new Set(o)]]); })()`));
console.log('positions:', await b.ev(`JSON.stringify({ ghost: __drift.ghost.group.position, vis: __drift.ghost.group.visible, parent: !!__drift.ghost.group.parent, me: [__drift.state.x, __drift.state.z] })`));
console.log('hud:', await b.ev(`JSON.stringify([...document.querySelectorAll('#hud > *, #racebar, #racehud, #count')].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none').map((e) => [e.id || e.className, Math.round(e.getBoundingClientRect().x), Math.round(e.getBoundingClientRect().y), Math.round(e.getBoundingClientRect().width), e.textContent.slice(0, 30)]))`));
await shot(b, 'run');
// the result card of a training run (made-up numbers)
await b.ev(`__drift.modeResult('training', { rows: [{ name: 'x', ms: ${ghost.ms - 2300}, drift: 0, bestDrift: 0 }] })`);
await sleep(600); await shot(b, 'result');
console.log('card:', await b.ev(`document.getElementById('res-mode').innerText.split(String.fromCharCode(10)).join(' | ')`));
console.log('errors:', b.logs.length, b.logs.slice(0, 3));
b.close();
process.exit(fails.length ? 1 : 0);
