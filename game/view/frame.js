// The frame of the HUD: one grid over the whole screen with nine named places, the safe area of the screen (notch, rounded corners) counted in.
// Every part of the HUD stands in exactly one place, so nothing can lie on top of something else and nothing can leave the screen; the messages
// (toasts, damage, hints, the race bar) have a place of their own in the middle, between the score and the angle. The parts are made elsewhere
// (view/probehud.js, main.js, the app's page): this module only moves them into their place, also the ones made later (it watches for them).
//
//   tl  | top | tr        top left: lap card (and on a phone the minimap)   top: drift score        top right: position, speed on a phone
//   ml  | msg | mr        middle left: the menu button and its switches      middle: the messages    middle right: reset
//   bl  | bot | br        bottom left: minimap / steering pad                bottom: drift angle     bottom right: speed card / pedals
//
// The sizes are in game/frame.css (grid, gaps with clamp(), touch sizes). Modal windows (result, summary, the name box, the turn hint) stay
// outside: they are meant to cover the game while they are open.

/** Where each part goes: [CSS selector, place on a PC, place on a touch screen]. The first match of a selector is placed; order inside a place follows this list. */
export const PLACES = [
  ['.c-lap', 'tl', 'tl'],
  ['.c-map', 'bl', 'tl'],
  ['.c-score', 'top', 'top'],
  ['.c-pos', 'tr', 'tr'],
  ['.c-speed', 'br', 'tr'],
  ['#back', 'ml', 'ml'],
  ['#chips-toggle', 'ml', 'ml'],
  ['#fs', 'ml', 'ml'],
  ['#modes-open', 'ml', 'ml'],
  ['#chips', 'ml', 'msg'],
  ['#emotes', 'ml', 'msg'],
  ['#reset', 'tr', 'mr'],
  ['#hud', 'msg', 'msg'],
  ['.p-toast', 'msg', 'msg'],
  ['#damage', 'msg', 'msg'],
  ['#note', 'msg', 'msg'],
  ['#tip', 'msg', 'msg'],
  ['#hint', 'msg', 'msg'],
  ['.c-angle', 'bot', 'bot'],
  ['#touch .pad.left', null, 'bl'],
  ['#touch .pad.right', null, 'br'],
  ['#credits-link', 'br', 'mr'],
];
const NAMES = ['tl', 'top', 'tr', 'ml', 'msg', 'mr', 'bl', 'bot', 'br'];

/** Builds the frame inside `root` (the HUD's layer, #phud) and keeps every known part in its place. Returns the frame. */
export function mountFrame(root) {
  if (root.querySelector(':scope > .frame')) return root.querySelector(':scope > .frame');
  const frame = Object.assign(document.createElement('div'), { className: 'frame' });
  // the middle row has its own small grid (narrow left, the messages, narrow right), so that a long message never widens the middle column of the cards
  const mid = Object.assign(document.createElement('div'), { className: 'mid' });
  const slots = Object.fromEntries(NAMES.map((n) => { const s = Object.assign(document.createElement('div'), { className: `slot slot-${n}` }); s.dataset.slot = n; (['ml', 'msg', 'mr'].includes(n) ? mid : frame).append(s); return [n, s]; }));
  frame.insertBefore(mid, slots.bl);
  root.prepend(frame);
  const touch = () => document.body.classList.contains('touch');
  const placed = new Set();
  const place = () => {
    const t = touch();
    for (const [sel, pc, tc] of PLACES) {
      const el = document.querySelector(sel), slot = slots[t ? tc : pc];
      if (!el || !slot) continue;
      // keep the order of the list inside a place: put it after the last placed part of an earlier line in the same place
      if (el.parentElement !== slot || !placed.has(el)) {
        const before = [...slot.children].find((c) => PLACES.findIndex(([s]) => c.matches(s)) > PLACES.findIndex(([s]) => s === sel));
        slot.insertBefore(el, before ?? null);
        placed.add(el);
      }
    }
  };
  place();
  // parts made later (the menu, the damage note, the race bar, a toast) and a switch between PC and touch controls
  let queued = false;
  const later = () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; place(); }); } };
  new MutationObserver(later).observe(document.body, { childList: true });
  new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(later).observe(root, { childList: true });
  // the steering pads leave #touch: they show and hide with it (a class on the body, the pads' rule is in frame.css)
  const nav = document.getElementById('touch');
  if (nav) { const sync = () => document.body.classList.toggle('touch-on', !nav.hidden); new MutationObserver(sync).observe(nav, { attributes: true, attributeFilter: ['hidden'] }); sync(); }
  return frame;
}

/**
 * The scale of the cards: they are drawn for 1600 x 900 (a PC) or 844 x 390 (a phone held sideways) and grow and shrink with the window,
 * by the smaller of width and height so that a wide but low window (an ultrawide screen, a phone) keeps its rows apart.
 */
export function hudScale(w, h, touch) {
  return touch ? Math.max(0.8, Math.min(1.5, w / 844, h / 390)) : Math.max(0.6, Math.min(1.35, w / 1600, h / 900));
}
