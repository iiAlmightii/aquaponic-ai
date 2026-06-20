# Crop Feasibility Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Crop Feasibility Module in the Intelligence nav group that lets users analyze crop suitability for any farm using live weather (OpenWeatherMap) and embedded IMD climate data, with numeric scoring, match tables, yield forecasts, and alternative recommendations.

**Architecture:** Extend the existing `CropIntelligenceService` with numeric scoring (0–100), humidity/rainfall/soil evaluation, and suggestion methods. Add a `WeatherService` for OpenWeatherMap + IMD static fallback. Create two new backend endpoints and three new frontend components wired into the Intelligence nav group.

**Tech Stack:** Python 3.12, FastAPI, httpx (already installed), React 18 + TypeScript, Tailwind v4, Zustand, Lucide icons, motion/react.

## Global Constraints

- `OPENWEATHER_API_KEY` in `.env` — degrade gracefully to IMD static when absent
- Existing crop records must NOT lose fields; only add new ones
- New crop records must include: `name`, `category`, `season`, `temperature_range` (with `optimal_min`/`optimal_max`), `humidity_range`, `rainfall_mm_annual`, `soil_types`, `suitable_indian_states`, `water_requirement`, `ph_range`, `yield_per_m2_kg`, `cycles_per_year`, `growth_days`, `min_area_m2`, `optimal_area_m2`, `difficulty`, `system_types`, `notes`
- Backend tests: `cd backend && pytest -k "not Endpoint" -v`
- Frontend build: `cd frontend && npm run build`
- `motion` from `'motion/react'`; `cn()` from `'../ui/utils'` (crop components live under `components/crop/`)
- No LLM calls — all logic deterministic

---

## File Map

**Created:**
- `backend/data/imd_climate_normals.json`
- `backend/services/weather_service.py`
- `backend/tests/test_weather_service.py`
- `backend/tests/test_crop_intelligence_extended.py`
- `frontend/src/app/components/crop/CropFeasibility.tsx`
- `frontend/src/app/components/crop/CropResultCard.tsx`
- `frontend/src/app/components/crop/EnvironmentPanel.tsx`

**Modified:**
- `backend/data/crop_knowledge_base.json` — add 30+ Indian crops + new fields on existing records
- `backend/services/crop_intelligence_service.py` — add `score_crop`, `suggest_regions`, `build_match_table`; extend `evaluate_crop`
- `backend/routers/crop.py` — add `GET /crop/weather/{farm_id}` and `POST /crop/analyze-farm`
- `.env.example` — add `OPENWEATHER_API_KEY`
- `frontend/src/app/utils/api.js` — add `cropAPI.weather`, `cropAPI.analyzeFarm`
- `frontend/src/app/App.tsx` — add `'crop-feasibility'` view
- `frontend/src/app/components/layout/MainLayout.tsx` — add nav entry

---

### Task 1: IMD climate normals data + env variable

**Files:**
- Create: `backend/data/imd_climate_normals.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: JSON keyed by exact state name strings (e.g. `"Karnataka"`) with fields `avg_temp_c`, `avg_humidity_pct`, `avg_rainfall_mm_annual`, `kharif_start_month`, `rabi_start_month` — consumed by `weather_service.py` in Task 3

- [ ] **Step 1: Create the IMD climate normals file**

Create `backend/data/imd_climate_normals.json` with this content (30-year IMD averages, source: IMD Climate Normals 1991–2020):

```json
{
  "Andhra Pradesh":     {"avg_temp_c":28.5,"avg_humidity_pct":72,"avg_rainfall_mm_annual":978, "kharif_start_month":"June","rabi_start_month":"October"},
  "Arunachal Pradesh":  {"avg_temp_c":16.5,"avg_humidity_pct":80,"avg_rainfall_mm_annual":2782,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Assam":              {"avg_temp_c":24.5,"avg_humidity_pct":82,"avg_rainfall_mm_annual":2818,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Bihar":              {"avg_temp_c":26.8,"avg_humidity_pct":68,"avg_rainfall_mm_annual":1205,"kharif_start_month":"June","rabi_start_month":"November"},
  "Chhattisgarh":       {"avg_temp_c":27.5,"avg_humidity_pct":70,"avg_rainfall_mm_annual":1300,"kharif_start_month":"June","rabi_start_month":"November"},
  "Goa":                {"avg_temp_c":27.0,"avg_humidity_pct":80,"avg_rainfall_mm_annual":2932,"kharif_start_month":"June","rabi_start_month":"November"},
  "Gujarat":            {"avg_temp_c":27.8,"avg_humidity_pct":58,"avg_rainfall_mm_annual":832, "kharif_start_month":"June","rabi_start_month":"October"},
  "Haryana":            {"avg_temp_c":24.5,"avg_humidity_pct":55,"avg_rainfall_mm_annual":614, "kharif_start_month":"June","rabi_start_month":"November"},
  "Himachal Pradesh":   {"avg_temp_c":14.5,"avg_humidity_pct":65,"avg_rainfall_mm_annual":1469,"kharif_start_month":"June","rabi_start_month":"October"},
  "Jharkhand":          {"avg_temp_c":26.0,"avg_humidity_pct":70,"avg_rainfall_mm_annual":1401,"kharif_start_month":"June","rabi_start_month":"November"},
  "Karnataka":          {"avg_temp_c":26.5,"avg_humidity_pct":68,"avg_rainfall_mm_annual":1250,"kharif_start_month":"June","rabi_start_month":"November"},
  "Kerala":             {"avg_temp_c":27.8,"avg_humidity_pct":85,"avg_rainfall_mm_annual":3055,"kharif_start_month":"May", "rabi_start_month":"November"},
  "Madhya Pradesh":     {"avg_temp_c":26.5,"avg_humidity_pct":60,"avg_rainfall_mm_annual":1017,"kharif_start_month":"June","rabi_start_month":"November"},
  "Maharashtra":        {"avg_temp_c":26.8,"avg_humidity_pct":65,"avg_rainfall_mm_annual":1150,"kharif_start_month":"June","rabi_start_month":"November"},
  "Manipur":            {"avg_temp_c":20.5,"avg_humidity_pct":78,"avg_rainfall_mm_annual":1467,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Meghalaya":          {"avg_temp_c":17.5,"avg_humidity_pct":85,"avg_rainfall_mm_annual":2818,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Mizoram":            {"avg_temp_c":21.0,"avg_humidity_pct":80,"avg_rainfall_mm_annual":2500,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Nagaland":           {"avg_temp_c":19.5,"avg_humidity_pct":78,"avg_rainfall_mm_annual":1800,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Odisha":             {"avg_temp_c":27.8,"avg_humidity_pct":75,"avg_rainfall_mm_annual":1489,"kharif_start_month":"June","rabi_start_month":"November"},
  "Punjab":             {"avg_temp_c":24.1,"avg_humidity_pct":62,"avg_rainfall_mm_annual":649, "kharif_start_month":"June","rabi_start_month":"November"},
  "Rajasthan":          {"avg_temp_c":29.5,"avg_humidity_pct":42,"avg_rainfall_mm_annual":531, "kharif_start_month":"July","rabi_start_month":"November"},
  "Sikkim":             {"avg_temp_c":14.0,"avg_humidity_pct":78,"avg_rainfall_mm_annual":2739,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Tamil Nadu":         {"avg_temp_c":28.8,"avg_humidity_pct":73,"avg_rainfall_mm_annual":998, "kharif_start_month":"June","rabi_start_month":"October"},
  "Telangana":          {"avg_temp_c":28.8,"avg_humidity_pct":67,"avg_rainfall_mm_annual":910, "kharif_start_month":"June","rabi_start_month":"October"},
  "Tripura":            {"avg_temp_c":25.5,"avg_humidity_pct":82,"avg_rainfall_mm_annual":2200,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Uttar Pradesh":      {"avg_temp_c":25.8,"avg_humidity_pct":65,"avg_rainfall_mm_annual":1025,"kharif_start_month":"June","rabi_start_month":"November"},
  "Uttarakhand":        {"avg_temp_c":18.5,"avg_humidity_pct":68,"avg_rainfall_mm_annual":1700,"kharif_start_month":"June","rabi_start_month":"October"},
  "West Bengal":        {"avg_temp_c":26.8,"avg_humidity_pct":78,"avg_rainfall_mm_annual":1582,"kharif_start_month":"June","rabi_start_month":"November"},
  "Delhi":              {"avg_temp_c":25.2,"avg_humidity_pct":60,"avg_rainfall_mm_annual":714, "kharif_start_month":"June","rabi_start_month":"November"},
  "Jammu and Kashmir":  {"avg_temp_c":13.5,"avg_humidity_pct":60,"avg_rainfall_mm_annual":1118,"kharif_start_month":"May", "rabi_start_month":"October"},
  "Ladakh":             {"avg_temp_c":4.5, "avg_humidity_pct":35,"avg_rainfall_mm_annual":102, "kharif_start_month":"June","rabi_start_month":"September"}
}
```

- [ ] **Step 2: Add env variable**

Append to `.env.example`:
```
OPENWEATHER_API_KEY=your_openweathermap_api_key_here
```

- [ ] **Step 3: Validate JSON**

```bash
cd backend && python -c "import json; json.load(open('data/imd_climate_normals.json')); print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/data/imd_climate_normals.json .env.example
git commit -m "feat: add IMD climate normals data and OPENWEATHER_API_KEY env var"
```

---

### Task 2: Expand crop knowledge base

**Files:**
- Modify: `backend/data/crop_knowledge_base.json`

**Interfaces:**
- Produces: Every record has `season`, `humidity_range`, `rainfall_mm_annual`, `soil_types`, `suitable_indian_states`, `temperature_range.optimal_min`, `temperature_range.optimal_max` — consumed by Task 4

- [ ] **Step 1: Check current records**

```bash
cd backend && python -c "
import json; kb=json.load(open('data/crop_knowledge_base.json'))
print([c['name'] for c in kb]); print(list(kb[0].keys()))
"
```

- [ ] **Step 2: Patch existing aquaponic crops to add new fields**

Create `backend/patch_kb.py`:

```python
import json
from pathlib import Path

path = Path("backend/data/crop_knowledge_base.json")
kb = json.load(path.open())

AQUAPONIC_EXTRA = {
    "season": "perennial",
    "humidity_range": {"min": 50, "max": 80},
    "rainfall_mm_annual": {"min": 500, "max": 2500},
    "soil_types": ["aquaponic_media", "growing_medium"],
    "suitable_indian_states": ["Karnataka","Kerala","Maharashtra","Tamil Nadu","Andhra Pradesh","Goa"],
    "water_requirement": "high",
}

for crop in kb:
    for k, v in AQUAPONIC_EXTRA.items():
        if k not in crop:
            crop[k] = v
    t = crop["temperature_range"]
    if "optimal_min" not in t:
        t["optimal_min"] = round(t["min"] + (t["max"] - t["min"]) * 0.25, 1)
        t["optimal_max"] = round(t["max"] - (t["max"] - t["min"]) * 0.25, 1)

path.write_text(json.dumps(kb, indent=2))
print(f"Patched {len(kb)} records")
```

Run: `cd /home/chandan/Downloads/aquaponic-ai && python backend/patch_kb.py`
Delete the script after: `rm backend/patch_kb.py`

- [ ] **Step 3: Append Indian crop records**

Open `backend/data/crop_knowledge_base.json`. After the last existing record and before the closing `]`, append a comma then these records:

```json
{"name":"Rice","category":"Cereal","season":"kharif","temperature_range":{"min":20,"max":38,"optimal_min":22,"optimal_max":32},"humidity_range":{"min":60,"max":90},"rainfall_mm_annual":{"min":1000,"max":2500},"soil_types":["Alluvial","Clay","Clay Loam"],"suitable_indian_states":["West Bengal","Uttar Pradesh","Punjab","Andhra Pradesh","Tamil Nadu","Odisha","Bihar","Chhattisgarh"],"water_requirement":"high","ph_range":{"min":5.5,"max":6.5},"yield_per_m2_kg":0.45,"cycles_per_year":2,"growth_days":120,"min_area_m2":500,"optimal_area_m2":2000,"difficulty":"medium","system_types":["open_field","paddy_field"],"notes":"Kharif dominant. Requires standing water. Source: ICAR Rice Production Manual."},
{"name":"Wheat","category":"Cereal","season":"rabi","temperature_range":{"min":7,"max":25,"optimal_min":12,"optimal_max":18},"humidity_range":{"min":35,"max":70},"rainfall_mm_annual":{"min":400,"max":900},"soil_types":["Alluvial","Loamy","Clay Loam","Sandy Loam"],"suitable_indian_states":["Punjab","Haryana","Uttar Pradesh","Madhya Pradesh","Rajasthan","Bihar"],"water_requirement":"medium","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":0.38,"cycles_per_year":1,"growth_days":125,"min_area_m2":500,"optimal_area_m2":2000,"difficulty":"medium","system_types":["open_field"],"notes":"Cool season. Indo-Gangetic Plains staple. Source: ICAR-IIWBR."},
{"name":"Maize","category":"Cereal","season":"kharif","temperature_range":{"min":15,"max":38,"optimal_min":21,"optimal_max":27},"humidity_range":{"min":50,"max":80},"rainfall_mm_annual":{"min":500,"max":1000},"soil_types":["Loamy","Sandy Loam","Red","Alluvial"],"suitable_indian_states":["Karnataka","Andhra Pradesh","Rajasthan","Madhya Pradesh","Maharashtra","Uttar Pradesh","Bihar"],"water_requirement":"medium","ph_range":{"min":5.8,"max":7.0},"yield_per_m2_kg":0.52,"cycles_per_year":2,"growth_days":100,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field","raised_bed"],"notes":"Versatile cereal. Source: ICAR Directorate of Maize Research."},
{"name":"Groundnut","category":"Oilseed","season":"kharif","temperature_range":{"min":20,"max":38,"optimal_min":25,"optimal_max":30},"humidity_range":{"min":40,"max":70},"rainfall_mm_annual":{"min":500,"max":1200},"soil_types":["Sandy Loam","Red","Loamy","Laterite"],"suitable_indian_states":["Gujarat","Andhra Pradesh","Tamil Nadu","Karnataka","Rajasthan","Maharashtra"],"water_requirement":"low","ph_range":{"min":5.5,"max":7.0},"yield_per_m2_kg":0.28,"cycles_per_year":1,"growth_days":110,"min_area_m2":300,"optimal_area_m2":1500,"difficulty":"easy","system_types":["open_field"],"notes":"Leguminous oilseed. Fixes nitrogen. Source: ICAR-NRCG."},
{"name":"Soybean","category":"Legume","season":"kharif","temperature_range":{"min":15,"max":35,"optimal_min":23,"optimal_max":28},"humidity_range":{"min":60,"max":80},"rainfall_mm_annual":{"min":600,"max":1000},"soil_types":["Loamy","Clay Loam","Black Cotton","Alluvial"],"suitable_indian_states":["Madhya Pradesh","Maharashtra","Rajasthan","Karnataka","Chhattisgarh"],"water_requirement":"medium","ph_range":{"min":6.0,"max":7.0},"yield_per_m2_kg":0.22,"cycles_per_year":1,"growth_days":95,"min_area_m2":300,"optimal_area_m2":1000,"difficulty":"medium","system_types":["open_field"],"notes":"MP produces 60%+ of national output. Source: ICAR-IISR."},
{"name":"Bajra","category":"Cereal","season":"kharif","temperature_range":{"min":25,"max":45,"optimal_min":27,"optimal_max":35},"humidity_range":{"min":25,"max":60},"rainfall_mm_annual":{"min":300,"max":600},"soil_types":["Sandy","Sandy Loam","Red"],"suitable_indian_states":["Rajasthan","Maharashtra","Gujarat","Uttar Pradesh","Haryana","Andhra Pradesh"],"water_requirement":"low","ph_range":{"min":5.5,"max":8.0},"yield_per_m2_kg":0.32,"cycles_per_year":1,"growth_days":85,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field"],"notes":"Pearl millet. Highly drought-tolerant. Source: ICAR-AICPMIP."},
{"name":"Jowar","category":"Cereal","season":"kharif","temperature_range":{"min":18,"max":40,"optimal_min":25,"optimal_max":35},"humidity_range":{"min":30,"max":70},"rainfall_mm_annual":{"min":400,"max":1000},"soil_types":["Clay","Loamy","Red","Black Cotton"],"suitable_indian_states":["Maharashtra","Karnataka","Andhra Pradesh","Madhya Pradesh","Rajasthan"],"water_requirement":"low","ph_range":{"min":5.5,"max":8.5},"yield_per_m2_kg":0.30,"cycles_per_year":2,"growth_days":105,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field"],"notes":"Sorghum. Drought-resistant. Source: ICAR-ICRISAT."},
{"name":"Arhar","category":"Legume","season":"kharif","temperature_range":{"min":18,"max":38,"optimal_min":20,"optimal_max":30},"humidity_range":{"min":40,"max":75},"rainfall_mm_annual":{"min":600,"max":1000},"soil_types":["Sandy Loam","Loamy","Red","Alluvial"],"suitable_indian_states":["Maharashtra","Madhya Pradesh","Karnataka","Uttar Pradesh","Andhra Pradesh"],"water_requirement":"low","ph_range":{"min":5.5,"max":7.5},"yield_per_m2_kg":0.20,"cycles_per_year":1,"growth_days":160,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"medium","system_types":["open_field"],"notes":"Pigeon Pea / Tur Dal. Fixes nitrogen. Source: ICAR-ICRISAT."},
{"name":"Moong","category":"Legume","season":"kharif","temperature_range":{"min":25,"max":38,"optimal_min":28,"optimal_max":32},"humidity_range":{"min":40,"max":70},"rainfall_mm_annual":{"min":400,"max":750},"soil_types":["Sandy Loam","Loamy","Alluvial"],"suitable_indian_states":["Rajasthan","Uttar Pradesh","Andhra Pradesh","Maharashtra","Tamil Nadu"],"water_requirement":"low","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":0.12,"cycles_per_year":2,"growth_days":72,"min_area_m2":200,"optimal_area_m2":800,"difficulty":"easy","system_types":["open_field","raised_bed"],"notes":"Green Gram. Short-duration. Source: ICAR-AICPMIP."},
{"name":"Ragi","category":"Cereal","season":"kharif","temperature_range":{"min":15,"max":35,"optimal_min":20,"optimal_max":30},"humidity_range":{"min":40,"max":80},"rainfall_mm_annual":{"min":500,"max":1500},"soil_types":["Red","Sandy Loam","Laterite","Alluvial"],"suitable_indian_states":["Karnataka","Andhra Pradesh","Tamil Nadu","Uttarakhand","Odisha","Maharashtra"],"water_requirement":"low","ph_range":{"min":5.5,"max":7.5},"yield_per_m2_kg":0.35,"cycles_per_year":1,"growth_days":120,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field"],"notes":"Finger Millet. Karnataka grows 58% of India's Ragi. Source: ICAR Millet Research."},
{"name":"Sunflower","category":"Oilseed","season":"kharif","temperature_range":{"min":18,"max":35,"optimal_min":23,"optimal_max":28},"humidity_range":{"min":40,"max":70},"rainfall_mm_annual":{"min":500,"max":1000},"soil_types":["Loamy","Sandy Loam","Black Cotton","Alluvial"],"suitable_indian_states":["Karnataka","Andhra Pradesh","Maharashtra","Tamil Nadu","Odisha"],"water_requirement":"medium","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":0.22,"cycles_per_year":2,"growth_days":95,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field"],"notes":"Kharif and Rabi both possible. Source: ICAR-DRMR."},
{"name":"Cotton","category":"Fiber","season":"kharif","temperature_range":{"min":18,"max":38,"optimal_min":22,"optimal_max":32},"humidity_range":{"min":40,"max":65},"rainfall_mm_annual":{"min":500,"max":1000},"soil_types":["Black Cotton","Loamy","Red","Alluvial"],"suitable_indian_states":["Gujarat","Maharashtra","Telangana","Andhra Pradesh","Punjab","Haryana","Madhya Pradesh"],"water_requirement":"medium","ph_range":{"min":5.8,"max":7.5},"yield_per_m2_kg":0.15,"cycles_per_year":1,"growth_days":165,"min_area_m2":500,"optimal_area_m2":2000,"difficulty":"hard","system_types":["open_field"],"notes":"Fiber crop. Deep black soils in Deccan ideal. Source: ICAR-CICR."},
{"name":"Barley","category":"Cereal","season":"rabi","temperature_range":{"min":5,"max":25,"optimal_min":12,"optimal_max":20},"humidity_range":{"min":35,"max":60},"rainfall_mm_annual":{"min":300,"max":700},"soil_types":["Loamy","Sandy Loam","Clay Loam","Alluvial"],"suitable_indian_states":["Uttar Pradesh","Rajasthan","Haryana","Madhya Pradesh","Himachal Pradesh"],"water_requirement":"low","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":0.30,"cycles_per_year":1,"growth_days":110,"min_area_m2":300,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field"],"notes":"Tolerates salinity. Source: ICAR-IIWBR."},
{"name":"Gram","category":"Legume","season":"rabi","temperature_range":{"min":8,"max":28,"optimal_min":15,"optimal_max":22},"humidity_range":{"min":30,"max":60},"rainfall_mm_annual":{"min":400,"max":700},"soil_types":["Sandy Loam","Loamy","Clay","Black Cotton"],"suitable_indian_states":["Madhya Pradesh","Rajasthan","Maharashtra","Uttar Pradesh","Andhra Pradesh","Karnataka"],"water_requirement":"low","ph_range":{"min":6.0,"max":8.0},"yield_per_m2_kg":0.20,"cycles_per_year":1,"growth_days":105,"min_area_m2":200,"optimal_area_m2":1000,"difficulty":"easy","system_types":["open_field"],"notes":"Chickpea/Chana. MP produces 40% national output. Source: ICAR-IIPR."},
{"name":"Mustard","category":"Oilseed","season":"rabi","temperature_range":{"min":8,"max":25,"optimal_min":12,"optimal_max":20},"humidity_range":{"min":30,"max":60},"rainfall_mm_annual":{"min":300,"max":600},"soil_types":["Sandy Loam","Loamy","Alluvial","Clay Loam"],"suitable_indian_states":["Rajasthan","Uttar Pradesh","Haryana","Madhya Pradesh","West Bengal","Gujarat"],"water_requirement":"low","ph_range":{"min":5.8,"max":7.5},"yield_per_m2_kg":0.15,"cycles_per_year":1,"growth_days":120,"min_area_m2":200,"optimal_area_m2":800,"difficulty":"easy","system_types":["open_field"],"notes":"Rajasthan produces 46% of India's mustard. Source: ICAR-DRMR."},
{"name":"Lentil","category":"Legume","season":"rabi","temperature_range":{"min":7,"max":25,"optimal_min":10,"optimal_max":18},"humidity_range":{"min":30,"max":55},"rainfall_mm_annual":{"min":300,"max":600},"soil_types":["Loamy","Sandy Loam","Clay Loam","Alluvial"],"suitable_indian_states":["Madhya Pradesh","Uttar Pradesh","Bihar","West Bengal","Rajasthan"],"water_requirement":"low","ph_range":{"min":5.5,"max":7.0},"yield_per_m2_kg":0.15,"cycles_per_year":1,"growth_days":100,"min_area_m2":100,"optimal_area_m2":500,"difficulty":"medium","system_types":["open_field"],"notes":"Masur Dal. Sensitive to waterlogging. Source: ICAR-IIPR."},
{"name":"Peas","category":"Legume","season":"rabi","temperature_range":{"min":7,"max":22,"optimal_min":10,"optimal_max":18},"humidity_range":{"min":40,"max":65},"rainfall_mm_annual":{"min":400,"max":700},"soil_types":["Loamy","Sandy Loam","Clay","Alluvial"],"suitable_indian_states":["Uttar Pradesh","Madhya Pradesh","Himachal Pradesh","Punjab","Haryana","Uttarakhand"],"water_requirement":"medium","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":0.55,"cycles_per_year":1,"growth_days":80,"min_area_m2":100,"optimal_area_m2":500,"difficulty":"easy","system_types":["open_field","raised_bed"],"notes":"Garden peas. Cool season. UP produces 35% of India's peas. Source: ICAR-IIVR."},
{"name":"Potato","category":"Vegetable","season":"rabi","temperature_range":{"min":8,"max":25,"optimal_min":15,"optimal_max":20},"humidity_range":{"min":50,"max":80},"rainfall_mm_annual":{"min":500,"max":1000},"soil_types":["Sandy Loam","Loamy","Alluvial"],"suitable_indian_states":["Uttar Pradesh","West Bengal","Madhya Pradesh","Punjab","Bihar","Gujarat","Assam"],"water_requirement":"high","ph_range":{"min":5.0,"max":6.5},"yield_per_m2_kg":3.5,"cycles_per_year":1,"growth_days":90,"min_area_m2":100,"optimal_area_m2":500,"difficulty":"medium","system_types":["open_field","raised_bed"],"notes":"UP produces 30% national output. Source: ICAR-CPRI."},
{"name":"Banana","category":"Fruit","season":"perennial","temperature_range":{"min":15,"max":40,"optimal_min":20,"optimal_max":30},"humidity_range":{"min":60,"max":90},"rainfall_mm_annual":{"min":1000,"max":2500},"soil_types":["Alluvial","Loamy","Red Laterite","Sandy Loam"],"suitable_indian_states":["Andhra Pradesh","Maharashtra","Gujarat","Tamil Nadu","Kerala","Karnataka","Madhya Pradesh"],"water_requirement":"high","ph_range":{"min":5.5,"max":7.0},"yield_per_m2_kg":4.5,"cycles_per_year":1,"growth_days":450,"min_area_m2":100,"optimal_area_m2":1000,"difficulty":"medium","system_types":["open_field"],"notes":"India is world's largest producer. Source: NHB & ICAR-NRCB."},
{"name":"Sugarcane","category":"Cash Crop","season":"perennial","temperature_range":{"min":20,"max":40,"optimal_min":25,"optimal_max":35},"humidity_range":{"min":60,"max":90},"rainfall_mm_annual":{"min":1000,"max":2500},"soil_types":["Loamy","Alluvial","Clay Loam","Sandy Loam"],"suitable_indian_states":["Uttar Pradesh","Maharashtra","Karnataka","Tamil Nadu","Andhra Pradesh","Bihar","Gujarat"],"water_requirement":"high","ph_range":{"min":6.0,"max":8.0},"yield_per_m2_kg":12.0,"cycles_per_year":1,"growth_days":365,"min_area_m2":1000,"optimal_area_m2":5000,"difficulty":"medium","system_types":["open_field"],"notes":"UP contributes 38% national production. Ratoon crop possible. Source: ICAR-IISR."},
{"name":"Turmeric","category":"Spice","season":"perennial","temperature_range":{"min":18,"max":35,"optimal_min":22,"optimal_max":28},"humidity_range":{"min":60,"max":90},"rainfall_mm_annual":{"min":1500,"max":2200},"soil_types":["Sandy Loam","Loamy","Red Laterite","Clay Loam"],"suitable_indian_states":["Andhra Pradesh","Odisha","Karnataka","Tamil Nadu","West Bengal","Maharashtra","Assam"],"water_requirement":"high","ph_range":{"min":4.5,"max":7.5},"yield_per_m2_kg":3.2,"cycles_per_year":1,"growth_days":270,"min_area_m2":50,"optimal_area_m2":500,"difficulty":"medium","system_types":["open_field","raised_bed"],"notes":"India produces 80%+ of world turmeric. AP's Nizamabad is the hub. Source: ICAR-IISR Spices."},
{"name":"Ginger","category":"Spice","season":"perennial","temperature_range":{"min":18,"max":32,"optimal_min":22,"optimal_max":28},"humidity_range":{"min":70,"max":90},"rainfall_mm_annual":{"min":1500,"max":2500},"soil_types":["Sandy Loam","Loamy","Red Laterite"],"suitable_indian_states":["Kerala","Meghalaya","Andhra Pradesh","Odisha","West Bengal","Assam","Karnataka"],"water_requirement":"high","ph_range":{"min":5.5,"max":6.5},"yield_per_m2_kg":2.2,"cycles_per_year":1,"growth_days":210,"min_area_m2":50,"optimal_area_m2":300,"difficulty":"hard","system_types":["open_field","raised_bed"],"notes":"Shade-tolerant. Sensitive to waterlogging. Source: ICAR-IISR Spices."},
{"name":"Onion","category":"Vegetable","season":"rabi","temperature_range":{"min":12,"max":35,"optimal_min":20,"optimal_max":25},"humidity_range":{"min":40,"max":70},"rainfall_mm_annual":{"min":600,"max":800},"soil_types":["Sandy Loam","Loamy","Alluvial"],"suitable_indian_states":["Maharashtra","Karnataka","Gujarat","Madhya Pradesh","Bihar","Andhra Pradesh"],"water_requirement":"medium","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":4.2,"cycles_per_year":2,"growth_days":105,"min_area_m2":50,"optimal_area_m2":500,"difficulty":"medium","system_types":["open_field","raised_bed"],"notes":"Maharashtra produces 35% national output. Nashik is the onion capital. Source: NHB India."},
{"name":"Garlic","category":"Vegetable","season":"rabi","temperature_range":{"min":8,"max":22,"optimal_min":14,"optimal_max":18},"humidity_range":{"min":40,"max":70},"rainfall_mm_annual":{"min":500,"max":800},"soil_types":["Sandy Loam","Loamy","Clay Loam"],"suitable_indian_states":["Madhya Pradesh","Gujarat","Rajasthan","Uttar Pradesh","Odisha","Maharashtra"],"water_requirement":"medium","ph_range":{"min":6.0,"max":7.5},"yield_per_m2_kg":2.8,"cycles_per_year":1,"growth_days":130,"min_area_m2":30,"optimal_area_m2":300,"difficulty":"medium","system_types":["open_field","raised_bed"],"notes":"MP produces 50% of India's garlic. Source: NHB Garlic Cultivation Guide."}
```

- [ ] **Step 4: Validate**

```bash
cd backend && python -c "
import json
kb = json.load(open('data/crop_knowledge_base.json'))
required = ['name','season','humidity_range','rainfall_mm_annual','soil_types','suitable_indian_states']
missing = [f'{c[\"name\"]}:{f}' for c in kb for f in required if f not in c]
print('MISSING:', missing) if missing else print(f'OK: {len(kb)} crops')
"
```
Expected: `OK: 30 crops` (or however many total)

- [ ] **Step 5: Run existing tests**

```bash
cd backend && pytest tests/test_crop_intelligence.py -v
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/data/crop_knowledge_base.json
git commit -m "feat: expand crop KB with 30+ Indian crops (ICAR/FAO/NHB data)"
```

---

### Task 3: WeatherService

**Files:**
- Create: `backend/services/weather_service.py`
- Create: `backend/tests/test_weather_service.py`

**Interfaces:**
- Produces: `async def fetch_farm_weather(location: str) -> WeatherData`
- `WeatherData` dataclass: `source: str`, `temperature_c: float`, `humidity_pct: float`, `rainfall_mm_recent: float`, `rainfall_mm_annual: float`, `state: str | None`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_weather_service.py
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
        import os; os.environ.pop("OPENWEATHER_API_KEY", None)
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
    with patch.dict("os.environ", {"OPENWEATHER_API_KEY": "testkey"}):
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && pytest tests/test_weather_service.py -v
```
Expected: ImportError — module does not exist yet.

- [ ] **Step 3: Implement the service**

```python
# backend/services/weather_service.py
"""Weather data for crop feasibility analysis.

Priority:
  1. OpenWeatherMap API (current conditions) when OPENWEATHER_API_KEY is set
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
    api_key = os.getenv("OPENWEATHER_API_KEY", "").strip()
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
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_weather_service.py -v
```
Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/weather_service.py backend/tests/test_weather_service.py
git commit -m "feat: add WeatherService with OpenWeatherMap + IMD static fallback"
```

---

### Task 4: Extend CropIntelligenceService

**Files:**
- Modify: `backend/services/crop_intelligence_service.py`
- Create: `backend/tests/test_crop_intelligence_extended.py`

**Interfaces:**
- Produces:
  - `score_crop(crop_name, area_m2, temperature_c, ph, humidity_pct, rainfall_mm_annual, soil_type, system_type) -> dict` with `score: int`, `feasibility: str`, `deductions: list`
  - `build_match_table(crop_name, temperature_c, ph, humidity_pct, rainfall_mm_annual, soil_type, area_m2) -> list[dict]` each `{factor, current, optimal, status}`
  - `suggest_regions(crop_name) -> list[str]`
  - Extended `evaluate_crop(...)` — adds `score`, `match_table`, `yield_scenarios`, `suggested_regions`, `alternatives` to existing return dict

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_crop_intelligence_extended.py
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && pytest tests/test_crop_intelligence_extended.py -v
```
Expected: FAIL — `score_crop`, `build_match_table`, `suggest_regions` not defined.

- [ ] **Step 3: Add three new methods to CropIntelligenceService**

In `backend/services/crop_intelligence_service.py`, add the following methods inside the `CropIntelligenceService` class after the existing `evaluate_session` method:

```python
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
```

- [ ] **Step 4: Run all extended tests**

```bash
cd backend && pytest tests/test_crop_intelligence_extended.py tests/test_crop_intelligence.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/crop_intelligence_service.py backend/tests/test_crop_intelligence_extended.py
git commit -m "feat: add score_crop, build_match_table, suggest_regions to CropIntelligenceService"
```

---

### Task 5: New backend endpoints

**Files:**
- Modify: `backend/routers/crop.py`

**Interfaces:**
- Consumes: `fetch_farm_weather` from Task 3, `score_crop`/`build_match_table`/`suggest_regions` from Task 4
- Consumes: `INDIA_FALLBACK_PRICES` from `services.land_market_price_service`
- Produces:
  - `GET /crop/weather/{farm_id}` → `{current: {...}, long_term: {...}}`
  - `POST /crop/analyze-farm` → `{farm: {...}, environment: {...}, results: [...]}`

- [ ] **Step 1: Update crop.py**

Replace the full content of `backend/routers/crop.py` with:

```python
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
```

- [ ] **Step 2: Verify import**

```bash
cd backend && python -c "from routers.crop import router; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && pytest -k "not Endpoint" -v
```
Expected: all existing + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/crop.py
git commit -m "feat: add /crop/weather/{farm_id} and /crop/analyze-farm endpoints"
```

---

### Task 6: Frontend API helpers

**Files:**
- Modify: `frontend/src/app/utils/api.js`

**Interfaces:**
- Produces:
  - `cropAPI.weather(farmId)` → `GET /crop/weather/{farmId}`
  - `cropAPI.analyzeFarm(body)` → `POST /crop/analyze-farm`
  - `cropAPI.list()` already exists — keep it

- [ ] **Step 1: Add to api.js**

In `frontend/src/app/utils/api.js`, find the existing `cropAPI` export (if any) or add after `reportAPI`. Replace or add:

```js
export const cropAPI = {
  list:        ()      => api.get('/crop/list'),
  weather:     (farmId) => api.get(`/crop/weather/${farmId}`),
  analyzeFarm: (body)  => api.post('/crop/analyze-farm', body),
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/utils/api.js
git commit -m "feat: add cropAPI.weather and cropAPI.analyzeFarm to api.js"
```

---

### Task 7: EnvironmentPanel component

**Files:**
- Create: `frontend/src/app/components/crop/EnvironmentPanel.tsx`

**Interfaces:**
- Props:
  ```tsx
  interface EnvironmentPanelProps {
    farmId: string | null;
    onChange: (env: EnvironmentData) => void;
  }
  interface EnvironmentData {
    temperature_c: number | null;
    humidity_pct: number | null;
    rainfall_mm_annual: number | null;
    soil_type: string;
    soil_ph: number | null;
    irrigation_method: string;
    water_source: string;
    use_current_weather: boolean;
    temperature_override: number | null;
    humidity_override: number | null;
  }
  ```
- Exports: `EnvironmentPanel`, `EnvironmentData`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/app/components/crop/EnvironmentPanel.tsx
import { useEffect, useState } from 'react';
import { Pencil, Check, Wifi, Database } from 'lucide-react';
import { cropAPI } from '../../utils/api';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

export interface EnvironmentData {
  temperature_c: number | null;
  humidity_pct: number | null;
  rainfall_mm_annual: number | null;
  soil_type: string;
  soil_ph: number | null;
  irrigation_method: string;
  water_source: string;
  use_current_weather: boolean;
  temperature_override: number | null;
  humidity_override: number | null;
}

interface EnvironmentPanelProps {
  farmId: string | null;
  onChange: (env: EnvironmentData) => void;
}

const SOIL_TYPES = ['Loamy','Clay','Sandy','Red Laterite','Black Cotton Soil','Alluvial','Sandy Loam'];
const IRRIGATION = ['Drip','Flood','Sprinkler','Rainfed'];
const WATER_SOURCES = ['Borewell','River','Canal','Rainwater'];

function SourceBadge({ source }: { source: string }) {
  const live = source === 'openweathermap';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
      live ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
    )}>
      {live ? <Wifi className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
      {live ? 'OpenWeatherMap' : 'IMD Static'}
    </span>
  );
}

function EditableField({
  label, value, unit, onOverride,
}: { label: string; value: number | null; unit: string; onOverride: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
            autoFocus
          />
          <span className="text-xs text-slate-400">{unit}</span>
          <button onClick={() => { onOverride(parseFloat(draft) || null); setEditing(false); }}
            className="text-green-600 hover:text-green-700">
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-800">
            {value != null ? `${value} ${unit}` : '—'}
          </span>
          <button onClick={() => { setDraft(String(value ?? '')); setEditing(true); }}
            className="text-slate-400 hover:text-slate-600">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function EnvironmentPanel({ farmId, onChange }: EnvironmentPanelProps) {
  const [loading, setLoading] = useState(false);
  const [weatherSource, setWeatherSource] = useState<string>('');
  const [current, setCurrent] = useState<{ temp: number | null; humidity: number | null }>({ temp: null, humidity: null });
  const [longTerm, setLongTerm] = useState<any>(null);
  const [env, setEnv] = useState<EnvironmentData>({
    temperature_c: null, humidity_pct: null, rainfall_mm_annual: null,
    soil_type: '', soil_ph: null, irrigation_method: '', water_source: '',
    use_current_weather: true, temperature_override: null, humidity_override: null,
  });

  useEffect(() => {
    if (!farmId) return;
    setLoading(true);
    cropAPI.weather(farmId)
      .then(({ data }: any) => {
        setWeatherSource(data.current.source);
        setCurrent({ temp: data.current.temperature_c, humidity: data.current.humidity_pct });
        setLongTerm(data.long_term);
        const next = {
          ...env,
          temperature_c: data.current.temperature_c,
          humidity_pct: data.current.humidity_pct,
          rainfall_mm_annual: data.long_term?.avg_rainfall_mm_annual ?? null,
        };
        setEnv(next);
        onChange(next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [farmId]);

  const update = (patch: Partial<EnvironmentData>) => {
    const next = { ...env, ...patch };
    setEnv(next);
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Environmental Data
      </p>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 rounded-lg bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current conditions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-slate-600">Current Conditions</p>
              {weatherSource && <SourceBadge source={weatherSource} />}
            </div>
            <EditableField label="Temperature" value={env.temperature_override ?? current.temp}
              unit="°C" onOverride={v => update({ temperature_override: v })} />
            <EditableField label="Humidity" value={env.humidity_override ?? current.humidity}
              unit="%" onOverride={v => update({ humidity_override: v })} />
            {env.rainfall_mm_annual != null && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Annual Rainfall</p>
                <p className="text-sm font-semibold text-slate-800">{env.rainfall_mm_annual} mm</p>
                <p className="text-[10px] text-slate-400">30-year IMD average</p>
              </div>
            )}
          </div>

          {/* Long-term averages */}
          {longTerm && (
            <div className="space-y-2 bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">
                IMD 30-year normals · {longTerm.state}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span>Avg Temp: <b>{longTerm.avg_temp_c}°C</b></span>
                <span>Avg Humidity: <b>{longTerm.avg_humidity_pct}%</b></span>
                <span>Annual Rain: <b>{longTerm.avg_rainfall_mm_annual}mm</b></span>
                <span>Kharif: <b>{longTerm.kharif_start_month}</b></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual inputs */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Soil Type</label>
          <select value={env.soil_type} onChange={e => update({ soil_type: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
            <option value="">Select soil type</option>
            {SOIL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Soil pH</label>
          <input type="number" min={0} max={14} step={0.1}
            value={env.soil_ph ?? ''} onChange={e => update({ soil_ph: parseFloat(e.target.value) || null })}
            placeholder="e.g. 6.5"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Irrigation Method</label>
          <select value={env.irrigation_method} onChange={e => update({ irrigation_method: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
            <option value="">Select method</option>
            {IRRIGATION.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Water Source</label>
          <select value={env.water_source} onChange={e => update({ water_source: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
            <option value="">Select source</option>
            {WATER_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|EnvironmentPanel"
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/crop/EnvironmentPanel.tsx
git commit -m "feat: add EnvironmentPanel component for crop feasibility"
```

---

### Task 8: CropResultCard component

**Files:**
- Create: `frontend/src/app/components/crop/CropResultCard.tsx`

**Interfaces:**
- Props: `{ result: CropResult }` where `CropResult` is defined in this file
- Exports: `CropResultCard`, `CropResult`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/app/components/crop/CropResultCard.tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, MapPin, Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../ui/utils';

export interface MatchRow {
  factor: string;
  current: string;
  optimal: string;
  status: 'good' | 'warning' | 'critical';
}

export interface CropResult {
  crop: string;
  score: number;
  feasibility: string;
  season: string;
  match_table: MatchRow[];
  yield_estimate: { best_kg: number; average_kg: number; worst_kg: number; cycles_per_year: number; growth_days: number };
  profitability: { market_price_per_kg: number; best_revenue_inr: number; average_revenue_inr: number; worst_revenue_inr: number } | null;
  alternatives: { crop: string; score: number; feasibility: string }[];
  suggested_regions: string[];
}

const FEASIBILITY_COLORS: Record<string, string> = {
  Excellent: 'bg-green-100 text-green-800',
  Good: 'bg-teal-100 text-teal-800',
  Challenging: 'bg-amber-100 text-amber-800',
  Difficult: 'bg-orange-100 text-orange-800',
  'Not Feasible': 'bg-red-100 text-red-700',
};

const SEASON_COLORS: Record<string, string> = {
  kharif: 'bg-sky-50 text-sky-700',
  rabi: 'bg-purple-50 text-purple-700',
  perennial: 'bg-green-50 text-green-700',
};

const STATUS_DOT: Record<string, string> = {
  good: '✓',
  warning: '⚠',
  critical: '✗',
};
const STATUS_COLOR: Record<string, string> = {
  good: 'text-green-600',
  warning: 'text-amber-500',
  critical: 'text-red-500',
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#0d9488' : score >= 40 ? '#d97706' : '#ef4444';
  const r = 22, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="text-sm font-bold text-slate-800 -mt-9 rotate-0">{score}</span>
      <span className="text-[9px] text-slate-400 mt-1">/100</span>
    </div>
  );
}

const fmtRs = (v: number) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${Math.round(v/1000)}k`;

export function CropResultCard({ result }: { result: CropResult }) {
  const [expanded, setExpanded] = useState(result.score >= 60);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          <ScoreGauge score={result.score} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900">{result.crop}</h3>
              <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                SEASON_COLORS[result.season] || 'bg-slate-100 text-slate-600')}>
                {result.season}
              </span>
              <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                FEASIBILITY_COLORS[result.feasibility] || 'bg-slate-100 text-slate-600')}>
                {result.feasibility}
              </span>
            </div>
            {result.yield_estimate?.average_kg != null && (
              <p className="text-xs text-slate-400 mt-0.5">
                Avg yield: {result.yield_estimate.average_kg} kg/year
                {result.profitability && ` · ${fmtRs(result.profitability.average_revenue_inr)}`}
              </p>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-5 pb-5 space-y-4 border-t border-slate-100">

              {/* Environmental match table */}
              {result.match_table.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-4 mb-2">
                    Environmental Match
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-left pb-1 font-medium">Factor</th>
                        <th className="text-left pb-1 font-medium">Current</th>
                        <th className="text-left pb-1 font-medium">Optimal</th>
                        <th className="text-left pb-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {result.match_table.map(row => (
                        <tr key={row.factor}>
                          <td className="py-1 text-slate-600">{row.factor}</td>
                          <td className="py-1 font-medium text-slate-800">{row.current}</td>
                          <td className="py-1 text-slate-500">{row.optimal}</td>
                          <td className={cn('py-1 font-semibold', STATUS_COLOR[row.status])}>
                            {STATUS_DOT[row.status]} {row.status === 'good' ? 'Good' : row.status === 'warning' ? 'Warning' : 'Critical'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Yield + Profitability */}
              {result.yield_estimate?.average_kg != null && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                      Yield Forecast
                    </p>
                    {(['best', 'average', 'worst'] as const).map(scenario => {
                      const kg = result.yield_estimate[`${scenario}_kg` as keyof typeof result.yield_estimate] as number;
                      const maxKg = result.yield_estimate.best_kg;
                      return (
                        <div key={scenario} className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs text-slate-500 w-14 capitalize">{scenario}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full"
                              style={{ width: `${(kg / maxKg) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 w-16 text-right">{kg} kg</span>
                        </div>
                      );
                    })}
                  </div>
                  {result.profitability && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                        Profitability · ₹{result.profitability.market_price_per_kg}/kg
                      </p>
                      {(['best', 'average', 'worst'] as const).map(scenario => (
                        <div key={scenario} className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500 capitalize">{scenario}</span>
                          <span className="font-semibold text-slate-800">
                            {fmtRs(result.profitability![`${scenario}_revenue_inr` as keyof typeof result.profitability] as number)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Not suitable section */}
              {result.score < 50 && (
                <div className="bg-red-50 rounded-lg p-4 space-y-3 border border-red-100">
                  {result.suggested_regions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <p className="text-xs font-semibold text-slate-600">{result.crop} performs well in:</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.suggested_regions.map(r => (
                          <span key={r} className="text-[11px] bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.alternatives.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sprout className="w-3.5 h-3.5 text-green-600" />
                        <p className="text-xs font-semibold text-slate-600">Better alternatives for your conditions:</p>
                      </div>
                      <div className="space-y-1">
                        {result.alternatives.map(alt => (
                          <div key={alt.crop} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-700 w-24">{alt.crop}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${alt.score}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-green-700 w-8 text-right">{alt.score}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|CropResultCard"
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/crop/CropResultCard.tsx
git commit -m "feat: add CropResultCard component"
```

---

### Task 9: CropFeasibility main page

**Files:**
- Create: `frontend/src/app/components/crop/CropFeasibility.tsx`

**Interfaces:**
- Props: `{ onNavigate?: (view: string) => void }`
- Consumes: `FarmSelector` from `'../ui/FarmSelector'`, `EnvironmentPanel`/`EnvironmentData`, `CropResultCard`/`CropResult`, `cropAPI`, `useStore`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/app/components/crop/CropFeasibility.tsx
import { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Leaf, Search, ChevronRight, Loader2, Sprout } from 'lucide-react';
import { useStore } from '../../store';
import { cropAPI } from '../../utils/api';
import { FarmSelector } from '../ui/FarmSelector';
import { EnvironmentPanel, EnvironmentData } from './EnvironmentPanel';
import { CropResultCard, CropResult } from './CropResultCard';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

type CropMode = 'choose' | 'suggest';
type SeasonTab = 'all' | 'kharif' | 'rabi' | 'perennial';

interface CropListItem {
  name: string;
  category: string;
  season: string;
  difficulty: string;
}

const DIFFICULTY_DOT: Record<string, string> = {
  easy: 'bg-green-400',
  medium: 'bg-amber-400',
  hard: 'bg-red-400',
};

export function CropFeasibility({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const selectedFarmId = useStore((s: any) => s.selectedFarmId);
  const farms = useStore((s: any) => s.farms);
  const selectedFarm = farms.find((f: any) => f.id === selectedFarmId);

  const [cropList, setCropList] = useState<CropListItem[]>([]);
  const [mode, setMode] = useState<CropMode>('choose');
  const [activeTab, setActiveTab] = useState<SeasonTab>('all');
  const [search, setSearch] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [envData, setEnvData] = useState<EnvironmentData | null>(null);
  const [results, setResults] = useState<CropResult[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Load crop list
  useEffect(() => {
    cropAPI.list().then(({ data }: any) => setCropList(data.crops || [])).catch(() => {});
  }, []);

  const filteredCrops = useMemo(() => {
    return cropList.filter(c => {
      const matchTab = activeTab === 'all' || c.season === activeTab;
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [cropList, activeTab, search]);

  const toggleCrop = (name: string) => {
    setSelectedCrops(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const runAnalysis = async () => {
    if (!selectedFarmId) return;
    setAnalyzing(true);
    setError('');
    setResults(null);
    try {
      const { data } = await cropAPI.analyzeFarm({
        farm_id: selectedFarmId,
        crops: mode === 'choose' ? selectedCrops : [],
        soil_type: envData?.soil_type || null,
        soil_ph: envData?.soil_ph || null,
        irrigation_method: envData?.irrigation_method || null,
        water_source: envData?.water_source || null,
        use_current_weather: true,
        temperature_override: envData?.temperature_override ?? null,
        humidity_override: envData?.humidity_override ?? null,
      });
      setResults(data.results || []);
    } catch (e: any) {
      setError(e?.message || 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const canAnalyze = !!selectedFarmId && (mode === 'suggest' || selectedCrops.length > 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Crop Feasibility</h1>
            <p className="text-xs text-slate-400 mt-0.5">Analyze crop suitability using live weather and ICAR agronomic data</p>
          </div>
        </div>
        <FarmSelector />
      </div>

      {!selectedFarmId ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <Sprout className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Select a farm to begin</p>
          <p className="text-xs text-slate-400 mt-1">Choose a farm from the dropdown above to load its data</p>
        </div>
      ) : (
        <>
          {/* Farm + Environment */}
          <div className="space-y-3">
            {selectedFarm && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">{selectedFarm.name}</span>
                <span className="text-slate-300">·</span>
                <span>{selectedFarm.system_type}</span>
                {selectedFarm.area_sqm && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{selectedFarm.area_sqm} m²</span>
                  </>
                )}
              </div>
            )}
            <EnvironmentPanel farmId={selectedFarmId} onChange={setEnvData} />
          </div>

          {/* Crop selection */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Crop Selection
              </p>
              <div className="flex rounded-full border border-slate-200 overflow-hidden text-xs">
                {(['choose', 'suggest'] as CropMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={cn('px-3 py-1 font-medium transition-colors capitalize',
                      mode === m ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50')}>
                    {m === 'choose' ? 'Choose crops' : 'Suggest best'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'choose' && (
              <>
                <div className="flex items-center gap-3">
                  {(['all','kharif','rabi','perennial'] as SeasonTab[]).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={cn('text-xs font-medium px-3 py-1 rounded-full capitalize transition-colors',
                        activeTab === tab ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100')}>
                      {tab}
                    </button>
                  ))}
                  <div className="relative ml-auto">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search crops…"
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 w-36" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {filteredCrops.map(crop => (
                    <button key={crop.name} onClick={() => toggleCrop(crop.name)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        selectedCrops.includes(crop.name)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-green-300'
                      )}>
                      <span className={cn('w-2 h-2 rounded-full', DIFFICULTY_DOT[crop.difficulty] || 'bg-slate-300')} />
                      {crop.name}
                    </button>
                  ))}
                </div>

                {selectedCrops.length > 0 && (
                  <p className="text-xs text-slate-500">{selectedCrops.length} crop{selectedCrops.length > 1 ? 's' : ''} selected</p>
                )}
              </>
            )}

            {mode === 'suggest' && (
              <p className="text-xs text-slate-500">
                We'll rank all crops by suitability for your farm's conditions and show the top 5.
              </p>
            )}
          </div>

          {/* Run Analysis button */}
          <button onClick={runAnalysis} disabled={!canAnalyze || analyzing}
            className={cn(
              'w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
              canAnalyze && !analyzing
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}>
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
            ) : (
              <><Leaf className="w-4 h-4" /> Run Feasibility Analysis</>
            )}
          </button>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {analyzing && (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-slate-100" />)}
            </div>
          )}

          {results && !analyzing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  {results.filter(r => r.score >= 60).length} of {results.length} crops well-suited for your farm
                </p>
                <button onClick={() => onNavigate?.('analytics')}
                  className="text-xs text-green-600 hover:text-green-700 flex items-center gap-0.5 font-semibold">
                  View Analytics <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {results.map(r => <CropResultCard key={r.crop} result={r} />)}
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/crop/CropFeasibility.tsx
git commit -m "feat: add CropFeasibility main page"
```

---

### Task 10: Wire navigation + view routing

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/components/layout/MainLayout.tsx`

**Interfaces:**
- Produces: `'crop-feasibility'` view accessible from Intelligence nav group

- [ ] **Step 1: Update App.tsx**

In `frontend/src/app/App.tsx`:

Add import:
```tsx
import { CropFeasibility } from './components/crop/CropFeasibility';
```

Update the `View` type (add `'crop-feasibility'`):
```tsx
type View = 'login' | 'register' | 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor' | 'crop-feasibility';
```

Add the view render inside the `<MainLayout>` block after the `ai-advisor` line:
```tsx
{currentView === 'crop-feasibility' && <CropFeasibility onNavigate={setCurrentView} />}
```

- [ ] **Step 2: Update MainLayout.tsx**

In `frontend/src/app/components/layout/MainLayout.tsx`, find the Intelligence nav group definition. It currently has `AI Advisor`. Add `Crop Feasibility` after it.

The nav items are likely defined as an array. Find where `ai-advisor` is defined and add after it:
```tsx
{ id: 'crop-feasibility', label: 'Crop Feasibility', icon: Leaf }
```

Add `Leaf` to the lucide-react import if not already present:
```tsx
import { ..., Leaf } from 'lucide-react';
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 4: Run all backend tests one final time**

```bash
cd backend && pytest -k "not Endpoint" -v 2>&1 | tail -10
```
Expected: 81+ tests pass, same pre-existing failures.

- [ ] **Step 5: Rebuild Docker to verify end-to-end**

```bash
docker compose up --build frontend
```

Open the app → verify "Crop Feasibility" appears under Intelligence in the sidebar → select a farm → environmental data auto-populates → select crops → Run Analysis → results appear.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/App.tsx frontend/src/app/components/layout/MainLayout.tsx
git commit -m "feat: wire Crop Feasibility into nav and App routing"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| IMD climate normals embedded | Task 1 |
| OPENWEATHER_API_KEY env var | Task 1 |
| 30+ Indian crops (ICAR data) | Task 2 |
| New fields on existing aquaponic crops | Task 2 |
| WeatherService: OpenWeatherMap + IMD fallback | Task 3 |
| Graceful degradation when key absent | Task 3 |
| `score_crop()` 0–100 with deductions | Task 4 |
| `build_match_table()` per-factor rows | Task 4 |
| `suggest_regions()` from knowledge base | Task 4 |
| `GET /crop/weather/{farm_id}` | Task 5 |
| `POST /crop/analyze-farm` with suggest mode | Task 5 |
| Profitability via INDIA_FALLBACK_PRICES | Task 5 |
| Alternatives for low-scoring crops | Task 5 |
| `cropAPI.weather` + `cropAPI.analyzeFarm` | Task 6 |
| EnvironmentPanel with editable overrides | Task 7 |
| CropResultCard with gauge, table, yield, alternatives | Task 8 |
| CropFeasibility page with choose/suggest modes | Task 9 |
| Intelligence nav entry "Crop Feasibility" | Task 10 |
| App.tsx routing for 'crop-feasibility' | Task 10 |
