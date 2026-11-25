# Drift

One container plus PostgreSQL, built on the shared base (version 0.3.4, a copy in `base/`).

## Start

```bash
docker compose up -d --build
```

```bash
docker compose logs app
```

Open `http://localhost:8080`. At the first start the setup assistant asks for the setup code from the log, then creates the first account
(password, authenticator app, recovery codes). There is nothing to configure in files: the Compose file has no variables, settings live in the app.

Everything that must be kept is in the one volume `data` (database, the server's key file, the database password). Back up that volume.

For anything but this machine, put a reverse proxy with HTTPS in front and set its address in the app (Settings, Installation, trusted proxies).

## Develop

- Rules: [CLAUDE.md](CLAUDE.md) and [base/RULES.md](base/RULES.md).
- The app's own code is in `src/Drift/`; `base/` is a copy of the base and is not edited here.
- The parts of the interface with their code: `http://localhost:8080/base/catalog.html`.
- Run without Docker: a PostgreSQL, then `BASE_DB="Host=...;Database=...;Username=...;Password=..." dotnet run --project src/Drift`.
