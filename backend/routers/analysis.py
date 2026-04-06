"""routers/analysis.py — AI analysis retrieval."""
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from models import Session, FinancialPlan, Farm
from routers.auth import get_current_user
from services.financial_service import FinancialService, FinancialInputs
from services.google_sheets_financial_sync import GoogleSheetsFinanceSync

router = APIRouter()
logger = logging.getLogger("aquaponic_ai.analysis")


@router.get("/{session_id}")
async def get_analysis(session_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Retrieve or compute financial analysis for a completed session."""
    result = await db.execute(select(Session).where(Session.id == session_id, Session.user_id == current_user.id))
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found.")
    if sess.status != "completed":
        raise HTTPException(status_code=400, detail="Session not yet completed.")

    def _f(key, default=0.0):
        val = answers.get(key, default)
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    def _try_float(value):
        try:
            if value in (None, ""):
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    # Reuse an existing plan for this session to keep GET idempotent.
    existing_plan_result = await db.execute(
        select(FinancialPlan).where(FinancialPlan.session_id == session_id)
    )
    existing_plan = existing_plan_result.scalar_one_or_none()

    answers = sess.context_data.get("answers", {}) if sess.context_data else {}

    project_name = str(answers.get("farm_name") or "").strip()
    project_location = str(answers.get("farm_location") or "").strip()
    project_area = _try_float(answers.get("farm_area_sqm"))
    project_system = str(answers.get("system_type") or "aquaponics")

    async def _find_existing_farm_by_name(name: str):
        if not name:
            return None
        match = await db.execute(
            select(Farm)
            .where(
                Farm.owner_id == current_user.id,
                func.lower(Farm.name) == name.lower(),
            )
            .limit(1)
        )
        return match.scalar_one_or_none()

    async def _create_farm_from_answers(name: str):
        farm = Farm(
            owner_id=current_user.id,
            name=name or "My Aquaponic Farm",
            location=project_location,
            area_sqm=project_area,
            system_type=project_system,
            description="Auto-created from AI questionnaire session",
        )
        db.add(farm)
        await db.flush()
        return farm

    horizon_map = {"6 months": 6, "12 months": 12, "24 months": 24, "36 months": 36, "60 months": 60}
    horizon = horizon_map.get(answers.get("planning_horizon", "12 months"), 12)

    inputs = FinancialInputs(
        infrastructure_cost=_f("infrastructure_cost"),
        equipment_cost=_f("equipment_cost"),
        initial_stock_cost=_f("initial_stock_cost"),
        monthly_feed_cost=_f("monthly_feed_cost"),
        monthly_labor_cost=_f("monthly_labor_cost"),
        monthly_utilities_cost=_f("monthly_utilities_cost"),
        monthly_maintenance_cost=_f("monthly_maintenance_cost"),
        monthly_other_cost=_f("monthly_other_cost"),
        monthly_fish_revenue=_f("monthly_fish_revenue"),
        monthly_crop_revenue=_f("monthly_crop_revenue"),
        monthly_other_revenue=_f("monthly_other_revenue"),
        land_area_sqm=_f("farm_area_sqm"),
        horizon_months=horizon,
    )

    def _sheets_enabled() -> bool:
        return bool(os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip())

    def _best_effort_sync(write_mode: str) -> None:
        if not _sheets_enabled() or not sess.farm_id:
            return
        try:
            sheets = GoogleSheetsFinanceSync()
            status_payload = sheets.sync_status(str(sess.farm_id))
            current_version = int(status_payload.get("sheet_version") or 0)
            if write_mode == "missing_only" and current_version > 0:
                return
            plan_state = FinancialService(db).compute_plan_state(inputs)
            sheets.write_inputs_row(
                str(sess.farm_id),
                inputs,
                plan_state=plan_state,
                expected_state_version=current_version,
                force=False,
                session_id=session_id,
                audit_action="analysis_auto_seed",
                direction="push",
            )
        except Exception as exc:
            logger.warning("Google Sheets auto-sync skipped for session %s: %s", session_id, exc)

    if existing_plan:
        _best_effort_sync("missing_only")
        return {
            "session_id": session_id,
            "farm_id": existing_plan.farm_id,
            "farm_answers": answers,
            "financial_plan": {
                "id": existing_plan.id,
                "total_capex": existing_plan.total_capex,
                "total_opex_annual": existing_plan.total_opex_annual,
                "total_revenue_annual": existing_plan.total_revenue_annual,
                "roi_percent": existing_plan.roi_percent,
                "payback_period_months": existing_plan.payback_period_months,
                "break_even_month": existing_plan.break_even_month,
                "scenarios": existing_plan.scenarios,
                "ai_recommendations": existing_plan.ai_recommendations,
            },
        }

    current_farm = None
    if sess.farm_id:
        current_farm_result = await db.execute(
            select(Farm).where(Farm.id == sess.farm_id, Farm.owner_id == current_user.id)
        )
        current_farm = current_farm_result.scalar_one_or_none()

    if project_name:
        # If a different project name is provided, re-link to existing farm by name or create one.
        if not current_farm or current_farm.name.strip().lower() != project_name.lower():
            existing_named = await _find_existing_farm_by_name(project_name)
            if existing_named:
                current_farm = existing_named
            else:
                current_farm = await _create_farm_from_answers(project_name)
            sess.farm_id = current_farm.id
    elif not current_farm:
        # No name provided; ensure there is still a valid farm link for planning rows.
        current_farm = await _create_farm_from_answers(project_name)
        sess.farm_id = current_farm.id

    # Keep linked farm metadata current with latest questionnaire answers.
    if current_farm:
        if project_name:
            current_farm.name = project_name
        if project_location:
            current_farm.location = project_location
        if project_area is not None:
            current_farm.area_sqm = project_area
        if project_system:
            current_farm.system_type = project_system
        await db.flush()

    svc = FinancialService(db)
    plan = await svc.create_plan(
        farm_id=sess.farm_id,
        session_id=session_id,
        inputs=inputs,
    )
    _best_effort_sync("always")

    return {
        "session_id": session_id,
        "farm_id": sess.farm_id,
        "farm_answers": answers,
        "financial_plan": {
            "id": plan.id,
            "total_capex": plan.total_capex,
            "total_opex_annual": plan.total_opex_annual,
            "total_revenue_annual": plan.total_revenue_annual,
            "roi_percent": plan.roi_percent,
            "payback_period_months": plan.payback_period_months,
            "break_even_month": plan.break_even_month,
            "scenarios": plan.scenarios,
            "ai_recommendations": plan.ai_recommendations,
        },
    }
