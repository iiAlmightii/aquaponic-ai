"""
routers/auth.py — Authentication endpoints: register, login, refresh, me, google.
"""

from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import User
from services.auth_service import AuthService, decode_token, create_access_token, create_refresh_token

router = APIRouter()
bearer = HTTPBearer()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty.")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Optional["UserResponse"] = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str


# ── Dependency ────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    svc = AuthService(db)
    return await svc.get_current_user(credentials.credentials)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    svc = AuthService(db)
    user = await svc.register(body.email, body.full_name, body.password)
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name, role=user.role)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate and receive JWT tokens plus user profile in one round trip."""
    svc = AuthService(db)
    access, refresh, user = await svc.authenticate(body.email, body.password)
    user_data = UserResponse(id=str(user.id), email=user.email, full_name=user.full_name, role=user.role)
    return TokenResponse(access_token=access, refresh_token=refresh, user=user_data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    """Exchange a refresh token for new access + refresh tokens."""
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
    from services.auth_service import create_access_token, create_refresh_token
    return TokenResponse(
        access_token=create_access_token(payload["sub"], "farmer"),
        refresh_token=create_refresh_token(payload["sub"]),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    """Return current authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
    )


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token from frontend


@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Sign in / register with Google OAuth. Verifies Google ID token, creates user if needed."""
    # Verify token with Google
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/tokeninfo",
                params={"id_token": body.credential},
            )
        if not resp.is_success:
            raise HTTPException(status_code=401, detail="Invalid Google token.")
        info = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Could not verify Google token.")

    email = info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google token missing email.")

    name = info.get("name") or info.get("given_name") or email.split("@")[0]

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            email=email,
            full_name=name,
            hashed_password="",   # Google users have no password
            is_verified=True,
            role="farmer",
        )
        db.add(user)
        await db.flush()

    access = create_access_token(str(user.id), user.role)
    refresh = create_refresh_token(str(user.id))
    user_data = UserResponse(id=str(user.id), email=user.email, full_name=user.full_name, role=user.role)
    return TokenResponse(access_token=access, refresh_token=refresh, user=user_data)
