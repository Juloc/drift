// Starts the game page for a signed-in person: asks the garage which car, points the game at the signed-in socket,
// then loads the game's own main.js (the files of game/, served next to this one). No session: back to the app's sign-in.
const r = await fetch('/api/garage', { headers: { Accept: 'application/json' } });
if (r.status === 401) location.replace('/');
else {
  const g = await r.json();
  const url = new URL(location.href);
  url.searchParams.set('ws', `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/play/ws`);
  url.searchParams.set('car', String(g.car));
  if (g.glow !== null && g.glow !== undefined) url.searchParams.set('glow', String(g.glow));   // only for drawing our own: the server tells the others from the garage
  history.replaceState(null, '', url);
  await import('./main.js');
}
