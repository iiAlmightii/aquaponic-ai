"""routers/farm.py — Farm CRUD + operational records view."""

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Farm, Session, WaterReading, FinancialPlan
from routers.auth import get_current_user
from services.land_financial_service import compute_land_financials

router = APIRouter()


class CreateFarmRequest(BaseModel):
    name: str
    location: Optional[str] = ""
    area_sqm: Optional[float] = None
    system_type: str = "aquaponics"
    description: Optional[str] = ""


class WaterReadingCreateRequest(BaseModel):
    ph: Optional[float] = None
    dissolved_oxygen_mg_l: Optional[float] = None
    temperature_c: Optional[float] = None
    ammonia_mg_l: Optional[float] = None
    nitrite_mg_l: Optional[float] = None
    nitrate_mg_l: Optional[float] = None
    turbidity_ntu: Optional[float] = None
    tds_ppm: Optional[float] = None
    device_id: Optional[str] = None


async def _get_user_farm_or_404(farm_id: str, user_id: str, db: AsyncSession) -> Farm:
    result = await db.execute(
        select(Farm).where(Farm.id == farm_id, Farm.owner_id == user_id)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    return farm


@router.get("/")
async def list_farms(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Farm)
        .where(Farm.owner_id == current_user.id)
        .order_by(Farm.updated_at.desc())
    )
    farms = result.scalars().all()
    return {
        "farms": [
            {
                "id": f.id,
                "name": f.name,
                "location": f.location,
                "area_sqm": f.area_sqm,
                "system_type": f.system_type,
                "description": f.description,
                "created_at": f.created_at,
                "updated_at": f.updated_at,
            }
            for f in farms
        ]
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_farm(
    body: CreateFarmRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Farm name is required.")

    farm = Farm(
        owner_id=current_user.id,
        name=name,
        location=(body.location or "").strip(),
        area_sqm=body.area_sqm,
        system_type=(body.system_type or "aquaponics").strip() or "aquaponics",
        description=(body.description or "").strip(),
    )
    db.add(farm)
    await db.flush()
    return {
        "id": farm.id,
        "name": farm.name,
        "location": farm.location,
        "area_sqm": farm.area_sqm,
        "system_type": farm.system_type,
        "description": farm.description,
        "created_at": farm.created_at,
        "updated_at": farm.updated_at,
    }


@router.get("/{farm_id}/records")
async def farm_records(
    farm_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    latest_session_result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id, Session.farm_id == farm.id, Session.status == "completed")
        .order_by(Session.completed_at.desc(), Session.updated_at.desc())
        .limit(1)
    )
    latest_session = latest_session_result.scalar_one_or_none()
    answers = latest_session.context_data.get("answers", {}) if latest_session and latest_session.context_data else {}

    fish_species = answers.get("fish_species") or []
    if isinstance(fish_species, str):
        fish_species = [fish_species]

    fish_count = int(float(answers.get("fish_count") or 0)) if answers.get("fish_count") not in (None, "") else 0
    tank_volume = float(answers.get("tank_volume") or 0)
    feed_per_day = float(answers.get("feed_kg_per_day") or 0)
    harvest_cycle_weeks = float(answers.get("harvest_cycle_weeks") or 0)

    fish_rows = []
    species_count = len(fish_species) if fish_species else 1
    if fish_count > 0:
        base_qty = fish_count // species_count
        remainder = fish_count % species_count
        species_list = fish_species if fish_species else ["Unknown"]
        for idx, species in enumerate(species_list):
            qty = base_qty + (1 if idx < remainder else 0)
            if qty <= 0:
                continue
            start_date = latest_session.created_at.date().isoformat() if latest_session and latest_session.created_at else None
            harvest_date = None
            if latest_session and latest_session.created_at and harvest_cycle_weeks > 0:
                harvest_date = (latest_session.created_at + timedelta(weeks=harvest_cycle_weeks)).date().isoformat()
            fish_rows.append(
                {
                    "id": f"survey-{idx}",
                    "species": species,
                    "quantity": qty,
                    "tank_liters": tank_volume,
                    "feed_kg_per_day": feed_per_day,
                    "start_date": start_date,
                    "expected_harvest_date": harvest_date,
                    "status": "active",
                    "source": "survey",
                }
            )

    crop_types = answers.get("crop_types") or []
    if isinstance(crop_types, str):
        crop_types = [crop_types]
    crop_area = float(answers.get("crop_area_sqm") or 0)
    crop_yield = float(answers.get("expected_yield_kg_monthly") or 0)

    crop_rows = []
    if crop_types:
        area_each = crop_area / len(crop_types) if crop_area > 0 else 0
        yield_each = crop_yield / len(crop_types) if crop_yield > 0 else 0
        for idx, crop_name in enumerate(crop_types):
            crop_rows.append(
                {
                    "id": f"survey-crop-{idx}",
                    "crop_name": crop_name,
                    "growing_area_sqm": round(area_each, 2) if area_each else None,
                    "expected_yield_kg": round(yield_each, 2) if yield_each else None,
                    "status": "growing",
                    "source": "survey",
                }
            )

    readings_result = await db.execute(
        select(WaterReading)
        .where(WaterReading.farm_id == farm.id)
        .order_by(WaterReading.timestamp.desc())
        .limit(100)
    )
    readings = readings_result.scalars().all()

    return {
        "farm": {
            "id": farm.id,
            "name": farm.name,
            "location": farm.location,
            "system_type": farm.system_type,
        },
        "fish_batches": fish_rows,
        "crop_records": crop_rows,
        "water_readings": [
            {
                "id": r.id,
                "timestamp": r.timestamp,
                "ph": r.ph,
                "dissolved_oxygen_mg_l": r.dissolved_oxygen_mg_l,
                "temperature_c": r.temperature_c,
                "ammonia_mg_l": r.ammonia_mg_l,
                "nitrite_mg_l": r.nitrite_mg_l,
                "nitrate_mg_l": r.nitrate_mg_l,
                "turbidity_ntu": r.turbidity_ntu,
                "tds_ppm": r.tds_ppm,
                "source": r.source,
            }
            for r in readings
        ],
    }


@router.post("/{farm_id}/water-readings", status_code=status.HTTP_201_CREATED)
async def create_water_reading(
    farm_id: str,
    body: WaterReadingCreateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    reading = WaterReading(
        farm_id=farm.id,
        device_id=body.device_id,
        ph=body.ph,
        dissolved_oxygen_mg_l=body.dissolved_oxygen_mg_l,
        temperature_c=body.temperature_c,
        ammonia_mg_l=body.ammonia_mg_l,
        nitrite_mg_l=body.nitrite_mg_l,
        nitrate_mg_l=body.nitrate_mg_l,
        turbidity_ntu=body.turbidity_ntu,
        tds_ppm=body.tds_ppm,
        source="manual",
    )
    db.add(reading)
    await db.flush()

    return {
        "id": reading.id,
        "timestamp": reading.timestamp,
        "ph": reading.ph,
        "dissolved_oxygen_mg_l": reading.dissolved_oxygen_mg_l,
        "temperature_c": reading.temperature_c,
        "ammonia_mg_l": reading.ammonia_mg_l,
        "nitrite_mg_l": reading.nitrite_mg_l,
        "nitrate_mg_l": reading.nitrate_mg_l,
        "turbidity_ntu": reading.turbidity_ntu,
        "tds_ppm": reading.tds_ppm,
        "source": reading.source,
    }


@router.get("/{farm_id}/sessions")
async def farm_sessions(
    farm_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all completed sessions for a farm, newest first (timeline)."""
    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    sessions_result = await db.execute(
        select(Session)
        .where(Session.farm_id == farm.id, Session.status == "completed")
        .order_by(Session.completed_at.desc())
    )
    sessions = sessions_result.scalars().all()

    rows = []
    for sess in sessions:
        context = sess.context_data or {}
        is_land = context.get("module") == "land_farm_voice"
        source = context.get("source", "survey")

        revenue, cost, profit, roi = 0.0, 0.0, 0.0, None
        if is_land:
            calc = compute_land_financials(context)
            summary = calc.get("summary") or {}
            revenue = float(summary.get("total_revenue") or 0)
            cost = float(summary.get("total_cost") or 0)
            profit = float(summary.get("profit") or 0)
            roi_val = summary.get("roi_percent")
            roi = float(roi_val) if roi_val is not None else None
        else:
            plan_result = await db.execute(
                select(FinancialPlan).where(FinancialPlan.session_id == sess.id)
            )
            plan = plan_result.scalar_one_or_none()
            if plan:
                revenue = float(plan.total_revenue_annual or 0)
                cost = float(plan.total_opex_annual or 0)
                profit = float(plan.net_profit_annual or 0)
                roi = float(plan.roi_percent) if plan.roi_percent is not None else None

        rows.append({
            "session_id": str(sess.id),
            "completed_at": sess.completed_at,
            "survey_type": "land" if is_land else "ai",
            "source": source,
            "roi_percent": round(roi, 2) if roi is not None else None,
            "revenue": round(revenue, 2),
            "cost": round(cost, 2),
            "profit": round(profit, 2),
        })

    return rows


@router.get("/{farm_id}/latest-session")
async def farm_latest_session(
    farm_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent completed session for a farm."""
    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    result = await db.execute(
        select(Session)
        .where(Session.farm_id == farm.id, Session.status == "completed")
        .order_by(Session.completed_at.desc())
        .limit(1)
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="No completed sessions for this farm.")

    context = sess.context_data or {}
    is_land = context.get("module") == "land_farm_voice"
    return {
        "session_id": str(sess.id),
        "survey_type": "land" if is_land else "ai",
        "completed_at": sess.completed_at,
    }
