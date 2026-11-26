// The interface lab: every screen of the new interface with sample data, clickable, at the PC (1600x900) and on a phone held across (844x390).
// Each screen is its own view (#garage, #modi, ...), so the owner can click through on the phone and give feedback on one at a time. No server,
// no build step, no inline script (the page's content policy); every text through t() (i18n.js).
import { t, lang, setLang, num } from './i18n.js';
import { ICON } from './icons.js';
import { createGarage } from './garage3d.js';

// ---------------------------------------------------------------- sample data (made up; the car is the game's own, from data/cars.json)
const PAINTS = ['#e6e1d8', '#18181d', '#b9bec8', '#d23a64', '#2f9a9a', '#8a7fd0'];
const SAMPLE = {
  player: { level: 12, xp: 0.62 },
  car: { hp: 130, kg: 940, bars: { power: 58, handling: 81, drift: 88, grip: 64 } },
  tasks: [{ key: 'task1', done: true }, { key: 'task2', done: true }, { key: 'task3', done: false, progress: 0.42 }],
  bests: [{ key: 'attack', value: () => num(18420) }, { key: 'timeAttack', value: () => '2:41.380' }],
  modes: [
    { key: 'free', icon: 'world', tag: 'online', img: 'img/mode-free.jpg', href: '../index.html?map=touge', main: true },
    { key: 'attack', icon: 'trophy', tag: 'solo', img: 'img/mode-attack.jpg', href: '../index.html?map=touge&mode=attack', best: () => num(18420) },
    { key: 'timeAttack', icon: 'timer', tag: 'solo', img: 'img/mode-time.jpg', href: '../index.html?map=touge&mode=time', best: () => '2:41.380' },
    { key: 'tandem', icon: 'tandem', tag: 'two', img: 'img/mode-tandem.jpg', href: '../index.html?map=touge&mode=tandem' },
    { key: 'training', icon: 'ghost', tag: 'solo', img: 'img/mode-training.jpg', href: '../index.html?map=touge&mode=training' },
  ],
};

// ---------------------------------------------------------------- a small helper for building elements
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const icon = (name, cls = 'ic') => h('span', { class: cls, html: ICON[name] });

// ---------------------------------------------------------------- navigation: the PC has it on top, the phone at the bottom (CSS); gone while driving
const NAV = [
  { key: 'navGarage', icon: 'garage', view: 'garage' },
  { key: 'navWorld', icon: 'world', view: 'welt' },
  { key: 'navEvents', icon: 'events', view: 'modi' },
  { key: 'navWorkshop', icon: 'workshop', view: 'werkstatt' },
  { key: 'navSettings', icon: 'settings', view: 'einstellungen' },
  { key: 'navDealer', icon: 'dealer', locked: true },
  { key: 'navCareer', icon: 'career', locked: true },
  { key: 'navCommunity', icon: 'community', locked: true },
];
function nav(current) {
  return h('nav', { class: 'nav', 'aria-label': t('screens') },
    h('div', { class: 'nav-items' }, NAV.map((n) => n.locked
      ? h('span', { class: 'nav-item locked', title: t('soon'), 'aria-disabled': 'true' }, icon(n.icon), h('span', { class: 'nav-label' }, t(n.key)), h('span', { class: 'nav-lock' }, icon('lock', 'ic tiny')))
      : h('a', { class: `nav-item${n.view === current ? ' on' : ''}`, href: `#${n.view}`, 'aria-current': n.view === current ? 'page' : null }, icon(n.icon), h('span', { class: 'nav-label' }, t(n.key))))),
    h('div', { class: 'nav-side' },
      h('button', { class: 'lang', type: 'button', onclick: () => { setLang(lang === 'de' ? 'en' : 'de'); show(); } }, lang === 'de' ? 'EN' : 'DE'),
      h('div', { class: 'player' }, h('span', { class: 'player-dot' }), h('div', {}, h('b', {}, t('guest')), h('small', {}, `${t('level')} ${SAMPLE.player.level}`), h('span', { class: 'xp' }, h('i', { class: 'xp-fill' }))))));
}

// ---------------------------------------------------------------- the garage as home (sheet 1)
let paintIndex = 0;
function garageView() {
  const C = SAMPLE.car, bar = (key) => h('div', { class: 'bar' }, h('span', {}, t(key)), h('i', { class: 'track' }, h('i', { class: 'fill', 'data-v': C.bars[key] })), h('b', { class: 'num' }, C.bars[key]));
  const carCard = h('section', { class: 'card car-card' },
    h('small', { class: 'over' }, t('current')),
    h('h1', { class: 'car-name' }, carName),
    h('div', { class: 'tags' }, h('span', { class: 'tag hot' }, t('tagDrift')), h('span', { class: 'tag' }, t('tagRwd'))),
    h('div', { class: 'stats' },
      h('div', {}, icon('bolt'), h('b', { class: 'num' }, C.hp), h('small', {}, t('hp'))),
      h('div', {}, icon('weight'), h('b', { class: 'num' }, num(C.kg)), h('small', {}, t('kg'))),
      h('div', {}, icon('axle'), h('b', {}, t('rwd')), h('small', {}, t('drive')))),
    h('div', { class: 'bars' }, ['power', 'handling', 'drift', 'grip'].map(bar)));
  const tasks = h('section', { class: 'card side-card' },
    h('header', {}, icon('tasks'), h('b', {}, t('daily')), h('span', { class: 'count num' }, `${SAMPLE.tasks.filter((x) => x.done).length} / ${SAMPLE.tasks.length}`)),
    h('ul', { class: 'tasks' }, SAMPLE.tasks.map((x) => h('li', { class: x.done ? 'done' : '' }, h('span', { class: 'box' }, x.done ? icon('check', 'ic tiny') : null), h('span', {}, t(x.key)),
      x.progress !== undefined ? h('i', { class: 'track small' }, h('i', { class: 'fill', 'data-v': Math.round(x.progress * 100) })) : null))));
  const bests = h('section', { class: 'card side-card' },
    h('header', {}, icon('trophy'), h('b', {}, t('bests'))),
    h('dl', { class: 'bests' }, SAMPLE.bests.flatMap((b) => [h('dt', {}, t(b.key)), h('dd', { class: 'num' }, b.value())])));
  const TILES = [['car', 'myCars', 'myCarsSub'], ['tuning', 'tuning', 'tuningSub'], ['design', 'design', 'designSub'], ['setup', 'setup', 'setupSub'], ['tasks', 'tasks', 'tasksSub', 1], ['photo', 'photo', 'photoSub']];
  const tiles = h('div', { class: 'tiles' }, TILES.map(([ic, k, sub, badge]) => h('a', { class: 'tile', href: '#werkstatt' }, badge ? h('span', { class: 'badge num' }, badge) : null, icon(ic, 'ic big'), h('b', {}, t(k)), h('small', {}, t(sub)))));
  const paints = h('div', { class: 'paints' },
    h('button', { class: 'round', type: 'button', 'aria-label': t('prevPaint'), onclick: () => pickPaint(-1) }, icon('back')),
    PAINTS.map((p, i) => h('button', { class: `dot${i === paintIndex ? ' on' : ''}`, type: 'button', 'aria-label': `${t('paint')} ${i + 1}`, 'data-paint': p, onclick: () => pickPaint(i - paintIndex) })),
    h('button', { class: 'round', type: 'button', 'aria-label': t('nextPaint'), onclick: () => pickPaint(1) }, icon('next')));
  return h('main', { class: 'view garage' }, nav('garage'), carCard, h('div', { class: 'side' }, tasks, bests), h('p', { class: 'hint' }, t('turnHint')), paints, tiles, bottomBar(true));
}
/** The bar at the bottom: back and settings, the track and its conditions, and (in the garage) the big button to drive. */
function bottomBar(withGo) {
  return h('div', { class: 'bottom' },
    h('div', { class: 'small-buttons' },
      h('a', { class: 'chip-btn', href: '#garage' }, icon('back', 'ic tiny'), t('back')),
      h('a', { class: 'chip-btn', href: '#einstellungen' }, icon('settings', 'ic tiny'), t('settings'))),
    h('div', { class: 'conditions' },
      h('span', {}, icon('track', 'ic tiny'), h('small', {}, t('track')), h('b', {}, t('trackName'))),
      h('span', {}, icon('sunset', 'ic tiny'), h('small', {}, t('timeOfDay')), h('b', {}, t('dusk'))),
      h('span', {}, icon('cloud', 'ic tiny'), h('small', {}, t('weather')), h('b', {}, t('clear')))),
    withGo ? h('a', { class: 'go', href: '#modi' }, icon('play', 'ic go-play'), h('span', {}, t('go')), icon('chevrons', 'ic go-chev')) : h('span', { class: 'go-space' }));
}
function pickPaint(step) {
  paintIndex = (paintIndex + step + PAINTS.length) % PAINTS.length;
  garage?.setPaint(PAINTS[paintIndex]);
  for (const d of document.querySelectorAll('.paints .dot')) d.classList.toggle('on', d.dataset.paint === PAINTS[paintIndex]);
}

// ---------------------------------------------------------------- the choice of game mode
function modesView() {
  const cards = SAMPLE.modes.map((m) => h('article', { class: `card mode${m.main ? ' main' : ''}` },
    h('div', { class: 'mode-img', 'data-img': m.img }),
    h('div', { class: 'mode-body' },
      h('div', { class: 'mode-head' }, icon(m.icon), h('h2', {}, t(m.key)), h('span', { class: `tag${m.tag === 'online' ? ' hot' : ''}` }, t(m.tag))),
      h('p', {}, t(`${m.key}Text`)),
      h('div', { class: 'mode-foot' },
        m.best ? h('span', { class: 'best' }, h('small', {}, t('best')), h('b', { class: 'num' }, m.best())) : h('span'),
        h('a', { class: 'start', href: m.href }, icon('play', 'ic tiny'), t('start'))))));
  return h('main', { class: 'view modes' }, nav('modi'), h('header', { class: 'page-head' }, h('h1', {}, t('modesTitle')), h('p', {}, t('modesSub'))), h('div', { class: 'mode-row' }, cards), bottomBar(false));
}

function laterView(view) {
  return h('main', { class: 'view later' }, nav(view), h('section', { class: 'card later-card' }, icon('workshop', 'ic big'), h('p', {}, t('later')), h('a', { class: 'chip-btn', href: '#garage' }, icon('back', 'ic tiny'), t('navGarage'))));
}

// ---------------------------------------------------------------- views and the 3D garage behind them
const VIEWS = { garage: garageView, modi: modesView };
const root = document.getElementById('ui'), canvas = document.getElementById('scene');
let garage = null, carName = 'AE86', current = '';
function show() {
  const view = location.hash.slice(1) || 'garage';
  current = view;
  document.title = t('title');
  document.body.dataset.view = view;
  root.replaceChildren((VIEWS[view] ?? (() => laterView(view)))());
  // widths and pictures from data attributes (no inline styles: the content policy)
  for (const f of root.querySelectorAll('.fill[data-v]')) f.style.width = `${f.dataset.v}%`;
  for (const d of root.querySelectorAll('.dot[data-paint]')) d.style.background = d.dataset.paint;
  for (const m of root.querySelectorAll('.mode-img[data-img]')) m.style.backgroundImage = `url("${m.dataset.img}")`;
  if (garage) garage.spin = view === 'garage';
  canvas.classList.toggle('dim', view !== 'garage');
}
addEventListener('hashchange', show);

const q = new URLSearchParams(location.search);
const phone = matchMedia('(max-height: 520px), (max-width: 700px)').matches || q.get('tier') === 'low';
document.body.classList.toggle('phone', phone);
setLang(lang);
const cars = await fetch('../data/cars.json').then((r) => r.json()).catch(() => ({ cars: [] }));
const spec = cars.cars.find((c) => c.model === 'ae86');
carName = spec?.name ?? carName;
show();
garage = await createGarage(canvas, { tier: phone ? 'low' : 'high', model: 'ae86', paint: PAINTS[0], spec: spec?.fx ?? {} });
// the car sits in the free middle of the screen; on the phone a little higher (the bottom bar)
garage.frame = phone ? { x: 0.5, y: 0.46, dist: 9.2 } : { x: 0.5, y: 0.47, dist: 10.5 };
garage.resize();
garage.spin = current === 'garage';

// for the measuring tools (tools/shoot-probe.mjs): the same handle the look probe gives
window.__probe = {
  renderer: garage.renderer, get frames() { return garage.frames; }, worldTriangles: 0, get buildMs() { return garage.buildMs; }, t: 0, slip: 0, sunScreen: () => null,
  bench(n) { const gl = garage.renderer.getContext(), px = new Uint8Array(4), a = performance.now(); for (let i = 0; i < n; i++) { garage.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - a) / n; },
};
