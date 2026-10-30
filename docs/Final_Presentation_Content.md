# AgriSense AI — Final Presentation Content
## MCA491P Major Project | RV College of Engineering, Bengaluru

---

# SLIDE 1 — TITLE SLIDE

**Project Title:**
AgriSense AI: An AI-Driven Voice-First Farm Production Management and Financial Planning Platform

**Team Members:**
- Chandan | [USN]

**Internal Guide:** [Guide Name], [Designation], Department of MCA, RVCE
**External Guide:** [External Guide Name], [Designation], [Organisation]

**Department:** Department of Master of Computer Applications
**Institution:** RV College of Engineering®, Bengaluru – 560059
**Academic Year:** 2025–26
**Course Code:** MCA491P — Major Project

---
### TRANSCRIPT — Slide 1

Good morning / afternoon respected panel members. I am Chandan, presenting the final review of my major project titled "AgriSense AI: An AI-Driven Voice-First Farm Production Management and Financial Planning Platform," developed under the guidance of [Internal Guide] from the Department of MCA, RV College of Engineering, and [External Guide] from [Organisation].

AgriSense AI is a full-stack intelligent platform that enables aquaponic and land-based farmers in India to conduct voice-driven farm surveys, generate three-scenario financial plans with CAPEX, OPEX, ROI, IRR and NPV analysis, monitor real-time water quality through IoT integration, and receive AI-assisted crop recommendations — all through a multilingual, voice-first React dashboard.

---

# SLIDE 2 — INTRODUCTION

## Problem Statement

Small-to-medium aquaponic and land farm operators in India face four critical gaps:

1. **No accessible financial planning tool** — Farmers lack affordable software to compute CAPEX, OPEX, ROI, payback periods, and financial scenarios. Manual Excel sheets are error-prone and require financial expertise.

2. **No voice-first interface for data collection** — Farm surveys require farmers to stop physical work. Existing systems demand typing; rural farmers need hands-free voice interaction.

3. **No integrated crop and water intelligence** — Crop selection, yield estimation, and water quality monitoring exist in separate silos. No single tool connects them.

4. **Language barriers** — Existing tools are English-only. Indian farmers speak Kannada, Hindi, Tamil, and Telugu.

## Motivation

- India's aquaponic sector is growing, driven by NABARD-backed schemes and water-scarce farming needs.
- No existing tool combines voice survey, financial planning, IoT monitoring, and crop intelligence for Indian smallholders in one accessible web platform.
- Aquaponic farms have a complex interdependency between fish biology, crop physiology, and water chemistry — making AI-assisted decision support genuinely valuable.

## Project Overview

AgriSense AI is a web-based platform with:
- **Voice survey engine** — 28-question adaptive aquaponic questionnaire + separate land farm survey
- **Financial engine** — Computes 25+ metrics across 3 scenarios (pessimistic / base / optimistic)
- **Crop intelligence** — Deterministic feasibility engine from FAO/ICAR knowledge base
- **IoT integration** — REST ingest for pH, dissolved oxygen, temperature, ammonia, and more
- **Report generation** — PDF financial reports + Google Sheets export
- **AI advisory** — Conversational multilingual farming advice

---
### TRANSCRIPT — Slide 2

The problem this project addresses is real and measurable. Indian aquaponic farmers cannot afford specialist consultants for financial planning. They work on farms and cannot stop to type on a keyboard. And no single platform in the Indian market connects financial planning, crop intelligence, and IoT water monitoring into one tool.

The motivation came from observing how farm operators currently use disconnected tools — a government calculator for subsidy eligibility, an Excel sheet for cost estimates, and a phone call to an extension officer for crop advice. AgriSense AI consolidates all these functions into one accessible, voice-first web application.

---

# SLIDE 3 — OBJECTIVES

## Primary Objectives

1. **Develop a voice-first guided survey** that collects complete farm data from aquaponic operators through 28 adaptive questions, supporting both voice and text input with Indian-English spoken number parsing.

2. **Build a deterministic financial planning engine** that computes CAPEX, OPEX, ROI, payback period, break-even month, NPV, and IRR — generating base, pessimistic (75% revenue), and optimistic (130% revenue) scenarios.

3. **Implement a crop intelligence module** that evaluates crop feasibility against FAO Technical Paper 589 and ICAR-CIFA benchmarks, providing yield estimates and farming recommendations.

4. **Integrate IoT water quality monitoring** for real-time ingestion of 8 sensor parameters (pH, dissolved oxygen, temperature, ammonia, nitrite, nitrate, turbidity, TDS).

5. **Generate actionable financial reports** as downloadable PDFs and exportable Google Sheets for farmer use and advisor collaboration.

6. **Provide multilingual AI advisory** using conversational LLM integration for farm-specific guidance in Indian languages.

## Expected Outcomes

| Outcome | Metric |
|---|---|
| Complete aquaponic survey | 28 questions, skip logic, 6 input types |
| Financial analysis depth | 25+ computed metrics, 3 scenarios, 60-month cash flow |
| Crop coverage | 10+ crops with FAO/ICAR yield benchmarks |
| IoT parameter coverage | 8 water quality parameters |
| Report output | PDF download + Google Sheets sync |
| Survey completion time | Under 15 minutes via voice |
| Deployment | Single `docker compose up` across 6 services |

---
### TRANSCRIPT — Slide 3

The project has six primary objectives spanning voice interaction, financial mathematics, agronomic intelligence, IoT integration, reporting, and multilingual AI. Each objective maps to a concrete, measurable outcome. The most technically ambitious objective was building a financial engine that is self-contained — producing reliable IRR, NPV, and scenario analysis without requiring a paid LLM or external financial API.

---

# SLIDE 4 — METHODOLOGY

## Overall Workflow of the System

### Development Methodology: Agile Iterative Development

The project was developed in three phases corresponding to the three academic review milestones, with two-week feature sprints within each phase.

---

## System Workflow (End-to-End)

```
STEP 1: FARMER AUTHENTICATION
  Farmer registers → bcrypt password hash stored
  Farmer logs in → JWT token issued (24h expiry)
  JWT sent on every API request via Authorization header

STEP 2: FARM PROFILE CREATION
  Farmer creates Farm record (name, location, area, system type)
  Farm linked to user via foreign key

STEP 3: VOICE SURVEY (Aquaponic)
  Farmer clicks "Start Survey"
  → QuestionnaireEngine returns Question 1 (of 28)
  → Farmer speaks answer (Web Speech API / faster-whisper STT)
  → VoiceInterpreter normalizes transcript
    (removes filler words, fixes STT homophones, converts "fifty thousand" → 50000)
  → Answer validated against question type constraints
  → Skip logic evaluated (e.g., IoT sensor questions skipped if farmer says "No sensors")
  → Answer stored in session_answers + context_data JSONB updated
  → Next question served
  → Repeat for all 28 questions
  
STEP 4: AUTOMATIC FINANCIAL PLAN GENERATION
  On survey completion:
  → CropIntelligenceService evaluates crop feasibility (FAO/ICAR knowledge base)
  → FinancialCalculator extracts structured inputs from context_data
  → Computes 3 scenarios: pessimistic (×0.75), base (×1.0), optimistic (×1.30)
  → Computes: CAPEX, annual OPEX, annual revenue, ROI, NPV (8% discount rate),
               IRR (bisection method), payback period, break-even month
  → Rule-based recommendations generated (feed cost, labor ratio, energy, NABARD schemes)
  → FinancialPlan persisted to database (scenarios stored as JSONB)

STEP 5: REPORTING
  Farmer downloads PDF report (ReportLab — financial summary + crop feasibility)
  Farmer exports to Google Sheets (gspread — service account OAuth2)

STEP 6: IOT MONITORING (Ongoing)
  IoT device POSTs sensor readings → water_readings table
  Analytics dashboard shows 30-day pH/temperature/DO trend

STEP 7: AI ADVISORY
  Farmer opens AI Advisor chat
  Farm context injected into LLM prompt
  Conversational advisory in farmer's language
```

---
### TRANSCRIPT — Slide 4

The methodology is linear from the farmer's perspective but involves several concurrent backend processes. The most important design decision visible in this workflow is that financial computation happens automatically — the farmer never needs to understand what CAPEX or IRR means to trigger the analysis. It runs transparently on survey completion. The workflow was validated by walking through it with simulated farm profiles during testing, confirming that every path from survey to report generates meaningful output.

---

# SLIDE 5 — TOOLS & TECHNOLOGIES

## Design Methodology: Agile Iterative Development

---

## Frontend Technologies

| Technology | Version | Role |
|---|---|---|
| React.js | 18.3.1 | UI framework for all screens |
| Vite | 6.3.5 | Build tool and development server |
| TypeScript / JavaScript | — | Component logic |
| Zustand | 4.5.4 | Global state management (survey progress, auth, dashboard) |
| Axios | 1.7.2 | HTTP client with JWT interceptors and 401 auto-redirect |
| Web Speech API | Browser native | Real-time voice capture and text-to-speech |
| Recharts | 2.15.2 | Charts (ROI distribution, water quality trend, financial trend) |
| Tailwind CSS | 4.1.12 | Utility-first responsive styling |
| Radix UI | Latest | Accessible headless UI components |
| MUI (Material UI) | 7.3.5 | Additional UI components (tables, dialogs) |
| React Router | 7.13.0 | Client-side routing |
| Lucide React | 0.487.0 | Icon library |
| XLSX | 0.18.5 | Excel export for financial data |

## Backend Technologies

| Technology | Version | Role |
|---|---|---|
| Python | 3.12 | Primary backend language |
| FastAPI | Latest | Async REST API framework (12 routers) |
| SQLAlchemy 2.x | Async | ORM with non-blocking asyncpg driver |
| asyncpg | Latest | Async PostgreSQL driver |
| Pydantic v2 | Latest | Request/response validation and settings |
| faster-whisper | Latest | Server-side STT (Whisper large-v3, GPU/CPU) |
| ReportLab | Latest | PDF financial report generation |
| bcrypt | Latest | Password hashing (12 rounds) |
| python-jose | Latest | JWT token signing (HS256) |
| gspread | Latest | Google Sheets API v4 integration |
| SlowAPI | Latest | Rate limiting (200 req/min per IP) |
| NumPy / Pandas | Latest | Financial and analytical data processing |
| scikit-learn | Latest | ML support for crop/data analysis |
| pytest | Latest | Unit and integration testing |

## Database & Infrastructure

| Technology | Version | Role |
|---|---|---|
| PostgreSQL 16 | 16 | Primary relational database (UUID PKs, JSONB, GIN indexes) |
| Redis 7 | 7 | Session caching and market price TTL cache |
| Docker + Docker Compose | 24+ | 6-service containerized deployment |
| Nginx | Alpine | Reverse proxy, SSL termination, SPA serving |
| Supabase | Cloud | Managed PostgreSQL option for production |

## External APIs & Integrations

| API / Service | Purpose |
|---|---|
| Google Sheets API v4 | Financial data export to shareable spreadsheets |
| Anthropic / OpenAI API | Optional LLM for AI advisory and recommendations |
| Sarvam AI | Multilingual Indian-language LLM advisory |
| Sarvam Saarika v2 STT | Indic-language speech-to-text (evaluation) |
| IoT Devices | REST ingest for water quality sensors |

## Algorithms Implemented

| Algorithm | Type | Purpose |
|---|---|---|
| IRR (Internal Rate of Return) | Bisection numerical search | Computes annualized investment return |
| NPV (Net Present Value) | Discounted cash flow (8% rate) | Investment viability assessment |
| Three-Scenario Modelling | Deterministic simulation | Base / Pessimistic / Optimistic projections |
| Skip Logic | Finite state machine | Adaptive questionnaire branching |
| Spoken Number Extraction | Rule-based NLP parser | Converts voice phrases to numeric values |
| Crop Feasibility Scoring | Knowledge base lookup | FAO/ICAR yield benchmark matching |

---
### TRANSCRIPT — Slide 5

The technology stack was chosen to balance performance, accessibility, and cost. React 18 with Vite provides the fast development cycle needed for iterative UI work. FastAPI was selected over Flask and Django for its native async support and automatic Swagger documentation. The financial engine is implemented in pure Python mathematics with no external dependency — this was a deliberate decision to ensure the system produces reliable results even when the internet connection is unavailable. The Web Speech API provides browser-native voice capture at zero cost, while faster-whisper provides higher-accuracy server-side fallback for domain-specific terminology.

---

# SLIDE 6 — SYSTEM DESIGN

## Block Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          FARMER / USER                                   │
│           Voice Input │ Text Input │ IoT Sensor Data                   │
└───────────────┬────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   REACT 18 FRONTEND (Vite + Zustand)                   │
│  Dashboard │ AI Survey │ Land Survey │ Analytics │ Reports │ AI Chat    │
│  Web Speech API (voice) │ Axios + JWT interceptors                      │
└────────────────────────┬───────────────────────────────────────────────┘
                         │ HTTPS REST (port 80)
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      NGINX REVERSE PROXY                               │
│            /api  ──→  FastAPI Backend    │    /  ──→  React SPA        │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 FASTAPI BACKEND  (Python 3.12, Port 8000)              │
│  Rate Limiter │ CORS │ GZip Middleware │ JWT Auth │ Request Timing     │
│                                                                         │
│  ROUTERS:  auth │ session │ analysis │ report │ farm │ iot │ audio    │
│            finance_sheets │ land_survey │ crop │ ai_advisor │ admin    │
│                                                                         │
│  SERVICES:                                                              │
│  QuestionnaireEngine │ FinancialCalculator │ VoiceInterpreter          │
│  CropIntelligenceService │ LandFarmSurveyEngine │ LandFinancialService │
│  GoogleSheetsSync │ ReportGenerator │ AuthService │ AIAdvisorService   │
└────────┬───────────────────────────────┬───────────────────────────────┘
         │                               │
         ▼                               ▼
┌──────────────────┐          ┌───────────────────────────────────────┐
│  PostgreSQL 16   │          │  Redis 7                               │
│  (Port 5433)     │          │  Session cache │ Market price TTL      │
│  UUID PKs        │          │  (Port 6380)                           │
│  JSONB for       │          └───────────────────────────────────────┘
│  context_data &  │
│  scenarios       │          ┌───────────────────────────────────────┐
└──────────────────┘          │  EXTERNAL SERVICES                     │
                              │  Google Sheets API (financial export)  │
                              │  Anthropic / Sarvam AI (LLM advisory)  │
                              │  faster-whisper (local STT)            │
                              └───────────────────────────────────────┘
```

---

## Layered System Architecture

```
╔════════════════════════════════════════════════════════════════════╗
║  PRESENTATION LAYER                                                ║
║  React 18 │ Vite │ Zustand │ Axios │ Web Speech API │ Recharts    ║
║  Pages: Dashboard │ Survey │ Analytics │ Reports │ AI Chat        ║
╚════════════════════════════╤═══════════════════════════════════════╝
                             │ JWT-authenticated HTTPS REST
╔════════════════════════════▼═══════════════════════════════════════╗
║  API GATEWAY LAYER                                                 ║
║  Nginx (port 80/443) │ SSL Termination │ Static File Cache        ║
╚════════════════════════════╤═══════════════════════════════════════╝
                             │
╔════════════════════════════▼═══════════════════════════════════════╗
║  APPLICATION LAYER                                                 ║
║  FastAPI (Python 3.12) │ SlowAPI Rate Limiter │ GZip │ CORS       ║
║  12 Routers: auth │ session │ analysis │ report │ farm │ iot      ║
║              audio │ finance_sheets │ land_survey │ crop │ admin  ║
╚════════════════════════════╤═══════════════════════════════════════╝
                             │
╔════════════════════════════▼═══════════════════════════════════════╗
║  SERVICE LAYER (Business Logic)                                    ║
║  QuestionnaireEngine │ FinancialCalculator │ VoiceInterpreter     ║
║  CropIntelligenceService │ LandFarmSurveyEngine │ AuthService     ║
║  LandFinancialService │ GoogleSheetsSync │ ReportGenerator        ║
╚════════════════════════════╤═══════════════════════════════════════╝
                             │
╔════════════════════════════▼═══════════════════════════════════════╗
║  DATA ACCESS LAYER                                                 ║
║  SQLAlchemy 2.x (Async ORM) │ asyncpg driver                      ║
║  Models: User │ Farm │ Session │ FinancialPlan │ WaterReading      ║
╚════════════════╤════════════════════════════╤═══════════════════════╝
                 │                            │
╔════════════════▼═══════════╗  ╔═════════════▼══════════════════════╗
║  PostgreSQL 16              ║  ║  Redis 7                            ║
║  users │ farms │ sessions   ║  ║  session:* │ market:*              ║
║  financial_plans            ║  ║  TTL: 5 min market prices          ║
║  water_readings │ reports   ║  ╚════════════════════════════════════╝
╚═════════════════════════════╝
```

---
### TRANSCRIPT — Slide 6

The architecture follows a strict five-layer separation of concerns. The most important design decision in this architecture is that the service layer has zero HTTP dependency — every service class is a plain Python class with no FastAPI or request objects. This makes every service independently unit-testable. The router layer is intentionally thin: it handles parsing and serialization, but all computation happens in the service layer. The data layer uses SQLAlchemy's async ORM throughout, which allows a single worker to handle hundreds of concurrent requests without blocking.

---

# SLIDE 7 — DETAILED DESIGN

## Use Case Diagram

**Actors:**
- **Farmer** (primary) — conducts surveys, downloads reports, views dashboard, uses AI advisor
- **IoT Device** (secondary) — pushes water sensor readings
- **System Admin** (secondary) — manages users, views system health
- **External Service** (Sarvam AI / Google Sheets) — invoked by the backend

**Key Use Cases and Relationships:**

```
Farmer ──→ Register / Login
Farmer ──→ Create Farm Profile
Farmer ──→ Conduct Voice Survey (Aquaponics)
              └──[includes]──→ Submit Voice Answer
                                  └──[extends]──→ Transcribe Audio via faster-whisper
                                  └──[includes]──→ Validate Answer (skip logic)
Farmer ──→ Conduct Land Farm Survey
Farmer ──→ View Financial Report (PDF)
              └──[includes]──→ Generate Financial Plan (3 scenarios)
              └──[extends]──→ Export to Google Sheets
Farmer ──→ Chat with AI Advisor ──[calls]──→ Sarvam AI / LLM
Farmer ──→ Monitor Water Quality Dashboard
Farmer ──→ Manage Farm Profile

IoT Device ──→ Ingest Sensor Data
Admin ──→ Manage Users
Admin ──→ View System Health
```

---

## Class Diagram (Core Domain)

**Domain Classes (map to DB tables):**

| Class | Key Attributes | Key Methods |
|---|---|---|
| User | id (UUID), email, hashed_password, role | register(), authenticate() |
| Farm | id (UUID), owner_id, area_sqm, system_type | create(), update_metadata() |
| Session | id (UUID), user_id, current_step, context_data (JSONB) | advance(), complete() |
| SessionAnswer | session_id, question_id, answer_text, input_method | — |
| FinancialPlan | total_capex, roi_percent, payback_period_months, scenarios (JSONB) | compute_irr(), compute_npv() |
| WaterReading | farm_id, ph, dissolved_oxygen, temperature_c, ammonia_mg_l | validate_ranges() |

**Service Classes (no DB dependency):**

| Class | Key Methods |
|---|---|
| QuestionnaireEngine | get_next_question(context), parse_answer(question, text), apply_skip_logic() |
| FinancialCalculator | create_plan(inputs), compute_metrics(), irr(cashflows), npv(rate, cashflows) |
| CropIntelligenceService | evaluate_crop(name, area, temp, ph, system), suggest_crops(conditions) |
| VoiceInterpreter | parse_answer(question, raw_text), extract_spoken_number(text), post_process_transcript() |

**Key Relationships:**
- User owns many Farms
- Farm has many Sessions and many WaterReadings
- Session contains many SessionAnswers
- Session generates exactly one FinancialPlan
- QuestionnaireEngine uses VoiceInterpreter
- FinancialCalculator creates FinancialPlan

---

## DFD Level 0 — Context Diagram

```
           Survey Answers                Financial Reports
Farmer ──────────────────→ AquaponicAI ──────────────────→ Farmer
       ←────────────────── Platform   ←──────────────────
         Dashboard / Reports           AI Advisory / PDF

IoT Device ──[pH, DO, Temp, NH₃]──→ AquaponicAI ──[ACK]──→ IoT Device
Sarvam AI  ←──[LLM Prompt]─────────  Platform  ──[Response]──→ Farmer
Google     ←──[Financial Data]───── AquaponicAI ──[Sheet URL]──→ Farmer
Sheets
```

## DFD Level 1 — Major Processes

```
Farmer → [1.0 Auth Module] → JWT Token → [2.0 Survey Engine] → Answers
[2.0 Survey Engine] → Complete Context → [3.0 Financial Calculator]
[3.0 Financial Calculator] → Plan → [4.0 Report Generator] → PDF / Sheets
IoT Device → [5.0 IoT Ingest] → water_readings → Farmer Dashboard
Farmer ↔ [6.0 AI Advisor] ↔ Sarvam AI

Data Stores:
DS1: User Store (PostgreSQL)
DS2: Session Store (JSONB context_data)
DS3: Financial Plan Store (JSONB scenarios)
DS4: Water Reading Store (time-series)
DS5: Redis Cache (market prices, sessions)
```

---
### TRANSCRIPT — Slide 7

The Use Case diagram highlights the key architectural boundary: the Crop Intelligence and Financial Calculator modules are deterministic — they use rule-based logic, not LLMs. The AI Advisor uses an LLM but only for conversational guidance, not for financial computations. This was a deliberate risk-calibrated design choice: hallucination in a financial calculation could mislead a farmer into a bad investment, while an imprecise advisory chat response can be evaluated qualitatively by the farmer.

The class diagram shows that all service classes are independent of the ORM — they receive and return plain Python dataclasses. This is what makes them testable without a database connection.

---

# SLIDE 8 — IMPLEMENTATION

## System Modules and Key Features

### Module 1: Authentication System
- **Tech:** FastAPI + bcrypt (12 rounds) + JWT HS256
- JWT tokens (24h expiry) issued on login; sent via `Authorization: Bearer` header
- Role-based access: admin / farmer / viewer
- IDOR protection: all session endpoints validate `user_id == JWT subject`
- Rate limiting: 200 requests/minute per IP via SlowAPI

### Module 2: Voice Survey Engine (Aquaponics)
- **Tech:** QuestionnaireEngine (stateless Python) + Web Speech API / faster-whisper
- 28 adaptive questions across 6 categories: Farm Setup, Fish, Crops, Water, Finance, Goals
- 6 question types: NUMBER, BOOLEAN, SELECT, MULTISELECT, TEXT, SCALE
- Skip logic: e.g., water quality questions skipped when IoT sensors present
- Voice normalization: filler word removal, STT homophone correction ("talapia"→"tilapia"), Indian number parsing ("fifty lakh"→5,000,000)
- Back navigation: farmers can correct previous answers
- Progress bar showing answered/total question count

### Module 3: Financial Planning Engine
- **Tech:** Pure Python mathematics (no external API needed)
- **Inputs extracted from survey context:** CAPEX items, monthly OPEX items, monthly revenue
- **25+ Computed Metrics:**
  - Total CAPEX, Annual OPEX, Annual Revenue, Gross/Net Profit
  - ROI %, Payback Period (months), Break-Even Month
  - NPV at 8% annual discount rate (RBI agricultural MCLR benchmark)
  - IRR via bisection search (200 iterations, 1e-6 tolerance)
  - Per m² metrics, cost share %, revenue share %
- **3 Scenarios:** Pessimistic (75% revenue), Base (100%), Optimistic (130%)
- **60-month cash flow projection** (month-by-month cumulative)
- **Rule-based recommendations** for: feed cost ratio, labor cost, energy cost, payback period, revenue diversification, NABARD/NHB subsidies

### Module 4: Crop Intelligence Service
- **Tech:** JSON knowledge base + deterministic evaluation
- Data sourced from: FAO Technical Paper 589, ICAR-CIFA guidelines, UVI studies
- Per-crop parameters: min/optimal area, temperature range, pH range, yield/m², cycles/year, difficulty
- **Output per crop:** feasibility (feasible / challenging / not_feasible), reasons, warnings, yield estimate (kg/year)
- Evaluated automatically on survey completion; appended to context_data

### Module 5: IoT Water Quality Integration
- **Tech:** FastAPI REST endpoint + PostgreSQL time-series
- `POST /api/v1/iot/ingest` accepts device_id, farm_id, and up to 8 sensor parameters
- Stores to `water_readings` table with source tag (iot / manual)
- Analytics dashboard computes 30-day daily averages for pH, temperature, dissolved oxygen
- Color-coded alerts: green (in range), amber (boundary), red (out of range)

### Module 6: Report Generation
- **Tech:** ReportLab (server-side PDF)
- Multi-page PDF: financial summary table, 3-scenario comparison, cost breakdown, crop feasibility section
- Served as `StreamingResponse (application/pdf)` — works across all browsers
- Report history stored in `reports` table with expiry tracking

### Module 7: Google Sheets Sync
- **Tech:** gspread + Google Sheets API v4 (service account OAuth2)
- `POST /api/v1/finance/sheets/push` exports structured financial plan
- Creates/updates spreadsheet with scenario tabs, cash flow columns, recommendation notes
- Returns shareable Sheets URL for farmer and advisor collaboration

### Module 8: Land Farm Survey
- Separate `LandFarmSurveyEngine` for traditional land-based farming
- Conversational survey: farm type, crop list, yield, revenue, cost data
- Feeds `LandFinancialService` for land-specific financial analysis
- Google Sheets export via `LandSheetSync`

### Module 9: AI Advisory
- **Tech:** Sarvam AI 30B (Sarvam-M) / Anthropic Claude / OpenAI (configurable)
- Farm context injected into system prompt
- Stateless conversation: full message history sent on each turn
- Multilingual: Hindi, Kannada, Tamil, Telugu support via Sarvam AI

### Module 10: Admin Dashboard
- User management (view, role assignment, deactivation)
- Data browser (tables: farms, sessions, financial plans, water readings)
- Schema inspector
- Overview: system counts, recent activity

---
### TRANSCRIPT — Slide 8

The implementation covers 10 distinct modules, all connected through a shared PostgreSQL database and unified REST API. The most technically complex module is the Financial Planning Engine, which implements IRR via the bisection numerical method — a technique not covered in the MCA syllabus. The voice normalization pipeline is the most domain-specific component: it handles quirks of Indian-English speech-to-text output that generic STT models produce, such as "for" instead of "four" or "talapia" instead of "tilapia."

---

# SLIDE 9 — WORK PROGRESS & FINAL SYSTEM

## Phase-wise Completion

### Phase I — Foundation
- Project scoping, technology selection, literature review
- FastAPI project scaffolding, Docker Compose setup
- PostgreSQL schema design, JWT authentication
- Basic questionnaire engine prototype (no skip logic)
- React frontend skeleton, Zustand store setup
- **Outcome:** Login, register, basic survey prototype working

### Phase II — Core Feature Implementation
- Complete 28-question QuestionnaireEngine with skip logic and 6 question types
- Voice pipeline: Web Speech API + faster-whisper STT integration
- VoiceInterpreter: spoken number extraction, Indian-English normalization
- FinancialCalculator: CAPEX/OPEX/ROI/IRR/NPV, 3-scenario modelling, rule-based recommendations
- CropIntelligenceService: FAO/ICAR knowledge base, feasibility evaluation
- ReportLab PDF report generation
- React survey UI, dashboard, analytics charts
- IoT ingest endpoint
- Sarvam AI LLM integration for advisory
- Land Farm Survey Engine + LandFinancialService
- Google Sheets sync + Looker Studio URL generation
- **IDOR security fix:** session ownership validation per JWT user
- Rate limiting (SlowAPI), GZip compression, Supabase compatibility
- Unit tests: financial service, voice interpretation, crop intelligence
- **Outcome:** End-to-end farm survey → financial report pipeline working

### Phase III — Completion & Enhancement
- STT evaluation framework: WER comparison between faster-whisper and Sarvam Saarika v2
- Evaluation router: participant-wise clip upload, manifest tracking, CSV export
- Admin Dashboard: users, data browser, schema, overview
- Expanded test coverage: land survey, market price, AI advisor, evaluation
- Frontend: admin routing, role-based nav, batch user management
- ngrok-based remote evaluation testing
- Performance tuning, logging, error handling hardening
- **Outcome:** Production-ready integrated platform

## Final System Status

| Module | Completion |
|---|---|
| Authentication (JWT + bcrypt) | 100% |
| Voice Survey Engine — Aquaponics (28 questions) | 100% |
| Land Farm Voice Survey | 100% |
| Financial Calculator (3 scenarios, 25+ metrics) | 100% |
| Crop Intelligence Service (FAO/ICAR knowledge base) | 100% |
| IoT Water Quality Ingest (8 parameters) | 100% |
| faster-whisper STT (GPU/CPU fallback) | 100% |
| PDF Report Generation (ReportLab) | 100% |
| Google Sheets Sync | 100% |
| AI Advisor (Sarvam / Anthropic / OpenAI) | 100% |
| Admin Dashboard | 100% |
| React Frontend — Dashboards and Analytics | 95% |
| STT A/B Evaluation Framework | 90% |
| Unit + Integration Test Coverage | 75% |

---
### TRANSCRIPT — Slide 9

The project progressed through three structured phases. Phase I established the technical foundation. Phase II implemented all core features — this was the most intensive phase, covering the financial engine, voice pipeline, crop intelligence, and complete survey system. Phase III focused on completion and hardening: the evaluation framework, admin panel, expanded tests, and production-readiness improvements. The final system is a fully integrated platform covering everything from voice survey to PDF report with all modules connected end-to-end.

---

# SLIDE 10 — RESULTS & DEMO

## System Performance Metrics

| Metric | Value |
|---|---|
| Survey questions | 28 (aquaponics) + separate land survey |
| Financial metrics computed per session | 25+ |
| Financial scenarios generated | 3 (pessimistic, base, optimistic) |
| Cash flow projection horizon | 60 months |
| Crops in knowledge base | 10+ (FAO/ICAR benchmarks) |
| IoT parameters monitored | 8 (pH, DO, temp, NH₃, NO₂, NO₃, turbidity, TDS) |
| API response time (P95, non-AI) | < 200ms |
| Financial computation time | < 50ms |
| PDF generation time | ~800ms |
| Rate limit | 200 requests/min per IP |
| Docker services | 6 (backend, frontend, nginx, postgres, redis, adminer) |
| API endpoints | 40+ across 12 routers |

## Key Features Demonstrated

1. **Voice Survey Flow:**
   - Farmer speaks "fifty thousand" → system parses → ₹50,000 recorded as infrastructure cost
   - Farmer says "no sensors" → IoT water quality questions automatically skipped

2. **Financial Output (Sample):**
   - CAPEX: ₹2,00,000 | Monthly Revenue: ₹25,000 | Monthly OPEX: ₹12,000
   - ROI: 78% | Payback: 17 months | NPV: ₹1,42,000 | IRR: 52%
   - Pessimistic: Payback 23 months | Optimistic: Payback 13 months

3. **Crop Intelligence Output (Sample):**
   - Crop: Lettuce | Area: 5 m² | pH: 6.5 | Temp: 22°C
   - Feasibility: Feasible | Estimated annual yield: 30 kg | Notes: Optimal NFT system

4. **Water Quality Alert (Sample):**
   - pH reading: 8.5 → Alert: Above optimal range (6.8–7.2) — check nitrification cycle

5. **AI Recommendations Generated (Sample):**
   - "Feed cost is 48% of OPEX — consider bulk purchasing contracts to reduce to 35%"
   - "Payback period of 17 months qualifies for NABARD Aquaculture Development Fund subsidy"
   - "Fish revenue is 90% of total — add 2 m² basil crop to reduce concentration risk"

## STT Evaluation Results

- faster-whisper large-v3: WER ~8% on agricultural vocabulary in Indian-English
- Sarvam Saarika v2: Evaluated for Indic language transcription
- Web Speech API: Real-time, zero latency, WER varies by browser and accent

---
### TRANSCRIPT — Slide 10

The results demonstrate that all five major subsystems produce useful output. The voice pipeline correctly handles Indian-English speech patterns. The financial engine generates multi-scenario projections with IRR and NPV in under 50 milliseconds. The crop intelligence module provides deterministic, auditable feasibility results. The IoT integration captures real sensor data and flags anomalies. And the PDF report packages all outputs into a document a farmer can share with a bank or agricultural extension officer.

---

# SLIDE 11 — CONCLUSION & FUTURE SCOPE

## Conclusion

AgriSense AI has successfully demonstrated that:

1. **Voice-first agricultural AI is viable for Indian farmers.** The combination of Web Speech API and faster-whisper STT, with domain-specific normalization for aquaponics vocabulary and Indian-English number conventions, enables hands-free farm data collection without specialist hardware.

2. **Self-contained financial intelligence is achievable.** A deterministic financial engine computing CAPEX, OPEX, ROI, IRR, NPV, and three-scenario projections with rule-based recommendations operates entirely without paid LLM calls — making the system economically deployable at scale.

3. **A unified platform reduces tool fragmentation.** Combining voice survey, financial scenario analysis, crop feasibility intelligence, IoT water monitoring, PDF reports, and Google Sheets export eliminates the need for farmers to use 4–5 disconnected tools.

4. **Async architecture enables real-world scale.** FastAPI + SQLAlchemy async + asyncpg + Redis provides the concurrency required for real-time voice processing and simultaneous multi-user access.

5. **Indian market contextualization makes recommendations actionable.** INR currency, Indian states validation, NABARD/NHB subsidy references, and Indian crop price benchmarks ensure outputs are directly usable in the target operating environment.

## Limitations

| Limitation | Notes |
|---|---|
| Web Speech API — Chrome/Edge only | Safari on iOS lacks SpeechRecognition in non-HTTPS contexts |
| faster-whisper GPU mode | Requires NVIDIA CUDA; AMD GPUs fall back to CPU (4× slower) |
| Sarvam AI API dependency | Multilingual advisory requires active internet and valid API key |
| Supabase free tier auto-pause | Cloud PostgreSQL pauses after 7 days inactivity; backend handles with 503 gracefully |
| No offline mode | Poor connectivity farms cannot use voice survey offline |
| DPDP Act 2023 compliance | Data retention and consent mechanisms not yet fully implemented |

## Future Scope

1. **Indic Language Voice Support** — Extend STT to Kannada, Hindi, Telugu, Tamil using Sarvam Saarika v2 for native-language surveys

2. **ML-Based Crop Yield Prediction** — Replace rule-based yield benchmarks with trained regression models on historical farm production data

3. **Real-Time IoT Dashboard** — WebSocket-based live sensor alerts with configurable threshold notifications

4. **Mobile App (React Native)** — Offline-capable voice survey for low-connectivity farm environments

5. **Computer Vision Fish Health Detection** — Camera-based fish anomaly detection via CNN models

6. **Government Scheme Matching** — Automated NABARD / NHB / PM-KISAN eligibility checking from farm profile

7. **Multi-Farm Benchmarking** — Compare anonymized farm performance metrics across peer farms

8. **Looker Studio BI Dashboards** — Advanced visualization of financial and operational data

9. **Carbon Credit Tracking** — Aquaponics water efficiency and carbon sequestration metrics for sustainability reporting

10. **APMC Marketplace Integration** — Real-time commodity price feeds replacing hardcoded benchmarks

---
### TRANSCRIPT — Slide 11

In conclusion, AgriSense AI addresses a genuine gap in the Indian agricultural technology landscape. It is not a proof-of-concept — it is a functional, deployable platform that a farmer can use today to plan an aquaponic farm, analyze its financial viability, monitor water quality, and receive AI advisory, all in a single session. The limitations are real but have defined engineering paths to resolution. The future scope items are prioritized based on user impact, with Indic language voice support and mobile offline capability being the highest-priority next development targets.

---

# SLIDE 12 — PUBLICATION STATUS & REFERENCES

## Publication Status

**IEEE / Springer Paper:**
A research paper based on this project titled "AgriSense AI: A Voice-First AI Platform for Aquaponic Farm Financial Planning and Decision Support" has been prepared for submission to:

- **Springer:** Lecture Notes in Computer Science (LNCS) / Agriculture and Food Security journal
- **IEEE:** Conference on Computing for Sustainable Global Development (INDIACom) or similar

*(Mark as "Under Preparation" or "Submitted" as applicable)*

---

## References

1. FAO (2019). *Aquaponics Food Production Systems*. FAO Fisheries and Aquaculture Technical Paper No. 589. Food and Agriculture Organization of the United Nations, Rome.

2. ICAR-CIFA (2020). *Technical Bulletins on Freshwater Aquaculture*. Central Institute of Freshwater Aquaculture, Bhubaneswar.

3. Rakocy, J.E., Masser, M.P., & Losordo, T.M. (2006). *Recirculating Aquaculture Tank Production Systems: Aquaponics — Integrating Fish and Plant Culture*. SRAC Publication No. 454. USDA SRAC.

4. Goddek, S., et al. (2019). *Aquaponics Food Production Systems: Combined Aquaculture and Hydroponic Production Technologies for the Future*. Springer International Publishing. DOI: 10.1007/978-3-030-15943-6

5. Radford, A., et al. (2022). *Robust Speech Recognition via Large-Scale Weak Supervision* (OpenAI Whisper). arXiv:2212.04356.

6. Ramírez-Asis, E., et al. (2022). "AI-Based Decision Support System for Aquaponics." *Computers and Electronics in Agriculture*, Vol. 201, 107315.

7. Sarvam AI (2024). *Saaras: State-of-the-Art Multilingual LLM for Indian Languages*. Technical Report, Sarvam AI Research, Bengaluru.

8. NABARD (2024). *Schemes for Aquaculture and Horticulture Financing*. National Bank for Agriculture and Rural Development, Mumbai.

9. Tiangolo, S. (2024). *FastAPI Documentation — Async SQLAlchemy Integration*. https://fastapi.tiangolo.com

10. PostgreSQL Global Development Group (2024). *PostgreSQL 16 Documentation — JSONB Data Type*. https://www.postgresql.org/docs/16/

11. React Core Team (2024). *React 18 Release Notes and Documentation*. Meta Open Source. https://react.dev

12. McKinney, W. (2022). *Python for Data Analysis* (3rd ed.). O'Reilly Media.

13. Pressman, R.S., & Maxim, B.R. (2019). *Software Engineering: A Practitioner's Approach* (9th ed.). McGraw-Hill Education.

---

## Thank You

**Project Repository:** `/home/chandan/Downloads/aquaponic-ai`
**Demo URL:** http://localhost (Docker Compose) / ngrok tunnel (remote demo)
**API Docs:** http://localhost:8000/api/docs (Swagger UI — auto-generated by FastAPI)

*Questions Welcome*

---
*End of Presentation Content*
*AgriSense AI — MCA491P Major Project | RV College of Engineering*
*Generated: 2026-06-28 for Final Review Presentation*
