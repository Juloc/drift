// Tries a guest link in headless Chromium (software graphics, own free ports): the administrator makes a link, a guest opens it, chooses a name and
// drives; both see each other; then the administrator ends all links and the guest is thrown out. Needs cookies from tools/dev-people.mjs.
// Usage: node tools/guest-run.mjs <base url> <cookies.json>   (the first name in the file is the administrator)
import { spawn } from 'node:child_process';
import { GL_FLAGS } from './chrome.mjs';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

const [base, cookieFile] = process.argv.slice(2);
const cookies = JSON.parse(readFileSync(cookieFile, 'utf8'));
const adminCookie = Object.values(cookies)[0];
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const stopAll = () => { for (const p of procs) try { process.kill(-p.pid, 'SIGKILL'); } catch {} };
process.on('exit', stopAll);

async function open(cookie, w = 844, h = 390) {
  const port = 20000 + Math.floor(Math.random() * 20000), profile = `/tmp/claude-1000/drift-guest-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  procs.push(proc);
  let target;
  for (let t = 0; t < 50 && !target; t++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  if (cookie) { const [n, v] = cookie.split('='); await send('Network.setCookie', { name: n, value: v, url: base }); }
  const shot = async (file) => writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  const go = async (url, wait) => { await send('Page.navigate', { url }); for (let i = 0; i < 80 && !(await ev(wait)); i++) await sleep(400); await sleep(600); };
  const close = () => { ws.close(); try { process.kill(-proc.pid, 'SIGKILL'); } catch {} setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); };
  return { ev, shot, go, close };
}

const report = {};
const admin = await open(adminCookie, 900, 800);
await admin.go(base + '/#/settings', "!![...document.querySelectorAll('h2')].find(h => /Gastlinks|Guest links/.test(h.textContent))");
// the administrator makes a link through the card
await admin.ev("document.querySelector('form [name=hours]').closest('form').requestSubmit()");
for (let i = 0; i < 20 && !(await admin.ev("!!document.querySelector('input[readonly]')")); i++) await sleep(300);
const url = await admin.ev("document.querySelector('input[readonly]').value");
report.linkShape = url.replace(/#.*/, '#<secret>');
await admin.ev("document.querySelector('input[readonly]').scrollIntoView()");
await sleep(400);
await admin.shot('docs/screenshots/m5-admin-links.png');
// the guest opens it
const guest = await open(null);
await guest.go(url, "!!document.getElementById('g-form') && !document.getElementById('g-form').hidden");
await guest.shot('docs/screenshots/m5-guest-link.png');
await guest.ev("document.getElementById('g-name').value = 'Kiwi 7'; document.getElementById('g-form').requestSubmit()");
for (let i = 0; i < 80 && !(await guest.ev("location.pathname.endsWith('/play/guest.html') && !!window.__net && !!__net.me")); i++) await sleep(400);
await sleep(1500);
report.guest = JSON.parse(await guest.ev("JSON.stringify({ path: location.pathname, me: __net.me?.name, counter: document.getElementById('online-n').textContent })"));
// the administrator joins the lobby too, so that the two meet
const mia = await open(adminCookie);
await mia.go(base + '/play/', "!!window.__net && __net.me");
await sleep(3000);
report.seen = await guest.ev("JSON.stringify([...__net.roster.values()].map(r => r.name))");
await guest.shot('docs/screenshots/m5-guest-lobby.png');
// all links end: the guest is thrown out at once
const ended = await admin.ev("fetch('/api/guest-links/end-all', { method: 'POST', headers: { 'X-Base': '1' } }).then(r => r.json())");
report.ended = ended;
for (let i = 0; i < 30 && !(await guest.ev("!document.getElementById('dropped').hidden")); i++) await sleep(300);
report.guestDropped = await guest.ev("!document.getElementById('dropped').hidden");
report.guestSessionAfter = await guest.ev("fetch('/api/guest/me').then(r => r.status)");
await guest.shot('docs/screenshots/m5-guest-dropped.png');
for (const b of [admin, guest, mia]) b.close();
console.log(JSON.stringify(report, null, 1));
await sleep(600); stopAll();
