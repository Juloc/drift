// The controller (Gamepad API), as pure functions so that they can be tested in Node: a pad object in, the car's four numbers out.
// The standard layout is assumed (browsers give it for the common pads): left stick = steer, right trigger = gas, left trigger = brake, A = handbrake.
// docs/CONTROLS.md has the whole mapping.

export const PAD = {
  deadzone: 0.12,     // of the stick, rescaled so that the edge of the dead zone is 0
  curve: 1.5,         // response: a small deflection steers little, the end gives the full lock (1 = linear)
  triggerDead: 0.06,  // a trigger that rests a little pressed is not a pedal
};

// the buttons of the standard layout
export const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
/** What the buttons do once when pressed (the page puts a function behind each name; the d-pad's four buttons are emotes 0 to 3). */
export const ACTIONS = { x: 'reset', y: 'camera', rb: 'camera', lb: 'feel', start: 'pause', back: 'bot', up: 'emote0', right: 'emote1', down: 'emote2', left: 'emote3' };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const value = (b) => (b ? (typeof b === 'number' ? b : b.value ?? (b.pressed ? 1 : 0)) : 0);

/** The stick's x axis as a steering value -1..1 (dead zone, then a curve). */
export function steerOf(x, { deadzone = PAD.deadzone, curve = PAD.curve } = {}) {
  const a = Math.abs(x ?? 0);
  if (a <= deadzone) return 0;
  return Math.sign(x) * Math.pow(clamp((a - deadzone) / (1 - deadzone), 0, 1), curve);
}

const pedal = (v) => (v <= PAD.triggerDead ? 0 : clamp((v - PAD.triggerDead) / (1 - PAD.triggerDead), 0, 1));

/** @param {{axes: readonly number[], buttons: readonly ({value?: number, pressed?: boolean}|number)[]}|null} pad @returns the controls and whether the pad is being used */
export function padControls(pad) {
  if (!pad) return { steer: 0, throttle: 0, brake: 0, handbrake: 0, active: false };
  const steer = steerOf(pad.axes?.[0]);
  const throttle = pedal(value(pad.buttons?.[BTN.rt]));
  const brake = pedal(value(pad.buttons?.[BTN.lt]));
  const handbrake = value(pad.buttons?.[BTN.a]) > 0.5 || value(pad.buttons?.[BTN.b]) > 0.5 ? 1 : 0;
  return { steer, throttle, brake, handbrake, active: steer !== 0 || throttle > 0 || brake > 0 || handbrake > 0 };
}

/** Which buttons went down since the last call (the edges): names from ACTIONS, once per press. */
export class PadEdges {
  constructor() { this.down = new Set(); }
  update(pad) {
    const fired = [];
    if (!pad) { this.down.clear(); return fired; }
    for (const [name, index] of Object.entries(BTN)) {
      const pressed = value(pad.buttons?.[index]) > 0.5;
      if (pressed && !this.down.has(name) && ACTIONS[name]) fired.push(ACTIONS[name]);
      if (pressed) this.down.add(name); else this.down.delete(name);
    }
    return fired;
  }
}
