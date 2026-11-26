// The game's own icons (no emojis anywhere: the owner's rule D6). The same style as the base's icon set (base/ui/icons.js, KIT-01): simple strokes on a 24 px grid, drawn with currentColor.
// The page is static files with no build step, so the few shapes the game needs are drawn here, in the same hand; the catalogue of the base shows its own.
// Use `icon('camera')` for an SVG element (no innerHTML: the page's policy allows no inline script or style).
const D = ' class="d"';
export const GLYPHS = {
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  wrench: '<path d="M14.7 6.3a4.5 4.5 0 0 0 5.4 5.4L21 12.6a1 1 0 0 1 0 1.4l-7 7a2.1 2.1 0 0 1-3-3l7-7-1.4-1.4A4.5 4.5 0 0 0 11.7 3.3L13.5 5z"/>',
  bot: '<path d="M12 3v3M7 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 11v1.5M15 11v1.5M9 20h6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  speakerOff: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  reset: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  follow: '<circle cx="12" cy="12" r="4"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  view: '<path d="M2 12s3.6-7 10 -7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M3 12h6.5M14.5 12H21M12 14.5V21"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  paint: '<path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z"/>',
  // the game modes (the same drawings as the lab's, game/lab/icons.js)
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M12 13v4M8 21h8"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M9 2h6"/>',
  ghost: '<path d="M5 20V11a7 7 0 0 1 14 0v9l-2.5-2-2.5 2-2-2-2 2-2.5-2z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
  tandem: '<path d="M3 15l2-4h6l2 4"/><path d="M11 11l2-3h6l2 4v3"/><path d="M3 15h18"/>',
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  // the ten emotes
  thumb: '<path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6a2 2 0 0 1-2 1.7H7"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0"/><circle' + D + ' cx="9" cy="9.5" r="1"/><circle' + D + ' cx="15" cy="9.5" r="1"/>',
  surprise: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="16" r="2"/><circle' + D + ' cx="9" cy="9.5" r="1"/><circle' + D + ' cx="15" cy="9.5" r="1"/>',
  flame: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  wave: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7c-3 0-4.5-1.5-6-4l-1-2a1.5 1.5 0 0 1 2.5-1.5L8 15"/>',
  glasses: '<circle cx="12" cy="12" r="9"/><path d="M5.5 10h5v2.5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM13.5 10h5v2.5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM10.5 10.5h3"/>',
  heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7a2.5 2.5 0 1 1-2.5 2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
export const EMOTE_ICONS = ['thumb', 'smile', 'surprise', 'flame', 'flag', 'wave', 'glasses', 'heart', 'wind', 'clock'];

/** An SVG element for an icon; `size` in em. */
export function icon(name, size = 1.25) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', `${size}em`); svg.setAttribute('height', `${size}em`);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  // the glyphs are our own constant strings (never from a player): parsed as SVG, not as page markup
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${GLYPHS[name] ?? GLYPHS.view}</svg>`, 'image/svg+xml');
  for (const n of [...doc.documentElement.childNodes]) svg.append(document.importNode(n, true));
  for (const d of svg.querySelectorAll('.d')) d.setAttribute('fill', 'currentColor');
  return svg;
}
/** Puts an icon into a button (replacing what it showed). */
export function setIcon(el, name, size) { el.replaceChildren(icon(name, size)); el.dataset.icon = name; }
