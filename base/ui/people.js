/* =====================================================================
 * The people of the app, for the role admin: the list, an invitation link per new person (it works once and runs out after 24 hours),
 * change the role, block, delete. The server keeps the rules (the last administrator stays; nobody blocks or deletes themselves).
 *   peopleCard(me)   a card for the settings page
 *   roleName(me, key)  the name of a role in the language of the person
 * ===================================================================== */
import { t, getLang, fmtAgo, fmtDate } from './i18n.js';
import { h, icon, api, field, formValues, showErrors, clearErrors, openDialog, confirmDialog, openMenu, toast, badge, notice, skeleton, emptyState, copyText, errorText, ApiError } from './base.js';

/** The name of a role as the app named it (German or English); the key itself when the app does not know it. */
export function roleName(me, key) {
  const r = (me.appRoles || []).find((x) => x.key === key);
  if (!r) return key || t('role.none');
  return (getLang() === 'de' && r.name.de) || r.name.en;
}

const STATE_BADGE = { active: 'ok', blocked: 'danger', invited: 'accent' };

export function peopleCard(me) {
  const list = h('ul', { class: 'list' }, h('li', { class: 'row' }, skeleton(2)));
  const add = h('button', { class: 'btn primary', type: 'button', onclick: () => addDialog() }, icon('plus'), t('people.add'));
  let roles = [];

  async function load() {
    const r = await api('GET', '/api/people');
    roles = r.roles;
    list.replaceChildren(...(r.people.length ? r.people.map(row) : [h('li', null, emptyState({ icon: 'user', title: t('people.empty') }))]));
  }
  const refresh = () => load().catch((e) => toast(errorText(e), { kind: 'danger' }));

  function row(p) {
    const self = p.name === me.user;
    const sub = [roleName({ appRoles: roles }, p.role)];
    if (p.state === 'invited') sub.push(p.inviteUntil ? t('people.inviteUntil', { date: fmtDate(p.inviteUntil) }) : t('people.inviteExpired'));
    else sub.push(p.lastSeen ? t('people.lastSeen', { ago: fmtAgo(p.lastSeen) }) : t('people.never'));
    const more = h('button', { class: 'btn ghost icon-only', type: 'button', 'aria-label': t('people.menu', { name: p.name }), 'aria-haspopup': 'menu' }, icon('more'));
    more.addEventListener('click', () => openMenu(more, [
      p.viaHub ? null : { label: t('people.changeRole'), icon: 'edit', run: () => roleDialog(p) },
      p.state === 'invited' ? { label: t('people.reinvite'), icon: 'refresh', run: () => reinvite(p) } : null,
      !self && p.state === 'active' ? { label: t('people.block'), icon: 'lock', run: () => block(p, true) } : null,
      !self && p.state === 'blocked' ? { label: t('people.unblock'), icon: 'check', run: () => block(p, false) } : null,
      !self ? '-' : null,
      !self ? { label: t('people.delete'), icon: 'trash', danger: true, run: () => remove(p) } : null,
    ].filter((x, i, a) => x && !(x === '-' && (i === 0 || i === a.length - 1)))));
    return h('li', null, h('div', { class: 'row' },
      h('span', { class: 'avatar', text: p.name.slice(0, 1) }),
      h('div', { class: 'row-main' },
        h('span', { class: 'row-title' }, p.name, ' ', badge(t('people.state.' + p.state), STATE_BADGE[p.state] || ''), p.viaHub ? ' ' : null, p.viaHub ? badge(t('people.viaHub')) : null),
        h('span', { class: 'row-sub', text: sub.join(' · ') })),
      more));
  }

  function roleSelect(value) {
    return field({ label: t('people.role'), name: 'role', type: 'select', value, options: roles.map((r) => [r.key, (getLang() === 'de' && r.name.de) || r.name.en]) });
  }

  function addDialog() {
    const form = h('form', { class: 'form' },
      field({ label: t('people.name'), name: 'name', hint: t('people.nameHint'), autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', required: true }),
      roleSelect(roles.find((r) => r.key !== 'admin')?.key || roles[0]?.key));
    const dialog = openDialog({
      title: t('people.addTitle'), body: form,
      actions: [{ label: t('common.cancel'), kind: 'ghost' }, {
        label: t('people.add'), kind: 'primary', run: async () => {
          clearErrors(form);
          let made;
          try { made = await api('POST', '/api/people', formValues(form)); }
          catch (e) { if (!(e instanceof ApiError)) throw e; showErrors(form, e); return false; }
          dialog.close();
          await refresh();
          linkDialog(made.person.name, made.invite);
        },
      }],
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); dialog.el.querySelector('.dialog-foot .btn.primary').click(); });
  }

  /** The invitation link is shown once, here. The token travels in the fragment (#invite=...), which a browser never sends to a server. */
  function linkDialog(name, invite) {
    const link = location.origin + '/#invite=' + invite.token;
    const box = h('input', { class: 'input mono grow', readonly: true, value: link, 'aria-label': t('people.linkTitle') });
    box.addEventListener('focus', () => box.select());
    openDialog({
      title: t('people.linkTitle'),
      body: h('div', { class: 'stack' }, h('p', { class: 'muted', text: t('people.linkText', { name, date: fmtDate(invite.expiresAt) }) }),
        h('div', { class: 'line' }, box, h('button', { class: 'btn outline', type: 'button', onclick: () => copyText(link) }, icon('copy'), t('people.linkCopy')))),
      actions: [{ label: t('people.linkDone'), kind: 'primary' }],
    });
  }

  async function reinvite(p) {
    try { linkDialog(p.name, await api('POST', `/api/people/${p.id}/invite`)); await load(); }
    catch (e) { toast(errorText(e), { kind: 'danger' }); }
  }

  function roleDialog(p) {
    const form = h('form', { class: 'form' }, roleSelect(p.role));
    openDialog({
      title: t('people.changeRole') + ': ' + p.name, body: form,
      actions: [{ label: t('common.cancel'), kind: 'ghost' }, {
        label: t('common.save'), kind: 'primary', run: async () => {
          clearErrors(form);
          try { await api('PUT', `/api/people/${p.id}/role`, formValues(form)); }
          catch (e) { if (!(e instanceof ApiError)) throw e; if (e.code !== 'invalid') e.fields = { role: e.code }; showErrors(form, e); return false; }
          toast(t('people.roleSaved'), { kind: 'ok' });
          await refresh();
        },
      }],
    });
  }

  async function block(p, blocked) {
    if (blocked && !await confirmDialog({ title: t('people.blockTitle', { name: p.name }), text: t('people.blockText'), confirmLabel: t('people.block'), danger: true })) return;
    try { await api('POST', `/api/people/${p.id}/${blocked ? 'block' : 'unblock'}`); toast(blocked ? t('people.blocked') : t('people.unblocked'), { kind: 'ok' }); await load(); }
    catch (e) { toast(errorText(e), { kind: 'danger' }); }
  }

  async function remove(p) {
    if (!await confirmDialog({ title: t('people.deleteTitle', { name: p.name }), text: t('people.deleteText'), confirmLabel: t('people.delete'), danger: true })) return;
    try { await api('DELETE', '/api/people/' + p.id); toast(t('people.deleted'), { kind: 'ok' }); await load(); }
    catch (e) { toast(errorText(e), { kind: 'danger' }); }
  }

  load().catch((e) => list.replaceChildren(h('li', { class: 'row' }, notice(errorText(e), 'danger'))));
  return h('section', { class: 'card flush' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title', text: t('people.title') }), add), list);
}
