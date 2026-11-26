// The tandem check: two headless browsers in the open lobby of a RUNNING app (the address is the first argument), one invites the other to a tandem in two runs, the other accepts,
// both drive the same drift for the countdown and both rounds, and the result card shows. Pictures to docs/screenshots/tandem-*.png; exits with 1 when a step does not happen.
// Usage: node tools/tandemcheck.mjs http://127.0.0.1:5077 [--out=docs/screenshots]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
const url = process.argv[2] ?? 'http://127.0.0.1:5077', out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=docs/screenshots').slice(6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(out, { recursive: true });
const stops = []; process.on('exit', () => stops.forEach((f) => f()));
async function browser() {
  const port = 22000 + Math.floor(Math.random() * 6000), profile = `/tmp/claude-1000/drift-tandemcheck-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
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
const shot = async (b, name) => { const r = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/tandem-${name}.png`, Buffer.from(r.result.data, 'base64')); };

async function enter(name) {
  const b = await browser();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await b.send('Page.navigate', { url: `${url}/play/?lang=de&demo=orbit` });
  must(await until(b, `!!document.querySelector('#namebox input')`), `${name}: the name form shows`);
  await b.ev(`(() => { const f = document.querySelector('#namebox'); f.querySelector('input').value = ${JSON.stringify(name)}; f.requestSubmit(); })()`);
  must(await until(b, `!!window.__drift && __drift.info.frames > 2 && __net.connected`, 120000), `${name}: the game runs and is connected`);
  return b;
}
const a = await enter('Rauch'), b = await enter('Fuchs');
must(await until(a, `__net.roster.size >= 2`) && await until(b, `__net.roster.size >= 2`), 'both see each other in the lobby');
// both drive the orbit demo (a drift circle) from spawns nine metres apart: two similar slides side by side
await sleep(3000);
await a.ev(`window.__ph = []; new MutationObserver(() => { const e = document.getElementById('tandem-run'); if (e && !e.hidden && __ph.at(-1) !== e.className) __ph.push(e.className); }).observe(document.body, { subtree: true, attributes: true, childList: true });`);
await a.ev(`document.getElementById('mode-tandem').click()`);
must(await until(b, `!document.getElementById('invite').hidden`, 10000), 'the other sees the invitation');
await shot(b, 'invite');
await b.ev(`document.getElementById('invite-yes').click()`);
must(await until(a, `!document.getElementById('tandem-run').hidden`, 10000), 'the banner shows for the one who asked');
await shot(a, 'countdown');
must(await until(a, `document.getElementById('tandem-run').className === 'round1'`, 15000), 'round 1 starts');
await sleep(8000); await shot(a, 'round1'); await shot(b, 'round1-chase');
must(await until(a, `__ph.includes('round2')`, 60000), 'round 2 starts');
must(JSON.stringify(await a.ev('__ph')) === JSON.stringify(['countdown', 'round1', 'swap', 'round2']), 'the phases come in order: ' + JSON.stringify(await a.ev('__ph')));
must(await until(a, `!document.getElementById('result').hidden`, 60000) && await until(b, `!document.getElementById('result').hidden`, 5000), 'both get the result card');
await shot(a, 'result'); await shot(b, 'result-partner');
console.log('card of the first:', await a.ev(`document.getElementById('res-mode').innerText.split(String.fromCharCode(10)).join(' | ')`));
console.log('errors:', a.logs.length + b.logs.length, [...a.logs, ...b.logs].slice(0, 3));
a.close(); b.close();
process.exit(fails.length ? 1 : 0);
