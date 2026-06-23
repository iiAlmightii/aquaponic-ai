"""Tests for CropIntelligenceService — no DB required."""
import pytest
from services.crop_intelligence_service import CropIntelligenceService


@pytest.fixture
def svc():
    return CropIntelligenceService()


def test_kb_loads_all_crops(svc):
    names = {c["name"].lower() for c in svc.crops}
    for expected in ("lettuce", "spinach", "tomato", "basil", "mint", "okra"):
        assert expected in names


def test_feasible_when_area_at_optimal(svc):
    result = svc.evaluate_crop("Lettuce", area_m2=10)
    assert result["feasibility"] == "feasible"
    assert result["yield_estimate"]["annual_yield_kg"] == pytest.approx(10 * 3.0 * 7, rel=1e-3)


def test_challenging_when_area_between_min_and_optimal(svc):
    result = svc.evaluate_crop("Lettuce", area_m2=5)
    assert result["feasibility"] == "challenging"
    assert any("optimal" in r for r in result["reasons"])


def test_not_feasible_when_area_below_min(svc):
    result = svc.evaluate_crop("Tomato", area_m2=1)
    assert result["feasibility"] == "not_feasible"
    assert any("minimum" in r for r in result["reasons"])


def test_temperature_out_of_range_adds_warning(svc):
    result = svc.evaluate_crop("Spinach", area_m2=8, temperature_c=40)
    assert result["feasibility"] == "challenging"
    assert any("Temperature" in w for w in result["warnings"])


def test_ph_out_of_range_adds_warning(svc):
    result = svc.evaluate_crop("Basil", area_m2=5, ph=9.0)
    assert result["feasibility"] == "challenging"
    assert any("pH" in w for w in result["warnings"])


def test_unknown_crop_returns_unknown_feasibility(svc):
    result = svc.evaluate_crop("Durian", area_m2=10)
    assert result["feasibility"] == "unknown"
    assert len(result["suggestions"]) > 0


def test_suggest_crops_returns_all_crops_sorted(svc):
    results = svc.suggest_crops(area_m2=20)
    assert len(results) == len(svc.crops)
    order = {"feasible": 0, "challenging": 1, "not_feasible": 2, "unknown": 3}
    for i in range(len(results) - 1):
        assert order[results[i]["feasibility"]] <= order[results[i + 1]["feasibility"]]


def test_evaluate_session_with_valid_context(svc):
    context = {
        "answers": {
            "crop_types": ["Lettuce", "Basil"],
            "farm_area_sqm": 12,
        }
    }
    result = svc.evaluate_session(context)
    assert result["evaluated"] is True
    assert result["area_m2"] == 12
    assert len(result["evaluations"]) == 2


def test_evaluate_session_missing_data_returns_not_evaluated(svc):
    result = svc.evaluate_session({"answers": {}})
    assert result["evaluated"] is False
