// Three signed-in browsers (headless, software graphics, own free ports) race one lap in the app: one starts the race, the
// others join, an autopilot in each page follows the centre line. Prints what was seen and writes pictures.
// Usage: node tools/race-run.mjs <base url> <cookies.json> [laps=1]
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

const [base, cookieFile, lapsArg] = process.argv.slice(2);
const laps = +(lapsArg ?? 1);
const cookies = JSON.parse(readFileSync(cookieFile, 'utf8'));
const names = Object.keys(cookies).slice(0, 3);
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const stopAll = () => { for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {} };
process.on('exit', stopAll);

async function open(name) {
  const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-race-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  procs.push(proc);
  let target;
  for (let t = 0; t < 50 && !target; t++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')) logs.push(JSON.stringify(m.params).slice(0, 300)); };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  const [cname, cval] = cookies[name].split('=');
  await send('Network.setCookie', { name: cname, value: cval, url: base });
  await send('Page.navigate', { url: base + '/play/?tier=low' });
  for (let i = 0; i < 80 && !(await ev('!!window.__net && __net.me')); i++) await sleep(400);
  const shot = async (file) => writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  const close = () => { ws.close(); try { process.kill(-proc.pid, 'SIGKILL'); } catch {} setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); };
  return { name, ev, shot, close, logs };
}

// an autopilot for the page: steer at a point ahead on the centre line, hold 17 to 22 m/s; it only drives while the race HUD shows
const AUTOPILOT = `(() => { if (window.__auto) return; window.__auto = setInterval(() => {
  const d = window.__drift, s = d.state, c = d.map.centre, held = d.input.held;
  if (document.getElementById('racehud').hidden) { held.clear(); return; }
  let bi = 0, bd = 1e12; for (let i = 0; i < c.length; i++) { const q = (c[i][0]-s.x)**2 + (c[i][1]-s.z)**2; if (q < bd) { bd = q; bi = i; } }
  const look = c[(bi + 4) % c.length];
  let err = Math.atan2(look[0]-s.x, look[1]-s.z) - s.h; while (err > Math.PI) err -= 2*Math.PI; while (err < -Math.PI) err += 2*Math.PI;
  held.delete('key:left'); held.delete('key:right'); held.delete('key:gas'); held.delete('key:brake');
  if (err > 0.06) held.add('key:right'); else if (err < -0.06) held.add('key:left');
  const sp = Math.hypot(s.vx, s.vz); if (sp < 17) held.add('key:gas'); else if (sp > 22) held.add('key:brake');
}, 50); })()`;

const bs = [];
for (const n of names) bs.push(await open(n));
const report = { names };
for (const b of bs) { await b.ev(AUTOPILOT); }
// the first starts a race of `laps` laps, the others join
await bs[0].ev(`__net.sendJson({ t: 'race.start', laps: ${laps} })`);
await sleep(1500);
report.inviteSeen = [];
for (const b of bs.slice(1)) report.inviteSeen.push(await b.ev("!document.getElementById('invite').hidden"));
await bs[1].shot('docs/screenshots/m3-invite.png');
for (const b of bs.slice(1)) await b.ev("document.getElementById('invite-yes').click()");
// the grid, the countdown, the race
for (let i = 0; i < 60 && !(await bs[0].ev("!document.getElementById('count').hidden")); i++) await sleep(400);
await sleep(1500);
await bs[0].shot('docs/screenshots/m3-count.png');
let phase = '';
for (let i = 0; i < 400 && !(await bs[0].ev("!document.getElementById('result').hidden")); i++) {
  await sleep(1000);
  if (i === 20) await bs[0].shot('docs/screenshots/m3-race.png');
  phase = await bs[0].ev("document.getElementById('rh-pos').textContent + ' ' + document.getElementById('rh-lap').textContent + ' ' + document.getElementById('rh-time').textContent");
  if (i % 10 === 0) console.error('...', phase);
}
await sleep(800);
report.result = [];
for (const b of bs) report.result.push(await b.ev("JSON.stringify([...document.querySelectorAll('#res-table tr')].map(tr => [...tr.children].map(td => td.textContent)))"));
await bs[0].shot('docs/screenshots/m3-result.png');
report.problems = bs.map((b) => b.logs);
for (const b of bs) b.close();
console.log(JSON.stringify(report, null, 1));
await sleep(600); stopAll();
