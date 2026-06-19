# Farm Selection, Edit & Timeline — Design Spec
**Date:** 2026-06-20
**Status:** Approved for implementation

---

## 1. Problem

The platform today treats every completed survey as an independent record. Users with multiple farms have no way to view analytics per farm. Users who complete the same survey twice (same farm name) get duplicate records instead of updated data. Users who want to update their farm details after submission cannot — the only path is a full re-survey.

These three gaps prevent the platform from being a continuous farm management tool.

---

## 2. Goal

Transform the platform from a one-time survey tool into a dynamic farm management system where:

- Every farm has a persistent identity across multiple surveys and edits
- Analytics, recommendations, and financials always reflect the farm's **latest** data
- Every change (edit or re-survey) is preserved as a **snapshot** for historical analysis
- Users can **switch between farms** on Dashboard, Analytics, and Reports

---

## 3. Approach: Farm-as-Primary with Session History

The `farms` table is the anchor. Sessions are versions of a farm's data. The latest completed session for a farm drives all current analytics. All sessions for a farm form the timeline.

**No new tables required.** The existing schema (`farms`, `sessions`, `financial_plans`) already models this relationship — it just isn't enforced yet.

---

## 4. Data Model

### 4.1 Schema changes

None. The existing tables are sufficient:

- `farms(id, owner_id, name, location, system_type, metadata, ...)`
- `sessions(id, user_id, farm_id, status, context_data, completed_at, ...)`
- `financial_plans(id, farm_id, session_id, scenarios, ai_recommendations, ...)`

### 4.2 Farm identity contract

A farm is uniquely identified by `(owner_id, LOWER(name))`. The `pg_trgm` extension already installed supports the case-insensitive lookup.

### 4.3 Session–farm linking (deduplication)

**Trigger:** every time a session reaches `status = completed` (aquaponic or land survey).

**Algorithm:**
```
farm_name = session.context_data["answers"].get("farm_name") or "Untitled Project"

existing = SELECT * FROM farms
           WHERE owner_id = user_id
           AND LOWER(name) = LOWER(farm_name)
           LIMIT 1

if existing:
    session.farm_id = existing.id
    # Update farm metadata from latest answers (location, system_type, area)
else:
    farm = INSERT INTO farms (owner_id, name, location, system_type, ...)
    session.farm_id = farm.id
```

This replaces the partial implementation in `report.py:830` which only ran at PDF generation time. After this change, every completed session will always have a `farm_id`.

### 4.4 "Latest session" definition

```sql
SELECT * FROM sessions
WHERE farm_id = :farm_id
  AND status = 'completed'
ORDER BY completed_at DESC
LIMIT 1
```

No `is_latest` column needed — always computed at query time.

### 4.5 Edit sessions vs survey sessions

Edit-created sessions are distinguishable by `context_data["source"] = "edit"`. Survey sessions have `source = "survey"` (or absent). This field drives the "Edit" vs "Survey" badge in the timeline UI.

### 4.6 Backwards compatibility

Existing sessions with `farm_id = null` continue to work. The farm selector simply won't list them as named farms — they appear in "All Farms" aggregate view as before.

---

## 5. Backend API

### 5.1 Modified: session completion — `routers/session.py`

In the `submit_answer` endpoint, after `qe.is_complete(context)` is true, insert farm deduplication logic:

```python
async def _link_session_to_farm(sess, context, user_id, db):
    farm_name = (context.get("answers") or {}).get("farm_name") or "Untitled Project"
    result = await db.execute(
        select(Farm).where(
            Farm.owner_id == user_id,
            func.lower(Farm.name) == farm_name.strip().lower()
        ).limit(1)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        answers = context.get("answers", {})
        farm = Farm(
            owner_id=user_id,
            name=farm_name.strip(),
            location=str(answers.get("farm_location") or ""),
            system_type=str(answers.get("system_type") or "aquaponics"),
        )
        db.add(farm)
        await db.flush()
    sess.farm_id = farm.id
```

Same logic applied to `routers/land_survey.py` at its completion point.

### 5.2 Modified: analytics endpoints — `routers/report.py`

Both `GET /report/analytics` and `GET /report/dashboard` gain an optional `farm_id: Optional[str] = Query(None)` parameter.

When `farm_id` is provided:
- Filter `sessions` query to `Session.farm_id == farm_id`
- Filter `financial_plans` query to `FinancialPlan.farm_id == farm_id`
- Return the same response shape — no frontend structural changes needed

When `farm_id` is absent: current aggregate behavior, unchanged.

### 5.3 New: `GET /farm/{farm_id}/sessions`

Returns the timeline — all completed sessions for a farm, newest first.

```
Response:
[
  {
    "session_id": "uuid",
    "completed_at": "ISO8601",
    "survey_type": "ai" | "land",
    "source": "survey" | "edit",
    "roi_percent": float | null,
    "revenue": float,
    "cost": float,
    "profit": float
  },
  ...
]
```

Registered in the existing farms router.

### 5.4 New: `GET /farm/{farm_id}/latest-session`

Returns the most recent completed session_id for a farm.

```
Response:
{
  "session_id": "uuid",
  "survey_type": "ai" | "land",
  "completed_at": "ISO8601"
}
```

The frontend uses this to determine which `session_id` to pass to `GET /analysis/{session_id}` when switching farms.

### 5.5 New: `POST /farm/{farm_id}/edit`

Creates an edit snapshot. Accepts updated answers, generates a new completed session, runs financial recalculation.

```
Body:
{
  "answers": {
    "farm_name": "Chandan's Farm",
    "monthly_fish_revenue": 55000,
    "monthly_crop_revenue": 20000,
    ...
  },
  "survey_type": "ai" | "land"   // default: "ai"
}

Response:
{
  "session_id": "uuid",
  "farm_id": "uuid",
  "analysis": { ... }   // same shape as GET /analysis/{session_id}
}
```

**Internally:**
1. Verify `farm_id` belongs to `current_user`
2. Fetch latest session for context — copy its `context_data`, apply `body.answers` on top
3. Set `context_data["source"] = "edit"`
4. Create `Session(user_id, farm_id, status="completed", completed_at=now(), context_data=merged_context)`
5. For aquaponic: call `FinancialService.create_plan()`; for land: call `compute_land_financials()`
6. Return `session_id` + computed analysis

### 5.6 Existing endpoints unchanged

`GET /analysis/{session_id}`, `GET /report/{session_id}`, `POST /session/start`, `POST /session/answer` — no interface changes. The frontend passes the correct `session_id` (latest for selected farm); these endpoints work as-is.

---

## 6. Frontend

### 6.1 Zustand store additions — `store/index.js`

New `farmSlice`:

```js
farmSlice = (set, get) => ({
  farms: [],               // [{ id, name, system_type, latest_session_id }]
  selectedFarmId: localStorage.getItem(SELECTED_FARM_ID_KEY) || null,
  farmSessions: [],        // timeline entries for selected farm

  fetchFarms: async () => {
    const { data } = await farmAPI.list()
    set({ farms: data ?? [] })
  },

  selectFarm: async (farmId) => {
    if (farmId) {
      localStorage.setItem(SELECTED_FARM_ID_KEY, farmId)
    } else {
      localStorage.removeItem(SELECTED_FARM_ID_KEY)
    }
    set({ selectedFarmId: farmId, farmSessions: [] })
    if (farmId) {
      const { data } = await farmAPI.latestSession(farmId)
      if (data?.session_id) {
        await get().fetchAnalysis(data.session_id)
      }
    }
  },

  editFarm: async (farmId, answers, surveyType = 'ai') => {
    const { data } = await farmAPI.edit(farmId, { answers, survey_type: surveyType })
    if (data?.session_id) {
      localStorage.setItem(LAST_COMPLETED_SESSION_KEY, data.session_id)
      await get().fetchAnalysis(data.session_id)
    }
    return data
  },

  fetchFarmTimeline: async (farmId) => {
    const { data } = await farmAPI.sessions(farmId)
    set({ farmSessions: data ?? [] })
  },
})
```

### 6.2 API helper additions — `utils/api.js`

```js
export const farmAPI = {
  list:          ()                    => api.get('/farm/'),
  get:           (id)                  => api.get(`/farm/${id}`),
  latestSession: (farmId)              => api.get(`/farm/${farmId}/latest-session`),
  sessions:      (farmId)              => api.get(`/farm/${farmId}/sessions`),
  edit:          (farmId, body)        => api.post(`/farm/${farmId}/edit`, body),
}
```

### 6.3 New: `FarmSelector.tsx`

Location: `frontend/src/app/components/ui/FarmSelector.tsx`

A compact dropdown pill. Sits in the top-right of the page header on Dashboard, Analytics, and Reports.

- Options: "All Farms" (clears selection) + one entry per farm (sorted by name)
- Selected farm shown with a green dot indicator
- Loading skeleton while `farms` array is empty
- On select: calls `store.selectFarm(farmId)`
- When `selectedFarmId` is set, Dashboard/Analytics/Reports pass `farm_id` as a query param to their API calls

Props:
```tsx
interface FarmSelectorProps {
  className?: string
}
```

### 6.4 New: `FarmEditForm.tsx`

Location: `frontend/src/app/components/farms/FarmEditForm.tsx`

A slide-in panel (right side, `fixed inset-y-0 right-0 w-[420px]`) opened by an "Edit Farm Details" button on `FarmManagement.tsx`.

- Pre-populates fields from `store.analysis?.context_data?.answers`
- Sections: Basic Info / Financial Inputs / Revenue / (Fish section for aquaponic) / (Land section for land survey)
- Each field is a labeled input matching the original survey question
- Submit button: "Save & Recalculate" → calls `store.editFarm(farmId, answers)` → shows loading spinner → on success closes panel + shows toast "Farm updated. All analytics refreshed."
- Cancel button closes without saving

Fields are derived from the existing answer keys in `context_data.answers` — no new schema needed.

### 6.5 New: `FarmTimeline.tsx`

Location: `frontend/src/app/components/farms/FarmTimeline.tsx`

A vertical timeline rendered inside `FarmManagement.tsx` below the farm detail header.

Each entry:
- Date (relative: "3 months ago") + absolute date
- Badge: green "Survey" or blue "Edit"
- 3 metric chips: Revenue / ROI / Profit (colored by positive/negative)
- "Current" green pill on the most recent entry
- Clicking any entry calls `store.fetchAnalysis(sessionId)` to preview that snapshot

Empty state: "No history yet — complete a survey to start tracking this farm's evolution."

Loading: 3 skeleton rows.

### 6.6 Pages modified

| Page | Change |
|---|---|
| `Dashboard.tsx` | Add `<FarmSelector />` in header; pass `farm_id` to `reportAPI.dashboard()` |
| `Analytics.tsx` | Add `<FarmSelector />` in header; pass `farm_id` to `reportAPI.analytics()` |
| `Reports.tsx` | Add `<FarmSelector />` in header; filter history list by selected farm |
| `FarmManagement.tsx` | Add `<FarmTimeline />` + "Edit Farm Details" button → opens `<FarmEditForm />` |

---

## 7. Key Flows

### Flow A: Survey completion with auto-deduplication
```
User completes survey → session.status = 'completed'
→ _link_session_to_farm() runs
  → LOWER(farm_name) matched against existing farms
  → Existing farm found → session.farm_id = farm.id
  → OR new farm created → session.farm_id = new_farm.id
→ FinancialPlan created, linked to farm + session
→ Frontend receives completed session → fetchAnalysis(session_id)
→ localStorage: SELECTED_FARM_ID_KEY = farm_id
```

### Flow B: Farm edit → recalculation
```
User opens FarmEditForm → edits "monthly_fish_revenue: 55000"
→ Clicks "Save & Recalculate"
→ POST /farm/{id}/edit { answers: {...} }
→ Backend: new Session created (source="edit"), FinancialService.create_plan()
→ Response: { session_id, analysis }
→ Frontend: fetchAnalysis(session_id) → all charts/KPIs refresh
→ Toast: "Farm updated. All analytics refreshed."
```

### Flow C: Farm selection on Dashboard
```
User selects "Chandan's Farm" from FarmSelector dropdown
→ store.selectFarm(farmId)
→ GET /farm/{farmId}/latest-session → { session_id }
→ fetchAnalysis(session_id) → analysis updates in store
→ Dashboard re-renders: reportAPI.dashboard(farm_id=farmId)
→ All KPIs, charts, insights now show only Chandan's Farm data
```

### Flow D: Timeline view
```
User navigates to Farm Management → selects "Chandan's Farm"
→ store.fetchFarmTimeline(farmId)
→ GET /farm/{farmId}/sessions → [ {Jan survey, Apr survey, Jun edit} ]
→ FarmTimeline renders vertical list, "Current" badge on latest
→ User clicks "Apr survey" entry
→ fetchAnalysis(apr_session_id) → Analytics page previews April snapshot
```

---

## 8. Error & Edge Cases

| Case | Behavior |
|---|---|
| Farm with no sessions yet | `GET /farm/{id}/latest-session` returns 404; frontend shows "Complete a survey for this farm" empty state |
| Edit submitted with missing required fields | Backend validates presence of key financial fields; returns 422 with field-level errors |
| Two farms with similar names ("X Farm" vs "x farm") | LOWER() match catches this — links to existing farm, not a new one |
| User has no farms yet | FarmSelector shows only "All Farms" option |
| Land survey vs aquaponic survey same farm name | Allowed — both link to the same farm record; timeline shows both with type badges |
| Session with `farm_id = null` (legacy) | Excluded from farm-specific views; still appears in "All Farms" aggregate |

---

## 9. Out of Scope

- Merging two separate farm records (rename "X Farm" to match "Y Farm")
- Comparing two farms side-by-side
- Farm deletion (separate concern, not requested)
- Real-time collaborative editing
