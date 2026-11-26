// Starts the game page for a signed-in person: asks the garage which car, points the game at the signed-in socket,
// then loads the game's own main.js (the files of game/, served next to this one). No session: the game starts without an account in the public lobby (/api/open/ws):
// the name comes from the server, the paint from this device (kept here), nothing else is kept.
// A map other than the lobby's (?map=practice: the practice ground) is driven alone: no socket, no name, nothing sent; with or without an account. The car and its
// tuning come from the garage when somebody is signed in, the paint from this device otherwise.
const wantMap = new URLSearchParams(location.search).get('map'), solo = wantMap !== null && !['0', 'touge'].includes(wantMap);
const r = await fetch('/api/garage', { headers: { Accept: 'application/json' } });
if (solo) {
  document.documentElement.dataset.mode = 'solo'; document.documentElement.dataset.race = '0';
  const url = new URL(location.href);
  for (const k of ['ws', 'rws', 'open', 'world']) url.searchParams.delete(k);
  if (r.ok) {
    const g = await r.json(), tr = await fetch('/api/tuning', { headers: { Accept: 'application/json' } }), tuning = tr.ok ? (await tr.json()).cars[g.car] : null;
    if (tuning) { globalThis.__tune = [tuning.steer, tuning.balance, tuning.power, tuning.handbrake]; if (globalThis.__tune.some((v) => v !== 0)) url.searchParams.set('tune', globalThis.__tune.join(',')); }
    url.searchParams.set('car', String(g.car));
  } else {
    url.searchParams.set('car', '1');
    try { const p = Number(localStorage.getItem('drift.paint')); if (Number.isInteger(p) && p >= 0 && p <= 26 && !url.searchParams.has('paint')) url.searchParams.set('paint', String(p)); } catch { /* no storage */ }
  }
  history.replaceState(null, '', url);
  await import('./main.js');
} else if (r.status === 401) {
  let paint = NaN;
  try { paint = Number(localStorage.getItem('drift.paint')); } catch { /* no storage */ }
  if (!Number.isInteger(paint) || paint < 0 || paint > 26) { paint = Math.floor(Math.random() * 24); try { localStorage.setItem('drift.paint', String(paint)); } catch { /* not kept */ } }
  // without an account the visitor gives a name once (kept on this device, changeable in the menu); everybody sees it as "Name (Gast)". Free text, at most 20 characters.
  const de = (new URLSearchParams(location.search).get('lang') ?? navigator.language ?? '').startsWith('de');
  let name = '';
  try { name = localStorage.getItem('drift.name') ?? ''; } catch { /* no storage */ }
  if (!name) {
    const suggestion = await fetch('/api/open/name').then((x) => x.json()).then((j) => j.name).catch(() => '');
    name = await new Promise((resolve) => {
      const box = document.createElement('form'); box.id = 'namebox';
      const title = Object.assign(document.createElement('h2'), { textContent: de ? 'Wie willst du heißen?' : 'What is your name?' });
      const note = Object.assign(document.createElement('p'), { textContent: de ? 'Du fährst als Gast. Alle sehen dich als „Name (Gast)“.' : 'You drive as a guest. Everybody sees you as "Name (Guest)".' });
      const input = Object.assign(document.createElement('input'), { type: 'text', maxLength: 20, value: suggestion, autocomplete: 'off', ariaLabel: de ? 'Name' : 'Name' });
      const go = Object.assign(document.createElement('button'), { type: 'submit', textContent: de ? 'Fahren' : 'Drive' });
      box.append(title, note, input, go);
      box.addEventListener('submit', (e) => { e.preventDefault(); box.remove(); resolve(input.value.trim()); });
      document.body.append(box); input.select();
    });
    try { localStorage.setItem('drift.name', name); } catch { /* not kept */ }
  }
  let id = '';
  try { id = localStorage.getItem('drift.id') ?? ''; if (!/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem('drift.id', id); } } catch { id = crypto.randomUUID(); }
  const url = new URL(location.href), sock = location.protocol === 'https:' ? 'wss' : 'ws';
  url.searchParams.set('ws', `${sock}://${location.host}/api/open/ws?colour=${paint}&lang=${de ? 'de' : 'en'}&name=${encodeURIComponent(name)}&id=${id}`);
  url.searchParams.set('rws', `${sock}://${location.host}/api/open/race/ws?id=${id}&lang=${de ? 'de' : 'en'}&name=${encodeURIComponent(name)}&colour=${paint}`);
  url.searchParams.set('car', '1');
  url.searchParams.set('open', '1');
  history.replaceState(null, '', url);
  await import('./main.js');
} else {
  const g = await r.json();
  const tr = await fetch('/api/tuning', { headers: { Accept: 'application/json' } });
  const tuning = tr.ok ? (await tr.json()).cars[g.car] : null;
  if (tuning) globalThis.__tune = [tuning.steer, tuning.balance, tuning.power, tuning.handbrake];
  const url = new URL(location.href);
  const world = new URLSearchParams(location.search).get('world');   // a private session of a guest link: the socket joins that world only
  url.searchParams.set('ws', `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/play/ws${world && /^[0-9a-f-]{32,36}$/i.test(world) ? '?world=' + world : ''}`);
  url.searchParams.set('car', String(g.car));
  if (globalThis.__tune?.some((v) => v !== 0)) url.searchParams.set('tune', globalThis.__tune.join(','));   // the browser's own physics; the server knows the numbers itself
  if (g.glow !== null && g.glow !== undefined) url.searchParams.set('glow', String(g.glow));   // only for drawing our own: the server tells the others from the garage
  history.replaceState(null, '', url);
  await import('./main.js');
}
