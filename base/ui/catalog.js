/* The script of the catalogue page: shows the code of every example (read from the example itself), runs the examples that are
 * JavaScript, and lets one try light, dark and any accent hue. English only: the page is for people who build apps. */
import { h, icon, hydrateIcons, toast, openDialog, confirmDialog, openMenu, floatBar, field, passwordField, submit, segmented, theme, ApiError } from './base.js';
import { GLYPHS } from './icons.js';

/* ---------- the examples that are JavaScript: the source shown is the function itself ---------- */
const demos = {
  toast() {
    toast('Entry saved', { kind: 'ok' });
  },
  toastUndo() {
    toast('Entry deleted', { action: { label: 'Undo', run: () => toast('Restored', { kind: 'ok' }) } });
  },
  toastError() {
    toast('The server cannot be reached. Check the connection.', { kind: 'danger' });
  },
  dialog() {
    openDialog({
      title: 'New entry',
      body: h('form', { class: 'form' },
        field({ label: 'Title', name: 'title' }),
        field({ label: 'Note', name: 'note', type: 'textarea' })),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Add', kind: 'primary', run: () => { toast('Entry created', { kind: 'ok' }); } },
      ],
    });
  },
  async ask() {
    const yes = await confirmDialog({ title: 'Delete this entry?', text: '“Buy milk” is deleted for good.', confirmLabel: 'Delete', danger: true });
    toast(yes ? 'Deleted' : 'Kept');
  },
  menu(button) {
    openMenu(button, [
      { heading: 'probe' },
      { label: 'Settings', icon: 'sliders', run: () => toast('Settings') },
      { label: 'Dark appearance', icon: 'moon', run: () => toast('Dark') },
      '-',
      { label: 'Sign out', icon: 'logout', danger: true, run: () => toast('Signed out') },
    ]);
  },
  floatBar() {
    floatBar({
      text: '3 changes waiting', icon: 'info',
      actions: [{ label: 'Discard', kind: 'ghost' }, { label: 'Apply changes', kind: 'primary', run: () => { toast('Applied', { kind: 'ok' }); } }],
    });
  },
  form() {
    // stands in for a request: the server answers with the fields that are wrong
    const save = async (values) => {
      await new Promise((done) => setTimeout(done, 500));
      const fields = {};
      if (!values.title) fields.title = 'required';
      if (values.password.length < 12) fields.password = 'password.short';
      if (Object.keys(fields).length) throw new ApiError(400, { error: 'invalid', fields });
      toast('Saved', { kind: 'ok' });
    };
    return submit(h('form', { class: 'form' },
      field({ label: 'Title', name: 'title', required: true }),
      passwordField({ label: 'Password', name: 'password', hint: 'At least 12 characters.' }),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'submit', text: 'Save' }))), save);
  },
};

/* ---------- code next to each example ---------- */
function dedent(text) {
  const lines = text.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}
const code = (text) => h('pre', { class: 'cat-code' }, h('code', { text }));
const body = (fn) => dedent(fn.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, ''));

for (const demo of document.querySelectorAll('.cat-demo')) {
  if (demo.dataset.nocode !== undefined) continue;
  const pair = h('div', { class: 'cat-pair' });
  demo.replaceWith(pair);
  if (demo.dataset.run) {
    const fn = demos[demo.dataset.run];
    if (demo.dataset.inline !== undefined) demo.append(fn());
    else demo.append(h('button', { class: 'btn', type: 'button', text: 'Try it', onclick: (e) => fn(e.currentTarget) }));
    pair.append(demo, code(body(fn)));
  } else {
    pair.append(demo, code(dedent(demo.innerHTML)));      // read before the icons are put in: this is the markup one writes
  }
}
hydrateIcons();

/* ---------- colours, sizes, icons ---------- */
const COLOURS = ['bg', 'surface', 'surface-1', 'surface-2', 'surface-3', 'surface-4', 'text', 'text-2', 'line', 'line-strong', 'accent', 'on-accent', 'accent-soft', 'on-accent-soft',
  'secondary-soft', 'on-secondary-soft', 'tertiary-soft', 'on-tertiary-soft', 'danger', 'on-danger', 'danger-soft', 'on-danger-soft', 'ok', 'ok-soft', 'on-ok-soft', 'warn', 'warn-soft', 'on-warn-soft'];
document.getElementById('cat-swatches').append(...COLOURS.map((name) => {
  const chip = h('i');
  chip.style.background = `var(--${name})`;
  return h('div', { class: 'swatch' }, chip, h('code', { class: 'mono', text: '--' + name }));
}));
const scale = document.getElementById('cat-scale');
for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7']) {
  const bar = h('div', { class: 'scale-bar' });
  bar.style.width = `var(--${s})`;
  scale.append(h('div', { class: 'scale-row' }, h('code', { class: 'mono', text: '--' + s }), bar));
}
for (const r of ['r-xs', 'r-s', 'r-m', 'r-l', 'r-xl', 'r-full']) {
  const box = h('div', { class: 'radius-box' });
  box.style.borderRadius = `var(--${r})`;
  scale.append(h('div', { class: 'scale-row' }, h('code', { class: 'mono', text: '--' + r }), box));
}
document.getElementById('cat-icons').append(...Object.keys(GLYPHS).map((name) => h('div', { class: 'icon-cell' }, icon(name), name)));

/* ---------- the menu of the page, the scheme, the hue ---------- */
document.getElementById('cat-nav').append(...[...document.querySelectorAll('.cat-item')].map((s) => h('a', { class: 'nav-item', href: '#' + s.id, text: s.querySelector('h2').textContent })));
document.getElementById('cat-scheme').append(segmented({
  name: 'scheme', label: 'Scheme', value: theme.get(), onchange: (v) => theme.set(v),
  options: [['auto', 'System', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']],
}));
const hue = document.getElementById('cat-hue'), hueValue = document.getElementById('cat-hue-value');
hue.addEventListener('input', () => { document.documentElement.style.setProperty('--accent-hue', hue.value); hueValue.textContent = hue.value; theme.apply(); });
fetch('/api/health').then((r) => r.json()).then((d) => { document.getElementById('cat-version').textContent = 'base ' + d.base; }).catch(() => { document.getElementById('cat-version').remove(); });
