# AquaponicAI Quickstart

This guide gives you the fastest path to run the project.

## Option 1: Run everything with Docker (recommended)

### 1. Prerequisites
- Docker
- Docker Compose plugin

Check:

```bash
docker --version
docker compose version
```

### 2. Prepare environment file
From project root:

```bash
cp .env.example .env
```

Edit .env and set at least:
- POSTGRES_PASSWORD
- SECRET_KEY
- JWT_SECRET_KEY

Generate secure secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Paste one value into SECRET_KEY and one into JWT_SECRET_KEY.

### 3. Start services

```bash
docker compose up --build
```

If you want it in background:

```bash
docker compose up -d --build
```

### 4. Open the app
- App (via Nginx): http://localhost
- Frontend (direct): http://localhost:3001
- Backend API docs: http://localhost:8000/api/docs

Docker host-mapped data service ports:
- PostgreSQL: localhost:5433
- Redis: localhost:6380

### 5. Stop services

```bash
docker compose down
```

Reset all DB/cache volumes if needed:

```bash
docker compose down -v
```

### 6. Optional: install Whisper in backend container

Whisper is optional in Docker builds to improve reliability on slow networks.

```bash
docker compose exec backend pip install openai-whisper==20231117
```

---

### 7. Optional: Enable Google Sheets finance sync
The app can push financial planning inputs to Google Sheets and poll for changes to update charts in near real-time.

1. Create a Google Sheet with tabs `Inputs`, `Assumptions`, `Projections`, `Summary`, `AuditLog`.
2. Create a Google Cloud service account, download its JSON key, and set:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` (or split `GOOGLE_SHEETS_CLIENT_EMAIL` + `GOOGLE_SHEETS_PRIVATE_KEY`)
3. Enable the frontend polling UI with `VITE_GOOGLE_SHEETS_ENABLED=true`.

---
## Option 2: Run locally (without Docker)

### 1. Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### 2. Create and configure .env
If not already done:

```bash
cp .env.example .env
```

For local Postgres and Redis, set these values in .env:

```env
DATABASE_URL=postgresql+asyncpg://aquaponic_user:123456@localhost:5432/aquaponic_ai
REDIS_URL=redis://localhost:6379/0
DEFAULT_LLM_PROVIDER=local
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
WEATHER_API_KEY=
MARKET_API_KEY=
```

Notes:
- You can leave paid API keys blank and the core app still runs.
- Your database must already exist (example: aquaponic_ai).

### 3. Start backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend is available at:
- http://localhost:8000
- Docs: http://localhost:8000/api/docs

### 4. Start frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173).

---

## Free and open-source setup notes
- Speech-to-text: Whisper is optional in Docker builds. You can install it later with:

```bash
docker compose exec backend pip install openai-whisper==20231117
```

- No API key is required for local Whisper.
- LLM: set DEFAULT_LLM_PROVIDER=local if you do not want paid providers.
- Weather/market keys are optional for basic run.

---

## Common issues

### Database connection refused
- Confirm PostgreSQL is running on localhost:5432.
- Confirm username/password in DATABASE_URL are correct.
- Confirm database aquaponic_ai exists.

### Redis connection error
- Start Redis locally or use Docker Redis.
- Verify REDIS_URL in .env.

### Frontend cannot call backend
- Confirm backend is running on port 8000.
- Confirm VITE_API_URL in .env points to http://localhost:8000/api/v1.

---

## One-command health checks

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/docs
```

If health returns a JSON response with status healthy, backend startup is successful.
