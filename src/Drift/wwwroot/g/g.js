// The page of a guest link (/g/#<secret>): a name, then the game. The secret is in the fragment, so no server log ever sees it;
// it goes to the server only in the body of the join request. Texts: this page is outside the app's sign-in, so it has its own few.
const de = navigator.language?.startsWith('de');
const T = de
  ? { text: 'Du bist eingeladen: fahr mit den anderen in der Lobby. Such dir einen Namen aus (2 bis 16 Zeichen).', label: 'Dein Name', go: 'Fahren', none: 'Dieser Link ist nicht vollständig. Frag nach einem neuen.', bad: 'Dieser Link gilt nicht (mehr). Frag nach einem neuen.', slow: 'Zu viele Versuche. Warte eine Minute.', too_short: 'Der Name ist zu kurz.', too_long: 'Der Name ist zu lang.', invalid: 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen, Punkt, Bindestrich und Unterstrich.', failed: 'Das hat nicht geklappt. Versuch es noch einmal.' }
  : { text: 'You are invited: drive around the lobby with the others. Pick a name (2 to 16 characters).', label: 'Your name', go: 'Drive', none: 'This link is incomplete. Ask for a new one.', bad: 'This link is not valid (any more). Ask for a new one.', slow: 'Too many tries. Wait a minute.', too_short: 'The name is too short.', too_long: 'The name is too long.', invalid: 'Letters, digits, space, dot, dash and underscore are allowed.', failed: 'That did not work. Try again.' };
document.documentElement.lang = de ? 'de' : 'en';
const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
$('g-text').textContent = token ? T.text : T.none;
$('g-label').textContent = T.label;
$('g-go').textContent = T.go;
if (token) $('g-form').hidden = false;
const fail = (text) => { const e = $('g-error'); e.textContent = text; e.hidden = false; };

$('g-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('g-error').hidden = true;
  $('g-go').disabled = true;
  try {
    const r = await fetch('/api/guest/join', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Base': '1' }, body: JSON.stringify({ token, name: $('g-name').value }) });
    if (r.ok) { history.replaceState(null, '', '/g/'); location.replace('/play/guest.html'); return; }
    const body = await r.json().catch(() => ({}));
    if (r.status === 429) fail(T.slow);
    else if (r.status === 401) fail(T.bad);
    else if (body.fields?.name) fail(T[body.fields.name] || T.invalid);
    else fail(T.failed);
  } catch { fail(T.failed); }
  $('g-go').disabled = false;
});
