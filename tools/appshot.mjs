// A picture of the game page of a RUNNING app as a guest (a name is put into the device's storage first), after some steps in the page: for the pictures of the lobby's
// windows (the choice of the game mode, the result cards). Usage: node tools/appshot.mjs <app url> <width> <height> <out.png> [--touch] [--path=/play/?lang=de] [--wait=<js that must be true>]
//   [--do=<js run once the game is up, may be async>] [--after=<ms to wait after it>]
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--')), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const t = a.slice(2), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const [base, w, h, out] = pos, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
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
const b = await browser();
await b.send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: !!opt.touch });
if (opt.touch) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await b.send('Page.navigate', { url: `${base}/play/?lang=de` });
for (let i = 0; i < 40 && !(await b.ev(`document.readyState === 'complete'`)); i++) await sleep(250);
await b.ev(`localStorage.setItem('drift.name', 'Bild'); true`);
await b.send('Page.navigate', { url: `${base}${opt.path ?? '/play/?lang=de'}${opt.touch ? '&touch=1' : ''}` });
let ok = false; for (let i = 0; i < 240 && !(ok = await b.ev('!!window.__drift && __drift.info.frames > 5 && (!window.__net || __net.connected)')); i++) await sleep(500);
if (!ok) { console.log('the game did not start', b.logs.slice(0, 2)); process.exit(1); }
if (opt.do) console.log('do:', JSON.stringify(await b.ev(opt.do)));
if (opt.wait) for (let i = 0; i < 120 && !(await b.ev(opt.wait)); i++) await sleep(500);
await sleep(+(opt.after ?? 800));
const s = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(out, Buffer.from(s.result.data, 'base64'));
if (opt.eval) console.log('eval:', JSON.stringify(await b.ev(opt.eval)));
console.log('errors:', b.logs.length, b.logs.slice(0, 2).map((l) => { try { const m = JSON.parse(l); return m.exceptionDetails?.exception?.description ?? m.exceptionDetails?.text ?? l.slice(0, 200); } catch { return l.slice(0, 300); } }));
b.close(); process.exit(0);
