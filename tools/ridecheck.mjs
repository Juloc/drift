// The ride check: a real browser drives a real game page for a while and every picture is measured, to find what a player calls "rubber-banding": the car or the
// camera jumping between two pictures, and the server pulling the car back (a correction: the relay refused a pose). Against a RUNNING app (the address is the first
// argument) it joins the open lobby without an account and counts the corrections; with --static it serves the repository itself (no server, no socket).
// The track bot (or the line bot with the hills off) drives: ?demo=line. Prints the numbers as JSON; exits with 1 when a limit is broken.
// Usage: node tools/ridecheck.mjs http://127.0.0.1:5077 [--phys=1|0] [--seconds=45] [--size=1280x720] [--tier=high] [--static] [--trace=file.json]
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const t = a.slice(2), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const stops = []; process.on('exit', () => stops.forEach((f) => f()));
let base = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5077', page = '/play/';
if (opt.static) { const port = 21000 + Math.floor(Math.random() * 3000), web = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore', detached: true }); stops.push(() => { try { process.kill(-web.pid, 'SIGKILL'); } catch {} }); await sleep(800); base = `http://127.0.0.1:${port}`; page = '/game/index.html'; }
export const LIMITS = { corrections: 0, carJump: 0.35, camJump: 0.35, camTurnDeg: 6, camStretch: 1.2, longFrames: 0.02 };
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
const phys = opt.phys ?? '1', seconds = +(opt.seconds ?? 45), [w, h] = (opt.size ?? '1280x720').split('x').map(Number);
const b = await browser();
await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
if (!opt.static) { await b.send('Page.navigate', { url: `${base}/play/?lang=de` }); for (let i = 0; i < 40 && !(await b.ev(`document.readyState === 'complete'`)); i++) await sleep(250); await b.ev(`localStorage.setItem('drift.name', 'Ride'); true`); }
await b.send('Page.navigate', { url: `${base}${page}?lang=de&map=touge&demo=${opt.demo ?? 'line'}&phys=${phys}&tier=${opt.tier ?? 'high'}${opt.query ? '&' + opt.query : ''}`.replace('&map=touge', opt.static ? '&map=touge' : '') });
let ok = false; for (let i = 0; i < 240 && !(ok = await b.ev('!!window.__drift && __drift.info.frames > 5')); i++) await sleep(500);
if (!ok) { console.log(JSON.stringify({ error: 'the game did not start', logs: b.logs.slice(0, 3) })); process.exit(1); }
if (!opt.static) for (let i = 0; i < 40 && !(await b.ev('!!window.__net && __net.connected')); i++) await sleep(250);
// every picture: the time, the car's state and where it is drawn, the camera, and how many corrections came from the server so far
await b.ev(`(() => { const R = window.__ride = { t: [], x: [], z: [], y: [], v: [], cx: [], cy: [], cz: [], yaw: [], fix: 0, fixAt: [] };
  if (window.__net) { const old = __net.onFix.bind(__net); __net.onFix = (f) => { R.fix++; R.fixAt.push([performance.now(), __drift.state.x, __drift.state.z, f.x, f.z]); old(f); }; }
  const tick = (now) => { const s = __drift.state, g = __drift.carGroup.position, c = __drift.camera, d = c.getWorldDirection(new c.position.constructor());
    R.t.push(now); R.x.push(g.x); R.z.push(g.z); R.y.push(g.y); R.v.push(Math.hypot(s.vx, s.vz)); R.cx.push(c.position.x); R.cy.push(c.position.y); R.cz.push(c.position.z); R.yaw.push(Math.atan2(d.x, d.z)); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })()`);
await sleep(seconds * 1000);
const R = JSON.parse(await b.ev('JSON.stringify(window.__ride)')), net = opt.static ? null : JSON.parse(await b.ev('JSON.stringify({ connected: __net.connected, roster: __net.roster.size })'));
if (opt.shot) { const s = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(opt.shot, Buffer.from(s.result.data, 'base64')); }
b.close();
// a jump: how far the car (the camera) moved between two pictures beyond what its speed covers in that time
const n = R.t.length, out = { phys: +phys, online: !opt.static, seconds, frames: n, fps: +(((n - 1) * 1000) / (R.t[n - 1] - R.t[0])).toFixed(1), corrections: R.fix, net };
let carJump = 0, camJump = 0, camTurn = 0, long = 0, worstAt = null, vMax = 0; const dts = [];
const camDist = [];
for (let i = 1; i < n; i++) {
  const dt = (R.t[i] - R.t[i - 1]) / 1000; dts.push(dt); if (dt > 0.05) long++;
  if (R.t[i] - R.t[0] < 3000) continue;   // (the first seconds: the car is put on its start place and the camera settles)
  camDist.push(Math.hypot(R.cx[i] - R.x[i], R.cz[i] - R.z[i]));
  const v = Math.max(R.v[i], R.v[i - 1]); vMax = Math.max(vMax, v);
  const dCar = Math.hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1], R.y[i] - R.y[i - 1]), exCar = dCar - v * dt * 1.25;
  const dCam = Math.hypot(R.cx[i] - R.cx[i - 1], R.cz[i] - R.cz[i - 1], R.cy[i] - R.cy[i - 1]), exCam = dCam - (v + 6) * dt * 1.3;
  let dy = Math.abs(R.yaw[i] - R.yaw[i - 1]); if (dy > Math.PI) dy = 2 * Math.PI - dy;
  if (exCar > carJump) { carJump = exCar; worstAt = { s: +((R.t[i] - R.t[0]) / 1000).toFixed(2), moved: +dCar.toFixed(2), dtMs: Math.round(dt * 1000), v: +v.toFixed(1) }; }
  camJump = Math.max(camJump, exCam); camTurn = Math.max(camTurn, dy / Math.max(dt, 1 / 120) / 60);
}
dts.sort((p, q) => p - q);
// the elastic band: the camera's distance to the car over the drive (it should hardly change with the speed), and the car's drawn speed against its true speed
out.camDistance = [+Math.min(...camDist).toFixed(2), +Math.max(...camDist).toFixed(2)];
Object.assign(out, { topKmh: Math.round(vMax * 3.6), carJump: +carJump.toFixed(3), carJumpAt: worstAt, camJump: +camJump.toFixed(3), camTurnDegPerFrame: +((camTurn * 180) / Math.PI).toFixed(2), longFrames: +(long / n).toFixed(3), frameMsMedian: Math.round(dts[dts.length >> 1] * 1000), frameMsWorst: Math.round(dts[dts.length - 1] * 1000), fixAt: R.fixAt.slice(0, 6).map((f) => f.map((v) => +v.toFixed(1))), errors: b.logs.slice(0, 3) });
const broken = [];
if (out.corrections > LIMITS.corrections) broken.push(`${out.corrections} corrections from the server`);
if (out.carJump > LIMITS.carJump) broken.push(`the car jumps ${out.carJump} m between two pictures`);
if (out.camJump > LIMITS.camJump) broken.push(`the camera jumps ${out.camJump} m between two pictures`);
if (out.camTurnDegPerFrame > LIMITS.camTurnDeg) broken.push(`the camera turns ${out.camTurnDegPerFrame} degrees in a sixtieth of a second`);
if (out.camDistance[1] - out.camDistance[0] > LIMITS.camStretch) broken.push(`the camera's distance to the car goes from ${out.camDistance[0]} to ${out.camDistance[1]} m (an elastic band)`);
out.broken = broken;
if (opt.trace) writeFileSync(opt.trace, JSON.stringify(R));
console.log(JSON.stringify(out));
process.exit(broken.length ? 1 : 0);
