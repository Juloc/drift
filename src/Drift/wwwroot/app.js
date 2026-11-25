/* Drift: the garage (car, colour, nickname) and the settings. The game itself is a full-screen page of its own at /play/.
 * Pattern of the base: texts through t() (I18N-01), the frame from shell(), pages from router(), data through api(), forms with field(). */
import { addMessages, t } from '/base/i18n.js';
import { h, icon, api, shell, router, toast, field, formValues, showErrors, clearErrors, errorText, ApiError } from '/base/base.js';
import { start } from '/base/auth.js';
import { appearanceCard, securityCard, devicesCard, historyCard, installationCard, aboutCard } from '/base/account.js';
import { peopleCard } from '/base/people.js';
import { hubCard } from '/base/hub.js';
import de from '/i18n/de.js';
import en from '/i18n/en.js';

addMessages('de', de);
addMessages('en', en);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ });

/* the five cars as the garage shows them: the stats are 1..5 bars and follow game/data/cars.json */
const CARS = [
  { name: 'Dart', power: 3, top: 3, grip: 3, slide: 3, agility: 3 },
  { name: 'Pip', power: 2, top: 2, grip: 3, slide: 2, agility: 5 },
  { name: 'Bruno', power: 5, top: 5, grip: 2, slide: 4, agility: 1 },
  { name: 'Marlin', power: 3, top: 4, grip: 5, slide: 1, agility: 3 },
  { name: 'Ox', power: 1, top: 1, grip: 2, slide: 5, agility: 1 },
];
const STATS = ['power', 'top', 'grip', 'slide', 'agility'];
const HUES = Array.from({ length: 24 }, (_, i) => i * 15);

start({ icon: 'bolt', onSignedIn: run });

function run(me) {
  const frame = shell({
    app: { name: me.app.name, icon: 'bolt' },
    nav: [
      { label: t('nav.garage'), icon: 'bolt', href: '#/' },
      { label: t('shell.settings'), icon: 'sliders', href: '#/settings', foot: true },
    ],
    person: { name: me.user },
    menu: [{ label: t('shell.settings'), icon: 'sliders', href: '#/settings' }],
    // somebody who came through the central sign-in is sent on to its sign-out, which ends its own session and tells the other apps
    onSignOut: async () => { const r = await api('POST', '/api/auth/logout'); if (r && r.hubLogoutUrl) location.assign(r.hubLogoutUrl); else location.reload(); },
  });
  document.body.append(frame.el);
  router({ '/': () => garagePage(me), '/settings': () => settingsPage(me) }, frame);
}

/* ---------- the garage ---------- */
async function garagePage(me) {
  const g = await api('GET', '/api/garage');
  const state = { car: g.car, colour: g.colour };
  const preview = h('p', { class: 'garage-preview' });
  const swatch = (hue) => { const b = h('button', { class: 'swatch', type: 'button', role: 'radio', 'aria-label': t('garage.colourN', { n: hue / 15 + 1 }) }); b.style.setProperty('--h', hue); return b; };

  const carButtons = CARS.map((c, i) => {
    const bars = STATS.map((s) => h('div', { class: 'stat' }, h('span', { class: 'stat-name', text: t('garage.stat.' + s) }),
      h('span', { class: 'bars', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => h('i', { class: n <= c[s] ? 'on' : '' })))));
    const b = h('button', { class: 'car', type: 'button', role: 'radio', onclick: () => { state.car = i; sync(); } },
      h('span', { class: 'car-name', text: c.name }), h('span', { class: 'car-note', text: t('garage.car.' + i) }), h('span', { class: 'stats' }, bars));
    return b;
  });
  const swatches = HUES.map((hue, i) => { const b = swatch(hue); b.addEventListener('click', () => { state.colour = i; sync(); }); return b; });

  const nick = field({ label: t('garage.nick'), name: 'nick', value: g.nick || '', maxlength: 16, autocomplete: 'off', hint: t('garage.nickHint', { name: g.name }) });
  const form = h('form', { class: 'form' }, nick);

  function sync() {
    carButtons.forEach((b, i) => b.setAttribute('aria-checked', String(i === state.car)));
    swatches.forEach((b, i) => b.setAttribute('aria-checked', String(i === state.colour)));
    const name = form.querySelector('[name="nick"]').value.trim() || g.name;
    preview.replaceChildren(h('span', { class: 'dot' }), h('span', { text: t('garage.preview', { name, car: CARS[state.car].name }) }));
    preview.firstChild.style.setProperty('--h', state.colour * 15);
  }
  nick.querySelector('input').addEventListener('input', sync);
  sync();

  const save = async () => {
    clearErrors(form);
    try { await api('PUT', '/api/garage', { car: state.car, colour: state.colour, ...formValues(form) }); }
    catch (e) { if (!(e instanceof ApiError)) throw e; showErrors(form, e); toast(errorText(e), { kind: 'danger' }); return; }
    toast(t('garage.saved'), { kind: 'ok' });
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  return {
    title: t('garage.title'), sub: t('garage.sub'),
    actions: [h('a', { class: 'btn primary', href: '/play/', target: '_blank', rel: 'noopener' }, icon('bolt'), t('garage.play'))],
    body: h('div', { class: 'page stack' },
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.car') }), h('div', { class: 'cars', role: 'radiogroup', 'aria-label': t('garage.car') }, carButtons)),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.colour') }), h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('garage.colour') }, swatches)),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.name') }), form),
      boardCard(await api('GET', '/api/times')),
      h('div', { class: 'card stack' }, preview,
        h('div', { class: 'cluster' },
          h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('check'), t('common.save')),
          h('a', { class: 'btn outline', href: '/play/', target: '_blank', rel: 'noopener' }, icon('bolt'), t('garage.play'))))),
  };
}

/* ---------- the best times ---------- */
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
function boardCard(b) {
  const list = (rows) => rows.length
    ? h('ol', { class: 'board' }, rows.map((r, i) => h('li', null, h('span', { class: 'board-pos', text: String(i + 1) }), h('span', { class: 'board-name', text: r.name }), h('span', { class: 'board-car', text: CARS[r.car]?.name || '' }), h('span', { class: 'board-time', text: mmss(r.ms) }))))
    : h('p', { class: 'muted', text: t('board.none') });
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('board.title', { map: b.map }) }),
    h('div', { class: 'boards' },
      h('div', null, h('h3', { class: 'board-head', text: t('board.lap') }), list(b.lap)),
      h('div', null, h('h3', { class: 'board-head', text: t('board.race', { laps: b.laps }) }), list(b.race))));
}

/* ---------- settings: the cards of the base ---------- */
function settingsPage(me) {
  return {
    title: t('settings.title'),
    body: h('div', { class: 'page narrow stack l' }, appearanceCard(), securityCard(me), devicesCard(), historyCard(),
      me.roles.includes('admin') ? peopleCard(me) : null, me.roles.includes('admin') ? hubCard(me) : null,
      me.roles.includes('admin') ? installationCard() : null, aboutCard(me)),
  };
}
