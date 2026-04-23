# Sarvam AI Advisor — Design Spec

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this spec task-by-task.

**Goal:** Add a personalized AI Advisor tab powered by Sarvam 30B that gives aquaponic and land farming users conversational crop and financial advice grounded in their own survey data.

**Architecture:** Single unified chat endpoint (`POST /api/v1/ai/chat`). A new service builds a personalized system prompt from the user's session/financial data, calls Sarvam 30B, and returns the plain-text reply. The frontend renders a dedicated "AI Advisor" tab with a chat bubble UI.

**Tech Stack:** Sarvam 30B (`sarvam-m`) via REST, FastAPI, React 18, existing Axios instance + JWT auth, existing Pydantic settings.

---

## Scope

### In scope (Phase 1)
- `services/sarvam_llm_service.py` — wraps Sarvam 30B chat completions API
- `routers/ai_advisor.py` — `POST /api/v1/ai/chat` endpoint, JWT-protected
- Context injection — pull user's session + financial plan from DB, build dynamic system prompt
- Works for **both** aquaponic survey users and land farm survey users
- Generic fallback (no session) — acts as a general aquaponics/farming knowledge base
- `frontend/src/app/components/ai/AIAdvisor.tsx` — dedicated AI Advisor tab
- Config — reuse `SARVAM_API_KEY` already in settings; add `SARVAM_CHAT_MODEL`

### Out of scope (Phase 2 — explicitly deferred)
- SSE streaming responses
- `ai_conversations` DB table for persisting chat history
- Multi-turn context window (last N messages sent to Sarvam each turn)

---

## Section 1: Architecture & Data Flow

```
Frontend (AIAdvisor.tsx)
  → POST /api/v1/ai/chat  { message, session_id? }
      → ai_advisor router
          → fetch session + financial_plan from DB (if session_id given)
          → SarvamLLMService.chat(message, context)
              → build system_prompt from context
              → POST https://api.sarvam.ai/v1/chat/completions
              ← { reply: string }
          ← { reply: string, session_type: "aquaponic" | "land" | "generic" }
  ← render reply in chat bubble
```

Stateless per message — no history stored in Phase 1. Each request is self-contained.

---

## Section 2: System Prompt & Context Injection

`SarvamLLMService` builds the system prompt dynamically before each call.

### Aquaponic user (session found)
```
You are an expert aquaponics advisor for Indian farmers. Answer in clear,
practical English. Always frame financial figures in Indian units
(₹, lakh, crore). Be concise — 3-5 sentences unless the user asks for detail.

User's farm profile:
- System type: {system_type}
- Fish: {fish_species} ({fish_count} fish, {tank_volume_litres}L tank)
- Crops: {crop_list} ({crop_area_m2} m²)
- Location: {location}
- Monthly revenue: ₹{monthly_revenue} | Monthly OPEX: ₹{monthly_opex}
- ROI: {roi_pct}% | Payback: {payback_months} months
```

### Land farm user (session found)
```
You are an expert land farming advisor for Indian farmers. Answer in clear,
practical English. Always frame financial figures in Indian units
(₹, lakh, crore). Be concise — 3-5 sentences unless the user asks for detail.

User's farm profile:
- Land area: {land_area_sqm} m²
- Crops: {crop_list_with_cycles}
- Irrigation: {irrigation_type}
- Monthly revenue: ₹{monthly_revenue} | Monthly OPEX: ₹{monthly_opex}
- Annual profit: ₹{annual_profit}
```

### Generic fallback (no session_id, or session not found)
```
You are an expert aquaponics and land farming advisor for Indian farmers.
Answer in clear, practical English. Always frame financial figures in Indian
units (₹, lakh, crore). Be concise — 3-5 sentences unless the user asks
for detail.
```

**Context extraction logic:**
- Fetch `Session` row by `session_id`, read `context_data` JSONB
- Fetch related `FinancialPlan` row, read `scenarios["base"]` for revenue/OPEX/ROI
- If either fetch fails or returns None → silently use generic prompt (no error raised)
- Session type determined by `session.survey_type` field (`"aquaponic"` | `"land"`)

---

## Section 3: API Contract

### `POST /api/v1/ai/chat`

**Auth:** JWT Bearer token required (same as all other endpoints).

**Request body:**
```json
{
  "message": "why is my ROI low?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```
`session_id` is optional. If omitted, response is generic (non-personalized).

**Response (200):**
```json
{
  "reply": "Your ROI of 14% is below the aquaponics benchmark of 20–25%...",
  "session_type": "aquaponic"
}
```
`session_type` is `"aquaponic"`, `"land"`, or `"generic"`.

**Error responses:**
| Status | Condition | `detail` message |
|--------|-----------|-----------------|
| 503 | `SARVAM_API_KEY` not set | `"AI Advisor not configured — add SARVAM_API_KEY to .env"` |
| 502 | Sarvam API timeout or non-200 | `"AI service temporarily unavailable"` |
| 422 | Empty `message` field | FastAPI validation error |

---

## Section 4: Frontend — AIAdvisor.tsx

**Location:** `frontend/src/app/components/ai/AIAdvisor.tsx`

**Nav integration:** Add "AI Advisor" tab to `MainLayout.tsx` alongside Dashboard, Surveys, Reports, Farms.

**UI behaviour:**
- Chat bubble layout: user messages right-aligned (blue), AI replies left-aligned (slate)
- Input box pinned to bottom with a Send button; Enter key also submits
- While awaiting reply: show a "Sarvam is thinking…" typing indicator
- If user has no completed survey: show a soft banner at top — "Complete a survey to get personalized advice — or ask a general question below" — chat still works in generic mode
- `session_id` sourced from Zustand store (`store.currentSessionId`) — passed automatically if present, omitted if null
- Uses the existing `api.js` Axios instance (JWT header injected automatically)

**Component state:**
```ts
messages: { role: "user" | "ai", text: string }[]
input: string
loading: boolean
error: string | null
```

---

## Section 5: Configuration

**`core/config.py` additions:**
```python
SARVAM_API_KEY: str = ""          # already present — reused from eval pipeline
SARVAM_CHAT_MODEL: str = "sarvam-m"   # Sarvam 30B model ID
```

**`.env.example` addition:**
```env
# Sarvam AI Advisor (chat completions — free tier)
SARVAM_CHAT_MODEL=sarvam-m
```
`SARVAM_API_KEY` already documented in `.env.example` under the eval section.

**`main.py`:** Register `ai_advisor` router unconditionally (not behind `EVAL_MODE` flag) — the advisor is a core app feature, not an eval-only tool. If `SARVAM_API_KEY` is empty, the endpoint returns 503 rather than failing at startup.

---

## Section 6: Testing

**`backend/tests/test_ai_advisor.py`:**

| Test | What it checks |
|------|---------------|
| `test_chat_returns_reply_generic` | No session_id → 200, `session_type == "generic"` |
| `test_chat_uses_session_context` | Valid session_id → system prompt contains farm data |
| `test_chat_missing_session_falls_back` | Non-existent session_id → 200 generic (no error) |
| `test_chat_no_api_key_returns_503` | `SARVAM_API_KEY=""` → 503 |
| `test_chat_sarvam_error_returns_502` | Sarvam returns 500 → 502 |
| `test_chat_empty_message_returns_422` | `message=""` → 422 |

Sarvam HTTP calls are mocked with `respx` (same pattern as other external API tests). No real API calls in unit tests.

---

## Phase 2 Checklist (deferred — do not implement now)

- [ ] SSE streaming: `POST /api/v1/ai/chat/stream` returns `text/event-stream`
- [ ] `ai_conversations` table: `id, user_id, session_id, role, content, created_at`
- [ ] Multi-turn: last 10 messages fetched and prepended as `messages[]` in Sarvam API call
- [ ] Frontend: auto-scroll to latest message, conversation persists across page refreshes
