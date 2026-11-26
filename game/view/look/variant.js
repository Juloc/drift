// A colour variant of a look, for looking at a world's colours side by side: the look "touge-dusk" has a second file "touge-dusk-b" (colour study B). The choice is `?look=a|b`, else what
// the menu's chip kept on the device (localStorage drift.look), else A. Every other look has no variant and stays as it is.
const VARIANTS = { 'touge-dusk': 'touge-dusk-b' };
export function lookChoice(params, storage = globalThis.localStorage) {
  const q = params.get('look');
  if (q === 'a' || q === 'b') return q;
  try { return storage?.getItem('drift.look') === 'b' ? 'b' : 'a'; } catch { return 'a'; }
}
export const lookFile = (name, choice) => (choice === 'b' && VARIANTS[name]) || name;
export const hasVariant = (name) => name in VARIANTS;
