/* Drift: the garage (car, colour, nickname) and the settings. The game itself is a full-screen page of its own at /play/.
 * Pattern of the base: texts through t() (I18N-01), the frame from shell(), pages from router(), data through api(), forms with field(). */
import { addMessages, t, fmtDate } from '/base/i18n.js';
import { h, icon, api, shell, router, toast, field, confirmDialog, formValues, showErrors, clearErrors, errorText, ApiError } from '/base/base.js';
import { start } from '/base/auth.js';
import { appearanceCard, securityCard, devicesCard, historyCard, installationCard, aboutCard } from '/base/account.js';
import { peopleCard } from '/base/people.js';
import { gamesAdminCard } from '/games-admin.js';
import { hubCard } from '/base/hub.js';
import de from '/i18n/de.js';
import en from '/i18n/en.js';

addMessages('de', de);
addMessages('en', en);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ });

/* the five cars as the garage shows them: the stats are 1..5 bars and follow game/data/cars.json */
const CARS = [
  { name: 'Dart', power: 3, top: 3, grip: 3, slide: 3, agility: 3 },
  { name: 'AE86', power: 2, top: 2, grip: 2, slide: 4, agility: 4 },
  { name: 'Bruno', power: 5, top: 5, grip: 2, slide: 4, agility: 1 },
  { name: 'Marlin', power: 3, top: 4, grip: 5, slide: 1, agility: 3 },
  { name: 'Ox', power: 1, top: 1, grip: 2, slide: 5, agility: 1 },
];
const STATS = ['power', 'top', 'grip', 'slide', 'agility'];
const HUES = Array.from({ length: 24 }, (_, i) => i * 15);
const PAINTS = [['white', '#e6e1d8'], ['black', '#18181d'], ['silver', '#b9bec8']];   // paints 24 to 26

// the first page for somebody who is not signed in: drive at once (no account) or sign in; an invitation or the sign-in itself skip it
async function landing() {
  try {
    const me = await api('GET', '/api/auth/me');
    if (me.user || me.setupNeeded || /^#(invite=|signin)/.test(location.hash)) return false;
    document.title = me.app.name;
    document.body.replaceChildren(h('main', { class: 'auth' }, h('section', { class: 'card stack' },
      h('h1', { class: 'card-title', text: me.app.name }), h('p', { class: 'muted', text: t('landing.text') }),
      h('a', { class: 'btn primary', href: '/play/' }, icon('bolt'), t('landing.drive')),
      h('button', { class: 'btn outline', type: 'button', onclick: () => { location.hash = 'signin'; location.reload(); } }, t('landing.signin')))));
    return true;
  } catch { return false; }
}
if (!(await landing())) start({ icon: 'bolt', onSignedIn: run });

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
  const tuning = await api('GET', '/api/tuning');
  const stats = await api('GET', '/api/stats');
  const state = { car: g.car, colour: g.colour, glow: g.glow ?? null };
  const preview = h('p', { class: 'garage-preview' });
  const swatch = (hue) => { const b = h('button', { class: 'swatch', type: 'button', role: 'radio', 'aria-label': t('garage.colourN', { n: hue / 15 + 1 }) }); b.style.setProperty('--h', hue); return b; };

  state.car = 1;   // one car for now (docs/FOCUS.md): the AE86; the other four stay valid in the data but are not offered
  const carButtons = CARS.map((c, i) => {
    const bars = STATS.map((s) => h('div', { class: 'stat' }, h('span', { class: 'stat-name', text: t('garage.stat.' + s) }),
      h('span', { class: 'bars', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => h('i', { class: n <= c[s] ? 'on' : '' })))));
    const b = h('button', { class: 'car', type: 'button', role: 'radio', onclick: () => { state.car = i; sync(); } },
      h('span', { class: 'car-name', text: c.name }), h('span', { class: 'car-note', text: t('garage.car.' + i) }), h('span', { class: 'stats' }, bars));
    return b;
  });
  const swatches = HUES.map((hue, i) => { const b = swatch(hue); b.addEventListener('click', () => { state.colour = i; sync(); }); return b; });
  PAINTS.forEach(([key, colour], k) => { const b = h('button', { class: 'swatch paint', type: 'button', role: 'radio', 'aria-label': t('garage.paint.' + key) }); b.style.background = colour; b.addEventListener('click', () => { state.colour = 24 + k; sync(); }); swatches.push(b); });
  // underglow: off, or one of the 24 hues
  const glowOff = h('button', { class: 'btn outline', type: 'button', role: 'radio', onclick: () => { state.glow = null; sync(); } }, t('garage.glowOff'));
  const glowSwatches = HUES.map((hue, i) => { const b = swatch(hue); b.setAttribute('aria-label', t('garage.glowN', { n: i + 1 })); b.addEventListener('click', () => { state.glow = i; sync(); }); return b; });

  const nick = field({ label: t('garage.nick'), name: 'nick', value: g.nick || '', maxlength: 16, autocomplete: 'off', hint: t('garage.nickHint', { name: g.name }) });
  const form = h('form', { class: 'form' }, nick);

  // tuning of the chosen car: four sliders, 10 points in all; moving one past what is left stops where the points end
  const TUNE = ['steer', 'balance', 'power', 'handbrake'];
  const tuneBox = h('div', { class: 'stack' });
  const points = h('p', { class: 'muted' });
  function drawTuning() {
    const cur = tuning.cars[state.car];
    const used = () => TUNE.reduce((a, k) => a + Math.abs(cur[k]), 0);
    points.textContent = t('tune.points', { used: used(), budget: tuning.budget });
    tuneBox.replaceChildren(...TUNE.map((k) => {
      const out = h('span', { class: 'tune-val', text: String(cur[k]) });
      const input = h('input', { type: 'range', min: String(-tuning.max), max: String(tuning.max), step: '1', value: String(cur[k]), 'aria-label': t('tune.' + k) });
      input.addEventListener('input', () => {
        const want = Number(input.value), room = tuning.budget - (used() - Math.abs(cur[k]));
        cur[k] = Math.sign(want) * Math.min(Math.abs(want), room); input.value = String(cur[k]); out.textContent = String(cur[k]);
        points.textContent = t('tune.points', { used: used(), budget: tuning.budget });
      });
      return h('div', { class: 'tune-row' }, h('div', { class: 'tune-head' }, h('span', { class: 'tune-name', text: t('tune.' + k) }), out), input, h('div', { class: 'tune-ends' }, h('span', { text: t('tune.' + k + '.neg') }), h('span', { text: t('tune.' + k + '.pos') })));
    }));
  }
  const tuneReset = h('button', { class: 'btn ghost', type: 'button', onclick: () => { for (const k of TUNE) tuning.cars[state.car][k] = 0; drawTuning(); } }, t('tune.reset'));

  function sync() {
    drawTuning();
    carButtons.forEach((b, i) => b.setAttribute('aria-checked', String(i === state.car)));
    swatches.forEach((b, i) => b.setAttribute('aria-checked', String(i === state.colour)));
    glowOff.setAttribute('aria-checked', String(state.glow === null));
    glowSwatches.forEach((b, i) => b.setAttribute('aria-checked', String(i === state.glow)));
    const name = form.querySelector('[name="nick"]').value.trim() || g.name;
    preview.replaceChildren(h('span', { class: 'dot' }), h('span', { text: t('garage.preview', { name, car: CARS[state.car].name }) }));
    if (state.colour >= 24) preview.firstChild.style.background = PAINTS[state.colour - 24][1]; else { preview.firstChild.style.background = ''; preview.firstChild.style.setProperty('--h', state.colour * 15); }
  }
  nick.querySelector('input').addEventListener('input', sync);
  sync();

  const save = async () => {
    clearErrors(form);
    try { await api('PUT', '/api/garage', { car: state.car, colour: state.colour, glow: state.glow, ...formValues(form) }); await api('PUT', '/api/tuning/' + state.car, tuning.cars[state.car]); }
    catch (e) { if (!(e instanceof ApiError)) throw e; showErrors(form, e); toast(errorText(e), { kind: 'danger' }); return; }
    toast(t('garage.saved'), { kind: 'ok' });
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  return {
    title: t('garage.title'), sub: t('garage.sub'),
    actions: [h('a', { class: 'btn primary', href: '/play/' }, icon('bolt'), t('garage.play'))],
    body: h('div', { class: 'page stack' },
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.car') }), h('div', { class: 'cars', role: 'radiogroup', 'aria-label': t('garage.car') }, carButtons.filter((_, i) => i === 1))),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.colour') }), h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('garage.colour') }, swatches)),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('tune.title') }), h('p', { class: 'muted', text: t('tune.intro') }), points, tuneBox, h('div', { class: 'cluster' }, tuneReset)),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.glow') }), h('p', { class: 'muted', text: t('garage.glowHint') }), glowOff, h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('garage.glow') }, glowSwatches)),
      h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('garage.name') }), form),
      controlsCard(),
      // challenges and the race boards are paused (docs/FOCUS.md): the code stays (challengesCard, boardCard), the garage does not show them
      statsCard(stats),
      h('div', { class: 'card stack' }, preview,
        h('div', { class: 'cluster' },
          h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('check'), t('common.save')),
          h('a', { class: 'btn outline', href: '/play/' }, icon('bolt'), t('garage.play'))))),
  };
}

/* ---------- controls at the PC: kept on this device, read by the game page ---------- */
function controlsCard() {
  const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not kept */ } };
  const group = (label, key, def, options) => {
    const box = h('div', { class: 'cluster', role: 'radiogroup', 'aria-label': label });
    const draw = () => box.replaceChildren(...options.map(([value, text]) => h('button', { class: 'btn outline', type: 'button', role: 'radio', 'aria-checked': String(get(key, def) === value), onclick: () => { put(key, value); toast(t('controls.saved'), { kind: 'ok' }); draw(); } }, text)));
    draw();
    return h('div', { class: 'stack s' }, h('strong', { text: label }), box);
  };
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('controls.title') }), h('p', { class: 'muted', text: t('controls.intro') }),
    group(t('controls.keys'), 'drift.keys', 'soft', [['soft', t('controls.soft')], ['direct', t('controls.direct')]]),
    h('p', { class: 'muted', text: t('controls.keysHint') }),
    group(t('controls.mouse'), 'drift.mouse', '0', [['0', t('controls.off')], ['1', t('controls.on')]]),
    h('p', { class: 'muted', text: t('controls.mouseHint') }));
}

/* ---------- challenges with stars ---------- */
async function challengesCard() {
  let defs = [], progress = {};
  try {
    defs = (await (await fetch('/play/data/challenges.json')).json()).challenges;
    progress = Object.fromEntries((await api('GET', '/api/challenges')).progress.map((p) => [p.id, p]));
  } catch { /* no list: the card stays empty rather than breaking the garage */ }
  const lang = document.documentElement.lang === 'de' ? 'de' : 'en';
  const stars = (n) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
  const row = (d) => h('div', { class: 'challenge' },
    h('b', { text: d.title[lang] }), h('span', { class: 'stars', 'aria-label': t('challenges.stars', { n: progress[d.id]?.stars ?? 0 }), text: stars(progress[d.id]?.stars ?? 0) }),
    h('span', { class: 'muted', text: d.text[lang] }),
    d.type === 'lap' ? h('span', { class: 'muted', text: t('challenges.lap') }) : h('a', { class: 'btn outline', href: '/play/?challenge=' + d.id }, icon('bolt'), t('challenges.play')));
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('challenges.title') }), h('p', { class: 'muted', text: t('challenges.intro') }), ...defs.map(row));
}

/* ---------- stats of the person ---------- */
const hours = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
function statsCard(s) {
  const cell = (label, value) => h('div', { class: 'stat-cell' }, h('b', { text: String(value) }), h('span', { text: label }));
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('stats.title') }),
    h('div', { class: 'stat-grid' }, cell(t('stats.km'), s.km), cell(t('stats.races'), s.races), cell(t('stats.wins'), s.wins), cell(t('stats.podiums'), s.podiums), cell(t('stats.drift'), s.bestDrift), cell(t('stats.time'), hours(s.seconds))));
}

/* ---------- the best times ---------- */
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}`;
function boardCard(first) {
  const body = h('div', { class: 'boards' });
  const title = h('h2', { class: 'card-title' });
  const select = h('select', { class: 'select', 'aria-label': t('board.map') }, first.maps.map((m) => h('option', { value: String(m.id), text: m.name })));
  select.value = String(first.mapId);
  const show = (kind, v) => (kind === 'drift' ? String(v) : mmss(v));
  const list = (kind, b) => h('div', null,
    b.top.length
      ? h('ol', { class: 'board' }, b.top.map((r, i) => h('li', { class: r.mine ? 'mine' : '' }, h('span', { class: 'board-pos', text: String(i + 1) }), h('span', { class: 'board-name', text: r.name }), h('span', { class: 'board-car', text: CARS[r.car]?.name || '' }), h('span', { class: 'board-time', text: show(kind, r.value) }))))
      : h('p', { class: 'muted', text: t('board.none') }),
    // your own place, when you are not among the first ten
    b.mine && !b.top.some((r) => r.mine) ? h('p', { class: 'board-mine', text: t('board.yours', { place: b.mine.place, value: show(kind, b.mine.value) }) }) : null);
  const draw = (b) => {
    title.textContent = t('board.title', { map: b.map });
    body.replaceChildren(
      h('div', null, h('h3', { class: 'board-head', text: t('board.lap') }), list('lap', b.lap)),
      h('div', null, h('h3', { class: 'board-head', text: t('board.race', { laps: b.laps }) }), list('race', b.race)),
      h('div', null, h('h3', { class: 'board-head', text: t('board.drift') }), list('drift', b.drift)));
  };
  select.addEventListener('change', async () => draw(await api('GET', '/api/times?map=' + select.value)));
  draw(first);
  return h('section', { class: 'card stack' }, title, select, body);
}

/* ---------- guest links (administrator) ---------- */
function guestCard() {
  const list = h('div', { class: 'stack' });
  const made = h('div', { class: 'stack' });
  const form = h('form', { class: 'form' },
    field({ label: t('guest.hours'), name: 'hours', type: 'number', value: '4', min: '1', max: '12', hint: t('guest.hoursHint') }),
    field({ label: t('guest.uses'), name: 'uses', type: 'number', value: '5', min: '1', max: '20', hint: t('guest.usesHint') }),
    h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), t('guest.make')));

  async function refresh() {
    const r = await api('GET', '/api/guest-links');
    list.replaceChildren(...(r.links.length
      ? r.links.map((l) => h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: t('guest.valid', { until: fmtDate(l.expiresAt) }) }), h('span', { class: 'row-sub', text: t('guest.used', { n: l.uses, max: l.maxUses }) })),
          h('a', { class: 'btn outline', href: '/play/?world=' + l.id }, icon('bolt'), t('guest.join')),   // the private world of this link: only the people who came in by it, and you
          h('button', { class: 'btn ghost danger', type: 'button', onclick: async () => { await api('DELETE', '/api/guest-links/' + l.id); toast(t('guest.ended'), { kind: 'ok' }); refresh(); } }, t('guest.end'))))
      : [h('p', { class: 'muted', text: t('guest.none') })]));
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(form);
    const v = formValues(form);
    try {
      const l = await api('POST', '/api/guest-links', { hours: Number(v.hours), uses: Number(v.uses) });
      const url = `${location.origin}/g/#${l.token}`;
      // shown once: the server keeps only a hash of the secret
      const box = h('input', { class: 'input', readonly: '', value: url, 'aria-label': t('guest.link') });
      made.replaceChildren(h('div', { class: 'notice ok' }, icon('check-circle'), h('div', { class: 'notice-text', text: t('guest.once') })), box,
        h('button', { class: 'btn outline', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(url); toast(t('guest.copied'), { kind: 'ok' }); } catch { box.select(); } } }, icon('copy'), t('guest.copy')));
      refresh();
    } catch (err) { if (!(err instanceof ApiError)) throw err; showErrors(form, err); }
  });
  const endAll = async () => {
    if (!await confirmDialog({ title: t('guest.endAllTitle'), text: t('guest.endAllText'), confirmLabel: t('guest.endAll'), danger: true })) return;
    const r = await api('POST', '/api/guest-links/end-all');
    toast(t('guest.endedN', { n: r.ended }), { kind: 'ok' }); made.replaceChildren(); refresh();
  };
  refresh();
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('guest.title') }), h('p', { class: 'muted', text: t('guest.intro') }), form, made, list,
    h('div', { class: 'cluster' }, h('button', { class: 'btn ghost danger', type: 'button', onclick: endAll }, icon('power'), t('guest.endAll'))));
}

/* ---------- settings: the cards of the base ---------- */
function settingsPage(me) {
  return {
    title: t('settings.title'),
    body: h('div', { class: 'page narrow stack l' }, appearanceCard(), securityCard(me), devicesCard(), historyCard(),
      me.roles.includes('admin') ? guestCard() : null,
      me.roles.includes('admin') ? gamesAdminCard() : null,
      me.roles.includes('admin') ? peopleCard(me) : null, me.roles.includes('admin') ? hubCard(me) : null,
      me.roles.includes('admin') ? installationCard() : null, aboutCard(me),
      h('p', { class: 'muted' }, h('a', { href: '/credits/', text: t('credits.link') }))),
  };
}
