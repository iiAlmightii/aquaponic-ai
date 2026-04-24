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
from services.land_financial_service import compute_land_financials

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
        user_id: str,
        db: AsyncSession,
    ) -> tuple[str, SessionType]:
        """Return (reply_text, session_type). Raises httpx errors on API failure."""
        system_prompt, session_type = await self._build_prompt(session_id, user_id, db)
        reply = await self._call_sarvam(system_prompt, message)
        return reply, session_type

    async def _build_prompt(
        self, session_id: str | None, user_id: str, db: AsyncSession
    ) -> tuple[str, SessionType]:
        if not session_id:
            return _GENERIC_PROMPT, "generic"

        result = await db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == user_id)
        )
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
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                _SARVAM_CHAT_URL,
                json=payload,
                headers={"API-Subscription-Key": settings.SARVAM_API_KEY},
            )
            response.raise_for_status()
        try:
            return response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise ValueError(f"Unexpected Sarvam response format: {exc}") from exc


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
            f"- ROI: {plan.roi_percent or 0:.1f}%"
            f" | Payback: {int(plan.payback_period_months or 0)} months",
        ]

    return "\n".join(lines)


def _build_land_prompt(ctx: dict) -> str:
    answers = ctx.get("answers", {})
    crops_list = ctx.get("crops", [])

    crop_parts = []
    for c in crops_list:
        name = c.get("name", "")
        if not name:
            continue
        cyc = c.get("cycles_per_year")
        label = f"{name} ({cyc} cycle{'s' if cyc != 1 else ''}/yr)" if cyc else name
        crop_parts.append(label)
    crop_str = ", ".join(crop_parts) if crop_parts else "not specified"

    lines = [
        "You are an expert land farming advisor for Indian farmers. Answer in clear,",
        "practical English. Always frame financial figures in Indian units (₹, lakh, crore).",
        "Be concise — 3-5 sentences unless the user asks for detail.",
        "",
        "User's farm profile:",
        f"- Land area: {answers.get('land_area_sqm', 'not specified')} m²",
        f"- Crops: {crop_str}",
        f"- Irrigation: {answers.get('irrigation_type', 'not specified')}",
    ]

    try:
        calc = compute_land_financials(ctx)
        summary = calc.get("summary", {})
        annual_revenue = float(summary.get("total_revenue", 0) or 0)
        annual_cost = float(summary.get("total_cost", 0) or 0)
        annual_profit = float(summary.get("profit", 0) or 0)
        if annual_revenue > 0 or annual_cost > 0:
            lines += [
                f"- Monthly revenue: ₹{annual_revenue / 12:,.0f}"
                f" | Monthly OPEX: ₹{annual_cost / 12:,.0f}",
                f"- Annual profit: ₹{annual_profit:,.0f}",
            ]
    except Exception:
        pass

    return "\n".join(lines)
