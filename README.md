# Drift

A small online drift game with an open lobby, built on the shared base of the app family (version 0.3.4, a copy in `base/`).
Sign in (own account, or through the hub), pick a car, a colour and a nickname in the garage, press Drive: everyone who is signed in
drives around the same car park and sees the others live.

## Start

```bash
docker compose up -d --build
```

```bash
docker compose logs app
```

Open `http://localhost:8080`. At the first start the setup assistant asks for the setup code from the log, then creates the first account
(password, authenticator app, recovery codes). There is nothing to configure in files: the Compose file has no variables, settings live in the app.
Everything that must be kept is in the one volume `data`. For anything but this machine, put a reverse proxy with HTTPS in front and set its
address in the app (Settings, Installation, trusted proxies).

## What is where

| | |
|---|---|
| `src/Drift/` | the app: garage (`Garage/`), the lobby socket (`Play/`), pages (`wwwroot/`), SQL (`Migrations/`) |
| `game/`, `vendor/three/` | the game page: static files, no build; also the public demo of the website |
| `server/Relay/` | the shared-world relay, one small class (also used by the website's server) |
| `server/` | a tiny local server for the public demo without database: `dotnet run --project server` |
| `tests/Drift.Tests/` | `scripts/test.sh`; the game's logic: `node --test game/` |
| `docs/` | SCOPE, ARCHITECTURE, STATE (read these first), ASSETS, IDEAS |
| `tools/` | headless play, measuring, load and account scripts |

## Develop

- Rules: [CLAUDE.md](CLAUDE.md) and [base/RULES.md](base/RULES.md).
- Run without Docker: a PostgreSQL, then `BASE_DB="Host=...;Database=...;Username=...;Password=..." dotnet run --project src/Drift` (the game files are found in the repository).
- Throwaway accounts for trying it: `node tools/dev-people.mjs <url> <setup code> <name> ...` and `node tools/account-run.mjs <url> <cookies.json>`.
