# 🐟 AquaponicAI — Intelligent Farm Management Platform

> AI-driven production management and financial planning for aquaponic farms.
> Voice-first questionnaire → real-time analysis → PDF reports.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Folder Structure](#2-folder-structure)
3. [Database Schema](#3-database-schema)
4. [API Reference](#4-api-reference)
5. [Setup & Running Locally](#5-setup--running-locally)
6. [Running with Docker](#6-running-with-docker)
7. [Running Tests](#7-running-tests)
8. [Environment Variables](#8-environment-variables)
9. [Key Design Decisions](#9-key-design-decisions)
10. [Roadmap](#10-roadmap)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                           │
│   React 18 SPA (Vite)  ·  PWA  ·  Voice (Web Speech API)          │
│   Recharts  ·  Framer Motion  ·  Tailwind CSS  ·  Zustand          │
└────────────────────────────┬────────────────────────────────────────┘
                             │  HTTP / REST
┌────────────────────────────▼────────────────────────────────────────┐
│                       APPLICATION LAYER                              │
│                                                                      │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │  Auth Service│  │ Session Manager │  │  Questionnaire Engine │  │
│  │  JWT / bcrypt│  │  Redis-backed   │  │  Dynamic skip logic   │  │
│  └──────────────┘  └─────────────────┘  └───────────────────────┘  │
│                                                                      │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │  Financial   │  │  AI / LLM       │  │  Report Generator     │  │
│  │  Planning    │  │  Pluggable      │  │  PDF (ReportLab)      │  │
│  │  Calculator  │  │  Anthropic/OAI  │  │  JSON export          │  │
│  └──────────────┘  └─────────────────┘  └───────────────────────┘  │
│                                                                      │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │ Farm Service │  │ Weather API     │  │  IoT Webhook Ingestion│  │
│  │ CRUD + batch │  │ OpenWeatherMap  │  │  MQTT / HTTP sensors  │  │
│  └──────────────┘  └─────────────────┘  └───────────────────────┘  │
│                                                                      │
│  FastAPI (Python 3.12)  ·  Async SQLAlchemy  ·  Pydantic v2        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                          DATA LAYER                                  │
│  PostgreSQL 16 (primary)   Redis 7 (cache/sessions)                 │
│  Local / S3 (reports)      Alembic (migrations)                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Request Lifecycle — Voice Survey

```
User speaks → Web Speech API → transcript text
    → POST /session/answer { answer_text, input_method: "voice" }
    → QuestionnaireEngine.parse_answer()
    → SessionAnswer persisted → context_data updated
    → GET next question → frontend animates transition

Session complete → POST /analysis/{sessionId}
    → FinancialService.create_plan()
    → FinancialCalculator (base + pessimistic + optimistic)
    → Rule-based recommendations → FinancialPlan persisted
    → Frontend renders charts + recommendations
```

---

## 2. Folder Structure

```
aquaponic-ai/
├── .env.example                    ← copy to .env, fill secrets
├── docker-compose.yml              ← full stack orchestration
│
├── backend/
│   ├── main.py                     ← FastAPI app, middleware, routers
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── pytest.ini
│   │
│   ├── core/
│   │   ├── config.py               ← pydantic-settings (all env vars)
│   │   ├── database.py             ← async SQLAlchemy engine + session
│   │   └── redis_client.py         ← aioredis connection
│   │
│   ├── models/
│   │   └── __init__.py             ← all ORM models (User, Farm, Session…)
│   │
│   ├── routers/
│   │   ├── auth.py                 ← /auth/register, /login, /me
│   │   ├── session.py              ← /session/start, /answer, /{id}
│   │   ├── analysis.py             ← /analysis/{sessionId}
│   │   ├── report.py               ← /report/{sessionId}
│   │   ├── farm.py                 ← /farm CRUD
│   │   └── iot.py                  ← /iot/ingest, /devices
│   │
│   ├── services/
│   │   ├── auth_service.py         ← JWT, bcrypt, user resolution
│   │   ├── financial_service.py    ← CAPEX/OPEX/ROI/IRR/NPV engine
│   │   └── questionnaire_engine.py ← dynamic Q&A + skip logic
│   │
│   └── tests/
│       ├── test_financial_service.py
│       └── test_auth.py
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js              ← Vite + PWA plugin
│   ├── tailwind.config.js          ← custom aquaponic palette
│   ├── package.json
│   ├── Dockerfile                  ← multi-stage: Node build → Nginx
│   ├── nginx-spa.conf
│   │
│   └── src/
│       ├── main.jsx                ← ReactDOM root
│       ├── App.jsx                 ← router (public + protected)
│       │
│       ├── styles/
│       │   └── globals.css         ← Tailwind + custom CSS layers
│       │
│       ├── store/
│       │   └── index.js            ← Zustand (auth + session + UI slices)
│       │
│       ├── utils/
│       │   └── api.js              ← axios instance + interceptors
│       │
│       ├── hooks/
│       │   └── useVoiceRecorder.js ← Web Speech API abstraction
│       │
│       ├── components/
│       │   ├── AppShell.jsx        ← sidebar nav + header + outlet
│       │   └── ui/
│       │       └── ToastContainer.jsx
│       │
│       └── pages/
│           ├── LoginPage.jsx       ← auth screens (Login + Register)
│           ├── RegisterPage.jsx
│           ├── DashboardPage.jsx   ← KPI cards + Recharts
│           ├── QuestionnairePage.jsx ← voice survey stepper
│           ├── AnalysisPage.jsx    ← financial analysis + scenario charts
│           ├── FarmPage.jsx        ← fish/crop/water tables
│           └── ReportsPage.jsx     ← report history + download
│
└── infra/
    ├── schema.sql                  ← full PostgreSQL schema
    └── nginx.conf                  ← reverse proxy config
```

---

## 3. Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Authentication, roles (admin/farmer/viewer) |
| `farms` | Farm metadata, geolocation, system type |
| `fish_batches` | Fish species, tank volume, feed, harvest cycle |
| `crop_records` | Crop type, growing area, yield tracking |
| `water_readings` | IoT + manual pH, DO, temperature, ammonia… |
| `sessions` | Questionnaire sessions with JSONB context |
| `session_answers` | Per-question answers with voice confidence scores |
| `financial_plans` | Full CAPEX/OPEX/revenue breakdown + AI metrics |
| `reports` | Report file metadata, download tracking |
| `iot_devices` | Registered IoT sensors per farm |
| `market_prices` | Commodity price cache (fish, crops) |

**Key design choices:**
- UUIDs for all primary keys (no sequential ID leakage)
- JSONB for session `context_data` and `scenarios` (flexible, queryable)
- PostgreSQL triggers auto-update `updated_at` on all mutable tables
- `pg_trgm` extension for future fuzzy search on farm/species names

---

## 4. API Reference

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Create account | No |
| POST | `/api/v1/auth/login` | Get JWT tokens | No |
| POST | `/api/v1/auth/refresh` | Refresh access token | Refresh token |
| GET  | `/api/v1/auth/me` | Get current user | Bearer |

**Register Request:**
```json
{
  "email": "farmer@example.com",
  "full_name": "Priya Sharma",
  "password": "securepassword123"
}
```

**Login Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

---

### Session / Questionnaire

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/session/start` | Begin new survey session |
| POST | `/api/v1/session/answer` | Submit answer, get next question |
| GET  | `/api/v1/session/{id}` | Retrieve session state |
| DELETE | `/api/v1/session/{id}` | Abandon session |

**Start Session Response:**
```json
{
  "session_id": "uuid",
  "status": "in_progress",
  "current_question": {
    "id": "farm_name",
    "text": "What is the name of your farm or project?",
    "type": "text",
    "options": [],
    "unit": null,
    "hint": "E.g. 'Green Valley Aquaponics'",
    "category": "setup"
  },
  "progress_answered": 0,
  "progress_total": 27,
  "context": { "answered": [], "answers": {} }
}
```

**Answer Request:**
```json
{
  "session_id": "uuid",
  "question_id": "farm_name",
  "answer_text": "Green Valley Aquaponics",
  "input_method": "voice",
  "confidence_score": 0.94
}
```

---

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analysis/{sessionId}` | Get or compute financial analysis |

**Analysis Response (abbreviated):**
```json
{
  "session_id": "uuid",
  "farm_answers": { "fish_species": ["Tilapia"], "tank_volume": 2000, ... },
  "financial_plan": {
    "id": "uuid",
    "total_capex": 500000,
    "total_opex_annual": 360000,
    "total_revenue_annual": 660000,
    "roi_percent": 60.0,
    "payback_period_months": 20.0,
    "break_even_month": 20,
    "scenarios": {
      "base":        { "roi_percent": 60.0, "cash_flows": [...] },
      "pessimistic": { "roi_percent": 21.0, "cash_flows": [...] },
      "optimistic":  { "roi_percent": 98.0, "cash_flows": [...] }
    },
    "ai_recommendations": [
      {
        "category": "Cost Reduction",
        "priority": "high",
        "title": "High feed cost ratio",
        "detail": "Feed costs represent 40%…"
      }
    ]
  }
}
```

---

### Reports & Farm

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/report/{sessionId}` | Download PDF report |
| GET | `/api/v1/farm/` | List user's farms |
| POST | `/api/v1/farm/` | Create farm |
| POST | `/api/v1/iot/ingest/{deviceUid}` | IoT sensor webhook |
| GET | `/api/v1/iot/devices` | List registered IoT devices |

---

## 5. Setup & Running Locally

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7

### Backend

```bash
cd backend

# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp ../.env.example ../.env
# Edit .env — set DATABASE_URL, JWT_SECRET_KEY, etc.

# 4. Create database
createdb aquaponic_db
psql aquaponic_db < ../infra/schema.sql

# 5. Start development server
uvicorn main:app --reload --port 8000

# API docs at: http://localhost:8000/api/docs
```

### Frontend

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment
echo "VITE_API_URL=http://localhost:8000/api/v1" > .env.local

# 3. Start dev server
npm run dev

# App at: http://localhost:3000
```

---

## 6. Running with Docker

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — set secure passwords and API keys

# 2. Build and start all services
docker compose up --build

# 3. Services
#   Frontend:   http://localhost:3000
#   Backend:    http://localhost:8000/api/docs
#   Via Nginx:  http://localhost:80

# 4. Stop
docker compose down

# 5. Stop + wipe volumes (reset all data)
docker compose down -v
```

**Services started by docker-compose:**
| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL 16 + auto-migrated schema |
| `redis` | 6379 | Redis 7 (session cache) |
| `backend` | 8000 | FastAPI (4 Uvicorn workers) |
| `frontend` | 3000 | React SPA via Nginx |
| `nginx` | 80, 443 | Reverse proxy + rate limiting |

---

## 7. Running Tests

```bash
cd backend

# All tests
pytest

# With coverage
pytest --cov=. --cov-report=html

# Specific test file
pytest tests/test_financial_service.py -v

# Just unit tests (fast, no DB required)
pytest tests/test_financial_service.py -v -k "not Endpoint"
```

**Test coverage targets:**
- Financial Calculator: ~95% (pure functions, fully testable)
- Questionnaire Engine: ~90%
- Auth integration: ~80% (requires test DB)

---

## 8. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | ✅ | — | App secret (32+ chars) |
| `JWT_SECRET_KEY` | ✅ | — | JWT signing secret |
| `DATABASE_URL` | ✅ | — | AsyncPG connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `ANTHROPIC_API_KEY` | ⬜ | — | For LLM recommendations |
| `OPENAI_API_KEY` | ⬜ | — | Alternative LLM provider |
| `FASTER_WHISPER_MODEL` | ⬜ | `large-v3` | faster-whisper model checkpoint |
| `FASTER_WHISPER_DEVICE` | ⬜ | `cuda` | Inference device (`cuda` or `cpu`) |
| `FASTER_WHISPER_COMPUTE_TYPE` | ⬜ | `int8_float16` | Quantization/compute mode |
| `WEATHER_API_KEY` | ⬜ | — | OpenWeatherMap key |
| `STORAGE_BACKEND` | ⬜ | `local` | `local` or `s3` |
| `S3_BUCKET` | ⬜ | — | If `STORAGE_BACKEND=s3` |
| **Google Sheets Sync** | **⬜** | — | **See [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md)** |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ⬜ | — | Target spreadsheet ID |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | ⬜ | — | Full service account JSON (Option A) |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | ⬜ | — | Service account email (Option B) |
| `GOOGLE_SHEETS_PRIVATE_KEY` | ⬜ | — | Service account private key (Option B) |
| `VITE_GOOGLE_SHEETS_ENABLED` | ⬜ | `false` | Enable sync UI in frontend |

> **See [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md) for detailed setup instructions.**

---

## 9. Key Design Decisions

### Why FastAPI (not Flask/Django)?
- Native async support — critical for non-blocking DB + external API calls
- Automatic OpenAPI docs generation (zero extra work)
- Pydantic v2 for request validation with excellent error messages
- Performance: handles 10k+ req/s with Uvicorn workers

### Why PostgreSQL + JSONB for sessions?
- Session `context_data` is a dynamic, schema-less accumulator — JSONB is ideal
- Financial plan `scenarios` contains 3 nested objects with 12–60 month arrays — JSONB avoids 5 joined tables
- Still fully queryable with `@>` operators and GIN indexes

### Why Zustand (not Redux)?
- 3× less boilerplate for the same functionality
- Works with React 18 concurrent features natively
- `persist` middleware handles localStorage auth tokens out of the box

### Financial Engine — Pure Functions
- `FinancialCalculator` is a stateless class with no DB or LLM dependencies
- Makes it trivially unit-testable and reusable across contexts
- IRR uses bisection search (converges in ~200 iterations, <1ms)

### Voice — Browser-First, Backend Fallback
- Web Speech API (Chrome/Edge) for zero-latency in-browser STT
- Confidence scores stored per answer for quality tracking
- Whisper backend endpoint available for unsupported browsers or mobile

### Security
- bcrypt for password hashing (cost factor 12)
- Short-lived access tokens (60 min) + long-lived refresh tokens (7 days)
- Rate limiting at Nginx level AND FastAPI middleware level
- All user data scoped by `user_id` — no cross-user data leakage possible

---

## 10. Roadmap

### v1.1
- [ ] Alembic migration scripts (auto-generated from models)
- [ ] LLM-powered dynamic follow-up questions (not just skip logic)
- [ ] PDF report generation with ReportLab (financial tables + charts)
- [ ] Email verification on registration

### v1.2
- [ ] MQTT broker for real-time IoT sensor ingestion
- [ ] WebSocket endpoint for live water quality dashboard
- [ ] Market price fetcher (scheduled job via Celery Beat)
- [ ] Multi-farm dashboard for enterprise accounts

### v2.0
- [ ] Mobile app (React Native, reusing API)
- [ ] ML yield prediction model (time-series, LSTM)
- [ ] Marketplace integration (direct sell leads)
- [ ] Offline PWA mode with sync-on-reconnect

---

## License

MIT License — see `LICENSE` file.

---

*Built with ❤️ for aquaponic farmers worldwide.*
