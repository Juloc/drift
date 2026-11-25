/* =====================================================================
 * The parts of the settings page that are the same in every app: appearance, account and safety, devices, history, the installation, about.
 * Each function returns a card; the app puts them on its settings page and adds its own cards in between.
 * ===================================================================== */
import { t, tp, LANG_CHOICES, getPref, setPref, fmtAgo, fmtDate } from './i18n.js';
import { h, icon, api, field, passwordField, submit, formValues, showErrors, clearErrors, segmented, openDialog, confirmDialog, toast, theme, prefs, badge, skeleton, notice, errorText, ApiError } from './base.js';
import { authenticator, recoveryCodes } from './auth.js';
import { roleName } from './people.js';

const card = (title, ...body) => h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: title }), ...body);
const flushCard = (title, action, body) => h('section', { class: 'card flush' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: title }), action), body);

/** Light or dark and the language. Both are kept on the server, so they follow the person to every device. */
export function appearanceCard() {
  const lang = field({ label: t('settings.language'), name: 'lang', type: 'select', value: getPref(), options: LANG_CHOICES });
  lang.querySelector('select').addEventListener('change', async (e) => {
    setPref(e.target.value);
    try { await prefs.set('lang', e.target.value); } catch { /* kept locally */ }
    location.reload();
  });
  const scheme = segmented({
    name: 'scheme', label: t('settings.scheme'), value: theme.get(),
    options: [['auto', t('settings.schemeAuto'), 'monitor'], ['light', t('settings.schemeLight'), 'sun'], ['dark', t('settings.schemeDark'), 'moon']],
    onchange: (v) => { theme.set(v); prefs.set('scheme', v).catch((e) => toast(errorText(e), { kind: 'danger' })); },
  });
  return card(t('settings.appearance'), h('div', { class: 'field' }, h('span', { class: 'field-label', text: t('settings.scheme') }), scheme), lang);
}

/** Password, authenticator and recovery codes of the signed-in person. Every change asks for the current password. */
export function securityCard(me) {
  const left = h('span', { class: 'row-sub', text: '' });
  api('GET', '/api/auth/sessions').then((r) => { left.textContent = tp('account.recoveryLeft', r.recoveryLeft); }).catch(() => {});
  const row = (ic, title, sub, label, run) => h('li', null, h('div', { class: 'row' },
    h('span', { class: 'row-lead' }, icon(ic)),
    h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: title }), typeof sub === 'string' ? h('span', { class: 'row-sub', text: sub }) : sub),
    h('button', { class: 'btn outline', type: 'button', text: label, onclick: run })));
  return flushCard(t('account.security'), null, h('ul', { class: 'list' },
    h('li', null, h('div', { class: 'row' }, h('span', { class: 'avatar', text: me.user.slice(0, 1) }),
      h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: me.user }), h('span', { class: 'row-sub', text: me.roles.length ? me.roles.map((r) => roleName(me, r)).join(', ') : t('role.none') })))),
    // a person who signed in through the central sign-in has no password or authenticator here
    ...(me.viaHub ? [h('li', null, h('div', { class: 'row' }, notice(t('account.viaHub'))))] : [
      row('lock', t('account.password'), t('account.passwordSub'), t('common.change'), changePassword),
      row('shield', t('account.totp'), left, t('account.totpReplace'), replaceAuthenticator)])));
}

function changePassword() {
  const form = h('form', { class: 'form', id: 'pw-form' },
    passwordField({ label: t('account.current'), name: 'current', autocomplete: 'current-password', required: true }),
    passwordField({ label: t('account.next'), name: 'next', hint: t('setup.passwordHint'), autocomplete: 'new-password', required: true }),
    notice(t('account.passwordNote')));
  openDialog({
    title: t('account.password'), body: form,
    actions: [{ label: t('common.cancel'), kind: 'ghost' }, {
      label: t('account.passwordSave'), kind: 'primary', run: async () => {
        clearErrors(form);
        try { await api('POST', '/api/auth/password', formValues(form)); }
        catch (e) { if (!(e instanceof ApiError)) throw e; showErrors(form, e); return false; }
        toast(t('account.passwordDone'), { kind: 'ok' });
      },
    }],
  });
}

function replaceAuthenticator() {
  const first = h('form', { class: 'form' },
    h('p', { class: 'muted', text: t('account.totpIntro') }),
    passwordField({ label: t('account.current'), name: 'current', autocomplete: 'current-password', required: true }));
  const dialog = openDialog({
    title: t('account.totp'), body: first,
    actions: [{ label: t('common.cancel'), kind: 'ghost' }, {
      label: t('common.next'), kind: 'primary', run: async () => {
        clearErrors(first);
        let begun;
        try { begun = await api('POST', '/api/auth/totp/begin', formValues(first)); }
        catch (e) { if (!(e instanceof ApiError)) throw e; showErrors(first, e); return false; }
        dialog.close();
        confirmNew(begun);
      },
    }],
  });
}

function confirmNew(begun) {
  const form = h('form', { class: 'form' },
    authenticator(begun.uri, begun.secret),
    field({ label: t('setup.totpCode'), name: 'code', class: 'input code', inputmode: 'numeric', autocomplete: 'one-time-code', required: true }));
  const dialog = openDialog({
    title: t('account.totp'), body: form,
    actions: [{ label: t('common.cancel'), kind: 'ghost' }, {
      label: t('account.totpConfirm'), kind: 'primary', run: async () => {
        clearErrors(form);
        let done;
        try { done = await api('POST', '/api/auth/totp/finish', formValues(form)); }
        catch (e) { if (!(e instanceof ApiError)) throw e; if (e.code === 'totp.wrong') e.fields = { code: 'totp.wrong' }; showErrors(form, e); return false; }
        dialog.close();
        openDialog({
          title: t('setup.recoveryTitle'),
          body: h('div', { class: 'stack' }, notice(t('account.totpDone'), 'ok'), h('p', { class: 'muted', text: t('setup.recoveryIntro') }), recoveryCodes(done.recovery)),
          actions: [{ label: t('setup.recoverySaved'), kind: 'primary' }],
        });
      },
    }],
  });
}

/** What a browser calls itself, in a few words a person recognises ("Firefox on Linux"). */
export function deviceName(userAgent) {
  const ua = userAgent || '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : '';
  const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const phone = /Android|iPhone|iPod|Mobile/.test(ua);
  const name = browser && os ? t('devices.on', { browser, os }) : browser || os || t('devices.unknown');
  return { name, icon: phone ? 'phone' : os ? 'laptop' : 'monitor' };
}

/** The list of devices (AUTH-04): one row per session; each can be signed out, and all others at once. */
export function devicesCard() {
  const list = h('ul', { class: 'list' }, h('li', { class: 'row' }, skeleton(2)));
  const others = h('button', { class: 'btn ghost', type: 'button', text: t('devices.endOthers'), hidden: true });
  async function load() {
    const { sessions } = await api('GET', '/api/auth/sessions');
    others.hidden = sessions.length < 2;
    list.replaceChildren(...sessions.map((s) => {
      const d = deviceName(s.userAgent);
      return h('li', null, h('div', { class: 'row' },
        h('span', { class: 'row-lead' }, icon(d.icon)),
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title', text: d.name }),
          h('span', { class: 'row-sub', text: [s.current ? t('devices.now') : t('devices.lastSeen', { ago: fmtAgo(s.lastSeen) }), s.ip, t('devices.since', { date: fmtDate(s.createdAt, { dateStyle: 'medium' }) })].filter(Boolean).join(' · ') })),
        s.current ? badge(t('devices.this'), 'accent') : h('button', { class: 'btn ghost danger', type: 'button', text: t('devices.end'), onclick: () => end(s, d) })));
    }));
  }
  async function end(s, d) {
    if (!await confirmDialog({ title: t('devices.endTitle'), text: t('devices.endText', { name: d.name }), confirmLabel: t('devices.end'), danger: true })) return;
    try { await api('DELETE', '/api/auth/sessions/' + s.id); toast(t('devices.ended'), { kind: 'ok' }); await load(); }
    catch (e) { toast(errorText(e), { kind: 'danger' }); }
  }
  others.addEventListener('click', async () => {
    if (!await confirmDialog({ title: t('devices.endOthers'), text: t('devices.endOthersText'), confirmLabel: t('devices.endOthers'), danger: true })) return;
    try { const r = await api('POST', '/api/auth/logout-others'); toast(tp('devices.endedN', r.ended), { kind: 'ok' }); await load(); }
    catch (e) { toast(errorText(e), { kind: 'danger' }); }
  });
  load().catch((e) => list.replaceChildren(h('li', { class: 'row' }, notice(errorText(e), 'danger'))));
  return flushCard(t('devices.title'), others, list);
}

/** What happened to the account lately (AUTH-10): sign-ins, failed attempts, changes. */
export function historyCard() {
  const body = h('div', { class: 'table-wrap' }, h('div', { class: 'row' }, skeleton(2)));
  api('GET', '/api/auth/history').then(({ entries }) => {
    body.replaceChildren(h('table', { class: 'table cards' },
      h('thead', null, h('tr', null, h('th', { text: t('history.event') }), h('th', { text: t('history.when') }), h('th', { text: t('history.from') }))),
      h('tbody', null, entries.slice(0, 15).map((e) => h('tr', null,
        h('td', { 'data-label': t('history.event') }, h('span', null, e.event === 'login.failed' ? badge(t('history.' + e.event), 'danger') : (t('history.' + e.event) || e.event))),
        h('td', { 'data-label': t('history.when'), class: 'nowrap', text: fmtDate(e.at) }),
        h('td', { 'data-label': t('history.from'), class: 'mono', text: e.ip || '' }))))));
  }).catch((e) => body.replaceChildren(h('div', { class: 'row' }, notice(errorText(e), 'danger'))));
  return flushCard(t('history.title'), null, body);
}

/** Settings of the whole installation, for the role admin: the reverse proxies the server believes. */
export function installationCard() {
  const proxies = field({ label: t('install.proxies'), name: 'proxies', type: 'textarea', rows: 3, hint: t('install.proxiesHint'), spellcheck: 'false', autocapitalize: 'none' });
  const form = submit(h('form', { class: 'form' }, proxies, h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'submit', text: t('common.save') }))), async (v) => {
    const list = v.proxies.split(/[\s,]+/).filter(Boolean);
    try {
      if (list.length) await api('PUT', '/api/instance-settings/proxy.trusted', { value: list });
      else await api('DELETE', '/api/instance-settings/proxy.trusted');
    } catch (e) { if (e instanceof ApiError && e.code === 'setting.invalid') e.fields = { proxies: 'install.proxiesBad' }; throw e; }
    toast(t('common.saved'), { kind: 'ok' });
  });
  api('GET', '/api/instance-settings').then((r) => { proxies.querySelector('textarea').value = (r.settings['proxy.trusted'] || []).join('\n'); }).catch(() => {});
  return card(t('install.title'), form);
}

/** Name and versions of the app, and the way to the catalogue of the look. */
export function aboutCard(me) {
  return card(t('about.title'), h('dl', { class: 'facts' },
    h('dt', { text: t('about.app') }), h('dd', { text: me.app.name }),
    h('dt', { text: t('about.version') }), h('dd', { class: 'mono', text: me.app.version + (me.app.commit ? ` (${me.app.commit})` : '') }),
    h('dt', { text: t('about.base') }), h('dd', { class: 'mono', text: me.app.base })),
    h('div', null, h('a', { class: 'btn outline', href: '/base/catalog.html', target: '_blank', rel: 'noopener' }, icon('external'), t('about.catalog'))));
}
