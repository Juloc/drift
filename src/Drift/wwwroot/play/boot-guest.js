// Starts the game page for a guest: asks the guest door who this is, points the game at the guest sockets, loads the game's main.js.
// No guest session (the link ended or the session expired): back to the link page.
const r = await fetch('/api/guest/me', { headers: { Accept: 'application/json' } });
if (r.status === 401) location.replace('/g/');
else {
  const g = await r.json();
  const ws = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  const url = new URL(location.href);
  url.searchParams.set('ws', `${ws}/api/guest/ws`);
  url.searchParams.set('rws', `${ws}/api/guest/race/ws`);
  url.searchParams.set('car', String(g.car));
  history.replaceState(null, '', url);
  await import('./main.js');
}
