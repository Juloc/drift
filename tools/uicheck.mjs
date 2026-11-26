// The interface check: opens the game page in headless Chromium at eleven screens, from a small phone held sideways with a notch to an ultrawide PC
// screen, each in three states: quiet, with messages (a toast, the damage note, a note and the start hint), and with the menu open. For every screen it
// checks (a) every visible part of the HUD lies wholly inside the screen and outside the safe-area edges (notch, rounded corners), (b) no two parts
// overlap, (c) no part is cut off by its place in the frame (view/frame.js), (d) on touch screens every button is at least 44 px, (e) the page reports no
// errors. Writes a picture per screen and an overview sheet to the output folder, prints a short report, exits with 1 when anything fails.
// A fresh browser for every screen (nothing kept from the one before); run heavy tools through `devq`. Usage: node tools/uicheck.mjs [--out=/tmp/claude-1000/drift-uicheck] [--only=phone,pc-1920] [--page=game/index.html]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { GL_FLAGS } from './chrome.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const t = a.replace(/^--/, ''), i = t.indexOf('='); return i < 0 ? [t, true] : [t.slice(0, i), t.slice(i + 1)]; }));
const out = opt.out ?? '/tmp/claude-1000/drift-uicheck', page = opt.page ?? 'game/index.html';
// the screens: size, touch, the safe-area edges of a phone with a notch held sideways (the notch on the left, the home bar at the bottom)
const SIZES = [
  { name: 'phone-small', w: 640, h: 360, touch: true, safe: { left: 44, right: 0, top: 0, bottom: 21 } },
  { name: 'phone', w: 844, h: 390, touch: true, safe: { left: 47, right: 0, top: 0, bottom: 21 } },
  { name: 'phone-large', w: 932, h: 430, touch: true, safe: { left: 59, right: 0, top: 0, bottom: 21 } },
  { name: 'tablet-landscape', w: 1180, h: 820, touch: true, safe: { left: 0, right: 0, top: 24, bottom: 20 } },
  { name: 'tablet-portrait', w: 820, h: 1180, touch: true, safe: { left: 0, right: 0, top: 24, bottom: 20 } },
  { name: 'pc-1280', w: 1280, h: 720 },
  { name: 'pc-1366', w: 1366, h: 768 },
  { name: 'pc-1600', w: 1600, h: 900 },
  { name: 'pc-1920', w: 1920, h: 1080 },
  { name: 'pc-2560', w: 2560, h: 1440 },
  { name: 'pc-3440', w: 3440, h: 1440 },
].filter((s) => !opt.only || opt.only.split(',').includes(s.name));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
mkdirSync(out, { recursive: true });

// a static server for the repository; a browser per screen (killed and its profile removed when done, also on an error)
const webPort = 21000 + Math.floor(Math.random() * 3000);
const web = spawn('python3', ['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], { stdio: 'ignore', detached: true });
const stops = new Set([() => { try { process.kill(-web.pid, 'SIGKILL'); } catch {} }]);
process.on('exit', () => stops.forEach((f) => f()));
await sleep(800);
let send, ev, logs = [];
async function browser() {
  const port = 24000 + Math.floor(Math.random() * 6000), profile = `/tmp/claude-1000/drift-uicheck-${port}`;
  const proc = spawn('nice', ['-n', '10', chrome, '--headless=new', '--no-sandbox', ...GL_FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  let ws;
  const close = () => { try { ws?.close(); } catch {} try { process.kill(-proc.pid, 'SIGKILL'); } catch {} setTimeout(() => rmSync(profile, { recursive: true, force: true }), 400); stops.delete(close); };
  stops.add(close);
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(300); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  if (!target) { close(); throw new Error('no browser'); }
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') logs.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split('\n')[0]); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200)); };
  send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');
  return close;
}

// what is on the screen: the parts in the frame's places, and anything else placed over the game that is not a full-screen layer or a modal window
const MEASURE = `(() => {
  const vis = (el) => { if (el.closest('[hidden]')) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; };
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10); };
  const name = (el) => el.id ? '#' + el.id : (el.className && el.className.baseVal === undefined ? '.' + [...el.classList].filter((c) => !['card', 'btn', 'live', 'on'].includes(c)).join('.') : el.tagName.toLowerCase());
  const parts = [], slots = {};
  for (const s of document.querySelectorAll('.frame .slot')) { slots[s.dataset.slot] = box(s); for (const el of s.children) if (vis(el)) parts.push({ name: name(el), slot: s.dataset.slot, box: box(el) }); }
  const LAYERS = ['view', 'vignette', 'phud', 'touch', 'tags', 'hud', 'debug', 'pdebug'], MODALS = ['rotate', 'result', 'summary', 'namebox', 'dropped', 'count', 'own-emote', 'credit'];
  for (const el of document.body.children) { if (LAYERS.includes(el.id) || MODALS.includes(el.id) || el.tagName === 'SCRIPT') continue; const cs = getComputedStyle(el); if ((cs.position === 'fixed' || cs.position === 'absolute') && vis(el)) parts.push({ name: name(el), slot: null, box: box(el) }); }
  // every button a finger can press (on a touch screen)
  const buttons = [...document.querySelectorAll('#phud button, #phud a, #phud input, #phud select, body > button, body > a')].filter(vis).map((el) => ({ name: name(el), box: box(el) }));
  const rotate = document.getElementById('rotate'); return JSON.stringify({ parts, slots, buttons, w: innerWidth, h: innerHeight, rotate: !!rotate && !rotate.hidden });
})()`;
// the messages that can come together while driving (a toast, the damage note, a note, and the start hint of the device: the tip on a phone, the key hint on a PC)
// the parts the app's page adds to the game page (src/Drift/wwwroot/play/index.html: the way back, the note line, the credits link, its style), so that the check sees what a player sees
const APP = `(() => {
  const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/src/Drift/wwwroot/play/play.css' });
  const frameCss = document.querySelector('link[href$="frame.css"]'); frameCss ? frameCss.before(css) : document.head.append(css);
  if (!document.getElementById('back')) document.body.prepend(Object.assign(document.createElement('a'), { id: 'back', href: '#', textContent: '\u2190', ariaLabel: 'Back' }));
  if (!document.getElementById('note')) document.body.append(Object.assign(document.createElement('p'), { id: 'note', hidden: true }));
  if (!document.getElementById('credits-link')) document.body.append(Object.assign(document.createElement('a'), { id: 'credits-link', href: '#', textContent: 'Credits' }));
  return true; })()`;
const MESSAGES = `(() => {
  // shown and kept shown (the game hides the damage note on every frame while there is no damage)
  const show = (id, text) => { const el = document.getElementById(id); if (el) { el.textContent = text; el.removeAttribute('hidden'); for (const [k, v] of [['hidden', false], ['textContent', text]]) Object.defineProperty(el, k, { get: () => v, set: () => {}, configurable: true }); } };
  show('damage', 'Schaden 34 %'); show('note', 'Kamera: weit, folgt dem Auto');
  if (document.body.classList.contains('touch')) show('tip', 'Halte GAS, lenke mit den Pfeilen, tippe HAND, um das Heck herauszuwerfen'); else show('hint', 'Pfeile oder WASD: fahren · Leertaste: Handbremse · C: Kamera · H: HUD');
  const t = document.querySelector('.p-toast'); if (t) { t.textContent = 'CLIP +1.240'; t.className = 'p-toast bank'; }
  return true; })()`;
const MENU = `(document.getElementById('chips')?.classList.add('open'), true)`;
const STATES = [['quiet', null], ['messages', MESSAGES], ['menu', MENU]];

const fails = [], rows = [];
const fail = (size, text) => fails.push(`${size}: ${text}`);
for (const sz of SIZES) {
  const close = await browser();
  try { for (const [state, script] of STATES) {
    const busy = state !== 'quiet', label = `${sz.name}${busy ? ' ' + state : ''}`;
    logs = [];
    await send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: !!sz.touch });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!sz.touch, maxTouchPoints: sz.touch ? 5 : 0 });
    const safe = sz.safe ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const safeOk = !(await send('Emulation.setSafeAreaInsetsOverride', { insets: safe })).error;
    await send('Page.navigate', { url: `http://127.0.0.1:${webPort}/${page}?map=touge&tier=low&lang=de${sz.touch ? '&touch=1' : ''}&shot=platz` });
    for (let i = 0; i < 240 && !(await ev('!!window.__drift && __drift.info.frames > 2')); i++) await sleep(500);
    if (!(await ev('!!window.__drift'))) { fail(label, 'the game did not start: ' + logs.slice(0, 2).join(' ')); continue; }
    if (sz.touch) await ev("document.getElementById('touch') && (document.getElementById('touch').hidden = false), true");
    await ev(APP);
    if (script) await ev(script);
    await sleep(600);
    const m = JSON.parse(await ev(MEASURE));
    const rec = { label, size: sz, busy, parts: m.parts.length, rotate: m.rotate, safeOk, problems: 0 };
    const add = (t) => { fail(label, t); rec.problems++; };
    if (!m.rotate) {
      // (a) inside the screen and its safe area
      const x0 = safe.left, y0 = safe.top, x1 = m.w - safe.right, y1 = m.h - safe.bottom;
      for (const p of m.parts) { const [a, b, c, d] = p.box; if (a < x0 - 1 || b < y0 - 1 || c > x1 + 1 || d > y1 + 1) add(`${p.name} leaves the screen or its safe area (${a},${b} to ${c},${d}; safe area ${x0},${y0} to ${x1},${y1})`); }
      // (b) no two parts overlap
      for (let i = 0; i < m.parts.length; i++) for (let j = i + 1; j < m.parts.length; j++) {
        const [a0, b0, c0, d0] = m.parts[i].box, [a1, b1, c1, d1] = m.parts[j].box, ox = Math.min(c0, c1) - Math.max(a0, a1), oy = Math.min(d0, d1) - Math.max(b0, b1);
        if (ox > 2 && oy > 2) add(`${m.parts[i].name} and ${m.parts[j].name} overlap by ${Math.round(ox)} x ${Math.round(oy)} px`);
      }
      // (c) a part not cut off by its place
      for (const p of m.parts) { if (!p.slot) continue; const [a, b, c, d] = p.box, [sa, sb, sc, sd] = m.slots[p.slot]; if (a < sa - 1 || b < sb - 1 || c > sc + 1 || d > sd + 1) add(`${p.name} is cut off by its place "${p.slot}"`); }
      // (d) touch: every button at least 44 px
      if (sz.touch) for (const b of m.buttons) { const w = b.box[2] - b.box[0], h = b.box[3] - b.box[1]; if (w < 43.5 || h < 43.5) add(`${b.name} is ${Math.round(w)} x ${Math.round(h)} px, under 44 px for a finger`); }
    }
    if (logs.length) add('the page reported errors: ' + logs.slice(0, 2).join(' | '));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    rec.file = `${out}/${sz.name}${busy ? '-' + state : ''}.png`;
    writeFileSync(rec.file, Buffer.from(shot.result.data, 'base64'));
    rows.push(rec);
  } } finally { close(); }
}

// the overview sheet: every screen in its three states, with its verdict
const status = fails.length ? 'FAILED' : 'passed';
const lines = [`ui check ${status}: ${SIZES.length} screens, ${rows.length} pictures, ${fails.length} problem(s)`, ...rows.map((r) => `${r.label.padEnd(22)} ${r.size.w}x${r.size.h}${r.size.touch ? ' touch' : ''}${r.size.safe ? ` safe area L${r.size.safe.left} B${r.size.safe.bottom}${r.safeOk ? '' : ' (not emulated)'}` : ''}: ${r.parts} parts, ${r.rotate ? 'turn hint shown' : r.problems ? r.problems + ' problem(s)' : 'ok'}`), ...fails.map((f) => 'PROBLEM ' + f)];
writeFileSync(`${out}/report.txt`, lines.join('\n') + '\n');
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tile = (r) => { const s = r.size, k = Math.min(420 / s.w, 300 / s.h); return `<figure style="margin:0;width:${Math.round(s.w * k)}px"><div style="position:relative"><img src="data:image/png;base64,${readFileSync(r.file).toString('base64')}" style="display:block;width:${Math.round(s.w * k)}px;border:2px solid ${r.problems ? '#ff6a6a' : '#5ad08a'}">${s.safe ? `<div style="position:absolute;left:2px;top:2px;width:${Math.round(s.safe.left * k)}px;bottom:2px;background:repeating-linear-gradient(45deg,#0008 0 4px,#0000 4px 8px)"></div>` : ''}</div><figcaption style="font:12px monospace;color:${r.problems ? '#ff9a9a' : '#9effc0'}">${esc(r.label)} ${s.w}x${s.h} · ${r.rotate ? 'turn hint' : r.problems ? r.problems + ' problem(s)' : 'ok'}</figcaption></figure>`; };
const html = `<body style="margin:0;background:#16131c;color:#fff;font:14px sans-serif;padding:16px;width:1880px"><h2 style="margin:0 0 12px;color:${fails.length ? '#ff7a7a' : '#7affb0'}">${esc(lines[0])}</h2>
<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end">${rows.map(tile).join('')}</div>
${fails.length ? `<pre style="margin-top:12px;white-space:pre-wrap;font-size:12px;color:#ffb0b0">${esc(fails.slice(0, 40).join('\n'))}</pre>` : ''}</body>`;
const sheetFile = `/tmp/claude-1000/drift-uicheck-overview-${webPort}.html`;
writeFileSync(sheetFile, html);
const closeSheet = await browser();
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1912, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `file://${sheetFile}` }); await sleep(1500);
  const sheet = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(`${out}/overview.png`, Buffer.from(sheet.result.data, 'base64'));
} finally { closeSheet(); rmSync(sheetFile, { force: true }); }
console.log(lines.join('\n'));
await sleep(600);
process.exit(fails.length ? 1 : 0);
