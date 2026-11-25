// Controls: keyboard and on-screen buttons reduced to four numbers (steer, throttle, brake, handbrake).
// The model smooths them (steering wheel speed), so on/off input is all that is needed here.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ShiftLeft: 'brake', ShiftRight: 'brake', Space: 'hand',
};

export class Input {
  /** @param {HTMLElement} touchRoot element holding buttons with data-ctl = left | right | gas | brake | hand */
  constructor(touchRoot) {
    this.held = new Set();
    this.onkey = {}; // one-shot keys: reset, pause, fullscreen, quality, debug
    this.touched = false;
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = KEYS[e.code];
      if (k) { this.held.add('key:' + k); e.preventDefault(); return; }
      if (!e.repeat && this.onkey[e.code]) { this.onkey[e.code](); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) this.held.delete('key:' + k); });
    addEventListener('blur', () => this.held.clear());
    for (const b of touchRoot.querySelectorAll('[data-ctl]')) {
      const ctl = b.dataset.ctl, id = 'touch:' + ctl;
      const down = (e) => { this.touched = true; this.held.add(id); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); };
      const up = (e) => { this.held.delete(id); b.classList.remove('on'); e.preventDefault(); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
  has(ctl) { return this.held.has('key:' + ctl) || this.held.has('touch:' + ctl); }
  /**
   * Thumbs press a button, they do not turn a wheel: on touch the steering builds up over about 0.3 s, so a short tap
   * is a small correction and a long press is full lock; it comes back quickly when the finger lifts. Keys are immediate.
   */
  touchSteer(now) {
    const dt = Math.min(0.1, Math.max(0, (now - (this._t ?? now)) / 1000));
    this._t = now;
    const target = (this.held.has('touch:right') ? 1 : 0) - (this.held.has('touch:left') ? 1 : 0);
    const rate = target === 0 || Math.sign(target) !== Math.sign(this._axis ?? 0) && (this._axis ?? 0) !== 0 ? 9 : 3.4;
    this._axis = (this._axis ?? 0) + Math.max(-rate * dt, Math.min(rate * dt, target - (this._axis ?? 0)));
    return this._axis;
  }
  read() {
    const key = (this.held.has('key:right') ? 1 : 0) - (this.held.has('key:left') ? 1 : 0);
    const touch = this.touchSteer(performance.now());
    return { steer: Math.abs(key) > 0 ? key : touch, throttle: this.has('gas') ? 1 : 0, brake: this.has('brake') ? 1 : 0, handbrake: this.has('hand') ? 1 : 0 };
  }
  clear() { this.held.clear(); }
}
