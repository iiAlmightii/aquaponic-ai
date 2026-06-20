import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.weather_service import fetch_farm_weather, _extract_state, WeatherData


def test_extract_state_from_city():
    assert _extract_state("Bengaluru, Karnataka") == "Karnataka"


def test_extract_state_from_state_name():
    assert _extract_state("Tamil Nadu") == "Tamil Nadu"


def test_extract_state_city_alias():
    assert _extract_state("Bangalore") == "Karnataka"


def test_extract_state_unknown():
    assert _extract_state("Unknown Place XYZ") is None


@pytest.mark.asyncio
async def test_fetch_weather_falls_back_to_imd_when_no_key():
    with patch.dict("os.environ", {}, clear=False):
        import os; os.environ.pop("WEATHER_API_KEY", None)
        result = await fetch_farm_weather("Bengaluru, Karnataka")
    assert result.source == "imd_static"
    assert result.temperature_c == 26.5
    assert result.state == "Karnataka"


@pytest.mark.asyncio
async def test_fetch_weather_uses_openweathermap_when_key_present():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "main": {"temp": 31.2, "humidity": 65},
        "rain": {"1h": 0.5},
    }
    with patch.dict("os.environ", {"WEATHER_API_KEY": "testkey"}):
        with patch("services.weather_service.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client
            result = await fetch_farm_weather("Bengaluru, Karnataka")
    assert result.source == "openweathermap"
    assert result.temperature_c == 31.2
    assert result.humidity_pct == 65
