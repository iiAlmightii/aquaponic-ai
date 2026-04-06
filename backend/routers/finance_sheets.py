from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Session, FinancialPlan
from routers.auth import get_current_user
from services.financial_service import FinancialService, FinancialInputs
from services.google_sheets_financial_sync import GoogleSheetsFinanceSync, _is_sheets_credentials_configured


router = APIRouter(tags=["Google Sheets Sync"])


class PushFinancialRequest(BaseModel):
    session_id: str
    expected_sheet_version: Optional[int] = None
    force: bool = False


class PullIfChangedRequest(BaseModel):
    session_id: str
    since_sheet_version: int


class SessionRef(BaseModel):
    session_id: str
    farm_id: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _map_horizon(answer: Any) -> int:
    horizon_map = {"6 months": 6, "12 months": 12, "24 months": 24, "36 months": 36, "60 months": 60}
    return horizon_map.get(str(answer or "").strip(), 12)


def _float_or_zero(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


async def _get_user_session(session_id: str, current_user, db: AsyncSession) -> Session:
    result = await db.execute(select(Session).where(Session.id == session_id, Session.user_id == current_user.id))
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found.")
    return sess


def _build_financial_inputs_from_session_answers(answers: dict[str, Any]) -> FinancialInputs:
    horizon_months = _map_horizon(answers.get("planning_horizon"))
    return FinancialInputs(
        infrastructure_cost=_float_or_zero(answers.get("infrastructure_cost")),
        equipment_cost=_float_or_zero(answers.get("equipment_cost")),
        initial_stock_cost=_float_or_zero(answers.get("initial_stock_cost")),
        monthly_feed_cost=_float_or_zero(answers.get("monthly_feed_cost")),
        monthly_labor_cost=_float_or_zero(answers.get("monthly_labor_cost")),
        monthly_utilities_cost=_float_or_zero(answers.get("monthly_utilities_cost")),
        monthly_maintenance_cost=_float_or_zero(answers.get("monthly_maintenance_cost")),
        monthly_other_cost=_float_or_zero(answers.get("monthly_other_cost")),
        monthly_fish_revenue=_float_or_zero(answers.get("monthly_fish_revenue")),
        monthly_crop_revenue=_float_or_zero(answers.get("monthly_crop_revenue")),
        monthly_other_revenue=_float_or_zero(answers.get("monthly_other_revenue")),
        land_area_sqm=_float_or_zero(answers.get("farm_area_sqm")),
        horizon_months=horizon_months,
    )


@router.get("/sync-status")
async def sync_status(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_user_session(session_id, current_user, db)
    if not sess.farm_id:
        return {"enabled": False, "farm_id": None, "sheet_version": 0, "updated_at": "", "message": "Session not linked to a farm."}

    # Check if Google Sheets credentials are configured
    if not _is_sheets_credentials_configured():
        return {
            "enabled": False,
            "farm_id": str(sess.farm_id),
            "sheet_version": 0,
            "updated_at": "",
            "message": "Google Sheets sync not configured. See GOOGLE_SHEETS_SETUP.md for setup instructions.",
            "setup_url": "/docs/GOOGLE_SHEETS_SETUP.md",
        }

    try:
        sheets = GoogleSheetsFinanceSync()
        return {"enabled": True, **sheets.sync_status(str(sess.farm_id))}
    except ValueError as e:
        return {
            "enabled": False,
            "farm_id": str(sess.farm_id),
            "sheet_version": 0,
            "updated_at": "",
            "message": f"Google Sheets sync error: {str(e)}",
            "error_details": str(e),
        }


@router.post("/push", status_code=status.HTTP_200_OK)
async def push_financial_to_sheet(
    body: PushFinancialRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_user_session(body.session_id, current_user, db)
    if not sess.farm_id:
        raise HTTPException(status_code=400, detail="Session is not linked to a farm yet.")
    
    # Check if Google Sheets credentials are configured
    if not _is_sheets_credentials_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Google Sheets sync not configured.",
                "setup_instructions": "See GOOGLE_SHEETS_SETUP.md for setup instructions.",
            },
        )
    
    farm_id = str(sess.farm_id)

    answers = sess.context_data.get("answers", {}) if sess.context_data else {}
    fin = _build_financial_inputs_from_session_answers(answers)

    try:
        sheets = GoogleSheetsFinanceSync()
        # Preserve user's discount-rate edits unless our app explicitly provides a value.
        fin.discount_rate_annual = sheets.read_assumptions(farm_id, default_discount_rate_annual=fin.discount_rate_annual)

        plan_state = FinancialService(db).compute_plan_state(fin)
        new_version, updated_at_iso = sheets.write_inputs_row(
            farm_id,
            fin,
            plan_state=plan_state,
            expected_state_version=body.expected_sheet_version,
            force=body.force,
            session_id=body.session_id,
            audit_action="app_push_financial_inputs",
            direction="push",
        )
    except PermissionError:
        status_payload = sheets.sync_status(farm_id)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Sheet was updated since last sync; push skipped to avoid overwriting.",
                "current_sheet_version": status_payload.get("sheet_version"),
                "updated_at": status_payload.get("updated_at"),
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Google Sheets sync error.",
                "error": str(e),
                "setup_instructions": "See GOOGLE_SHEETS_SETUP.md for configuration help.",
            },
        )

    return {"farm_id": farm_id, "sheet_version": new_version, "updated_at": updated_at_iso}


@router.post("/pull-if-changed", status_code=status.HTTP_200_OK)
async def pull_financial_if_changed(
    body: PullIfChangedRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_user_session(body.session_id, current_user, db)
    if not sess.farm_id:
        raise HTTPException(status_code=400, detail="Session is not linked to a farm yet.")
    
    # Check if Google Sheets credentials are configured
    if not _is_sheets_credentials_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Google Sheets sync not configured.",
                "setup_instructions": "See GOOGLE_SHEETS_SETUP.md for setup instructions.",
            },
        )
    
    farm_id = str(sess.farm_id)

    try:
        sheets = GoogleSheetsFinanceSync()
        status_payload = sheets.sync_status(farm_id)
        current_version = int(status_payload.get("sheet_version") or 0)
        if current_version == int(body.since_sheet_version):
            return {"changed": False, "farm_id": farm_id, "sheet_version": current_version, "updated_at": status_payload.get("updated_at")}

        fin = sheets.read_full_financial_inputs(farm_id)
        svc = FinancialService(db)
        plan_state = svc.compute_plan_state(fin)
        return {
            "changed": True,
            "farm_id": farm_id,
            "sheet_version": current_version,
            "updated_at": status_payload.get("updated_at"),
            "financial_plan": plan_state,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Google Sheets sync error.",
                "error": str(e),
                "setup_instructions": "See GOOGLE_SHEETS_SETUP.md for configuration help.",
            },
        )


@router.post("/pull", status_code=status.HTTP_200_OK)
async def pull_financial_from_sheet(
    body: PushFinancialRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Reuse PushFinancialRequest to keep stable request types in frontend.
    sess = await _get_user_session(body.session_id, current_user, db)
    if not sess.farm_id:
        raise HTTPException(status_code=400, detail="Session is not linked to a farm yet.")
    
    # Check if Google Sheets credentials are configured
    if not _is_sheets_credentials_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Google Sheets sync not configured.",
                "setup_instructions": "See GOOGLE_SHEETS_SETUP.md for setup instructions.",
            },
        )
    
    farm_id = str(sess.farm_id)

    try:
        sheets = GoogleSheetsFinanceSync()
        fin = sheets.read_full_financial_inputs(farm_id)
        svc = FinancialService(db)
        plan_state = svc.compute_plan_state(fin)
        status_payload = sheets.sync_status(farm_id)
        return {
            "changed": True,
            "farm_id": farm_id,
            "sheet_version": status_payload.get("sheet_version"),
            "updated_at": status_payload.get("updated_at"),
            "financial_plan": plan_state,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Google Sheets sync error.",
                "error": str(e),
                "setup_instructions": "See GOOGLE_SHEETS_SETUP.md for configuration help.",
            },
        )

