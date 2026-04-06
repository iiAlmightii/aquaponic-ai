# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Docker (recommended)
```bash
# Start all services
docker compose up --build

# Stop services
docker compose down

# Reset all data (including volumes)
docker compose down -v
```

### Backend (local)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (local)
```bash
cd frontend
npm install
npm run dev       # Starts on http://localhost:5173
npm run build
```

### Tests
```bash
cd backend
pytest                                          # All tests
pytest --cov=. --cov-report=html               # With coverage
pytest tests/test_financial_service.py -v      # Single file
pytest -k "not Endpoint"                       # Unit tests only (no DB required)
```

API docs available at `http://localhost:8000/api/docs` when backend is running.

## Architecture

### System Overview

```
React 18 (Vite) + Zustand + Web Speech API
         ↓ HTTP/REST
FastAPI (Python 3.12) + Async SQLAlchemy
         ↓
PostgreSQL 16 + Redis 7
```

### Backend Structure

- `backend/main.py` — FastAPI entry point; middleware, CORS, router registration
- `backend/core/` — `config.py` (Pydantic settings), `database.py`, `redis_client.py`
- `backend/models/__init__.py` — All SQLAlchemy ORM models defined here
- `backend/services/` — Business logic (no DB access in controllers):
  - `financial_service.py` — CAPEX/OPEX/ROI/IRR/NPV calculator with base/pessimistic/optimistic scenarios
  - `questionnaire_engine.py` — Dynamic Q&A engine with skip logic
  - `auth_service.py` — JWT + bcrypt authentication
  - `voice_interpretation.py` — Voice answer parsing and confirmation
  - `google_sheets_financial_sync.py` — Sheets export for aquaponic financials
  - `land_farm_survey_engine.py`, `land_financial_service.py`, `land_sheet_sync.py` — Land farming variant
- `backend/routers/` — Thin API layer; each router maps to a service domain

### Frontend Structure

- `frontend/src/app/` — Feature-based React components (auth, surveys, dashboard, farms, reports)
- `frontend/src/app/store/index.js` — Zustand global state
- `frontend/src/app/utils/api.js` — Axios instance with JWT interceptors
- `frontend/src/app/hooks/useVoiceRecorder.js` — Web Speech API wrapper

### Key Data Flows

**Voice Survey → Financial Report:**
1. `POST /api/v1/session/start` → returns first question
2. User speaks/types → `POST /api/v1/session/answer` (per question)
3. `QuestionnaireEngine` validates and advances session; JSONB `context_data` accumulates answers
4. On completion → `FinancialCalculator.create_plan()` generates three scenario projections
5. LLM (Anthropic/OpenAI) generates recommendations
6. `GET /api/v1/report/{sessionId}` → PDF via ReportLab

**IoT Data Ingestion:** `POST /api/v1/iot/ingest` → `water_readings` table (ph, temperature, DO, ammonia)

### Database Design

- UUID PKs throughout; `updated_at` auto-managed by PostgreSQL triggers
- `sessions.context_data` and `financial_plans.scenarios` use JSONB (GIN indexed) for flexible schemas
- Three-scenario financial output stored as JSONB: `base`, `pessimistic` (-20% revenue), `optimistic` (+20% revenue)
- Schema initialized from `infra/schema.sql` (not Alembic migrations — apply via `psql` or Docker init)

## Environment Variables

Copy `.env.example` to `.env`. Required variables:

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | General app secret (32+ hex chars) |
| `JWT_SECRET_KEY` | JWT signing key |
| `POSTGRES_PASSWORD` | Database password |
| `DATABASE_URL` | Full asyncpg connection string |
| `REDIS_URL` | Redis connection string |
| `DEFAULT_LLM_PROVIDER` | `anthropic` \| `openai` \| `local` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | LLM credentials (optional) |
| `VITE_API_URL` | Frontend API base URL (e.g. `http://localhost:8000/api/v1`) |

For Google Sheets integration, see `GOOGLE_SHEETS_SETUP.md`. For GPU/Whisper STT, set `STT_PROVIDER=whisper` and `FASTER_WHISPER_DEVICE=cuda`.

## Docker Services

| Service | Port | Purpose |
|---|---|---|
| `backend` | 8000 | FastAPI application |
| `frontend` | 3001 | React app (via Nginx) |
| `nginx` | 80/443 | Reverse proxy (`/api` → backend, `/` → frontend) |
| `postgres` | 5433 | PostgreSQL 16 |
| `redis` | 6380 | Redis 7 |
| `adminer` | 8080 | Database GUI |
