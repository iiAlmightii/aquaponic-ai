"""
services/auth_service.py — Authentication business logic.
Handles registration, login, JWT token generation/validation, and password management.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models import User

logger = logging.getLogger(__name__)


# ── Password Utilities ────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT Utilities ─────────────────────────────────────────────────────────────

def create_access_token(subject: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": subject, "role": role, "exp": expire, "type": "access"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": subject, "exp": expire, "type": "refresh"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ── Auth Service ──────────────────────────────────────────────────────────────

class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, email: str, full_name: str, password: str) -> User:
        """Create a new user account. Raises 409 if email already exists."""
        result = await self.db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

        user = User(email=email, full_name=full_name, hashed_password=hash_password(password))
        self.db.add(user)
        await self.db.flush()
        logger.info("New user registered: %s", email)
        return user

    async def authenticate(self, email: str, password: str) -> tuple[str, str]:
        """Validate credentials and return (access_token, refresh_token)."""
        result = await self.db.execute(select(User).where(User.email == email, User.is_active == True))
        user: Optional[User] = result.scalar_one_or_none()

        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        access_token = create_access_token(user.id, user.role)
        refresh_token = create_refresh_token(user.id)
        logger.info("User authenticated: %s", email)
        return access_token, refresh_token

    async def get_current_user(self, token: str) -> User:
        """Resolve JWT → User row. Raises 401 on failure."""
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")

        result = await self.db.execute(select(User).where(User.id == payload["sub"], User.is_active == True))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
        return user
