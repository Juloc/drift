#!/usr/bin/env bash
# The check before a merge is committed (run by the hooks in .githooks/, or by hand): version 0.7.0 went out with a game page that did not load, because two branches
# had each added the same line and git merged them without a conflict. Stops the commit when
#   1. a script of a page does not parse, imports a file that is not there or a name that is not exported (tests/js/pages.test.mjs),
#   2. a test of the game's own logic fails (node --test game/ tests/js),
#   3. the game page does not start in a real browser (tools/playcheck.mjs at the PC size, through devq when there is one).
# The play check's other findings (a HUD overlap, a road height) are shown, they do not stop a merge: they have their own place in the release check.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
echo "premerge: scripts of every page ..."
node --test tests/js/pages.test.mjs >/tmp/drift-premerge-$$.log 2>&1 || { grep -E "✖|SyntaxError|which" /tmp/drift-premerge-$$.log | head -20; echo "premerge: STOP, a page's script is broken (see above)"; rm -f /tmp/drift-premerge-$$.log; exit 1; }
echo "premerge: the game's tests ..."
node --test game/ tests/js >/tmp/drift-premerge-$$.log 2>&1 || { grep -E "^✖|AssertionError" /tmp/drift-premerge-$$.log | head -20; echo "premerge: STOP, tests fail"; rm -f /tmp/drift-premerge-$$.log; exit 1; }
echo "premerge: the game page in a browser ..."
run=(node tools/playcheck.mjs --only=pc --out=/tmp/drift-premerge-playcheck-$$)
command -v devq >/dev/null 2>&1 && run=(devq "${run[@]}")
"${run[@]}" >/tmp/drift-premerge-$$.log 2>&1
if grep -q "did not start" /tmp/drift-premerge-$$.log || ! grep -q "^play check" /tmp/drift-premerge-$$.log; then tail -5 /tmp/drift-premerge-$$.log; echo "premerge: STOP, the game page does not start"; rm -rf /tmp/drift-premerge-$$.log /tmp/drift-premerge-playcheck-$$; exit 1; fi
grep -E "^play check|^PROBLEM" /tmp/drift-premerge-$$.log | sed 's/^/premerge:   /'
rm -rf /tmp/drift-premerge-$$.log /tmp/drift-premerge-playcheck-$$
echo "premerge: ok (the page loads; findings above, if any, are for the release check)"
