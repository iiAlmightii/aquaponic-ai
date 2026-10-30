"""
routers/password_reset.py — Forgot / Reset password endpoints.

Flow:
  1. POST /request  → generates a 6-digit OTP stored in Redis (10 min TTL)
                       returns the token in the JSON response (dev mode).
  2. POST /reset    → verifies OTP + updates hashed_password in DB.
"""

import secrets
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis_client import get_redis
from models import User
from services.auth_service import hash_password

router = APIRouter()
logger = logging.getLogger(__name__)

_OTP_TTL = 600          # 10 minutes
_REDIS_PREFIX = "pwd_reset:"


# ── Schemas ───────────────────────────────────────────────────────────────────

class ResetRequestBody(BaseModel):
    email: EmailStr


class ResetConfirmBody(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/request", status_code=200)
async def request_reset(body: ResetRequestBody, db: AsyncSession = Depends(get_db)):
    """
    Generate a 6-digit OTP and store it in Redis for 10 minutes.

    For development: the OTP is returned directly in the response.
    In production, replace the return value with an email dispatch and
    return only {"message": "OTP sent to your email."}.
    """
    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))
    user: User | None = result.scalar_one_or_none()

    # Always return 200 to avoid user-enumeration — but only store OTP when user exists.
    if not user:
        logger.warning("Password-reset requested for unknown email: %s", body.email)
        return {"message": "If that email is registered, an OTP has been sent.", "otp": None}

    otp = str(secrets.randbelow(900000) + 100000)   # 6-digit OTP
    redis = get_redis()
    await redis.setex(f"{_REDIS_PREFIX}{body.email}", _OTP_TTL, otp)
    logger.info("Password-reset OTP generated for %s", body.email)

    return {
        "message": f"OTP generated. Valid for 10 minutes.",
        # ── DEV: return OTP in response so the UI can display it. ──────────
        # Remove the line below and send via email in production.
        "otp": otp,
        "expires_in_seconds": _OTP_TTL,
    }


@router.post("/reset", status_code=200)
async def confirm_reset(body: ResetConfirmBody, db: AsyncSession = Depends(get_db)):
    """Verify OTP and update the user's password."""
    redis = get_redis()
    stored_otp = await redis.get(f"{_REDIS_PREFIX}{body.email}")

    if not stored_otp or stored_otp != body.otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP. Please request a new one.",
        )

    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))
    user: User | None = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.hashed_password = hash_password(body.new_password)
    await db.flush()

    # Invalidate OTP after successful use
    await redis.delete(f"{_REDIS_PREFIX}{body.email}")
    logger.info("Password successfully reset for %s", body.email)

    return {"message": "Password reset successfully. You can now log in."}
