// Opens a page in headless Chromium (software graphics, nice 10), waits for an expression to be true, prints the value of another.
// Usage: node tools/pageeval.mjs <url> <ready expression> <value expression> [width=844] [height=390] [shot.png]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';

const [url, ready, value, w = 844, h = 390, shotFile] = process.argv.slice(2);
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-eval-${port}`;
const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-proc.pid, 'SIGKILL'); } catch {} fs.rmSync(profile, { recursive: true, force: true }); };
process.on('exit', stop);
let target;
for (let t = 0; t < 50 && !target; t++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(), logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + m.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (let t = 0; t < 120 && !(await ev(`!!(${ready})`)); t++) await sleep(500);
await sleep(1000);
const result = JSON.stringify(await ev(value), null, 1);
await new Promise((r) => process.stdout.write(result + '\n', r));   // a big result through a pipe: wait until it is written (process.exit would cut it)
if (shotFile) { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shotFile, Buffer.from(s.result.data, 'base64')); }
if (logs.length) console.log('console:\n  ' + logs.slice(0, 15).join('\n  '));
stop(); process.exit(0);
