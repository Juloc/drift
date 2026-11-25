/* =====================================================================
 * The settings card "Central sign-in" (role admin): the address of the centre, the client id and the secret the centre made for this app,
 * on or off, and a button that reads the description of the centre. The secret is sent to the server and never comes back (AUTH-13).
 *   hubCard(me)
 * ===================================================================== */
import { t } from './i18n.js';
import { h, icon, api, field, passwordField, switchField, submit, confirmDialog, toast, notice, copyText, errorText, ApiError } from './base.js';
import { roleName } from './people.js';

export function hubCard(me) {
  const url = field({ label: t('hub.url'), name: 'url', type: 'url', hint: t('hub.urlHint'), placeholder: 'https://', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  const clientId = field({ label: t('hub.clientId'), name: 'clientId', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  const secret = passwordField({ label: t('hub.secret'), name: 'secret', hint: t('hub.secretHint'), autocomplete: 'off' });
  const enabled = switchField({ label: t('hub.enabled'), hint: t('hub.enabledHint'), name: 'enabled' });
  enabled.classList.remove('reverse');
  const result = h('div', { 'aria-live': 'polite' });
  let state = { secretSet: false };

  const checkButton = h('button', { class: 'btn outline', type: 'button', text: t('hub.check') });
  const removeButton = h('button', { class: 'btn ghost danger', type: 'button', text: t('hub.remove') });
  const form = submit(h('form', { class: 'form' }, url, clientId, secret, enabled, result,
    h('div', { class: 'form-actions' }, removeButton, checkButton, h('button', { class: 'btn primary', type: 'submit', text: t('common.save') }))),
  async (v) => {
    try {
      await api('PUT', '/api/hub-settings', { url: v.url, clientId: v.clientId, secret: v.secret || undefined, enabled: !!form.elements.enabled.checked });
    } catch (e) { if (e instanceof ApiError && e.fields) throw e; if (e instanceof ApiError) toast(errorText(e), { kind: 'danger' }); else throw e; return; }
    form.elements.secret.value = '';
    toast(t('hub.saved'), { kind: 'ok' });
    await load();
  });

  function show(s) {
    state = s;
    form.elements.url.value = s.url || '';
    form.elements.clientId.value = s.clientId || '';
    form.elements.enabled.checked = s.enabled;
    form.elements.secret.placeholder = s.secretSet ? '••••••••' : '';
    const hint = secret.querySelector('.field-hint');
    if (hint) hint.textContent = s.secretSet ? t('hub.secretKept') : t('hub.secretHint');
  }
  const load = () => api('GET', '/api/hub-settings').then(show).catch((e) => result.replaceChildren(notice(errorText(e), 'danger')));

  checkButton.addEventListener('click', async () => {
    result.replaceChildren();
    if (!state.url) { result.replaceChildren(notice(t('hub.checkSaveFirst'), 'danger')); return; }
    checkButton.disabled = true;
    try { const r = await api('POST', '/api/hub-settings/check'); result.replaceChildren(notice(t('hub.checkOk', { name: r.name }), 'ok')); }
    catch (e) { result.replaceChildren(notice(errorText(e), 'danger')); }
    finally { checkButton.disabled = false; }
  });

  removeButton.addEventListener('click', async () => {
    if (!await confirmDialog({ title: t('hub.removeTitle'), text: t('hub.removeText'), confirmLabel: t('hub.remove'), danger: true })) return;
    try { await api('DELETE', '/api/hub-settings'); await load(); result.replaceChildren(); }
    catch (e) { toast(errorText(e), { kind: 'danger' }); }
  });

  // what the person has to enter in the centre: these two addresses are the ones of this very page
  const line = (label, value) => h('div', { class: 'field' }, h('span', { class: 'field-label', text: label }),
    h('div', { class: 'line' }, h('code', { class: 'secret grow', text: value }), h('button', { class: 'btn ghost icon-only', type: 'button', 'aria-label': t('common.copy'), onclick: () => copyText(value) }, icon('copy'))));
  const enter = h('div', { class: 'stack s' }, h('h3', { class: 'h3', text: t('hub.enter') }),
    line(t('hub.returnAddress'), location.origin + '/api/auth/hub/callback'),
    line(t('hub.signedOutAddress'), location.origin + '/'),
    line(t('hub.logoutAddress'), location.origin + '/api/auth/hub/backchannel-logout'),
    h('p', { class: 'field-hint', text: t('hub.rolesLine', { roles: me.appRoles.map((r) => r.key + ' (' + roleName(me, r.key) + ')').join(', ') }) }));

  load();
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('hub.title') }), h('p', { class: 'muted', text: t('hub.intro') }), form, enter);
}
