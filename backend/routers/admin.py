"""routers/admin.py — Admin-only endpoints for platform oversight."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Farm, FinancialPlan, Session, User
from routers.auth import get_current_user

router = APIRouter(tags=["Admin"])


# ── Admin guard ───────────────────────────────────────────────────────────────

async def admin_required(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserRoleUpdate(BaseModel):
    role: Optional[str] = None
    full_name: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def admin_overview(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # Total users
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # Users by role
    role_rows = (await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )).fetchall()
    users_by_role = {str(r[0]): int(r[1]) for r in role_rows}

    # Total farms
    total_farms = (await db.execute(select(func.count(Farm.id)))).scalar() or 0

    # Total sessions
    total_surveys = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    completed_surveys = (await db.execute(
        select(func.count(Session.id)).where(Session.status == "completed")
    )).scalar() or 0

    # Platform revenue (sum of annual revenue across all financial plans)
    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(FinancialPlan.total_revenue_annual), 0))
    )).scalar() or 0

    # Surveys this month
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    surveys_this_month = (await db.execute(
        select(func.count(Session.id)).where(
            Session.status == "completed",
            Session.completed_at >= month_start,
        )
    )).scalar() or 0

    # Surveys by month (last 6 months) — use raw SQL for date_trunc portability
    monthly_rows = (await db.execute(text("""
        SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month,
               COUNT(*) AS cnt
        FROM sessions
        WHERE status = 'completed'
          AND completed_at >= NOW() - INTERVAL '6 months'
        GROUP BY 1
        ORDER BY 1
    """))).fetchall()
    surveys_by_month = [{"month": r[0], "count": int(r[1])} for r in monthly_rows]

    # Recent completed sessions (last 10)
    recent_rows = (await db.execute(
        select(Session, User)
        .join(User, User.id == Session.user_id)
        .where(Session.status == "completed")
        .order_by(Session.completed_at.desc())
        .limit(10)
    )).all()

    recent_sessions = []
    for sess, owner in recent_rows:
        ctx = sess.context_data or {}
        answers = ctx.get("answers", {})
        is_land = ctx.get("module") == "land_farm_voice"
        recent_sessions.append({
            "session_id": str(sess.id),
            "project_name": answers.get("farm_name") or "Untitled",
            "owner_email": owner.email,
            "survey_type": "land" if is_land else "aquaponic",
            "completed_at": sess.completed_at,
        })

    return {
        "total_users": total_users,
        "total_farms": total_farms,
        "total_surveys": total_surveys,
        "completed_surveys": completed_surveys,
        "total_revenue_inr": float(total_revenue),
        "users_by_role": users_by_role,
        "surveys_this_month": surveys_this_month,
        "surveys_by_month": surveys_by_month,
        "recent_sessions": recent_sessions,
    }


@router.get("/users")
async def admin_list_users(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()

    result = []
    for u in users:
        farms_count = (await db.execute(
            select(func.count(Farm.id)).where(Farm.owner_id == u.id)
        )).scalar() or 0
        surveys_count = (await db.execute(
            select(func.count(Session.id)).where(Session.user_id == u.id)
        )).scalar() or 0
        result.append({
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "farms_count": farms_count,
            "surveys_count": surveys_count,
        })
    return result


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    body: UserRoleUpdate,
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if user_id == str(current_user.id) and body.role and body.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if body.role:
        user.role = body.role
    if body.full_name:
        user.full_name = body.full_name
    await db.flush()
    return {"id": str(user.id), "email": user.email, "role": user.role, "full_name": user.full_name}


@router.delete("/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: str,
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    if user_id == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    await db.delete(user)
    await db.flush()


@router.get("/data")
async def admin_data(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    farm_rows = (await db.execute(
        select(Farm, User).join(User, User.id == Farm.owner_id).order_by(Farm.created_at.desc())
    )).all()
    farms = [{
        "id": str(f.id),
        "name": f.name,
        "owner_email": u.email,
        "system_type": f.system_type,
        "area_sqm": f.area_sqm,
        "location": f.location,
        "created_at": f.created_at,
    } for f, u in farm_rows]

    session_rows = (await db.execute(
        select(Session, User).join(User, User.id == Session.user_id).order_by(Session.created_at.desc()).limit(200)
    )).all()
    sessions = []
    for s, u in session_rows:
        ctx = s.context_data or {}
        answers = ctx.get("answers", {})
        is_land = ctx.get("module") == "land_farm_voice"
        sessions.append({
            "id": str(s.id),
            "project_name": answers.get("farm_name") or "Untitled",
            "owner_email": u.email,
            "survey_type": "land" if is_land else "aquaponic",
            "status": s.status,
            "completed_at": s.completed_at,
            "created_at": s.created_at,
        })

    return {"farms": farms, "sessions": sessions}


@router.get("/schema")
async def admin_schema(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    APP_TABLES = [
        "users", "farms", "sessions", "session_answers",
        "financial_plans", "reports", "stt_corrections",
    ]
    rows = (await db.execute(text("""
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(:tables)
        ORDER BY table_name, ordinal_position
    """), {"tables": APP_TABLES})).fetchall()

    by_table: dict[str, list] = defaultdict(list)
    for table, col, dtype, nullable, default in rows:
        by_table[table].append({
            "name": col,
            "type": dtype,
            "nullable": nullable == "YES",
            "default": default,
        })

    return [
        {"table_name": t, "columns": by_table[t]}
        for t in APP_TABLES if t in by_table
    ]
