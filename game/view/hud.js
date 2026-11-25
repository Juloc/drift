// The HUD: speed, the drift score with its chain, the banked total and short toasts. Text goes in as text, and
// the DOM is touched only when a value changes.
// Two levels: plain (speed and the drift card) and driver (also what the car is told: throttle, brake and handbrake bars, the wheel angle as an arc
// with degrees, the drift angle and the best drift of the session). H or the small chip switches; the choice is kept per device.
const NS = 'http://www.w3.org/2000/svg';
const LEVELS = ['plain', 'driver'];
const LOCK = 1.05; // the wheels' limit in rad (the arc's end), as in sim/physics.js
export class Hud {
  constructor(T) {
    const $ = (id) => document.getElementById(id);
    this.T = T;
    this.el = { speed: $('speed-n'), drift: $('drift'), pts: $('d-pts'), mult: $('d-mult'), bank: $('bank-n'), toast: $('toast'), label: $('d-label') };
    this.last = {};
    this.toastTimer = 0;
    let level = 'plain';
    try { level = localStorage.getItem('drift.hud') ?? 'plain'; } catch { /* no storage: plain */ }
    const wanted = new URLSearchParams(location.search).get('hud');
    this.level = LEVELS.includes(wanted) ? wanted : LEVELS.includes(level) ? level : 'plain';
    this.smooth = { gas: 0, brake: 0, hand: 0 };
    this.build();
  }

  /** The telemetry panel and its chip are made here (so every page of the game gets them without a change). */
  build() {
    const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });
    const root = document.getElementById('hud');
    this.chip = el('button', 'hud-chip', 'HUD');
    this.chip.type = 'button';
    this.chip.setAttribute('aria-label', 'HUD');
    this.chip.addEventListener('click', () => this.cycle());
    this.panel = el('div', 'tele');
    this.bars = {};
    for (const [key, label] of [['gas', this.T.gas], ['brake', this.T.brake], ['hand', this.T.hand]]) {
      const bar = el('i'), row = el('div', 'tele-row');
      row.append(el('span', 'tele-label', label), el('span', 'tele-bar').appendChild(bar).parentNode);
      this.bars[key] = bar; this.panel.append(row);
    }
    // the wheel angle: an arc of 180 degrees with a needle, and the number
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 56'); svg.setAttribute('class', 'tele-arc'); svg.setAttribute('aria-hidden', 'true');
    const arc = document.createElementNS(NS, 'path');
    arc.setAttribute('d', 'M8 50 A42 42 0 0 1 92 50'); arc.setAttribute('class', 'arc-track');
    this.needle = document.createElementNS(NS, 'line');
    this.needle.setAttribute('x1', '50'); this.needle.setAttribute('y1', '50'); this.needle.setAttribute('x2', '50'); this.needle.setAttribute('y2', '14'); this.needle.setAttribute('class', 'arc-needle');
    svg.append(arc, this.needle);
    this.steerTxt = el('span', 'tele-steer'); this.slipTxt = el('span', 'tele-slip'); this.bestTxt = el('span', 'tele-best');
    this.panel.append(svg, this.steerTxt, this.slipTxt, this.bestTxt);
    root.append(this.chip, this.panel);
    this.apply();
  }

  apply() { this.panel.hidden = this.level !== 'driver'; this.chip.setAttribute('aria-pressed', String(this.level === 'driver')); }
  cycle() {
    this.level = this.level === 'driver' ? 'plain' : 'driver';
    try { localStorage.setItem('drift.hud', this.level); } catch { /* the choice just is not kept */ }
    this.apply();
  }
  set(key, value, apply) { if (this.last[key] !== value) { this.last[key] = value; apply(value); } }
  /**
   * @param {{throttle:number, brake:number, handbrake:number}} ctl what the car is told now
   * @param {{steer:number, slip:number}} car wheel angle (rad) and body slip (rad)
   */
  update(kmh, sc, dt, ctl, car) {
    const e = this.el;
    if (this.level === 'driver' && ctl) {
      const k = 1 - Math.exp(-18 * dt);   // the bars follow a little softly, so a tap on a button is seen
      const sm = this.smooth;
      sm.gas += (ctl.throttle - sm.gas) * k; sm.brake += (ctl.brake - sm.brake) * k; sm.hand += (ctl.handbrake - sm.hand) * k;
      for (const key of ['gas', 'brake', 'hand']) this.set('bar' + key, Math.round(sm[key] * 20) / 20, (v) => this.bars[key].style.setProperty('--v', v));
      const deg = Math.round((car.steer * 180) / Math.PI);
      this.set('needle', deg, (v) => { this.needle.setAttribute('transform', `rotate(${(Math.max(-LOCK, Math.min(LOCK, car.steer)) / LOCK) * 90} 50 50)`); this.steerTxt.textContent = `${v > 0 ? '+' : ''}${v}\u00b0`; });
      this.set('slip', Math.round(Math.abs(car.slip) * 57.3), (v) => (this.slipTxt.textContent = `${this.T.slip} ${v}\u00b0`));
      this.set('best', Math.floor(sc.best), (v) => (this.bestTxt.textContent = `${this.T.best} ${v}`));
    }
    this.set('speed', Math.round(kmh), (v) => (e.speed.textContent = v));
    const live = sc.pending > 0 || sc.chainTime > 0;
    this.set('live', live, (v) => e.drift.classList.toggle('live', v));
    this.set('drifting', sc.drifting, (v) => e.drift.classList.toggle('hot', v));
    this.set('pts', Math.floor(sc.pending), (v) => (e.pts.textContent = v));
    this.set('mult', sc.mult, (v) => (e.mult.textContent = 'x' + v));
    // how much of the grace time is left (0..1), as a CSS variable: no inline style attribute is written
    this.set('grace', sc.drifting ? 1 : Math.round((Math.max(0, sc.grace) / 1.5) * 20) / 20, (v) => e.drift.style.setProperty('--grace', v));
    this.set('bank', Math.floor(sc.banked), (v) => (e.bank.textContent = v));
    if (sc.event) this.toast(sc.event.type === 'bank' ? `+${sc.event.points}` : this.T.lost, sc.event.type);
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) { e.toast.textContent = ''; e.toast.className = ''; }
  }
  toast(text, kind) { this.el.toast.textContent = text; this.el.toast.className = kind; this.toastTimer = 1.6; }
}
