#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.production"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.production.example and fill in values."
  exit 1
fi

# Auto-generate secrets where value is "change_this"
generate_if_needed() {
  local key="$1"
  local current
  current=$(grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2-)
  if [ "$current" = "change_this" ]; then
    local secret
    secret=$(openssl rand -hex 64)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=change_this|${key}=${secret}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=change_this|${key}=${secret}|" "$ENV_FILE"
    fi
    echo "Generated $key"
  fi
}

generate_if_needed DB_PASSWORD
generate_if_needed JWT_ACCESS_SECRET
generate_if_needed JWT_REFRESH_SECRET

# Swap Prisma schema to production (PostgreSQL)
echo "Swapping Prisma schema to production..."
cp backend/prisma/schema.production.prisma backend/prisma/schema.prisma

# Load env
set -a; source "$ENV_FILE"; set +a

# Build & start
echo "Building Docker images..."
docker compose build

echo "Starting services..."
docker compose up -d

echo "Waiting for DB..."
sleep 10

echo "Running Prisma migrations..."
docker compose exec backend sh -c "npx prisma db push --accept-data-loss"

echo "Seeding database..."
docker compose exec backend sh -c "node -e \"require('./dist/prisma/seed.js')\"" || true

echo ""
echo "✓ Deploy complete"
echo "  Backend:  http://localhost:4000/api/health"
echo "  Frontend: http://localhost:80"
echo ""
echo "  Admin login: admin@dotpe.in / Admin@dotpe1"
echo "  (Change this password immediately in Admin → Users)"
