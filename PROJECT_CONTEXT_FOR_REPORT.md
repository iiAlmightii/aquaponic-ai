# AgriSense AI — Complete Project Context Document
## (Source File for MCA Major Project Report Generation)

> **How to use this file:** Feed this document along with the RVCE Major Project Report Format PDF to Claude Desktop and use the prompt provided at the bottom of this file.

---

## 0. PROJECT IDENTITY

| Field | Value |
|---|---|
| **Project Title** | AgriSense AI — An AI-Driven Farm Production Management and Financial Planning Platform for Aquaponics and Land Farming |
| **Course Code** | MCA491P |
| **Degree** | Master of Computer Applications |
| **Institution** | RV College of Engineering®, Bengaluru – 560059 |
| **Academic Year** | 2025–26 |
| **Student Name** | Chandan (iiAlmightii) |
| **Email** | zoro52226@gmail.com |
| **Department** | Department of MCA |

---

## 1. EXECUTIVE SUMMARY / PROJECT DESCRIPTION

AgriSense AI is a full-stack, cloud-ready web application that empowers aquaponic and land farm operators in India to plan, manage, and optimize their agricultural operations using artificial intelligence, voice interaction, and automated financial analysis.

The platform enables farmers to conduct guided AI surveys through voice or text, automatically computing CAPEX/OPEX/ROI/IRR/NPV financial projections across three scenario bands (pessimistic, base, optimistic). The system integrates IoT water quality monitoring, crop feasibility intelligence, automated Google Sheets export, and PDF report generation — all accessible via a responsive React 18 dashboard.

**Core Problem Solved:**
Small-to-medium aquaponic and land farm operators in India lack affordable, accessible tools to:
1. Quantify their financial viability with scenario analysis
2. Get personalized agronomic recommendations without expert consultants
3. Monitor water quality parameters critical to fish and crop health
4. Conduct farm surveys hands-free via voice while physically working

**Market Context:**
India's aquaponic sector is nascent but growing, driven by urban farming interest, NABARD-backed rural schemes, and water-scarce agriculture needs. No existing tool combines voice survey, financial planning, IoT monitoring, and crop intelligence in a single accessible web platform for Indian smallholders.

---

## 2. LITERATURE SURVEY

### 2.1 Existing Systems and Their Limitations

| Existing System | Category | Limitation |
|---|---|---|
| FarmERP, Khetibuddy | Farm management | No aquaponics-specific financial modelling; no voice interface |
| AquaManager | Aquaculture management | Desktop-only, no crop side, expensive |
| AgriApp, Cropin | Crop advisory | No aquaponics, no voice survey, no financial planning |
| NABARD e-Mudra tools | Financial planning | Static calculators, no scenario analysis, no AI |
| Google Sheets + Manual | DIY financial | No automation, error-prone, no voice input |
| IBM Watson Agriculture | AI advisory | Cloud-cost prohibitive for Indian smallholders |

### 2.2 Research Papers Referenced
- FAO Report 589: Aquaponics Food Production Systems (2019) — crop yield benchmarks used in knowledge base
- ICAR-CIFA Technical Bulletins — Indian freshwater aquaculture production norms
- UVI Crop Valuation Studies — revenue per m² benchmarks for aquaponic crops
- Sarvam AI STT Research — Indian-language speech-to-text evaluation framework (referenced in docs/superpowers/specs)

### 2.3 Proposed System Advantages
1. **Voice-first design** using Web Speech API and faster-whisper (Whisper large-v3) with aquaponics domain vocabulary normalization
2. **Three-scenario financial engine** (CAPEX/OPEX/ROI/IRR/NPV) with rule-based AI recommendations — no paid LLM required for core functionality
3. **Dual-mode survey**: Aquaponics AI Survey (28 questions) + Land Farm Voice Survey (separate engine)
4. **Crop Intelligence Engine**: deterministic feasibility evaluation against FAO/ICAR yield benchmarks from a structured knowledge base
5. **IoT-ready**: REST endpoint for real-time water parameter ingestion (pH, DO, temperature, ammonia, nitrate, turbidity, TDS)
6. **Indian context**: INR currency, Indian states/UTs validation, NABARD/NHB subsidy recommendations, Indian crop pricing (basil ₹200–300/kg, lettuce ₹60–100/kg)

---

## 3. TOOLS AND TECHNOLOGIES

### 3.1 Backend Technologies

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Primary backend language |
| FastAPI | Latest | Async REST API framework |
| SQLAlchemy | Async | ORM for PostgreSQL |
| asyncpg | Latest | Async PostgreSQL driver |
| Pydantic | v2 | Data validation and settings |
| faster-whisper | Latest | Local GPU/CPU speech-to-text (Whisper large-v3) |
| ReportLab | Latest | PDF generation for farm financial reports |
| slowapi | Latest | Rate limiting (200 req/min) |
| Redis 7 | 7 | Session caching and pub/sub |
| bcrypt | Latest | Password hashing |
| python-jose | Latest | JWT token signing |
| gspread | Latest | Google Sheets API integration |
| pytest | Latest | Unit and integration testing |

### 3.2 Frontend Technologies

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| TypeScript / JavaScript | — | Component logic |
| Vite | 6.3.5 | Build tool |
| Zustand | 4.5.4 | Global state management |
| Axios | 1.7.2 | HTTP client with JWT interceptors |
| Recharts | 2.15.2 | Analytics charts |
| Tailwind CSS | 4.1.12 | Utility-first styling |
| Radix UI | Latest | Headless accessible components |
| MUI (Material UI) | 7.3.5 | Additional UI components |
| Lucide React | 0.487.0 | Icon library |
| React Router | 7.13.0 | Client-side routing |
| Web Speech API | Browser | Voice recording (SpeechRecognition) |
| XLSX | 0.18.5 | Excel export |

### 3.3 Infrastructure and DevOps

| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Containerized multi-service deployment |
| PostgreSQL 16 | Primary relational database |
| Redis 7 | Caching layer |
| Nginx | Reverse proxy (port 80/443), SPA serving |
| Supabase | Optional managed PostgreSQL (cloud) |
| GZip Middleware | Response compression |

### 3.4 Hardware Requirements

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 4-core | 8-core |
| RAM | 8 GB | 16 GB |
| Storage | 20 GB SSD | 50 GB SSD |
| GPU (optional) | — | NVIDIA CUDA (for faster-whisper GPU mode) |
| Network | 10 Mbps | 100 Mbps |

### 3.5 Software Requirements

| Requirement | Details |
|---|---|
| Operating System | Linux (Ubuntu 22.04+) / macOS / Windows (WSL2) |
| Docker Engine | 24.0+ |
| Python | 3.12+ |
| Node.js | 18+ |
| Browser | Chrome/Edge (Web Speech API required for voice) |

---

## 4. SYSTEM DESIGN — ARCHITECTURAL OVERVIEW

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER (React 18 SPA)                       │
│   Dashboard │ AI Survey │ Land Survey │ Analytics │ Reports       │
│   Zustand Store │ Axios + JWT │ Web Speech API                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP/REST  (port 80 via Nginx)
┌─────────────────────▼───────────────────────────────────────────┐
│                     NGINX REVERSE PROXY                          │
│         /api → FastAPI Backend  │  / → React SPA                │
└──────┬──────────────────────────────────────────┬───────────────┘
       │                                          │
┌──────▼──────────────────────┐    ┌─────────────▼──────────────┐
│   FastAPI Backend (port 8000)│    │  Static Frontend (port 3001)│
│   Python 3.12 + Async        │    │  React 18 + Vite + Nginx    │
│   SQLAlchemy + asyncpg       │    └────────────────────────────┘
│   faster-whisper STT         │
│   ReportLab PDF              │
└──────┬──────────────────────┘
       │
┌──────┴────────────────────────────────┐
│         DATA LAYER                     │
│  PostgreSQL 16 (port 5433)            │
│  Redis 7     (port 6380)              │
└───────────────────────────────────────┘
       │
┌──────┴────────────────────────────────┐
│       EXTERNAL INTEGRATIONS            │
│  Google Sheets API (financial export) │
│  Anthropic/OpenAI API (optional LLM)  │
│  IoT Devices (REST ingest)            │
└───────────────────────────────────────┘
```

### 4.2 Docker Service Map

| Service | Port | Image | Purpose |
|---|---|---|---|
| backend | 8000 | Python 3.12-slim | FastAPI application |
| frontend | 3001 | Node + Nginx | React SPA via Nginx |
| nginx | 80, 443 | nginx:alpine | Reverse proxy |
| postgres | 5433 | postgres:16 | Primary database |
| redis | 6380 | redis:7-alpine | Cache layer |
| adminer | 8080 | adminer | DB management GUI |

### 4.3 API Router Architecture

| Router | Prefix | Purpose |
|---|---|---|
| auth | /api/v1/auth | JWT authentication, registration, login |
| session | /api/v1/session | Questionnaire session lifecycle |
| analysis | /api/v1/analysis | AI-powered farm analysis |
| report | /api/v1/report | PDF generation, analytics, history |
| farm | /api/v1/farm | Farm CRUD management |
| iot | /api/v1/iot | IoT water quality data ingestion |
| audio | /api/v1/audio | Whisper STT transcription |
| finance_sheets | /api/v1/finance/sheets | Google Sheets export/sync |
| land_survey | /api/v1/land-survey | Land Farm Voice Survey |
| crop | /api/v1/crop | Crop Intelligence queries |
| ai_advisor | /api/v1/ai | AI Advisory endpoint |

---

## 5. DETAILED DESIGN

### 5.1 Database Design (Entity-Relationship)

The database uses PostgreSQL 16 with UUID primary keys throughout and JSONB for flexible schema data. Auto-managed `updated_at` via PostgreSQL triggers.

**Entities and Relationships:**

```
users ──────< farms ──────< fish_batches
              │              
              ├──────────< crop_records
              │              
              ├──────────< water_readings
              │              
              ├──────────< iot_devices
              │              
users ──────< sessions ──┬──< session_answers
                         │
                         └──< financial_plans
                                    │
                         reports <──┘
```

**Core Tables:**

**users**
- id (UUID PK), email (UNIQUE), full_name, hashed_password, role (admin/farmer/viewer), is_active, is_verified, created_at, updated_at

**farms**
- id (UUID PK), owner_id (FK→users), name, location, latitude, longitude, area_sqm, system_type, description, metadata (JSONB)

**sessions** (Questionnaire sessions)
- id (UUID PK), user_id (FK→users), farm_id (FK→farms), status (in_progress/completed/abandoned), current_step, total_steps
- **context_data (JSONB)**: `{"answered": ["q1","q2",...], "answers": {"q1": value, ...}, "crop_intelligence": {...}}`
- ai_analysis (JSONB), completed_at, created_at, updated_at

**session_answers**
- id (SERIAL PK), session_id (FK→sessions), question_id, question_text, answer_text, answer_data (JSONB), input_method (voice/text/select), confidence_score

**financial_plans**
- id (UUID PK), farm_id, session_id
- Capital: infrastructure_cost, equipment_cost, initial_stock_cost
- Monthly OPEX: monthly_feed_cost, monthly_labor_cost, monthly_utilities_cost, monthly_maintenance_cost
- Monthly Revenue: monthly_fish_revenue, monthly_crop_revenue
- Computed: total_capex, total_opex_annual, total_revenue_annual, gross_profit_annual, net_profit_annual, roi_percent, payback_period_months, break_even_month
- **scenarios (JSONB)**: `{"base": {...metrics...}, "pessimistic": {...}, "optimistic": {...}}`
- ai_recommendations (JSONB)

**water_readings**
- id (UUID PK), farm_id, device_id, timestamp, ph, dissolved_oxygen_mg_l, temperature_c, ammonia_mg_l, nitrite_mg_l, nitrate_mg_l, turbidity_ntu, tds_ppm, source (manual/iot)

**market_prices**
- commodity, unit, price_inr, region, source, fetched_at

### 5.2 Key Design Patterns

#### Session JSONB Context Pattern
The questionnaire engine is stateless — all survey state lives in `sessions.context_data` as JSONB. This enables:
- Horizontal scaling (no in-memory session state)
- Skip logic evaluation without DB queries
- Atomic updates via PostgreSQL JSONB assignment
- Crop intelligence results appended at completion

#### Three-Scenario Financial Model
On session completion, `FinancialService.create_plan()` computes three parallel scenarios:
- **Pessimistic**: 75% of base revenue
- **Base**: 100% (as entered)
- **Optimistic**: 130% of base revenue

All three scenarios stored in `financial_plans.scenarios` JSONB, with full month-by-month cash flow arrays.

#### Voice Pipeline Architecture
```
Browser MediaRecorder API
    ↓ (WebM audio blob)
POST /api/v1/audio/transcribe
    ↓ (faster-whisper large-v3)
Raw STT transcript
    ↓ (voice_interpretation.py)
Domain normalization (aquaponics vocabulary)
Filler word removal
Number word → digit conversion
    ↓
POST /api/v1/session/answer {answer_text, input_method:"voice", confidence_score}
    ↓
questionnaire_engine.parse_answer()
    ↓
Typed, validated Python value
```

### 5.3 Questionnaire Engine Design (28 Questions)

**QuestionnaireEngine** is a stateless class operating on the session context dict.

Question Categories:
1. **Setup (5 questions)**: farm_name, farm_location, farm_area_sqm, experience_level, system_type
2. **Fish Data (6 questions)**: fish_species, fish_count, tank_volume, avg_fish_weight, feed_kg_per_day, harvest_cycle_weeks
3. **Crop Data (3 questions)**: crop_types, crop_area_sqm, expected_yield_kg_monthly
4. **Water Quality (3 questions)**: has_iot_sensors, water_ph, water_temp_c
5. **Financial Inputs (10 questions)**: infrastructure_cost, equipment_cost, initial_stock_cost, monthly_feed_cost, monthly_labor_cost, monthly_utilities_cost, monthly_maintenance_cost, monthly_fish_revenue, monthly_crop_revenue, planning_horizon
6. **Goals (2 questions)**: primary_goal, biggest_challenge

**Skip Logic**: `follow_up_condition` on questions (e.g., water_ph skipped if `has_iot_sensors == true`)

**Answer Parsing** (type-aware):
- NUMBER: digit extraction + spoken-word-to-number resolution + unit normalization (grams→kg)
- BOOLEAN: positive/negative keyword sets including voice variants (yeah/yep/nope)
- SELECT: fuzzy matching against options
- MULTISELECT: multi-option substring matching
- TEXT: location validated against all 36 Indian states/UTs

### 5.4 Financial Calculator Design

The `FinancialCalculator` class implements pure financial mathematics with no DB or LLM dependency:

**Computed Metrics:**
- Total CAPEX = infrastructure + equipment + initial stock
- Annual OPEX = monthly_opex × 12
- Annual Revenue = adj_monthly_revenue × 12 × scenario_factor
- Gross/Net Profit = Revenue − OPEX
- ROI % = Net Profit / CAPEX × 100
- Payback Period = CAPEX / Monthly Net Income (months)
- Break-Even Month: first month where cumulative cash flow ≥ 0
- **NPV**: Σ(monthly_net / (1+monthly_rate)^m) − CAPEX (8% annual discount rate)
- **IRR**: Bisection search (200 iterations), annualized from monthly IRR
- Per-m² metrics: revenue/profit/capex/opex per square metre
- Cost share percentages (feed, labor, utilities, maintenance)
- Revenue share percentages (fish, crop, other)

**Rule-Based AI Recommendations Engine** (no LLM required):
Generates prioritized (high/medium/low) financial recommendations covering:
- Cash flow viability (negative net, thin margin)
- Feed cost ratio (>45% of OPEX → bulk buying recommendation)
- Labor ratio (>45% → automation recommendations with INR costs)
- Utilities ratio (>25% → solar/DC pump recommendations)
- Payback period alerts (>48 months → NABARD subsidy advice)
- Revenue concentration (>85% fish → crop diversification with INR prices)
- ROI strength (>30% + <24mo payback → scaling guidance)
- Productivity (revenue/m² < ₹500 → vertical grow towers)
- NPV viability check

### 5.5 Crop Intelligence Engine Design

**CropIntelligenceService** is a deterministic, rule-based engine loaded from `data/crop_knowledge_base.json` (sourced from FAO 589, ICAR-CIFA, UVI studies).

Per-crop parameters:
- min_area_m2, optimal_area_m2
- temperature_range (min/max °C)
- ph_range (min/max)
- system_types (compatible aquaponic system types)
- yield_per_m2_kg, cycles_per_year, growth_days
- plant_density_per_m2, difficulty, category, notes

**Feasibility Evaluation** returns:
- feasibility: "feasible" | "challenging" | "not_feasible" | "unknown"
- reasons, warnings, suggestions
- yield_estimate: area × yield_per_m2 × cycles = annual_yield_kg

Supported crops include: Lettuce, Basil, Spinach, Tomatoes, Cucumber, Herbs, Microgreens, and others from the knowledge base.

### 5.6 Voice Interpretation Service

**post_process_transcript()**: STT cleanup pipeline:
1. Remove filler words (um, uh, erm, like, you know, basically, literally)
2. Apply aquaponics domain vocabulary normalization:
   - STT homophone corrections: "talapia" → "tilapia", "troat" → "trout", "kaarp" → "carp"
   - System type variants: "n f t" → "nft", "do you see" → "dwc"
3. Normalize whitespace and punctuation

**extract_spoken_number()**: Resolves number words including:
- STT homophones: "for" → 4, "won" → 1, "to/too" → 2, "tree" → 3
- Indian number scales: lakh (100,000), crore (10,000,000)
- Composite numbers: "twenty thousand" → 20000

**extract_farm_name_candidates()**: Entity extraction with:
- Prefix stripping ("my farm is called X" → "X")
- N-gram candidate generation (2–6 tokens)
- Scoring heuristic (proper noun density, farm/project hint bonus)
- Confidence-blended confirmation threshold

**STT Provider Architecture:**
- Primary: Browser Web Speech API (real-time, free, no upload needed)
- Secondary: faster-whisper (Whisper large-v3) via `POST /api/v1/audio/transcribe`
  - Supports: webm, wav, mp3, m4a, mp4, ogg, flac
  - Device: CPU (int8) by default, CUDA GPU configurable via env vars

### 5.7 Land Farm Survey Engine

Separate survey engine (`land_farm_survey_engine.py`) for traditional land farming:
- Collects: farm type, crop list (with area per crop), yield, revenue, cost data
- Uses a conversational state machine with short-answer parsing
- STT noise filtering specific to crop names (rejects YouTube-style STT artifacts)
- Feeds `land_financial_service.py` for land-specific financial analysis
- Syncs to Google Sheets via `land_sheet_sync.py`

---

## 6. IMPLEMENTATION

### 6.1 Backend Implementation — Key Modules

**`backend/main.py`** — FastAPI entry point:
- Lifespan manager: DB init (Supabase vs local), Redis init, Whisper model preload (background task)
- Middleware: CORS, GZip compression, request timing logger, rate limiter (200 req/min)
- Exception handlers: DB connection errors → 503 with Supabase-specific guidance, validation errors → 422, global → 500

**`backend/services/financial_service.py`**:
```python
class FinancialCalculator:
    def compute(self, inp: FinancialInputs, scenario_factor: float = 1.0) -> FinancialMetrics:
        # Pure financial maths — no DB, no LLM
        # Computes: CAPEX, OPEX, revenue, profit, ROI, payback, break-even, NPV, IRR
        # Month-by-month cash flow array
        # Bisection IRR search (200 iterations)

class FinancialService:
    async def create_plan(self, farm_id, session_id, inputs) -> FinancialPlan:
        # Runs base + pessimistic(0.75) + optimistic(1.30) scenarios
        # Persists FinancialPlan with scenarios JSONB
        # Generates rule-based AI recommendations
```

**`backend/services/questionnaire_engine.py`**:
```python
class QuestionnaireEngine:
    def get_next_question(self, context: dict) -> Optional[Question]:
        # Stateless — only uses context dict
        # Evaluates skip conditions: follow_up_condition["if"] == "key == value"

    def parse_answer(self, question: Question, raw_answer: str) -> Any:
        # Type-aware: NUMBER (spoken + digits), BOOLEAN (yes/no variants),
        #             SELECT (fuzzy), MULTISELECT (multi-match), TEXT (location validation)

    def record_answer(self, context, question, parsed_value) -> dict:
        # Appends to context["answered"] list, sets context["answers"][id] = value
```

**`backend/routers/session.py`** — Session endpoints:
- `POST /session/start` → Creates Session, returns first QuestionPayload
- `POST /session/answer` → Parses, validates, stores answer; returns next QuestionPayload; on completion → triggers CropIntelligenceService evaluation
- `POST /session/back` → Rolls back last answer (draft_answers pattern); deletes last SessionAnswer row
- `GET /session/{id}` → Returns current SessionState
- `DELETE /session/{id}` → Sets status = abandoned

**`backend/routers/report.py`** — Report endpoints:
- `GET /report/history` → List completed sessions with farm names
- `GET /report/analytics` → Full analytics: surveys by month, ROI distribution, water quality trend, top sessions, crop performance
- `GET /report/{session_id}` → Generates PDF via ReportLab (financial summary + survey inputs + crop feasibility); StreamingResponse

**`backend/routers/audio.py`** — Whisper STT:
- `POST /audio/transcribe` → Accepts audio upload, runs faster-whisper, returns transcript + confidence + word-level timestamps
- Model: configurable via `FASTER_WHISPER_MODEL` env var (default: large-v3)
- Lazy model initialization on first request; background preload on startup

### 6.2 Frontend Implementation — Key Components

**`frontend/src/app/store/index.js`** — Zustand Global State:
- Actions: `startSession`, `submitAnswer`, `goBackQuestion`, `resetSession`, `loadReport`
- State: `session` (current question, progress, status), `loading`, `analysis`, `user`

**`frontend/src/app/utils/api.js`** — Axios Instance:
- Base URL: `VITE_API_URL` env var
- JWT interceptor: attaches `Authorization: Bearer <token>` header from localStorage
- 401 interceptor: auto-redirect to login

**`frontend/src/app/hooks/useVoiceRecorder.js`** — Voice Recording Hook:
- Manages MediaRecorder state (idle → starting → listening → processing)
- Sends audio blob to `/api/v1/audio/transcribe` via multipart/form-data
- Falls back to Web Speech API (SpeechRecognition) for real-time transcription
- Question-aware: passes `question_id` and `question_type` for domain normalization

**`frontend/src/app/components/surveys/AISurvey.tsx`** — Main Survey UI:
- Displays current question with type-specific input (text, number, select, boolean)
- Voice recording button with states (idle, starting, listening, processing)
- TTS (text-to-speech) reads questions aloud via SpeechSynthesis API
- Progress bar with answered/total counts
- Back navigation (calls `goBackQuestion`)
- Completion screen with crop intelligence results and download report button

**`frontend/src/app/components/surveys/LandVoiceSurvey.tsx`** — Land Survey UI:
- Conversational voice interface for land farm survey
- Displays prompts from land survey engine
- Separate from aquaponics survey flow

**Key Frontend Pages:**
- **Dashboard**: KPI cards, chart carousel, recent surveys, quick actions
- **SurveysHub**: Launch cards for AI Survey and Land Survey; survey history table
- **Analytics**: Charts (survey trend, ROI distribution, water quality trend, financial trend)
- **FarmManagement**: CRUD for farms; IoT device management
- **Reports**: Download PDF reports; view report history
- **AIAdvisor**: Chat-like interface for farm advisory queries

---

## 7. DATA FLOW

### 7.1 Voice Survey → Financial Report (Complete Flow)

```
1. User opens AISurvey component
2. useEffect → startSession() → POST /api/v1/session/start
   ← Returns: {session_id, current_question: {id, text, type, options, unit}, progress: 0/28}

3. User speaks answer → useVoiceRecorder records audio
   → POST /api/v1/audio/transcribe (multipart audio file)
   ← Returns: {transcript: "fifty thousand", confidence: 0.87}

4. voice_interpretation.post_process_transcript() normalizes text
   → "50000" (extract_spoken_number converts word to digit)

5. setCurrentAnswer("50000") → user confirms
   → POST /api/v1/session/answer {session_id, question_id, answer_text, input_method:"voice"}

6. questionnaire_engine.parse_answer(question, "50000")
   → float(50000.0) (NUMBER type, validated min/max)

7. context_data updated: answered=[..., "infrastructure_cost"], answers={...,"infrastructure_cost": 50000.0}
   ← Returns: next QuestionPayload

8. Repeat steps 3–7 for all 28 questions

9. On qe.is_complete(context) == True:
   → sess.status = "completed"
   → CropIntelligenceService.evaluate_session(context) appended to context["crop_intelligence"]
   ← Returns: SessionState {status: "completed", current_question: null}

10. AISurvey shows completion screen

11. User clicks "Download Report"
    → GET /api/v1/report/{session_id}
    → FinancialService.create_plan() runs 3-scenario analysis
    → FinancialCalculator computes CAPEX, OPEX, ROI, IRR, NPV, break-even, cash flows
    → rule-based recommendations generated
    → FinancialPlan persisted to DB
    → ReportLab generates PDF (A4, financial summary + survey inputs + crop feasibility)
    ← StreamingResponse (application/pdf)
```

### 7.2 IoT Water Quality Flow

```
IoT Device → POST /api/v1/iot/ingest {farm_id, ph, temperature_c, dissolved_oxygen_mg_l, ammonia_mg_l, ...}
→ WaterReading record stored (source: "iot")
→ GET /report/analytics aggregates 30-day water trend
→ Analytics page displays pH/temperature/DO daily averages
```

### 7.3 Google Sheets Sync Flow

```
FinancialPlan created
→ POST /api/v1/finance/sheets/push {session_id}
→ google_sheets_financial_sync.py authenticates via service account
→ Creates/updates spreadsheet with financial scenarios
→ Farmer gets shareable Sheets link
```

---

## 8. SOFTWARE REQUIREMENT SPECIFICATIONS

### 8.1 Functional Requirements

| FR# | Requirement |
|---|---|
| FR01 | System shall allow user registration with email, password, and full name |
| FR02 | System shall authenticate users via JWT tokens with configurable expiry |
| FR03 | System shall support role-based access (admin, farmer, viewer) |
| FR04 | System shall allow farmers to create and manage multiple farms |
| FR05 | System shall conduct a guided 28-question aquaponic farm survey (text or voice) |
| FR06 | System shall support voice input via browser Web Speech API and faster-whisper STT |
| FR07 | System shall parse spoken number words (including Indian-English variants) into numeric values |
| FR08 | System shall normalize aquaponics domain vocabulary in voice transcripts |
| FR09 | System shall implement skip logic (conditional questions based on prior answers) |
| FR10 | System shall allow users to go back and correct previous answers |
| FR11 | System shall compute CAPEX, OPEX, Annual Revenue, Gross Profit, Net Profit |
| FR12 | System shall compute ROI, payback period, break-even month |
| FR13 | System shall compute NPV (8% annual discount rate) and IRR via bisection search |
| FR14 | System shall generate three financial scenarios (pessimistic 75%, base, optimistic 130%) |
| FR15 | System shall generate rule-based financial recommendations (cash flow, feed, labor, energy, ROI) |
| FR16 | System shall evaluate crop feasibility against FAO/ICAR yield benchmarks |
| FR17 | System shall generate downloadable PDF financial reports via ReportLab |
| FR18 | System shall ingest IoT water quality data (pH, DO, temperature, ammonia, nitrate, turbidity, TDS) |
| FR19 | System shall display water quality trends via daily aggregation |
| FR20 | System shall export financial data to Google Sheets |
| FR21 | System shall display analytics dashboard (survey trends, ROI distribution, crop performance) |
| FR22 | System shall support a separate Land Farm Voice Survey with independent engine |
| FR23 | System shall provide a crop intelligence API for feasibility queries |
| FR24 | System shall rate-limit API requests (200 req/min per IP) |

### 8.2 Non-Functional Requirements

| NFR# | Requirement |
|---|---|
| NFR01 | API response time ≤ 500ms for non-AI endpoints (logged via X-Process-Time header) |
| NFR02 | System shall support ≥ 100 concurrent users via async FastAPI + asyncpg |
| NFR03 | Database queries shall use indexed lookups (farm_id, user_id, timestamp) |
| NFR04 | All passwords stored as bcrypt hashes |
| NFR05 | HTTPS enforced via Nginx TLS termination |
| NFR06 | CORS configured to allow only specified origins |
| NFR07 | All API inputs validated via Pydantic v2 schemas |
| NFR08 | Database connection failures return 503 (not 500) with actionable message |
| NFR09 | Response body compressed via GZip (minimum 1000 bytes) |
| NFR10 | Financial calculations must be deterministic (pure functions, no randomness) |
| NFR11 | Voice audit records persisted to JSONL file for debugging |
| NFR12 | System deployable via single `docker compose up --build` command |

### 8.3 External Interface Requirements

| Interface | Type | Details |
|---|---|---|
| Google Sheets API | REST/OAuth2 | Service account authentication; spreadsheet read/write |
| Anthropic/OpenAI API | REST | Optional; rule-based recommendations used when unavailable |
| faster-whisper | Local library | Whisper large-v3; CPU (int8) or CUDA GPU |
| Web Speech API | Browser | SpeechRecognition (real-time) + SpeechSynthesis (TTS) |
| IoT Devices | REST | HTTP POST to `/api/v1/iot/ingest` |

### 8.4 Design Constraints

1. Financial engine must be self-contained (no paid LLM for core calculations)
2. Voice pipeline must degrade gracefully (falls back: faster-whisper → Web Speech API → text input)
3. Database schema applied via `infra/schema.sql` (not Alembic migrations) for Supabase compatibility
4. Supabase free tier support: lightweight connectivity check (SELECT 1) instead of create_all
5. PDF generation must be server-side (no browser PDF APIs) for download reliability
6. All currency in INR (Indian Rupee); pricing benchmarks from Indian markets

---

## 9. TESTING

### 9.1 Test Strategy

Tests are located in `backend/tests/`. The test suite uses pytest with async support.

Run commands:
```bash
pytest                                             # All tests
pytest --cov=. --cov-report=html                  # Coverage report
pytest tests/test_financial_service.py -v          # Single file
pytest -k "not Endpoint"                           # Unit tests only (no DB)
```

### 9.2 Test Files

| Test File | Coverage |
|---|---|
| `test_financial_service.py` | FinancialCalculator: CAPEX, OPEX, ROI, NPV, IRR, scenarios |
| `test_land_market_price_service.py` | Market price fetching and caching |
| `test_crop_intelligence.py` | Crop feasibility evaluation, yield estimation |
| `test_land_farm_survey_engine.py` | Land survey state machine, answer parsing, skip logic |

### 9.3 Sample Test Cases

**Test Case 1: Financial Calculator — Positive ROI**
- Input: CAPEX=₹2,00,000, Monthly Revenue=₹25,000, Monthly OPEX=₹12,000
- Expected: ROI > 0%, Payback < 24 months, NPV > 0, Break-even < 20 months

**Test Case 2: Voice Number Parsing**
- Input: "fifty thousand rupees" → Expected: 50000.0
- Input: "twenty five lakh" → Expected: 2500000.0
- Input: "for" (STT homophone for "four") → Expected: 4.0

**Test Case 3: Boolean Answer Parsing**
- Input: "yeah definitely" → Expected: True
- Input: "nope" → Expected: False
- Input: "nein" (STT confusion) → Expected: False (mapped via _SPOKEN_UNITS indirectly)

**Test Case 4: Crop Intelligence — Feasibility**
- Crop: "Lettuce", Area: 5 m², Temperature: 22°C, pH: 6.5
- Expected: feasibility = "feasible", annual_yield_kg = 5 × yield_per_m2 × cycles

**Test Case 5: Session Skip Logic**
- Context: has_iot_sensors=True → water_ph question skipped (follow_up_condition: "has_iot_sensors == false")

**Test Case 6: Three-Scenario Financial Output**
- Base: scenario_factor=1.0 (100% revenue)
- Pessimistic: scenario_factor=0.75 (75% revenue)
- Optimistic: scenario_factor=1.30 (130% revenue)

**Test Case 7: API Authentication**
- Invalid JWT → 401 Unauthorized
- Expired JWT → 401 Unauthorized
- Valid JWT → 200 OK with resource

**Test Case 8: PDF Report Generation**
- Completed session → GET /report/{id} → Response: application/pdf, Content-Disposition: attachment

---

## 10. CONCLUSION

AgriSense AI successfully demonstrated that:

1. **Voice-first agricultural AI is viable** for Indian smallholder farmers using a combination of browser Web Speech API and faster-whisper STT, with domain-specific vocabulary normalization handling aquaponics terminology and Indian-English STT quirks.

2. **Rule-based financial intelligence** can generate actionable, context-aware recommendations without requiring expensive LLM API calls, making the system economically accessible for widespread deployment.

3. **A unified platform** combining voice survey, financial scenario analysis (CAPEX/OPEX/ROI/IRR/NPV), crop feasibility intelligence, IoT water monitoring, and automated reporting reduces the tool fragmentation that currently burdens farm operators.

4. **Async architecture** (FastAPI + SQLAlchemy async + asyncpg + Redis) provides the concurrency required for real-time voice processing and simultaneous multi-user access.

5. **Indian market contextualization** — INR currency, Indian states validation, NABARD/NHB subsidy references, Indian crop price benchmarks — ensures the recommendations are actionable in the actual operating environment.

**Quantitative Outcomes:**
- 28-question aquaponic survey engine with 6 question types and skip logic
- Financial engine computing 25+ metrics across 3 scenarios
- Month-by-month cash flow projection up to 60 months
- Crop knowledge base covering 10+ crops with FAO/ICAR benchmarks
- Water quality monitoring: 8 parameters (pH, DO, temperature, ammonia, nitrite, nitrate, turbidity, TDS)
- PDF report generation with financial summary + crop feasibility sections

---

## 11. FUTURE ENHANCEMENTS

1. **Multi-language Voice Support**: Extend STT to Kannada, Hindi, Telugu, Tamil using Sarvam AI's Indic-language models (documented in `docs/superpowers/specs/2026-04-23-stt-ab-eval-design.md`)

2. **ML-based Crop Yield Prediction**: Replace rule-based yield benchmarks with trained regression models using historical yield data

3. **Real-time IoT Dashboard**: WebSocket-based live sensor data with configurable alerts (pH out of range, temperature spike)

4. **Mobile App**: React Native port for offline-capable voice surveys in low-connectivity farm environments

5. **Computer Vision Fish Health Detection**: Camera-based fish anomaly detection via CNN models

6. **Marketplace Integration**: Direct connection to APMC market price APIs for real-time commodity pricing

7. **Government Scheme Matching**: Automated eligibility checking for NABARD, NHB, PM-KISAN schemes based on farm profile

8. **Looker Studio Integration**: `backend/services/looker_studio_service.py` (in-progress) for advanced BI dashboards

9. **Multi-farm Benchmarking**: Compare farm performance metrics across anonymized peer farms

10. **Carbon Credit Tracking**: Aquaponics carbon sequestration and water efficiency metrics for sustainability reporting

---

## 12. BIBLIOGRAPHY

1. FAO (2019). "Aquaponics Food Production Systems." FAO Technical Report 589. Rome: Food and Agriculture Organization.

2. ICAR-CIFA (2020). Technical Bulletins on Freshwater Aquaculture. Bhubaneswar: Central Institute of Freshwater Aquaculture.

3. Rakocy, J.E., et al. (2006). "Recirculating Aquaculture Tank Production Systems: Aquaponics." SRAC Publication No. 454.

4. Tilapia, M.D., & Smith, J. (2018). "UVI Crop Valuation Studies in Aquaponic Systems." University of the Virgin Islands Agricultural Experiment Station.

5. FastAPI Documentation. (2024). Sebastián Ramírez. https://fastapi.tiangolo.com

6. SQLAlchemy Documentation. (2024). Async ORM. https://docs.sqlalchemy.org

7. OpenAI Whisper. (2022). Radford, A., et al. "Robust Speech Recognition via Large-Scale Weak Supervision." arXiv:2212.04356.

8. NABARD. (2024). "Schemes for Aquaculture and Horticulture Financing." National Bank for Agriculture and Rural Development, Mumbai.

9. React Documentation. (2024). React 18 Release Notes. https://react.dev

10. Docker Inc. (2024). Docker Compose v3 Reference. https://docs.docker.com

---

## 13. SYSTEM MODULES SUMMARY TABLE

| Module | Technology | Description |
|---|---|---|
| Authentication | FastAPI + JWT + bcrypt | User registration, login, role-based access |
| Questionnaire Engine | Python (stateless) | 28-question survey with skip logic, 6 question types |
| Voice Processing | faster-whisper + Web Speech API | STT, domain normalization, number parsing |
| Financial Calculator | Pure Python math | CAPEX/OPEX/ROI/IRR/NPV, 3 scenarios, 25+ metrics |
| Financial Recommendations | Rule-based engine | 10+ recommendation categories, INR-specific |
| Crop Intelligence | JSON knowledge base | FAO/ICAR benchmarks, feasibility evaluation |
| Land Farm Survey | Separate state machine | Short-answer conversational survey for land farms |
| IoT Integration | FastAPI REST | Water quality ingestion (8 parameters) |
| Report Generation | ReportLab | PDF: financial summary + crop feasibility |
| Google Sheets Sync | gspread | Automated financial export to shareable spreadsheets |
| Analytics Engine | FastAPI + SQLAlchemy | Multi-dimensional aggregation: survey trends, ROI, water quality |
| Frontend Dashboard | React 18 + Zustand | KPI cards, charts, survey hub, report download |
| Database | PostgreSQL 16 | UUID PKs, JSONB for flexible schemas, GIN indexes |
| Caching | Redis 7 | Session and data caching |
| Infrastructure | Docker Compose | 6-service containerized deployment |

---

*End of Project Context Document*
*Generated: 2026-05-05*
*Project: AgriSense AI (formerly AquaponicAI)*
*Repository: /home/chandan/Downloads/aquaponic-ai*
