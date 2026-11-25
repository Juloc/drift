# Drift

A small online **drift racing game** for the browser: you arrive in an open lobby with everybody who is online, drift around, start a race on the spot, and chase points for angle, speed and chains. Built with three.js (no build step in the browser) and an ASP.NET Core server with PostgreSQL.

**State: a preview, not a release.** It runs and is tested, but it is still being made; nothing here is final (the look, the cars, the numbers). Sign-up for strangers is **closed on purpose** until the owner's privacy and imprint texts are in. There is no public server to point you at yet.

What exists so far:

- the driving model (2D, with real tyre slip: grip, slide, handbrake, counter-steer aid; an *Arcade* and a *Pro* feel), five cars, five maps, drift score with chains;
- the open lobby (64 players in a world, interest areas so far cars cost little), races with a grid, laps, results and boards (with the feel they were set with), time trial;
- tandem drifting (bonus for two cars sliding together, a practice bot), challenges with stars, collision and damage, controller, three cameras, engine and tyre sound made in the browser, a creative mode without scores;
- the *Juloc Games* account (name and password, open registration with protection once the legal texts are in), guests through links, an administrator's page;
- model-file loading for real car models (`docs/CAR-MODELS.md`); the cars you see now are built in code.

## Try it

You need Docker. Everything the server keeps lives in one volume; the Compose file has no variables and no secrets (the database password is made at the first start).

```bash
docker compose up -d --build
docker compose logs app          # the setup code for the first account
```

Open `http://localhost:8080`, enter the setup code, make the first account (it becomes the administrator), pick a car in the garage and press *Drive*. Sign-up of strangers stays closed (the log says so); guest links (Settings) let a friend in.

Without Docker and without accounts, the game alone with the shared lobby of a tiny local server:

```bash
dotnet run --project server -- --port 8150      # then open http://127.0.0.1:8150/game/demo.html
```

or only the static game page (driving alone, no network): serve the repository folder with any static server and open `game/index.html`.

## Tests

```bash
scripts/test.sh          # the server: starts a throwaway PostgreSQL in Docker
node --test game/ tests/js   # the game's own logic, no packages
```

## What is where

| | |
|---|---|
| `src/Drift/` | the app: accounts, garage, lobby and race sockets, boards, challenges, pages (`wwwroot/`), SQL (`Migrations/`) |
| `game/`, `vendor/three/` | the game page: plain static files, no build; `game/sim/` is the pure driving, scoring, tandem and collision logic |
| `server/Relay/` | the shared-world relay, one small class |
| `deploy/stack/` | the production Compose file; `.github/workflows/` builds the image |
| `base/` | a copy of the shared base the app is built on (never edited here) |
| `docs/` | `VISION.md`, `ROADMAP.md`, `STATE.md` (where things stand, with numbers and what was not checked), `ARCHITECTURE.md`, `ASSETS.md` |
| `tools/` | headless play, measuring, load tests, model export, a Blender check script |

## Licences and credits

- **three.js** 0.186.0 is used under the **MIT licence**, vendored in `vendor/three/` with its licence file and checksums (`vendor/README.md`).
- Other libraries: Npgsql (PostgreSQL License), Konscious.Security.Cryptography.Argon2 (MIT), .NET and PostgreSQL (see the list).
- **Cars, maps and sounds are our own work**: the models are built in code, the sounds are made in the browser. No outside model, picture or sound file is in the repository yet. Every outside asset will be listed with author, source and licence in [`game/data/credits.json`](game/data/credits.json) (the game's *Credits* page shows that file) and [`docs/ASSETS.md`](docs/ASSETS.md) **before** it is committed.
- Real car names and logos: the owner states that he holds the licences; they are not used in the repository yet.
- **The code has no licence file yet.** The owner has not decided; until he does, all rights are reserved, which means looking is welcome, copying is not. This README will say so when it changes.

Contributions are not being taken at the moment.
