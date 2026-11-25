// Controls: keyboard and on-screen buttons reduced to four numbers (steer, throttle, brake, handbrake).
// The model smooths them (steering wheel speed), so on/off input is all that is needed here.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ShiftLeft: 'brake', ShiftRight: 'brake', Space: 'hand',
};

import { padControls, PadEdges } from '../sim/gamepad.js';
import { KeyboardControls, ThrottleLever, MODES } from '../sim/keys.js';

const stored = (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not kept: the choice lasts for this page */ } };

export class Input {
  /** @param {HTMLElement} touchRoot element holding buttons with data-ctl = left | right | gas | brake | hand */
  constructor(touchRoot) {
    this.held = new Set();
    this.onkey = {}; // one-shot keys: reset, pause, fullscreen, quality, debug
    this.touched = false;
    // fine control on the PC (sim/keys.js): the keys drive ramps ("soft", the default) or switch all or nothing ("direct"); the mouse can be a throttle lever. Both are settings of the device
    // (the garage page and the keys J and L change them); ?keys=direct and ?mouse=1 are for trying.
    const q = new URLSearchParams(location.search);
    let rates = {}; try { rates = JSON.parse(stored('drift.keys.rates', '{}')) ?? {}; } catch { /* a broken setting is the default */ }
    this.kb = new KeyboardControls(MODES.includes(q.get('keys')) ? q.get('keys') : stored('drift.keys', 'soft'), rates);
    this.lever = new ThrottleLever();
    this.mouseOn = q.has('mouse') ? q.get('mouse') !== '0' : stored('drift.mouse', '0') === '1';
    this._kt = null;
    this.pad = { steer: 0, throttle: 0, brake: 0, handbrake: 0, active: false };
    this.edges = new PadEdges();
    this.padAction = {};   // name -> function: what a pad button does once (reset, camera, feel, pause, bot, emote0..3)
    this.onPad = () => {}; // (connected, name)
    addEventListener('gamepadconnected', (e) => this.onPad(true, e.gamepad.id));
    addEventListener('gamepaddisconnected', (e) => this.onPad(false, e.gamepad.id));
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = KEYS[e.code];
      if (k) { if (!this.held.has('key:' + k)) this.keyboard(performance.now()); this.held.add('key:' + k); e.preventDefault(); return; }   // the ramps are brought up to this moment first: a tap shorter than a frame still counts for what it was
      if (!e.repeat && this.onkey[e.code]) { this.onkey[e.code](); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) { this.keyboard(performance.now()); this.held.delete('key:' + k); } });
    addEventListener('blur', () => { this.held.clear(); this.kb.reset(); });
    // the mouse as a throttle lever: the wheel (a notch is a tenth) and a vertical drag on the game's canvas
    addEventListener('wheel', (e) => {
      if (!this.mouseOn || e.target.closest?.('select, button, input, #racebar, #invite, #result, #emotes')) return;
      this.lever.wheel(e.deltaY); e.preventDefault();
    }, { passive: false });
    let dragFrom = null;
    addEventListener('pointerdown', (e) => { if (this.mouseOn && e.pointerType === 'mouse' && e.button === 0 && e.target.id === 'view') { dragFrom = e.clientY; e.target.setPointerCapture?.(e.pointerId); } });
    addEventListener('pointermove', (e) => { if (dragFrom !== null) { this.lever.drag(e.clientY - dragFrom); dragFrom = e.clientY; } });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { dragFrom = null; });
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
  /** The first connected pad, or null (browsers hand out snapshots, so it is asked again every time). */
  pollPad() {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p?.connected) ?? null;
    this.pad = padControls(pad);
    for (const name of this.edges.update(pad)) this.padAction[name]?.();
    return pad;
  }
  has(ctl) {
    const pad = ctl === 'gas' ? this.pad.throttle > 0 || (this.mouseOn && this.lever.value > 0) : ctl === 'brake' ? this.pad.brake > 0 : ctl === 'hand' ? this.pad.handbrake > 0 : false;
    return pad || this.held.has('key:' + ctl) || this.held.has('touch:' + ctl);
  }
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
  /** The keyboard's ramps advance by the time since the last look (the game looks many times a frame; a look at the same moment changes nothing). */
  keyboard(now) {
    const dt = this._kt === null ? 0 : Math.min(0.1, Math.max(0, (now - this._kt) / 1000));
    this._kt = now;
    return this.kb.update({ gas: this.held.has('key:gas'), brake: this.held.has('key:brake'), left: this.held.has('key:left'), right: this.held.has('key:right') }, dt);
  }
  setKeyMode(mode) { this.kb.setMode(mode, this.kb.rates); store('drift.keys', this.kb.mode); return this.kb.mode; }
  setMouseLever(on) { this.mouseOn = !!on; store('drift.mouse', on ? '1' : '0'); if (!on) this.lever.release(); return this.mouseOn; }
  read() {
    const now = performance.now();
    const kb = this.keyboard(now);
    const touch = this.touchSteer(now);
    const p = this.pad;   // an analog stick or trigger wins over a key or a button: it has more to say
    const keySteer = kb.steer !== 0 ? kb.steer : touch;
    const touchGas = this.held.has('touch:gas') ? 1 : 0, touchBrake = this.held.has('touch:brake') ? 1 : 0, keyHand = this.held.has('key:hand') || this.held.has('touch:hand') ? 1 : 0;
    const brake = Math.max(kb.brake, touchBrake, p.brake);
    if (this.mouseOn && brake > 0.1) this.lever.release();   // the brake takes the foot off: the lever goes back to zero
    return { steer: p.steer !== 0 ? p.steer : keySteer, throttle: Math.max(kb.throttle, touchGas, p.throttle, this.mouseOn ? this.lever.value : 0), brake, handbrake: keyHand || p.handbrake ? 1 : 0 };
  }
  clear() { this.held.clear(); this.kb.reset(); }
}
