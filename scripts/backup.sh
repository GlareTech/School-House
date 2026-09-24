#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="backups/school-$stamp.dump"
uploads="backups/school-$stamp-uploads.tar.gz"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file"
test -s "$file"
mkdir -p data/uploads
tar -czf "$uploads" -C data uploads
echo "Backup saved: $file and $uploads. Keep both together in protected off-server storage."
