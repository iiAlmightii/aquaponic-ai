# AquaponicAI — 15-Minute Demo Script & Defense Guide

---

## HOW TO USE THIS FILE
- **[SCREEN]** = what you show on screen at that moment  
- **[SAY]** = what you say out loud  
- **[NOTE]** = private reminder, don't say this  
- Timestamps are approximate. Adjust to your pace.

---

## PART 1 — WALKTHROUGH (0:00 – 15:00)

---

### [0:00 – 1:00] Opening — Problem Statement

**[SAY]**  
"India has over 7 million hectares of freshwater resources, yet aquaponic farming — which integrates fish cultivation and hydroponics in a single ecosystem — is severely under-adopted due to three barriers: farmers don't know how to plan financially for it, they can't monitor water quality easily, and they lack access to agri-intelligence in their own language. AquaponicAI is a full-stack AI platform that solves all three."

**[SCREEN]** — Show the landing/login page of the running app (http://localhost:3001 or your live URL)

**[SAY]**  
"The system has three layers: a React 18 frontend, a FastAPI Python backend, and a PostgreSQL + Redis data layer — all containerized with Docker. Let me walk you through the live system."

---

### [1:00 – 2:30] Authentication & Onboarding

**[SCREEN]** — Click Register → fill in name, email, password → submit

**[SAY]**  
"Authentication uses JWT tokens signed with HS256, passwords stored as bcrypt hashes. On registration the user gets a farmer role by default. The backend returns a short-lived access token and a long-lived refresh token stored in an HTTP-only cookie to prevent XSS theft."

**[SCREEN]** — Show the Dashboard after login

**[SAY]**  
"On first login the dashboard is empty — no farms, no surveys. Let me show you how a farmer populates this."

---

### [2:30 – 5:00] Voice-Driven Aquaponic Survey

**[SCREEN]** — Navigate to Surveys → Start Aquaponic Survey

**[SAY]**  
"The core innovation is a voice-first questionnaire engine. Instead of filling a form, the farmer speaks their answers. Let me demo this."

**[SCREEN]** — Show the first question appearing: *"What is the name of your farm or project?"*

**[SAY]**  
"The questionnaire engine is a state-machine built in Python. It has 27 questions organized into categories: farm setup, fish data, crop data, water quality, financial inputs, and goals. It advances question-by-question and applies skip logic — for example, it will skip asking pH manually if the farmer already confirmed they have IoT sensors."

**[SCREEN]** — Click the microphone button and speak an answer (or type)

**[SAY]**  
"Voice input goes through faster-whisper — OpenAI's Whisper model optimized with CTranslate2 for GPU inference. We run the large-v3 model which handles English, Hindi, Kannada, Tamil, Telugu, and Marathi. The audio is transcribed server-side, then passed through our voice interpretation layer that strips filler words, handles number homophones like 'too' meaning 2, converts spoken Indian number scales — lakh, crore — to digits, and detects Whisper hallucinations like 'thank you for watching' on near-silent audio."

**[SCREEN]** — Complete 3–4 questions quickly via typed input to save time: farm name, location, area, fish species

**[SAY]**  
"Notice the progress bar — it tells the farmer how many questions remain. The system also confirms ambiguous voice answers back to the user before accepting."

**[SCREEN]** — Reach the financial questions section — fill in CAPEX (infrastructure, equipment, stock costs) and monthly OPEX/revenue numbers

**[SAY]**  
"Financial inputs are split into CAPEX — one-time capital expenditure — and OPEX — recurring monthly costs. This is an important financial distinction that most farmer-facing apps ignore."

**[SCREEN]** — Submit/complete the survey

---

### [5:00 – 7:30] Financial Planning Engine

**[SCREEN]** — Show the Report page or financial plan that was auto-generated

**[SAY]**  
"The moment the survey completes, the financial engine runs automatically. It computes three scenarios simultaneously."

**[SCREEN]** — Show the three scenario tabs: Pessimistic / Base / Optimistic

**[SAY]**  
"Base scenario uses the farmer's stated revenue. Pessimistic applies a 0.75x revenue multiplier. Optimistic applies 1.30x. For each scenario the engine calculates:
- Total CAPEX and annual OPEX
- Monthly cash-flow for every month of the planning horizon
- ROI — Return on Investment
- Payback period in months
- Break-even month — when cumulative cash-flow turns positive
- NPV — Net Present Value using an 8% annual discount rate
- IRR — Internal Rate of Return via bisection search

All of this is pure deterministic math — no AI hallucination risk in the numbers."

**[SCREEN]** — Show the AI recommendations section below the metrics

**[SAY]**  
"Below the metrics is a rule-based recommendation engine. It checks 8 financial health rules — cash-flow viability, feed cost share as a percentage of OPEX, labor ratio, utility cost ratio, payback period, revenue concentration risk between fish and crops, ROI readiness to scale, and per-square-metre productivity. Each finding has a priority tag — high, medium, or low — and concrete action items with rupee-level estimates."

**[SCREEN]** — Scroll through 2–3 recommendations

---

### [7:30 – 9:00] Dashboard — Analytics & KPIs

**[SCREEN]** — Navigate to Dashboard

**[SAY]**  
"The dashboard gives a farm-level overview. KPI cards show total farms, active surveys, and aggregated financial figures. The area chart shows projected monthly revenue versus cost. The bar chart shows revenue contributions by crop type. There is also a break-even progress indicator showing what percentage of the payback milestone has been reached."

**[SCREEN]** — Point out the charts (Recharts library)

**[SAY]**  
"The frontend uses Recharts for all data visualization — lightweight, composable, and works natively with React."

---

### [9:00 – 10:30] Crop Intelligence Module

**[SCREEN]** — Navigate to Farms → select a farm → Crop Intelligence (or the crop section)

**[SAY]**  
"The Crop Intelligence module answers the question: given my farm's water temperature, pH, system type, and area — which crops are actually feasible? This is a deterministic rule engine — not an LLM — so it gives reproducible, auditable answers."

**[SCREEN]** — Enter a crop query: e.g. Lettuce, area 50 m², temperature 24°C, pH 7.0

**[SAY]**  
"The knowledge base has 6 crops right now — lettuce, spinach, tomato, basil, mint, okra — with parameters sourced from FAO Document 589, ICAR-CIFA research, and University of the Virgin Islands aquaponic valuation studies. For each crop it checks minimum and optimal area thresholds, temperature range tolerances, pH range, and system type compatibility. It returns feasibility as feasible, challenging, or not-feasible, with reasons and suggestions."

---

### [10:30 – 12:00] IoT Water Quality Integration

**[SCREEN]** — Show API docs at /api/docs → IoT section → POST /api/v1/iot/ingest

**[SAY]**  
"The platform supports automated IoT sensor ingestion. A sensor can POST water readings — pH, temperature in Celsius, dissolved oxygen, and ammonia levels — to this endpoint. Readings are stored in the water_readings table with a source enum of 'iot' versus 'manual', so we can distinguish automated data from farmer-entered values."

**[SCREEN]** — Execute the endpoint in Swagger with sample values: pH 7.2, temperature 26.0, DO 6.5, ammonia 0.1

**[SAY]**  
"In a production deployment, Raspberry Pi sensors or commercial Arduino-based aquaponic controllers would POST here at regular intervals. The questionnaire engine also reads from this — if a farm has IoT readings, it skips asking the farmer to manually enter pH and temperature."

---

### [12:00 – 13:30] AI Advisor & Google Sheets Sync

**[SCREEN]** — Show the Floating Advisor (FAB button in bottom-right)

**[SAY]**  
"The AI Advisor is a persistent floating assistant available on every screen. It shows Today's Insights — context-aware chips based on the farm's current data. Clicking it opens a chat panel powered by Claude or OpenAI depending on the deployment configuration. The backend is provider-agnostic — we set DEFAULT_LLM_PROVIDER in the environment."

**[SCREEN]** — Show Finance → Google Sheets Sync option (or the /finance/sheets endpoint in Swagger)

**[SAY]**  
"Financial plans can be synced to Google Sheets. The farmer gets a spreadsheet they can share with investors or banks. The sync is pull-based — the sheet polls our API rather than us pushing, which means it works even when the farmer's connectivity is intermittent."

---

### [13:30 – 14:30] System Architecture & DevOps

**[SCREEN]** — Show docker-compose.yml in the editor

**[SAY]**  
"The entire stack runs in Docker Compose. Five services: the FastAPI backend on port 8000, the React + Nginx frontend on port 3001, an Nginx reverse proxy on port 80 that routes /api to the backend and everything else to the frontend SPA, PostgreSQL 16 on port 5433, and Redis 7 on port 6380. Adminer is also available on port 8080 for database inspection."

**[SCREEN]** — Show GET /health in browser

**[SAY]**  
"There is a health endpoint that checks both the application and the database connectivity in real time. This supports automated container health checks and graceful degradation — if the database is unreachable, the API still starts and returns a 503 with a human-readable message rather than crash-looping."

---

### [14:30 – 15:00] Closing

**[SAY]**  
"To summarize — AquaponicAI is an end-to-end platform that takes a farmer from zero knowledge to a detailed 3-scenario financial plan entirely through voice, in multiple Indian languages, with rule-based crop intelligence and IoT integration. The tech stack is modern, containerized, and production-ready. Thank you."

---

---

## PART 2 — GUIDE Q&A DEFENSE

---

### ARCHITECTURE & DESIGN

---

**Q: Why FastAPI and not Django or Flask?**

FastAPI was chosen for three specific reasons that matter for this use case:
1. **Native async support** — the IoT ingestion endpoint and voice transcription are I/O-bound and benefit directly from async request handling. Django's ORM is synchronous by default; Flask has no built-in async story.
2. **Automatic OpenAPI docs** — `/api/docs` is generated from the type annotations with zero extra code. This was essential for rapid iteration with the IoT device integration.
3. **Pydantic v2 validation** — input validation is declarative, not imperative. Every API request is automatically type-checked before reaching the business logic layer.

Flask could have worked for a simple CRUD API, but the combination of async, type safety, and auto-docs made FastAPI the right call for a platform with this many domain-specific data structures.

---

**Q: Why PostgreSQL and not MongoDB for storing the JSONB financial data?**

PostgreSQL with JSONB is a deliberate hybrid choice. The relational parts — users, farms, sessions, readings — have fixed schemas and benefit from foreign key constraints and indexed joins. The financial plan scenarios are genuinely flexible: the number of cash-flow months changes based on the planning horizon the farmer chooses. JSONB lets us store that variable-length array without creating a separate cash_flows table with hundreds of rows per plan. PostgreSQL's GIN index on JSONB columns also means we can query inside the JSON efficiently if needed. MongoDB would give us JSON flexibility everywhere but lose transactional integrity for the relational data.

---

**Q: Why Redis? What is it actually used for?**

Redis serves two roles:
1. **Session state cache** — the questionnaire session context (which questions have been answered, what values were given) is cached in Redis so every answer-submission request does not need a database read to reconstruct the session state.
2. **Corrections cache** — the audio router maintains a warm in-memory corrections cache that is periodically refreshed from the database. This prevents a DB round-trip on every transcription correction lookup.

The application is designed to degrade gracefully if Redis is unavailable — it will fall back to database reads, which is slower but not broken.

---

**Q: Why did you choose faster-whisper over the standard openai-whisper library?**

Three reasons:
1. **Speed** — faster-whisper uses CTranslate2 under the hood, which runs the same Whisper model 2–4× faster than the original PyTorch implementation.
2. **Memory efficiency** — CTranslate2's int8 and int8_float16 quantization modes reduce GPU memory usage by 50–70% while maintaining accuracy within 1–2% WER of the full-precision model.
3. **Streaming-ready** — faster-whisper yields word-level timestamps as a generator, which makes real-time transcription with partial results possible without loading the full transcription into memory.

For a platform targeting low-connectivity rural deployments where the server may have a modest GPU, these efficiency gains are critical.

---

**Q: Why large-v3 as the default Whisper model? Isn't that overkill?**

For Indian languages it is not. Whisper's accuracy on Hindi, Kannada, Tamil, and Telugu degrades significantly with smaller models (tiny, base, small). The large-v3 model was specifically trained with more multilingual data. In our internal A/B evaluation (see the eval module and `docs/superpowers/specs/2026-04-23-stt-ab-eval-design.md`), large-v3 achieved measurably lower Word Error Rate on Indian-language audio compared to medium or small models. Given that the target users are Indian farmers who may mix languages mid-sentence — code-switching between Kannada and English is very common in Karnataka — large-v3 is the minimum viable model for production.

---

**Q: What happens if the Whisper model is not available (no GPU, no CUDA)?**

The system has a graceful fallback. In `backend/routers/audio.py`, if CUDA is unavailable, the model initialization catches the RuntimeError and the system falls back to CPU with a reduced compute type. The frontend also supports the browser's built-in Web Speech API (used in `useVoiceRecorder.js`) as an alternative — this requires no server-side GPU at all and is the fallback for low-resource deployments or development environments.

---

**Q: Your financial engine has IRR calculated via bisection. Why not use numpy's `irr` function?**

Two reasons:
1. **No numpy dependency in the backend** — adding numpy just for IRR would increase the Docker image size significantly and complicate the dependency tree.
2. **Control over edge cases** — the bisection implementation in `financial_service.py` handles the case where monthly net is zero or negative (returns None) explicitly, which prevents the NaN propagation that `numpy.irr` historically had with negative cash-flow inputs. The bisection runs 200 iterations with a 0.01 rupee tolerance, which is more than sufficient precision for farm-scale financials.

---

**Q: Why are financial recommendations rule-based and not LLM-generated?**

This is a deliberate architectural decision. Financial recommendations need to be:
1. **Reproducible** — the same financial inputs must always produce the same recommendations. An LLM response varies across runs.
2. **Auditable** — a bank or NABARD officer reviewing a financial plan needs to see the logic that produced a recommendation, not a black-box LLM output.
3. **Fast** — rule evaluation runs in microseconds. An LLM call takes 1–3 seconds and costs money per invocation.

The AI Advisor chat is LLM-powered for open-ended questions. But the structured financial health checks are deterministic rules that can be independently verified. This is the principle of using AI where it adds value and determinism where accuracy and traceability are non-negotiable.

---

**Q: The financial model uses a fixed 8% discount rate for NPV. Isn't that too simplistic?**

It is a reasonable baseline for Indian agricultural investments. The RBI repo rate has historically been 6–7%, and agricultural risk premiums add 1–2%, putting the risk-adjusted discount rate at 8–9%. For a first-version tool targeting small and medium aquaponic farmers who have no existing financial model at all, 8% is a sensible and defensible default. The `FinancialInputs` dataclass exposes `discount_rate_annual` as a configurable field — it can be overridden per session without changing the model. In future work, this could be a survey question for sophisticated users.

---

**Q: How does the skip logic in the questionnaire work? Can you explain it technically?**

The `QuestionnaireEngine.get_next_question()` method iterates through the question bank in order. Each `Question` object has an optional `follow_up_condition` field — a dict with an `"if"` key containing a simple expression like `"has_iot_sensors == false"`. The `_eval_condition()` method parses this with a regex that supports only the `==` operator against string or boolean literals — no `eval()`, no dynamic code execution. If the condition is false, that question is silently skipped by adding its ID to the `answered` set. This is intentionally minimal — a more complex skip graph would need a DAG-based engine, but the current linear-with-conditions structure handles all the survey's branching needs without overengineering.

---

**Q: What is the three-scenario model based on? Is 0.75x / 1.30x scientifically justified?**

The multipliers were chosen based on agricultural risk literature. The FAO's agricultural investment risk guidelines recommend stress-testing revenue at ±20–25% for small farm projects. We use 0.75x (−25%) for pessimistic and 1.30x (+30%) for optimistic. The asymmetry — the pessimistic scenario is more conservative than the optimistic is generous — reflects the real-world asymmetry in agricultural risk: market price drops, disease events, and weather disruptions typically cause larger downside than typical upside scenarios. This approach mirrors the three-point estimation method (PERT) used in project management.

---

**Q: Why did you use Supabase instead of a self-hosted PostgreSQL?**

The architecture supports both. For local development and Docker deployment, a self-hosted PostgreSQL container is used. For production and testing without a GPU machine, Supabase provides a managed PostgreSQL with a REST API and connection pooling via pgbouncer. The `_init_db()` function in `main.py` detects whether the DATABASE_URL contains `supabase.com` and changes its behavior accordingly — when using Supabase it only runs a connectivity check (`SELECT 1`) rather than `create_all`, because the schema is pre-applied via `infra/schema.sql`. This dual-mode design avoids vendor lock-in.

---

**Q: How does the voice interpretation handle Indian number words like 'lakh' and 'crore'?**

The `_extract_number()` method in `questionnaire_engine.py` has a word-to-number parser that includes a `scales` dictionary with `"lakh": 100000` and `"crore": 10000000`. When a farmer says "five lakh rupees," the parser tokenizes the phrase, maps "five" to 5 and "lakh" to the scale 100000, and computes 5 × 100000 = 500000. This is needed because Whisper transcribes Indian speech accurately but the numbers come out as spelled words — the ASR model does not convert them to digits. The parser also handles compound numbers like "two lakh fifty thousand" correctly by accumulating across scales.

---

**Q: What is the Crop Intelligence module's data source? How reliable is it?**

The knowledge base in `data/crop_knowledge_base.json` was compiled from three peer-reviewed sources:
1. **FAO Fisheries and Aquaculture Technical Paper 589** — the definitive UN reference for integrated aquaponic food production systems, including temperature and pH ranges for common aquaponic crops.
2. **ICAR-CIFA (Central Institute of Freshwater Aquaculture)** — Indian Council of Agricultural Research data for tropical crop-fish combinations relevant to the Indian climate.
3. **UVI Aquaponic System crop valuation studies** — University of the Virgin Islands research on crop yield benchmarks per square metre in aquaponic systems.

The module is deterministic and auditable — every feasibility decision can be traced back to a threshold in the JSON file and a source document. It is not a "black box" crop recommendation.

---

**Q: Your schema uses JSONB for sessions.context_data. What happens if the schema of context_data changes?**

This is a valid concern. Because `context_data` is a JSONB field, adding new question IDs to the questionnaire does not require a database migration — the context just gains new keys. For backward compatibility on older sessions (which have fewer answered keys), the `get_next_question()` engine will simply see those new questions as unanswered and present them on the next interaction. The engine is stateless — it recomputes the next question from the current context every time, so partial contexts from older schema versions are handled naturally. The only breaking case would be renaming a question ID, which is avoided by treating question IDs as immutable once deployed.

---

**Q: Is there any security vulnerability concern with the voice input? Could a malicious audio file crash the system?**

Three mitigations are in place:
1. **File type validation** — `infer_audio_suffix()` in `audio.py` checks the filename extension and content-type header against an allowlist of `{.webm, .wav, .mp3, .m4a, .mp4, .ogg, .flac}`. Unknown formats are rejected before being passed to Whisper.
2. **Temporary file isolation** — audio is written to a system temp directory and deleted after transcription regardless of whether the transcription succeeds or fails.
3. **Rate limiting** — the API-wide rate limiter (slowapi, 200 requests/minute per IP) prevents flood attacks on the transcription endpoint, which is computationally expensive.

The Whisper model itself processes the audio in a sandboxed CTranslate2 process — it does not execute any code from the audio content.

---

**Q: Why is there a separate Land Farm Survey? Isn't that scope creep?**

Aquaponic farming and conventional land farming are financially structurally different. In aquaponics, CAPEX is dominated by tanks, pumps, and plumbing. In land farming, CAPEX is dominated by land preparation, irrigation infrastructure, and tractors. The cost-of-goods-sold calculation is different — land farming has seed, fertilizer, pesticide inputs that aquaponics does not. Revenue is also structured differently — land farming has seasonal harvest cycles, aquaponics has year-round fish yield. A single shared financial model would either be wrong for one domain or so parameterized as to be unusable. The two survey engines — `questionnaire_engine.py` and `land_farm_survey_engine.py` — share the same architecture (stateless engine, question bank, skip logic) but have domain-specific question banks and financial calculators.

---

**Q: What is the eval module for? Why is it gated behind EVAL_MODE?**

The eval router and the `backend/eval/` directory implement an A/B evaluation framework for comparing speech-to-text providers. We record voice clips, run them through different STT models, compute Word Error Rate (WER) against human transcriptions, and log results. This is an experimental/research feature — it should not be exposed in production because it requires write access to eval clip storage and can be computationally expensive. The `EVAL_MODE` environment flag gates it at startup so the router is never registered in production deployments.

---

**Q: Does the system work offline or in low-connectivity environments?**

Partially. The React frontend caches the current session state in Zustand (in-memory) so the UI remains usable during brief connectivity drops. The questionnaire engine state is persisted to PostgreSQL on every answer submission — not just at the end — so a dropped connection mid-survey does not lose progress. The Google Sheets sync is explicitly designed as a pull model for this reason: it works regardless of whether the server can initiate outbound connections.

Full offline support (service workers, local-first data) is a natural next step but was out of scope for v1.

---

**Q: How would you scale this to handle thousands of farmers simultaneously?**

The current architecture has four natural scaling paths:
1. **Backend** — FastAPI is ASGI-native, so running multiple worker processes behind Gunicorn or Uvicorn + nginx is straightforward. The async database pool via asyncpg handles thousands of concurrent connections.
2. **Database** — PostgreSQL connection pooling via pgbouncer (already used on the Supabase path) reduces connection overhead.
3. **Whisper transcription** — the STT endpoint is the most compute-intensive. It can be moved to a separate microservice with a job queue (Celery + Redis) so transcription jobs are processed asynchronously without blocking the main API.
4. **Redis** — already stateless between instances, so horizontal scaling of the API layer does not require sticky sessions.

---

**Q: What is the role of the AI Advisor compared to the rule-based recommendations?**

They serve different interaction modes:
- **Rule-based recommendations** are generated once at report creation time, structured, and suited for reading in a report or sharing with a bank. They answer "what is wrong and what specific action should I take."
- **AI Advisor** is a conversational interface for open-ended exploration. A farmer can ask "what fish is best for my water temperature?" or "how do I negotiate a bulk feed contract?" — questions that do not have a deterministic answer. The LLM is appropriate here because the value is in natural-language reasoning, not in financial precision.

The design principle is: LLM for exploration and conversation, deterministic engine for financial decisions.

---

**Q: The project uses both Anthropic Claude and OpenAI. Why support two providers?**

Vendor lock-in avoidance and cost management. For users who have an OpenAI API key, we support GPT-4o. For users who prefer Anthropic (or are on an Anthropic-sponsored tier), we support Claude. The LLM call is abstracted behind a provider check on `settings.DEFAULT_LLM_PROVIDER`. Switching providers requires changing one environment variable, not rewriting code. This is especially important for a platform targeting Indian agricultural institutions, some of which may have enterprise agreements with one provider but not the other.

---

**Q: What would you improve if you had more time?**

Honest answer, prioritized by impact:
1. **Alembic migrations** — the current schema is applied via a raw SQL file. For a production system, we need version-controlled incremental migrations.
2. **Offline-first PWA** — a Service Worker + IndexedDB layer would make the survey work without any connectivity, critical for rural farms.
3. **More crops in the knowledge base** — currently 6 crops. The FAO document covers 20+. Expanding the knowledge base is high-value, low-engineering-effort.
4. **Real-time IoT dashboard** — WebSocket-based live water quality charts instead of polling.
5. **Multi-language UI** — the voice input handles Indian languages but the UI text is still English. A proper i18n layer (the i18n utility is already partially wired) for Hindi and Kannada would dramatically improve farmer usability.

---

*End of demo.md*
