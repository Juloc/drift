/* The administrator's card for the Juloc Games accounts (docs/PLAN-0.2.md): the list with search, block and unblock, reset of a password, delete, the open reports and the bans.
 * Everything goes through the existing API /api/games-admin (behind the base's guard and the role "admin"); every action is in the audit log on the server. */
import { t, fmtDate } from '/base/i18n.js';
import { h, icon, api, toast, field, confirmDialog, formValues, showErrors, clearErrors, ApiError } from '/base/base.js';

const REASONS = ['gadmin.reason0', 'gadmin.reason1', 'gadmin.reason2', 'gadmin.reason3', 'gadmin.reason4'];   // the fixed reasons of a report, as the server numbers them

export function gamesAdminCard() {
  const accounts = h('div', { class: 'stack' }), reports = h('div', { class: 'stack' }), bans = h('div', { class: 'stack' }), shown = h('div', { class: 'stack' });
  let query = '';

  const act = (fn, done) => async () => { try { await fn(); if (done) toast(done, { kind: 'ok' }); } catch (e) { if (!(e instanceof ApiError)) throw e; toast(t('gadmin.failed'), { kind: 'danger' }); } loadAll(); };

  async function loadAccounts() {
    const r = await api('GET', '/api/games-admin/accounts?q=' + encodeURIComponent(query));
    accounts.replaceChildren(...(r.accounts.length ? r.accounts.map((a) => h('div', { class: 'row' },
      h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: a.name + (a.state === 'blocked' ? ' · ' + t('gadmin.blocked') : '') }), h('span', { class: 'row-sub', text: t('gadmin.created', { at: fmtDate(a.created) }) })),
      h('div', { class: 'cluster' },
        a.state === 'blocked'
          ? h('button', { class: 'btn outline', type: 'button', onclick: act(() => api('POST', `/api/games-admin/accounts/${a.id}/unblock`), t('gadmin.unblocked')) }, t('gadmin.unblock'))
          : h('button', { class: 'btn outline', type: 'button', onclick: act(() => api('POST', `/api/games-admin/accounts/${a.id}/block`), t('gadmin.blockedDone')) }, t('gadmin.block')),
        h('button', { class: 'btn outline', type: 'button', onclick: async () => {
          if (!await confirmDialog({ title: t('gadmin.resetTitle'), text: t('gadmin.resetText', { name: a.name }), confirmLabel: t('gadmin.reset'), danger: true })) return;
          try {
            const r2 = await api('POST', `/api/games-admin/accounts/${a.id}/reset-password`);
            // shown once: the server keeps only a hash
            const box = h('input', { class: 'input', readonly: '', value: r2.password, 'aria-label': t('gadmin.tempPassword') });
            shown.replaceChildren(h('div', { class: 'notice ok' }, icon('check-circle'), h('div', { class: 'notice-text', text: t('gadmin.resetDone', { name: a.name }) })), box);
            box.select();
          } catch (e) { if (!(e instanceof ApiError)) throw e; toast(t('gadmin.failed'), { kind: 'danger' }); }
          loadAll();
        } }, t('gadmin.reset')),
        h('button', { class: 'btn ghost danger', type: 'button', onclick: async () => {
          if (!await confirmDialog({ title: t('gadmin.deleteTitle'), text: t('gadmin.deleteText', { name: a.name }), confirmLabel: t('gadmin.delete'), danger: true })) return;
          await act(() => api('DELETE', '/api/games-admin/accounts/' + a.id), t('gadmin.deleted'))();
        } }, t('gadmin.delete')))))
      : [h('p', { class: 'muted', text: t('gadmin.noAccounts') })]));
  }

  async function loadReports() {
    const r = await api('GET', '/api/games-admin/reports');
    reports.replaceChildren(...(r.reports.length ? r.reports.map((x) => h('div', { class: 'row' },
      h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: x.name }), h('span', { class: 'row-sub', text: t(REASONS[x.reason] ?? 'gadmin.reason4') + ' · ' + fmtDate(x.at) + (x.reportedId ? '' : ' · ' + t('gadmin.notFound')) })),
      h('div', { class: 'cluster' }, h('button', { class: 'btn outline', type: 'button', onclick: act(() => api('POST', `/api/games-admin/reports/${x.id}/handle`), t('gadmin.handled')) }, t('gadmin.handle')))))
      : [h('p', { class: 'muted', text: t('gadmin.noReports') })]));
  }

  async function loadBans() {
    const r = await api('GET', '/api/games-admin/bans');
    bans.replaceChildren(...(r.bans.length ? r.bans.map((b) => h('div', { class: 'row' },
      h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: b.range }), h('span', { class: 'row-sub', text: t('gadmin.until', { at: fmtDate(b.until) }) + (b.reason ? ' · ' + b.reason : '') })),
      h('div', { class: 'cluster' }, h('button', { class: 'btn ghost danger', type: 'button', onclick: act(() => api('DELETE', '/api/games-admin/bans/' + b.id), t('gadmin.unbanned')) }, t('gadmin.unban')))))
      : [h('p', { class: 'muted', text: t('gadmin.noBans') })]));
  }

  const loadAll = () => Promise.all([loadAccounts(), loadReports(), loadBans()]).catch(() => { /* the cards stay as they were */ });

  const search = h('form', { class: 'form' }, field({ label: t('gadmin.search'), name: 'q', hint: t('gadmin.searchHint') }), h('button', { class: 'btn outline', type: 'submit' }, t('gadmin.find')));
  search.addEventListener('submit', (e) => { e.preventDefault(); query = formValues(search).q ?? ''; loadAccounts(); });

  const banForm = h('form', { class: 'form' },
    field({ label: t('gadmin.range'), name: 'range', hint: t('gadmin.rangeHint') }),
    field({ label: t('gadmin.hours'), name: 'hours', type: 'number', value: '24', min: '1', max: '8760' }),
    field({ label: t('gadmin.reasonLabel'), name: 'reason' }),
    h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), t('gadmin.ban')));
  banForm.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(banForm);
    const v = formValues(banForm);
    try { await api('POST', '/api/games-admin/bans', { range: v.range, hours: Number(v.hours), reason: v.reason || null }); toast(t('gadmin.banned'), { kind: 'ok' }); banForm.reset(); loadBans(); }
    catch (err) { if (!(err instanceof ApiError)) throw err; showErrors(banForm, err); toast(t('gadmin.banRefused'), { kind: 'danger' }); }
  });

  loadAll();
  return h('section', { class: 'card stack' }, h('h2', { class: 'card-title', text: t('gadmin.title') }), h('p', { class: 'muted', text: t('gadmin.intro') }),
    search, shown, accounts,
    h('h3', { class: 'card-sub', text: t('gadmin.reportsTitle') }), reports,
    h('h3', { class: 'card-sub', text: t('gadmin.bansTitle') }), bans, banForm);
}
