// Tries the signed-in app in headless Chromium (software graphics, its own free ports, one browser at a time for the
// garage, then up to three together on the game page). Needs cookies from tools/dev-people.mjs.
// Usage: node tools/account-run.mjs <base url> <cookies.json>   (names in the file: first = garage pictures, all = lobby)
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

const [base, cookieFile] = process.argv.slice(2);
const cookies = JSON.parse(readFileSync(cookieFile, 'utf8'));
const names = Object.keys(cookies);
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const stopAll = () => { for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {} };
process.on('exit', stopAll);

async function open(name, w, h, dpr = 1, touch = false) {
  const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-acct-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  procs.push(proc);
  let target;
  for (let t = 0; t < 50 && !target; t++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')) logs.push(JSON.stringify(m.params).slice(0, 240)); };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: touch });
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const [cname, cval] = cookies[name].split('=');
  await send('Network.setCookie', { name: cname, value: cval, url: base });
  const shot = async (file) => writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  const close = () => { ws.close(); try { process.kill(-proc.pid, 'SIGKILL'); } catch {} setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); };
  return { send, ev, shot, close, logs };
}
const nav = async (b, url, wait) => { await b.send('Page.navigate', { url }); for (let i = 0; i < 80 && !(await b.ev(wait)); i++) await sleep(400); await sleep(600); };

const report = {};
// ---- the garage, phone portrait and wide
{
  const b = await open(names[0], 390, 844, 2, true);
  await nav(b, base + '/#/', "!!document.querySelector('.cars')");
  await b.shot('docs/screenshots/m2-garage-phone.png');
  // choose the fourth car and a colour, type a nickname, save
  await b.ev("document.querySelectorAll('.car')[3].click(); document.querySelectorAll('.swatch')[16].click(); const i=document.querySelector('[name=nick]'); i.value='Sky Fox'; i.dispatchEvent(new Event('input',{bubbles:true}));");
  await b.ev("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Save'||x.textContent.trim()==='Speichern').click()");
  await sleep(800);
  report.saved = await b.ev("fetch('/api/garage').then(r=>r.json()).then(j=>JSON.stringify({car:j.car,colour:j.colour,nick:j.nick,name:j.name}))");
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  await b.shot('docs/screenshots/m2-garage-wide.png');
  report.garageProblems = b.logs; b.close();
}
await sleep(500);
// ---- the lobby: everyone opens the game page, with a car and colour of their own
const bs = [];
for (const [i, name] of names.entries()) {
  const b = await open(name, 844, 390, 1, false);
  await nav(b, base + '/#/', "!!document.querySelector('.cars')");
  if (i > 0) await b.ev(`fetch('/api/garage',{method:'PUT',headers:{'Content-Type':'application/json','X-Base':'1'},body:JSON.stringify({car:${i + 1},colour:${i * 7 + 2},nick:''})})`);
  await nav(b, base + '/play/', "!!window.__net && __net.me");
  bs.push(b);
}
const key = (b, type, code, k, vk) => b.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
for (const b of bs) await key(b, 'rawKeyDown', 'ArrowUp', 'ArrowUp', 38);
await sleep(2500);
report.lobby = [];
for (const b of bs) report.lobby.push(JSON.parse(await b.ev(`JSON.stringify({ me: __net.me?.name, roster: [...__net.roster.values()].map(r=>r.name+':'+r.car), counter: document.getElementById('online-n').textContent, othersDrawn: __net.sample().length, labels: [...document.querySelectorAll('.tag')].filter(t=>!t.hidden).map(t=>t.textContent), url: location.search })`)));
await bs[0].shot('docs/screenshots/m2-lobby.png');
report.lobbyProblems = bs.map((b) => b.logs);
for (const b of bs) b.close();
console.log(JSON.stringify(report, null, 1));
await sleep(600); stopAll();
