// The HUD: speed, the drift score with its chain, the banked total and short toasts. Text goes in as text, and
// the DOM is touched only when a value changes.
export class Hud {
  constructor(T) {
    const $ = (id) => document.getElementById(id);
    this.T = T;
    this.el = { speed: $('speed-n'), drift: $('drift'), pts: $('d-pts'), mult: $('d-mult'), bank: $('bank-n'), toast: $('toast'), label: $('d-label') };
    this.last = {};
    this.toastTimer = 0;
  }
  set(key, value, apply) { if (this.last[key] !== value) { this.last[key] = value; apply(value); } }
  update(kmh, sc, dt) {
    const e = this.el;
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
