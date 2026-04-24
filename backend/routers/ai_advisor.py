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
from services.sarvam_llm_service import SarvamLLMService, SessionType

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
    session_type: SessionType


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    body: ChatRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not settings.SARVAM_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI Advisor is not available at this time.",
        )
    svc = SarvamLLMService()
    try:
        reply, session_type = await svc.chat(
            body.message, body.session_id, str(current_user.id), db
        )
    except httpx.HTTPStatusError as exc:
        logger.error("Sarvam API error: %s", exc.response.status_code)
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    except httpx.RequestError as exc:
        logger.error("Sarvam network error: %s (%s)", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    except ValueError as exc:
        logger.error("Sarvam response parse error: %s", exc)
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")
    return ChatResponse(reply=reply, session_type=session_type)
