// Starts the game page for a Juloc Games account: asks the games door who this is, points the game at the games sockets, loads the game's main.js.
// No session: back to the account page.
const r = await fetch('/api/games/garage', { headers: { Accept: 'application/json' } });
if (r.status === 401) location.replace('/games/?next=play');
else {
  const g = await r.json();
  const tr = await fetch('/api/games/tuning', { headers: { Accept: 'application/json' } });
  const tuning = tr.ok ? (await tr.json()).cars[g.car] : null;
  if (tuning) globalThis.__tune = [tuning.steer, tuning.balance, tuning.power, tuning.handbrake];
  const ws = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  const url = new URL(location.href);
  url.searchParams.set('ws', `${ws}/api/games/play/ws`);
  url.searchParams.set('rws', `${ws}/api/games/play/race/ws`);
  url.searchParams.set('car', String(g.car));
  if (globalThis.__tune?.some((v) => v !== 0)) url.searchParams.set('tune', globalThis.__tune.join(','));
  if (g.glow !== null && g.glow !== undefined) url.searchParams.set('glow', String(g.glow));
  history.replaceState(null, '', url);
  await import('./main.js');
}
