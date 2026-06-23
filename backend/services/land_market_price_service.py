"""Market price integration for land-farm crops using data.gov.in Agmarknet dataset.

Fetch flow:
  1. In-memory cache (TTL = 6 hours)
  2. data.gov.in Agmarknet API (requires DATA_GOV_IN_API_KEY in .env)
  3. Hardcoded India benchmark fallback prices (used when API key is missing or call fails)

API key setup:
  1. Register free at https://data.gov.in (takes 2 minutes)
  2. Go to My Dashboard → API Keys → Generate
  3. Set DATA_GOV_IN_API_KEY=<your_key> in .env
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests


# ── Fallback benchmark prices (₹ per kg) ─────────────────────────────────────
# Source: Agmarknet national average for FY 2024-25.
# Used when the API key is missing or all API calls fail.
# These give a reasonable starting point; users can always override manually.
INDIA_FALLBACK_PRICES: dict[str, float] = {
    # Vegetables
    "tomato": 18.0,
    "potato": 15.0,
    "onion": 22.0,
    "brinjal": 16.0,
    "eggplant": 16.0,
    "cabbage": 12.0,
    "cauliflower": 20.0,
    "capsicum": 40.0,
    "chilli": 45.0,
    "green chilli": 45.0,
    "ladyfinger": 28.0,
    "lady finger": 28.0,
    "bhindi": 28.0,
    "okra": 28.0,
    "bitter gourd": 25.0,
    "bottle gourd": 14.0,
    "ridge gourd": 18.0,
    "pumpkin": 12.0,
    "cucumber": 14.0,
    "beans": 35.0,
    "french beans": 40.0,
    "peas": 30.0,
    "spinach": 22.0,
    "palak": 22.0,
    "coriander": 30.0,
    "fenugreek": 25.0,
    "methi": 25.0,
    "carrot": 20.0,
    "radish": 12.0,
    "beetroot": 18.0,
    "turnip": 15.0,
    "sweet potato": 20.0,
    "cluster beans": 30.0,
    "gavar": 30.0,
    "raw banana": 25.0,
    "plantain": 25.0,
    "drumstick": 50.0,
    "moringa": 50.0,
    "tinda": 20.0,
    "parwal": 28.0,
    "pointed gourd": 28.0,
    "ivy gourd": 22.0,
    "tindora": 22.0,

    # Leafy greens
    "lettuce": 40.0,
    "amaranth": 20.0,
    "mint": 45.0,
    "curry leaves": 60.0,
    "basil": 80.0,
    "dill": 35.0,

    # Fruits
    "banana": 22.0,
    "mango": 50.0,
    "papaya": 18.0,
    "watermelon": 10.0,
    "muskmelon": 15.0,
    "guava": 30.0,
    "lemon": 55.0,
    "lime": 55.0,
    "coconut": 25.0,
    "pineapple": 28.0,
    "pomegranate": 90.0,
    "grapes": 60.0,
    "orange": 40.0,
    "apple": 80.0,

    # Cereals & pulses
    "wheat": 22.0,
    "rice": 30.0,
    "paddy": 22.0,
    "maize": 18.0,
    "corn": 18.0,
    "jowar": 22.0,
    "bajra": 20.0,
    "ragi": 28.0,
    "soybean": 45.0,
    "groundnut": 55.0,
    "sunflower": 50.0,
    "mustard": 52.0,
    "cotton": 65.0,
    "sugarcane": 3.5,
    "turmeric": 120.0,
    "haldi": 120.0,
    "ginger": 50.0,
    "garlic": 60.0,
    "toor dal": 90.0,
    "moong": 90.0,
    "urad": 85.0,
    "chana": 60.0,
    "masoor": 70.0,
}

# Commodity name synonyms: maps user-entered name to Agmarknet API commodity name.
# Agmarknet uses specific names that may differ from colloquial usage.
COMMODITY_ALIASES: dict[str, str] = {
    "tomatoes": "Tomato",
    "potatoes": "Potato",
    "onions": "Onion",
    "ladyfinger": "Bhindi(Okra)",
    "lady finger": "Bhindi(Okra)",
    "bhindi": "Bhindi(Okra)",
    "okra": "Bhindi(Okra)",
    "bitter gourd": "Bitter Gourd",
    "bottle gourd": "Bottle Gourd",
    "ridge gourd": "Ridged Gourd",
    "green chilli": "Green Chilli",
    "capsicum": "Capsicum(Green)",
    "brinjal": "Brinjal",
    "eggplant": "Brinjal",
    "french beans": "Beans",
    "cluster beans": "Cluster Beans",
    "spinach": "Spinach",
    "palak": "Spinach",
    "coriander": "Coriander(Leaves)",
    "fenugreek": "Methi (Leaves)",
    "methi": "Methi (Leaves)",
    "sweet potato": "Sweet Potato",
    "haldi": "Turmeric",
    "paddy": "Paddy(Dhan)(Common)",
    "maize": "Maize",
    "corn": "Maize",
    "bajra": "Bajra(Pearl Millet/Cumbu)",
    "jowar": "Jowar(Sorghum)",
    "soybean": "Soyabeen",
    "groundnut": "Groundnut",
    "mustard": "Mustard",
    "toor dal": "Arhar (Tur/Red Gram)(Whole)",
    "moong": "Moong (Whole)",
    "urad": "Urad (Black Matpe)",
    "chana": "Gram",
    "masoor": "Masur Dal",
}


STATE_ALIASES: dict[str, str] = {
    "ka": "Karnataka",
    "karnataka": "Karnataka",
    "mh": "Maharashtra",
    "maharashtra": "Maharashtra",
    "tn": "Tamil Nadu",
    "tamil nadu": "Tamil Nadu",
    "ts": "Telangana",
    "telangana": "Telangana",
    "ap": "Andhra Pradesh",
    "andhra pradesh": "Andhra Pradesh",
    "dl": "Delhi",
    "delhi": "Delhi",
    "up": "Uttar Pradesh",
    "uttar pradesh": "Uttar Pradesh",
}


DISTRICT_ALIASES: dict[str, str] = {
    "bangalore": "Bengaluru Urban",
    "bangalore urban": "Bengaluru Urban",
    "bangalore rural": "Bengaluru Rural",
    "bengaluru": "Bengaluru Urban",
    "bengaluru urban": "Bengaluru Urban",
    "bengaluru rural": "Bengaluru Rural",
    "bbmp": "Bengaluru Urban",
    "mysore": "Mysuru",
    "mysuru": "Mysuru",
    "belgaum": "Belagavi",
    "belagavi": "Belagavi",
    "tumkur": "Tumakuru",
    "tumakuru": "Tumakuru",
}


DISTRICT_TO_STATE: dict[str, str] = {
    "Bengaluru Urban": "Karnataka",
    "Bengaluru Rural": "Karnataka",
    "Mysuru": "Karnataka",
    "Belagavi": "Karnataka",
    "Tumakuru": "Karnataka",
}


@dataclass
class CropPrice:
    crop: str
    price_per_kg: float
    source: str
    fetched_at_iso: str | None = None
    applied_filters: dict[str, str] | None = None
    record_count: int = 0
    confidence: float | None = None
    cache_hit: bool = False


class LandMarketPriceService:
    """Fetch crop prices from data.gov.in Agmarknet with graceful fallback."""

    DATA_GOV_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"

    def __init__(self):
        self.api_key = (
            os.getenv("DATA_GOV_IN_API_KEY", "").strip()
            or os.getenv("MARKET_API_KEY", "").strip()
        )
        self.timeout = float(os.getenv("LAND_MARKET_HTTP_TIMEOUT", "6"))
        self.max_retries = max(0, int(os.getenv("LAND_MARKET_MAX_RETRIES", "2")))
        self.cache_ttl_minutes = max(1, int(os.getenv("LAND_MARKET_CACHE_TTL_MINUTES", "360")))
        self.enable_realtime = os.getenv("LAND_MARKET_ENABLE_REALTIME", "true").strip().lower() in {
            "1", "true", "yes", "on"
        }
        self._cache: dict[tuple[str, str, str, str], tuple[float, CropPrice]] = {}

    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key)

    @staticmethod
    def _normalize(value: str | None) -> str:
        return str(value or "").strip().lower()

    @staticmethod
    def _normalize_location_token(value: str | None) -> str:
        cleaned = re.sub(r"[^a-z0-9\s]", " ", str(value or "").strip().lower())
        cleaned = re.sub(r"\b(dist|district|dt)\b", " ", cleaned)
        return re.sub(r"\s+", " ", cleaned).strip()

    @staticmethod
    def _title_or_none(value: str | None) -> str | None:
        v = str(value or "").strip()
        return v.title() if v else None

    @classmethod
    def _canonical_state(cls, state: str | None) -> str | None:
        token = cls._normalize_location_token(state)
        if not token:
            return None
        if token in STATE_ALIASES:
            return STATE_ALIASES[token]
        return token.title()

    @classmethod
    def _canonical_district(cls, district: str | None) -> str | None:
        token = cls._normalize_location_token(district)
        if not token:
            return None

        if token in DISTRICT_ALIASES:
            return DISTRICT_ALIASES[token]

        # Heuristic correction for common Bengaluru variants.
        if "bengaluru" in token or "bangalore" in token:
            if "rural" in token:
                return "Bengaluru Rural"
            return "Bengaluru Urban"

        return token.title()

    @staticmethod
    def _infer_state_from_district(district: str | None) -> str | None:
        if not district:
            return None
        return DISTRICT_TO_STATE.get(district)

    @staticmethod
    def _utc_now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _agmarknet_commodity_name(crop_name: str) -> str:
        """Map user-entered crop name to Agmarknet commodity name."""
        normalized = re.sub(r"\s+", " ", crop_name.strip().lower())
        # Check aliases first
        if normalized in COMMODITY_ALIASES:
            return COMMODITY_ALIASES[normalized]
        # Title-case as best effort
        return crop_name.strip().title()

    @staticmethod
    def _fallback_price(crop_name: str) -> Optional[CropPrice]:
        """Return a benchmark price from the hardcoded table if available."""
        normalized = re.sub(r"\s+", " ", crop_name.strip().lower())
        price = INDIA_FALLBACK_PRICES.get(normalized)
        if price is None:
            return None
        return CropPrice(
            crop=crop_name,
            price_per_kg=price,
            source="India benchmark (Agmarknet national avg FY24-25)",
            fetched_at_iso=None,
            applied_filters=None,
            record_count=0,
            confidence=0.5,  # medium confidence — real market price may differ
            cache_hit=False,
        )

    def _cache_key(self, crop_name: str, state: str | None, district: str | None, market_name: str | None) -> tuple[str, str, str, str]:
        return (
            self._normalize(crop_name),
            self._normalize(state),
            self._normalize(district),
            self._normalize(market_name),
        )

    def _cache_get(self, key: tuple[str, str, str, str]) -> Optional[CropPrice]:
        item = self._cache.get(key)
        if not item:
            return None
        stored_at, cached = item
        if time.time() - stored_at > self.cache_ttl_minutes * 60:
            return None
        return CropPrice(
            crop=cached.crop,
            price_per_kg=cached.price_per_kg,
            source=cached.source,
            fetched_at_iso=cached.fetched_at_iso,
            applied_filters=cached.applied_filters,
            record_count=cached.record_count,
            confidence=cached.confidence,
            cache_hit=True,
        )

    def _cache_set(self, key: tuple[str, str, str, str], price: CropPrice) -> None:
        self._cache[key] = (time.time(), price)

    def _request_records(self, params: dict[str, str]) -> Optional[list[dict[str, Any]]]:
        url = f"https://api.data.gov.in/resource/{self.DATA_GOV_RESOURCE_ID}"
        for attempt in range(self.max_retries + 1):
            try:
                resp = requests.get(url, params=params, timeout=self.timeout)
                if resp.status_code == 403:
                    # API key is invalid or unauthorised — no point retrying
                    return None
                if resp.status_code != 200:
                    return None
                payload = resp.json() or {}
                records = payload.get("records")
                return records if isinstance(records, list) else None
            except Exception:
                if attempt >= self.max_retries:
                    return None
                time.sleep(0.25 * (attempt + 1))
        return None

    @staticmethod
    def _extract_price_points(records: list[dict[str, Any]]) -> list[float]:
        prices: list[float] = []
        for row in records:
            v = row.get("modal_price")
            if v is None or v == "":
                continue
            try:
                per_quintal = float(v)
            except (TypeError, ValueError):
                continue
            if per_quintal <= 0:
                continue
            # Agmarknet modal_price is in ₹ per quintal (100 kg)
            prices.append(per_quintal / 100.0)
        return prices

    def _attempts(self, crop_name: str, state: str | None, district: str | None, market_name: str | None) -> list[dict[str, str | None]]:
        commodity = self._agmarknet_commodity_name(crop_name)
        dist = self._canonical_district(district)
        st = self._canonical_state(state) or self._infer_state_from_district(dist)
        market = self._title_or_none(market_name)
        return [
            {"commodity": commodity, "state": st, "district": dist, "market": market},
            {"commodity": commodity, "state": st, "district": dist, "market": None},
            {"commodity": commodity, "state": st, "district": None, "market": None},
            {"commodity": commodity, "state": None, "district": None, "market": None},
        ]

    @staticmethod
    def _params_from_filters(api_key: str, filters: dict[str, str | None]) -> dict[str, str]:
        params: dict[str, str] = {
            "api-key": api_key,
            "format": "json",
            "limit": "75",
        }
        if filters.get("commodity"):
            params["filters[commodity]"] = str(filters["commodity"])
        if filters.get("state"):
            params["filters[state]"] = str(filters["state"])
        if filters.get("district"):
            params["filters[district]"] = str(filters["district"])
        if filters.get("market"):
            params["filters[market]"] = str(filters["market"])
        return params

    def fetch_price_per_kg(
        self,
        crop_name: str,
        state: str | None = None,
        district: str | None = None,
        market_name: str | None = None,
        force_refresh: bool = False,
    ) -> Optional[CropPrice]:
        crop = (crop_name or "").strip()
        if not crop:
            return None

        attempts = self._attempts(crop, state, district, market_name)

        # 1. Cache check (skip if force_refresh)
        if not force_refresh:
            for filters in attempts:
                key = self._cache_key(crop, filters.get("state"), filters.get("district"), filters.get("market"))
                cached = self._cache_get(key)
                if cached:
                    return cached

        # 2. Live API fetch (only if API key is configured and realtime is enabled)
        if self.has_api_key and self.enable_realtime:
            for filters in attempts:
                key = self._cache_key(crop, filters.get("state"), filters.get("district"), filters.get("market"))
                params = self._params_from_filters(self.api_key, filters)
                records = self._request_records(params)
                if not records:
                    continue

                points = self._extract_price_points(records)
                if not points:
                    continue

                avg_price = sum(points) / len(points)
                found = CropPrice(
                    crop=crop,
                    price_per_kg=round(avg_price, 2),
                    source="data.gov.in / Agmarknet (live)",
                    fetched_at_iso=self._utc_now_iso(),
                    applied_filters={k: str(v) for k, v in filters.items() if v},
                    record_count=len(points),
                    confidence=round(min(1.0, len(points) / 20.0), 2),
                    cache_hit=False,
                )
                self._cache_set(key, found)
                return found

        # 3. Fallback: stale cache before giving up
        for filters in attempts:
            key = self._cache_key(crop, filters.get("state"), filters.get("district"), filters.get("market"))
            cached = self._cache_get(key)
            if cached:
                return cached

        # 4. Last resort: hardcoded India benchmark prices
        fallback = self._fallback_price(crop)
        if fallback:
            return fallback

        return None


market_price_service = LandMarketPriceService()
