// Starts the game page for a signed-in person: asks the garage which car, points the game at the signed-in socket,
// then loads the game's own main.js (the files of game/, served next to this one). No session: back to the app's sign-in.
const r = await fetch('/api/garage', { headers: { Accept: 'application/json' } });
if (r.status === 401) location.replace('/');
else {
  const g = await r.json();
  const tr = await fetch('/api/tuning', { headers: { Accept: 'application/json' } });
  const tuning = tr.ok ? (await tr.json()).cars[g.car] : null;
  if (tuning) globalThis.__tune = [tuning.steer, tuning.balance, tuning.power, tuning.handbrake];
  const url = new URL(location.href);
  url.searchParams.set('ws', `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/play/ws`);
  url.searchParams.set('car', String(g.car));
  if (globalThis.__tune?.some((v) => v !== 0)) url.searchParams.set('tune', globalThis.__tune.join(','));   // the browser's own physics; the server knows the numbers itself
  if (g.glow !== null && g.glow !== undefined) url.searchParams.set('glow', String(g.glow));   // only for drawing our own: the server tells the others from the garage
  history.replaceState(null, '', url);
  await import('./main.js');
}
