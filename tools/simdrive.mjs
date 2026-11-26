// A headless drive of the test page of the new driving model (game/lab-sim.html), with the keys held: the page is served from the repository, the keys go in as real key events
// (arrow up and arrow right held), and after `--seconds` (20) the state of the car is read: no page error, a speed above 30 km/h, still inside the pad. Writes a picture with --shot.
// (--eval=<js> prints a value from the page at the end)
// Usage: node tools/simdrive.mjs [--seconds=20] [--steerAfter=6 (the steering keys go down after that many seconds)] [--mode=arcade|sport|sim] [--car=stock] [--keys=ArrowUp,ArrowRight] [--size=1280x720] [--touch] [--tier=high] [--shot=file.png] [--minkmh=30] [--query=...] [--jitter[=raw]]
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const stops = []; process.on('exit', () => stops.forEach((f) => f()));
const web = spawn('python3', ['-m', 'http.server', String(21000 + Math.floor(Math.random() * 3000)), '--bind', '127.0.0.1'], { stdio: 'ignore', detached: true });
const webPort = web.spawnargs[3]; stops.push(() => { try { process.kill(-web.pid, 'SIGKILL'); } catch {} }); await sleep(800);
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
const [w, h] = (opt.size ?? '1280x720').split('x').map(Number), seconds = +(opt.seconds ?? 20), keys = (opt.keys ?? 'ArrowUp,ArrowRight').split(',').filter(Boolean);
const b = await browser();
await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!opt.touch });
if (opt.touch) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/game/lab-sim.html?tier=${opt.tier ?? 'high'}${opt.mode ? '&mode=' + opt.mode : ''}${opt.car ? '&car=' + opt.car : ''}${opt.touch ? '&touch=1' : ''}${opt.jitter ? '&cruise=13.9' + (opt.jitter === 'raw' ? '&raw=1' : '') : ''}${opt.query ? '&' + opt.query : ''}` });
let ok = false; for (let i = 0; i < 240 && !(ok = await b.ev('!!window.__sim && __sim.frames > 5')); i++) await sleep(500);
if (!ok) { console.log(JSON.stringify({ error: 'the page did not start', logs: b.logs.slice(0, 3) })); process.exit(1); }
const code = (k) => ({ ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, ShiftLeft: 16, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68 }[k] ?? 0);
const press = (k, type) => b.send('Input.dispatchKeyEvent', { type, code: k, key: k.startsWith('Arrow') ? k : k === 'Space' ? ' ' : k.replace('Key', ''), windowsVirtualKeyCode: code(k) });
const steerAfter = +(opt.steerAfter ?? 0), steerKeys = keys.filter((k) => /Left|Right|KeyA|KeyD/.test(k)), holdKeys = keys.filter((k) => !steerKeys.includes(k));
for (const k of holdKeys) await press(k, 'rawKeyDown');
if (!steerAfter) for (const k of steerKeys) await press(k, 'rawKeyDown');
if (opt.jitter) {   // the DRAWN car against the camera at a steady 50 km/h: the car's place in camera space frame to frame; the largest jump (cm). --jitter=raw draws the unblended state
  for (const k of holdKeys) await press(k, 'rawKeyDown');
  for (let i = 0; i < 60 && (await b.ev('__sim.state.speed')) < 13.5; i++) await sleep(500);
  await sleep(200); await b.ev('__sim.startProbe()'); await sleep(+(opt.probeSeconds ?? 4) * 1000);
  const p = await b.ev('__sim.stopProbe()'); let max = 0, sum = 0;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]); max = Math.max(max, d); sum += d; }
  console.log('jitter:', JSON.stringify({ frames: p.length, maxJumpCm: +(max * 100).toFixed(2), meanStepCm: +((sum / Math.max(1, p.length - 1)) * 100).toFixed(2), speedKmh: Math.round(3.6 * (await b.ev('__sim.state.speed'))) }));
}
const f0 = await b.ev('__sim.frames'), t0 = Date.now(); let top = 0, minX = 1e9, maxX = -1e9, maxBeta = 0, gearTop = 0;
let steering = !steerAfter;
while (Date.now() - t0 < seconds * 1000) { await sleep(500); if (!steering && Date.now() - t0 > steerAfter * 1000) { steering = true; for (const k of steerKeys) await press(k, 'rawKeyDown'); } const st = JSON.parse(await b.ev('JSON.stringify({ v: __sim.state.speed, x: __sim.state.x, z: __sim.state.z, beta: __sim.state.beta, gear: __sim.state.gear, rpm: __sim.state.rpm })')); top = Math.max(top, st.v * 3.6); minX = Math.min(minX, st.x); maxX = Math.max(maxX, st.x); maxBeta = Math.max(maxBeta, Math.abs(st.beta)); gearTop = Math.max(gearTop, st.gear); }
const end = JSON.parse(await b.ev('JSON.stringify({ v: __sim.state.speed, x: __sim.state.x, z: __sim.state.z, h: __sim.state.h, gear: __sim.state.gear, rpm: __sim.state.rpm, finite: Object.values({ x: __sim.state.x, z: __sim.state.z, vx: __sim.state.vx, vz: __sim.state.vz, rpm: __sim.state.rpm, y: __sim.state.y }).every(Number.isFinite), frames: __sim.frames })'));
if (opt.shot) { const s = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(opt.shot, Buffer.from(s.result.data, 'base64')); }
if (opt.eval) console.log('eval:', JSON.stringify(await b.ev(opt.eval)));
for (const k of keys) await press(k, 'keyUp');
const out = { seconds, fps: +(((end.frames - f0) * 1000) / (Date.now() - t0)).toFixed(1), topKmh: Math.round(top), endKmh: Math.round(end.v * 3.6), topGear: gearTop, maxBodyAngleDeg: Math.round((maxBeta * 180) / Math.PI), end: { x: +end.x.toFixed(1), z: +end.z.toFixed(1), rpm: Math.round(end.rpm) }, finite: end.finite, errors: b.logs.length, logs: b.logs.slice(0, 3) };
const broken = []; if (b.logs.length) broken.push('page errors'); if (!end.finite) broken.push('not finite'); if (top < +(opt.minkmh ?? 30)) broken.push(`top speed only ${Math.round(top)} km/h`);
console.log(JSON.stringify({ ...out, broken })); b.close(); process.exit(broken.length ? 1 : 0);
