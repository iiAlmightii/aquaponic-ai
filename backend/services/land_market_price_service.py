"""Market price integration for land-farm crops using public datasets when available."""

from __future__ import annotations

from datetime import datetime, timezone
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests


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
    """Fetch crop prices from public APIs with graceful fallback."""

    DATA_GOV_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"

    def __init__(self):
        self.api_key = (
            os.getenv("DATA_GOV_IN_API_KEY", "").strip()
            or os.getenv("MARKET_API_KEY", "").strip()
            or "579b464db66ec23bdd000001f7f90d69f2728f8c4f7a4f6f6f8a8a8a"
        )
        self.timeout = float(os.getenv("LAND_MARKET_HTTP_TIMEOUT", "6"))
        self.max_retries = max(0, int(os.getenv("LAND_MARKET_MAX_RETRIES", "2")))
        self.cache_ttl_minutes = max(1, int(os.getenv("LAND_MARKET_CACHE_TTL_MINUTES", "360")))
        self.enable_realtime = os.getenv("LAND_MARKET_ENABLE_REALTIME", "true").strip().lower() in {
            "1", "true", "yes", "on"
        }
        self._cache: dict[tuple[str, str, str, str], tuple[float, CropPrice]] = {}

    @staticmethod
    def _normalize(value: str | None) -> str:
        return str(value or "").strip().lower()

    @staticmethod
    def _title_or_none(value: str | None) -> str | None:
        v = str(value or "").strip()
        return v.title() if v else None

    @staticmethod
    def _utc_now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

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
            # 1 quintal = 100 kg
            prices.append(per_quintal / 100.0)
        return prices

    def _attempts(self, crop_name: str, state: str | None, district: str | None, market_name: str | None) -> list[dict[str, str | None]]:
        crop = self._title_or_none(crop_name)
        st = self._title_or_none(state)
        dist = self._title_or_none(district)
        market = self._title_or_none(market_name)
        return [
            {"commodity": crop, "state": st, "district": dist, "market": market},
            {"commodity": crop, "state": st, "district": dist, "market": None},
            {"commodity": crop, "state": st, "district": None, "market": None},
            {"commodity": crop, "state": None, "district": None, "market": None},
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

        if not force_refresh:
            for filters in attempts:
                key = self._cache_key(crop, filters.get("state"), filters.get("district"), filters.get("market"))
                cached = self._cache_get(key)
                if cached:
                    return cached

        if not self.enable_realtime:
            return None

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
                source="data.gov.in agmarknet",
                fetched_at_iso=self._utc_now_iso(),
                applied_filters={k: str(v) for k, v in filters.items() if v},
                record_count=len(points),
                confidence=round(min(1.0, len(points) / 20.0), 2),
                cache_hit=False,
            )
            self._cache_set(key, found)
            return found

        # Last-resort fallback to any fresh cache candidate.
        for filters in attempts:
            key = self._cache_key(crop, filters.get("state"), filters.get("district"), filters.get("market"))
            cached = self._cache_get(key)
            if cached:
                return cached
        return None


market_price_service = LandMarketPriceService()
