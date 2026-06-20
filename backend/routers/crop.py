"""routers/crop.py — Crop feasibility and intelligence endpoints."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Farm
from routers.auth import get_current_user
from services.crop_intelligence_service import CropIntelligenceService
from services.weather_service import fetch_farm_weather

router = APIRouter()

_IMD_PATH = Path(__file__).parent.parent / "data" / "imd_climate_normals.json"


def _imd_data() -> dict:
    return json.loads(_IMD_PATH.read_text())


@router.get("/evaluate")
async def evaluate_crop(
    crop: str = Query(...),
    area: float = Query(..., gt=0),
    temperature: float | None = Query(None),
    ph: float | None = Query(None),
    system_type: str | None = Query(None),
):
    svc = CropIntelligenceService()
    return svc.evaluate_crop(crop, area, temperature, ph, system_type)


@router.get("/suggest")
async def suggest_crops(
    area: float = Query(..., gt=0),
    temperature: float | None = Query(None),
    ph: float | None = Query(None),
    system_type: str | None = Query(None),
):
    svc = CropIntelligenceService()
    return {"suggestions": svc.suggest_crops(area, temperature, ph, system_type)}


@router.get("/list")
async def list_crops():
    svc = CropIntelligenceService()
    return {
        "crops": [
            {
                "name": c["name"],
                "category": c["category"],
                "season": c.get("season", "unknown"),
                "difficulty": c["difficulty"],
                "growth_days": c["growth_days"],
                "cycles_per_year": c["cycles_per_year"],
                "yield_per_m2_kg": c["yield_per_m2_kg"],
            }
            for c in svc.crops
        ]
    }


@router.get("/weather/{farm_id}")
async def crop_weather(
    farm_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch current weather + IMD long-term averages for a farm's location."""
    result = await db.execute(
        select(Farm).where(Farm.id == farm_id, Farm.owner_id == current_user.id)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found.")
    if not farm.location:
        raise HTTPException(
            status_code=422,
            detail="Farm has no location set. Add a location to enable weather fetch."
        )

    weather = await fetch_farm_weather(farm.location)
    imd = _imd_data()
    imd_state = imd.get(weather.state, {}) if weather.state else {}

    return {
        "current": {
            "source": weather.source,
            "temperature_c": weather.temperature_c,
            "humidity_pct": weather.humidity_pct,
            "rainfall_mm_recent": weather.rainfall_mm_recent,
        },
        "long_term": {
            "source": "imd_static",
            "state": weather.state,
            "avg_temp_c": imd_state.get("avg_temp_c"),
            "avg_humidity_pct": imd_state.get("avg_humidity_pct"),
            "avg_rainfall_mm_annual": imd_state.get("avg_rainfall_mm_annual"),
            "kharif_start_month": imd_state.get("kharif_start_month"),
            "rabi_start_month": imd_state.get("rabi_start_month"),
        },
    }


class AnalyzeFarmRequest(BaseModel):
    farm_id: str
    crops: list[str] = []
    soil_type: Optional[str] = None
    soil_ph: Optional[float] = None
    irrigation_method: Optional[str] = None
    water_source: Optional[str] = None
    use_current_weather: bool = True
    # Allow manual overrides of auto-fetched values
    temperature_override: Optional[float] = None
    humidity_override: Optional[float] = None


@router.post("/analyze-farm")
async def analyze_farm(
    body: AnalyzeFarmRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run crop feasibility analysis for a farm."""
    result = await db.execute(
        select(Farm).where(Farm.id == body.farm_id, Farm.owner_id == current_user.id)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found.")

    area_m2 = float(farm.area_sqm or 0)
    if area_m2 <= 0:
        raise HTTPException(
            status_code=422,
            detail="Farm area is 0. Update the farm profile with a valid area."
        )

    # Fetch weather
    weather = await fetch_farm_weather(farm.location or "")

    temp = body.temperature_override if body.temperature_override is not None else weather.temperature_c
    humidity = body.humidity_override if body.humidity_override is not None else weather.humidity_pct
    rainfall_annual = weather.rainfall_mm_annual

    svc = CropIntelligenceService()

    # Determine crops to analyze
    crops_to_analyze = body.crops if body.crops else []
    suggest_mode = not crops_to_analyze

    if suggest_mode:
        suggestions = svc.suggest_crops(area_m2, temp, body.soil_ph, str(farm.system_type or ""))
        crops_to_analyze = [s["crop"] for s in suggestions[:5]]

    # Load market prices (fallback benchmark)
    from services.land_market_price_service import INDIA_FALLBACK_PRICES

    results: list[dict[str, Any]] = []
    for crop_name in crops_to_analyze:
        scored = svc.score_crop(
            crop_name, area_m2,
            temperature_c=temp,
            ph=body.soil_ph,
            humidity_pct=humidity,
            rainfall_mm_annual=rainfall_annual,
            soil_type=body.soil_type,
            system_type=str(farm.system_type or ""),
        )
        match_table = svc.build_match_table(
            crop_name,
            temperature_c=temp,
            ph=body.soil_ph,
            humidity_pct=humidity,
            rainfall_mm_annual=rainfall_annual,
            soil_type=body.soil_type,
            area_m2=area_m2,
        )

        crop_data = svc.get_crop(crop_name)
        yield_estimate: dict = {}
        profitability: dict | None = None
        season = "unknown"

        if crop_data:
            season = crop_data.get("season", "unknown")
            ypm2 = float(crop_data["yield_per_m2_kg"])
            cycles = int(crop_data["cycles_per_year"])
            avg_kg = round(ypm2 * area_m2 * cycles, 1)
            yield_estimate = {
                "best_kg": round(avg_kg * 1.2, 1),
                "average_kg": avg_kg,
                "worst_kg": round(avg_kg * 0.7, 1),
                "cycles_per_year": cycles,
                "growth_days": crop_data["growth_days"],
            }
            price = INDIA_FALLBACK_PRICES.get(crop_name.lower())
            if price:
                profitability = {
                    "market_price_per_kg": price,
                    "best_revenue_inr": round(yield_estimate["best_kg"] * price, 0),
                    "average_revenue_inr": round(avg_kg * price, 0),
                    "worst_revenue_inr": round(yield_estimate["worst_kg"] * price, 0),
                }

        # Alternatives for low-scoring crops
        alternatives: list[dict] = []
        suggested_regions: list[str] = []
        if scored["score"] < 50:
            suggested_regions = svc.suggest_regions(crop_name)
            alt_suggestions = svc.suggest_crops(area_m2, temp, body.soil_ph,
                                                str(farm.system_type or ""))
            alternatives = [
                {"crop": s["crop"], "score": svc.score_crop(
                    s["crop"], area_m2, temp, body.soil_ph, humidity, rainfall_annual,
                    body.soil_type)["score"],
                 "feasibility": s["feasibility"]}
                for s in alt_suggestions
                if s["crop"] != crop_name and s["feasibility"] in ("feasible", "Excellent", "Good")
            ][:3]

        results.append({
            "crop": crop_name,
            "score": scored["score"],
            "feasibility": scored["feasibility"],
            "season": season,
            "match_table": match_table,
            "yield_estimate": yield_estimate,
            "profitability": profitability,
            "alternatives": alternatives,
            "suggested_regions": suggested_regions,
        })

    results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "farm": {"name": farm.name, "area_m2": area_m2, "location": farm.location or ""},
        "environment": {
            "temperature_c": temp,
            "humidity_pct": humidity,
            "rainfall_mm_annual": rainfall_annual,
            "soil_type": body.soil_type,
            "soil_ph": body.soil_ph,
            "weather_source": weather.source,
        },
        "suggest_mode": suggest_mode,
        "results": results,
    }
