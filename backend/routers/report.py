"""routers/report.py — Real PDF report generation + completed-session history."""

from __future__ import annotations

import calendar
from datetime import datetime, timezone
from datetime import timedelta
from collections import defaultdict
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Farm, FinancialPlan, Session, WaterReading
from routers.auth import get_current_user
from services.financial_service import FinancialInputs, FinancialService
from services.land_financial_service import compute_land_financials

router = APIRouter()


def _float_or_zero(v: Any) -> float:
    try:
        if v in (None, ""):
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _map_horizon(answer: Any) -> int:
    horizon_map = {"6 months": 6, "12 months": 12, "24 months": 24, "36 months": 36, "60 months": 60}
    return horizon_map.get(str(answer or "").strip(), 12)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _month_key(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return f"{dt.year:04d}-{dt.month:02d}"


def _month_label(key: str) -> str:
    year = int(key[:4])
    month = int(key[5:7])
    return f"{calendar.month_abbr[month]} {str(year)[2:]}"


def _last_n_month_keys(n: int) -> list[str]:
    now = datetime.now(timezone.utc)
    year = now.year
    month = now.month
    keys: list[str] = []
    for _ in range(n):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    keys.reverse()
    return keys


def _build_inputs_from_answers(answers: dict[str, Any]) -> FinancialInputs:
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
        horizon_months=_map_horizon(answers.get("planning_horizon")),
    )


def _render_pdf(session_id: str, farm_name: str, answers: dict[str, Any], plan: FinancialPlan) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 50
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(50, y, "AquaponicAI Financial Report")
    y -= 20
    pdf.setFont("Helvetica", 10)
    pdf.drawString(50, y, f"Generated: {datetime.now(timezone.utc).isoformat()}")
    y -= 15
    pdf.drawString(50, y, f"Session ID: {session_id}")
    y -= 15
    pdf.drawString(50, y, f"Project: {farm_name}")

    y -= 30
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "Financial Summary")
    y -= 20
    pdf.setFont("Helvetica", 10)
    summary_rows = [
        ("Total CAPEX", f"INR {plan.total_capex:,.2f}" if plan.total_capex is not None else "-"),
        ("Annual OPEX", f"INR {plan.total_opex_annual:,.2f}" if plan.total_opex_annual is not None else "-"),
        ("Annual Revenue", f"INR {plan.total_revenue_annual:,.2f}" if plan.total_revenue_annual is not None else "-"),
        ("Annual Net Profit", f"INR {plan.net_profit_annual:,.2f}" if plan.net_profit_annual is not None else "-"),
        ("ROI", f"{plan.roi_percent:.2f}%" if plan.roi_percent is not None else "-"),
        ("Payback", f"{plan.payback_period_months} months" if plan.payback_period_months is not None else "-"),
        ("Break-even Month", str(plan.break_even_month) if plan.break_even_month is not None else "-"),
    ]
    for label, value in summary_rows:
        pdf.drawString(60, y, f"{label}: {value}")
        y -= 14

    y -= 14
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "Survey Inputs")
    y -= 18
    pdf.setFont("Helvetica", 9)
    for key, value in sorted((answers or {}).items()):
        text = f"{key}: {value}"
        if len(text) > 110:
            text = text[:107] + "..."
        pdf.drawString(60, y, text)
        y -= 12
        if y < 70:
            pdf.showPage()
            y = height - 50
            pdf.setFont("Helvetica", 9)

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


@router.get("/history")
async def report_history(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sessions_result = await db.execute(
        select(Session, Farm)
        .outerjoin(Farm, Farm.id == Session.farm_id)
        .where(Session.user_id == current_user.id, Session.status == "completed")
        .order_by(Session.completed_at.desc(), Session.updated_at.desc())
    )
    rows = sessions_result.all()

    return {
        "reports": [
            {
                "session_id": s.id,
                "farm_id": s.farm_id,
                "project_name": f.name if f else (s.context_data or {}).get("answers", {}).get("farm_name") or "Untitled Project",
                "completed_at": s.completed_at,
                "status": "ready",
            }
            for s, f in rows
        ]
    }


@router.get("/analytics")
async def report_analytics(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Return chart-ready analytics across AI and Land Voice survey sessions."""
    sessions_result = await db.execute(
        select(Session, Farm)
        .outerjoin(Farm, Farm.id == Session.farm_id)
        .where(Session.user_id == current_user.id)
    )
    session_rows = sessions_result.all()

    plans_result = await db.execute(
        select(FinancialPlan, Session, Farm)
        .join(Session, Session.id == FinancialPlan.session_id)
        .outerjoin(Farm, Farm.id == FinancialPlan.farm_id)
        .where(Session.user_id == current_user.id)
    )
    plan_rows = plans_result.all()

    farms_count_result = await db.execute(
        select(func.count(Farm.id)).where(Farm.owner_id == current_user.id)
    )
    farms_count = int(farms_count_result.scalar() or 0)

    now = datetime.now(timezone.utc)
    water_from = now - timedelta(days=30)
    water_result = await db.execute(
        select(WaterReading)
        .join(Farm, Farm.id == WaterReading.farm_id)
        .where(Farm.owner_id == current_user.id, WaterReading.timestamp >= water_from)
        .order_by(WaterReading.timestamp.asc())
    )
    water_rows = list(water_result.scalars().all())

    month_keys = _last_n_month_keys(12)
    month_set = set(month_keys)

    surveys_by_month: dict[str, dict[str, int]] = {
        key: {"ai": 0, "land": 0, "total": 0} for key in month_keys
    }
    completion_by_type = {
        "ai": {"completed": 0, "in_progress": 0, "abandoned": 0},
        "land": {"completed": 0, "in_progress": 0, "abandoned": 0},
    }

    land_month_sums: dict[str, dict[str, float]] = {
        key: {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "roi": 0.0, "count": 0.0} for key in month_keys
    }
    ai_month_sums: dict[str, dict[str, float]] = {
        key: {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "roi": 0.0, "count": 0.0} for key in month_keys
    }

    top_crop_map: dict[str, dict[str, float]] = defaultdict(lambda: {
        "revenue": 0.0,
        "profit": 0.0,
        "count": 0.0,
    })

    top_sessions: list[dict[str, Any]] = []
    land_completed_count = 0
    ai_completed_count = 0
    land_profit_total = 0.0
    land_roi_total = 0.0
    ai_profit_total = 0.0
    ai_roi_total = 0.0

    # Session-level classification and land financial analytics.
    for sess, farm in session_rows:
        context = sess.context_data or {}
        is_land = context.get("module") == "land_farm_voice"
        survey_type = "land" if is_land else "ai"

        if sess.status in completion_by_type[survey_type]:
            completion_by_type[survey_type][sess.status] += 1

        if sess.status != "completed":
            continue

        month_key = _month_key(sess.completed_at or sess.updated_at or sess.created_at)
        if month_key and month_key in month_set:
            surveys_by_month[month_key][survey_type] += 1
            surveys_by_month[month_key]["total"] += 1

        if is_land:
            calc = compute_land_financials(context)
            summary = calc.get("summary") or {}
            revenue = _safe_float(summary.get("total_revenue"))
            cost = _safe_float(summary.get("total_cost"))
            profit = _safe_float(summary.get("profit"))
            roi_value = summary.get("roi_percent")
            roi = _safe_float(roi_value) if roi_value is not None else 0.0

            if month_key and month_key in month_set:
                land_month_sums[month_key]["revenue"] += revenue
                land_month_sums[month_key]["cost"] += cost
                land_month_sums[month_key]["profit"] += profit
                land_month_sums[month_key]["roi"] += roi
                land_month_sums[month_key]["count"] += 1

            land_completed_count += 1
            land_profit_total += profit
            land_roi_total += roi

            project_name = (farm.name if farm else None) or str((context.get("answers") or {}).get("farm_name") or "Untitled Project")
            top_sessions.append({
                "session_id": sess.id,
                "survey_type": "land",
                "project_name": project_name,
                "completed_at": sess.completed_at,
                "revenue": round(revenue, 2),
                "cost": round(cost, 2),
                "profit": round(profit, 2),
                "roi_percent": round(roi, 2),
            })

            for row in (calc.get("crop_performance") or []):
                crop = str(row.get("crop") or "unknown").strip().lower()
                if not crop:
                    continue
                top_crop_map[crop]["revenue"] += _safe_float(row.get("revenue_annual"))
                top_crop_map[crop]["profit"] += _safe_float(row.get("profit_annual"))
                top_crop_map[crop]["count"] += 1

    # AI financial plan analytics.
    roi_buckets = {
        "<0%": 0,
        "0-25%": 0,
        "25-50%": 0,
        "50-100%": 0,
        ">100%": 0,
    }
    for plan, sess, farm in plan_rows:
        context = sess.context_data or {}
        if context.get("module") == "land_farm_voice":
            continue

        month_key = _month_key(sess.completed_at or plan.created_at)
        revenue = _safe_float(plan.total_revenue_annual)
        cost = _safe_float(plan.total_opex_annual)
        profit = _safe_float(plan.net_profit_annual)
        roi_value = plan.roi_percent
        roi = _safe_float(roi_value) if roi_value is not None else 0.0

        if month_key and month_key in month_set:
            ai_month_sums[month_key]["revenue"] += revenue
            ai_month_sums[month_key]["cost"] += cost
            ai_month_sums[month_key]["profit"] += profit
            ai_month_sums[month_key]["roi"] += roi
            ai_month_sums[month_key]["count"] += 1

        ai_completed_count += 1
        ai_profit_total += profit
        ai_roi_total += roi

        if roi_value is not None:
            if roi < 0:
                roi_buckets["<0%"] += 1
            elif roi < 25:
                roi_buckets["0-25%"] += 1
            elif roi < 50:
                roi_buckets["25-50%"] += 1
            elif roi <= 100:
                roi_buckets["50-100%"] += 1
            else:
                roi_buckets[">100%"] += 1

        project_name = (farm.name if farm else None) or str((context.get("answers") or {}).get("farm_name") or "Untitled Project")
        top_sessions.append({
            "session_id": sess.id,
            "survey_type": "ai",
            "project_name": project_name,
            "completed_at": sess.completed_at,
            "revenue": round(revenue, 2),
            "cost": round(cost, 2),
            "profit": round(profit, 2),
            "roi_percent": round(roi, 2),
        })

    # Water trend aggregation by day.
    day_map: dict[str, dict[str, float]] = defaultdict(lambda: {
        "ph_sum": 0.0,
        "ph_count": 0.0,
        "temp_sum": 0.0,
        "temp_count": 0.0,
        "do_sum": 0.0,
        "do_count": 0.0,
    })
    for row in water_rows:
        if not row.timestamp:
            continue
        day_key = row.timestamp.date().isoformat()
        if row.ph is not None:
            day_map[day_key]["ph_sum"] += float(row.ph)
            day_map[day_key]["ph_count"] += 1
        if row.temperature_c is not None:
            day_map[day_key]["temp_sum"] += float(row.temperature_c)
            day_map[day_key]["temp_count"] += 1
        if row.dissolved_oxygen_mg_l is not None:
            day_map[day_key]["do_sum"] += float(row.dissolved_oxygen_mg_l)
            day_map[day_key]["do_count"] += 1

    water_quality_trend = []
    for day_key in sorted(day_map.keys()):
        d = day_map[day_key]
        water_quality_trend.append({
            "day": day_key,
            "avg_ph": round(d["ph_sum"] / d["ph_count"], 3) if d["ph_count"] > 0 else None,
            "avg_temp_c": round(d["temp_sum"] / d["temp_count"], 3) if d["temp_count"] > 0 else None,
            "avg_do": round(d["do_sum"] / d["do_count"], 3) if d["do_count"] > 0 else None,
        })

    surveys_by_month_rows = [
        {
            "month": key,
            "label": _month_label(key),
            "ai": surveys_by_month[key]["ai"],
            "land": surveys_by_month[key]["land"],
            "total": surveys_by_month[key]["total"],
        }
        for key in month_keys
    ]

    ai_financial_trend = []
    land_financial_trend = []
    for key in month_keys:
        ai_sums = ai_month_sums[key]
        ai_count = int(ai_sums["count"])
        land_sums = land_month_sums[key]
        land_count = int(land_sums["count"])

        ai_financial_trend.append({
            "month": key,
            "label": _month_label(key),
            "count": ai_count,
            "avg_revenue": round(ai_sums["revenue"] / ai_count, 2) if ai_count else 0.0,
            "avg_cost": round(ai_sums["cost"] / ai_count, 2) if ai_count else 0.0,
            "avg_profit": round(ai_sums["profit"] / ai_count, 2) if ai_count else 0.0,
            "avg_roi": round(ai_sums["roi"] / ai_count, 2) if ai_count else 0.0,
        })
        land_financial_trend.append({
            "month": key,
            "label": _month_label(key),
            "count": land_count,
            "avg_revenue": round(land_sums["revenue"] / land_count, 2) if land_count else 0.0,
            "avg_cost": round(land_sums["cost"] / land_count, 2) if land_count else 0.0,
            "avg_profit": round(land_sums["profit"] / land_count, 2) if land_count else 0.0,
            "avg_roi": round(land_sums["roi"] / land_count, 2) if land_count else 0.0,
        })

    top_land_crops = [
        {
            "crop": crop,
            "total_revenue": round(vals["revenue"], 2),
            "total_profit": round(vals["profit"], 2),
            "sessions": int(vals["count"]),
            "avg_profit": round(vals["profit"] / vals["count"], 2) if vals["count"] else 0.0,
        }
        for crop, vals in top_crop_map.items()
    ]
    top_land_crops.sort(key=lambda r: r["total_revenue"], reverse=True)

    top_sessions.sort(key=lambda s: s.get("profit", 0), reverse=True)

    total_sessions = len(session_rows)
    completed_sessions = sum(1 for sess, _ in session_rows if sess.status == "completed")
    ai_sessions = sum(1 for sess, _ in session_rows if (sess.context_data or {}).get("module") != "land_farm_voice")
    land_sessions = total_sessions - ai_sessions

    overview = {
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "completion_rate": round((completed_sessions / total_sessions) * 100.0, 2) if total_sessions else 0.0,
        "ai_sessions": ai_sessions,
        "land_sessions": land_sessions,
        "farms_count": farms_count,
        "ai_financial_plans": len(plan_rows),
        "avg_ai_profit": round(ai_profit_total / ai_completed_count, 2) if ai_completed_count else 0.0,
        "avg_land_profit": round(land_profit_total / land_completed_count, 2) if land_completed_count else 0.0,
        "avg_ai_roi": round(ai_roi_total / ai_completed_count, 2) if ai_completed_count else 0.0,
        "avg_land_roi": round(land_roi_total / land_completed_count, 2) if land_completed_count else 0.0,
    }

    return {
        "overview": overview,
        "surveys_by_month": surveys_by_month_rows,
        "completion_by_type": [
            {"type": "AI Survey", **completion_by_type["ai"]},
            {"type": "Land Voice", **completion_by_type["land"]},
        ],
        "ai_financial_trend": ai_financial_trend,
        "land_financial_trend": land_financial_trend,
        "roi_distribution": [{"bucket": k, "count": v} for k, v in roi_buckets.items()],
        "top_land_crops": top_land_crops[:8],
        "water_quality_trend": water_quality_trend,
        "top_sessions": top_sessions[:10],
    }


@router.get("/{session_id}")
async def get_report(
    session_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and return a downloadable PDF report for a completed session."""
    session_result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == current_user.id)
    )
    sess = session_result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if sess.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only completed sessions can be exported.")

    answers = sess.context_data.get("answers", {}) if sess.context_data else {}

    farm = None
    if sess.farm_id:
        farm_result = await db.execute(select(Farm).where(Farm.id == sess.farm_id, Farm.owner_id == current_user.id))
        farm = farm_result.scalar_one_or_none()

    if not farm:
        project_name = str(answers.get("farm_name") or "My Aquaponic Farm").strip() or "My Aquaponic Farm"
        farm_match_result = await db.execute(
            select(Farm)
            .where(Farm.owner_id == current_user.id, func.lower(Farm.name) == project_name.lower())
            .limit(1)
        )
        farm = farm_match_result.scalar_one_or_none()
        if not farm:
            farm = Farm(
                owner_id=current_user.id,
                name=project_name,
                location=str(answers.get("farm_location") or ""),
                system_type=str(answers.get("system_type") or "aquaponics"),
                description="Auto-created from completed session",
            )
            db.add(farm)
            await db.flush()
        sess.farm_id = farm.id

    plan_result = await db.execute(
        select(FinancialPlan).where(FinancialPlan.session_id == sess.id)
    )
    plan = plan_result.scalar_one_or_none()

    if not plan:
        svc = FinancialService(db)
        plan = await svc.create_plan(
            farm_id=farm.id,
            session_id=sess.id,
            inputs=_build_inputs_from_answers(answers),
        )

    pdf_bytes = _render_pdf(sess.id, farm.name, answers, plan)
    filename = f"aquaponic-report-{sess.id[:8]}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
