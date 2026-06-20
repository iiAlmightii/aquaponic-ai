"""Weather data for crop feasibility analysis.

Priority:
  1. OpenWeatherMap API (current conditions) when WEATHER_API_KEY is set
  2. IMD static climate normals (fallback)

Annual rainfall always comes from IMD (OpenWeatherMap only provides current/recent).
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_IMD_PATH = Path(__file__).parent.parent / "data" / "imd_climate_normals.json"
_IMD_DATA: dict | None = None


def _load_imd() -> dict:
    global _IMD_DATA
    if _IMD_DATA is None:
        _IMD_DATA = json.loads(_IMD_PATH.read_text())
    return _IMD_DATA


# City → State mappings for state extraction
_CITY_TO_STATE: dict[str, str] = {
    "bengaluru": "Karnataka", "bangalore": "Karnataka",
    "mysuru": "Karnataka", "mysore": "Karnataka",
    "mumbai": "Maharashtra", "pune": "Maharashtra", "nagpur": "Maharashtra",
    "hyderabad": "Telangana", "secunderabad": "Telangana",
    "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "madurai": "Tamil Nadu",
    "kolkata": "West Bengal", "howrah": "West Bengal",
    "delhi": "Delhi", "new delhi": "Delhi",
    "ahmedabad": "Gujarat", "surat": "Gujarat", "vadodara": "Gujarat",
    "jaipur": "Rajasthan", "jodhpur": "Rajasthan", "udaipur": "Rajasthan",
    "lucknow": "Uttar Pradesh", "kanpur": "Uttar Pradesh", "varanasi": "Uttar Pradesh",
    "patna": "Bihar", "bhubaneswar": "Odisha", "cuttack": "Odisha",
    "ranchi": "Jharkhand", "raipur": "Chhattisgarh",
    "bhopal": "Madhya Pradesh", "indore": "Madhya Pradesh",
    "guwahati": "Assam", "chandigarh": "Punjab",
    "amritsar": "Punjab", "ludhiana": "Punjab",
    "gurugram": "Haryana", "faridabad": "Haryana",
    "thiruvananthapuram": "Kerala", "kochi": "Kerala", "kozhikode": "Kerala",
    "visakhapatnam": "Andhra Pradesh", "vijayawada": "Andhra Pradesh",
    "dehradun": "Uttarakhand", "shimla": "Himachal Pradesh",
}


def _extract_state(location: str) -> Optional[str]:
    """Extract Indian state name from a location string."""
    if not location:
        return None
    lower = location.lower().strip()
    imd = _load_imd()
    # Direct state name match
    for state in imd:
        if state.lower() in lower:
            return state
    # City alias match
    for city, state in _CITY_TO_STATE.items():
        if city in lower:
            return state
    return None


@dataclass
class WeatherData:
    source: str              # "openweathermap" | "imd_static"
    temperature_c: float
    humidity_pct: float
    rainfall_mm_recent: float   # last 1h from OWM, or monthly_avg/30 from IMD
    rainfall_mm_annual: float   # always from IMD long-term normals
    state: Optional[str]


def _imd_fallback(location: str) -> WeatherData:
    imd = _load_imd()
    state = _extract_state(location)
    data = imd.get(state, {}) if state else {}
    avg_annual = float(data.get("avg_rainfall_mm_annual", 1000))
    return WeatherData(
        source="imd_static",
        temperature_c=float(data.get("avg_temp_c", 25.0)),
        humidity_pct=float(data.get("avg_humidity_pct", 65.0)),
        rainfall_mm_recent=round(avg_annual / 365, 1),
        rainfall_mm_annual=avg_annual,
        state=state,
    )


async def fetch_farm_weather(location: str) -> WeatherData:
    """Fetch current weather for a location string.

    Falls back to IMD static when API key is absent or call fails.
    Annual rainfall always comes from IMD regardless of source.
    """
    api_key = os.getenv("WEATHER_API_KEY", "").strip()
    state = _extract_state(location)
    imd = _load_imd()
    imd_annual = float((imd.get(state, {}) if state else {}).get("avg_rainfall_mm_annual", 1000))

    if not api_key:
        return _imd_fallback(location)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"q": location, "appid": api_key, "units": "metric"},
            )
            resp.raise_for_status()
            data = resp.json()
            rain = data.get("rain", {})
            recent = float(rain.get("1h", rain.get("3h", 0)))
            return WeatherData(
                source="openweathermap",
                temperature_c=float(data["main"]["temp"]),
                humidity_pct=float(data["main"]["humidity"]),
                rainfall_mm_recent=recent,
                rainfall_mm_annual=imd_annual,
                state=state,
            )
    except Exception:
        logger.warning("OpenWeatherMap call failed for '%s', using IMD fallback", location, exc_info=True)
        return _imd_fallback(location)
