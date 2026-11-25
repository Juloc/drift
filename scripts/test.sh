#!/usr/bin/env bash
# Runs the tests. The database tests need a PostgreSQL: with BASE_TEST_DB set, that one is used; otherwise a throwaway
# PostgreSQL is started in Docker on a free local port and removed again at the end (TEST-01).
# Usage: scripts/test.sh [arguments for dotnet test]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${BASE_TEST_DB:-}" ]; then
  name="drift-test-pg-$$"
  docker run -d --rm --name "$name" -e POSTGRES_DB=base -e POSTGRES_USER=base -e POSTGRES_PASSWORD=test-throwaway \
    -p 127.0.0.1::5432 postgres:18 >/dev/null
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
  port="$(docker port "$name" 5432/tcp | head -n1 | sed 's/.*://')"
  for _ in $(seq 1 60); do
    docker exec "$name" pg_isready -U base -d base >/dev/null 2>&1 && break
    sleep 0.5
  done
  export BASE_TEST_DB="Host=127.0.0.1;Port=$port;Database=base;Username=base;Password=test-throwaway"
fi

dotnet test --project tests/Drift.Tests/Drift.Tests.csproj "$@"
