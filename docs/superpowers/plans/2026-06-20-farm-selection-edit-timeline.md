# Farm Selection, Edit & Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the platform from a one-time survey tool into a dynamic farm management system with per-farm analytics, edit history, and timeline view.

**Architecture:** Every completed session is auto-linked to a farm record by name (case-insensitive). The most recent completed session for a farm drives all analytics. Each edit or re-survey creates a new session snapshot, forming the timeline. A `FarmSelector` dropdown on Dashboard/Analytics/Reports filters all views to the selected farm.

**Tech Stack:** Python 3.12, FastAPI, async SQLAlchemy, PostgreSQL 16, React 18 + TypeScript, Zustand, Tailwind v4, Recharts, motion/react, Lucide icons.

## Global Constraints

- No new database tables — existing `farms`, `sessions`, `financial_plans` schema is sufficient
- All new backend endpoints require JWT auth via `Depends(get_current_user)`
- `farm_id` ownership must always be validated: `Farm.owner_id == current_user.id`
- All analytics/dashboard endpoints remain backwards compatible when `farm_id` param is absent
- Frontend imports `motion` from `'motion/react'` (not `'framer-motion'`)
- Frontend `cn()` utility imported from `'../ui/utils'`
- Run backend tests with: `cd backend && pytest -k "not Endpoint" -v`
- Run frontend type-check with: `cd frontend && npm run build`

---

## File Map

**Created:**
- `backend/services/farm_link_service.py` — farm deduplication logic (shared by session + land_survey routers)
- `backend/tests/test_farm_link_service.py` — unit tests for deduplication
- `backend/tests/test_farm_endpoints.py` — integration tests for new farm endpoints
- `frontend/src/app/components/ui/FarmSelector.tsx` — farm dropdown pill
- `frontend/src/app/components/farms/FarmTimeline.tsx` — vertical snapshot timeline
- `frontend/src/app/components/farms/FarmEditForm.tsx` — slide-in edit panel

**Modified:**
- `backend/routers/session.py` — call `link_session_to_farm` at aquaponic completion
- `backend/routers/land_survey.py` — call `link_session_to_farm` at all 3 land completion points
- `backend/routers/farm.py` — add `/sessions`, `/latest-session`, `/edit` endpoints
- `backend/routers/report.py` — add `farm_id` query param to `analytics` + `dashboard`
- `frontend/src/app/utils/api.js` — add `latestSession`, `sessions`, `edit` to `farmAPI`
- `frontend/src/app/store/index.js` — add `farmSlice`
- `frontend/src/app/components/dashboard/Dashboard.tsx` — add `FarmSelector`, pass `farm_id`
- `frontend/src/app/components/analytics/Analytics.tsx` — add `FarmSelector`, pass `farm_id`
- `frontend/src/app/components/reports/Reports.tsx` — add `FarmSelector`, filter by farm
- `frontend/src/app/components/farms/FarmManagement.tsx` — add `FarmTimeline` + edit button

---

### Task 1: Farm link service (deduplication)

**Files:**
- Create: `backend/services/farm_link_service.py`
- Create: `backend/tests/test_farm_link_service.py`

**Interfaces:**
- Produces: `async def link_session_to_farm(sess: Session, context: dict, user_id: str, db: AsyncSession) -> Farm`
  - `sess` — SQLAlchemy Session ORM object with `farm_id` attribute
  - `context` — `session.context_data` dict; reads `context["answers"]["farm_name"]`
  - Mutates `sess.farm_id` in place; creates Farm record if needed
  - Returns the Farm that was found or created

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_farm_link_service.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from services.farm_link_service import link_session_to_farm


def _make_sess(farm_id=None):
    sess = MagicMock()
    sess.farm_id = farm_id
    return sess


def _make_context(farm_name="Test Farm", extra=None):
    ctx = {"answers": {"farm_name": farm_name, "farm_location": "Bengaluru", "system_type": "aquaponics"}}
    if extra:
        ctx.update(extra)
    return ctx


@pytest.mark.asyncio
async def test_creates_new_farm_when_none_exists():
    """Should insert a new Farm and set sess.farm_id."""
    sess = _make_sess()
    context = _make_context("Brand New Farm")
    db = AsyncMock()

    new_farm = MagicMock()
    new_farm.id = "farm-uuid-1"

    # Simulate no existing farm found
    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=no_result)
    db.flush = AsyncMock()

    with patch("services.farm_link_service.Farm") as MockFarm:
        MockFarm.return_value = new_farm
        result = await link_session_to_farm(sess, context, "user-1", db)

    db.add.assert_called_once_with(new_farm)
    db.flush.assert_called()
    assert sess.farm_id == "farm-uuid-1"
    assert result == new_farm


@pytest.mark.asyncio
async def test_links_to_existing_farm_case_insensitive():
    """Should find 'test farm' when existing Farm.name = 'Test Farm'."""
    sess = _make_sess()
    context = _make_context("test farm")  # lowercase — should still match
    db = AsyncMock()

    existing_farm = MagicMock()
    existing_farm.id = "farm-existing"

    found_result = MagicMock()
    found_result.scalar_one_or_none.return_value = existing_farm
    db.execute = AsyncMock(return_value=found_result)

    result = await link_session_to_farm(sess, context, "user-1", db)

    db.add.assert_not_called()
    assert sess.farm_id == "farm-existing"
    assert result == existing_farm


@pytest.mark.asyncio
async def test_uses_untitled_project_when_name_missing():
    """Should fall back to 'Untitled Project' when farm_name is absent."""
    sess = _make_sess()
    context = {"answers": {}}
    db = AsyncMock()

    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=no_result)
    db.flush = AsyncMock()

    with patch("services.farm_link_service.Farm") as MockFarm:
        created = MagicMock()
        created.id = "farm-untitled"
        MockFarm.return_value = created
        await link_session_to_farm(sess, context, "user-1", db)

    call_kwargs = MockFarm.call_args.kwargs
    assert call_kwargs["name"] == "Untitled Project"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && pytest tests/test_farm_link_service.py -v
```
Expected: `ImportError` or `ModuleNotFoundError` — `farm_link_service` does not exist yet.

- [ ] **Step 3: Write the service**

```python
# backend/services/farm_link_service.py
"""
farm_link_service.py — Links a completed session to a Farm record.

Called at session completion for both aquaponic and land surveys.
Deduplicates by (owner_id, LOWER(name)).
"""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Farm, Session


async def link_session_to_farm(
    sess: Session,
    context: dict,
    user_id: str,
    db: AsyncSession,
) -> Farm:
    """
    Find or create a Farm matching the farm_name in context answers,
    then set sess.farm_id.

    Mutates sess.farm_id in place. Caller must flush/commit.
    Returns the Farm record (existing or newly created).
    """
    answers = context.get("answers") or {}
    farm_name = str(answers.get("farm_name") or "Untitled Project").strip() or "Untitled Project"

    result = await db.execute(
        select(Farm).where(
            Farm.owner_id == user_id,
            func.lower(Farm.name) == farm_name.lower(),
        ).limit(1)
    )
    farm = result.scalar_one_or_none()

    if not farm:
        farm = Farm(
            owner_id=user_id,
            name=farm_name,
            location=str(answers.get("farm_location") or "").strip(),
            system_type=str(answers.get("system_type") or "aquaponics").strip() or "aquaponics",
            description="Auto-created from completed survey",
        )
        db.add(farm)
        await db.flush()

    sess.farm_id = farm.id
    return farm
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && pytest tests/test_farm_link_service.py -v
```
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/farm_link_service.py backend/tests/test_farm_link_service.py
git commit -m "feat: add farm deduplication service"
```

---

### Task 2: Wire deduplication into aquaponic session completion

**Files:**
- Modify: `backend/routers/session.py` (around line 193 — the `qe.is_complete(context)` block)

**Interfaces:**
- Consumes: `link_session_to_farm(sess, context, user_id, db)` from Task 1

- [ ] **Step 1: Add the import and call in `submit_answer`**

In `backend/routers/session.py`, find the block starting with `if qe.is_complete(context):` (around line 193). Add the farm link call **after** the existing crop intelligence block:

```python
# Add import at top of file (after existing imports):
from services.farm_link_service import link_session_to_farm

# Inside submit_answer, after the crop_intelligence block ends,
# still inside `if qe.is_complete(context):`:

        # Link session to farm (deduplication by name)
        try:
            await link_session_to_farm(sess, context, str(current_user.id), db)
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "Farm linking failed; skipping.", exc_info=True
            )
```

The full `if qe.is_complete(context):` block in `submit_answer` should look like:

```python
    if qe.is_complete(context):
        sess.status = "completed"
        sess.completed_at = datetime.now(timezone.utc)
        try:
            from services.crop_intelligence_service import CropIntelligenceService
            crop_result = CropIntelligenceService().evaluate_session(context)
            if crop_result.get("evaluated"):
                context["crop_intelligence"] = crop_result
                sess.context_data = context
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "Crop intelligence evaluation failed; skipping.", exc_info=True
            )
        # Link session to farm (deduplication by name)
        try:
            await link_session_to_farm(sess, context, str(current_user.id), db)
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "Farm linking failed; skipping.", exc_info=True
            )
```

- [ ] **Step 2: Verify the backend starts cleanly**

```bash
cd backend && python -c "from routers.session import router; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Run existing session tests to confirm nothing broke**

```bash
cd backend && pytest -k "session" -v
```
Expected: all pass (or same as before this change).

- [ ] **Step 4: Commit**

```bash
git add backend/routers/session.py
git commit -m "feat: auto-link aquaponic session to farm on completion"
```

---

### Task 3: Wire deduplication into land survey completion

**Files:**
- Modify: `backend/routers/land_survey.py`

Land survey has **three** completion points where `sess.status = "completed"` is set. All three need the farm link call.

**Interfaces:**
- Consumes: `link_session_to_farm(sess, context, user_id, db)` from Task 1

- [ ] **Step 1: Add the import**

At the top of `backend/routers/land_survey.py`, add:

```python
from services.farm_link_service import link_session_to_farm
```

- [ ] **Step 2: Add the call at all three completion points**

Search for every occurrence of `sess.status = "completed"` in `land_survey.py`. After each one (and after `sess.completed_at = datetime.now(timezone.utc)`), add:

```python
        try:
            await link_session_to_farm(sess, context, str(current_user.id), db)
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "Farm linking failed for land survey; skipping.", exc_info=True
            )
```

There are three such blocks (approximately lines 258–261, 328–330, 375–377). Add the try/except after each.

- [ ] **Step 3: Verify no import errors**

```bash
cd backend && python -c "from routers.land_survey import router; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/land_survey.py
git commit -m "feat: auto-link land survey session to farm on completion"
```

---

### Task 4: Farm timeline and latest-session endpoints

**Files:**
- Modify: `backend/routers/farm.py`
- Create: `backend/tests/test_farm_endpoints.py`

**Interfaces:**
- Produces:
  - `GET /farm/{farm_id}/sessions` → `list[dict]` with keys: `session_id, completed_at, survey_type, source, roi_percent, revenue, cost, profit`
  - `GET /farm/{farm_id}/latest-session` → `dict` with keys: `session_id, survey_type, completed_at`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_farm_endpoints.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone


def _make_farm(farm_id="farm-1", owner_id="user-1"):
    f = MagicMock()
    f.id = farm_id
    f.owner_id = owner_id
    f.name = "Test Farm"
    return f


def _make_session(session_id="sess-1", farm_id="farm-1", survey_type="ai"):
    s = MagicMock()
    s.id = session_id
    s.farm_id = farm_id
    s.status = "completed"
    s.completed_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    s.context_data = {"answers": {"farm_name": "Test Farm"}, "source": "survey"}
    if survey_type == "land":
        s.context_data["module"] = "land_farm_voice"
    return s


@pytest.mark.asyncio
async def test_farm_sessions_returns_timeline():
    """GET /farm/{id}/sessions returns all completed sessions newest-first."""
    from routers.farm import farm_sessions

    sess_a = _make_session("s1", survey_type="ai")
    sess_b = _make_session("s2", survey_type="land")
    sess_b.completed_at = datetime(2026, 6, 1, tzinfo=timezone.utc)

    db = AsyncMock()
    farm_result = MagicMock()
    farm_result.scalar_one_or_none.return_value = _make_farm()
    sessions_result = MagicMock()
    sessions_result.scalars.return_value.all.return_value = [sess_b, sess_a]
    db.execute = AsyncMock(side_effect=[farm_result, sessions_result])

    user = MagicMock()
    user.id = "user-1"

    result = await farm_sessions("farm-1", current_user=user, db=db)
    assert len(result) == 2
    assert result[0]["session_id"] == "s2"  # newest first


@pytest.mark.asyncio
async def test_latest_session_returns_most_recent():
    """GET /farm/{id}/latest-session returns the newest completed session."""
    from routers.farm import farm_latest_session

    sess = _make_session("s-latest")
    db = AsyncMock()
    farm_result = MagicMock()
    farm_result.scalar_one_or_none.return_value = _make_farm()
    latest_result = MagicMock()
    latest_result.scalar_one_or_none.return_value = sess
    db.execute = AsyncMock(side_effect=[farm_result, latest_result])

    user = MagicMock()
    user.id = "user-1"

    result = await farm_latest_session("farm-1", current_user=user, db=db)
    assert result["session_id"] == "s-latest"
    assert result["survey_type"] == "ai"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && pytest tests/test_farm_endpoints.py::test_farm_sessions_returns_timeline tests/test_farm_endpoints.py::test_latest_session_returns_most_recent -v
```
Expected: `ImportError` — functions not defined yet.

- [ ] **Step 3: Add the two endpoints to `farm.py`**

Add the following to `backend/routers/farm.py` after the existing `create_water_reading` endpoint. Add the missing imports at the top of the file:

```python
# Add to imports at top of farm.py:
from sqlalchemy import select, func
from services.financial_service import FinancialService, FinancialInputs
from services.land_financial_service import compute_land_financials
```

Then add these two endpoints:

```python
@router.get("/{farm_id}/sessions")
async def farm_sessions(
    farm_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all completed sessions for a farm, newest first (timeline)."""
    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    sessions_result = await db.execute(
        select(Session)
        .where(Session.farm_id == farm.id, Session.status == "completed")
        .order_by(Session.completed_at.desc())
    )
    sessions = sessions_result.scalars().all()

    rows = []
    for sess in sessions:
        context = sess.context_data or {}
        is_land = context.get("module") == "land_farm_voice"
        source = context.get("source", "survey")

        revenue, cost, profit, roi = 0.0, 0.0, 0.0, None
        if is_land:
            calc = compute_land_financials(context)
            summary = calc.get("summary") or {}
            revenue = float(summary.get("total_revenue") or 0)
            cost = float(summary.get("total_cost") or 0)
            profit = float(summary.get("profit") or 0)
            roi_val = summary.get("roi_percent")
            roi = float(roi_val) if roi_val is not None else None
        else:
            from models import FinancialPlan
            plan_result = await db.execute(
                select(FinancialPlan).where(FinancialPlan.session_id == sess.id)
            )
            plan = plan_result.scalar_one_or_none()
            if plan:
                revenue = float(plan.total_revenue_annual or 0)
                cost = float(plan.total_opex_annual or 0)
                profit = float(plan.net_profit_annual or 0)
                roi = float(plan.roi_percent) if plan.roi_percent is not None else None

        rows.append({
            "session_id": str(sess.id),
            "completed_at": sess.completed_at,
            "survey_type": "land" if is_land else "ai",
            "source": source,
            "roi_percent": round(roi, 2) if roi is not None else None,
            "revenue": round(revenue, 2),
            "cost": round(cost, 2),
            "profit": round(profit, 2),
        })

    return rows


@router.get("/{farm_id}/latest-session")
async def farm_latest_session(
    farm_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent completed session for a farm."""
    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    result = await db.execute(
        select(Session)
        .where(Session.farm_id == farm.id, Session.status == "completed")
        .order_by(Session.completed_at.desc())
        .limit(1)
    )
    sess = result.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="No completed sessions for this farm.")

    context = sess.context_data or {}
    is_land = context.get("module") == "land_farm_voice"
    return {
        "session_id": str(sess.id),
        "survey_type": "land" if is_land else "ai",
        "completed_at": sess.completed_at,
    }
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && pytest tests/test_farm_endpoints.py::test_farm_sessions_returns_timeline tests/test_farm_endpoints.py::test_latest_session_returns_most_recent -v
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/farm.py backend/tests/test_farm_endpoints.py
git commit -m "feat: add farm timeline and latest-session endpoints"
```

---

### Task 5: Farm edit endpoint

**Files:**
- Modify: `backend/routers/farm.py`
- Modify: `backend/tests/test_farm_endpoints.py` (add one test)

**Interfaces:**
- Produces: `POST /farm/{farm_id}/edit` → `{ session_id: str, farm_id: str }`

- [ ] **Step 1: Add the failing test**

Append to `backend/tests/test_farm_endpoints.py`:

```python
@pytest.mark.asyncio
async def test_farm_edit_creates_new_session():
    """POST /farm/{id}/edit should create a new completed session."""
    from routers.farm import farm_edit

    db = AsyncMock()
    farm_result = MagicMock()
    farm_result.scalar_one_or_none.return_value = _make_farm()

    # Latest session for context base
    latest_result = MagicMock()
    latest_result.scalar_one_or_none.return_value = _make_session()

    db.execute = AsyncMock(side_effect=[farm_result, latest_result])
    db.add = MagicMock()
    db.flush = AsyncMock()

    user = MagicMock()
    user.id = "user-1"

    body = MagicMock()
    body.answers = {"farm_name": "Test Farm", "monthly_fish_revenue": 60000}
    body.survey_type = "ai"

    with patch("routers.farm.FinancialService") as MockSvc:
        plan_mock = MagicMock()
        plan_mock.roi_percent = 42.0
        MockSvc.return_value.create_plan = AsyncMock(return_value=plan_mock)

        result = await farm_edit("farm-1", body=body, current_user=user, db=db)

    db.add.assert_called()
    assert "session_id" in result
    assert result["farm_id"] == "farm-1"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && pytest tests/test_farm_endpoints.py::test_farm_edit_creates_new_session -v
```
Expected: `ImportError` — `farm_edit` not defined.

- [ ] **Step 3: Add the edit endpoint and request model to `farm.py`**

Add the Pydantic model and endpoint to `backend/routers/farm.py`:

```python
# Add near other model definitions at top of farm.py
class FarmEditRequest(BaseModel):
    answers: dict
    survey_type: str = "ai"   # "ai" | "land"
```

Add the endpoint after the `farm_latest_session` endpoint:

```python
@router.post("/{farm_id}/edit", status_code=201)
async def farm_edit(
    farm_id: str,
    body: FarmEditRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save an edit snapshot for a farm.

    Creates a new completed session with the provided answers,
    runs financial recalculation, and links it to the farm.
    Returns the new session_id so the frontend can fetch analysis.
    """
    from datetime import datetime, timezone
    from models import FinancialPlan

    farm = await _get_user_farm_or_404(farm_id, current_user.id, db)

    # Fetch latest session as the base context (preserves module, language, etc.)
    latest_result = await db.execute(
        select(Session)
        .where(Session.farm_id == farm.id, Session.status == "completed")
        .order_by(Session.completed_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    base_context = dict(latest.context_data) if latest and latest.context_data else {}

    # Merge edited answers on top, mark source
    merged_answers = dict(base_context.get("answers") or {})
    merged_answers.update(body.answers)
    new_context = {**base_context, "answers": merged_answers, "source": "edit"}

    if body.survey_type == "land":
        new_context["module"] = "land_farm_voice"
    else:
        new_context.pop("module", None)

    # Create the edit session
    new_sess = Session(
        user_id=current_user.id,
        farm_id=farm.id,
        status="completed",
        completed_at=datetime.now(timezone.utc),
        context_data=new_context,
        current_step=0,
        total_steps=0,
    )
    db.add(new_sess)
    await db.flush()

    # Run financial recalculation
    if body.survey_type == "land":
        pass  # land financials are computed on-demand from context; no plan row needed
    else:
        def _f(key, default=0.0):
            val = merged_answers.get(key, default)
            try:
                return float(val)
            except (TypeError, ValueError):
                return default

        horizon_map = {"6 months": 6, "12 months": 12, "24 months": 24,
                       "36 months": 36, "60 months": 60}
        horizon = horizon_map.get(str(merged_answers.get("planning_horizon") or "").strip(), 12)

        inputs = FinancialInputs(
            infrastructure_cost=_f("infrastructure_cost"),
            equipment_cost=_f("equipment_cost"),
            initial_stock_cost=_f("initial_stock_cost"),
            monthly_feed_cost=_f("monthly_feed_cost"),
            monthly_labor_cost=_f("monthly_labor_cost"),
            monthly_utilities_cost=_f("monthly_utilities_cost"),
            monthly_maintenance_cost=_f("monthly_maintenance_cost"),
            monthly_other_cost=_f("monthly_other_cost"),
            monthly_fish_revenue=_f("monthly_fish_revenue"),
            monthly_crop_revenue=_f("monthly_crop_revenue"),
            monthly_other_revenue=_f("monthly_other_revenue"),
            land_area_sqm=_f("farm_area_sqm"),
            horizon_months=horizon,
        )
        svc = FinancialService(db)
        await svc.create_plan(
            farm_id=farm.id,
            session_id=new_sess.id,
            inputs=inputs,
        )

    await db.flush()
    return {"session_id": str(new_sess.id), "farm_id": str(farm.id)}
```

- [ ] **Step 4: Add missing `Session` import to `farm.py`**

The `Session` model is already imported (`from models import Farm, Session, WaterReading`). Confirm it — no change needed if it's there.

- [ ] **Step 5: Run the test**

```bash
cd backend && pytest tests/test_farm_endpoints.py::test_farm_edit_creates_new_session -v
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/farm.py backend/tests/test_farm_endpoints.py
git commit -m "feat: add farm edit endpoint (creates new snapshot session)"
```

---

### Task 6: Farm-filtered analytics and dashboard

**Files:**
- Modify: `backend/routers/report.py`

**Interfaces:**
- Produces: `GET /report/analytics?farm_id=<uuid>` and `GET /report/dashboard?farm_id=<uuid>` — same response shape as today, filtered to one farm when param provided

- [ ] **Step 1: Add `farm_id` param to `report_analytics`**

In `backend/routers/report.py`, find `async def report_analytics(current_user=..., db=...)` and add the param:

```python
@router.get("/analytics")
async def report_analytics(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    farm_id: Optional[str] = Query(None),
):
```

Add `Optional` and `Query` to the imports at the top if not already present:
```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Any, Optional
```

Then update the sessions query inside `report_analytics` to add the filter. Find the `sessions_result` execute call (around line 261–268) and change:

```python
    sessions_result,
    plans_result,
    ...
) = await asyncio.gather(
    db.execute(
        select(Session, Farm)
        .outerjoin(Farm, Farm.id == Session.farm_id)
        .where(Session.user_id == current_user.id)
    ),
    db.execute(
        select(FinancialPlan, Session, Farm)
        .join(Session, Session.id == FinancialPlan.session_id)
        .outerjoin(Farm, Farm.id == FinancialPlan.farm_id)
        .where(Session.user_id == current_user.id)
    ),
```

to:

```python
    sessions_result,
    plans_result,
    ...
) = await asyncio.gather(
    db.execute(
        select(Session, Farm)
        .outerjoin(Farm, Farm.id == Session.farm_id)
        .where(
            Session.user_id == current_user.id,
            *([Session.farm_id == farm_id] if farm_id else []),
        )
    ),
    db.execute(
        select(FinancialPlan, Session, Farm)
        .join(Session, Session.id == FinancialPlan.session_id)
        .outerjoin(Farm, Farm.id == FinancialPlan.farm_id)
        .where(
            Session.user_id == current_user.id,
            *([Session.farm_id == farm_id] if farm_id else []),
        )
    ),
```

- [ ] **Step 2: Apply the same change to `report_dashboard`**

Find `async def report_dashboard` and apply identical treatment:

```python
@router.get("/dashboard")
async def report_dashboard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    farm_id: Optional[str] = Query(None),
):
```

Update the two `.where(Session.user_id == current_user.id)` clauses inside `report_dashboard` the same way:

```python
        .where(
            Session.user_id == current_user.id,
            *([Session.farm_id == farm_id] if farm_id else []),
        )
```

- [ ] **Step 3: Verify backend starts without errors**

```bash
cd backend && python -c "from routers.report import router; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && pytest -k "not Endpoint" -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/report.py
git commit -m "feat: add farm_id filter to analytics and dashboard endpoints"
```

---

### Task 7: Frontend API helpers + Zustand farm slice

**Files:**
- Modify: `frontend/src/app/utils/api.js`
- Modify: `frontend/src/app/store/index.js`

**Interfaces:**
- Produces (api.js):
  - `farmAPI.list()` — already exists, returns `{ farms: [...] }`
  - `farmAPI.latestSession(farmId)` — `GET /farm/{farmId}/latest-session`
  - `farmAPI.sessions(farmId)` — `GET /farm/{farmId}/sessions`
  - `farmAPI.edit(farmId, body)` — `POST /farm/{farmId}/edit`
  - `reportAPI.dashboard(farmId?)` — `GET /report/dashboard[?farm_id=]`
  - `reportAPI.analytics(farmId?)` — `GET /report/analytics[?farm_id=]`

- Produces (store.js):
  - `useStore(s => s.farms)` — `Array<{ id, name, system_type }>`
  - `useStore(s => s.selectedFarmId)` — `string | null`
  - `useStore(s => s.farmSessions)` — timeline entries array
  - `store.fetchFarms()` — loads farms list
  - `store.selectFarm(farmId)` — switches active farm, fetches its analysis
  - `store.editFarm(farmId, answers, surveyType)` — submits edit, refreshes analysis
  - `store.fetchFarmTimeline(farmId)` — loads timeline entries

- [ ] **Step 1: Update `api.js`**

In `frontend/src/app/utils/api.js`, replace the existing `farmAPI` export (which currently only has `list` and `get`) with:

```js
export const farmAPI = {
  list:          ()                        => api.get('/farm/'),
  get:           (id)                      => api.get(`/farm/${id}`),
  latestSession: (farmId)                  => api.get(`/farm/${farmId}/latest-session`),
  sessions:      (farmId)                  => api.get(`/farm/${farmId}/sessions`),
  edit:          (farmId, body)            => api.post(`/farm/${farmId}/edit`, body),
}
```

Update `reportAPI.dashboard` and `reportAPI.analytics` to accept an optional `farmId`:

```js
export const reportAPI = {
  history:           (limit = 20, offset = 0) => api.get('/report/history', { params: { limit, offset } }),
  analytics:         (farmId = null)           => api.get('/report/analytics', { params: farmId ? { farm_id: farmId } : {} }),
  dashboard:         (farmId = null)           => api.get('/report/dashboard', { params: farmId ? { farm_id: farmId } : {} }),
  invalidateAnalytics: ()                      => { _analyticsCache = null },
  get:               (sessionId)               => api.get(`/report/${sessionId}`),
}
```

- [ ] **Step 2: Add `farmSlice` to `store/index.js`**

In `frontend/src/app/store/index.js`, add the import at the top:

```js
import { authAPI, sessionAPI, analysisAPI, farmAPI } from '../utils/api'
```

Then add the slice before `langSlice`:

```js
// ── Farm Slice ────────────────────────────────────────────────────────────────
const farmSlice = (set, get) => ({
  farms: [],
  selectedFarmId: localStorage.getItem(SELECTED_FARM_ID_KEY) || null,
  farmSessions: [],

  fetchFarms: async () => {
    try {
      const { data } = await farmAPI.list()
      set({ farms: (data?.farms ?? data) || [] })
    } catch {
      // non-fatal
    }
  },

  selectFarm: async (farmId) => {
    if (farmId) {
      localStorage.setItem(SELECTED_FARM_ID_KEY, farmId)
    } else {
      localStorage.removeItem(SELECTED_FARM_ID_KEY)
    }
    set({ selectedFarmId: farmId, farmSessions: [] })
    if (farmId) {
      try {
        const { data } = await farmAPI.latestSession(farmId)
        if (data?.session_id) {
          await get().fetchAnalysis(data.session_id)
        }
      } catch {
        // farm has no sessions yet — clear analysis
        set({ analysis: null })
      }
    } else {
      set({ analysis: null })
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
    try {
      const { data } = await farmAPI.sessions(farmId)
      set({ farmSessions: Array.isArray(data) ? data : [] })
    } catch {
      set({ farmSessions: [] })
    }
  },
})
```

Add `farmSlice` to the `useStore` export:

```js
export const useStore = create((...args) => ({
  ...authSlice(...args),
  ...sessionSlice(...args),
  ...farmSlice(...args),
  ...langSlice(...args),
  ...uiSlice(...args),
}))
```

Also call `fetchFarms` in the auth `login` action after `set({ user: data.user, isAuth: true })`:

```js
  login: async (email, password) => {
    set({ authErr: null })
    const { data } = await authAPI.login({ email, password })
    localStorage.setItem('access_token',  data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    set({ user: data.user, isAuth: true })
    // load farms immediately after login so FarmSelector is populated
    try { await get().fetchFarms() } catch { /* non-fatal */ }
  },
```

- [ ] **Step 3: Verify TypeScript build passes**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: build succeeds with no TypeScript errors related to api.js or store/index.js.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/utils/api.js frontend/src/app/store/index.js
git commit -m "feat: add farmSlice to store and farm API helpers"
```

---

### Task 8: FarmSelector component

**Files:**
- Create: `frontend/src/app/components/ui/FarmSelector.tsx`

**Interfaces:**
- Consumes: `useStore(s => s.farms)`, `useStore(s => s.selectedFarmId)`, `useStore(s => s.selectFarm)`
- Props: `interface FarmSelectorProps { className?: string }`
- Produces: a self-contained dropdown component with no required props

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/app/components/ui/FarmSelector.tsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../../store';
import { cn } from './utils';
import { Skeleton } from './skeleton';

interface FarmSelectorProps {
  className?: string;
}

export function FarmSelector({ className }: FarmSelectorProps) {
  const farms = useStore((s: any) => s.farms);
  const selectedFarmId = useStore((s: any) => s.selectedFarmId);
  const selectFarm = useStore((s: any) => s.selectFarm);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedFarm = farms.find((f: any) => f.id === selectedFarmId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (farms.length === 0) {
    return <Skeleton className={cn('h-8 w-32 rounded-full', className)} />;
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {selectedFarm ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="max-w-[140px] truncate">{selectedFarm.name}</span>
          </>
        ) : (
          <>
            <Sprout className="w-3.5 h-3.5 text-slate-400" />
            <span>All Farms</span>
          </>
        )}
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden"
          >
            <div className="py-1">
              <button
                onClick={() => { selectFarm(null); setOpen(false); }}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm transition-colors',
                  !selectedFarmId
                    ? 'bg-green-50 text-green-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                All Farms
              </button>
              {farms.map((farm: any) => (
                <button
                  key={farm.id}
                  onClick={() => { selectFarm(farm.id); setOpen(false); }}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2',
                    selectedFarmId === farm.id
                      ? 'bg-green-50 text-green-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    selectedFarmId === farm.id ? 'bg-green-500' : 'bg-slate-300'
                  )} />
                  <span className="truncate">{farm.name}</span>
                </button>
              ))}
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
cd frontend && npm run build 2>&1 | grep -E "error|FarmSelector"
```
Expected: no errors mentioning FarmSelector.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/ui/FarmSelector.tsx
git commit -m "feat: add FarmSelector dropdown component"
```

---

### Task 9: FarmTimeline component

**Files:**
- Create: `frontend/src/app/components/farms/FarmTimeline.tsx`

**Interfaces:**
- Consumes: `useStore(s => s.farmSessions)`, `useStore(s => s.fetchFarmTimeline)`, `useStore(s => s.fetchAnalysis)`
- Props: `interface FarmTimelineProps { farmId: string }`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/app/components/farms/FarmTimeline.tsx
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { History, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore } from '../../store';
import { Skeleton } from '../ui/skeleton';

interface FarmTimelineProps {
  farmId: string;
}

const relativeDate = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
};

const fmtRs = (v: number) =>
  Math.abs(v) >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : `₹${Math.round(v / 1000)}k`;

export function FarmTimeline({ farmId }: FarmTimelineProps) {
  const farmSessions = useStore((s: any) => s.farmSessions);
  const fetchFarmTimeline = useStore((s: any) => s.fetchFarmTimeline);
  const fetchAnalysis = useStore((s: any) => s.fetchAnalysis);

  useEffect(() => {
    if (farmId) fetchFarmTimeline(farmId);
  }, [farmId]);

  if (!farmSessions) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl bg-slate-100" />)}
      </div>
    );
  }

  if (farmSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <History className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-sm font-medium text-slate-500">No history yet</p>
        <p className="text-xs text-slate-400 mt-0.5">Complete a survey to start tracking this farm's evolution</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Farm History
      </p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-100" />

        <div className="space-y-3">
          {farmSessions.map((entry: any, i: number) => {
            const isLatest = i === 0;
            const profitable = (entry.profit ?? 0) >= 0;

            return (
              <motion.div
                key={entry.session_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => fetchAnalysis(entry.session_id)}
                className="relative pl-9 cursor-pointer group"
              >
                {/* Dot */}
                <div className={`absolute left-1.5 top-4 w-3 h-3 rounded-full border-2 border-white ${isLatest ? 'bg-green-500' : 'bg-slate-300'}`} />

                <div className="rounded-xl border border-slate-100 bg-white p-3 hover:border-green-200 hover:bg-green-50/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {isLatest && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                          Current
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                        entry.source === 'edit'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {entry.source === 'edit' ? 'Edit' : 'Survey'}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 uppercase">
                        {entry.survey_type === 'land' ? 'Land' : 'Aquaponic'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {entry.completed_at ? relativeDate(entry.completed_at) : ''}
                    </span>
                  </div>

                  <div className="flex gap-4">
                    <div>
                      <p className="text-[9px] uppercase text-slate-400 font-semibold">Revenue</p>
                      <p className="text-xs font-bold text-slate-800">{fmtRs(entry.revenue ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-400 font-semibold">ROI</p>
                      <p className={`text-xs font-bold ${(entry.roi_percent ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.roi_percent != null ? `${entry.roi_percent.toFixed(0)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-400 font-semibold">Net Profit</p>
                      <p className={`text-xs font-bold flex items-center gap-0.5 ${profitable ? 'text-green-600' : 'text-red-500'}`}>
                        {profitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {fmtRs(Math.abs(entry.profit ?? 0))}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|FarmTimeline"
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/farms/FarmTimeline.tsx
git commit -m "feat: add FarmTimeline component"
```

---

### Task 10: FarmEditForm component

**Files:**
- Create: `frontend/src/app/components/farms/FarmEditForm.tsx`

**Interfaces:**
- Props:
  ```tsx
  interface FarmEditFormProps {
    farmId: string;
    surveyType: 'ai' | 'land';
    onClose: () => void;
    onSaved: () => void;
  }
  ```
- Consumes: `useStore(s => s.analysis)` for pre-population, `useStore(s => s.editFarm)`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/app/components/farms/FarmEditForm.tsx
import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../../store';
import { cn } from '../ui/utils';

interface FarmEditFormProps {
  farmId: string;
  surveyType: 'ai' | 'land';
  onClose: () => void;
  onSaved: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number';
  section: string;
}

const AI_FIELDS: FieldDef[] = [
  { key: 'farm_name',               label: 'Farm Name',                  type: 'text',   section: 'Basic Info' },
  { key: 'farm_location',           label: 'Location',                   type: 'text',   section: 'Basic Info' },
  { key: 'infrastructure_cost',     label: 'Infrastructure Cost (₹)',    type: 'number', section: 'Capital (CAPEX)' },
  { key: 'equipment_cost',          label: 'Equipment Cost (₹)',         type: 'number', section: 'Capital (CAPEX)' },
  { key: 'initial_stock_cost',      label: 'Initial Stock Cost (₹)',     type: 'number', section: 'Capital (CAPEX)' },
  { key: 'monthly_feed_cost',       label: 'Monthly Feed Cost (₹)',      type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_labor_cost',      label: 'Monthly Labor Cost (₹)',     type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_utilities_cost',  label: 'Monthly Utilities (₹)',      type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_maintenance_cost',label: 'Monthly Maintenance (₹)',    type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_fish_revenue',    label: 'Monthly Fish Revenue (₹)',   type: 'number', section: 'Monthly Revenue' },
  { key: 'monthly_crop_revenue',    label: 'Monthly Crop Revenue (₹)',   type: 'number', section: 'Monthly Revenue' },
  { key: 'monthly_other_revenue',   label: 'Monthly Other Revenue (₹)',  type: 'number', section: 'Monthly Revenue' },
];

const LAND_FIELDS: FieldDef[] = [
  { key: 'farm_name',         label: 'Farm Name',              type: 'text',   section: 'Basic Info' },
  { key: 'farm_location',     label: 'Location',               type: 'text',   section: 'Basic Info' },
  { key: 'land_area',         label: 'Land Area (acres)',       type: 'number', section: 'Basic Info' },
  { key: 'total_investment',  label: 'Total Investment (₹)',   type: 'number', section: 'Capital' },
  { key: 'monthly_revenue',   label: 'Monthly Revenue (₹)',    type: 'number', section: 'Revenue' },
  { key: 'monthly_cost',      label: 'Monthly Cost (₹)',       type: 'number', section: 'Costs' },
];

export function FarmEditForm({ farmId, surveyType, onClose, onSaved }: FarmEditFormProps) {
  const analysis = useStore((s: any) => s.analysis);
  const editFarm = useStore((s: any) => s.editFarm);
  const addToast = useStore((s: any) => s.addToast);

  const currentAnswers = analysis?.context_data?.answers ?? analysis?.answers ?? {};
  const fields = surveyType === 'land' ? LAND_FIELDS : AI_FIELDS;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.key] = currentAnswers[f.key] != null ? String(currentAnswers[f.key]) : '';
    }
    return init;
  });

  const [saving, setSaving] = useState(false);

  const sections = [...new Set(fields.map((f) => f.section))];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const answers: Record<string, string | number> = {};
      for (const f of fields) {
        const raw = values[f.key];
        if (raw === '') continue;
        answers[f.key] = f.type === 'number' ? parseFloat(raw) || 0 : raw;
      }
      await editFarm(farmId, answers, surveyType);
      addToast({ type: 'success', message: 'Farm updated. All analytics refreshed.' });
      onSaved();
      onClose();
    } catch (err: any) {
      addToast({ type: 'error', message: err?.message ?? 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit Farm Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">Changes create a new snapshot and refresh all analytics</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {sections.map((section) => (
            <div key={section}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                {section}
              </p>
              <div className="space-y-3">
                {fields.filter((f) => f.section === section).map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder={f.type === 'number' ? '0' : ''}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors',
              saving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recalculating…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save & Recalculate
              </>
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|FarmEditForm"
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/farms/FarmEditForm.tsx
git commit -m "feat: add FarmEditForm slide-in panel"
```

---

### Task 11: Wire FarmSelector into Dashboard, Analytics, Reports

**Files:**
- Modify: `frontend/src/app/components/dashboard/Dashboard.tsx`
- Modify: `frontend/src/app/components/analytics/Analytics.tsx`
- Modify: `frontend/src/app/components/reports/Reports.tsx`

**Interfaces:**
- Consumes: `FarmSelector` from Task 8, `useStore(s => s.selectedFarmId)`

- [ ] **Step 1: Update Dashboard.tsx**

Add the import at top of `Dashboard.tsx`:
```tsx
import { FarmSelector } from '../ui/FarmSelector';
```

Add `selectedFarmId` from store:
```tsx
const selectedFarmId = useStore((s: any) => s.selectedFarmId);
```

In the `useEffect` that calls `reportAPI.dashboard()`, change:
```tsx
reportAPI
  .dashboard(selectedFarmId || null)
```
(pass `selectedFarmId` as the first argument).

Also re-trigger the effect when `selectedFarmId` changes — add it to the dependency array:
```tsx
useEffect(() => {
  // ... existing fetch logic, but change reportAPI.dashboard() to reportAPI.dashboard(selectedFarmId)
}, [selectedFarmId]); // add selectedFarmId
```

In the page header JSX, add `<FarmSelector />` to the right side of the flex row:

```tsx
{/* Page header */}
<div className="flex items-start justify-between gap-4">
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      Welcome back
    </p>
    <h1 className="text-2xl font-semibold text-slate-900">{user?.name ?? 'Farmer'}</h1>
  </div>
  <FarmSelector className="mt-1" />
</div>
```

- [ ] **Step 2: Update Analytics.tsx**

Add the import:
```tsx
import { FarmSelector } from '../ui/FarmSelector';
```

Add `selectedFarmId` from store:
```tsx
const selectedFarmId = useStore((s: any) => s.selectedFarmId);
```

Find where `reportAPI.analytics()` is called and change to `reportAPI.analytics(selectedFarmId)`. Add `selectedFarmId` to the dependency array of the useEffect that calls it.

In the Analytics header area (the row with the page title), add `<FarmSelector />`:
```tsx
<div className="flex items-center justify-between gap-4 mb-6">
  <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
  <FarmSelector />
</div>
```

- [ ] **Step 3: Update Reports.tsx**

Add the import:
```tsx
import { FarmSelector } from '../ui/FarmSelector';
```

Add `selectedFarmId` from store:
```tsx
const selectedFarmId = useStore((s: any) => s.selectedFarmId);
```

In the report history fetch, filter results by `selectedFarmId`:
```tsx
// After fetching history, filter client-side when a farm is selected:
const filtered = selectedFarmId
  ? reports.filter((r: any) => r.farm_id === selectedFarmId)
  : reports;
```
Use `filtered` when rendering the report cards instead of `reports`.

Add `<FarmSelector />` in the Reports page header.

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/dashboard/Dashboard.tsx \
        frontend/src/app/components/analytics/Analytics.tsx \
        frontend/src/app/components/reports/Reports.tsx
git commit -m "feat: add FarmSelector to Dashboard, Analytics, Reports"
```

---

### Task 12: Wire FarmTimeline and FarmEditForm into FarmManagement

**Files:**
- Modify: `frontend/src/app/components/farms/FarmManagement.tsx`

**Interfaces:**
- Consumes: `FarmTimeline` from Task 9, `FarmEditForm` from Task 10
- Consumes: `useStore(s => s.selectedFarmId)`, farm's `survey_type` from latest session

- [ ] **Step 1: Add imports to FarmManagement.tsx**

```tsx
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Edit2 } from 'lucide-react';
import { FarmTimeline } from './FarmTimeline';
import { FarmEditForm } from './FarmEditForm';
```

- [ ] **Step 2: Add state for the edit panel**

Inside the `FarmManagement` component, add:

```tsx
const [editOpen, setEditOpen] = useState(false);
const analysis = useStore((s: any) => s.analysis);
const selectedFarmId = useStore((s: any) => s.selectedFarmId);
const fetchFarmTimeline = useStore((s: any) => s.fetchFarmTimeline);

// Detect survey type from analysis context
const surveyType: 'ai' | 'land' =
  analysis?.context_data?.module === 'land_farm_voice' ? 'land' : 'ai';
```

- [ ] **Step 3: Add the Edit button and Timeline to the farm detail view**

In the section where a selected farm's detail is shown, after the existing farm header (name, type badge, location), add:

```tsx
{/* Edit Farm Details button */}
{selectedFarmId && (
  <button
    onClick={() => setEditOpen(true)}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
  >
    <Edit2 className="w-3.5 h-3.5" />
    Edit Farm Details
  </button>
)}

{/* Timeline */}
{selectedFarmId && (
  <FarmTimeline farmId={selectedFarmId} />
)}

{/* Edit panel */}
<AnimatePresence>
  {editOpen && selectedFarmId && (
    <FarmEditForm
      farmId={selectedFarmId}
      surveyType={surveyType}
      onClose={() => setEditOpen(false)}
      onSaved={() => {
        if (selectedFarmId) fetchFarmTimeline(selectedFarmId);
      }}
    />
  )}
</AnimatePresence>
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: clean build, no TypeScript errors.

- [ ] **Step 5: Rebuild Docker and verify in browser**

```bash
docker compose up --build frontend
```

Open the app and verify:
1. FarmSelector dropdown appears on Dashboard, Analytics, and Reports
2. Selecting a farm filters all metrics to that farm's data
3. "All Farms" restores the aggregate view
4. Farm Management page shows the timeline for the selected farm
5. "Edit Farm Details" opens the slide-in panel pre-filled with current values
6. Saving triggers a "Farm updated. All analytics refreshed." toast and all charts refresh
7. The timeline gains a new "Edit" entry after saving
8. Completing a new survey with an existing farm name links to the same farm (check DB: `SELECT id, farm_id FROM sessions ORDER BY created_at DESC LIMIT 5`)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/farms/FarmManagement.tsx
git commit -m "feat: add FarmTimeline and FarmEditForm to FarmManagement"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Farm deduplication at session completion (aquaponic) | Task 1 + 2 |
| Farm deduplication at session completion (land survey) | Task 1 + 3 |
| `GET /farm/{id}/sessions` timeline endpoint | Task 4 |
| `GET /farm/{id}/latest-session` endpoint | Task 4 |
| `POST /farm/{id}/edit` creates new snapshot | Task 5 |
| `GET /report/analytics?farm_id=` filter | Task 6 |
| `GET /report/dashboard?farm_id=` filter | Task 6 |
| `farmAPI` helpers in api.js | Task 7 |
| Zustand `farmSlice` with selectFarm, editFarm, fetchFarmTimeline | Task 7 |
| FarmSelector dropdown component | Task 8 |
| FarmTimeline component | Task 9 |
| FarmEditForm component | Task 10 |
| Dashboard / Analytics / Reports wired to FarmSelector | Task 11 |
| FarmManagement wired to FarmTimeline + FarmEditForm | Task 12 |
| Backwards compatibility (no farm_id = aggregate view) | Task 6 |
| Legacy sessions with farm_id = null still work | Task 6 (where clause only adds filter when farm_id present) |
| Edit session marked source="edit" in context_data | Task 5 |
| Timeline "Edit" vs "Survey" badge | Task 9 |

All spec requirements covered. No gaps found.
