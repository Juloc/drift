// The page of the Juloc Games account: sign in, create an account, change the password, download the data, delete the account.
// The page has its own small set of texts (German and English), like the guest page. The puzzle (proof of work) runs in a worker (pow.js).
const de = navigator.language?.startsWith('de');
const T = de ? {
  title: 'Juloc Games-Konto', intro: 'Ein Name und ein Passwort für alle Spiele. Keine E-Mail, kein echter Name nötig.',
  tabIn: 'Anmelden', tabUp: 'Konto anlegen', name: 'Name', pw: 'Passwort', pw2: 'Passwort wiederholen', go: 'Anmelden', create: 'Konto anlegen',
  hName: '3 bis 16 Zeichen, Buchstaben, Ziffern, Leerzeichen, Punkt, Bindestrich, Unterstrich. Alle sehen diesen Namen. Nimm bitte nicht deinen echten Namen.',
  hPw: 'Mindestens 8 Zeichen. Das Passwort kannst du nicht zurückholen: wer es vergisst, fragt den, der das Spiel betreibt.',
  help: 'Passwort vergessen? Frag den Betreiber, er setzt es zurück.', legalPre: 'Mit dem Konto stimmst du dem zu:', privacy: 'Datenschutz', imprint: 'Impressum', credits: 'Credits und Lizenzen',
  hello: (n) => `Angemeldet als ${n}.`, play: 'Drift spielen', chPw: 'Passwort ändern', cur: 'Aktuelles Passwort', next: 'Neues Passwort', save: 'Speichern', exp: 'Meine Daten herunterladen', out: 'Abmelden',
  dSum: 'Konto löschen', dText: 'Das löscht dein Konto, deine Garage, deine Zeiten und deine Statistik für alle Spiele. Das geht nicht rückgängig. Der Name bleibt 30 Tage gesperrt.', dLabel: 'Zur Bestätigung dein Passwort', dGo: 'Konto endgültig löschen',
  cTitle: 'Herausforderungen', cIntro: 'Bis zu drei Sterne je Aufgabe, vom Server aus deiner Fahrt bestätigt.', cPlay: 'Spielen', cLap: 'Fahr im Rennen oder Zeitfahren eine saubere Runde.',
  gTitle: 'Garage', lNick: 'Spitzname (optional)', hNick: 'Das sehen die anderen über deinem Auto. Ohne Spitzname siehst du als Name deinen Kontonamen.', saved: 'Gespeichert.',
  mustChange: 'Der Betreiber hat dein Passwort zurückgesetzt. Wähle jetzt ein neues.', working: 'Kleine Rechenaufgabe läuft …',
  e: { login: 'Name oder Passwort stimmt nicht.', too_many: 'Zu viele Versuche. Warte kurz.', banned: 'Von hier ist es gerade gesperrt.', pow: 'Die kleine Rechenaufgabe hat nicht geklappt. Versuch es noch einmal.',
    signup_limit: 'Von hier wurden heute schon genug Konten angelegt. Versuch es morgen.', signup_busy: 'Gerade melden sich sehr viele an. Versuch es in ein paar Minuten.', signup_closed: 'Die Anmeldung ist noch nicht geöffnet.',
    name_taken: 'Dieser Name ist vergeben.', too_short: 'Zu kurz.', too_long: 'Zu lang.', invalid: 'Dieses Zeichen ist nicht erlaubt.', reserved: 'Dieser Name ist reserviert.', not_allowed: 'Dieser Name ist nicht erlaubt.', taken: 'Dieser Name ist vergeben.',
    'password.short': 'Mindestens 8 Zeichen.', 'password.long': 'Zu lang.', 'password.contains_name': 'Das Passwort darf deinen Namen nicht enthalten.', 'password.simple': 'Zu einfach.', 'password.common': 'Dieses Passwort ist zu bekannt.',
    mismatch: 'Die Passwörter sind verschieden.', password_wrong: 'Das Passwort stimmt nicht.', failed: 'Das hat nicht geklappt. Versuch es noch einmal.' },
} : {
  title: 'Juloc Games account', intro: 'One name and one password for all games. No e-mail, no real name needed.',
  tabIn: 'Sign in', tabUp: 'Create account', name: 'Name', pw: 'Password', pw2: 'Repeat password', go: 'Sign in', create: 'Create account',
  hName: '3 to 16 characters: letters, digits, space, dot, dash, underscore. Everybody sees this name. Please do not use your real name.',
  hPw: 'At least 8 characters. A password cannot be recovered: whoever forgets it asks the one who runs the game.',
  help: 'Forgot the password? Ask the one who runs the game, they reset it.', legalPre: 'With an account you agree to:', privacy: 'Privacy', imprint: 'Imprint', credits: 'Credits and licences',
  hello: (n) => `Signed in as ${n}.`, play: 'Play Drift', chPw: 'Change password', cur: 'Current password', next: 'New password', save: 'Save', exp: 'Download my data', out: 'Sign out',
  dSum: 'Delete account', dText: 'This deletes your account, your garage, your times and your statistics for all games. It cannot be undone. The name stays reserved for 30 days.', dLabel: 'Your password, to confirm', dGo: 'Delete the account for good',
  cTitle: 'Challenges', cIntro: 'Up to three stars each, confirmed by the server from your driving.', cPlay: 'Play', cLap: 'Set a clean lap in a race or time trial.',
  gTitle: 'Garage', lNick: 'Nickname (optional)', hNick: 'The others see this above your car. Without a nickname they see your account name.', saved: 'Saved.',
  mustChange: 'The operator reset your password. Choose a new one now.', working: 'A small puzzle is running …',
  e: { login: 'Name or password is wrong.', too_many: 'Too many tries. Wait a moment.', banned: 'This address is blocked for now.', pow: 'The small puzzle did not work out. Try again.',
    signup_limit: 'Enough accounts were made from here today. Try tomorrow.', signup_busy: 'Many people are signing up right now. Try again in a few minutes.', signup_closed: 'Sign-up is not open yet.',
    name_taken: 'This name is taken.', too_short: 'Too short.', too_long: 'Too long.', invalid: 'This character is not allowed.', reserved: 'This name is reserved.', not_allowed: 'This name is not allowed.', taken: 'This name is taken.',
    'password.short': 'At least 8 characters.', 'password.long': 'Too long.', 'password.contains_name': 'The password must not contain your name.', 'password.simple': 'Too simple.', 'password.common': 'This password is too well known.',
    mismatch: 'The passwords differ.', password_wrong: 'The password is wrong.', failed: 'That did not work. Try again.' },
};
document.documentElement.lang = de ? 'de' : 'en';
const $ = (id) => document.getElementById(id);
const text = { title: T.title, intro: T.intro, 'tab-in': T.tabIn, 'tab-up': T.tabUp, 'l-name-in': T.name, 'l-pw-in': T.pw, 'in-go': T.go, 'in-help': T.help, 'l-name-up': T.name, 'l-pw-up': T.pw, 'l-pw2-up': T.pw2, 'up-go': T.create,
  'h-name': T.hName, 'h-pw': T.hPw, 'legal-pre': T.legalPre, 'a-privacy': T.privacy, 'a-credits': T.credits, 'a-credits2': T.credits, 'a-imprint': T.imprint, play: T.play, 'b-pw': T.chPw, 'l-cur': T.cur, 'l-new': T.next, 'pw-go': T.save, 'b-export': T.exp, 'b-out': T.out,
  'c-title': T.cTitle, 'c-intro': T.cIntro, 'g-title': T.gTitle, 'l-nick': T.lNick, 'h-nick': T.hNick, 'g-save': T.save, 'd-sum': T.dSum, 'd-text': T.dText, 'l-del': T.dLabel, 'del-go': T.dGo };
for (const [id, v] of Object.entries(text)) $(id).textContent = v;
document.title = T.title;

const api = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Base': '1' }, body: body ? JSON.stringify(body) : undefined });
const message = async (r, field) => {
  const b = await r.json().catch(() => ({}));
  const code = b.fields?.[field] ?? b.fields?.password ?? b.fields?.name ?? b.error?.replace(/^games\./, '') ?? 'failed';
  return T.e[code] ?? T.e[b.error] ?? T.e[r.status === 429 ? 'too_many' : 'failed'];
};
const show = (id, msg) => { const e = $(id); e.textContent = msg; e.hidden = !msg; };

function tab(which) {
  $('f-in').hidden = which !== 'in'; $('f-up').hidden = which !== 'up';
  $('tab-in').setAttribute('aria-selected', which === 'in'); $('tab-up').setAttribute('aria-selected', which === 'up');
}
$('tab-in').onclick = () => tab('in'); $('tab-up').onclick = () => tab('up');

async function refresh() {
  const r = await fetch('/api/games/me', { headers: { Accept: 'application/json' } });
  if (!r.ok) { $('inn').hidden = true; $('out').hidden = false; tab('in'); loadChallenge(); return; }
  const me = await r.json();
  $('out').hidden = true; $('inn').hidden = false;
  $('hello').textContent = me.mustChange ? T.mustChange : T.hello(me.name);
  $('f-pw').hidden = !me.mustChange;
  $('play').hidden = me.mustChange; $('b-export').hidden = me.mustChange; $('f-garage').hidden = me.mustChange;
  $('challenges').hidden = me.mustChange;
  if (!me.mustChange) { loadGarage(); loadChallenges(); }
}

async function loadChallenges() {
  try {
    const defs = (await (await fetch('/play/data/challenges.json')).json()).challenges;
    const progress = Object.fromEntries((await (await fetch('/api/games/challenges', { headers: { Accept: 'application/json' } })).json()).progress.map((p) => [p.id, p]));
    const stars = (n) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
    $('c-list').replaceChildren(...defs.map((d) => {
      const row = document.createElement('div'); row.className = 'challenge';
      const b = document.createElement('b'); b.textContent = d.title[de ? 'de' : 'en'];
      const st = document.createElement('span'); st.className = 'stars'; st.textContent = stars(progress[d.id]?.stars ?? 0);
      const tx = document.createElement('span'); tx.className = 'muted'; tx.textContent = d.text[de ? 'de' : 'en'];
      const act = d.type === 'lap' ? Object.assign(document.createElement('span'), { className: 'muted', textContent: T.cLap }) : Object.assign(document.createElement('a'), { className: 'btn outline', href: '/play/games.html?challenge=' + d.id, textContent: T.cPlay });
      row.append(b, st, tx, act); return row;
    }));
  } catch { /* no list: the card stays empty */ }
}

let garage = null;
async function loadGarage() {
  const r = await fetch('/api/games/garage', { headers: { Accept: 'application/json' } });
  if (!r.ok) return;
  garage = await r.json();
  $('g-nick').value = garage.nick ?? '';
  drawGarage();
}
function drawGarage() {
  const cars = $('g-cars'), cols = $('g-colours');
  cars.replaceChildren(...garage.cars.map((n, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn outline carbtn'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i === garage.car); b.textContent = n; b.onclick = () => { garage.car = i; drawGarage(); }; return b; }));
  cols.replaceChildren(...Array.from({ length: 24 }, (_, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--h', i * 15); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i === garage.colour); b.setAttribute('aria-label', String(i + 1)); b.onclick = () => { garage.colour = i; drawGarage(); }; return b; }));
}
$('f-garage').addEventListener('submit', async (e) => {
  e.preventDefault(); show('g-error', ''); $('g-saved').hidden = true;
  const r = await api('PUT', '/api/games/garage', { car: garage.car, colour: garage.colour, nick: $('g-nick').value.trim(), glow: garage.glow ?? null });
  if (r.ok) { $('g-saved').textContent = T.saved; $('g-saved').hidden = false; } else show('g-error', await message(r, 'nick'));
});

let challenge = null;
async function loadChallenge() {
  try {
    const r = await fetch('/api/games/challenge', { headers: { Accept: 'application/json' } });
    const b = await r.json();
    challenge = b.challenge; show('closed', b.open ? '' : T.e.signup_closed); $('up-go').disabled = !b.open;
  } catch { show('closed', T.e.failed); }
}

const solve = (c, name) => new Promise((resolve, reject) => {
  const w = new Worker('pow.js', { type: 'module' });
  w.onmessage = (e) => { w.terminate(); resolve(e.data); };
  w.onerror = (e) => { w.terminate(); reject(e); };
  w.postMessage({ salt: c.salt, key: name, bits: c.difficulty });
});

$('f-in').addEventListener('submit', async (e) => {
  e.preventDefault(); show('in-error', ''); $('in-go').disabled = true;
  try {
    const r = await api('POST', '/api/games/login', { name: $('in-name').value, password: $('in-pw').value });
    if (r.ok) { const b = await r.json(); if (!b.mustChange && new URLSearchParams(location.search).get('next') === 'play') location.replace('/play/games.html'); else refresh(); }
    else show('in-error', await message(r));
  } catch { show('in-error', T.e.failed); }
  $('in-go').disabled = false;
});

$('f-up').addEventListener('submit', async (e) => {
  e.preventDefault(); show('up-error', '');
  if ($('up-pw').value !== $('up-pw2').value) { show('up-error', T.e.mismatch); return; }
  $('up-go').disabled = true;
  try {
    const name = $('up-name').value.trim();
    if (!challenge) await loadChallenge();
    $('up-work').textContent = T.working; $('up-work').hidden = false;
    const nonce = await solve(challenge, name);
    const r = await api('POST', '/api/games/signup', { name, password: $('up-pw').value, challenge: challenge.challenge, nonce });
    $('up-work').hidden = true; challenge = null;
    if (r.ok) { refresh(); } else { show('up-error', await message(r)); loadChallenge(); }
  } catch { $('up-work').hidden = true; show('up-error', T.e.failed); loadChallenge(); }
  $('up-go').disabled = false;
});

$('b-pw').onclick = () => { $('f-pw').hidden = !$('f-pw').hidden; };
$('f-pw').addEventListener('submit', async (e) => {
  e.preventDefault(); show('pw-error', '');
  const r = await api('POST', '/api/games/password', { current: $('pw-cur').value, next: $('pw-new').value });
  if (r.ok) { $('pw-cur').value = ''; $('pw-new').value = ''; refresh(); } else show('pw-error', await message(r, 'password'));
});
$('b-out').onclick = async () => { await api('POST', '/api/games/logout'); refresh(); };
$('f-del').addEventListener('submit', async (e) => {
  e.preventDefault(); show('del-error', '');
  const r = await api('POST', '/api/games/delete', { password: $('del-pw').value });
  if (r.ok) { $('del-pw').value = ''; refresh(); } else show('del-error', await message(r));
});

refresh();
