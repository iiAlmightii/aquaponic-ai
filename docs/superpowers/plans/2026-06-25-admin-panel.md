# Admin Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full admin panel (Overview, User Management, Data Browser, Schema Viewer) accessible only to users with `role = 'admin'`.

**Architecture:** New `backend/routers/admin.py` with 5 protected endpoints + `AdminDashboard.tsx` with 4 tabs wired into the existing nav/routing system. Admin nav group only renders when `user.role === 'admin'`.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), React 18 + TypeScript + Recharts + Tailwind (frontend), Lucide icons, motion/react.

## Global Constraints

- All admin endpoints require `Depends(get_current_user)` + role check returning 403 if not admin
- Frontend admin nav group only visible when `user.role === 'admin'`
- Cannot delete or demote yourself (guard in backend and frontend)
- `motion` imported from `'motion/react'`
- `cn()` from `'../ui/utils'`
- Backend tests: `cd backend && pytest -k "not Endpoint" -v`
- Frontend build: `cd frontend && npm run build`
- Recharts already installed — import from `'recharts'`
- Lucide icon for admin: `Shield`

---

## File Map

**Created:**
- `backend/routers/admin.py`
- `backend/tests/test_admin.py`
- `frontend/src/app/components/admin/AdminDashboard.tsx`

**Modified:**
- `backend/main.py` — register admin router
- `frontend/src/app/utils/api.js` — add `adminAPI`
- `frontend/src/app/App.tsx` — add `'admin-panel'` view
- `frontend/src/app/components/layout/MainLayout.tsx` — add admin nav group

---

### Task 1: Backend admin router

**Files:**
- Create: `backend/routers/admin.py`
- Create: `backend/tests/test_admin.py`

**Interfaces:**
- Produces:
  - `GET /admin/overview` → `AdminOverview` dict
  - `GET /admin/users` → `list[AdminUser]`
  - `PATCH /admin/users/{user_id}` → updated user
  - `DELETE /admin/users/{user_id}` → 204
  - `GET /admin/data` → `{farms: [...], sessions: [...]}`
  - `GET /admin/schema` → `list[{table_name, columns}]`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_admin.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_admin():
    u = MagicMock()
    u.id = "admin-uuid"
    u.role = "admin"
    u.email = "admin@farmconnect.com"
    return u


def _make_farmer():
    u = MagicMock()
    u.id = "farmer-uuid"
    u.role = "farmer"
    return u


@pytest.mark.asyncio
async def test_admin_required_blocks_non_admin():
    from routers.admin import admin_required
    from fastapi import HTTPException
    farmer = _make_farmer()
    with pytest.raises(HTTPException) as exc:
        await admin_required(current_user=farmer)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_required_allows_admin():
    from routers.admin import admin_required
    admin = _make_admin()
    result = await admin_required(current_user=admin)
    assert result.role == "admin"


@pytest.mark.asyncio
async def test_overview_returns_expected_keys():
    from routers.admin import admin_overview
    db = AsyncMock()

    def make_result(val):
        r = MagicMock()
        r.scalar.return_value = val
        r.fetchall.return_value = []
        return r

    db.execute = AsyncMock(return_value=make_result(0))
    admin = _make_admin()
    result = await admin_overview(current_user=admin, db=db)
    assert "total_users" in result
    assert "total_farms" in result
    assert "total_surveys" in result
    assert "users_by_role" in result
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && pytest tests/test_admin.py -v
```
Expected: `ImportError` — module does not exist yet.

- [ ] **Step 3: Implement `backend/routers/admin.py`**

```python
"""routers/admin.py — Admin-only endpoints for platform oversight."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import Farm, FinancialPlan, Session, User
from routers.auth import get_current_user

router = APIRouter(tags=["Admin"])


# ── Admin guard ───────────────────────────────────────────────────────────────

async def admin_required(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserRoleUpdate(BaseModel):
    role: Optional[str] = None
    full_name: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def admin_overview(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # Total users
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    # Users by role
    role_rows = (await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )).fetchall()
    users_by_role = {str(r[0]): int(r[1]) for r in role_rows}

    # Total farms
    total_farms = (await db.execute(select(func.count(Farm.id)))).scalar() or 0

    # Total sessions
    total_surveys = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    completed_surveys = (await db.execute(
        select(func.count(Session.id)).where(Session.status == "completed")
    )).scalar() or 0

    # Platform revenue (sum of annual revenue across all financial plans)
    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(FinancialPlan.total_revenue_annual), 0))
    )).scalar() or 0

    # Surveys this month
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    surveys_this_month = (await db.execute(
        select(func.count(Session.id)).where(
            Session.status == "completed",
            Session.completed_at >= month_start,
        )
    )).scalar() or 0

    # Surveys by month (last 6 months) — use raw SQL for date_trunc portability
    monthly_rows = (await db.execute(text("""
        SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month,
               COUNT(*) AS cnt
        FROM sessions
        WHERE status = 'completed'
          AND completed_at >= NOW() - INTERVAL '6 months'
        GROUP BY 1
        ORDER BY 1
    """))).fetchall()
    surveys_by_month = [{"month": r[0], "count": int(r[1])} for r in monthly_rows]

    # Recent completed sessions (last 10)
    recent_rows = (await db.execute(
        select(Session, User)
        .join(User, User.id == Session.user_id)
        .where(Session.status == "completed")
        .order_by(Session.completed_at.desc())
        .limit(10)
    )).all()

    recent_sessions = []
    for sess, owner in recent_rows:
        ctx = sess.context_data or {}
        answers = ctx.get("answers", {})
        is_land = ctx.get("module") == "land_farm_voice"
        recent_sessions.append({
            "session_id": str(sess.id),
            "project_name": answers.get("farm_name") or "Untitled",
            "owner_email": owner.email,
            "survey_type": "land" if is_land else "aquaponic",
            "completed_at": sess.completed_at,
        })

    return {
        "total_users": total_users,
        "total_farms": total_farms,
        "total_surveys": total_surveys,
        "completed_surveys": completed_surveys,
        "total_revenue_inr": float(total_revenue),
        "users_by_role": users_by_role,
        "surveys_this_month": surveys_this_month,
        "surveys_by_month": surveys_by_month,
        "recent_sessions": recent_sessions,
    }


@router.get("/users")
async def admin_list_users(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()

    result = []
    for u in users:
        farms_count = (await db.execute(
            select(func.count(Farm.id)).where(Farm.owner_id == u.id)
        )).scalar() or 0
        surveys_count = (await db.execute(
            select(func.count(Session.id)).where(Session.user_id == u.id)
        )).scalar() or 0
        result.append({
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
            "farms_count": farms_count,
            "surveys_count": surveys_count,
        })
    return result


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    body: UserRoleUpdate,
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if user_id == str(current_user.id) and body.role and body.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if body.role:
        user.role = body.role
    if body.full_name:
        user.full_name = body.full_name
    await db.flush()
    return {"id": str(user.id), "email": user.email, "role": user.role, "full_name": user.full_name}


@router.delete("/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: str,
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    if user_id == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    await db.delete(user)
    await db.flush()


@router.get("/data")
async def admin_data(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    farm_rows = (await db.execute(
        select(Farm, User).join(User, User.id == Farm.owner_id).order_by(Farm.created_at.desc())
    )).all()
    farms = [{
        "id": str(f.id),
        "name": f.name,
        "owner_email": u.email,
        "system_type": f.system_type,
        "area_sqm": f.area_sqm,
        "location": f.location,
        "created_at": f.created_at,
    } for f, u in farm_rows]

    session_rows = (await db.execute(
        select(Session, User).join(User, User.id == Session.user_id).order_by(Session.created_at.desc()).limit(200)
    )).all()
    sessions = []
    for s, u in session_rows:
        ctx = s.context_data or {}
        answers = ctx.get("answers", {})
        is_land = ctx.get("module") == "land_farm_voice"
        sessions.append({
            "id": str(s.id),
            "project_name": answers.get("farm_name") or "Untitled",
            "owner_email": u.email,
            "survey_type": "land" if is_land else "aquaponic",
            "status": s.status,
            "completed_at": s.completed_at,
            "created_at": s.created_at,
        })

    return {"farms": farms, "sessions": sessions}


@router.get("/schema")
async def admin_schema(
    current_user=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    APP_TABLES = [
        "users", "farms", "sessions", "session_answers",
        "financial_plans", "reports", "stt_corrections",
    ]
    rows = (await db.execute(text("""
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(:tables)
        ORDER BY table_name, ordinal_position
    """), {"tables": APP_TABLES})).fetchall()

    by_table: dict[str, list] = defaultdict(list)
    for table, col, dtype, nullable, default in rows:
        by_table[table].append({
            "name": col,
            "type": dtype,
            "nullable": nullable == "YES",
            "default": default,
        })

    return [
        {"table_name": t, "columns": by_table[t]}
        for t in APP_TABLES if t in by_table
    ]
```

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_admin.py -v
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/admin.py backend/tests/test_admin.py
git commit -m "feat: add admin router with overview, users, data, schema endpoints"
```

---

### Task 2: Register admin router in main.py

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add import and registration**

In `backend/main.py`, find the line:
```python
from routers import auth, session, analysis, report, farm, iot, audio, finance_sheets, land_survey, crop, ai_advisor
```

Change to:
```python
from routers import auth, session, analysis, report, farm, iot, audio, finance_sheets, land_survey, crop, ai_advisor, admin
```

Then find where routers are registered (the `app.include_router` block) and add:
```python
app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["Admin"])
```

- [ ] **Step 2: Verify**

```bash
cd backend && python -c "from main import app; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: register admin router at /api/v1/admin"
```

---

### Task 3: Frontend adminAPI helpers

**Files:**
- Modify: `frontend/src/app/utils/api.js`

**Interfaces:**
- Produces:
  - `adminAPI.overview()` → GET /admin/overview
  - `adminAPI.users()` → GET /admin/users
  - `adminAPI.updateUser(id, body)` → PATCH /admin/users/:id
  - `adminAPI.deleteUser(id)` → DELETE /admin/users/:id
  - `adminAPI.data()` → GET /admin/data
  - `adminAPI.schema()` → GET /admin/schema

- [ ] **Step 1: Add adminAPI to api.js**

In `frontend/src/app/utils/api.js`, add after the existing exports:

```js
export const adminAPI = {
  overview:   ()          => api.get('/admin/overview'),
  users:      ()          => api.get('/admin/users'),
  updateUser: (id, body)  => api.patch(`/admin/users/${id}`, body),
  deleteUser: (id)        => api.delete(`/admin/users/${id}`),
  data:       ()          => api.get('/admin/data'),
  schema:     ()          => api.get('/admin/schema'),
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
git commit -m "feat: add adminAPI helpers to api.js"
```

---

### Task 4: AdminDashboard — Overview + Users tabs

**Files:**
- Create: `frontend/src/app/components/admin/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `adminAPI.overview()`, `adminAPI.users()`, `adminAPI.updateUser()`, `adminAPI.deleteUser()` from Task 3
- Props: `{ onNavigate?: (view: string) => void }`

- [ ] **Step 1: Create AdminDashboard.tsx**

```tsx
// frontend/src/app/components/admin/AdminDashboard.tsx
import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Shield, Users, LayoutDashboard, Database, Table,
  Search, Trash2, Edit2, Check, X, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { adminAPI } from '../../utils/api';
import { useStore } from '../../store';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

type Tab = 'overview' | 'users' | 'data' | 'schema';

const ROLE_COLORS: Record<string, string> = {
  admin: '#16a34a',
  farmer: '#2563eb',
  viewer: '#d97706',
};

const fmtRs = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr`
  : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L`
  : `₹${Math.round(v / 1000)}k`;

export function AdminDashboard({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const currentUser = useStore((s: any) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Overview state
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Data state
  const [data, setData] = useState<{ farms: any[]; sessions: any[] } | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataSubTab, setDataSubTab] = useState<'farms' | 'sessions'>('farms');

  // Schema state
  const [schema, setSchema] = useState<any[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');

  useEffect(() => {
    adminAPI.overview().then(({ data }: any) => setOverview(data)).catch(() => {}).finally(() => setOverviewLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) {
      setUsersLoading(true);
      adminAPI.users().then(({ data }: any) => setUsers(data)).catch(() => {}).finally(() => setUsersLoading(false));
    }
    if (activeTab === 'data' && !data) {
      setDataLoading(true);
      adminAPI.data().then(({ data: d }: any) => { setData(d); }).catch(() => {}).finally(() => setDataLoading(false));
    }
    if (activeTab === 'schema' && schema.length === 0) {
      setSchemaLoading(true);
      adminAPI.schema().then(({ data }: any) => { setSchema(data); setSelectedTable(data[0]?.table_name || ''); }).catch(() => {}).finally(() => setSchemaLoading(false));
    }
  }, [activeTab]);

  const filteredUsers = useMemo(() =>
    users.filter(u => !userSearch || u.email.includes(userSearch) || u.full_name.toLowerCase().includes(userSearch.toLowerCase())),
    [users, userSearch]
  );

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminAPI.updateUser(userId, { role });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      setEditingRole(null);
    } catch { /* ignore */ }
  };

  const handleDelete = async (userId: string) => {
    try {
      await adminAPI.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDelete(null);
    } catch { /* ignore */ }
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'data', label: 'Data Browser', icon: Database },
    { id: 'schema', label: 'Schema', icon: Table },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Admin Panel</h1>
          <p className="text-xs text-slate-400 mt-0.5">Logged in as {currentUser?.email}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {overviewLoading ? [1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-slate-100" />)
            : [
              { label: 'Total Users', value: overview?.total_users ?? 0, color: 'text-blue-600' },
              { label: 'Total Farms', value: overview?.total_farms ?? 0, color: 'text-green-600' },
              { label: 'Total Surveys', value: `${overview?.completed_surveys ?? 0} / ${overview?.total_surveys ?? 0}`, color: 'text-purple-600' },
              { label: 'Platform Revenue', value: fmtRs(overview?.total_revenue_inr ?? 0), color: 'text-amber-600' },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Users by role — Pie */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Users by Role</p>
              {overviewLoading ? <Skeleton className="h-40 bg-slate-100 rounded-lg" /> : (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={Object.entries(overview?.users_by_role || {}).map(([k,v]) => ({ name: k, value: v }))}
                      cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {Object.keys(overview?.users_by_role || {}).map((role) => (
                        <Cell key={role} fill={ROLE_COLORS[role] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Surveys by month — Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Surveys by Month</p>
              {overviewLoading ? <Skeleton className="h-40 bg-slate-100 rounded-lg" /> : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={overview?.surveys_by_month || []} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#16a34a" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent sessions */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Recent Surveys</p>
            {overviewLoading ? <Skeleton className="h-32 bg-slate-100 rounded-lg" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Project', 'Owner', 'Type', 'Date'].map(h => (
                      <th key={h} className="text-left text-xs text-slate-400 font-medium pb-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(overview?.recent_sessions || []).map((s: any) => (
                    <tr key={s.session_id}>
                      <td className="py-2 font-medium text-slate-800">{s.project_name}</td>
                      <td className="py-2 text-slate-500 text-xs">{s.owner_email}</td>
                      <td className="py-2">
                        <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                          s.survey_type === 'aquaponic' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                          {s.survey_type}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400 text-xs">
                        {s.completed_at ? new Date(s.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {usersLoading ? <Skeleton className="h-48 bg-slate-100 m-4 rounded-lg" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Name', 'Email', 'Role', 'Farms', 'Surveys', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                        <td className="px-4 py-3">
                          {editingRole === u.id ? (
                            <div className="flex items-center gap-1">
                              <select defaultValue={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                                className="text-xs border rounded px-1 py-0.5">
                                <option value="admin">admin</option>
                                <option value="farmer">farmer</option>
                                <option value="viewer">viewer</option>
                              </select>
                              <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">{u.role}</span>
                              {u.id !== currentUser?.id && (
                                <button onClick={() => setEditingRole(u.id)} className="text-slate-400 hover:text-slate-600">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{u.farms_count}</td>
                        <td className="px-4 py-3 text-slate-600">{u.surveys_count}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {u.id !== currentUser?.id && (
                            confirmDelete === u.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-red-600">Confirm?</span>
                                <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-700">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setConfirmDelete(null)} className="text-slate-400 hover:text-slate-600">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(u.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DATA BROWSER TAB ── */}
      {activeTab === 'data' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(['farms', 'sessions'] as const).map(sub => (
              <button key={sub} onClick={() => setDataSubTab(sub)}
                className={cn('px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors',
                  dataSubTab === sub ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {sub}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {dataLoading ? <Skeleton className="h-48 bg-slate-100 m-4 rounded-lg" /> : dataSubTab === 'farms' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Farm Name', 'Owner', 'System Type', 'Area (m²)', 'Location', 'Created'].map(h => (
                        <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.farms || []).map((f: any) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{f.name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{f.owner_email}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{f.system_type}</td>
                        <td className="px-4 py-3 text-slate-600">{f.area_sqm ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{f.location || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Project', 'Owner', 'Type', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.sessions || []).map((s: any) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.project_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{s.owner_email}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                            s.survey_type === 'aquaponic' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                            {s.survey_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                            s.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600')}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {(s.completed_at || s.created_at) ? new Date(s.completed_at || s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SCHEMA TAB ── */}
      {activeTab === 'schema' && (
        <div className="grid grid-cols-[200px_1fr] gap-4">
          {/* Table list */}
          <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1 h-fit">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-2 py-1">Tables</p>
            {schemaLoading ? [1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 bg-slate-100 rounded-lg" />) :
              schema.map(t => (
                <button key={t.table_name} onClick={() => setSelectedTable(t.table_name)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    selectedTable === t.table_name ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50')}>
                  {t.table_name}
                  <span className="ml-1 text-[10px] text-slate-400">({t.columns.length})</span>
                </button>
              ))
            }
          </div>

          {/* Columns */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {schemaLoading ? <Skeleton className="h-48 bg-slate-100 m-4 rounded-lg" /> : (() => {
              const tbl = schema.find(t => t.table_name === selectedTable);
              if (!tbl) return <div className="p-6 text-slate-400 text-sm">Select a table</div>;
              return (
                <div>
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="font-semibold text-slate-900 font-mono">{tbl.table_name}</span>
                    <span className="ml-2 text-xs text-slate-400">{tbl.columns.length} columns</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Column', 'Type', 'Nullable', 'Default'].map(h => (
                          <th key={h} className="text-left text-xs text-slate-400 font-medium px-5 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {tbl.columns.map((col: any) => (
                        <tr key={col.name} className="hover:bg-slate-50">
                          <td className="px-5 py-2 font-mono text-slate-900 font-medium">{col.name}</td>
                          <td className="px-5 py-2 font-mono text-blue-600 text-xs">{col.type}</td>
                          <td className="px-5 py-2">
                            <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                              col.nullable ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500')}>
                              {col.nullable ? 'nullable' : 'not null'}
                            </span>
                          </td>
                          <td className="px-5 py-2 font-mono text-slate-400 text-xs truncate max-w-[160px]">{col.default || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
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
git add frontend/src/app/components/admin/AdminDashboard.tsx
git commit -m "feat: add AdminDashboard with Overview, Users, Data Browser, Schema tabs"
```

---

### Task 5: Wire navigation and routing

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/components/layout/MainLayout.tsx`

**Interfaces:**
- Consumes: `AdminDashboard` from Task 4
- Produces: `'admin-panel'` view visible only to admin users

- [ ] **Step 1: Update App.tsx**

Add import at top:
```tsx
import { AdminDashboard } from './components/admin/AdminDashboard';
```

Add `'admin-panel'` to the `View` type:
```tsx
type View = 'login' | 'register' | 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor' | 'crop-feasibility' | 'admin-panel';
```

Add render inside `<MainLayout>`:
```tsx
{currentView === 'admin-panel' && <AdminDashboard onNavigate={setCurrentView} />}
```

- [ ] **Step 2: Update MainLayout.tsx**

Add `Shield` to lucide imports.

Find where nav groups are defined (the array/object with `overview`, `farming`, `intelligence` groups). Add an admin group that only renders when `user.role === 'admin'`:

Read the current MainLayout nav structure first, then add:
```tsx
// After the Intelligence nav group definition, add:
...(user?.role === 'admin' ? [{
  labelKey: 'nav_group_admin',
  items: [
    { id: 'admin-panel', nameKey: 'nav_admin_panel', icon: Shield },
  ],
}] : []),
```

If the nav is an array literal, add the conditional spread. If it uses a different structure, follow the existing pattern.

Also add to the i18n keys used (or just use the string directly if the nav uses strings):
- Label: `"Admin"`
- Item: `"Admin Panel"`

- [ ] **Step 3: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/App.tsx frontend/src/app/components/layout/MainLayout.tsx
git commit -m "feat: wire admin-panel view into App routing and nav (admin-only)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `admin_required` dependency returning 403 | Task 1 |
| `GET /admin/overview` with all stats | Task 1 |
| `GET /admin/users` with farms/surveys counts | Task 1 |
| `PATCH /admin/users/{id}` role change | Task 1 |
| `DELETE /admin/users/{id}` with cascade | Task 1 |
| `GET /admin/data` farms + sessions | Task 1 |
| `GET /admin/schema` from information_schema | Task 1 |
| Cannot demote/delete self | Task 1 |
| Register router in main.py | Task 2 |
| `adminAPI` frontend helpers | Task 3 |
| Overview tab: stat cards, pie, bar, recent | Task 4 |
| Users tab: table, role edit, delete | Task 4 |
| Data Browser: farms + sessions tables | Task 4 |
| Schema tab: table list + column viewer | Task 4 |
| Admin nav group (admin-only) | Task 5 |
| `'admin-panel'` view in App.tsx | Task 5 |
