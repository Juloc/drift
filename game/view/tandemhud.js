// A small chip for the tandem bonus: "Tandem x1.4 - Lead", and "+N" for two seconds when a chain is banked. Text only; the new HUD of the look session replaces the look,
// the messages and the numbers stay. The element is made here, so every page of the game has it.
export class TandemHud {
  constructor(T) {
    this.T = T;
    this.el = Object.assign(document.createElement('div'), { id: 'tandem', hidden: true });
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'off');
    (document.getElementById('hud') ?? document.body).append(this.el);
    this.shown = ''; this.bankUntil = 0; this.bankText = '';
  }
  /** { on, mult, role } as the server sends it (or the practice judgement makes it). */
  set(s, now = performance.now()) {
    const text = s?.on ? `${this.T.tandem} x${Number(s.mult).toFixed(1)} · ${this.T[s.role] ?? ''}` : '';
    this.on = !!s?.on;
    this.text = text;
    this.render(now);
  }
  bank(points, now = performance.now()) { this.bankText = `${this.T.tandemBank} +${points}`; this.bankUntil = now + 2500; this.render(now); setTimeout(() => this.render(performance.now()), 2600); }
  render(now) {
    const text = (this.bankUntil > now ? this.bankText + (this.text ? ' – ' : '') : '') + (this.text ?? '');
    if (text !== this.shown) { this.shown = text; this.el.textContent = text; this.el.hidden = text === ''; }
    this.el.classList.toggle('on', !!this.on);
  }
}
