/* Runs before the first paint (a plain script in the head, not a module): applies the person's choice of light or dark from the last visit,
 * so the page does not flash in the wrong scheme. Everything else waits for base.js. */
(function () {
  try {
    var scheme = localStorage.getItem('base.scheme');
    if (scheme === 'light' || scheme === 'dark') document.documentElement.dataset.scheme = scheme;
  } catch (e) { /* no storage: the device decides */ }
})();
