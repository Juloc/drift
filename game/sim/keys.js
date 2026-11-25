// Fine control on a keyboard (pure functions, tested in Node): keys are on or off, but a car wants a pedal and a wheel. In the "soft" mode the keys drive ramps: gas builds up
// while the key is held (0 to 100 % in about 0.6 s) and dies away when it is let go (in about 1 s), so a short tap is a little gas and tapping again and again holds a middle gas:
// at a duty of about three eighths the build-up and the decay cancel and the level stays where it is, like a lever. The brake ramps faster, and the steering builds up in about
// half a second and returns slowly, so repeated taps hold an angle. "direct" is the old behaviour (a key is all or nothing). The rates can be changed (a stored setting).
export const PRESETS = {
  soft: { gasUp: 1 / 0.6, gasDown: 1.0, brakeUp: 3.0, brakeDown: 4.0, steerUp: 2.0, steerBack: 1.5, steerOpposite: 4.0 },   // per second: how fast the value moves towards its target
  direct: null,
};
export const MODES = ['soft', 'direct'];

const toward = (v, target, rate, dt) => (target > v ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt));

export class KeyboardControls {
  /** @param {'soft'|'direct'} mode @param {object} rates overrides of the soft rates (a stored setting) */
  constructor(mode = 'soft', rates = {}) { this.setMode(mode, rates); this.throttle = 0; this.brake = 0; this.steer = 0; }
  setMode(mode, rates = {}) { this.mode = MODES.includes(mode) ? mode : 'soft'; this.rates = { ...PRESETS.soft, ...rates }; }
  /**
   * Advance by dt seconds with the keys as they are now; returns { throttle, brake, steer }.
   * @param {{gas: boolean, brake: boolean, left: boolean, right: boolean}} keys
   */
  update(keys, dt) {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (this.mode === 'direct') { this.throttle = keys.gas ? 1 : 0; this.brake = keys.brake ? 1 : 0; this.steer = dir; return this.value(); }
    const r = this.rates;
    this.throttle = toward(this.throttle, keys.gas ? 1 : 0, keys.gas ? r.gasUp : r.gasDown, dt);
    this.brake = toward(this.brake, keys.brake ? 1 : 0, keys.brake ? r.brakeUp : r.brakeDown, dt);
    // the wheel: towards the key's side at steerUp, back to the middle at steerBack, and quickly across when the other side is pressed
    const crossing = dir !== 0 && Math.sign(this.steer) === -dir && this.steer !== 0;
    this.steer = toward(this.steer, dir, dir === 0 ? r.steerBack : crossing ? r.steerOpposite : r.steerUp, dt);
    return this.value();
  }
  value() { return { throttle: this.throttle, brake: this.brake, steer: this.steer }; }
  reset() { this.throttle = 0; this.brake = 0; this.steer = 0; }
}

/**
 * The mouse as a throttle lever (a setting): the wheel moves it by a step per notch, a vertical drag moves it with the pointer, and it stays where it is put until it is changed again.
 * The brake (or `release()`) puts it back to zero, like taking the foot off.
 */
export class ThrottleLever {
  constructor({ notch = 0.1, dragPixels = 220 } = {}) { this.value = 0; this.notch = notch; this.dragPixels = dragPixels; }
  /** One notch of the wheel: deltaY > 0 (scrolled down) lowers it, < 0 raises it. */
  wheel(deltaY) { this.set(this.value - Math.sign(deltaY) * this.notch); }
  /** A drag of dy pixels on the screen (dy < 0 = upwards raises the lever): the lever moves by dy / dragPixels. */
  drag(dy) { this.set(this.value - dy / this.dragPixels); }
  set(v) { this.value = Math.max(0, Math.min(1, Math.round(v * 1000) / 1000)); }
  release() { this.value = 0; }
}
