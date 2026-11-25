/* =====================================================================
 * The one icon file of the family (docs/RULES.md, KIT-01): simple stroke icons on a 24 px grid, drawn with currentColor.
 * Most come from JulOS (own drawings; the older everyday ones follow the style of the Feather set, MIT, see THIRD-PARTY.md),
 * the rest were drawn for the base in the same style. No brand logos.
 * Shapes with an area carry class="f" (the style "duo" tints them), filled dots class="d".
 * Use them through icon('name') of base.js, or <span data-icon="name"></span> in markup; never paste SVG into a page.
 * The catalogue (/base/catalog.html) shows them all.
 * ===================================================================== */
const F = ' class="f"';
const D = ' class="d"';

export const GLYPHS = {
  // navigation and actions
  home: `<path${F} d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>`,
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: `<circle${D} cx="12" cy="5" r="1.4"/><circle${D} cx="12" cy="12" r="1.4"/><circle${D} cx="12" cy="19" r="1.4"/>`,
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  copy: `<rect${F} x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`,
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  filter: `<path${F} d="M3 5h18l-7 8.5V20l-4-2v-4.5z"/>`,
  sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9"/>',
  power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  // things
  list: `<path d="M9 6h11M9 12h11M9 18h11"/><circle${D} cx="4.5" cy="6" r="1.3"/><circle${D} cx="4.5" cy="12" r="1.3"/><circle${D} cx="4.5" cy="18" r="1.3"/>`,
  grid: `<path${F} d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>`,
  file: `<path${F} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>`,
  folder: `<path${F} d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>`,
  bookmark: `<path${F} d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/>`,
  inbox: `<path${F} d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>`,
  star: `<path${F} d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>`,
  bell: `<path${F} d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>`,
  mail: `<rect${F} x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>`,
  clock: `<circle${F} cx="12" cy="12" r="10"/><path d="M12 6.5V12l3.5 2"/>`,
  globe: `<circle${F} cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
  cloud: `<path${F} d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/>`,
  database: `<ellipse${F} cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>`,
  bolt: `<path${F} d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>`,
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  spark: `<path${F} d="M12 3l1.9 5.6L20 10l-6.1 1.4L12 17l-1.9-5.6L4 10l6.1-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>`,
  // people, devices, safety
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  monitor: `<rect${F} x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/>`,
  laptop: `<rect${F} x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>`,
  phone: `<rect${F} x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>`,
  lock: `<rect${F} x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`,
  key: `<circle${F} cx="8" cy="15" r="4"/><path d="m10.8 12.2 8-8M16 7l3 3"/>`,
  shield: `<path${F} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  eye: `<path${F} d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  'eye-off': '<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.5 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  // states
  info: `<circle${F} cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>`,
  help: `<circle${F} cx="12" cy="12" r="10"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01"/>`,
  alert: `<path${F} d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>`,
  'check-circle': `<circle${F} cx="12" cy="12" r="10"/><path d="m8 12.5 3 3 5-6"/>`,
  'x-circle': `<circle${F} cx="12" cy="12" r="10"/><path d="m9 9 6 6M15 9l-6 6"/>`,
  circle: '<circle cx="12" cy="12" r="9"/>',
  // appearance
  sun: `<circle${F} cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`,
  moon: `<path${F} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`,
};

/** The SVG markup of an icon (empty drawing when there is no such icon). cls: extra classes, for example "l" or "duo". */
export const glyph = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLYPHS[name] || ''}</svg>`;
