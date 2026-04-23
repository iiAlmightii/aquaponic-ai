# Sarvam AI Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personalized AI Advisor tab powered by Sarvam 30B that gives aquaponic and land farming users conversational crop and financial advice grounded in their own survey session data.

**Architecture:** A new `SarvamLLMService` builds a dynamic system prompt from the user's session context and calls the Sarvam 30B chat completions API. A single JWT-protected `POST /api/v1/ai/chat` endpoint returns the reply. A new React component renders a dedicated "AI Advisor" tab in the main nav. Stateless (no conversation history) in this phase.

**Tech Stack:** Sarvam 30B (`sarvam-m`) via httpx REST, FastAPI + SQLAlchemy async, React 18 + TypeScript, existing Axios instance + JWT auth, Pydantic settings.

---

## Codebase Context (read before implementing)

- **Session type detection:** `session.context_data.get("module") == "land_farm_voice"` → land survey. No `module` key → aquaponic survey. This is the only discriminator; there is no `survey_type` column on the Session model.
- **Aquaponic answer keys in `context_data["answers"]`:** `system_type`, `fish_species`, `fish_count`, `tank_volume`, `crop_types` (list or str), `farm_location`.
- **Land answer keys:** `context_data["answers"]["land_area_sqm"]`; `context_data["crops"]` is a list of `{name, cycles_per_year, months_to_harvest, price_per_kg, monthly_yield_kg}`.
- **FinancialPlan** has `session_id` FK; columns `monthly_fish_revenue`, `monthly_crop_revenue`, `monthly_other_revenue`, `monthly_feed_cost`, `monthly_labor_cost`, `monthly_utilities_cost`, `monthly_maintenance_cost`, `monthly_other_cost`, `roi_percent`, `payback_period_months`. Only aquaponic sessions have a FinancialPlan row.
- **Auth pattern:** `from routers.auth import get_current_user` → `Depends(get_current_user)`.
- **DB pattern:** `from core.database import get_db` → `Depends(get_db)`, `AsyncSession`.
- **Frontend session ID:** stored in `localStorage.getItem('last_completed_session_id')` (set by Zustand store).
- **View routing:** `App.tsx` defines `type View` and renders components by `currentView`. `MainLayout.tsx` has the `navigation` array. Add `'ai-advisor'` to both.
- **lucide-react 0.487.0** is available; `Bot` icon exists.
- **SARVAM_API_KEY** already exists in `Settings` (added for the eval pipeline) — reuse it. Only `SARVAM_CHAT_MODEL` is new.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/services/sarvam_llm_service.py` | Prompt building + Sarvam API call |
| Modify | `backend/core/config.py` | Add `SARVAM_CHAT_MODEL` setting |
| Modify | `backend/main.py` | Register `ai_advisor` router |
| Modify | `backend/.env.example` | Document `SARVAM_CHAT_MODEL` |
| Create | `backend/routers/ai_advisor.py` | `POST /api/v1/ai/chat` endpoint |
| Create | `backend/tests/test_ai_advisor.py` | Unit + integration tests |
| Create | `frontend/src/app/components/ai/AIAdvisor.tsx` | Chat bubble UI |
| Modify | `frontend/src/app/App.tsx` | Add `'ai-advisor'` view |
| Modify | `frontend/src/app/components/layout/MainLayout.tsx` | Add "AI Advisor" nav item |

---

## Task 1: Config + SarvamLLMService

**Files:**
- Modify: `backend/core/config.py`
- Modify: `backend/.env.example`
- Create: `backend/services/sarvam_llm_service.py`
- Test: `backend/tests/test_ai_advisor.py` (prompt-building tests only)

- [ ] **Step 1: Add `SARVAM_CHAT_MODEL` to Settings**

In `backend/core/config.py`, find the `SARVAM_API_KEY` line (currently near line 86) and add below it:

```python
    SARVAM_CHAT_MODEL: str = "sarvam-m"   # Sarvam 30B chat completions model
```

- [ ] **Step 2: Document in `.env.example`**

Find the `# ── Evaluation Pipeline` section in `.env.example` and add one line after `SARVAM_API_KEY`:

```env
SARVAM_CHAT_MODEL=sarvam-m
```

- [ ] **Step 3: Write the failing prompt-building test**

Create `backend/tests/test_ai_advisor.py`:

```python
"""Tests for Sarvam AI Advisor — prompt building and endpoint behaviour."""
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

_BACKEND_DIR = Path(__file__).parent.parent


@pytest.fixture(autouse=True)
def set_backend_cwd(monkeypatch):
    monkeypatch.chdir(_BACKEND_DIR)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_db_with_session(context_data: dict):
    """Return an AsyncSession mock that yields a Session with given context_data."""
    from models import Session as SessionModel
    sess = MagicMock(spec=SessionModel)
    sess.context_data = context_data
    result = MagicMock()
    result.scalars.return_value.first.return_value = sess
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


def _make_db_no_session():
    """Return an AsyncSession mock that yields no session (SELECT returns None)."""
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


# ── Prompt building tests ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_prompt_generic_when_no_session_id():
    from services.sarvam_llm_service import SarvamLLMService, _GENERIC_PROMPT
    svc = SarvamLLMService()
    db = _make_db_no_session()
    prompt, session_type = await svc._build_prompt(None, db)
    assert session_type == "generic"
    assert prompt == _GENERIC_PROMPT


@pytest.mark.asyncio
async def test_build_prompt_generic_when_session_not_found():
    from services.sarvam_llm_service import SarvamLLMService, _GENERIC_PROMPT
    svc = SarvamLLMService()
    db = _make_db_no_session()
    prompt, session_type = await svc._build_prompt("nonexistent-uuid", db)
    assert session_type == "generic"
    assert prompt == _GENERIC_PROMPT


@pytest.mark.asyncio
async def test_build_prompt_aquaponic_contains_farm_data():
    from services.sarvam_llm_service import SarvamLLMService
    ctx = {
        "answers": {
            "system_type": "NFT",
            "fish_species": "Tilapia",
            "fish_count": "200",
            "tank_volume": "2000",
            "crop_types": ["Lettuce", "Basil"],
            "farm_location": "Bengaluru, Karnataka",
        }
    }
    svc = SarvamLLMService()
    db = _make_db_with_session(ctx)
    # Second execute call (for FinancialPlan) returns None
    no_plan_result = MagicMock()
    no_plan_result.scalars.return_value.first.return_value = None
    db.execute = AsyncMock(side_effect=[
        MagicMock(**{"scalars.return_value.first.return_value": MagicMock(context_data=ctx)}),
        no_plan_result,
    ])
    prompt, session_type = await svc._build_prompt("some-uuid", db)
    assert session_type == "aquaponic"
    assert "NFT" in prompt
    assert "Tilapia" in prompt
    assert "Lettuce" in prompt
    assert "Bengaluru" in prompt
    assert "aquaponics advisor" in prompt


@pytest.mark.asyncio
async def test_build_prompt_land_contains_farm_data():
    from services.sarvam_llm_service import SarvamLLMService
    ctx = {
        "module": "land_farm_voice",
        "answers": {"land_area_sqm": "5000"},
        "crops": [{"name": "Wheat"}, {"name": "Rice"}],
    }
    svc = SarvamLLMService()
    db = _make_db_with_session(ctx)
    prompt, session_type = await svc._build_prompt("some-uuid", db)
    assert session_type == "land"
    assert "5000" in prompt
    assert "Wheat" in prompt
    assert "Rice" in prompt
    assert "land farming advisor" in prompt
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd backend
pytest tests/test_ai_advisor.py::test_build_prompt_generic_when_no_session_id -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'services.sarvam_llm_service'`

- [ ] **Step 5: Create `backend/services/sarvam_llm_service.py`**

```python
"""
services/sarvam_llm_service.py — Sarvam 30B chat completions wrapper.

Builds a personalized system prompt from session context_data and calls the
Sarvam API. Stateless — no conversation history stored (Phase 1).
"""
from __future__ import annotations

import logging
from typing import Literal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models import FinancialPlan, Session

logger = logging.getLogger(__name__)

_SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"

SessionType = Literal["aquaponic", "land", "generic"]

_GENERIC_PROMPT = (
    "You are an expert aquaponics and land farming advisor for Indian farmers. "
    "Answer in clear, practical English. Always frame financial figures in Indian units "
    "(₹, lakh, crore). Be concise — 3-5 sentences unless the user asks for detail."
)


class SarvamLLMService:
    async def chat(
        self,
        message: str,
        session_id: str | None,
        db: AsyncSession,
    ) -> tuple[str, SessionType]:
        """Return (reply_text, session_type). Raises httpx errors on API failure."""
        system_prompt, session_type = await self._build_prompt(session_id, db)
        reply = await self._call_sarvam(system_prompt, message)
        return reply, session_type

    async def _build_prompt(
        self, session_id: str | None, db: AsyncSession
    ) -> tuple[str, SessionType]:
        if not session_id:
            return _GENERIC_PROMPT, "generic"

        result = await db.execute(select(Session).where(Session.id == session_id))
        sess = result.scalars().first()
        if not sess or not sess.context_data:
            return _GENERIC_PROMPT, "generic"

        ctx = sess.context_data
        if ctx.get("module") == "land_farm_voice":
            return _build_land_prompt(ctx), "land"

        plan_result = await db.execute(
            select(FinancialPlan).where(FinancialPlan.session_id == session_id)
        )
        plan = plan_result.scalars().first()
        return _build_aquaponic_prompt(ctx, plan), "aquaponic"

    async def _call_sarvam(self, system_prompt: str, message: str) -> str:
        payload = {
            "model": settings.SARVAM_CHAT_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                _SARVAM_CHAT_URL,
                json=payload,
                headers={"API-Subscription-Key": settings.SARVAM_API_KEY},
            )
            response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


# ── Prompt builders ───────────────────────────────────────────────────────────

def _build_aquaponic_prompt(ctx: dict, plan: FinancialPlan | None) -> str:
    answers = ctx.get("answers", {})
    crops = answers.get("crop_types", [])
    if isinstance(crops, str):
        crops = [crops]
    crop_str = ", ".join(crops) if crops else "not specified"

    lines = [
        "You are an expert aquaponics advisor for Indian farmers. Answer in clear,",
        "practical English. Always frame financial figures in Indian units (₹, lakh, crore).",
        "Be concise — 3-5 sentences unless the user asks for detail.",
        "",
        "User's farm profile:",
        f"- System type: {answers.get('system_type', 'not specified')}",
        f"- Fish: {answers.get('fish_species', 'not specified')}"
        f" ({answers.get('fish_count', '?')} fish, {answers.get('tank_volume', '?')}L tank)",
        f"- Crops: {crop_str}",
        f"- Location: {answers.get('farm_location', 'not specified')}",
    ]

    if plan:
        monthly_revenue = (
            (plan.monthly_fish_revenue or 0)
            + (plan.monthly_crop_revenue or 0)
            + (plan.monthly_other_revenue or 0)
        )
        monthly_opex = (
            (plan.monthly_feed_cost or 0)
            + (plan.monthly_labor_cost or 0)
            + (plan.monthly_utilities_cost or 0)
            + (plan.monthly_maintenance_cost or 0)
            + (plan.monthly_other_cost or 0)
        )
        lines += [
            f"- Monthly revenue: ₹{monthly_revenue:,.0f}"
            f" | Monthly OPEX: ₹{monthly_opex:,.0f}",
            f"- ROI: {plan.roi_percent:.1f}%"
            f" | Payback: {int(plan.payback_period_months or 0)} months",
        ]

    return "\n".join(lines)


def _build_land_prompt(ctx: dict) -> str:
    answers = ctx.get("answers", {})
    crops_list = ctx.get("crops", [])
    crop_names = [c.get("name", "") for c in crops_list if c.get("name")]
    crop_str = ", ".join(crop_names) if crop_names else "not specified"

    lines = [
        "You are an expert land farming advisor for Indian farmers. Answer in clear,",
        "practical English. Always frame financial figures in Indian units (₹, lakh, crore).",
        "Be concise — 3-5 sentences unless the user asks for detail.",
        "",
        "User's farm profile:",
        f"- Land area: {answers.get('land_area_sqm', 'not specified')} m²",
        f"- Crops: {crop_str}",
    ]

    # Include per-crop revenue if available from crop entries
    total_monthly = sum(
        float(c.get("price_per_kg", 0) or 0) * float(c.get("monthly_yield_kg", 0) or 0)
        for c in crops_list
    )
    if total_monthly > 0:
        lines.append(f"- Estimated monthly crop revenue: ₹{total_monthly:,.0f}")

    return "\n".join(lines)
```

- [ ] **Step 6: Run prompt-building tests — all 4 should pass**

```bash
cd backend
pytest tests/test_ai_advisor.py::test_build_prompt_generic_when_no_session_id \
       tests/test_ai_advisor.py::test_build_prompt_generic_when_session_not_found \
       tests/test_ai_advisor.py::test_build_prompt_aquaponic_contains_farm_data \
       tests/test_ai_advisor.py::test_build_prompt_land_contains_farm_data -v
```

Expected: `4 passed`

- [ ] **Step 7: Commit**

```bash
git add backend/core/config.py backend/.env.example backend/services/sarvam_llm_service.py backend/tests/test_ai_advisor.py
git commit -m "feat: add SarvamLLMService with personalized system prompt building"
```

---

## Task 2: AI Advisor Router + Endpoint Tests

**Files:**
- Create: `backend/routers/ai_advisor.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_ai_advisor.py` (add endpoint tests)

- [ ] **Step 1: Write failing endpoint tests**

Append to `backend/tests/test_ai_advisor.py`:

```python
# ── Endpoint tests ────────────────────────────────────────────────────────────

class _FakeUser:
    id = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def override_auth_and_db():
    """Override JWT auth and DB for endpoint tests."""
    from main import app
    from routers.auth import get_current_user
    from core.database import get_db

    no_result = MagicMock()
    no_result.scalars.return_value.first.return_value = None
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=no_result)

    app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_chat_returns_reply_generic(override_auth_and_db, monkeypatch):
    from main import app
    from services.sarvam_llm_service import SarvamLLMService
    import core.config as cfg

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = "test-key"

    async def mock_chat(self, message, session_id, db):
        return "Aquaponics uses fish waste to fertilize plants.", "generic"

    monkeypatch.setattr(SarvamLLMService, "chat", mock_chat)

    try:
        from httpx import AsyncClient, ASGITransport
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/ai/chat",
                json={"message": "What is aquaponics?"},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["reply"] == "Aquaponics uses fish waste to fertilize plants."
        assert body["session_type"] == "generic"
    finally:
        cfg.settings.SARVAM_API_KEY = original_key


@pytest.mark.asyncio
async def test_chat_no_api_key_returns_503(override_auth_and_db):
    from main import app
    import core.config as cfg
    from httpx import AsyncClient, ASGITransport

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = ""

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/ai/chat",
                json={"message": "What is aquaponics?"},
            )
        assert response.status_code == 503
        assert "SARVAM_API_KEY" in response.json()["detail"]
    finally:
        cfg.settings.SARVAM_API_KEY = original_key


@pytest.mark.asyncio
async def test_chat_sarvam_error_returns_502(override_auth_and_db, monkeypatch):
    import core.config as cfg
    import httpx
    from main import app
    from services.sarvam_llm_service import SarvamLLMService
    from httpx import AsyncClient, ASGITransport

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = "test-key"

    async def mock_chat_raises(self, message, session_id, db):
        raise httpx.HTTPStatusError(
            "500",
            request=MagicMock(),
            response=MagicMock(status_code=500, text="error"),
        )

    monkeypatch.setattr(SarvamLLMService, "chat", mock_chat_raises)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/ai/chat",
                json={"message": "What is aquaponics?"},
            )
        assert response.status_code == 502
        assert response.json()["detail"] == "AI service temporarily unavailable"
    finally:
        cfg.settings.SARVAM_API_KEY = original_key


@pytest.mark.asyncio
async def test_chat_empty_message_returns_422(override_auth_and_db):
    from main import app
    from httpx import AsyncClient, ASGITransport

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/ai/chat",
            json={"message": ""},
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_missing_session_falls_back_to_generic(override_auth_and_db, monkeypatch):
    """A non-existent session_id must fall back to generic, not error."""
    import core.config as cfg
    from main import app
    from services.sarvam_llm_service import SarvamLLMService
    from httpx import AsyncClient, ASGITransport

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = "test-key"

    received_session_type: list[str] = []

    async def mock_chat(self, message, session_id, db):
        reply, stype = "Some reply.", "generic"
        received_session_type.append(stype)
        return reply, stype

    monkeypatch.setattr(SarvamLLMService, "chat", mock_chat)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/ai/chat",
                json={"message": "Hello", "session_id": "00000000-0000-0000-0000-999999999999"},
            )
        assert response.status_code == 200
        assert received_session_type == ["generic"]
    finally:
        cfg.settings.SARVAM_API_KEY = original_key
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend
pytest tests/test_ai_advisor.py::test_chat_returns_reply_generic -v
```

Expected: `FAILED` — `404 Not Found` (router not registered yet)

- [ ] **Step 3: Create `backend/routers/ai_advisor.py`**

```python
"""routers/ai_advisor.py — Personalized AI chat advisor endpoint."""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from routers.auth import get_current_user
from services.sarvam_llm_service import SarvamLLMService

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message must not be empty")
        return v.strip()


class ChatResponse(BaseModel):
    reply: str
    session_type: str


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    body: ChatRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.SARVAM_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI Advisor not configured — add SARVAM_API_KEY to .env",
        )
    svc = SarvamLLMService()
    try:
        reply, session_type = await svc.chat(body.message, body.session_id, db)
    except httpx.HTTPStatusError as exc:
        logger.error("Sarvam API error: %s", exc.response.status_code)
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    except httpx.TimeoutException:
        logger.error("Sarvam API timed out")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    return ChatResponse(reply=reply, session_type=session_type)
```

- [ ] **Step 4: Register the router in `backend/main.py`**

Find the block where other routers are registered (around line 219 — after `crop.router`). Add before the `if settings.EVAL_MODE:` block:

```python
from routers import ai_advisor
app.include_router(ai_advisor.router, prefix=f"{API_PREFIX}/ai", tags=["AI Advisor"])
```

- [ ] **Step 5: Run all tests in the file**

```bash
cd backend
pytest tests/test_ai_advisor.py -v
```

Expected: `9 passed`

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd backend
pytest -k "not Endpoint" -v
```

Expected: all tests pass (no regressions)

- [ ] **Step 7: Commit**

```bash
git add backend/routers/ai_advisor.py backend/main.py backend/tests/test_ai_advisor.py
git commit -m "feat: add POST /api/v1/ai/chat endpoint with Sarvam 30B integration"
```

---

## Task 3: Frontend AIAdvisor Component + Nav Integration

**Files:**
- Create: `frontend/src/app/components/ai/AIAdvisor.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/components/layout/MainLayout.tsx`

- [ ] **Step 1: Create the component directory and file**

Create `frontend/src/app/components/ai/AIAdvisor.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import api from '../../utils/api';

type Message = { role: 'user' | 'ai'; text: string };

export function AIAdvisor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionId = localStorage.getItem('last_completed_session_id');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/chat', {
        message: text,
        session_id: sessionId || undefined,
      });
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail || 'AI service unavailable. Please try again.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">AI Advisor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Powered by Sarvam 30B · Ask anything about your farm, crops, fish, or finances
        </p>
      </div>

      {!sessionId && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Complete a survey to get personalized advice — or ask a general question below.
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Ask a question to get started
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <span className="text-gray-400 text-sm">Sarvam is thinking…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 max-w-[80%]">
              {error}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2 pt-3 border-t border-gray-200">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about crops, fish, finances…"
          disabled={loading}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `'ai-advisor'` to the View type and render in `App.tsx`**

Open `frontend/src/app/App.tsx`.

**Change 1** — find the `type View` line (line ~13) and add `'ai-advisor'`:

```tsx
type View = 'login' | 'register' | 'dashboard' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor';
```

**Change 2** — add the import at the top with the other component imports:

```tsx
import { AIAdvisor } from './components/ai/AIAdvisor';
```

**Change 3** — add the render case after the `{currentView === 'analytics' && <Analytics />}` line:

```tsx
      {currentView === 'ai-advisor' && <AIAdvisor />}
```

- [ ] **Step 3: Add "AI Advisor" to the nav in `MainLayout.tsx`**

Open `frontend/src/app/components/layout/MainLayout.tsx`.

**Change 1** — add `Bot` to the lucide-react import (find the existing import line):

```tsx
import { LayoutDashboard, Sprout, Mic, Leaf, FileText, BarChart3, X, Menu, Bot } from 'lucide-react';
```

**Change 2** — add `'ai-advisor'` to the `View` type (line ~16):

```tsx
type View = 'dashboard' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor';
```

**Change 3** — add the nav item to the `navigation` array after `'analytics'`:

```tsx
    { id: 'ai-advisor', name: 'AI Advisor', icon: Bot },
```

- [ ] **Step 4: Build the frontend and verify no TypeScript errors**

```bash
cd frontend
npm run build
```

Expected: build succeeds, `dist/assets/AIAdvisor-*.js` appears in output (code-split chunk).

- [ ] **Step 5: Hot-swap the build into the running Docker container**

```bash
docker cp frontend/dist/. aquaponic-ai-frontend-1:/usr/share/nginx/html/
```

- [ ] **Step 6: Smoke test in browser**

Open `http://localhost` (or `http://localhost:3001`). You should see:
- "AI Advisor" tab in the left nav with a Bot icon
- Clicking it shows the chat interface
- If no survey completed: amber banner appears
- Typing a message and pressing Send (or Enter) → shows typing indicator → reply appears

If `SARVAM_API_KEY` is real, the reply comes from Sarvam 30B. If not set, a 503 error message shows in the chat.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/components/ai/AIAdvisor.tsx \
        frontend/src/app/App.tsx \
        frontend/src/app/components/layout/MainLayout.tsx
git commit -m "feat: add AI Advisor tab with Sarvam 30B personalized chat UI"
```

---

## Self-Review Notes

- `_build_aquaponic_prompt` calls `db.execute` twice (once for Session, once for FinancialPlan). The test for this (`test_build_prompt_aquaponic_contains_farm_data`) uses `side_effect` with two mock return values to handle both calls in order.
- Land sessions have no FinancialPlan row — `_build_land_prompt` is called directly without a second DB query (correct).
- The `override_auth_and_db` fixture cleans up `dependency_overrides` in the `finally` block via `.pop()` — safe even if the test raises.
- `AIAdvisor.tsx` reads `last_completed_session_id` from `localStorage` directly (not Zustand) — this matches how the store writes it and avoids a Zustand import in a simple presentational component.
- The `Bot` icon is confirmed present in lucide-react 0.487.0.

---

## Phase 2 Checklist (do NOT implement now)

- [ ] `POST /api/v1/ai/chat/stream` — SSE streaming with `EventSourceResponse`
- [ ] `ai_conversations` table: `id, user_id, session_id, role, content, created_at`
- [ ] Multi-turn: last 10 messages fetched and prepended as `messages[]` in Sarvam API call
- [ ] Frontend: replace full-page reload with incremental streaming token display
