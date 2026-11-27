// Pictures and numbers of the look probe (game/lookprobe.html) in headless Chromium through the DevTools protocol. One browser at a
// time, software graphics (no GPU here): the frame time is a CPU renderer's, useful only to compare two looks on this machine.
// Usage: node tools/shoot-probe.mjs <width> <height> <name> [--tier=high|low] [--touch] [--dpr=1] [--query=view=overview] [--port=8150]
//        [--page=game/index.html (the game, measured the same way)] [--bench=6 frames] [--out=dir] [--text (print the HUD's text)] [--lang=de|en] [--eval=js run before measuring] [--probe=x,y,z;x,y,z (where these points are on the screen)]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

const [w, h, name, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const port = 20000 + Math.floor(Math.random() * 20000);
const page = opt.page ?? 'game/lookprobe.html';
const url = `http://127.0.0.1:${opt.port ?? 8150}/${page}?lang=${opt.lang ?? 'de'}${opt.touch ? '&touch=1' : ''}${opt.tier ? '&tier=' + opt.tier : ''}${opt.query ? '&' + opt.query : ''}`;
const profile = `/tmp/claude-1000/drift-probe-${port}`;
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
  else if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(m.params).slice(0, 400));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +(opt.dpr ?? 1), mobile: !!opt.touch });
  if (opt.touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  for (let i = 0; i < 240 && !(await evalJs('(!!window.__probe && window.__probe.frames > 2) || (!!window.__drift && window.__drift.info.frames > 2)')); i++) await sleep(500);
  await sleep(1000);
  // the old game page has no __probe: measure it the same way through its own view (for the before/after numbers)
  await evalJs(`window.__probe ??= (()=>{const v=__drift.view;return {renderer:v.renderer,frames:1e9,worldTriangles:0,buildMs:0,t:0,slip:0,sunScreen:()=>null,bench(n){const gl=v.renderer.getContext(),px=new Uint8Array(4),a=performance.now();for(let i=0;i<n;i++){v.renderer.render(v.scene,v.camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);}return (performance.now()-a)/n;}};})()`);
  if (opt.eval) await evalJs(opt.eval);   // e.g. hide parts to see what they cost
  const stats = JSON.parse(await evalJs(`(()=>{const p=__probe;const ms=p.bench(+(${opt.bench ?? 6}));const r=p.renderer.info.render;return JSON.stringify({triangles:r.triangles,calls:r.calls,msPerFrameSoftware:+ms.toFixed(1),buffer:[p.renderer.domElement.width,p.renderer.domElement.height],worldTriangles:Math.round(p.worldTriangles),buildMs:Math.round(p.buildMs),t:+p.t.toFixed(2),slip:Math.round(p.slip),sun:p.sunScreen(),probe:p.screen&&${JSON.stringify(opt.probe ?? null)}?${JSON.stringify(opt.probe ?? '')}.split(';').map(q=>p.screen(...q.split(',').map(Number))):undefined,programs:p.renderer.info.programs.length,geometries:p.renderer.info.memory.geometries})})()`));
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync('docs/screenshots', { recursive: true });
  const file = opt.out ? `${opt.out}/${name}.png` : `docs/screenshots/${name}.png`;
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  const text = opt.text ? await evalJs("document.getElementById('phud')?.innerText") : undefined;
  console.log(JSON.stringify({ name, text, size: `${w}x${h}`, dpr: +(opt.dpr ?? 1), tier: opt.tier ?? 'auto', ...stats, problems: logs.filter((l) => /error|Error|exception|warn/i.test(l)), file }));
} finally { ws.close(); stop(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
