// Starts the game page for a signed-in person: asks the garage which car, points the game at the signed-in socket,
// then loads the game's own main.js (the files of game/, served next to this one). No session: the game starts without an account in the public lobby (/api/open/ws):
// the name comes from the server, the paint from this device (kept here), nothing else is kept.
const r = await fetch('/api/garage', { headers: { Accept: 'application/json' } });
if (r.status === 401) {
  let paint = NaN;
  try { paint = Number(localStorage.getItem('drift.paint')); } catch { /* no storage */ }
  if (!Number.isInteger(paint) || paint < 0 || paint > 26) { paint = Math.floor(Math.random() * 24); try { localStorage.setItem('drift.paint', String(paint)); } catch { /* not kept */ } }
  const url = new URL(location.href);
  url.searchParams.set('ws', `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/open/ws?colour=${paint}`);
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
