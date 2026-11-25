/* =====================================================================
 * Languages of the interface (German and English, I18N-01): one small module, no library. Taken from JulOS.
 *  - t('key', {name: value}) gives the text in the chosen language; {name} in the text is replaced.
 *  - Fallback: a key missing in the chosen language gives the German text; missing there too gives an empty text (never the raw key).
 *  - The base brings its own texts (i18n/de.js, i18n/en.js); an app adds its own with addMessages('de', {...}) before it draws anything.
 *  - The choice is "Deutsch" (de, default), "English" (en) or "System" (by navigator.language); kept locally (base.lang) and as the
 *    person's setting "lang" on the server. A change applies after the page is loaded again.
 *  - Before sign-in, ?lang=en (or de, system) in the address picks the language.
 *  - Texts in HTML carry data-i18n="key" (text) or data-i18n-title, -aria-label, -placeholder (attributes); applyDom() sets them.
 * No DOM needed (only applyDom and setDocumentLang use one), so it can be checked with node.
 * ===================================================================== */
import de from './i18n/de.js';
import en from './i18n/en.js';

export const LANGS = ['de', 'en'];
/** The choice in the settings. Names stand in their own language, so one always finds them. */
export const LANG_CHOICES = [['de', 'Deutsch'], ['en', 'English'], ['system', 'System']];
export const DEFAULT_PREF = 'de';
const STORE_KEY = 'base.lang';
const DICTS = { de: { ...de }, en: { ...en } };
const LOCALES = { de: 'de-DE', en: 'en-GB' };     // en-GB: 24 hour clock like the German interface

/** Adds the texts of an app (or replaces single texts of the base). */
export function addMessages(lang, messages) { Object.assign(DICTS[lang], messages); }

export const isPref = (v) => v === 'system' || LANGS.includes(v);
export const normalizePref = (v) => (isPref(v) ? v : DEFAULT_PREF);

/** From the choice and the languages of the browser to the language of the interface. */
export function resolveLang(pref, navLangs) {
  if (LANGS.includes(pref)) return pref;
  if (pref !== 'system') return DEFAULT_PREF;
  const list = Array.isArray(navLangs) ? navLangs : navLangs ? [navLangs] : [];
  for (const l of list) {
    const base = String(l).toLowerCase().split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return DEFAULT_PREF;
}

const browserStore = () => (typeof window === 'undefined' ? null : window.localStorage);
let pref = DEFAULT_PREF, lang = DEFAULT_PREF;
const nav = () => (typeof navigator === 'undefined' ? [] : navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language]);

/** Reads the locally kept choice (when the module loads, and in tests). */
export function loadPref(storage = browserStore(), navLangs = nav()) {
  let v = null;
  try { v = storage && storage.getItem(STORE_KEY); } catch { /* no storage */ }
  try {
    const u = typeof location === 'undefined' ? null : new URL(location.href), q = u && u.searchParams.get('lang');
    if (isPref(q)) {
      v = q; if (storage) storage.setItem(STORE_KEY, q);
      u.searchParams.delete('lang'); history.replaceState(history.state, '', u.pathname + u.search + u.hash);   // so a later change in the settings is not overruled by it
    }
  } catch { /* no address */ }
  pref = normalizePref(v);
  lang = resolveLang(pref, navLangs);
  setDocumentLang();
  return pref;
}
/** Keeps a new choice locally and switches the language at once (what is already drawn needs a reload). */
export function setPref(v, storage = browserStore(), navLangs = nav()) {
  pref = normalizePref(v);
  lang = resolveLang(pref, navLangs);
  try { if (storage) storage.setItem(STORE_KEY, pref); } catch { /* no storage */ }
  setDocumentLang();
  return lang;
}
export const getPref = () => pref;
export const getLang = () => lang;
/** The locale for dates, times and numbers (Intl). */
export const locale = () => LOCALES[lang];

const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (!p || p[k] === undefined || p[k] === null ? '' : String(p[k])));

/** The text of a key in the chosen language (fallback German, else empty). */
export function t(key, params) {
  let s = DICTS[lang][key];
  if (s === undefined) s = DICTS.de[key];
  if (s === undefined) { warnOnce(key); return ''; }
  return fill(s, params);
}
/** With a number: picks "key.one" for 1, else "key.other"; {n} stands for the number. */
export function tp(key, n, params) { return t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params }); }
/** Is there such a key (in German)? */
export const hasKey = (key) => DICTS.de[key] !== undefined;

const warned = new Set();
function warnOnce(key) { if (!warned.has(key)) { warned.add(key); try { console.warn('i18n: missing key:', key); } catch { /* no console */ } } }

/* ---------- formats ---------- */
export const fmtNumber = (n, digits = 0) => Number(n).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Date and time in the format of the language; an invalid input gives an empty text. */
export function fmtDate(v, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? '' : d.toLocaleString(locale(), opts);
}
export const fmtDay = (v, opts = { dateStyle: 'medium' }) => { const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? '' : d.toLocaleDateString(locale(), opts); };
/** "5 minutes ago", "yesterday": the distance from now in words; older than a week gives the date. */
export function fmtAgo(v, now = Date.now()) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '';
  const sec = Math.round((d.getTime() - now) / 1000), abs = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(sec / 86400), 'day');
  return fmtDay(d);
}

/* ---------- document ---------- */
export function setDocumentLang() {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
}
const ATTRS = [['data-i18n-title', 'title'], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-alt', 'alt']];
const SELECTOR = '[data-i18n],[data-i18n-title],[data-i18n-aria-label],[data-i18n-placeholder],[data-i18n-alt]';
/** Sets every text and attribute with data-i18n* below root (and root itself) in the chosen language. */
export function applyDom(root = document) {
  const els = [];
  if (root.matches && root.matches(SELECTOR)) els.push(root);
  if (root.querySelectorAll) els.push(...root.querySelectorAll(SELECTOR));
  for (const el of els) {
    const k = el.getAttribute('data-i18n');
    if (k) { const s = t(k); if (s) el.textContent = s; }
    for (const [a, to] of ATTRS) { const ak = el.getAttribute(a); if (ak) { const s = t(ak); if (s) el.setAttribute(to, s); } }
  }
  return root;
}

loadPref();
