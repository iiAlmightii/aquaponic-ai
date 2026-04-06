"""
tests/test_auth.py — Integration tests for auth endpoints.
Uses httpx AsyncClient against the live FastAPI app.
Run: pytest tests/test_auth.py -v --asyncio-mode=auto
"""

import pytest
import pytest_asyncio
import os
from httpx import AsyncClient, ASGITransport

# These tests require a reachable database configured in `core.config`.
# Default to skipping in dev/CI environments where Postgres isn't available.
if (os.getenv("RUN_DB_TESTS", "false").lower() != "true"):
    pytest.skip("Skipping auth integration tests (set RUN_DB_TESTS=true to enable).", allow_module_level=True)

# Minimal in-memory override — real tests would use a test DB
@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
class TestAuthEndpoints:
    BASE = "/api/v1/auth"

    async def test_register_success(self, client: AsyncClient):
        res = await client.post(f"{self.BASE}/register", json={
            "email":     "testfarmer@aquaponic.ai",
            "full_name": "Test Farmer",
            "password":  "securepassword123",
        })
        assert res.status_code == 201
        data = res.json()
        assert data["email"] == "testfarmer@aquaponic.ai"
        assert "id" in data

    async def test_register_duplicate_email(self, client: AsyncClient):
        payload = {"email": "dup@aquaponic.ai", "full_name": "Dup User", "password": "pass12345"}
        await client.post(f"{self.BASE}/register", json=payload)
        res = await client.post(f"{self.BASE}/register", json=payload)
        assert res.status_code == 409

    async def test_register_weak_password(self, client: AsyncClient):
        res = await client.post(f"{self.BASE}/register", json={
            "email": "weak@aquaponic.ai", "full_name": "Weak", "password": "123"
        })
        assert res.status_code == 422

    async def test_login_success(self, client: AsyncClient):
        await client.post(f"{self.BASE}/register", json={
            "email": "login@aquaponic.ai", "full_name": "Login User", "password": "password123"
        })
        res = await client.post(f"{self.BASE}/login", json={
            "email": "login@aquaponic.ai", "password": "password123"
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient):
        res = await client.post(f"{self.BASE}/login", json={
            "email": "login@aquaponic.ai", "password": "wrongpassword"
        })
        assert res.status_code == 401

    async def test_me_authenticated(self, client: AsyncClient, auth_token: str):
        res = await client.get(f"{self.BASE}/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert res.status_code == 200
        assert "email" in res.json()

    async def test_me_unauthenticated(self, client: AsyncClient):
        res = await client.get(f"{self.BASE}/me")
        assert res.status_code == 403   # missing credentials → 403


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def client():
    """Create a test AsyncClient. Real tests would override DB with test DB."""
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(scope="module")
async def auth_token(client):
    """Register + login a test user and return access token."""
    await client.post("/api/v1/auth/register", json={
        "email": "fixture@aquaponic.ai", "full_name": "Fixture User", "password": "fixture123"
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "fixture@aquaponic.ai", "password": "fixture123"
    })
    return res.json()["access_token"]
