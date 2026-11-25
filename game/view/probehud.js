// The HUD of the look probe, as in the owner's mockup: dark smoked-glass cards with white text. Top left lap, time and best lap;
// top centre the drift score with the multiplier as a pink pill and a bar; top right the position; bottom left a minimap that
// turns with the car (heading up); bottom centre the drift angle on a wide open arc; bottom right speed, a gear (made up from the
// speed: the physics has none) and bars for throttle, brake and handbrake. Two levels as in the game (H): plain hides the arc and the bars. Text goes in as text; the DOM is touched only
// when a value changes.
const NS = 'http://www.w3.org/2000/svg';
const LEVELS = ['plain', 'driver'];

/** A gear to show, from the speed: R backwards, N standing, else 1 to 6. */
export function gearOf(kmh, forward = 1) {
  if (forward < -0.5 && kmh > 1) return 'R';
  if (kmh < 1) return 'N';
  const up = [28, 52, 80, 112, 150];
  let g = 1;
  while (g <= up.length && kmh >= up[g - 1]) g++;
  return String(g);
}
/** mm:ss.mmm */
export function fmtTime(ms) {
  const t = Math.max(0, Math.round(ms));
  return `${String(Math.floor(t / 60000)).padStart(2, '0')}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${String(t % 1000).padStart(3, '0')}`;
}
/** Whole numbers with the language's thousands separator (18.460 in German, 18,460 in English). */
export function fmtNum(n, lang) { return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 }).format(Math.floor(n)); }
/** The chain multiplier with one decimal in the language's style: ×4,2 in German, ×4.2 in English. */
export function fmtMult(m, lang) { return '\u00d7' + new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m); }

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export class ProbeHud {
  /** T: the texts; lang 'de' | 'en'; mapShapes: { road: [[x, z]...], plaza: [[x, z]...] } in drawing axes (x right, z down = north up). */
  constructor(root, T, lang, mapShapes) {
    this.T = T; this.lang = lang; this.last = {}; this.toastTimer = 0; this.smooth = { gas: 0, brake: 0, hand: 0 };
    const wanted = new URLSearchParams(location.search).get('hud');
    let kept = null;
    try { kept = localStorage.getItem('drift.hud'); } catch { /* no storage */ }
    // ?hud=off hides it (for pictures of the scene alone)
    this.level = wanted === 'off' || LEVELS.includes(wanted) ? wanted : LEVELS.includes(kept) ? kept : 'driver';
    this.root = root;
    // on a big screen the cards are drawn at the mockup's size (made for 1600 px wide) and scaled with the window
    const fit = () => root.style.setProperty('--hud-scale', Math.max(0.5, Math.min(1.25, innerWidth / 1600)).toFixed(3));
    addEventListener('resize', fit); fit();
    this.build(mapShapes);
  }

  build(shapes) {
    const T = this.T, card = (cls) => el('div', 'card ' + cls);
    // top left: lap, time, best
    const lap = card('c-lap');
    this.lapV = el('b'); const lt = el('div', 'lap-title'); lt.append(el('span', '', T.lap + ' '), this.lapV);
    const row = (k, cls) => { const r = el('div', 'row ' + (cls ?? '')), v = el('b'); r.append(k, v); lap.append(r); return v; };
    lap.append(lt);
    this.timeV = row(el('span', 'k', T.time));
    const star = el('span', 'k'); star.append(el('span', 'star', '\u2605'), ' ' + T.best);
    this.bestV = row(star, 'best');
    // top centre: the drift score
    const sc = card('c-score');
    this.scoreV = el('b', 'score'); this.pill = el('span', 'pill');
    const left = el('div', 'sc-left'); left.append(el('span', 'k', T.score), this.scoreV);
    const line = el('div', 'line'); line.append(left, this.pill);
    this.prog = el('i'); const bar = el('span', 'prog'); bar.append(this.prog);
    sc.append(line, bar);
    this.scoreCard = sc;
    // top right: position
    const pos = card('c-pos'); this.posV = el('b', 'pos');
    pos.append(el('span', 'k', T.position), this.posV);
    // bottom left: a minimap that turns with the car (heading up), about 150 m across
    const mp = card('c-map');
    const m = svg('svg', { viewBox: '-60 -82 120 120', class: 'minimap', 'aria-hidden': 'true' });
    const d = (pts, close) => 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + (close ? ' Z' : '');
    this.world = svg('g', {});
    this.world.append(svg('path', { d: d(shapes.plaza, true), class: 'mm-plaza' }), svg('path', { d: d(shapes.road), class: 'mm-road' }));
    this.dots = svg('g', {});
    this.world.append(this.dots);
    m.append(this.world, svg('path', { d: 'M0 -9 L7 7 L0 3.5 L-7 7 Z', class: 'mm-me' }));
    mp.append(m);
    // bottom centre: the drift angle on a wide open arc (no card), ticks every 15 degrees from -90 to +90
    const an = el('div', 'c-angle');
    // a shallow part (+-62 degrees) of a big circle; +-90 degrees of drift angle fill it end to end
    const R = 230, CX = 240, CY = 250, SPAN = 62, pt = (deg, r = R) => { const q = (deg * Math.PI) / 180; return [CX + Math.sin(q) * r, CY - Math.cos(q) * r]; };
    this.arcAt = (driftDeg, r = R) => pt((driftDeg / 90) * SPAN, r);
    const a = svg('svg', { viewBox: '0 0 480 150', class: 'arc', 'aria-hidden': 'true' });
    const [lx, ly] = pt(-SPAN), [rx, ry] = pt(SPAN);
    a.append(svg('path', { d: `M${lx.toFixed(1)} ${ly.toFixed(1)} A${R} ${R} 0 0 1 ${rx.toFixed(1)} ${ry.toFixed(1)}`, class: 'arc-track' }));
    for (let k = -90; k <= 90; k += 15) { const [x1, y1] = this.arcAt(k), [x2, y2] = this.arcAt(k, R - (k % 45 === 0 ? 14 : 9)); a.append(svg('line', { x1, y1, x2, y2, class: 'arc-tick' })); }
    a.append(svg('path', { d: `M${(lx - 6).toFixed(1)} ${(ly - 14).toFixed(1)} L${(lx - 6).toFixed(1)} ${(ly + 6).toFixed(1)} L${(lx + 2).toFixed(1)} ${(ly + 6).toFixed(1)}`, class: 'arc-end' }),
      svg('path', { d: `M${(rx + 6).toFixed(1)} ${(ry - 14).toFixed(1)} L${(rx + 6).toFixed(1)} ${(ry + 6).toFixed(1)} L${(rx - 2).toFixed(1)} ${(ry + 6).toFixed(1)}`, class: 'arc-end' }));
    this.arcFill = svg('path', { d: '', class: 'arc-fill' });
    this.needle = svg('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'arc-needle' });
    a.append(this.arcFill, this.needle);
    this.angleV = el('b');
    const al = el('div', 'angle'); al.append(this.angleV, el('span', 'k', T.angle));
    an.append(a, al);
    this.angleCard = an;
    // bottom right: speed, gear, the pedals
    const sp = card('c-speed');
    this.speedV = el('b'); const sv = el('div', 'speed'); sv.append(this.speedV, el('span', 'unit', 'km/h'));
    this.gearV = el('b'); const gv = el('div', 'gear'); gv.append(this.gearV); gv.setAttribute('aria-label', T.gear);
    const top = el('div', 'sp-top'); top.append(sv, el('span', 'sep'), gv);
    this.bars = {}; const bars = el('div', 'bars');
    for (const [key, label] of [['gas', T.gas], ['brake', T.brake], ['hand', T.hand]]) {
      const i = el('i'), r = el('div', 'bar-row'), track = el('span', 'track');
      track.append(i); r.append(el('span', 'k', label), track); bars.append(r); this.bars[key] = i;
    }
    this.barsBox = bars;
    sp.append(top, bars);
    this.toastEl = el('div', 'p-toast'); this.toastEl.setAttribute('role', 'status');
    this.root.append(lap, sc, pos, mp, an, sp, this.toastEl);
    this.apply();
  }

  apply() { this.root.dataset.level = this.level; }
  cycle() { this.level = this.level === 'driver' ? 'plain' : 'driver'; try { localStorage.setItem('drift.hud', this.level); } catch { /* not kept */ } this.apply(); }
  set(key, value, fn) { if (this.last[key] !== value) { this.last[key] = value; fn(value); } }

  /**
   * race: { lap, laps, ms, best, pos, of }; car: { kmh, forward (+1/-1), slip (rad, signed), x, z (drawing axes), h (the simulation's heading) };
   * ctl: { throttle, brake, handbrake }; sc: the score state (sim/score.js); others: [[x, z, h]...] drawing axes; dt seconds.
   */
  update(race, car, ctl, sc, others, dt) {
    const T = this.T;
    this.set('lap', `${race.lap} / ${race.laps}`, (v) => (this.lapV.textContent = v));
    this.set('time', fmtTime(race.ms), (v) => (this.timeV.textContent = v));
    this.set('best', race.best ? fmtTime(race.best) : '–', (v) => (this.bestV.textContent = v));
    this.set('pos', `${race.pos} / ${race.of}`, (v) => (this.posV.textContent = v));
    this.set('score', fmtNum(sc.banked + sc.pending, this.lang), (v) => (this.scoreV.textContent = v));
    this.set('mult', sc.mult, (v) => (this.pill.textContent = fmtMult(v, this.lang)));
    const live = sc.pending > 0 || sc.chainTime > 0;
    this.set('live', live, (v) => this.scoreCard.classList.toggle('live', v));
    const prog = sc.drifting ? (sc.mult >= 5 ? 1 : (sc.chainTime % 2) / 2) : Math.max(0, sc.grace) / 1.5;
    this.set('prog', Math.round(prog * 40) / 40, (v) => this.prog.style.setProperty('--v', v));
    this.set('speed', Math.round(car.kmh), (v) => (this.speedV.textContent = v));
    this.set('gear', gearOf(car.kmh, car.forward), (v) => (this.gearV.textContent = v));
    const deg = Math.round((car.slip * 180) / Math.PI), shown = Math.max(-90, Math.min(90, deg));
    this.set('angle', deg, () => {
      this.angleV.textContent = `${Math.abs(deg)}°`;
      // the arc is filled from the top to the angle, to the side the tail is out; a white mark at the angle
      const [ex, ey] = this.arcAt(shown), [tx, ty] = this.arcAt(0), [n1x, n1y] = this.arcAt(shown, 244), [n2x, n2y] = this.arcAt(shown, 214);
      this.arcFill.setAttribute('d', Math.abs(shown) < 1 ? '' : `M${tx.toFixed(1)} ${(ty + 5).toFixed(1)} A225 225 0 0 ${shown > 0 ? 1 : 0} ${(240 + (ex - 240) * 225 / 230).toFixed(1)} ${(250 - (250 - ey) * 225 / 230).toFixed(1)}`);
      for (const [k, v] of Object.entries({ x1: n1x, y1: n1y, x2: n2x, y2: n2y })) this.needle.setAttribute(k, v.toFixed(1));
    });
    const k = 1 - Math.exp(-18 * dt), sm = this.smooth;
    sm.gas += (ctl.throttle - sm.gas) * k; sm.brake += (ctl.brake - sm.brake) * k; sm.hand += (ctl.handbrake - sm.hand) * k;
    for (const key of ['gas', 'brake', 'hand']) this.set('bar' + key, Math.round(sm[key] * 20) / 20, (v) => this.bars[key].style.setProperty('--v', v));
    // the minimap turns the world so that the car looks up; the arrow stays in the middle
    this.world.setAttribute('transform', `rotate(${(180 - (car.h * 180) / Math.PI).toFixed(2)}) translate(${(-car.x).toFixed(2)} ${(-car.z).toFixed(2)})`);
    this.set('dots', others.length, () => { this.dots.replaceChildren(...others.map(() => svg('circle', { r: 3.2, class: 'mm-other' }))); });
    others.forEach((o, i) => this.dots.children[i].setAttribute('transform', `translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})`));
    if (sc.event) this.toast(sc.event.type === 'bank' ? `+${fmtNum(sc.event.points, this.lang)}` : T.lost, sc.event.type);
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) { this.toastEl.textContent = ''; this.toastEl.className = 'p-toast'; }
  }
  toast(text, kind) { this.toastEl.textContent = text; this.toastEl.className = 'p-toast ' + kind; this.toastTimer = 1.6; }
}
