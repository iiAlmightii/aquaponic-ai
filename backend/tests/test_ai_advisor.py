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
