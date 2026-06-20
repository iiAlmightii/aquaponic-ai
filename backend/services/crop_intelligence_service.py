"""
services/crop_intelligence_service.py — Deterministic crop feasibility engine.

Rule-based (no LLM). Loads crop parameters from data/crop_knowledge_base.json
and evaluates grow conditions against numeric thresholds sourced from peer-reviewed
literature (FAO 589, ICAR-CIFA, UVI crop valuation studies).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_KB_PATH = Path(__file__).parent.parent / "data" / "crop_knowledge_base.json"

_KNOWLEDGE_BASE: list[dict] | None = None


def _load_kb() -> list[dict]:
    global _KNOWLEDGE_BASE
    if _KNOWLEDGE_BASE is None:
        with _KB_PATH.open() as f:
            _KNOWLEDGE_BASE = json.load(f)
    return _KNOWLEDGE_BASE


class CropIntelligenceService:
    def __init__(self) -> None:
        self.crops = _load_kb()
        self._index: dict[str, dict] = {c["name"].lower(): c for c in self.crops}

    def get_crop(self, name: str) -> dict | None:
        return self._index.get(name.strip().lower())

    def evaluate_crop(
        self,
        crop_name: str,
        area_m2: float,
        temperature_c: float | None = None,
        ph: float | None = None,
        system_type: str | None = None,
    ) -> dict[str, Any]:
        crop = self.get_crop(crop_name)
        if not crop:
            return {
                "crop": crop_name,
                "feasibility": "unknown",
                "reasons": [f"Crop '{crop_name}' not found in knowledge base."],
                "warnings": [],
                "suggestions": [c["name"] for c in self.crops],
            }

        reasons: list[str] = []
        warnings: list[str] = []
        feasibility = "feasible"

        # Area thresholds
        min_area = crop["min_area_m2"]
        optimal_area = crop["optimal_area_m2"]
        if area_m2 < min_area:
            feasibility = "not_feasible"
            reasons.append(
                f"Area {area_m2} m² is below the minimum {min_area} m² required for {crop['name']}."
            )
        elif area_m2 < optimal_area:
            feasibility = "challenging"
            reasons.append(
                f"Area {area_m2} m² is workable but below optimal {optimal_area} m² — yields will be reduced."
            )

        # Temperature tolerance
        if temperature_c is not None:
            t_min = crop["temperature_range"]["min"]
            t_max = crop["temperature_range"]["max"]
            if temperature_c < t_min or temperature_c > t_max:
                if feasibility == "feasible":
                    feasibility = "challenging"
                warnings.append(
                    f"Temperature {temperature_c}°C is outside {crop['name']} range ({t_min}–{t_max}°C)."
                )

        # pH tolerance
        if ph is not None:
            ph_min = crop["ph_range"]["min"]
            ph_max = crop["ph_range"]["max"]
            if ph < ph_min or ph > ph_max:
                if feasibility == "feasible":
                    feasibility = "challenging"
                warnings.append(
                    f"pH {ph} is outside {crop['name']} optimal range ({ph_min}–{ph_max})."
                )

        # System type compatibility
        if system_type:
            supported = crop.get("system_types", [])
            if supported and system_type.lower().replace(" ", "_") not in [s.lower() for s in supported]:
                warnings.append(
                    f"System type '{system_type}' may not be optimal for {crop['name']}. "
                    f"Recommended: {', '.join(supported)}."
                )

        # Yield projection
        yield_per_m2 = crop["yield_per_m2_kg"]
        cycles = crop["cycles_per_year"]
        annual_yield_kg = round(yield_per_m2 * area_m2 * cycles, 2)

        return {
            "crop": crop["name"],
            "feasibility": feasibility,
            "reasons": reasons,
            "warnings": warnings,
            "crop_data": {
                "category": crop["category"],
                "difficulty": crop["difficulty"],
                "growth_days": crop["growth_days"],
                "cycles_per_year": cycles,
                "yield_per_m2_kg": yield_per_m2,
                "plant_density_per_m2": crop.get("plant_density_per_m2"),
                "temperature_range": crop["temperature_range"],
                "ph_range": crop["ph_range"],
                "system_types": crop.get("system_types", []),
                "notes": crop.get("notes", ""),
            },
            "yield_estimate": {
                "area_m2": area_m2,
                "yield_per_m2_kg": yield_per_m2,
                "cycles_per_year": cycles,
                "annual_yield_kg": annual_yield_kg,
            },
        }

    def suggest_crops(
        self,
        area_m2: float,
        temperature_c: float | None = None,
        ph: float | None = None,
        system_type: str | None = None,
    ) -> list[dict]:
        """Return all crops ranked by feasibility for the given conditions."""
        results = [
            self.evaluate_crop(c["name"], area_m2, temperature_c, ph, system_type)
            for c in self.crops
        ]
        order = {"feasible": 0, "challenging": 1, "not_feasible": 2, "unknown": 3}
        results.sort(key=lambda r: order.get(r["feasibility"], 3))
        return results

    def evaluate_session(self, context: dict) -> dict:
        """Called at questionnaire completion to attach crop intelligence to session context."""
        answers = context.get("answers", {})

        crop_types = answers.get("crop_types") or []
        if isinstance(crop_types, str):
            crop_types = [crop_types]

        area_m2 = float(
            answers.get("farm_area_sqm")
            or answers.get("crop_area_sqm")
            or 0
        )
        system_type: str | None = answers.get("system_type")

        if not crop_types or area_m2 <= 0:
            return {
                "evaluated": False,
                "reason": "Insufficient crop or area data in session answers.",
            }

        evaluations = [
            self.evaluate_crop(crop_name, area_m2, system_type=system_type)
            for crop_name in crop_types
        ]

        return {
            "evaluated": True,
            "area_m2": area_m2,
            "evaluations": evaluations,
        }

    def score_crop(
        self,
        crop_name: str,
        area_m2: float,
        temperature_c: float | None = None,
        ph: float | None = None,
        humidity_pct: float | None = None,
        rainfall_mm_annual: float | None = None,
        soil_type: str | None = None,
        system_type: str | None = None,
    ) -> dict[str, Any]:
        """Return numeric suitability score 0–100 with per-factor deductions."""
        crop = self.get_crop(crop_name)
        if not crop:
            return {"score": 0, "feasibility": "unknown", "deductions": []}

        score = 100
        deductions: list[dict] = []

        # Temperature
        if temperature_c is not None:
            t = crop["temperature_range"]
            t_opt_min = t.get("optimal_min", t["min"])
            t_opt_max = t.get("optimal_max", t["max"])
            if temperature_c < t["min"] or temperature_c > t["max"]:
                score -= 40
                deductions.append({"factor": "Temperature", "deduction": -40,
                    "reason": f"{temperature_c}°C outside absolute range {t['min']}–{t['max']}°C"})
            elif temperature_c < t_opt_min or temperature_c > t_opt_max:
                score -= 15
                deductions.append({"factor": "Temperature", "deduction": -15,
                    "reason": f"{temperature_c}°C outside optimal range {t_opt_min}–{t_opt_max}°C"})

        # Humidity
        if humidity_pct is not None and "humidity_range" in crop:
            h = crop["humidity_range"]
            if humidity_pct < h["min"] or humidity_pct > h["max"]:
                score -= 15
                deductions.append({"factor": "Humidity", "deduction": -15,
                    "reason": f"{humidity_pct}% outside {h['min']}–{h['max']}%"})

        # Rainfall
        if rainfall_mm_annual is not None and "rainfall_mm_annual" in crop:
            r = crop["rainfall_mm_annual"]
            if rainfall_mm_annual < r["min"] or rainfall_mm_annual > r["max"]:
                score -= 15
                deductions.append({"factor": "Rainfall", "deduction": -15,
                    "reason": f"{rainfall_mm_annual}mm/year outside {r['min']}–{r['max']}mm"})

        # pH
        if ph is not None:
            p = crop["ph_range"]
            if ph < p["min"] or ph > p["max"]:
                score -= 20
                deductions.append({"factor": "Soil pH", "deduction": -20,
                    "reason": f"pH {ph} outside {p['min']}–{p['max']}"})

        # Soil type
        if soil_type and "soil_types" in crop:
            recommended = [s.lower() for s in crop["soil_types"]]
            if soil_type.lower() not in recommended:
                score -= 10
                deductions.append({"factor": "Soil Type", "deduction": -10,
                    "reason": f"{soil_type} not in recommended: {', '.join(crop['soil_types'])}"})

        # Area
        if area_m2 < crop["min_area_m2"]:
            score -= 30
            deductions.append({"factor": "Area", "deduction": -30,
                "reason": f"{area_m2}m² below minimum {crop['min_area_m2']}m²"})
        elif area_m2 < crop["optimal_area_m2"]:
            score -= 10
            deductions.append({"factor": "Area", "deduction": -10,
                "reason": f"{area_m2}m² below optimal {crop['optimal_area_m2']}m²"})

        score = max(0, score)
        if score >= 80:
            feasibility = "Excellent"
        elif score >= 60:
            feasibility = "Good"
        elif score >= 40:
            feasibility = "Challenging"
        elif score >= 20:
            feasibility = "Difficult"
        else:
            feasibility = "Not Feasible"

        return {"score": score, "feasibility": feasibility, "deductions": deductions}

    def build_match_table(
        self,
        crop_name: str,
        temperature_c: float | None = None,
        ph: float | None = None,
        humidity_pct: float | None = None,
        rainfall_mm_annual: float | None = None,
        soil_type: str | None = None,
        area_m2: float | None = None,
    ) -> list[dict[str, str]]:
        """Return per-factor status rows for the environmental match table."""
        crop = self.get_crop(crop_name)
        if not crop:
            return []

        rows: list[dict] = []

        if temperature_c is not None:
            t = crop["temperature_range"]
            t_opt_min = t.get("optimal_min", t["min"])
            t_opt_max = t.get("optimal_max", t["max"])
            in_opt = t_opt_min <= temperature_c <= t_opt_max
            in_abs = t["min"] <= temperature_c <= t["max"]
            rows.append({
                "factor": "Temperature",
                "current": f"{temperature_c}°C",
                "optimal": f"{t_opt_min}–{t_opt_max}°C",
                "status": "good" if in_opt else ("warning" if in_abs else "critical"),
            })

        if humidity_pct is not None and "humidity_range" in crop:
            h = crop["humidity_range"]
            rows.append({
                "factor": "Humidity",
                "current": f"{humidity_pct}%",
                "optimal": f"{h['min']}–{h['max']}%",
                "status": "good" if h["min"] <= humidity_pct <= h["max"] else "warning",
            })

        if rainfall_mm_annual is not None and "rainfall_mm_annual" in crop:
            r = crop["rainfall_mm_annual"]
            rows.append({
                "factor": "Annual Rainfall",
                "current": f"{rainfall_mm_annual}mm",
                "optimal": f"{r['min']}–{r['max']}mm",
                "status": "good" if r["min"] <= rainfall_mm_annual <= r["max"] else "warning",
            })

        if ph is not None:
            p = crop["ph_range"]
            rows.append({
                "factor": "Soil pH",
                "current": str(ph),
                "optimal": f"{p['min']}–{p['max']}",
                "status": "good" if p["min"] <= ph <= p["max"] else "warning",
            })

        if soil_type and "soil_types" in crop:
            recommended = [s.lower() for s in crop["soil_types"]]
            rows.append({
                "factor": "Soil Type",
                "current": soil_type,
                "optimal": ", ".join(crop["soil_types"]),
                "status": "good" if soil_type.lower() in recommended else "warning",
            })

        if area_m2 is not None:
            rows.append({
                "factor": "Farm Area",
                "current": f"{area_m2}m²",
                "optimal": f"≥{crop['optimal_area_m2']}m²",
                "status": "good" if area_m2 >= crop["optimal_area_m2"]
                          else ("warning" if area_m2 >= crop["min_area_m2"] else "critical"),
            })

        return rows

    def suggest_regions(self, crop_name: str) -> list[str]:
        """Return suitable Indian states for a crop from knowledge base."""
        crop = self.get_crop(crop_name)
        return list(crop.get("suitable_indian_states", [])) if crop else []
