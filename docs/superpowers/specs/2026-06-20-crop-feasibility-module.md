# Crop Feasibility Module — Design Spec
**Date:** 2026-06-20
**Status:** Approved for implementation

---

## 1. Problem

Crop feasibility analysis currently only runs once at aquaponic survey completion and is buried inside the session context. Users cannot:
- Run feasibility analysis on demand for any crop at any time
- Evaluate crops for a specific farm without submitting a new survey
- Get environmental suitability based on live weather or climate normals
- Understand why a crop is unsuitable or what to grow instead

---

## 2. Goal

Create a dedicated **Crop Feasibility Module** accessible from the Intelligence nav group that allows users to:
- Select a farm and analyze any crop against real environmental conditions
- Auto-fetch current weather via OpenWeatherMap (fallback to IMD static data)
- Get a numeric suitability score, environmental match table, yield forecast (3 scenarios), and profitability estimate
- Receive alternative crop recommendations and suitable Indian regions when a crop scores below 50

---

## 3. Approach: Layered Enhancement

Extend the existing `CropIntelligenceService` (deterministic rule-based, no LLM) with new environmental parameters. Add a `WeatherService` for OpenWeatherMap + IMD static fallback. Expand the crop knowledge base with 30+ Indian Kharif/Rabi crops sourced from ICAR data. Add two new backend endpoints and three new frontend components.

---

## 4. Data Layer

### 4.1 Expanded Crop Knowledge Base

**File:** `backend/data/crop_knowledge_base.json`

Each crop record gains 5 new fields:

```json
{
  "name": "Ragi",
  "category": "Cereal",
  "season": "kharif",
  "temperature_range": { "min": 15, "max": 35, "optimal_min": 20, "optimal_max": 30 },
  "humidity_range": { "min": 40, "max": 80 },
  "rainfall_mm_annual": { "min": 500, "max": 1500 },
  "soil_types": ["Red", "Sandy Loam", "Laterite"],
  "suitable_indian_states": ["Karnataka", "Andhra Pradesh", "Tamil Nadu", "Uttarakhand"],
  "water_requirement": "low",
  "ph_range": { "min": 5.5, "max": 7.5 },
  "yield_per_m2_kg": 0.35,
  "cycles_per_year": 1,
  "growth_days": 120,
  "min_area_m2": 200,
  "optimal_area_m2": 1000,
  "difficulty": "easy",
  "system_types": ["open_field", "raised_bed"],
  "notes": "Drought-tolerant. Preferred in rain-shadow regions of Karnataka."
}
```

**New crops added:**

*Kharif (sown Jun–Jul, harvested Oct–Nov):*
- Rice (Paddy), Maize, Groundnut, Soybean, Bajra (Pearl Millet), Jowar (Sorghum), Arhar/Tur Dal (Pigeon Pea), Moong (Green Gram), Ragi (Finger Millet), Sunflower, Cotton

*Rabi (sown Nov–Dec, harvested Mar–Apr):*
- Wheat, Barley, Gram/Chana, Mustard/Rapeseed, Lentil (Masur), Peas, Potato

*Other/Perennial:*
- Banana, Sugarcane, Turmeric, Ginger, Tomato, Onion, Garlic

*Existing aquaponic crops:* retain all, add missing new fields (humidity_range, rainfall_mm_annual, suitable_indian_states).

All yield, pH, temperature, and area parameters sourced from ICAR crop production guides and FAO 589.

### 4.2 IMD Climate Normals

**File:** `backend/data/imd_climate_normals.json`

Embedded 30-year climate normals from India Meteorological Department, keyed by state name. Covers all 28 states + major UTs.

```json
{
  "Karnataka": {
    "avg_temp_c": 26.5,
    "avg_humidity_pct": 68,
    "avg_rainfall_mm_annual": 1250,
    "kharif_start_month": "June",
    "rabi_start_month": "November"
  },
  "Punjab": {
    "avg_temp_c": 24.1,
    "avg_humidity_pct": 62,
    "avg_rainfall_mm_annual": 650,
    "kharif_start_month": "June",
    "rabi_start_month": "October"
  }
}
```

Used as fallback when OpenWeatherMap key is absent or API call fails. Also shown as "Long-term average" reference column in the frontend.

### 4.3 Weather Service

**File:** `backend/services/weather_service.py`

```python
@dataclass
class WeatherData:
    source: str          # "openweathermap" | "imd_static"
    temperature_c: float
    humidity_pct: float
    rainfall_mm_recent: float   # mm in last 24h (openweathermap) or monthly avg / 30 (imd)
    rainfall_mm_annual: float   # imd long-term annual average
    state: str | None           # extracted from location string

async def fetch_farm_weather(location: str) -> WeatherData:
    """
    1. Extract state from location string (e.g. "Bengaluru, Karnataka" → "Karnataka")
    2. Try OpenWeatherMap if OPENWEATHER_API_KEY is set
    3. On failure or missing key: return IMD static data for the state
    4. Always include imd_long_term alongside current data
    """
```

State extraction: simple string matching against the 28 state names / common aliases (e.g. "Bangalore" → "Karnataka"). No geocoding API required.

---

## 5. Backend API

### 5.1 CropIntelligenceService Extensions

**File:** `backend/services/crop_intelligence_service.py`

**`evaluate_crop()` — extended signature:**

```python
def evaluate_crop(
    self,
    crop_name: str,
    area_m2: float,
    temperature_c: float | None = None,
    ph: float | None = None,
    system_type: str | None = None,
    humidity_pct: float | None = None,        # new
    rainfall_mm_annual: float | None = None,  # new
    soil_type: str | None = None,             # new
) -> dict[str, Any]:
```

New return fields: `score` (int 0–100), `match_table` (list of factor rows), `yield_scenarios` (best/average/worst), `suggested_regions` (list of states, only when score < 50), `alternatives` (top 3 feasible crops, only when score < 50).

**`score_crop()` — new method:**

Numeric scoring engine. Base score = 100, deductions applied per factor:

| Factor | Condition | Deduction |
|--------|-----------|-----------|
| Temperature | Within optimal range | 0 |
| Temperature | Outside optimal, within absolute | −15 |
| Temperature | Outside absolute range | −40 |
| Humidity | Outside range | −15 |
| Rainfall | Outside range | −15 |
| pH | Outside optimal | −20 |
| Soil type | Not in recommended list | −10 |
| Area | Below minimum | −30 |
| Area | Below optimal (above minimum) | −10 |

Score clamped to [0, 100]. Maps to label: 80–100 = Excellent, 60–79 = Good, 40–59 = Challenging, 20–39 = Difficult, 0–19 = Not Feasible.

**`suggest_regions()` — new method:**

```python
def suggest_regions(self, crop_name: str) -> list[str]:
    crop = self.get_crop(crop_name)
    return crop.get("suitable_indian_states", []) if crop else []
```

**`build_match_table()` — new private method:**

Returns list of `{ factor, current, optimal, status }` dicts for the environmental match table shown in the UI. Status: "good" | "warning" | "critical".

**Yield scenarios:**
- Best: `yield_per_m2 × area × cycles × 1.2`
- Average: `yield_per_m2 × area × cycles`
- Worst: `yield_per_m2 × area × cycles × 0.7`

### 5.2 New Endpoints in `backend/routers/crop.py`

**`GET /crop/weather/{farm_id}`**

Requires JWT auth + DB access. Fetches the farm record, calls `weather_service.fetch_farm_weather(farm.location)`, returns both current and long-term data.

```json
{
  "current": {
    "source": "openweathermap",
    "temperature_c": 32.1,
    "humidity_pct": 67,
    "rainfall_mm_recent": 12.4
  },
  "long_term": {
    "source": "imd_static",
    "state": "Karnataka",
    "avg_temp_c": 26.5,
    "avg_humidity_pct": 68,
    "avg_rainfall_mm_annual": 1250
  }
}
```

**`POST /crop/analyze-farm`**

Requires JWT auth. Body:

```json
{
  "farm_id": "uuid",
  "crops": ["Ragi", "Maize"],
  "soil_type": "Red Laterite",
  "soil_ph": 6.2,
  "irrigation_method": "Drip",
  "water_source": "Borewell",
  "use_current_weather": true
}
```

When `crops` is empty or absent: runs `suggest_crops()` returning top 5 ranked.

Internal flow:
1. Fetch farm → `area_m2`, `location`, `system_type`
2. Fetch weather (current or IMD based on `use_current_weather` and key availability)
3. For each crop: `score_crop()` + `build_match_table()` + yield scenarios + profitability via `land_market_price_service`
4. For crops scoring < 50: add `suggested_regions` + top 3 `alternatives` (feasible crops for same conditions)

Response:
```json
{
  "farm": { "name": "Chandan's Farm", "area_m2": 500, "location": "Bengaluru, Karnataka" },
  "environment": {
    "temperature_c": 32.1, "humidity_pct": 67,
    "rainfall_mm_annual": 1250, "soil_type": "Red Laterite",
    "soil_ph": 6.2, "weather_source": "openweathermap"
  },
  "results": [
    {
      "crop": "Ragi",
      "score": 84,
      "feasibility": "Excellent",
      "season": "kharif",
      "match_table": [
        { "factor": "Temperature", "current": "32°C", "optimal": "20–30°C", "status": "warning" },
        { "factor": "Humidity",    "current": "67%",  "optimal": "40–80%",  "status": "good" },
        { "factor": "Rainfall",    "current": "1250mm","optimal": "500–1500mm","status": "good" },
        { "factor": "Soil pH",     "current": "6.2",  "optimal": "5.5–7.5", "status": "good" },
        { "factor": "Soil Type",   "current": "Red Laterite","optimal": "Red/Laterite","status": "good" }
      ],
      "yield_estimate": {
        "best_kg": 210, "average_kg": 175, "worst_kg": 122,
        "cycles_per_year": 1, "growth_days": 120
      },
      "profitability": {
        "market_price_per_kg": 38,
        "best_revenue_inr": 7980,
        "average_revenue_inr": 6650,
        "worst_revenue_inr": 4636
      },
      "alternatives": [],
      "suggested_regions": []
    }
  ]
}
```

### 5.3 Environment Variable

`OPENWEATHER_API_KEY` added to `.env.example` with placeholder. System degrades gracefully to IMD static when absent.

---

## 6. Frontend

### 6.1 Navigation

`MainLayout.tsx` — add to Intelligence nav group:

```
INTELLIGENCE
  AI Advisor      (existing)
  Crop Feasibility (new — icon: Leaf, view: 'crop-feasibility')
```

### 6.2 New Files

- `frontend/src/app/components/crop/CropFeasibility.tsx` — main page
- `frontend/src/app/components/crop/CropResultCard.tsx` — per-crop result card
- `frontend/src/app/components/crop/EnvironmentPanel.tsx` — weather + soil input panel

### 6.3 Page Layout — `CropFeasibility.tsx`

Single-page, three stacked sections. Results section is hidden until "Run Analysis" is clicked.

**Section A — Farm & Environment**

Farm selector at top (reuses existing `FarmSelector` component). On farm select: auto-calls `GET /crop/weather/{farm_id}`, pre-populates weather fields with a loading skeleton.

`EnvironmentPanel` component below:
- Left column — *Current Conditions*: Temperature, Humidity, Recent Rainfall. Each field shows auto-fetched value + source badge (green "OpenWeatherMap" or amber "IMD Static"). Each field has a pencil icon to override the value manually.
- Right column — *Long-term Averages (IMD)*: Annual avg temp, humidity, annual rainfall for the state. Read-only reference, labelled "30-year IMD climate normals."
- Manual inputs (always required): Soil Type (dropdown), Soil pH (number 0–14), Irrigation Method (dropdown), Water Source (dropdown).

Soil Type options: Loamy, Clay, Sandy, Red Laterite, Black Cotton Soil, Alluvial
Irrigation options: Drip, Flood, Sprinkler, Rainfed
Water Source options: Borewell, River, Canal, Rainwater

**Section B — Crop Selection**

Two modes toggled by a pill:
- **"Choose crops"** — multi-select chip grid, grouped by tabs: Kharif | Rabi | Aquaponic | All. Search box filters by name. Each chip shows difficulty dot (green=easy, amber=medium, red=hard).
- **"Suggest best crops"** — skips manual selection; API runs `suggest_crops()` for the farm's conditions.

"Run Analysis" button (green, full-width) appears at the bottom of this section. Disabled until a farm is selected.

**Section C — Results** (animates in after API response)

Summary pill: `"3 of 5 crops are well-suited for your farm conditions"`

`CropResultCard` per crop, sorted by score descending.

### 6.4 `CropResultCard.tsx`

Card structure:
```
┌─ [RAGI] ─── [Kharif] ─── [Excellent] ──────────── Score: 84/100 ─┐
│                                                                     │
│  ENVIRONMENTAL MATCH                                                │
│  Factor      Current   Optimal      Status                         │
│  Temperature  32°C      20–30°C     ⚠ Warning                     │
│  Humidity     67%       40–80%      ✓ Good                        │
│  Rainfall     1250mm    500–1500mm  ✓ Good                        │
│  Soil pH      6.2       5.5–7.5    ✓ Good                        │
│  Soil Type    Red Lat.  Red/Lat.   ✓ Good                        │
│                                                                     │
│  YIELD FORECAST (500 m²)         PROFITABILITY                     │
│  Best:    210 kg  ████████████   Best:    ₹7,980                  │
│  Average: 175 kg  ██████████     Average: ₹6,650                  │
│  Worst:   122 kg  ███████        Worst:   ₹4,636                  │
└─────────────────────────────────────────────────────────────────────┘
```

Score gauge: circular arc, colored by range (green ≥ 80, amber 50–79, red < 50).

Feasibility badge colors: Excellent = green, Good = teal, Challenging = amber, Difficult = orange, Not Feasible = red.

**When score < 50 — expanded section inside card:**

```
❌ Why this crop isn't ideal here
  • Temperature 32°C exceeds Cotton's optimal range (20–27°C)
  • Soil type Red Laterite not recommended for Cotton

📍 Cotton performs well in:
  Gujarat  |  Maharashtra  |  Telangana  |  Punjab

✅ Better alternatives for your conditions
  Ragi       84%  ████████████████████  [View →]
  Maize      79%  ████████████████      [View →]
  Groundnut  71%  ██████████████        [View →]
```

---

## 7. Data Flow

```
User selects farm
  → GET /crop/weather/{farm_id}
    → WeatherService.fetch_farm_weather(farm.location)
      → OpenWeatherMap API (if key present)
      → fallback: IMD static by state
  → EnvironmentPanel pre-populated

User fills soil inputs → selects crops → Run Analysis
  → POST /crop/analyze-farm
    → Farm lookup (DB)
    → WeatherService (cached from previous call or fresh)
    → CropIntelligenceService.score_crop() × N crops
    → land_market_price_service.fetch_price() × N crops
    → For score < 50: suggest_regions() + suggest_crops() for alternatives
  → Results section renders
```

---

## 8. Error & Edge Cases

| Case | Behavior |
|---|---|
| No OpenWeatherMap key | Falls back to IMD static; source badge shows "IMD Static (amber)" |
| OpenWeatherMap API down | Falls back to IMD static; no error shown to user |
| Farm has no location set | Warning: "Add a location to your farm to enable auto-fetch"; environmental fields still editable manually |
| Crop not in knowledge base | Returns `feasibility: "unknown"` with suggestion to check spelling; lists all known crops |
| Farm area = 0 | Validation error before API call; user prompted to complete farm profile |
| `crops` list empty in POST body | Runs `suggest_crops()` mode returning top 5 |
| `land_market_price_service` returns no price | Profitability section hidden; yield still shown |

---

## 9. Out of Scope

- Aquaponics Intelligence Module (fish/water quality recommendations) — separate spec
- Historical feasibility report saving (can be added later via sessions)
- Multi-farm comparison in one analysis run
- Live soil sensor integration
- Satellite imagery / NDVI data
