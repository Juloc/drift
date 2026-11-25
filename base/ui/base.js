/* =====================================================================
 * The one script of the look (CODE-06: plain JavaScript modules, no build step, no framework).
 * What it gives an app:
 *   h, icon, svg            build DOM without innerHTML (SEC-05)
 *   api, ApiError, errorText talk to the own server (adds the header the guard asks for, turns error codes into text)
 *   theme, prefs            light or dark, and the person's settings on the server
 *   toast                   a short message that goes away by itself
 *   openDialog, confirmDialog  a window that does not block the page; a sheet on a phone (DIALOG-01)
 *   openMenu                a small menu at a button
 *   field, passwordField, submit, showErrors   forms with errors at the fields (FORM-01, FORM-02)
 *   emptyState, loading, skeleton, notice, badge
 *   shell, router           the frame of the app (menu, head, person menu) and the pages inside it
 * The catalogue (/base/catalog.html) shows each of them with the code.
 * ===================================================================== */
import { t, hasKey, getPref as getLangPref, setPref as setLangPref } from './i18n.js';
import { glyph } from './icons.js';

/* ---------- DOM ---------- */

/**
 * Makes an element. props: class, text, dataset, on<event> handlers, everything else as an attribute (true: empty attribute; null, undefined, false: left out).
 * Children: nodes, texts, arrays of them; null and false are skipped. Text always goes in as text, never as markup.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  add(el, children);
  return el;
}
function add(el, children) {
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/** Turns SVG markup that this code made itself (an icon, a QR code) into a node. The only place that parses markup; never give it text from a person or a server. */
export function svg(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  return tpl.content.firstElementChild;
}

/** An icon of the family as a node. cls: "l" (larger), "duo" (areas tinted). */
export const icon = (name, cls) => svg(glyph(name, cls));

/** Replaces every <span data-icon="name"> below root by its icon (for markup written by hand, as in the catalogue). */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.replaceWith(icon(el.dataset.icon, el.className || undefined));
}

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

/* ---------- API ---------- */

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || 'Request failed');
    this.status = status;
    this.code = (body && body.error) || 'failed';
    this.fields = (body && body.fields) || null;
    this.retryAfter = (body && body.retryAfter) || 0;
  }
}
const STATUS_CODES = { 0: 'network', 400: 'input', 401: 'auth.none', 403: 'forbidden', 404: 'not_found', 413: 'too_large', 429: 'too_many' };

/**
 * A request to the app's own server. Everything that changes something carries the header the guard asks for (SEC-04).
 * Returns the JSON of the answer (null for an empty one); throws ApiError with the code of the server.
 */
export async function api(method, url, body) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') init.headers['X-Base'] = '1';
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, init); }
  catch { throw new ApiError(0, { error: 'network', message: 'The server cannot be reached.' }); }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* an answer without JSON */ }
  if (res.ok) return data;
  const error = new ApiError(res.status, data || { error: STATUS_CODES[res.status] || 'failed' });
  // the session ended (signed out on another device, or it ran out): back to the sign-in
  if (error.code === 'auth.none' && signedIn) { signedIn = false; location.reload(); }
  throw error;
}
let signedIn = false;
/** Tells the script that a person is signed in: from now on a lost session reloads the page (which shows the sign-in). */
export function markSignedIn() { signedIn = true; }

/** The text for an error in the person's language: by the code of the server, else its English message. */
export function errorText(e) {
  if (!(e instanceof ApiError)) return t('err.failed');
  const key = 'err.' + e.code;
  if (hasKey(key)) return t(key, { seconds: e.retryAfter, minutes: Math.max(1, Math.ceil(e.retryAfter / 60)) });
  return e.message || t('err.failed');
}

/* ---------- light or dark ---------- */

const SCHEME_KEY = 'base.scheme';
export const theme = {
  /** 'auto' (the device decides), 'light' or 'dark'. */
  get() { try { const v = localStorage.getItem(SCHEME_KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; } },
  set(value) {
    const v = value === 'light' || value === 'dark' ? value : 'auto';
    try { v === 'auto' ? localStorage.removeItem(SCHEME_KEY) : localStorage.setItem(SCHEME_KEY, v); } catch { /* no storage */ }
    theme.apply();
    return v;
  },
  apply() {
    const v = theme.get(), root = document.documentElement;
    if (v === 'auto') delete root.dataset.scheme; else root.dataset.scheme = v;
    // the browser's own bar takes the colour of the page
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = h('meta', { name: 'theme-color' }); document.head.append(meta); }
    meta.setAttribute('content', getComputedStyle(document.body || root).backgroundColor);
  },
  isDark: () => (theme.get() === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : theme.get() === 'dark'),
};

/* ---------- the person's settings on the server (they follow to every device) ---------- */

let settings = {};
export const prefs = {
  /** Loads the settings after sign-in and applies language and scheme chosen on another device. Returns true when the language changed (reload). */
  async load() {
    settings = (await api('GET', '/api/settings')).settings || {};
    if (settings.scheme && settings.scheme !== theme.get()) theme.set(settings.scheme);
    if (settings.lang && settings.lang !== getLangPref()) { setLangPref(settings.lang); return true; }
    return false;
  },
  get: (key, fallback) => (settings[key] === undefined ? fallback : settings[key]),
  async set(key, value) { await api('PUT', '/api/settings/' + encodeURIComponent(key), { value }); settings[key] = value; },
};

/* ---------- toast ---------- */

let toastRegion;
/**
 * A short message at the bottom that goes away by itself. kind: 'info' (default), 'ok', 'danger'. action: { label, run } adds one button (undo).
 * For something the person must not miss, use a notice in the page instead.
 */
export function toast(text, { kind = 'info', action, timeout } = {}) {
  if (!toastRegion) { toastRegion = h('div', { class: 'toasts', role: 'region', 'aria-live': 'polite', 'aria-label': t('toast.region') }); document.body.append(toastRegion); }
  const close = () => { clearTimeout(timer); el.remove(); };
  const el = h('div', { class: `toast ${kind}`, role: kind === 'danger' ? 'alert' : 'status' },
    kind === 'ok' ? icon('check-circle') : kind === 'danger' ? icon('alert') : null,
    h('div', { class: 'toast-text', text }),
    action ? h('button', { class: 'btn', type: 'button', text: action.label, onclick: () => { close(); action.run(); } }) : null,
    h('button', { class: 'btn icon-only', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('x')));
  let timer = setTimeout(close, timeout || (kind === 'danger' || action ? 8000 : 4500));
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { timer = setTimeout(close, 2500); });
  toastRegion.append(el);
  while (toastRegion.children.length > 3) toastRegion.firstElementChild.remove();
  return close;
}

/* ---------- dialog ---------- */

const FOCUSABLE = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Opens a dialog: a window on a wide screen (it can be moved by its title and does not block the page behind it), a sheet from below on a phone.
 *  title    the heading
 *  body     a node, or a function (dialog) => node
 *  actions  buttons at the bottom: { label, kind: 'primary' | 'danger' | 'ghost', run(dialog) }. run may be async; while it runs the button is busy.
 *           The dialog closes after run unless it returns false or throws. An action without run just closes.
 *  onClose  called once when it is closed, however that happened
 * Escape and the close button close it; the focus goes into the dialog and back to where it was (DIALOG-01).
 * Returns { el, body, close() }.
 */
export function openDialog({ title, body, actions = [], onClose, wide = false }) {
  const opener = document.activeElement;
  const titleId = nextId('dlg');
  const dialog = { el: null, body: null, close };
  const bodyEl = h('div', { class: 'dialog-body' });
  const head = h('div', { class: 'dialog-head' },
    h('h2', { class: 'dialog-title', id: titleId, text: title }),
    h('button', { class: 'btn ghost icon-only', type: 'button', 'aria-label': t('common.close'), onclick: () => close() }, icon('x')));
  const foot = actions.length ? h('div', { class: 'dialog-foot' }, actions.map((a) => {
    const btn = h('button', { class: `btn ${a.kind || ''}`.trim(), type: 'button', text: a.label });
    btn.addEventListener('click', async () => {
      if (!a.run) { close(); return; }
      try { if (await busy(btn, a.run(dialog)) !== false) close(); }
      catch (e) { if (!(e instanceof ApiError)) throw e; toast(errorText(e), { kind: 'danger' }); }
    });
    return btn;
  })) : null;
  const el = h('dialog', { class: 'dialog' + (wide ? ' wide' : ''), 'aria-labelledby': titleId }, head, bodyEl, foot);
  dialog.el = el; dialog.body = bodyEl;
  bodyEl.append(typeof body === 'function' ? body(dialog) : body);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    el.close(); el.remove();
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    if (onClose) onClose();
  }
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  makeMovable(el, head);
  document.body.append(el);
  el.show();                                   // show(), not showModal(): the page behind stays usable
  // into the first field; a dialog without fields starts on its first button (the harmless one), not on the close button
  const first = bodyEl.querySelector(FOCUSABLE) || (foot && foot.querySelector(FOCUSABLE)) || el.querySelector(FOCUSABLE);
  if (first) first.focus();
  return dialog;
}

/** Lets a window be moved by its head with mouse or finger (only where it is a window, not a sheet). */
function makeMovable(el, handle) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || !matchMedia('(min-width: 600px)').matches) return;
    const box = el.getBoundingClientRect(), dx = e.clientX - box.left, dy = e.clientY - box.top;
    const move = (m) => {
      el.classList.add('moved');
      el.style.left = Math.min(Math.max(8 - box.width / 2, m.clientX - dx), innerWidth - 80) + 'px';
      el.style.top = Math.min(Math.max(8, m.clientY - dy), innerHeight - 56) + 'px';
    };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

/** Asks before something that cannot be undone (DIALOG-01). Resolves to true when the person confirms. The button says what happens, never just "OK". */
export function confirmDialog({ title, text, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog({
      title,
      body: h('p', { class: 'muted', text }),
      actions: [
        { label: t('common.cancel'), kind: 'ghost' },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', run: () => { answer = true; } },
      ],
      onClose: () => resolve(answer),
    });
  });
}

/* ---------- menu ---------- */

/**
 * A small menu at a button. items: { label, icon, run, danger, href } or '-' (a line) or { heading }. Arrow keys move, Escape closes.
 */
export function openMenu(anchor, items) {
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    anchor.setAttribute('aria-expanded', 'false');
  };
  const outside = (e) => { if (!menu.contains(e.target)) close(); };
  const menu = h('div', { class: 'menu', role: 'menu' }, items.map((it) => {
    if (it === '-') return h('div', { class: 'menu-sep', role: 'separator' });
    if (it.heading) return h('div', { class: 'menu-label', text: it.heading });
    const props = { class: 'menu-item' + (it.danger ? ' danger' : ''), role: it.checked === undefined ? 'menuitem' : 'menuitemradio', 'aria-checked': it.checked === undefined ? null : String(it.checked), onclick: () => { close(); if (it.run) it.run(); } };
    const inner = [it.icon ? icon(it.icon) : null, h('span', { class: 'grow', text: it.label }), it.checked ? icon('check') : null];
    return it.href ? h('a', { ...props, href: it.href }, inner) : h('button', { ...props, type: 'button' }, inner);
  }));
  menu.addEventListener('keydown', (e) => {
    const list = [...menu.querySelectorAll('.menu-item')], i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Tab') close();
  });
  document.body.append(menu);
  // place it at the anchor, inside the window
  const a = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect();
  const below = a.bottom + 6 + m.height <= innerHeight - 8;
  menu.style.top = Math.max(8, below ? a.bottom + 6 : a.top - 6 - m.height) + 'px';
  menu.style.left = Math.max(8, Math.min(a.right - m.width, innerWidth - m.width - 8, Math.max(a.left, 8))) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  const first = menu.querySelector('.menu-item');
  if (first) first.focus();
  return close;
}

/* ---------- forms ---------- */

/**
 * A field: label, control, hint, and a place for the error (FORM-01: every control has a visible label).
 * type: any input type, or 'textarea', or 'select' (with options: [[value, label], ...]). Other props go to the control (required, maxlength, autocomplete, inputmode ...).
 */
export function field({ label, name, type = 'text', value = '', hint, options, rows, ...rest }) {
  const id = nextId('f');
  let control;
  if (type === 'textarea') { control = h('textarea', { class: 'textarea', id, name, rows: rows || 4, ...rest }); control.value = value; }
  else if (type === 'select') { control = h('select', { class: 'select', id, name, ...rest }, options.map(([v, l]) => h('option', { value: v, text: l }))); control.value = value; }
  else { control = h('input', { class: 'input', id, name, type, ...rest }); control.value = value; }
  const shown = type === 'search' ? h('div', { class: 'search' }, icon('search'), control) : control;      // a search field is a pill with its symbol
  const describedBy = [];
  const hintEl = hint ? h('p', { class: 'field-hint', id: id + '-hint', text: hint }) : null;
  if (hintEl) describedBy.push(hintEl.id);
  describedBy.push(id + '-error');
  control.setAttribute('aria-describedby', describedBy.join(' '));
  return h('div', { class: 'field', dataset: { field: name } },
    h('label', { for: id, text: label }), shown, hintEl,
    h('p', { class: 'field-error', id: id + '-error', hidden: true }));
}

/** A password field with a button to show what was typed. */
export function passwordField(props) {
  const f = field({ ...props, type: 'password' });
  const input = f.querySelector('input');
  const toggle = h('button', { class: 'btn ghost icon-only', type: 'button', 'aria-label': t('form.showPassword'), 'aria-pressed': 'false' }, icon('eye'));
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.replaceChildren(icon(show ? 'eye-off' : 'eye'));
  });
  const group = h('div', { class: 'input-group' });
  input.replaceWith(group);
  group.append(input, toggle);
  return f;
}

/** A switch with its text. Returns the label; the checkbox inside is .querySelector('input'). */
export function switchField({ label, hint, name, checked = false, onchange }) {
  const input = h('input', { type: 'checkbox', role: 'switch', name, onchange });
  input.checked = checked;
  return h('label', { class: 'switch reverse' }, input, h('span', { class: 'switch-track' }),
    h('span', { class: 'switch-text' }, h('span', { text: label }), hint ? h('span', { class: 'field-hint', text: hint }) : null));
}

/** A choice of a few options shown side by side. options: [[value, label, iconName?], ...]. */
export function segmented({ name, label, value, options, onchange }) {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, options.map(([v, l, ic]) => {
    const input = h('input', { type: 'radio', name, value: v, onchange: () => onchange && onchange(v) });
    input.checked = v === value;
    return h('label', null, input, h('span', null, ic ? icon(ic) : null, l));
  }));
}

/**
 * A group of places in a capsule, for the head of a page or above a list: links, the current one a filled pill inside the capsule.
 * items: [{ label, href, icon?, current? }]. Choices that are not places are a segmented() (the same look).
 */
export function capsule({ label, items }) {
  return h('nav', { class: 'capsule', 'aria-label': label }, items.map((i) =>
    h('a', { class: 'capsule-item', href: i.href, 'aria-current': i.current ? 'page' : null }, i.icon ? icon(i.icon) : null, i.label)));
}

/**
 * A floating bar of actions above the content, in a glass pill: for something that waits for a decision ("Apply changes").
 * { text, icon?, actions: [{ label, kind: 'primary' | 'ghost', run }] }. Returns { el, close() }; an action closes the bar unless its run returns false.
 */
export function floatBar({ text, icon: name, actions = [] }) {
  const bar = { el: null, close: () => bar.el.remove() };
  bar.el = h('div', { class: 'float-bar', role: 'region', 'aria-label': text },
    name ? icon(name) : null, h('span', { class: 'float-bar-text', text }),
    actions.map((a) => h('button', { class: `btn ${a.kind || ''}`.trim(), type: 'button', text: a.label, onclick: async (e) => {
      try { if (!a.run || await busy(e.currentTarget, a.run(bar)) !== false) bar.close(); }
      catch (err) { if (!(err instanceof ApiError)) throw err; toast(errorText(err), { kind: 'danger' }); }
    } })));
  document.body.append(bar.el);
  return bar;
}

/** The values of the named controls of a form (checkboxes as true or false, texts trimmed except passwords). */
export function formValues(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') values[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) values[el.name] = el.value; }
    else values[el.name] = el.type === 'password' ? el.value : el.value.trim();
  }
  return values;
}

export function clearErrors(form) {
  for (const f of form.querySelectorAll('.field.invalid')) {
    f.classList.remove('invalid');
    const p = f.querySelector('.field-error'); p.hidden = true; p.replaceChildren();
    const c = f.querySelector('.input, .select, .textarea'); if (c) c.removeAttribute('aria-invalid');
  }
  const summary = form.querySelector('.form-error');
  if (summary) summary.remove();
}

/**
 * Shows the errors of a failed request in the form (FORM-02): at each wrong field, in words; anything that belongs to no field as a notice on top.
 * The first wrong field gets the focus.
 */
export function showErrors(form, e) {
  clearErrors(form);
  let first = null, shown = 0;
  for (const [name, code] of Object.entries((e instanceof ApiError && e.fields) || {})) {
    const f = form.querySelector(`.field[data-field="${CSS.escape(name)}"]`);
    if (!f) continue;
    const text = hasKey('field.' + code) ? t('field.' + code) : hasKey('err.' + code) ? t('err.' + code) : t('field.invalid');
    f.classList.add('invalid');
    const p = f.querySelector('.field-error'); p.replaceChildren(icon('alert'), h('span', { text })); p.hidden = false;
    const c = f.querySelector('.input, .select, .textarea');
    if (c) { c.setAttribute('aria-invalid', 'true'); first = first || c; }
    shown++;
  }
  if (!shown) form.prepend(h('div', { class: 'notice danger form-error', role: 'alert' }, icon('alert'), h('div', { class: 'notice-text', text: errorText(e) })));
  if (first) first.focus();
}

/** While the promise runs, the button shows a spinner and cannot be pressed twice. Returns what the promise returns. */
export async function busy(button, promise) {
  if (!promise || typeof promise.then !== 'function') return promise;
  button.classList.add('busy'); button.disabled = true;
  try { return await promise; }
  finally { button.classList.remove('busy'); button.disabled = false; }
}

/**
 * Wires a form: on submit it clears old errors, makes the submit button busy and calls fn(values).
 * An ApiError thrown by fn is shown in the form; anything else is a bug and goes on.
 */
export function submit(form, fn) {
  form.setAttribute('novalidate', '');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const button = form.querySelector('button[type=submit], button:not([type])') || document.querySelector(`button[form="${form.id}"]`);
    try { await (button ? busy(button, fn(formValues(form))) : fn(formValues(form))); }
    catch (err) { if (!(err instanceof ApiError)) throw err; showErrors(form, err); }
  });
  return form;
}

/* ---------- small parts ---------- */

/** What a list or a page shows when there is nothing yet: says what belongs here and offers the first step (LIST-02). */
export function emptyState({ icon: name = 'inbox', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-mark' }, icon(name)),
    h('h2', { class: 'empty-title', text: title }),
    text ? h('p', { class: 'empty-text', text }) : null,
    action ? h('button', { class: 'btn primary', type: 'button', onclick: action.run }, action.icon ? icon(action.icon) : null, action.label) : null);
}
export const loading = () => h('div', { class: 'loading', role: 'status', 'aria-label': t('common.loading') }, h('div', { class: 'spinner' }));
/** Grey lines in place of content that is on its way. */
export const skeleton = (lines = 3) => h('div', { class: 'stack s', 'aria-hidden': 'true' }, h('span', { class: 'skeleton title' }), Array.from({ length: lines }, (_, i) => h('span', { class: 'skeleton' + (i === lines - 1 ? ' short' : '') })));
/** A message that stays in the page. kind: 'info' (default), 'ok', 'warn', 'danger'. */
export function notice(text, kind = 'info') {
  const icons = { info: 'info', ok: 'check-circle', warn: 'alert', danger: 'alert' };
  return h('div', { class: `notice ${kind === 'info' ? '' : kind}`.trim(), role: kind === 'danger' ? 'alert' : 'note' }, icon(icons[kind] || 'info'), h('div', { class: 'notice-text', text }));
}
export const badge = (text, kind = '') => h('span', { class: `badge ${kind}`.trim(), text });

/** Copies a text and says so. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('common.copied'), { kind: 'ok' }); }
  catch { toast(t('err.copy'), { kind: 'danger' }); }
}

/* ---------- shell ---------- */

/**
 * The frame of the app (SHELL-01): on a phone a head on top and a bar of up to five places at the bottom; on a wide screen the menu on the left.
 * The person menu (settings, light or dark, sign out) is the same in every app.
 *   app      { name, icon }
 *   nav      [{ label, icon, href }]   href is a hash route such as '#/items'
 *   person   { name }
 *   menu     extra entries of the person menu, in front of "sign out"
 *   onSignOut
 * Returns { el, show(view, path) }. A view is { title, sub, body, back, actions }: sub is a second line under the title, back is the hash to go back to,
 * actions are nodes at the right of the title (the main action first). A nav place with foot: true goes into a second group at the bottom of the side list.
 */
export function shell({ app, nav, person, menu = [], onSignOut }) {
  const title = h('div', { class: 'shell-title', 'aria-hidden': 'true' });       // the small title in the bar: it appears when the page has scrolled
  const backSlot = h('div', null);
  const main = h('main', { class: 'shell-main', id: 'main', tabindex: '-1' });
  const personMenu = (anchor) => openMenu(anchor, [
    { heading: person.name },
    ...menu,
    '-',
    // the appearance has three steps: the device decides (the default), light, dark
    ...[['auto', 'settings.schemeAuto', 'monitor'], ['light', 'settings.schemeLight', 'sun'], ['dark', 'settings.schemeDark', 'moon']].map(([v, key, ic]) =>
      ({ label: t(key), icon: ic, checked: theme.get() === v, run: () => { theme.set(v); prefs.set('scheme', v).catch(() => {}); } })),
    '-',
    { label: t('shell.signOut'), icon: 'logout', run: onSignOut },
  ]);
  const initial = person.name.slice(0, 1);
  const headPerson = h('button', { class: 'person-button', type: 'button', 'aria-label': t('shell.personMenu'), 'aria-haspopup': 'menu', onclick: (e) => personMenu(e.currentTarget) }, h('span', { class: 'avatar', text: initial }));
  const sidePerson = h('button', { class: 'person', type: 'button', 'aria-haspopup': 'menu', onclick: (e) => personMenu(e.currentTarget) },
    h('span', { class: 'avatar', text: initial }), h('span', { class: 'person-name', text: person.name }), icon('more'));
  const link = (cls, n, inner) => h('a', { class: cls, href: n.href, dataset: { nav: n.href } }, inner);
  const navItem = (n) => link('nav-item', n, [icon(n.icon), h('span', { text: n.label })]);
  const brand = (cls) => h('a', { class: cls, href: nav[0] ? nav[0].href : '#/' }, h('span', { class: 'brand-mark' }, icon(app.icon || 'grid')), h('span', { text: app.name }));
  const foot = nav.filter((n) => n.foot);
  const side = h('aside', { class: 'shell-side' },
    brand('brand'),
    h('nav', { class: 'nav', 'aria-label': t('shell.nav') }, nav.filter((n) => !n.foot).map(navItem)),
    foot.length ? h('nav', { class: 'nav nav-foot', 'aria-label': t('shell.nav') }, foot.map(navItem)) : null,
    sidePerson);
  const head = h('header', { class: 'shell-head' }, backSlot, brand('head-brand'), title, h('span', { class: 'grow' }), headPerson);
  const tabs = h('nav', { class: 'shell-tabs', 'aria-label': t('shell.nav') }, nav.slice(0, 5).map((n) => link('tab', n, [h('span', { class: 'tab-pill' }, icon(n.icon)), h('span', { text: n.label })])));
  const el = h('div', { class: 'shell' },
    h('a', { class: 'skip', href: '#main', text: t('shell.skip'), onclick: (e) => { e.preventDefault(); main.focus(); } }),
    side, h('div', { class: 'shell-body' }, head, main), tabs);
  addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 4), { passive: true });

  function show(view, path = '') {
    title.textContent = view.title || '';
    document.title = view.title ? `${view.title} · ${app.name}` : app.name;
    const back = () => h('a', { class: 'btn ghost icon-only', href: view.back, 'aria-label': t('common.back') }, icon('left'));
    backSlot.replaceChildren(view.back ? back() : '');
    backSlot.hidden = !view.back;
    head.classList.toggle('has-back', !!view.back);
    // the head of the page: the big title, a second line, the main action at the right (the start page of JulOS)
    const pageHead = h('div', { class: 'page-head' },
      view.back ? h('span', { class: 'page-back' }, back()) : null,
      h('div', { class: 'page-head-text' }, h('h1', { class: 'page-title', text: view.title || '' }), view.sub ? h('p', { class: 'page-sub', text: view.sub }) : null),
      view.actions && view.actions.length ? h('div', { class: 'page-actions' }, view.actions) : null);
    main.replaceChildren(pageHead, view.body);
    // the place in the menu that contains this page is marked (the longest matching start wins)
    const current = nav.map((n) => n.href.replace(/^#/, '')).filter((p) => path === p || path.startsWith(p.replace(/\/$/, '') + '/') || p === path + '/').sort((a, b) => b.length - a.length)[0];
    for (const a of el.querySelectorAll('[data-nav]')) {
      if (a.dataset.nav === '#' + current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  return { el, main, show };
}

/* ---------- router ---------- */

/**
 * Pages by the hash of the address. routes: { '/items': fn, '/items/:id': fn }; a function gets the parameters and returns a view
 * (or a promise of one) for shell.show. While a page loads, grey lines stand in; a failed load offers "try again".
 * Returns { go(path), refresh() }.
 */
export function router(routes, frame, { fallback = '/' } = {}) {
  const table = Object.entries(routes).map(([pattern, fn]) => {
    const names = [];
    const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
    return { re, names, fn };
  });
  let run = 0;
  async function render() {
    const path = decodeURI(location.hash.replace(/^#/, '')) || '/';
    let match = null;
    for (const r of table) { const m = r.re.exec(path); if (m) { match = { fn: r.fn, params: Object.fromEntries(r.names.map((n, i) => [n, m[i + 1]])) }; break; } }
    if (!match) { if (path !== fallback) location.replace('#' + fallback); return; }
    const mine = ++run;
    const wait = setTimeout(() => { if (mine === run) frame.show({ title: '', body: h('div', { class: 'page' }, skeleton(4)) }, path); }, 180);
    try {
      const view = await match.fn(match.params);
      if (mine !== run) return;
      clearTimeout(wait);
      frame.show(view, path);
      scrollTo(0, 0);
      frame.main.focus({ preventScroll: true });
    } catch (e) {
      clearTimeout(wait);
      if (mine !== run) return;
      if (!(e instanceof ApiError)) console.error(e);
      frame.show({
        title: t('err.title'),
        body: emptyState({ icon: 'alert', title: t('err.title'), text: e instanceof ApiError ? errorText(e) : t('err.failed'), action: { label: t('common.retry'), icon: 'refresh', run: render } }),
      }, path);
    }
  }
  addEventListener('hashchange', render);
  render();
  return { go: (path) => { if (location.hash === '#' + path) render(); else location.hash = path; }, refresh: render };
}

theme.apply();
