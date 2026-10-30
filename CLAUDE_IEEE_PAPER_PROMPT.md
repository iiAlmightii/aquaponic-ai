# Claude IEEE Paper Generation Prompt (Copy-Paste to VS Code Copilot)

---

## PASTE THIS ENTIRE BLOCK INTO VS CODE COPILOT:

You are an expert IEEE research paper author. Generate a complete, conference-ready IEEE research paper based on the AquaponicAI project described below.

**PAPER SCOPE:**
- Format: IEEE conference paper (8–10 pages)
- Audience: ICETCAI and similar AI/agriculture conferences
- Tone: Technical, scholarly, evidence-based
- Focus: AI-driven voice survey, adaptive questioning, financial planning system

---

## PROJECT OVERVIEW

**AquaponicAI** is an end-to-end decision-support platform combining:
1. **Voice-first questionnaire interface** → React 18 frontend + Web Speech API
2. **Adaptive survey engine** → dynamic skip logic, type-aware parsing (number/boolean/select/multiselect/text)
3. **AI-powered transcript interpretation** → domain vocabulary normalization, farm-name entity extraction with confidence thresholds and confirmation logic
4. **Multi-scenario financial planning engine** → CAPEX/OPEX analysis, ROI, payback period, break-even, NPV, IRR, per-area productivity metrics
5. **Backend services** → FastAPI (Python 3.12), async SQLAlchemy, PostgreSQL, Redis
6. **Deployable architecture** → Docker, API-driven, fully testable

---

## CORE FACTS & METRICS (Ground Truth)

### Survey Questionnaire
- **Total questions**: 27 across 6 categories (setup, fish, crops, water, financial, goals)
- **Question types**: TEXT, NUMBER, SELECT, MULTISELECT, BOOLEAN, DATE
- **Parsing logic**: Fuzzy matching for select/multiselect, number speech-to-digit conversion (e.g., "twenty thousand" → "20000"), filler removal ("um", "uh"), domain-specific vocab normalization (e.g., "till" → "tilapia", "nft" → "NFT")
- **Progress tracking**: answered/total steps, session context persistence in JSONB

### Voice Interpretation
- **Farm-name extraction**: confidence-based candidate scoring, stopword removal, proper noun heuristics, title-casing normalization
- **Confirmation logic**: combined STT confidence (0..1) + entity confidence (0..1) = final confidence; triggers confirmation if below configured thresholds (default: entity ≥0.65, STT ≥0.45)
- **Transcript post-processing**: filler removal, casing preservation, domain replacements, whitespace normalization
- **Spoken number handling**: word-to-digit conversion ("lakh"→"100000", "crore"→"10000000") plus direct digit extraction

### Financial Engine
**Test-backed metrics (from unit tests):**
- Base scenario fixture:
  - CAPEX: ₹500,000 | Monthly OPEX: ₹30,000 | Monthly revenue: ₹55,000 | Monthly net: ₹25,000
  - ROI: 60.0% | Payback: 20 months | Break-even: month 20
- Scenario monotonicity validated: Pessimistic (×0.75 revenue) < Base < Optimistic (×1.30 revenue)
- Per-area metrics: Revenue/m² ≈ ₹660 | Profit/m² ≈ ₹300 | CAPEX/m² ≈ ₹500 | OPEX/m² ≈ ₹360
- Margin calculations validated: Profit margin ≈ 45.45% | OPEX/revenue ≈ 54.55% | COGS proxy ≈ 14.55%
- All percentages (revenue mix, cost mix) sum to 100% ✓

**Key formulas:**
- ROI(%) = (Net Profit Annual / CAPEX) × 100
- NPV = -CAPEX + Σ [CF_month / (1+r_monthly)^m]
- Payback = CAPEX / Monthly_Net_CF
- Break-even = first month where cumulative cash flow ≥ 0

### API Endpoints
- `POST /api/v1/session/start` → returns first question + progress
- `POST /api/v1/session/answer` → validates, parses, records answer; returns next question or completion signal
- `POST /api/v1/audio/transcribe` → uploads audio, returns transcript + confidence + farm-name interpretation
- `GET /api/v1/analysis/{sessionId}` → generates financial plan (base/pessimistic/optimistic + recommendations)

### Test Coverage
- Financial correctness: 18 unit tests covering inputs, metrics, scenarios, normals, edge cases
- Voice interpretation: farm-name extraction, filler removal, confirmation thresholds
- STT harness: 4 default transcript cases covering prefix noise, lowercase, fillers, low confidence
- Auth: register, login, token refresh, JWT validation

---

## STRUCTURE & CONTENT REQUIREMENTS

Generate these sections in order:

### I. TITLE
A compelling IEEE title, e.g.:
- "Voice-Driven Decision Support for Aquaponic Farm Financial Planning Using Adaptive Questionnaires and Multi-Scenario Analytics"

### II. ABSTRACT (150–250 words)
- Hook: aquaponic operators need integrated operational + financial guidance
- Gap: existing tools are static or non-adaptive
- Contribution: voice/text survey, adaptive engine, financial forecasting
- Methods: speech transcription + confidence-aware interpretation + deterministic financial computation
- Results: architecture validated by unit tests; suitable for decision support
- Impact: deployable framework for resource-constrained contexts

### III. KEYWORDS (5–7 terms)
e.g., aquaponics, decision support, speech interface, adaptive questionnaire, financial forecasting, IoT integration, FastAPI

### IV. INTRODUCTION
- Motivate aquaponic farming challenges (small/medium operators, manual planning)
- Position related work (smart agriculture DSS, voice UX in field settings, agri-tech finance)
- State contributions clearly
- Outline paper structure

### V. RELATED WORK
- Smart agriculture decision-support systems
- Voice interfaces for low-resource contexts
- Farm financial planning in agri-tech
- Positioning: this work combines voice UX + adaptive survey + scenario-based finance in one stack

### VI. SYSTEM DESIGN & METHODOLOGY
**A. Architecture Overview**
- High-level diagram (text description sufficient)
- Frontend: React, Web Speech API, Zustand state
- Backend: FastAPI routers, async services, JSONB context
- Data: PostgreSQL, Redis, UUID PKs

**B. Questionnaire Engine**
- Question bank structure (27 questions across 6 categories)
- Dynamic next-question selection algorithm (skip conditions)
- Type-aware parsing with validation
- Completion detection

**C. Voice Interpretation Pipeline**
- Transcription (faster-whisper, confidence extraction)
- Post-processing (fillers, domain vocabulary, text normalization)
- Entity extraction (farm-name n-gram scoring, alternatives generation)
- Confidence fusion: STT_conf × 0.6 + entity_conf × 0.4 → confirmation trigger

**D. Financial Planning Engine**
- Input mapping (CAPEX, OPEX, revenue)
- Scenario computation (pessimistic ×0.75, base, optimistic ×1.30)
- Metrics: ROI, payback, break-even, NPV, IRR, per-area productivity
- Recommendation rules (cash flow, cost ratios, diversification, scaling)

### VII. EXPERIMENTAL SETUP & VALIDATION
- Unit test suite coverage (18 financial, 5 voice, STT harness)
- Metric verification approach (assertions, deterministic computation)
- Suggested live evaluation dimensions:
  - Transcript extraction accuracy under noisy input
  - Financial scenario consistency
  - End-to-end latency
  - Robustness under low-confidence speech

### VIII. RESULTS & ANALYSIS
**Create 3 tables + brief narrative:**

**Table 1: Financial Correctness (Unit Test Results)**
| Metric | Expected | Observed | Status |
|--------|----------|----------|--------|
| ROI (base) | 60.0% | 60.0% | ✓ PASS |
| Payback Period | 20 months | 20 months | ✓ PASS |
| Break-Even Month | 20 | 20 | ✓ PASS |
| NPV (profitable) | > 0 | > 0 | ✓ PASS |
| Scenario Monotonicity | Pess < Base < Opt | Pess < Base < Opt | ✓ PASS |

**Table 2: Voice Interpretation Behavior**
| Test Case | Best Extraction | Confirmation Logic | Result |
|-----------|-----------------|-------------------|--------|
| Clean transcript | "Green Ridge Farm" | No confirm needed (high STT conf) | ✓ PASS |
| Low confidence | "Green Ridge Farm" | Confirm triggered (STT < 0.45) | ✓ PASS |
| With noise/fillers | "Green Ridge Farm" | Extracted correctly | ✓ PASS |

**Table 3: System Performance (Placeholder)**
| Component | Metric | Target | Expected Status |
|-----------|--------|--------|-----------------|
| Session answer | P95 latency | < 200ms | Acceptable (to measure) |
| Audio transcribe | P95 latency | < 5s | Acceptable (to measure) |
| E2E survey-to-analysis | Total time | < 3 min | Acceptable (to measure) |

Narrative:
- All financial calculations passed deterministic test suite with 100% accuracy.
- Scenario monotonicity validated across 10+ parameter combinations.
- Voice interpretation correctly extracted farm names and triggered confirmation at configured thresholds.
- System architecture supports modular extension and deployment.

### IX. DISCUSSION
- **Practical implications**: farmers retrieve personalized financial guidance via voice UX, avoiding form fatigue
- **Reliability boundaries**: current validation is at software correctness level; real-world impact requires field trials
- **Limitations**:
  - Validation is synthetic (unit tests) rather than large-scale user study
  - STT accent diversity limited to faster-whisper general English model
  - Financial recommendations are rule-based, not yet ML-informed
  - No user experience (UX) or workflow acceptance data

### X. CONCLUSION & FUTURE WORK
- Summarize: integrated platform combining voice, adaptive survey, financial planning
- Achievements: modular, testable, deployable architecture with strong correctness validation
- Future directions:
  - Multilingual and accent-robust STT benchmarking
  - Field trials with real farmers (N > 50) to measure planning impact and ROI prediction accuracy
  - ML-driven recommendation refinement using historical farm outcomes
  - Integration with market price APIs and weather forecasting for dynamic risk modeling
  - Mobile-optimized PWA deployment for offline-capable field use

### XI. REFERENCES
Include these categories:
- Speech processing (faster-whisper, Web Speech API)
- Farm decision support systems (2–3 papers)
- Financial planning & scenario analysis (NPV, IRR methods)
- Adaptive questionnaires / survey design
- Tech stack (FastAPI, React, PostgreSQL)

---

## OUTPUT REQUIREMENTS

1. **Format**: Plain text or markdown, ready to paste into LaTeX/Overleaf
2. **Content**:
   - All sections I–XI above
   - At least 3 tables with results
   - 2–3 inline equations (use $ ... $ for LaTeX notation)
   - ~2000–2500 words (fits 8–10 pages when formatted)
3. **Tone**: Professional, scholarly, evidence-based; avoid marketing language
4. **Claims**: Back each claim to test evidence or implementation detail; mark live measurements as "to be measured in field trials"
5. **Figures**: Describe in text how to create 2–3 diagrams (system architecture, survey flow, financial flow)

---

## FINAL OUTPUT FORMAT

Provide the complete paper with:
- Title, Authors (use "Anonymous" if not provided), Abstract, Keywords
- Section numbering (I–XI)
- All tables, equations, and citations
- Ready to copy-paste into academic document template

**Start now and generate the full, complete IEEE conference paper for AquaponicAI.**

---
