// Pictures and numbers of a model file in the showroom (headless Chromium, software graphics, one browser at a time).
// Usage: node tools/carshots.mjs <glb name> <out dir> [views=front,rear,side,phone] [paint=e8e8ea]
//   front / rear / side: the high tier at 1200x800;  phone: the low tier at 844x390 (a phone held sideways), front view.
// Serves the repository itself on a free port (static files only). Prints one JSON line per picture with the showroom's numbers.
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const [name, out = 'docs/screenshots', viewList = 'front,rear,side,phone', paint = 'e8e8ea', extra = ''] = process.argv.slice(2);   // extra: more address options, e.g. '&pop=1&brake=1'
if (!name) { console.error('usage: node tools/carshots.mjs <glb name> <out dir> [views] [paint]'); process.exit(2); }
const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const body = fs.readFileSync(p);
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const web = `http://127.0.0.1:${server.address().port}`;

const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-carshots-${port}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} fs.rmSync(profile, { recursive: true, force: true }); server.close(); };
process.on('exit', stop);
let target;
for (let t = 0; t < 50 && !target; t++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(), logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + m.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
fs.mkdirSync(out, { recursive: true });

for (const v of viewList.split(',')) {
  const phone = v === 'phone';
  const [w, h] = phone ? [844, 390] : [1200, 800];
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: phone });
  const url = `${web}/game/showroom.html?glb=${encodeURIComponent(name)}&view=${phone ? 'front' : v}&tier=${phone ? 'low' : 'high'}&dpr=1&info=1&paint=${paint}${extra}`;
  const t0 = Date.now();
  await send('Page.navigate', { url });
  let info = null;
  for (let t = 0; t < 120 && !info?.glb; t++) { await sleep(500); info = await ev('window.__showroom && JSON.parse(JSON.stringify(window.__showroom))'); }
  await sleep(1500);
  info = await ev('JSON.parse(JSON.stringify(window.__showroom))');
  const file = path.join(out, `${name}-${v}${extra ? '-fx' : ''}.png`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log(JSON.stringify({ view: v, file, pageMs: Date.now() - t0, ...info }));
}
if (logs.length) console.log('console:', logs.slice(0, 20).join('\n  '));
stop();
process.exit(0);
