// Every key of the game and the way to the same action by touch (the owner's rule: what a key can do, a phone can do). `touch` is the id of the button (made in main.js or in the page's HTML);
// `exempt` says why a key has no touch button. A test (touchmap.test.mjs) reads main.js and keeps this list true: a new key without an entry fails it.
export const KEYS = {
  KeyR: { touch: 'reset' },        // restart at the top
  KeyB: { touch: 'bot-chip' },     // the practice partner
  KeyC: { touch: 'cam-chip' },     // camera
  KeyV: { touch: 'dmg-chip' },     // damage on or off
  KeyK: { touch: 'creative' },     // creative mode
  KeyX: { touch: 'feel' },         // arcade or pro
  KeyM: { touch: 'sound' },        // sound
  KeyN: { touch: 'modes-open' },   // the choice of the game mode
  KeyP: { touch: 'pause-chip' },   // pause
  KeyF: { touch: 'fs' },           // full screen
  KeyH: { touch: 'hud-chip' },     // HUD level
  Escape: { touch: 'back', appOnly: true },        // back to the garage (the signed-in app's page only)
  Digit: { touch: 'emote-open', appOnly: true },   // the emotes 1 to 0 (online only)
  KeyJ: { exempt: 'the keyboard style: no keyboard on a phone' },
  KeyL: { exempt: 'the mouse throttle lever: no mouse on a phone' },
  KeyG: { exempt: 'the debug numbers (?debug=1)' },
};
