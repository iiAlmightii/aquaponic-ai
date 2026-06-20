import pytest
from services.crop_intelligence_service import CropIntelligenceService


@pytest.fixture
def svc():
    return CropIntelligenceService()


def test_score_crop_perfect_conditions(svc):
    # Ragi with ideal conditions
    result = svc.score_crop("Ragi", area_m2=500, temperature_c=25.0,
                            ph=6.5, humidity_pct=60, rainfall_mm_annual=1000, soil_type="Red")
    assert result["score"] >= 90
    assert result["feasibility"] == "Excellent"


def test_score_crop_temperature_outside_absolute(svc):
    # Wheat (max 25°C) at 40°C should lose 40 points
    result = svc.score_crop("Wheat", area_m2=1000, temperature_c=40.0)
    assert result["score"] <= 60
    assert any(d["factor"] == "Temperature" for d in result["deductions"])


def test_score_crop_area_below_minimum(svc):
    result = svc.score_crop("Rice", area_m2=10)  # min is 500
    assert result["score"] <= 70
    assert any(d["factor"] == "Area" for d in result["deductions"])


def test_score_crop_score_clamped_to_zero(svc):
    # Multiple bad conditions should not go below 0
    result = svc.score_crop("Wheat", area_m2=5, temperature_c=45.0, ph=3.0,
                            humidity_pct=95, rainfall_mm_annual=5000)
    assert result["score"] >= 0


def test_build_match_table_returns_rows(svc):
    table = svc.build_match_table("Ragi", temperature_c=25.0, ph=6.5,
                                  humidity_pct=60, rainfall_mm_annual=1000,
                                  soil_type="Red", area_m2=500)
    assert len(table) >= 4
    factors = [r["factor"] for r in table]
    assert "Temperature" in factors
    assert "Soil pH" in factors


def test_build_match_table_status_good_in_range(svc):
    table = svc.build_match_table("Ragi", temperature_c=25.0)
    temp_row = next(r for r in table if r["factor"] == "Temperature")
    assert temp_row["status"] == "good"


def test_suggest_regions_returns_states(svc):
    regions = svc.suggest_regions("Ragi")
    assert "Karnataka" in regions
    assert isinstance(regions, list)


def test_suggest_regions_unknown_crop(svc):
    assert svc.suggest_regions("UnknownCropXYZ") == []
