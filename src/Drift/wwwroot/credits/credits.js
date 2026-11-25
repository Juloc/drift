// The credits page: everything in game/data/credits.json (served at /play/data/credits.json), with author, source and licence, as text. A licence such as CC BY asks for the
// naming of the author, so this page lists every entry with its author, its source and its licence, and a model that is used must be in that file.
const de = navigator.language?.startsWith('de');
const T = de
  ? { title: 'Credits', intro: 'Was in diesem Spiel steckt und nicht eigens dafür gemacht wurde, mit Urheber, Quelle und Lizenz.', author: 'Von', licence: 'Lizenz', source: 'Quelle', back: 'Zurück', privacy: 'Datenschutz', imprint: 'Impressum', failed: 'Die Liste konnte nicht geladen werden.', models: 'Modelle und Bilder von außerhalb', noModels: 'Bisher keine.' }
  : { title: 'Credits', intro: 'What is in this game and was not made for it, with author, source and licence.', author: 'By', licence: 'Licence', source: 'Source', back: 'Back', privacy: 'Privacy', imprint: 'Imprint', failed: 'The list could not be loaded.', models: 'Models and pictures from outside', noModels: 'None so far.' };
document.documentElement.lang = de ? 'de' : 'en';
const $ = (id) => document.getElementById(id);
document.title = T.title; $('title').textContent = T.title; $('intro').textContent = T.intro; $('back').textContent = T.back; $('privacy').textContent = T.privacy; $('imprint').textContent = T.imprint;

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });
const link = (href, text) => { const a = el('a', '', text); if (/^https:\/\//.test(href)) { a.href = href; a.rel = 'noopener noreferrer'; a.target = '_blank'; } return a; };

try {
  const credits = await (await fetch('/play/data/credits.json')).json();
  const lang = de ? 'de' : 'en';
  const row = (e) => {
    const r = el('div', 'challenge');
    const head = el('b', '', e.name + (e.version ? ' ' + e.version : ''));
    const meta = el('span', 'muted');
    meta.append(`${T.author} ${e.author} · ${T.licence}: `, e.licenceUrl ? link(e.licenceUrl, e.licence) : document.createTextNode(e.licence));
    if (e.source) { meta.append(` · ${T.source}: `, link(e.source, e.source.replace(/^https:\/\//, ''))); }
    const use = el('span', 'muted', e.use?.[lang] ?? '');
    r.append(head, el('span'), meta, el('span'), use);
    return r;
  };
  const outside = credits.entries.filter((e) => e.kind === 'model' || e.kind === 'picture' || e.kind === 'sound');
  $('list').append(...credits.entries.filter((e) => !outside.includes(e)).map(row));
  const h = el('h2', 'card-title', T.models); $('list').append(h);
  if (outside.length) $('list').append(...outside.map(row)); else $('list').append(el('p', 'muted', T.noModels));
} catch { $('list').textContent = T.failed; }
