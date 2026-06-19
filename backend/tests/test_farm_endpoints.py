"""Tests for farm timeline and latest-session endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone


def _make_farm(farm_id="farm-1", owner_id="user-1"):
    f = MagicMock()
    f.id = farm_id
    f.owner_id = owner_id
    f.name = "Test Farm"
    return f


def _make_session(session_id="sess-1", farm_id="farm-1", survey_type="ai"):
    s = MagicMock()
    s.id = session_id
    s.farm_id = farm_id
    s.status = "completed"
    s.completed_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    s.context_data = {"answers": {"farm_name": "Test Farm"}, "source": "survey"}
    if survey_type == "land":
        s.context_data["module"] = "land_farm_voice"
    return s


@pytest.mark.asyncio
async def test_farm_sessions_returns_timeline():
    """GET /farm/{id}/sessions returns all completed sessions newest-first."""
    from routers.farm import farm_sessions

    sess_a = _make_session("s1", survey_type="ai")
    sess_b = _make_session("s2", survey_type="land")
    sess_b.completed_at = datetime(2026, 6, 1, tzinfo=timezone.utc)

    db = AsyncMock()
    farm_result = MagicMock()
    farm_result.scalar_one_or_none.return_value = _make_farm()
    sessions_result = MagicMock()
    sessions_result.scalars.return_value.all.return_value = [sess_b, sess_a]
    # land session (sess_b) uses compute_land_financials (no extra db call)
    # ai session (sess_a) queries FinancialPlan — provide a third mock result
    plan_result = MagicMock()
    plan_result.scalar_one_or_none.return_value = None  # no plan, defaults to 0
    db.execute = AsyncMock(side_effect=[farm_result, sessions_result, plan_result])

    user = MagicMock()
    user.id = "user-1"

    result = await farm_sessions("farm-1", current_user=user, db=db)
    assert len(result) == 2
    assert result[0]["session_id"] == "s2"  # newest first


@pytest.mark.asyncio
async def test_latest_session_returns_most_recent():
    """GET /farm/{id}/latest-session returns the newest completed session."""
    from routers.farm import farm_latest_session

    sess = _make_session("s-latest")
    db = AsyncMock()
    farm_result = MagicMock()
    farm_result.scalar_one_or_none.return_value = _make_farm()
    latest_result = MagicMock()
    latest_result.scalar_one_or_none.return_value = sess
    db.execute = AsyncMock(side_effect=[farm_result, latest_result])

    user = MagicMock()
    user.id = "user-1"

    result = await farm_latest_session("farm-1", current_user=user, db=db)
    assert result["session_id"] == "s-latest"
    assert result["survey_type"] == "ai"


@pytest.mark.asyncio
async def test_farm_edit_creates_new_session():
    """POST /farm/{id}/edit should create a new completed session."""
    from unittest.mock import patch
    from routers.farm import farm_edit

    db = AsyncMock()
    farm_result = MagicMock()
    farm_result.scalar_one_or_none.return_value = _make_farm()

    # Latest session for context base
    latest_result = MagicMock()
    latest_result.scalar_one_or_none.return_value = _make_session()

    db.execute = AsyncMock(side_effect=[farm_result, latest_result])
    db.add = MagicMock()
    db.flush = AsyncMock()

    user = MagicMock()
    user.id = "user-1"

    body = MagicMock()
    body.answers = {"farm_name": "Test Farm", "monthly_fish_revenue": 60000}
    body.survey_type = "ai"

    with patch("routers.farm.FinancialService") as MockSvc:
        plan_mock = MagicMock()
        plan_mock.roi_percent = 42.0
        MockSvc.return_value.create_plan = AsyncMock(return_value=plan_mock)

        result = await farm_edit("farm-1", body=body, current_user=user, db=db)

    db.add.assert_called()
    assert "session_id" in result
    assert result["farm_id"] == "farm-1"
