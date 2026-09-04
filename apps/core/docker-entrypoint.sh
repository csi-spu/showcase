#!/bin/sh
set -eu

# Only the main API process applies migrations. The cache-worker and
# media-processor Coolify resources run the same image with a different
# start command and must not race a second `migrate deploy` against the
# same database on every restart.
if [ "$1" = "node" ] && [ "$2" = "dist/main.js" ]; then
  node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
fi

exec "$@"
