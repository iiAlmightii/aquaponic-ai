# Supabase Connection Runbook (AquaponicAI)

This file records exactly what was changed and why, so future sessions can restore or debug Supabase connectivity quickly.

## Current Working State

- Backend is running and healthy on Supabase.
- Active DB endpoint in container:
  - Host: aws-1-ap-south-1.pooler.supabase.com
  - Port: 6543
- Signup endpoint works through nginx path /api/v1/auth/register.

## Root Causes Encountered

1. URL parsing issues due to special characters in DB password.
2. asyncpg incompatibility with sslmode query parameter.
3. Supabase pooler + asyncpg prepared statement conflict.
4. Intermittent TCP timeout to pooler during startup retries.
5. Frontend Network Error due to API base/origin/CORS mismatch.

## Changes Made

### 1) Docker Compose DATABASE_URL override support

File: docker-compose.yml

- Backend environment DATABASE_URL changed to use env override with fallback:
  - DATABASE_URL: ${DATABASE_URL:-postgresql+asyncpg://aquaponic:${POSTGRES_PASSWORD:-secret}@postgres:5432/aquaponic_db}

Why:
- Ensures .env DATABASE_URL (Supabase) is actually used at runtime.

### 2) Supabase DATABASE_URL formatting fixes

File: .env

- Kept Supabase pooler host in DATABASE_URL.
- URL-encoded special password characters in DB password.
- Used asyncpg-compatible SSL query key:
  - ssl=require
- Included prepared statement cache setting in URL:
  - prepared_statement_cache_size=0

Working pattern:
- postgresql+asyncpg://<user>:<url-encoded-password>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?ssl=require&prepared_statement_cache_size=0

### 3) SQLAlchemy asyncpg pooler compatibility

File: backend/core/database.py

- Added Supabase pooler detection when DATABASE_URL contains pooler.supabase.com.
- For pooler mode:
  - Use NullPool
  - connect_args statement_cache_size=0
  - connect_args prepared_statement_name_func with unique UUID names

Why:
- Prevent DuplicatePreparedStatementError with pgbouncer transaction pooler.

### 4) Schema rerun safety for Supabase SQL Editor

File: infra/schema.sql

- Made schema idempotent for reruns:
  - Enum creation wrapped in DO blocks with duplicate_object handling
  - CREATE TABLE IF NOT EXISTS
  - CREATE INDEX IF NOT EXISTS
  - Trigger creation guarded by pg_trigger checks

Why:
- Avoid failures like "type already exists" when rerunning schema.

### 5) Frontend Network Error fix (signup/login API path)

File: frontend/src/app/utils/api.js

- API base fallback updated:
  - If app is served from proxy origin (port 80/443/no explicit port), use same-origin /api/v1
  - Else use host:8000 fallback

Why:
- Prevent frontend from choosing the wrong API base in proxied deployments.

### 6) CORS secure localhost support

File: .env

- Expanded ALLOWED_ORIGINS to include https localhost variants.

Why:
- Prevent OPTIONS preflight rejection for secure localhost origins.

## Verification Commands

Run from project root.

1. Rebuild and run:

- docker compose up -d --build

2. Check service status:

- docker compose ps

3. Backend health:

- curl -fsS http://localhost:8000/health

4. Verify active DB target in backend container:

- docker compose exec -T backend python - <<'PY'
import os
u=os.getenv('DATABASE_URL','')
print('SUPABASE' if 'supabase.com' in u else 'LOCAL')
print(u.split('@',1)[1].split('/',1)[0] if '@' in u else 'UNPARSEABLE')
PY

5. Verify signup path via nginx:

- curl -i -X POST http://localhost/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"test@example.com","full_name":"Test","password":"Password123!"}'

## Fast Troubleshooting Matrix

If backend restart loop shows TimeoutError:

- Check DNS:
  - getent hosts aws-1-ap-south-1.pooler.supabase.com
- Check TCP from host/container:
  - python socket connect test to host:6543
- If intermittent, retry startup once network stabilizes.

If backend shows DuplicatePreparedStatementError:

- Confirm backend/core/database.py still has Supabase pooler-specific engine args:
  - NullPool
  - statement_cache_size=0
  - prepared_statement_name_func

If browser shows Network Error on signup:

- Confirm frontend/src/app/utils/api.js has same-origin /api/v1 fallback for proxy origins.
- Confirm ALLOWED_ORIGINS includes current protocol/host/port.
- Rebuild frontend + restart nginx:
  - docker compose up -d --build frontend backend
  - docker compose restart nginx

## Security Notes

- Rotate any keys/passwords that were exposed in chat/screenshots.
- Keep service role key server-only.
- Do not commit .env to git.

## Files Touched During This Work

- docker-compose.yml
- .env
- backend/core/database.py
- infra/schema.sql
- frontend/src/app/utils/api.js

