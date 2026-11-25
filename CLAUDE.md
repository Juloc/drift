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
