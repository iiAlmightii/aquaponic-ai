# AgriSense AI — Demo Transcript + Defense Q&A
## For Guide & External Evaluator | MCA491P Final Demo

---

# PART 1: DEMO TRANSCRIPT

> **Setup before they arrive:**
> - `docker compose up --build` should already be running
> - Browser open at `http://localhost` (or your ngrok URL)
> - Open a second tab with `http://localhost:8000/api/docs` (Swagger UI)
> - Have a test account already registered (email: demo@farm.com, password: Demo@123)
> - Keep terminal visible in background showing logs

---

## OPENING (30 seconds)

**SAY:**
"Good morning / afternoon sir/ma'am. I am Chandan, and today I will demonstrate AgriSense AI — an AI-driven voice-first platform that helps aquaponic and land farm operators in India plan, manage, and analyze their farming operations.

The system has five core capabilities I will walk you through:
one — voice-guided farm survey,
two — automated financial planning with three-scenario analysis,
three — crop intelligence,
four — IoT water quality monitoring,
and five — PDF report and Google Sheets export.

Everything is running locally via Docker. Let me begin."

---

## DEMO SECTION 1: SHOW THE RUNNING SYSTEM (1 minute)

**SHOW:** The browser at `http://localhost` — the login screen

**SAY:**
"This is the main application served over Nginx at port 80. The system runs as six Docker containers — backend FastAPI on port 8000, React frontend on port 3001, Nginx reverse proxy, PostgreSQL 16, Redis 7, and an Adminer database GUI."

**SHOW:** Open terminal briefly, run `docker ps` or show it already running

**SAY:**
"You can see all six services are healthy. The entire stack starts with a single command — `docker compose up --build`. No manual setup required."

**ACTION:** Log in with demo credentials

---

## DEMO SECTION 2: DASHBOARD (1 minute)

**SHOW:** The main dashboard after login

**SAY:**
"After authentication — which uses bcrypt password hashing and JWT tokens — the farmer lands on the dashboard. The dashboard shows key farm metrics: number of surveys completed, total financial plans generated, water quality status, and recent activity."

**POINT TO:**
- KPI cards at the top (surveys count, farms, financial plans)
- The quick action buttons ("Start Voice Survey", "View Reports", "AI Advisor")
- Any chart visible (survey trend, ROI distribution)

**SAY:**
"This is a real-time aggregated view. These numbers are pulled from the database at page load — there is no hardcoded data."

---

## DEMO SECTION 3: CREATING A FARM (45 seconds)

**SHOW:** Navigate to Farm Management

**SAY:**
"Before starting a survey, the farmer creates a farm profile. Let me create a demo farm."

**ACTION:** Click "Add Farm", fill in:
- Name: "Green Roots Aquafarm"
- Location: Karnataka
- Area: 100 sq meters
- System Type: NFT (Nutrient Film Technique)

Click Save.

**SAY:**
"The farm is now stored in PostgreSQL with a UUID primary key. This farm will be linked to all surveys, financial plans, and IoT readings."

---

## DEMO SECTION 4: VOICE SURVEY — THE CORE FEATURE (4-5 minutes)

**SHOW:** Navigate to Surveys Hub, click "Start AI Survey"

**SAY:**
"This is the core feature of the platform — the 28-question adaptive aquaponic survey. The farmer can answer by voice or by typing. Let me show both modes."

**ACTION:** The first question appears — likely "What is the name of your farm?"

**SAY:**
"The first question appears. Notice the microphone button. I will use voice input."

**ACTION:** Click the microphone, say "Green Roots Aquafarm"

**SAY:**
"The Web Speech API captures the audio in real time. The transcript appears in the input box. The system then posts this answer to the backend, where the QuestionnaireEngine parses and validates it."

**CONTINUE through 4-5 questions, narrating each:**

When a number question appears (e.g., area or cost):
- **SAY:** "For numeric inputs, I can say 'fifty thousand' — watch how the voice interpreter converts that to the number 50,000."
- **ACTION:** Speak "fifty thousand" and show the conversion

When a boolean question appears (e.g., "Do you have IoT sensors?"):
- **SAY:** "For yes/no questions, I say 'no' — and notice the skip logic fires. The next water quality sensor questions are automatically skipped because the farmer said they don't have IoT sensors."
- **ACTION:** Say "no" and show questions being skipped

When a SELECT question appears:
- **SAY:** "For selection questions, the farmer can speak the option name or click it."

**At question 5-6, pause and SAY:**
"I want to point out the progress bar — it shows answered vs total questions. The farmer can also go back and correct a previous answer using the back button."

**ACTION:** Click back once, change an answer, come back forward

**SAY:**
"The back navigation rolls back the last answer in the database and reloads the previous question. The session state lives in the `sessions` table as a JSONB field called `context_data` — so no server-side memory is needed. Any server restart will continue the session correctly."

**(For time saving, you can skip ahead — pre-fill remaining answers by typing quickly)**

**SAY:**
"To save time, let me complete the remaining answers by typing. In a real scenario, the farmer would speak each answer."

**Fill in key financial answers:**
- Infrastructure cost: 150000
- Equipment cost: 50000
- Initial stock cost: 20000
- Monthly feed cost: 8000
- Monthly labor cost: 5000
- Monthly utilities: 2000
- Monthly maintenance: 1000
- Monthly fish revenue: 20000
- Monthly crop revenue: 5000

**When survey completes, SAY:**
"The survey is now complete. At this point, the system automatically — without any additional user action — runs three processes:"

**POINT TO completion screen:**
"One: The Crop Intelligence Service evaluates the selected crops against the FAO knowledge base.
Two: The Financial Calculator computes 25 financial metrics across three scenarios.
Three: Rule-based recommendations are generated.

All of this happens in under 50 milliseconds."

---

## DEMO SECTION 5: FINANCIAL REPORT (2 minutes)

**SHOW:** The completion screen / report download button

**SAY:**
"The farmer sees their survey is complete and can now download the financial report."

**ACTION:** Click "Download Report" or "View Report"

**SAY:**
"The backend runs `GET /api/v1/report/{session_id}`. This triggers the FinancialService to compute the full plan and ReportLab to generate the PDF. Watch — the PDF downloads in about 1 second."

**SHOW the PDF after it opens:**

**POINT TO:**
- "At the top — Total CAPEX: ₹2,20,000"
- "ROI: [value]%, Payback Period: [X] months"
- "Break-even month: [X]"
- "Three scenarios — Pessimistic at 75% revenue, Base, and Optimistic at 130% revenue"
- "NPV and IRR values"
- "AI Recommendations section — these are rule-based, not random. For example: if feed cost exceeds 45% of OPEX, the system recommends bulk buying contracts."
- "Crop feasibility section — Lettuce is evaluated as feasible with an estimated annual yield"

**SAY:**
"This PDF is generated entirely on the server using ReportLab — no browser PDF tricks. The farmer can download this and show it to a bank for a loan application."

---

## DEMO SECTION 6: GOOGLE SHEETS EXPORT (30 seconds)

**SHOW:** Navigate to Sheets export / Finance Sheets option

**SAY:**
"The farmer can also export this financial data to Google Sheets for sharing with an advisor or accountant."

**ACTION:** Click "Export to Sheets" (if configured) or show the API endpoint in Swagger

**SAY:**
"The `gspread` library uses a service account to write structured financial data — CAPEX, OPEX, revenue, and all three scenarios — into a Google Sheet. The farmer gets a shareable link."

*(If not configured: "Google Sheets requires a service account key which I haven't configured in this demo environment, but the endpoint is live and the integration is functional.")*

---

## DEMO SECTION 7: IOT WATER QUALITY (1 minute)

**SHOW:** Navigate to Analytics or Water Quality Dashboard

**SAY:**
"The platform supports real-time IoT data ingestion. Aquaponic farms need constant water quality monitoring — pH, dissolved oxygen, temperature, ammonia, nitrate, and more."

**ACTION:** Open Swagger UI at `http://localhost:8000/api/docs`

Navigate to `POST /api/v1/iot/ingest`

**SAY:**
"Let me simulate an IoT device posting a reading. In production, this would be called by an ESP32 or Raspberry Pi sensor."

**ACTION:** Click "Try it out", paste this body:
```json
{
  "farm_id": "[your farm UUID]",
  "device_id": "sensor-001",
  "ph": 7.1,
  "temperature_c": 24.5,
  "dissolved_oxygen_mg_l": 6.8,
  "ammonia_mg_l": 0.2
}
```
Click Execute.

**SHOW:** 200 OK response

**SAY:**
"The reading is stored. Now in the dashboard analytics, we can see water quality trends. The system flags readings outside optimal ranges — for aquaponics, pH should be between 6.8 and 7.2."

---

## DEMO SECTION 8: AI ADVISOR (45 seconds)

**SHOW:** Navigate to AI Advisor / Chat

**SAY:**
"The platform includes an AI advisory chat. The farmer can ask farming questions in their language — Hindi, Kannada, or English. The farm context is automatically injected into the prompt, so the advice is specific to their farm."

**ACTION:** Type or say: "What should I do if my pH is consistently above 7.5?"

**SHOW:** The LLM response appearing

**SAY:**
"The response comes from Sarvam AI — a multilingual Indian language model — or from Anthropic/OpenAI if configured. The conversation is stateless on the server — the full history is sent on each call, so the farmer gets context-aware answers."

---

## DEMO SECTION 9: ADMIN PANEL (30 seconds)

**SHOW:** Navigate to Admin Dashboard (if logged in as admin)

**SAY:**
"The system also includes an admin panel for the platform operator. This shows all registered users, their roles, survey activity, and allows user management. The admin can view the raw data tables and the database schema."

**POINT TO:** Users tab, Data Browser tab, Overview counts

---

## DEMO SECTION 10: ARCHITECTURE CLOSE (30 seconds)

**SHOW:** Swagger UI at `http://localhost:8000/api/docs`

**SAY:**
"Finally, FastAPI auto-generates this interactive API documentation. The system has 40+ endpoints across 12 routers. All inputs are validated by Pydantic v2 schemas — invalid data never reaches the business logic layer.

The entire platform is containerized. Any evaluator can run `docker compose up --build` and have the full system running in under 3 minutes.

That concludes the demonstration. I am happy to answer any questions."

---
---

# PART 2: QUESTIONS & ANSWERS FOR DEFENSE

> Organized by topic. Read all of these — every question here has come up in MCA vivas.

---

## CATEGORY A: PROJECT OVERVIEW & MOTIVATION

**Q1. Why did you choose aquaponics specifically?**

Aquaponics is a technically complex domain with interdependencies between fish biology, plant physiology, and water chemistry. This complexity makes AI-assistance genuinely valuable — unlike simple crop farming calculators that already exist. Additionally, India's aquaponic sector is growing due to NABARD-backed schemes and water-scarce agriculture, but no integrated digital tool exists for smallholders. The problem was real and unsolved.

---

**Q2. What problem does this project actually solve? Who is the user?**

The primary user is a small-to-medium aquaponic or land farm operator in India. They face four problems: (1) No affordable tool to calculate financial viability with scenario analysis. (2) Existing tools require typing — farmers working physically need voice input. (3) Crop selection and water monitoring happen in disconnected tools. (4) English-only interfaces exclude regional-language farmers. AgriSense AI solves all four in one platform.

---

**Q3. What existing tools did you compare against?**

| Tool | Limitation |
|---|---|
| FarmERP, Khetibuddy | No aquaponics-specific financial modelling, no voice |
| AquaManager | Desktop-only, no crop side, expensive |
| AgriApp, Cropin | No aquaponics, no financial planning |
| NABARD e-Mudra tools | Static calculators, no scenario analysis |
| IBM Watson Agriculture | Cost-prohibitive for Indian smallholders |

No existing tool combines voice survey, three-scenario financial planning, crop intelligence, and IoT monitoring in one accessible web application for Indian farmers.

---

**Q4. What is the novelty of your project?**

Three points of novelty:
1. **Domain-specific voice normalization** — custom Indian-English spoken number parser and aquaponics vocabulary normalization that generic STT systems don't handle
2. **Self-contained financial engine** — IRR via bisection method, NPV with RBI-benchmark discount rate, and rule-based recommendations without requiring a paid LLM
3. **Indian market contextualization** — INR currency, NABARD/NHB subsidy references, Indian state validation, Indian crop price benchmarks — making outputs actionable in the actual target environment

---

## CATEGORY B: TECHNICAL ARCHITECTURE

**Q5. Why did you choose FastAPI over Flask or Django?**

Three reasons: (1) **Native async support** — FastAPI is built on Starlette/asyncio, enabling non-blocking I/O throughout. Flask is sync by default. Django's async support is partial. (2) **Automatic OpenAPI docs** — Swagger UI generated from Pydantic models with zero extra code. (3) **Pydantic v2 validation** — all request/response models are validated at the framework level before reaching business logic, preventing invalid data from ever entering the service layer.

---

**Q6. Why did you use async SQLAlchemy with asyncpg? What is the benefit?**

A standard synchronous database driver blocks the entire Python thread while waiting for a PostgreSQL response. With asyncpg and SQLAlchemy's async engine, the FastAPI worker releases the event loop while waiting for the database — allowing it to handle other requests simultaneously. In practice, this means a single Uvicorn worker can handle hundreds of concurrent survey sessions without performance degradation.

---

**Q7. Why PostgreSQL and not MySQL or MongoDB?**

Three reasons: (1) **JSONB support** — PostgreSQL's JSONB type allows flexible schema storage for `context_data` (survey answers vary per version) and `scenarios` (financial projections). MongoDB could do this but lacks ACID transactions. (2) **GIN indexes** — efficient querying inside JSONB fields. (3) **PostgreSQL triggers** — `updated_at` auto-management that works regardless of whether updates come from the ORM, migrations, or the Adminer GUI.

---

**Q8. What is JSONB and why did you use it?**

JSONB (JSON Binary) is PostgreSQL's binary-format JSON column type. It stores arbitrary nested data, supports GIN indexes for fast queries inside the JSON, and supports operators like `@>` for containment checks. I used it for two purposes: (1) `sessions.context_data` — stores the accumulating survey answers. The questionnaire schema can change between versions without requiring a database migration. (2) `financial_plans.scenarios` — stores the three-scenario output as a nested object. Different farms may have different scenario structures in future; JSONB makes this forward-compatible.

---

**Q9. Why is the session state stored in the database rather than in server memory (e.g., a Python dict or Redis)?**

Storing session state in-memory would mean: (1) If the backend restarts (Docker restart, deployment), all in-progress surveys are lost. (2) Horizontal scaling is impossible — a request would need to hit the same server that holds the in-memory state. By storing `context_data` as JSONB in PostgreSQL, the backend is stateless — any server replica can handle any request, and surveys survive restarts.

---

**Q10. Why did you use Zustand instead of Redux for frontend state management?**

Redux requires significant boilerplate — actions, reducers, action creators, middleware setup. For a project of this scale with one developer and a clear state shape (user, session, loading), Zustand provides the same functionality with 80% less code. Zustand's `create` function produces a store with direct mutation support via Immer integration — the survey answer flow (`submitAnswer`, `goBack`, `resetSession`) maps cleanly to Zustand actions without the overhead of Redux Toolkit.

---

**Q11. What is the purpose of Nginx in your architecture?**

Nginx serves three functions: (1) **Reverse proxy** — routes `/api/*` requests to the FastAPI backend on port 8000 and serves the React SPA for all other paths. This single entry point eliminates CORS issues. (2) **SSL termination** — HTTPS is handled at Nginx; the backend sees plain HTTP. (3) **Static file caching** — the React bundle is cached with appropriate headers, reducing load on the server for repeat visits.

---

**Q12. What is Docker Compose and why did you use it?**

Docker Compose is a tool for defining and running multi-container applications via a YAML file. I used it because the project requires six interdependent services (backend, frontend, Nginx, PostgreSQL, Redis, Adminer). Without Compose, each service would need to be started manually with the correct network, port, and volume configuration — error-prone and non-reproducible. With `docker compose up --build`, the entire stack starts correctly every time with proper health checks and dependency ordering.

---

## CATEGORY C: VOICE & STT

**Q13. How does voice input work in your system?**

Two paths: (1) **Web Speech API** (primary) — browser-native SpeechRecognition API captures audio in real time and returns a transcript. Zero latency, no audio upload. Requires Chrome or Edge. (2) **faster-whisper** (secondary) — the frontend records audio using MediaRecorder API, sends it as a WebM blob to `POST /api/v1/audio/transcribe`, and the backend runs faster-whisper (Whisper large-v3) to produce a transcript. Higher accuracy for domain-specific vocabulary and Indian accents, but requires a round-trip to the server.

---

**Q14. What is faster-whisper? How is it different from OpenAI Whisper?**

OpenAI Whisper is a speech recognition model published by OpenAI. faster-whisper is a reimplementation that uses CTranslate2 — a C++ inference library that converts the PyTorch model to an optimized runtime format. Key differences: (1) **Quantization** — faster-whisper uses INT8 quantization, reducing the Whisper large-v3 model from ~6 GB (float32) to ~1.5 GB, with WER within 0.5% of the original. (2) **Speed** — 4× faster than the original Whisper implementation on the same hardware. (3) **CPU support** — runs acceptably on CPU without GPU, using SIMD vectorization.

---

**Q15. How does your system handle voice input errors or incorrect transcriptions?**

Three mechanisms: (1) **VoiceInterpreter normalization** — removes filler words (um, uh, literally), corrects STT homophones specific to aquaponics ("talapia" → "tilapia", "nft" from "n f t"), and fixes number homophones ("for" → 4, "won" → 1). (2) **Answer validation** — the QuestionnaireEngine validates each parsed answer against the question's type and constraints. If invalid, it returns an error with a hint and re-displays the same question. (3) **Confirmation UI** — for ambiguous voice inputs, the system shows the interpreted value and asks the farmer to confirm before saving.

---

**Q16. How does your system parse "fifty thousand" or "two lakh" from voice input?**

The `extract_spoken_number()` function in `voice_interpretation.py` uses a two-stage approach: (1) Replace Indian numeral terms using a dictionary: "lakh" → 100000 multiplier, "crore" → 10000000 multiplier. (2) Parse English number words using a recursive algorithm that handles "fifty thousand" as `50 × 1000 = 50000`. STT homophones are resolved first: "for" → "4", "to/too" → "2", "tree" → "3". The result is a standard Python float used in financial calculations.

---

**Q17. What is the difference between Web Speech API and faster-whisper? Which is better?**

| Aspect | Web Speech API | faster-whisper |
|---|---|---|
| Latency | Real-time (streaming) | ~1-3s round trip |
| Accuracy (Indian-English) | Medium | Higher |
| Privacy | Audio sent to Google | Processed locally |
| Browser support | Chrome/Edge only | Any (server-side) |
| Internet required | Yes | No (local model) |
| Domain vocabulary | Generic | Can be tuned |

Web Speech API is better for speed and simplicity. faster-whisper is better for accuracy and offline use. The system uses both as complementary options.

---

## CATEGORY D: FINANCIAL ENGINE

**Q18. What is CAPEX and OPEX? How do you compute them?**

**CAPEX (Capital Expenditure)** is the one-time upfront investment: infrastructure cost + equipment cost + initial fish and plant stock cost. Example: ₹1,50,000 + ₹50,000 + ₹20,000 = ₹2,20,000.

**OPEX (Operational Expenditure)** is the recurring cost: monthly feed + labor + utilities + maintenance. Example: ₹8,000 + ₹5,000 + ₹2,000 + ₹1,000 = ₹16,000/month → ₹1,92,000/year.

Both are collected through the survey and computed deterministically in `FinancialCalculator.compute_metrics()`.

---

**Q19. How do you calculate ROI?**

ROI (Return on Investment) = (Annual Net Profit / Total CAPEX) × 100

Where Annual Net Profit = Annual Revenue − Annual OPEX

Example: Revenue ₹3,00,000/year − OPEX ₹1,92,000/year = Net Profit ₹1,08,000/year
ROI = (1,08,000 / 2,20,000) × 100 = 49%

---

**Q20. What is NPV and how do you calculate it?**

NPV (Net Present Value) discounts all future cash flows back to today's value to determine if an investment is worthwhile.

Formula: NPV = Σ (monthly_net_income / (1 + monthly_rate)^m) − CAPEX

Where monthly_rate = 8% annual / 12 = 0.667% per month, and m is the month number from 1 to the planning horizon (60 months).

A positive NPV means the investment is financially viable at the given discount rate. I used 8% annual — based on the RBI MCLR rate for agricultural loans from public sector banks.

---

**Q21. What is IRR and how do you compute it?**

IRR (Internal Rate of Return) is the discount rate at which NPV = 0. It represents the actual annual return on the investment.

I compute it using the **bisection method**: bracket the search between -100% and +1000% annual return, then binary-search for the rate where `npv(rate, cashflows) == 0`, converging within 1e-6 tolerance in 200 iterations.

I chose bisection over Newton-Raphson because Newton-Raphson can fail to converge when the NPV function has multiple sign changes — which happens in seasonal farms with alternating cash outflows and inflows. Bisection is guaranteed to converge for any continuous function over a bracketed interval.

---

**Q22. What are your three financial scenarios?**

- **Base scenario (×1.0):** Revenue exactly as entered in the survey. All other metrics computed normally.
- **Pessimistic scenario (×0.75):** Revenue reduced to 75% of base. Represents a bad harvest season, market price drop, or disease outbreak.
- **Optimistic scenario (×1.30):** Revenue increased to 130% of base. Represents a good season, premium pricing, or expanded production.

CAPEX is fixed across all three scenarios — it is a sunk cost that doesn't change with revenue. OPEX is also fixed — feed, labor, and utilities don't scale with revenue in the short term.

---

**Q23. Why 8% as the NPV discount rate?**

The 8% annual discount rate is derived from the Reserve Bank of India's MCLR (Marginal Cost of Funds Based Lending Rate) for agricultural loans at public sector banks, which ranged from 7.85% to 9.1% during 2023-24. It represents the opportunity cost of capital for a smallholder farmer — if they invest in the farm, they forgo a ~8% return from a bank fixed deposit or agricultural loan. A positive NPV at 8% means the farm investment beats the alternative.

In future versions, this will be a configurable parameter — farmers eligible for the Kisan Credit Card scheme pay as low as 4%.

---

**Q24. What is the payback period? How is it different from break-even month?**

**Payback Period** = Total CAPEX / Monthly Net Income. This is a simple division that gives the approximate number of months to recover the investment. It ignores time value of money.

**Break-Even Month** is the specific month from the cash flow array where cumulative cash flow (sum of all monthly net incomes minus CAPEX) first becomes ≥ 0. This is more accurate because it accounts for the actual month-by-month ramp-up in revenue.

Example: Payback Period might say 17 months, but Break-Even Month might be month 19 if the first 2 months had lower revenue while the farm was getting established.

---

## CATEGORY E: DATABASE DESIGN

**Q25. Why did you use UUID as primary key instead of auto-increment integer?**

Three reasons: (1) **Security** — integer IDs are enumerable. An attacker can guess `session/1`, `session/2`. UUID IDs cannot be guessed. (2) **Distributed systems** — if the system is later sharded or has multiple write replicas, auto-increment integer PKs cause conflicts. UUIDs are globally unique without coordination. (3) **IDOR prevention** — even with UUID PKs, I validate session ownership per JWT user. But UUID adds an additional layer of defense-in-depth.

---

**Q26. What is the IDOR vulnerability you fixed, and how?**

IDOR (Insecure Direct Object Reference) is when an API returns or modifies a resource based on a user-supplied ID without checking ownership. In Phase I, `GET /session/{session_id}` returned any session if the ID was known — even if the session belonged to a different user.

The fix: every session endpoint now queries with a compound WHERE clause: `WHERE sessions.id = :session_id AND sessions.user_id = :current_user_id`. If the session exists but belongs to a different user, the query returns zero rows and we return a 404 — not 403. We return 404 (not 403) to avoid revealing whether the session ID exists at all.

---

**Q27. Why does schema.sql use PostgreSQL triggers for `updated_at`?**

SQLAlchemy's `onupdate` parameter fires only when an update is issued through the ORM. If the database is updated directly via SQL (through Adminer, migrations, or psql scripts), `updated_at` would not be updated. Database-level triggers fire for ALL updates regardless of source — ORM, raw SQL, or admin tools. This ensures data integrity across all access paths.

---

**Q28. What is the structure of the `context_data` JSONB field?**

```json
{
  "answered": ["farm_name", "farm_location", "farm_area_sqm", ...],
  "answers": {
    "farm_name": "Green Roots Aquafarm",
    "farm_area_sqm": 100.0,
    "fish_species": "tilapia",
    "monthly_fish_revenue": 20000.0,
    ...
  },
  "crop_intelligence": {
    "lettuce": {
      "feasibility": "feasible",
      "annual_yield_kg": 30.0,
      "warnings": []
    }
  }
}
```

The `answered` list tracks which questions have been answered (for skip logic and progress calculation). The `answers` dict stores the parsed, validated values. `crop_intelligence` is appended at survey completion.

---

## CATEGORY F: SECURITY

**Q29. How does authentication work in your system?**

1. User registers with email + password. Password is hashed using bcrypt with 12 rounds (cost factor).
2. On login, bcrypt compares the submitted password with the stored hash.
3. On successful login, the backend generates a JWT (JSON Web Token) signed with HS256 using `JWT_SECRET_KEY` with a 24-hour expiry.
4. The frontend stores the token in localStorage and attaches it as `Authorization: Bearer <token>` on every API request.
5. The backend decodes and validates the JWT on every protected endpoint, extracting `user_id` and `role` from the payload.

---

**Q30. What is bcrypt? Why 12 rounds?**

Bcrypt is a password hashing function designed to be computationally expensive — it cannot be reversed (unlike MD5/SHA). The "rounds" parameter (work factor) controls how slow the hashing is: 12 rounds means 2^12 = 4096 iterations, taking ~300ms on a modern CPU. This makes brute-force and dictionary attacks impractical. Why 12 specifically? OWASP recommends minimum 10 rounds; 12 keeps login latency under 500ms while being significantly more resistant than 10.

---

**Q31. What is rate limiting and why did you implement it?**

Rate limiting restricts how many requests a client can make within a time window. I use SlowAPI (FastAPI wrapper for limits library) to allow 200 requests per minute per IP address. Without rate limiting: (1) A malicious user could make thousands of requests per second, exhausting database connections and server resources (DoS attack). (2) Brute-force attacks on the login endpoint are trivial. With 200/min rate limiting, 10 login attempts per second is the max, making brute-force impractical.

---

**Q32. How do you handle sensitive data? Is any financial data logged?**

Voice audio files are transcribed and immediately deleted — never stored in the database. The `session_answers` table stores only the transcribed text. API request logging (via the timing middleware) logs URLs and response times but not request bodies — so financial data (CAPEX, revenue figures) never appears in logs. The `.env` file containing API keys and database passwords is excluded from the repository via `.gitignore`.

---

## CATEGORY G: CROP INTELLIGENCE & AGRONOMY

**Q33. How does the Crop Intelligence Service work?**

The `CropIntelligenceService` loads a JSON knowledge base at startup (`data/crop_knowledge_base.json`) derived from FAO Technical Paper 589 and ICAR-CIFA guidelines. For each crop, it stores: minimum area, temperature range, pH range, compatible system types, yield per m², cycles per year, growth days, and difficulty.

When the survey completes, the service evaluates the farmer's stated crops against their reported conditions (area, temperature, pH, system type). It returns:
- `feasibility`: feasible / challenging / not_feasible
- `reasons`: why the assessment was made
- `warnings`: boundary conditions (e.g., "pH is at the lower limit")
- `yield_estimate`: area × yield_per_m² × cycles_per_year = annual kg

---

**Q34. Why is the Crop Intelligence Service rule-based and not an LLM?**

Deliberate design decision. The crop intelligence outputs feed directly into financial calculations — yield estimates become revenue inputs. If an LLM hallucinated "50 tonnes per hectare" for lettuce (realistic: ~5-8 kg/m²/cycle), that error would propagate into the NPV and ROI calculations, producing a dangerously optimistic financial projection. Rule-based logic from FAO/ICAR sources is deterministic, auditable, and aligned with scientific consensus. The LLM is reserved for the AI Advisor — conversational guidance where a slightly imprecise answer causes no financial harm.

---

**Q35. What are the optimal water parameters for aquaponics? How do you validate them?**

| Parameter | Optimal Range |
|---|---|
| pH | 6.8 – 7.2 |
| Temperature | 22 – 28°C |
| Dissolved Oxygen | > 5 mg/L |
| Ammonia (NH₃) | < 0.5 mg/L |
| Nitrite (NO₂) | < 0.3 mg/L |
| Nitrate (NO₃) | < 150 mg/L |

These ranges are derived from Goddek et al. (2019) and FAO Technical Paper 589. The pH range 6.8–7.2 is a compromise between the ideal for nitrifying bacteria (7.0–8.0) and the optimal for most hydroponic crops (5.5–6.5).

The IoT ingest endpoint validates incoming readings against these thresholds and flags out-of-range values in the response. The analytics dashboard shows color-coded status (green/amber/red).

---

## CATEGORY H: TESTING

**Q36. What testing have you done?**

| Test File | Coverage |
|---|---|
| `test_financial_service.py` | CAPEX, OPEX, ROI, IRR, NPV, 3-scenario output |
| `test_crop_intelligence.py` | Feasibility evaluation, yield estimation |
| `test_land_farm_survey_engine.py` | Land survey state machine, skip logic |
| `test_land_market_price_service.py` | Market price fetching and Redis caching |

Run with: `pytest` (all tests) or `pytest -k "not Endpoint"` (unit tests without DB).

---

**Q37. Give an example of a specific test case for the financial engine.**

Test case: Positive ROI scenario
- Input: CAPEX=₹2,20,000, Monthly Revenue=₹25,000, Monthly OPEX=₹16,000
- Expected: ROI > 0%, Payback < 24 months, NPV > 0, Break-even < 25 months
- Also verifies: pessimistic scenario has higher payback than base, optimistic has lower payback

Test case: IRR convergence
- Input: cashflows = [-220000, 9000, 9000, ...] (60 months)
- Expected: IRR between 0% and 100% per annum, converges within 200 iterations

Test case: Voice number parsing
- Input: "fifty lakh" → Expected: 5,000,000.0
- Input: "for" (STT homophone) → Expected: 4.0
- Input: "twenty five thousand five hundred" → Expected: 25,500.0

---

**Q38. What is the difference between unit tests and integration tests?**

**Unit tests** test a single function/class in isolation with no external dependencies. Example: testing `FinancialCalculator.compute_metrics()` with hardcoded inputs — no database, no HTTP request, no Redis. I use the `-k "not Endpoint"` flag to run only unit tests.

**Integration tests** test the interaction between multiple components including the database. Example: testing `POST /api/v1/session/start` which requires a real database connection to create a session record. These are labeled as Endpoint tests and require the full Docker stack.

---

## CATEGORY I: DEPLOYMENT & DEVOPS

**Q39. How do you start the full system?**

Single command: `docker compose up --build`

This: (1) Builds the backend Python image and frontend Node.js image. (2) Starts PostgreSQL and Redis. (3) Applies `infra/schema.sql` to initialize the database. (4) Starts the FastAPI backend (with Uvicorn ASGI server). (5) Starts the Nginx reverse proxy serving the React SPA. (6) Starts Adminer on port 8080 for database GUI.

---

**Q40. Why did you use Nginx as a reverse proxy instead of exposing FastAPI directly?**

(1) **Single port** — without Nginx, the browser would need to call port 8000 (API) and port 3001 (frontend) separately. Nginx combines both under port 80. (2) **CORS eliminated** — since both the API and the SPA are served from the same origin (port 80), CORS is not needed. (3) **SSL termination** — HTTPS is handled at Nginx; the backend doesn't need to manage TLS certificates. (4) **Static file caching** — Nginx caches the React bundle efficiently with proper cache headers.

---

**Q41. What happens if the database goes down? Does the app crash?**

No. The backend has a global exception handler that catches asyncpg connection errors and SQLAlchemy operational errors, returning HTTP 503 with a human-readable error message and actionable guidance (e.g., "Supabase database may be paused — visit supabase.com to resume"). The backend process stays running. When the database comes back, connections are re-established automatically by the SQLAlchemy connection pool.

---

## CATEGORY J: LLM & AI

**Q42. Does your system require an LLM (AI) API to function?**

No. The core financial planning, crop intelligence, and survey features work entirely without any LLM. The rule-based financial recommendation engine generates recommendations from mathematical thresholds without AI. The LLM (Sarvam AI / Anthropic / OpenAI) is only used for: (1) The AI Advisor chat feature (conversational guidance). (2) Optional enhanced recommendations via `DEFAULT_LLM_PROVIDER` environment variable.

This was a deliberate design choice for cost and reliability — Indian smallholder farmers should not be dependent on internet connectivity or API billing for core financial planning.

---

**Q43. What is Sarvam AI? Why did you choose it?**

Sarvam AI is an Indian AI company that has developed LLMs specifically for Indian languages. Their Sarvam-M (formerly Saaras 30B) model supports Hindi, Kannada, Tamil, Telugu, Bengali, Marathi, and other Indian languages natively. I chose Sarvam AI because: (1) The target users are Indian farmers who may prefer to communicate in regional languages. (2) Sarvam's models are trained on Indian content, making agricultural terminology in Indian languages more accurate. (3) Sarvam Saarika v2 provides an STT API specifically for Indic languages, which I used in the evaluation pipeline.

---

**Q44. What is the STT evaluation framework you built?**

It is a pipeline for scientifically comparing STT systems (faster-whisper vs. Sarvam Saarika v2) using Word Error Rate (WER) as the metric.

Process: (1) Participants record audio clips of predefined agricultural sentences in English and Indian languages via the evaluation UI. (2) Clips are uploaded to `POST /api/v1/eval/upload`. (3) The backend transcribes each clip with both STT systems. (4) WER is computed by comparing transcriptions to ground truth reference text. (5) Results are exported as a CSV with per-clip and aggregate WER for each system.

This answers the research question: "Which STT system performs better for Indian-language farm surveys?"

---

## CATEGORY K: HARD TECHNICAL QUESTIONS

**Q45. What is the asyncio event loop? How does FastAPI use it?**

Python's asyncio provides an event loop — a single-threaded scheduler that runs coroutines (async functions) concurrently by interleaving them at `await` points. When FastAPI handles a request and the handler calls `await db.execute(query)`, the event loop suspends that handler and runs other pending coroutines while waiting for the database response. When the database responds, the handler resumes. This allows one Python process to handle hundreds of concurrent requests that are mostly waiting on I/O (database, Redis, external APIs).

---

**Q46. What is CTranslate2 quantization in faster-whisper?**

CTranslate2 converts the Whisper model's float32 weights (32 bits per parameter) to int8 (8 bits per parameter). This reduces model size by 4× and enables SIMD vectorization on CPU (SSE/AVX instructions process 4–8 values simultaneously instead of 1). The accuracy reduction is minimal — WER increases by < 0.5% for most audio — because neural networks are robust to small weight perturbations. On GPU, int8 quantization enables tensor core operations which are significantly faster than float32 operations.

---

**Q47. Your financial computation is CPU-bound. Doesn't it block the async event loop?**

Good question. CPU-bound code blocks the asyncio event loop because it runs on the same Python thread without any `await` points. My financial calculation completes in under 50ms, which is acceptable for a single invocation — the event loop is only blocked for 50ms, during which other requests may experience a small delay.

For a production system with thousands of concurrent users, the correct solution is `asyncio.to_thread(financial_calculator.compute, inputs)` — this runs the CPU-bound code in a thread pool via Python's `concurrent.futures.ThreadPoolExecutor`, keeping the event loop free. This is a known improvement I would implement before production deployment.

---

**Q48. How does the bisection method work for IRR calculation?**

The IRR is the rate `r` where NPV(r) = 0. The bisection method works as follows:

1. Start with bounds: `low = -1.0` (−100% annual return), `high = 10.0` (1000% annual return)
2. Compute NPV at the midpoint: `mid = (low + high) / 2`
3. If `NPV(mid) > 0`, the true IRR is higher than mid → `low = mid`
4. If `NPV(mid) < 0`, the true IRR is lower than mid → `high = mid`
5. Repeat 200 times (convergence tolerance 1e-6)

This works because NPV is a continuous, monotonically decreasing function of the discount rate — it goes from a large positive value (at r = -100%) to a large negative value (at r = 1000%). By the Intermediate Value Theorem, there must be exactly one zero crossing if the project is viable.

---

**Q49. How does your skip logic work in the questionnaire engine?**

Each question in the question bank has an optional `follow_up_condition` field:
```json
{
  "id": "water_ph",
  "follow_up_condition": {
    "if": "has_iot_sensors",
    "equals": "false"
  }
}
```

The `get_next_question(context)` method iterates through the question bank from `current_step`, and for each question checks: "Is this question's `follow_up_condition` satisfied by the current context?" If the condition is NOT satisfied (e.g., farmer said they DO have IoT sensors), the question is skipped and the iterator moves to the next one. This continues until a question without a condition, or a question whose condition IS satisfied, is found.

---

**Q50. What happens if IRR has no solution? (No real IRR exists)**

This happens when the project is always profitable (all cash flows positive even with no CAPEX recovery) or always unprofitable (cumulative cash flows never reach zero). In both cases, NPV does not cross zero within the [-100%, +1000%] range.

My implementation detects this: if `NPV(low)` and `NPV(high)` have the same sign, the bisection method cannot bracket the root. In this case, `irr()` returns `None`. The PDF report displays "IRR: Not computable — all cash flows are positive" or similar, and the recommendation engine flags this as a special case. The farmer is not shown a misleading IRR value.

---

## CATEGORY L: GENERAL/MANAGEMENT QUESTIONS

**Q51. How long did this project take? What was your timeline?**

- **Phase I (~2 months):** Project scoping, architecture design, technology selection, literature review, FastAPI scaffolding, database schema, JWT auth, basic survey prototype
- **Phase II (~4 months):** Complete questionnaire engine, voice pipeline, financial calculator, crop intelligence, PDF reports, Google Sheets sync, React dashboards, IoT integration, security fixes
- **Phase III (~2 months):** STT evaluation framework, admin panel, expanded tests, performance hardening, documentation

Total: approximately 8 months of development.

---

**Q52. What were the biggest challenges you faced?**

Three main challenges:

1. **Voice input reliability across browsers and accents** — Indian-English spoken numbers and aquaponics vocabulary are not handled well by generic STT. Building the VoiceInterpreter normalization pipeline required iterating through many failure cases and building domain-specific dictionaries.

2. **Financial calculation correctness** — IRR is a non-trivial numerical algorithm. Implementing bisection correctly, handling edge cases (no real IRR, negative CAPEX return), and validating results against Excel's XIRR function took significant effort.

3. **Supabase compatibility** — The production PostgreSQL option (Supabase) has a free-tier auto-pause behavior that causes connection drops. Making the backend degrade gracefully (503 instead of crash) required handling asyncpg low-level socket errors and providing actionable error messages.

---

**Q53. If you had 3 more months, what would you add?**

In priority order:
1. Indic language voice support using Sarvam Saarika v2 for native-language surveys in Kannada, Hindi, and Tamil
2. Mobile app (React Native) for offline-capable voice surveys in low-connectivity farm environments
3. Real-time IoT dashboard with WebSocket-based live sensor data and configurable alerts

---

**Q54. What would you change if you started over?**

1. Use Alembic for database migrations from the start — `schema.sql` is fine for a single deployment but managing schema changes across environments becomes difficult without versioned migrations.
2. Add OpenTelemetry tracing from day one — the `X-Process-Time` header is useful but structured distributed tracing would give better insight into slow database queries.
3. Start with TypeScript for all frontend files — mixing TypeScript and JavaScript components created some maintenance overhead.

---

**Q55. Is this system production-ready?**

Partially. The core features are functionally complete and tested. What is needed before production:
- SSL certificate and domain configuration (Let's Encrypt via Certbot)
- DPDP Act 2023 compliance: explicit consent in regional languages, data deletion endpoint, 36-month retention policy
- Load testing to validate the 200 req/min rate limit under concurrent real users
- Full test coverage (currently ~75%)
- A/B STT evaluation results to finalize default STT provider

For academic demonstration, the system is fully functional and demonstrates all stated objectives.

---

*End of Demo Transcript and Defense Q&A*
*AgriSense AI — MCA491P | RV College of Engineering*
*Prepared: 2026-06-29 for Final Demo with Guide and External Evaluator*
