// The choice of the game mode: a window with one card per mode (picture, icon, what it is, the best value on this device, Start), opened from the button beside the menu
// (key N) wherever the page can start a mode (the lobby on the touge). Free driving is the default: the window only offers the others. Texts come from the page
// (T), the icons are the game's own (view/icons.js, in the style of the base's set). Nothing here talks to the server: Start calls `onStart(kind)`.
import { icon } from './icons.js';

/** The modes in the order of the cards. `img` are the lab's pictures (game/lab/img), `who` the tag under the title. */
export const MODES = [
  { kind: 'free', icon: 'pin', img: 'lab/img/mode-free.jpg', who: 'modeOnline' },
  { kind: 'drift', icon: 'trophy', img: 'lab/img/mode-attack.jpg', who: 'modeSolo' },
  { kind: 'time', icon: 'timer', img: 'lab/img/mode-time.jpg', who: 'modeSolo' },
  { kind: 'tandem', icon: 'tandem', img: 'lab/img/mode-tandem.jpg', who: 'modeTwo' },
  { kind: 'training', icon: 'ghost', img: 'lab/img/mode-training.jpg', who: 'modeSolo' },
];
const TITLE = { free: 'modeFree', drift: 'modeDrift', time: 'modeTime', tandem: 'modeTandem', training: 'modeTraining' };
const TEXT = { free: 'modeFreeText', drift: 'modeDriftText', time: 'modeTimeText', tandem: 'modeTandemText', training: 'modeTrainingText' };

export class ModePicker {
  /** @param {{ T: object, bestOf: (kind: string) => string|null, onStart: (kind: string) => void, kinds?: string[] }} o */
  constructor({ T, bestOf, onStart, kinds = MODES.map((m) => m.kind) }) {
    Object.assign(this, { T, bestOf, onStart, kinds });
    this.el = Object.assign(document.createElement('div'), { id: 'modes', hidden: true });
    this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', T.modesTitle);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.el.hidden) { e.stopPropagation(); this.close(); } }, true);
    document.body.append(this.el);
  }
  get isOpen() { return !this.el.hidden; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  close() { this.el.hidden = true; }
  open() {
    const T = this.T, box = document.createElement('div'), row = document.createElement('div'), head = document.createElement('header');
    box.className = 'modes-box'; row.className = 'modes-row';
    const close = Object.assign(document.createElement('button'), { type: 'button', className: 'modes-close', title: T.modeClose, ariaLabel: T.modeClose });
    close.append(icon('x', 1.2)); close.addEventListener('click', () => this.close());
    head.append(Object.assign(document.createElement('h2'), { textContent: T.modesTitle }), Object.assign(document.createElement('p'), { textContent: T.modesSub }), close);
    for (const m of MODES.filter((x) => this.kinds.includes(x.kind))) {
      const card = document.createElement('article'), pic = Object.assign(document.createElement('div'), { className: 'modes-pic' });
      card.className = `modes-card${m.kind === 'free' ? ' main' : ''}`; card.dataset.mode = m.kind;
      pic.style.backgroundImage = `url(${m.img})`; pic.append(icon(m.icon, 1.6));
      const best = this.bestOf(m.kind);
      const go = Object.assign(document.createElement('button'), { type: 'button', className: 'modes-go', textContent: m.kind === 'free' ? T.modeClose : T.modeStart });
      go.addEventListener('click', () => { this.close(); if (m.kind !== 'free') this.onStart(m.kind); });
      const meta = Object.assign(document.createElement('p'), { className: 'modes-meta' });
      meta.append(Object.assign(document.createElement('span'), { textContent: T[m.who] }));
      if (m.kind !== 'free' && m.kind !== 'training') meta.append(Object.assign(document.createElement('b'), { textContent: `${T.modeBest}: ${best ?? T.modeNone}` }));
      if (m.kind === 'training') meta.append(Object.assign(document.createElement('b'), { textContent: `${T.modeBest}: ${best ?? T.modeNone}` }));
      card.append(pic, Object.assign(document.createElement('h3'), { textContent: T[TITLE[m.kind]] }), Object.assign(document.createElement('p'), { className: 'modes-text', textContent: T[TEXT[m.kind]] }), meta, go);
      row.append(card);
    }
    box.append(head, row);
    this.el.replaceChildren(box); this.el.hidden = false;
    this.el.querySelector('.modes-go')?.focus();
  }
}
