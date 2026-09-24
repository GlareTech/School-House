#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then cp .env.example .env; echo 'Created .env. Set passwords and your LAN origin, then run again.'; exit 1; fi
docker compose up -d --build
docker compose ps
echo 'Open the configured server address (default http://localhost:8080).'
