"""Tests for Sarvam AI Advisor — prompt building and endpoint behaviour."""
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
    no_plan_result = MagicMock()
    no_plan_result.scalars.return_value.first.return_value = None
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=[
        MagicMock(**{"scalars.return_value.first.return_value": MagicMock(context_data=ctx)}),
        no_plan_result,
    ])
    prompt, session_type = await svc._build_prompt("some-uuid", mock_db)
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


@pytest.mark.asyncio
async def test_build_prompt_aquaponic_with_null_roi_does_not_crash():
    """FinancialPlan with roi_percent=None must not crash the prompt builder."""
    from services.sarvam_llm_service import SarvamLLMService
    from models import FinancialPlan
    ctx = {
        "answers": {
            "system_type": "DWC",
            "fish_species": "Catfish",
            "fish_count": "50",
            "tank_volume": "500",
            "crop_types": ["Spinach"],
            "farm_location": "Pune, Maharashtra",
        }
    }
    plan_mock = MagicMock(spec=FinancialPlan)
    plan_mock.roi_percent = None
    plan_mock.payback_period_months = None
    plan_mock.monthly_fish_revenue = 10000.0
    plan_mock.monthly_crop_revenue = 5000.0
    plan_mock.monthly_other_revenue = 0.0
    plan_mock.monthly_feed_cost = 3000.0
    plan_mock.monthly_labor_cost = 2000.0
    plan_mock.monthly_utilities_cost = 1000.0
    plan_mock.monthly_maintenance_cost = 500.0
    plan_mock.monthly_other_cost = 0.0

    svc = SarvamLLMService()
    sess_result = MagicMock()
    sess_result.scalars.return_value.first.return_value = MagicMock(context_data=ctx)
    plan_result = MagicMock()
    plan_result.scalars.return_value.first.return_value = plan_mock
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(side_effect=[sess_result, plan_result])

    prompt, session_type = await svc._build_prompt("some-uuid", mock_db)
    assert session_type == "aquaponic"
    assert "ROI: 0.0%" in prompt


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
    from httpx import AsyncClient, ASGITransport

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = "test-key"

    async def mock_chat(self, message, session_id, db):
        return "Aquaponics uses fish waste to fertilize plants.", "generic"

    monkeypatch.setattr(SarvamLLMService, "chat", mock_chat)

    try:
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
async def test_chat_timeout_returns_502(override_auth_and_db, monkeypatch):
    import core.config as cfg
    import httpx
    from main import app
    from services.sarvam_llm_service import SarvamLLMService
    from httpx import AsyncClient, ASGITransport

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = "test-key"

    async def mock_chat_timeout(self, message, session_id, db):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(SarvamLLMService, "chat", mock_chat_timeout)

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
async def test_chat_parse_error_returns_502(override_auth_and_db, monkeypatch):
    import core.config as cfg
    from main import app
    from services.sarvam_llm_service import SarvamLLMService
    from httpx import AsyncClient, ASGITransport

    original_key = cfg.settings.SARVAM_API_KEY
    cfg.settings.SARVAM_API_KEY = "test-key"

    async def mock_chat_parse_error(self, message, session_id, db):
        raise ValueError("Unexpected Sarvam response format: 'choices'")

    monkeypatch.setattr(SarvamLLMService, "chat", mock_chat_parse_error)

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
