// Plays the game in headless Chromium through the DevTools protocol and writes numbers and pictures.
// No packages: node's own WebSocket and fetch. One browser at a time, software graphics (there is no GPU here), so
// frame times are NOT phone numbers: they show that the page runs and what it draws.
// Usage: node tools/play.mjs <width> <height> <name> [--touch] [--tier=low|medium|high] [--secs=8] [--dpr=1] [--query=a=b&c=d] [--web=http://127.0.0.1:8150 | --port=8150]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const [w, h, name, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split(/=(.*)/s)).map(([k, v]) => [k, v ?? true]));   // split at the first '=' only
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const port = 20000 + Math.floor(Math.random() * 20000); // a free one of our own: other projects' browsers may listen on others
const url = `${opt.web ?? 'http://127.0.0.1:' + (opt.port ?? 8150)}/game/index.html?debug=1${opt.touch ? '&touch=1' : ''}${opt.tier ? '&tier=' + opt.tier : ''}${opt.query ? '&' + opt.query : ''}`;
const profile = `/tmp/claude-1000/drift-play-${port}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
if (!target) { stop(); throw new Error('no browser'); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(m.params).slice(0, 300));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +(opt.dpr ?? 1), mobile: !!opt.touch });
if (opt.touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url });
for (let i = 0; i < 60 && !(await evalJs('!!window.__drift')); i++) await sleep(500);
await sleep(1500);

const secs = +(opt.secs ?? 8);
// the page's own frame counter gives the real frame rate under software graphics
const f0 = await evalJs('window.__drift.info.frames'); const t0 = Date.now();
const centre = async (sel) => JSON.parse(await evalJs(`(()=>{const r=document.querySelector('${sel}').getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height})})()`));
const touchState = [];
if (opt.touch) {
  // gas (right thumb) and steer right (left thumb) at the same time = two fingers
  const gas = await centre('[data-ctl="gas"]'), right = await centre('[data-ctl="right"]'), hand = await centre('[data-ctl="hand"]');
  const pt = (b, i) => ({ x: b.x, y: b.y, id: i });
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(gas, 1)] });
  await sleep(secs * 250);
  touchState.push(['gas only', await evalJs('JSON.stringify(window.__drift.input.read())'), Math.round(await evalJs('Math.hypot(__drift.state.vx,__drift.state.vz)*3.6'))]);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(gas, 1), pt(right, 2)] });
  await sleep(secs * 250);
  touchState.push(['gas + steer right', await evalJs('JSON.stringify(window.__drift.input.read())'), Math.round(await evalJs('Math.hypot(__drift.state.vx,__drift.state.vz)*3.6'))]);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(gas, 1), pt(right, 2), pt(hand, 3)] });
  await sleep(secs * 200);
  touchState.push(['gas + steer + handbrake', await evalJs('JSON.stringify(window.__drift.input.read())'), Math.round(await evalJs('Math.hypot(__drift.state.vx,__drift.state.vz)*3.6'))]);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(gas, 1), pt(right, 2)] }); // handbrake finger up
  await sleep(secs * 300);
} else {
  const key = (type, code, key) => send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: { ArrowUp: 38, ArrowRight: 39, Space: 32 }[code] });
  await key('rawKeyDown', 'ArrowUp', 'ArrowUp'); await sleep(secs * 250);
  await key('rawKeyDown', 'ArrowRight', 'ArrowRight'); await key('rawKeyDown', 'Space', ' '); await sleep(secs * 150);
  await key('keyUp', 'Space', ' '); await sleep(secs * 450);
}
const frames = (await evalJs('window.__drift.info.frames')) - f0, ms = Date.now() - t0;
const stats = JSON.parse(await evalJs(`(()=>{const r=__drift.renderer.info.render;const s=__drift.state;const sc=__drift.score;return JSON.stringify({triangles:r.triangles,calls:r.calls,tier:__drift.view.tier,buffer:[__drift.renderer.domElement.width,__drift.renderer.domElement.height],speedKmh:Math.round(Math.hypot(s.vx,s.vz)*3.6),pos:[Math.round(s.x),Math.round(s.z)],score:Math.round(sc.pending+sc.banked),dbg:document.getElementById('debug').textContent})})()`));
const parts = JSON.parse(await evalJs(`(()=>{const o=[];__drift.view.scene.traverse(m=>{if(m.geometry&&m.geometry.index){const n=m.geometry.index.count/3*(m.isInstancedMesh?m.count:1);o.push([m.type,Math.round(n)])}else if(m.isPoints){o.push(['Points',0])}});return JSON.stringify(o)})()`));
const shot = await send('Page.captureScreenshot', { format: 'png' });
mkdirSync('docs/screenshots', { recursive: true });
const file = `docs/screenshots/${name}.png`;
writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ name, size: `${w}x${h}`, dpr: opt.dpr ?? 1, realFps: +(frames / (ms / 1000)).toFixed(1), msPerFrame: +(ms / frames).toFixed(1), ...stats, touchState, meshTriangles: parts, consoleProblems: logs.filter((l) => /error|Error|exception|not used|no model/.test(l)), file }, null, 1));
ws.close(); stop(); await sleep(300);
import('node:fs').then((fs) => fs.rmSync(profile, { recursive: true, force: true }));
