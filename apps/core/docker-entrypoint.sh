#!/bin/sh
set -eu

# Only the main API process applies migrations. The cache worker, collection
# file inspector, and media processor use a different start command and must
# not race another `migrate deploy` against the same database on restart.
if [ "$1" = "node" ] && [ "$2" = "dist/main.js" ]; then
  node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
fi

exec "$@"
