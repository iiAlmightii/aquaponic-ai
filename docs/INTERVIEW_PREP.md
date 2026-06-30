# FarmConnect — Interview Preparation Guide

> Keep this file updated as the project evolves. Every new feature = new talking points.

---

## Elevator Pitch (30 seconds)

> "I built FarmConnect, an AI-powered farm management platform for Indian farmers. It combines voice-first surveys in 6 Indian languages, real-time financial planning with three-scenario forecasting, crop feasibility analysis using ICAR agronomic data and live weather APIs, and an AI advisor powered by Sarvam's 30B model. The entire system is containerised with Docker, deployed across Vercel, Render, and Supabase, and includes a research evaluation pipeline that compared two STT systems across 320 audio clips from 9 speakers."

---

## Tech Stack — Know This Cold

### Backend
- **FastAPI** — async Python web framework; chosen for automatic OpenAPI docs, Pydantic validation, and async-first design
- **SQLAlchemy (async)** — ORM with asyncpg driver for PostgreSQL; UUID primary keys throughout
- **PostgreSQL 16** — main database; JSONB for flexible survey context storage, GIN indexes for fast querying
- **Redis 7** — caching layer for corrections analytics and session state
- **Supabase** — managed PostgreSQL + auth; using as DB host with connection pooler (pgbouncer)
- **JWT authentication** — access + refresh token pattern; bcrypt for password hashing
- **pydantic-settings** — type-safe environment variable loading

### Frontend
- **React 18 + TypeScript** — component-based UI
- **Vite** — build tool; significantly faster than CRA
- **Zustand** — lightweight global state; chose over Redux for simplicity
- **Tailwind CSS v4** — utility-first styling
- **Recharts** — financial charts (area, bar, pie)
- **motion/react** — animations (Framer Motion rebranded)
- **@react-oauth/google** — Google OAuth integration

### AI/ML
- **Sarvam AI** — STT (saarika:v2.5), LLM (sarvam-30b), translation (mayura:v1)
- **faster-whisper** — local Whisper inference with CTranslate2 backend
- **ICAR crop knowledge base** — 30 crops with agronomic thresholds (temperature, pH, rainfall, soil)
- **IMD climate normals** — 31-state static dataset for crop feasibility

### Infrastructure
- **Docker Compose** — multi-service orchestration (backend, frontend, nginx, postgres, redis)
- **Nginx** — reverse proxy; terminates SSL, routes /api/* to backend, / to frontend
- **Render.com** — backend hosting (free tier)
- **Vercel** — frontend hosting (auto-deploys on git push)
- **Upstash** — serverless Redis

---

## Architecture — Be Ready to Draw This

```
Browser (React)
      │ HTTPS
      ▼
   Nginx (80/443)
      ├── /api/* ──► FastAPI (8000)
      │                  ├── Supabase PostgreSQL
      │                  ├── Upstash Redis
      │                  ├── Sarvam AI (STT, LLM, translate)
      │                  └── ICAR/IMD data (embedded JSON)
      └── /* ──────► React SPA (nginx:3001)
```

---

## Key Features — Talking Points

### 1. Voice Survey Pipeline
- User speaks → audio captured by MediaRecorder API (webm/opus)
- Audio POSTed to `/audio/transcribe` → Sarvam saarika:v2.5 → transcript
- Transcript through post-processing (filler removal, number normalisation)
- Confidence-based retry logic (low confidence → second attempt without VAD)
- User corrections stored in `stt_corrections` table → feed back into Whisper initial_prompt

### 2. Multilingual Support
- 6 languages: English, Hindi, Kannada, Tamil, Telugu, Marathi
- Questions translated at session start via Sarvam mayura:v1 translate API
- Translation cache pre-warmed at server startup (29 questions × 5 languages)
- TTS reads questions aloud using browser speechSynthesis API

### 3. Financial Planning Engine
- Three scenarios: base, pessimistic (-20% revenue), optimistic (+20% revenue)
- Computes: CAPEX, OPEX, monthly cash flow, NPV, IRR, break-even month, payback period
- Excel export with 3 sheets: Summary, Monthly Cash Flow, AI Recommendations

### 4. Crop Feasibility Module
- Scores crops 0–100 based on: temperature, humidity, rainfall, pH, soil type, area
- Uses live weather from OpenWeatherMap + IMD 30-year climate normals as fallback
- Knowledge base: 30 crops (6 aquaponic + 24 Indian Kharif/Rabi) with ICAR data
- Alternatives recommended when score < 50 with suitable Indian states

### 5. STT Evaluation Pipeline
- Recorded 320 clips from 9 speakers across 4 script groups
- Compared faster-whisper vs Sarvam saarika:v2.5 using WER (jiwer library)
- Results stored in CSV; summary in Markdown for paper integration

### 6. Admin Panel
- Role-based access: admin/farmer/viewer
- Platform-wide stats, user management (CRUD + role assignment)
- Database schema viewer (reads information_schema.columns)
- N+1 query optimised with correlated subqueries

---

## Design Decisions — "Why did you choose X over Y?"

**Why FastAPI over Django/Flask?**
Async-first design matches the IO-heavy workload (DB queries, external API calls). Auto-generated OpenAPI docs saved documentation time. Pydantic integration for request validation.

**Why Supabase over raw PostgreSQL?**
Managed service eliminates ops overhead. Built-in connection pooler (pgbouncer) handles high concurrency. Row-level security available if needed later.

**Why Zustand over Redux?**
Redux overhead (actions, reducers, slices) is excessive for a single-developer project. Zustand's hook-based API is simpler and the bundle is 1/10th the size.

**Why Docker Compose over Kubernetes?**
Project scale doesn't justify Kubernetes complexity. Compose provides reproducible environments across laptop, lab machine, and CI without orchestration overhead.

**Why Sarvam over OpenAI for STT?**
Sarvam is India-specific, trained on Indian accent data. OpenAI Whisper has weaker performance on Indian English and regional language code-switching. Empirically validated via the WER evaluation.

**Why JSONB for session answers?**
Survey questions evolve; different survey types (aquaponic vs land) have different fields. Rigid schema would require migrations for every change. JSONB with GIN index gives flexibility + queryability.

---

## System Design Questions

**Q: How would you scale this to 10,000 concurrent users?**
- Replace single Uvicorn worker with multiple workers + load balancer
- Move STT processing to an async job queue (Celery + Redis)
- Add read replicas for PostgreSQL (analytics queries separated from writes)
- Cache translation results in Redis (currently in-memory, lost on restart)
- CDN for static frontend assets

**Q: How do you handle STT failures gracefully?**
- Confidence threshold check: if score < 0.45, retry without VAD filter
- User can manually type answer if voice fails
- Corrections loop: user corrections stored → feed back into model's initial_prompt next session
- 90-second timeout (up from 30s) to handle slow CPU inference

**Q: How is security handled?**
- JWT with short-lived access tokens (60 min) + refresh tokens (7 days)
- Bcrypt password hashing
- Role-based access control (admin/farmer/viewer) enforced at endpoint level
- CORS whitelist; no wildcard in production
- Environment variables via pydantic-settings (never hardcoded)
- Farm ownership validated on every request (user can't access other users' farms)

**Q: Explain the crop feasibility scoring algorithm.**
Starts at 100, applies deductions per environmental factor:
- Temperature outside absolute range: -40 pts
- Temperature outside optimal but within absolute: -15 pts
- Humidity outside range: -15 pts
- Annual rainfall outside range: -15 pts
- pH outside range: -20 pts
- Soil type mismatch: -10 pts
- Area below minimum: -30 pts
- Score clamped to [0,100]; tiers: Excellent(80+), Good(60+), Challenging(40+), Difficult(20+), Not Feasible(<20)

---

## Challenges Faced

1. **CORS + HTTPS on local network** — nginx needed self-signed certs to allow microphone access (Chrome requires HTTPS for getUserMedia on non-localhost origins)

2. **Render free tier OOM** — faster-whisper + NVIDIA CUDA libs = 1.5GB RAM; exceeded Render's 512MB limit. Fixed by creating `requirements-render.txt` without ML deps, using Sarvam STT in cloud

3. **Translation latency** — per-request Sarvam translate API calls added 5-8s delay before first question. Fixed by pre-warming the translation cache at server startup for all 29 questions × 5 languages

4. **Sarvam model deprecations** — sarvam-m → sarvam-30b (LLM), saarika:v2 → saarika:v2.5 (STT), mayura:v1 (still current). APIs change without notice; abstracted model names through config

5. **STT CUDA version mismatch** — Docker image CUDA runtime vs host driver version conflict. Resolved with correct compute_type and ensuring nvidia-container-toolkit is configured

6. **Session state desync** — after audio timeout, frontend session_id mismatched backend. Fixed with graceful re-sync: on "Expected answer for X, got Y" error, frontend re-fetches current session state

---

## Numbers to Know

- **9 survey participants** in STT evaluation study
- **320 audio clips** (40 per participant × 4 script groups)
- **29 questions** in aquaponic survey, ~20 in land survey
- **30 crops** in knowledge base (6 aquaponic + 24 Indian field crops)
- **31 Indian states/UTs** in IMD climate dataset
- **6 Indian languages** supported
- **3 financial scenarios** (base / pessimistic / optimistic)
- **5 services** in Docker Compose (backend, frontend, nginx, postgres, redis)

---

## Resume Bullet Points (Copy-Paste Ready)

```
• Built FarmConnect, a voice-first AI farm management platform for Indian farmers with
  multilingual support (6 languages) using Sarvam STT/LLM APIs and browser TTS

• Designed a financial planning engine generating 3-scenario projections (base/
  pessimistic/optimistic) with NPV, IRR, break-even, and payback period calculations

• Implemented crop feasibility scoring (0–100) using ICAR agronomic thresholds,
  live weather data, and embedded IMD 30-year climate normals across 31 Indian states

• Conducted empirical STT evaluation comparing faster-whisper vs Sarvam Saarika v2.5
  across 320 audio clips from 9 speakers using WER metrics (jiwer)

• Deployed production system with Docker Compose, nginx SSL termination, FastAPI backend
  on Render, React frontend on Vercel, PostgreSQL on Supabase, Redis on Upstash

• Built admin panel with role-based access, platform analytics, user management,
  and live database schema viewer using PostgreSQL information_schema
```

---

## What to Add Next (Future Improvements — Good Interview Discussion)

- **IndicWhisper (AI4Bharat)** — replace Sarvam STT with open-source fine-tuned model for Indian languages
- **IoT water quality monitoring** — pH/temp/DO sensors feeding real-time dashboard
- **Marketplace module** — connect farmers directly with buyers; price discovery
- **Federated learning** — improve crop recommendations from anonymised farm data without sharing raw data
- **PWA with offline mode** — surveys can be completed without internet, synced later

---

*Last updated: 2026-06-30*
*Commit: 92014c1*
