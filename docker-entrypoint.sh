#!/bin/sh
set -e

echo "==> [autonomous-api] Starting container initialization..."

# Run database migrations if enabled
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -n "$DATABASE_URL" ]; then
    echo "==> [autonomous-api] DATABASE_URL detected. Running Prisma migrations..."
    
    # Wait for database availability (up to 30 attempts, 1s interval)
    MAX_RETRIES=30
    RETRY_COUNT=0
    
    echo "==> [autonomous-api] Verifying database connectivity..."
    until node -e "
      import('pg').then(({ default: pg }) => {
        const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
        client.connect()
          .then(() => { client.end(); process.exit(0); })
          .catch(() => process.exit(1));
      }).catch(() => process.exit(1));
    " 2>/dev/null || [ $RETRY_COUNT -ge $MAX_RETRIES ]; do
      RETRY_COUNT=$((RETRY_COUNT + 1))
      echo "==> [autonomous-api] Waiting for PostgreSQL ($RETRY_COUNT/$MAX_RETRIES)..."
      sleep 1
    done

    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
      echo "==> [autonomous-api] Warning: Database connectivity check timed out. Attempting migration anyway..."
    else
      echo "==> [autonomous-api] Database is reachable!"
    fi

    # Run prisma migrate deploy
    if pnpm exec prisma migrate deploy 2>/dev/null || npx prisma migrate deploy; then
      echo "==> [autonomous-api] Prisma migrations applied successfully."
    else
      echo "==> [autonomous-api] Warning: Migration deploy failed or no migrations pending. Continuing startup..."
    fi
  else
    echo "==> [autonomous-api] DATABASE_URL is not set. Skipping migrations."
  fi
else
  echo "==> [autonomous-api] RUN_MIGRATIONS is disabled. Skipping migrations."
fi

echo "==> [autonomous-api] Executing application command: $@"
exec "$@"
