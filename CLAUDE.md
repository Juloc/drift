# drift: working rules

An app of the owner's family: a small online drift game with an open lobby, where the people who are signed in see each other drive and can start a race on the spot. Built on the shared base of the app family (not started from it yet).

1. **Scope first.** Read [docs/SCOPE.md](docs/SCOPE.md) and [docs/STATE.md](docs/STATE.md) before starting. One milestone is open at a time; a new idea goes into `docs/IDEAS.md`, not into code. Update `docs/STATE.md` at the end of your work.
2. **Design before code:** `docs/ARCHITECTURE.md` (how cars move, what goes over the wire and how often, who decides the result of a race, the lobby, guests) is written and read by the orchestrator before any server code.
3. **It must feel good on a phone first.** Every change is played at phone size before it is called done; numbers (frame time, triangles, draw calls, bytes per second on the wire) are written down.
4. **Every app of the family works alone.** The hub adds one sign-in; without it the app has its own accounts and guest links.
5. **Nothing private in the repository:** no real name, address, domain or account, also not in tests and pictures. Examples are made up.
6. **Own models and own code first.** three.js is vendored as on the website; any outside asset needs its source and licence in `docs/ASSETS.md` before a file of it is committed.
7. **Small and readable**, plain SQL, no build step in the browser.
8. **Say what was not checked.** Report to the owner in German, short; files in English.
9. **Releases, the GitHub repository and the deployment are the orchestrator's** and need the owner's yes. No push.

## Built on the base (since milestone 2)

The app is `src/Drift/` on the shared base: base version **0.3.4**, a copy in `base/` that is never edited here (CODE-07; `~/projects/base/scripts/check-app.sh .` shows drift). The rulebook is [base/RULES.md](base/RULES.md); cite its numbers (`AUTH-03`) in comments and reviews.

- The colour of the app is one variable, `--accent-hue` in `src/Drift/wwwroot/app.css` (COLOR-01), the same number as `AccentHue` in `Program.cs`. Every text of the app pages goes through `t()` in German and English (I18N-01); the server answers failures with a code that has a text (I18N-02). Look at the catalogue (`/base/catalog.html`) before building a part of the interface.
- Endpoints under `/api` are behind the guard (SEC-03, SEC-04): the person comes from `ctx.Person()`, input goes through a `Validator`, every SQL statement names the owner (DATA-03), schema changes are a new numbered script in `src/Drift/Migrations/` (DATA-02). No new runtime packages, no build step in the browser, no variables in the Compose file (CODE-02, CODE-06, OPS-02).
- The game page (`game/`, `vendor/three/`) is plain static files with no inline script or style (SEC-02); the app serves them under `/play` and `/vendor/three` and has its own `play/index.html` and `play/boot.js` in `wwwroot`. The relay (`server/Relay/`) is one small class shared with the website's server: keep its frames compatible.
- Tests: `scripts/test.sh` (starts a throwaway PostgreSQL in Docker and runs `tests/Drift.Tests`); `node --test game/` for the game's own logic.
