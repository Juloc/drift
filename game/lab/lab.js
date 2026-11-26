// The interface lab: every screen of the new interface with sample data, clickable, at the PC (1600x900) and on a phone held across (844x390).
// Each screen is its own view (#garage, #modi, ...), so the owner can click through on the phone and give feedback on one at a time. No server,
// no build step, no inline script (the page's content policy); every text through t() (i18n.js).
import { t, lang, setLang, num } from './i18n.js';
import { ICON } from './icons.js';
import { createGarage } from './garage3d.js';

// ---------------------------------------------------------------- sample data (made up; the car is the game's own, from data/cars.json)
const PAINTS = ['#e6e1d8', '#18181d', '#b9bec8', '#d23a64', '#2f9a9a', '#8a7fd0'];
const SAMPLE = {
  player: { name: 'Mika', guest: true },
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
  { key: 'navWorld', icon: 'world', view: 'strecken' },
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
      // a guest's own name with "(Guest)"; a signed-in player shows the account's user name (no levels until there is progress)
      h('div', { class: 'player' }, h('span', { class: 'player-dot' }), h('b', {}, SAMPLE.player.guest ? `${SAMPLE.player.name} (${t('guest')})` : SAMPLE.player.name))));
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

// ---------------------------------------------------------------- the track list (sheets 2 to 4, "world map, simple view"): only the touge is open
const TRACKS = [
  { key: 'touge', region: 'regionMountain', km: 2.0, open: true, img: 'img/mode-attack.jpg', fav: true },
  { key: 'practice', region: 'regionPractice', km: 0.69, open: true, href: '../?map=practice', icon: 'track', hue: 150 },   // the practice ground: drift circles, a figure eight, slalom and a short course; driven alone, no account needed
  { key: 'snowPass', region: 'regionSnow', km: 2.4, icon: 'snow', hue: 250 },
  { key: 'harbour', region: 'regionCoast', km: 1.6, icon: 'wave', hue: 215 },
  { key: 'coast', region: 'regionCoast', km: 3.1, icon: 'wave', hue: 190 },
  { key: 'nightCity', region: 'regionCity', km: 2.2, icon: 'city', hue: 300 },
  { key: 'desert', region: 'regionDesert', km: 2.8, icon: 'dune', hue: 30 },
];
const TRACK_LINE = 'M8 70 C 30 70, 30 30, 52 30 S 70 62, 92 56 S 120 18, 140 24 S 150 60, 172 62';
function tracksView() {
  const filters = ['filterAll', 'filterFav', 'filterMountain', 'filterCity', 'filterCoast'];
  const card = (tr) => h(tr.open ? 'a' : 'article', { class: `card course${tr.open ? ' open' : ' soon'}`, href: tr.open ? tr.href ?? '#strecke' : null },
    tr.img ? h('div', { class: 'track-img', 'data-img': tr.img })
      : h('div', { class: 'track-img art', 'data-hue': tr.hue }, h('span', { class: 'track-line', html: `<svg viewBox="0 0 180 90" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="${TRACK_LINE}"/></svg>` }), icon(tr.icon, 'ic big')),
    h('div', { class: 'track-body' },
      h('div', { class: 'track-head' }, h('h2', {}, t(tr.key)), h('span', { class: 'fav' }, icon(tr.fav ? 'heartFull' : 'heart', 'ic tiny'))),
      h('div', { class: 'track-meta' }, h('span', {}, t(tr.region)), h('b', { class: 'num' }, `${num(tr.km, 2)} ${t('km')}`),
        h('span', { class: `tag${tr.open ? ' hot' : ''}` }, tr.open ? t('open') : t('soon')))));
  return h('main', { class: 'view tracks' }, nav('strecken'),
    h('header', { class: 'page-head' }, h('h1', {}, t('tracksTitle')), h('p', {}, t('tracksSub'))),
    h('div', { class: 'filters' }, filters.map((f, i) => h('button', { class: `chip${i === 0 ? ' on' : ''}`, type: 'button', onclick: (e) => { for (const c of e.currentTarget.parentNode.querySelectorAll('.chip')) c.classList.toggle('on', c === e.currentTarget); } }, t(f))),
      h('label', { class: 'search' }, icon('search', 'ic tiny'), h('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search') }))),
    h('div', { class: 'track-grid' }, TRACKS.map(card)), bottomBar(false));
}

// ---------------------------------------------------------------- track details: length, bends, height, best values, start and free roam
let trackLine = null;   // the touge's centre line from the game's map file, drawn as a small map
function trackView() {
  const stat = (ic, label, value) => h('div', { class: 'stat' }, icon(ic, 'ic tiny'), h('small', {}, t(label)), h('b', { class: 'num' }, value));
  return h('main', { class: 'view track-detail' }, nav('strecken'),
    h('section', { class: 'card hero', 'data-img': 'img/hero-tal.jpg' },
      h('div', { class: 'mini-map', html: trackLine ?? '' }),
      h('span', { class: 'tag hot hero-tag' }, t('open'))),
    h('section', { class: 'card detail' },
      h('small', { class: 'over' }, t('regionMountain')),
      h('div', { class: 'detail-head' }, h('h1', {}, t('touge')), h('button', { class: 'round', type: 'button', 'aria-label': t('fav') }, icon('heartFull', 'ic tiny'))),
      h('p', { class: 'sub' }, t('trackSub')),
      h('p', { class: 'text' }, t('trackText')),
      h('div', { class: 'stat-grid' },
        stat('track', 'length', `${num(1.96, 2)} ${t('km')}`), stat('height', 'climb', `${num(106)} ${t('m')}`),
        stat('chevrons', 'bends', '17'), stat('back', 'hairpins', '8')),
      h('div', { class: 'diff' }, h('small', {}, t('difficulty')), h('span', { class: 'pips' }, [1, 1, 1, 0, 0].map((on) => h('i', { class: on ? 'on' : '' }))), h('b', {}, t('medium'))),
      h('dl', { class: 'bests' }, h('dt', {}, t('bestTime')), h('dd', { class: 'num' }, '2:41.380'), h('dt', {}, t('bestScore')), h('dd', { class: 'num' }, num(18420))),
      h('div', { class: 'conditions small' },
        h('span', {}, icon('sunset', 'ic tiny'), h('small', {}, t('timeOfDay')), h('b', {}, t('dusk'))),
        h('span', {}, icon('cloud', 'ic tiny'), h('small', {}, t('weather')), h('b', {}, t('clear')))),
      h('div', { class: 'detail-actions' },
        h('a', { class: 'go small', href: '#modi' }, icon('play', 'ic go-play'), h('span', {}, t('start'))),
        h('a', { class: 'chip-btn', href: '../index.html?map=touge' }, icon('world', 'ic tiny'), t('free')))),
    h('div', { class: 'bottom' }, h('div', { class: 'small-buttons' }, h('a', { class: 'chip-btn', href: '#strecken' }, icon('back', 'ic tiny'), t('back')))));
}

// ---------------------------------------------------------------- the result after a run (no navigation: the run just ended)
const BOARD = [
  { name: 'Ren', points: 21730 }, { name: 'Mika', guest: true, you: true, points: 18420 }, { name: 'Taro', points: 17110 },
  { name: 'Juno', guest: true, points: 15980 }, { name: 'Lio', guest: true, points: 12040 },
];
function resultView() {
  const who = (b) => (b.guest ? `${b.name} (${t('guest')})` : b.name);
  const fact = (label, value) => h('div', { class: 'fact' }, h('small', {}, t(label)), h('b', { class: 'num' }, value));
  return h('main', { class: 'view result' },
    h('section', { class: 'card result-card' },
      h('small', { class: 'over' }, t('resultMode')),
      h('h1', {}, t('resultTitle')),
      h('div', { class: 'result-main' },
        h('div', { class: 'place' }, h('small', {}, t('place')), h('b', { class: 'num' }, '2.'), h('span', {}, '/ 5')),
        h('div', { class: 'score' }, h('small', {}, t('points')), h('b', { class: 'num' }, num(18420)), h('span', { class: 'tag hot' }, icon('star', 'ic tiny'), t('newBest')))),
      h('div', { class: 'facts' }, fact('combo', `×${num(5, 1)}`), fact('angle', '52°'), fact('time', '2:41.380'), fact('clips', '7 / 8'))),
    h('section', { class: 'card board' },
      h('header', {}, icon('trophy'), h('b', {}, t('board'))),
      h('ol', {}, BOARD.map((b, i) => h('li', { class: b.you ? 'you' : '' }, h('span', { class: 'rank num' }, `${i + 1}`), h('span', { class: 'who' }, b.you ? `${who(b)} · ${t('you')}` : who(b)), h('b', { class: 'num' }, num(b.points)))))),
    h('div', { class: 'bottom result-actions' },
      h('a', { class: 'chip-btn big', href: '../index.html?map=touge&mode=attack' }, icon('retry', 'ic tiny'), t('retry')),
      h('a', { class: 'go small', href: '#garage' }, h('span', {}, t('next')), icon('chevrons', 'ic go-chev'))));
}

// ---------------------------------------------------------------- settings (also inside the pause): controls, graphics, sound, language
const SET = { tab: 'controls', steer: 'steerStick', sens: 60, vib: true, quality: 'qAuto', smoke: true, shadows: true, fps: false, cam: 'camChase', master: 80, engine: 70, music: 40, effects: 75 };
function settingsPanel() {
  const TABS = [['controls', 'tabControls', 'gamepad'], ['graphics', 'tabGraphics', 'monitor'], ['sound', 'tabSound', 'sound'], ['language', 'tabLanguage', 'globe']];
  const redraw = () => show();
  const seg = (key, options) => h('div', { class: 'seg' }, options.map((o) => h('button', { type: 'button', class: SET[key] === o ? 'on' : '', onclick: () => { SET[key] = o; redraw(); } }, t(o))));
  const toggle = (key) => h('button', { type: 'button', role: 'switch', 'aria-checked': String(SET[key]), class: `switch${SET[key] ? ' on' : ''}`, onclick: () => { SET[key] = !SET[key]; redraw(); } }, h('i'));
  const slider = (key) => h('span', { class: 'slider' }, h('input', { type: 'range', min: 0, max: 100, value: SET[key], 'aria-label': t(key), oninput: (e) => { SET[key] = +e.target.value; e.target.nextSibling.textContent = SET[key]; e.target.style.setProperty('--v', `${SET[key]}%`); } }), h('b', { class: 'num' }, SET[key]));
  const row = (label, control) => h('div', { class: 'set-row' }, h('span', {}, t(label)), control);
  const key = (label, ...caps) => h('div', { class: 'key-row' }, h('span', {}, t(label)), h('span', { class: 'caps' }, caps.map((c) => h('kbd', {}, c))));
  const content = {
    controls: () => [row('steering', seg('steer', ['steerStick', 'steerButtons', 'steerTilt'])), row('sensitivity', slider('sens')), row('vibration', toggle('vib')),
      h('h3', {}, t('keys')), key('keyGas', 'W', '↑'), key('keyBrake', 'S', '↓'), key('keySteer', 'A', 'D', '←', '→'), key('keyHand', t('space')), key('keyCam', 'C'), key('keyHud', 'H')],
    graphics: () => [row('quality', seg('quality', ['qAuto', 'qHigh', 'qMedium', 'qLow'])), row('camera', seg('cam', ['camChase', 'camBonnet', 'camCockpit'])), row('smoke', toggle('smoke')), row('shadows', toggle('shadows')), row('fps', toggle('fps'))],
    sound: () => ['master', 'engine', 'music', 'effects'].map((k) => row(k, slider(k))),
    language: () => [h('div', { class: 'seg big' }, [['de', 'langDe'], ['en', 'langEn']].map(([l, k]) => h('button', { type: 'button', class: lang === l ? 'on' : '', onclick: () => { setLang(l); redraw(); } }, t(k))))],
  };
  return h('section', { class: 'card settings' },
    h('nav', { class: 'set-tabs' }, TABS.map(([id, k, ic]) => h('button', { type: 'button', class: SET.tab === id ? 'on' : '', onclick: () => { SET.tab = id; redraw(); } }, icon(ic, 'ic tiny'), t(k)))),
    h('div', { class: 'set-body' }, h('h2', {}, t(TABS.find((x) => x[0] === SET.tab)[1])), content[SET.tab]()));
}
function settingsView() {
  return h('main', { class: 'view settings-view' }, nav('einstellungen'), h('header', { class: 'page-head' }, h('h1', {}, t('settings'))), settingsPanel());
}
function pauseView() {
  return h('main', { class: 'view pause' },
    h('section', { class: 'card pause-card' },
      h('div', { class: 'pause-head' }, icon('pause', 'ic big'), h('h1', {}, t('pause'))),
      h('small', { class: 'over' }, t('resultMode')),
      h('a', { class: 'go small', href: '#hud' }, icon('play', 'ic go-play'), h('span', {}, t('resume'))),
      h('a', { class: 'chip-btn big', href: '#hud' }, icon('retry', 'ic tiny'), t('restart')),
      h('a', { class: 'chip-btn big', href: '#garage' }, icon('garage', 'ic tiny'), t('toGarage'))),
    settingsPanel());
}

// ---------------------------------------------------------------- the HUD while driving: the game's own HUD (view/probehud.js) with sample values; on the phone the touch controls of the sheets
let ProbeHudClass = null, roadShape = null;
function hudView() {
  const root = h('div', { id: 'phud' });
  const view = h('main', { class: 'view hud-view' }, root,
    h('a', { class: 'hud-pause', href: '#pause', 'aria-label': t('hudPause') }, icon('pause', 'ic tiny')));
  if (phone) view.append(
    h('div', { class: 'stick', 'aria-label': t('keySteer') }, h('span', { class: 'stick-knob' })),
    h('div', { class: 'pedals' },
      h('button', { type: 'button', class: 'pedal hand' }, t('hudHand')),
      h('button', { type: 'button', class: 'pedal brake' }, t('hudBrake')),
      h('button', { type: 'button', class: 'pedal gas' }, t('hudGas'))));
  if (ProbeHudClass && roadShape) {
    const T = { lap: t('hLap'), time: t('hTime'), best: t('hBest'), score: t('hScore'), position: t('hPosition'), angle: t('hAngle'), gear: t('hGear'), gas: t('hGas'), brake: t('hBrake'), hand: t('hHand'), lost: t('hLost'), online: t('hOnline'), bestDrift: t('hBestDrift') };
    const hud = new ProbeHudClass(root, T, lang, { road: roadShape, plaza: [], closed: false });
    const i = 260, [ax, az] = roadShape[i], [bx, bz] = roadShape[i + 2];
    const car = { kmh: 118, forward: 1, slip: (42 * Math.PI) / 180, x: ax, z: az, h: Math.atan2(-(bx - ax), bz - az) };
    hud.update({ free: false, lap: 2, laps: 3, ms: 58731, best: 86980, pos: 2, of: 6, name: '' }, car, { throttle: 0.9, brake: 0, handbrake: 0.3 }, { banked: 22140, pending: 2540, mult: 3.6, chainTime: 1.1, drifting: true, grace: 0, event: null }, [], 1);
  }
  return view;
}

// ---------------------------------------------------------------- the lab's own menu: every view one tap away (for the owner on the phone)
const LAB_VIEWS = [['garage', 'viewGarage'], ['werkstatt', 'viewNav'], ['modi', 'viewModes'], ['strecken', 'viewTracks'], ['strecke', 'viewTrack'], ['ergebnis', 'viewResult'], ['pause', 'viewPause'], ['einstellungen', 'viewSettings'], ['hud', 'viewHud']];
function labMenu() {
  const list = h('div', { class: 'card lab-list', hidden: true }, LAB_VIEWS.map(([v, k], i) => h('a', { href: `#${v}`, class: current === v ? 'on' : '' }, h('span', { class: 'num' }, `${i + 1}`), t(k))));
  return h('div', { class: 'lab-menu' }, h('button', { class: 'lang', type: 'button', 'aria-label': t('screens'), onclick: () => { list.hidden = !list.hidden; } }, icon('menu', 'ic tiny')), list);
}

function laterView(view) {
  return h('main', { class: 'view later' }, nav(view), h('section', { class: 'card later-card' }, icon('workshop', 'ic big'), h('p', {}, t('later')), h('a', { class: 'chip-btn', href: '#garage' }, icon('back', 'ic tiny'), t('navGarage'))));
}

// ---------------------------------------------------------------- views and the 3D garage behind them
const BACKGROUND = { strecken: 'img/hero-kehre.jpg', strecke: 'img/hero-tal.jpg', ergebnis: 'img/hero-kehre.jpg', pause: 'img/hero-tal.jpg', hud: 'img/hero-tal.jpg' };
const VIEWS = { garage: garageView, modi: modesView, strecken: tracksView, strecke: trackView, ergebnis: resultView, pause: pauseView, einstellungen: settingsView, hud: hudView };
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
  for (const m of root.querySelectorAll('[data-img]')) m.style.backgroundImage = `url("${m.dataset.img}")`;
  for (const m of root.querySelectorAll('[data-hue]')) m.style.setProperty('--hue', m.dataset.hue);
  const side = root.querySelector('.nav-side'), menu = labMenu();
  if (side) side.prepend(menu); else root.append(Object.assign(menu, { className: 'lab-menu alone' }));
  // the 3D garage is behind the garage and (dimmed) behind the views of the menu; the track and result views have a picture of the game
  const bg = BACKGROUND[view];
  document.getElementById('bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  if (garage) { garage.spin = view === 'garage'; garage.paused = !!bg; }
  canvas.classList.toggle('dim', view !== 'garage');
  canvas.hidden = !!bg;
}
addEventListener('hashchange', show);

const q = new URLSearchParams(location.search);
const phone = matchMedia('(max-height: 520px), (max-width: 700px)').matches || q.get('tier') === 'low';
document.body.classList.toggle('phone', phone);
document.body.classList.toggle('touch', phone);   // the game HUD's phone sizes (probe.css)
setLang(lang);
const cars = await fetch('../data/cars.json').then((r) => r.json()).catch(() => ({ cars: [] }));
const spec = cars.cars.find((c) => c.model === 'ae86');
carName = spec?.name ?? carName;
// the touge's centre line (the game's own map file) as a small map: every 6th point, fitted into a 200 x 120 box
const map = await fetch('../data/maps/06-touge.json').then((r) => r.json()).catch(() => null);
if (map?.centre) {
  const pts = map.centre.filter((_, i) => i % 6 === 0), xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), z0 = Math.min(...zs), w = Math.max(...xs) - x0 || 1, hgt = Math.max(...zs) - z0 || 1, k = Math.min(180 / w, 100 / hgt);
  const ox = (200 - w * k) / 2, oy = (120 + hgt * k) / 2;   // centred in the box
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(ox + (p[0] - x0) * k).toFixed(1)} ${(oy - (p[1] - z0) * k).toFixed(1)}`).join(' ');
  trackLine = `<svg viewBox="0 0 200 120" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="rgba(255,255,255,0.35)" stroke-width="7"/><path d="${d}" stroke="currentColor" stroke-width="3"/></svg>`;
}
// the game's own HUD for the HUD view, and the road in its drawing axes (x mirrored) for its minimap
ProbeHudClass = (await import('../view/probehud.js').catch(() => null))?.ProbeHud ?? null;
roadShape = map?.centre ? map.centre.map(([x, z]) => [-x, z]) : null;
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
