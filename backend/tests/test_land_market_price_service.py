import pytest

from services.land_market_price_service import LandMarketPriceService


class DummyResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_fetch_price_with_fallback_filters(monkeypatch):
    calls = []

    def fake_get(url, params, timeout):
        calls.append(dict(params))
        # First two attempts: no records, third attempt returns prices.
        if len(calls) < 3:
            return DummyResponse(200, {"records": []})
        return DummyResponse(
            200,
            {
                "records": [
                    {"modal_price": "2500"},
                    {"modal_price": "2600"},
                ]
            },
        )

    monkeypatch.setattr("requests.get", fake_get)
    monkeypatch.setenv("LAND_MARKET_ENABLE_REALTIME", "true")
    svc = LandMarketPriceService()
    price = svc.fetch_price_per_kg("tomato", state="Karnataka", district="Bengaluru", market_name="Yeshwanthpur")

    assert price is not None
    # INR/quintal to INR/kg conversion.
    assert price.price_per_kg == pytest.approx(25.5, rel=1e-6)
    assert price.record_count == 2
    assert len(calls) >= 3


def test_fetch_uses_cache_when_realtime_disabled(monkeypatch):
    monkeypatch.setenv("LAND_MARKET_ENABLE_REALTIME", "true")

    def fake_get(url, params, timeout):
        return DummyResponse(200, {"records": [{"modal_price": "2000"}]})

    monkeypatch.setattr("requests.get", fake_get)
    svc = LandMarketPriceService()
    first = svc.fetch_price_per_kg("onion", state="Karnataka")
    assert first is not None

    monkeypatch.setenv("LAND_MARKET_ENABLE_REALTIME", "false")
    svc.enable_realtime = False
    second = svc.fetch_price_per_kg("onion", state="Karnataka")
    assert second is not None
    assert second.cache_hit is True


def test_fetch_retries_and_non_fatal(monkeypatch):
    attempts = {"count": 0}

    def flaky_get(url, params, timeout):
        attempts["count"] += 1
        raise RuntimeError("network down")

    monkeypatch.setattr("requests.get", flaky_get)
    monkeypatch.setenv("LAND_MARKET_MAX_RETRIES", "1")
    svc = LandMarketPriceService()
    price = svc.fetch_price_per_kg("tomato")
    assert price is None
    assert attempts["count"] >= 2
