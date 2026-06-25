# backend/tests/test_admin.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_admin():
    u = MagicMock()
    u.id = "admin-uuid"
    u.role = "admin"
    u.email = "admin@farmconnect.com"
    return u


def _make_farmer():
    u = MagicMock()
    u.id = "farmer-uuid"
    u.role = "farmer"
    return u


@pytest.mark.asyncio
async def test_admin_required_blocks_non_admin():
    from routers.admin import admin_required
    from fastapi import HTTPException
    farmer = _make_farmer()
    with pytest.raises(HTTPException) as exc:
        await admin_required(current_user=farmer)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_required_allows_admin():
    from routers.admin import admin_required
    admin = _make_admin()
    result = await admin_required(current_user=admin)
    assert result.role == "admin"


@pytest.mark.asyncio
async def test_overview_returns_expected_keys():
    from routers.admin import admin_overview
    db = AsyncMock()

    def make_result(val):
        r = MagicMock()
        r.scalar.return_value = val
        r.fetchall.return_value = []
        return r

    db.execute = AsyncMock(return_value=make_result(0))
    admin = _make_admin()
    result = await admin_overview(current_user=admin, db=db)
    assert "total_users" in result
    assert "total_farms" in result
    assert "total_surveys" in result
    assert "users_by_role" in result
