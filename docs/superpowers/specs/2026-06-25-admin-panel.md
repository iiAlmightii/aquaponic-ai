# Admin Panel — Design Spec
**Date:** 2026-06-25
**Status:** Approved for implementation

---

## 1. Purpose

A dedicated Admin Panel accessible only to users with `role = 'admin'`. Designed for a college showcase — allows the admin account (`admin@farmconnect.com`) to demonstrate platform-wide oversight to a guide or evaluator.

Regular farmers and viewers see no change to their experience.

---

## 2. Architecture

**Backend:** New `backend/routers/admin.py` with an `admin_required` dependency. Returns 403 for any non-admin caller.

**Frontend:** New `AdminDashboard.tsx` view. A new **Admin** nav group appears in `MainLayout.tsx` sidebar only when `user.role === 'admin'`.

**Navigation (admin-only):**
```
ADMIN
  🛡️ Admin Panel   (view: 'admin-panel')
```

---

## 3. Backend API — `backend/routers/admin.py`

All endpoints require JWT auth + `role === 'admin'`. Return 403 otherwise.

### `GET /admin/overview`
Platform-wide stats:
```json
{
  "total_users": 42,
  "total_farms": 28,
  "total_surveys": 156,
  "completed_surveys": 134,
  "total_revenue_inr": 4500000,
  "users_by_role": { "admin": 1, "farmer": 38, "viewer": 3 },
  "surveys_this_month": 23,
  "surveys_by_month": [{ "month": "2026-01", "count": 12 }, ...]
}
```

### `GET /admin/users`
All users with aggregated counts:
```json
[{
  "id": "uuid",
  "email": "...",
  "full_name": "...",
  "role": "farmer",
  "is_active": true,
  "created_at": "...",
  "farms_count": 2,
  "surveys_count": 5
}]
```

### `PATCH /admin/users/{user_id}`
Body: `{ "role": "admin" | "farmer" | "viewer" }` or `{ "full_name": "..." }`
Response: updated user object.
Constraint: cannot demote yourself (prevents locking out the only admin).

### `DELETE /admin/users/{user_id}`
Deletes user and cascades to their sessions/farms.
Constraint: cannot delete yourself.

### `GET /admin/data`
Returns all farms and sessions across all users:
```json
{
  "farms": [{ "id", "name", "owner_email", "system_type", "area_sqm", "created_at" }],
  "sessions": [{ "id", "project_name", "owner_email", "survey_type", "status", "roi_percent", "completed_at" }]
}
```

### `GET /admin/schema`
Reads PostgreSQL `information_schema.columns` for all app tables:
```json
[{
  "table_name": "users",
  "columns": [
    { "name": "id", "type": "uuid", "nullable": false },
    { "name": "email", "type": "character varying", "nullable": false }
  ]
}]
```
Tables included: users, farms, sessions, session_answers, financial_plans, reports, stt_corrections.

---

## 4. Frontend

### New file: `frontend/src/app/components/admin/AdminDashboard.tsx`

Single page with 4 tabs: Overview | Users | Data Browser | Schema

---

### Tab 1 — Overview

**Stat cards (4):**
- Total Users
- Total Farms
- Total Surveys (completed / total)
- Platform Revenue (sum of all financial plans)

**Charts:**
- Pie chart: Users by role (admin / farmer / viewer) — using Recharts PieChart
- Bar chart: Surveys per month (last 6 months) — using Recharts BarChart

**Recent activity table:**
Last 10 completed surveys across all users — columns: Project | Owner | Type | ROI | Date

---

### Tab 2 — Users

**Search bar:** Filter by name or email (client-side).

**Table columns:** Name | Email | Role | Farms | Surveys | Joined | Actions

**Actions per row:**
- Role dropdown (admin / farmer / viewer) → calls `PATCH /admin/users/{id}`
- Delete button (red, with confirmation modal) → calls `DELETE /admin/users/{id}`

**"Add User" button** → modal with fields: Full Name, Email, Password, Role → calls `POST /auth/register` then `PATCH /admin/users/{id}` to set role.

**Guards:** Current admin's own row shows role as read-only. Cannot delete self.

---

### Tab 3 — Data Browser

Two sub-tabs: **Farms** | **Surveys**

**Farms table:** Farm Name | Owner | System Type | Area (m²) | Created
**Surveys table:** Project Name | Owner | Type (Aquaponic/Land) | ROI | Status | Date

Click any row → slide-in detail panel showing all fields for that record.

---

### Tab 4 — Schema

**Table list** (left sidebar) showing all 7 tables.

Click a table → right panel shows:
- Column name
- Data type
- Nullable (yes/no)
- Primary key indicator

Read-only. No editing. Purpose: showcase the data model structure.

---

## 5. Navigation Wiring

**`MainLayout.tsx`** — add to nav group definitions:
```tsx
// Only render this group when user.role === 'admin'
{ group: 'Admin', items: [{ id: 'admin-panel', label: 'Admin Panel', icon: Shield }] }
```

**`App.tsx`** — add to View type and render:
```tsx
type View = ... | 'admin-panel'
{currentView === 'admin-panel' && <AdminDashboard />}
```

---

## 6. Admin Account

Demo credentials for showcase:
- **Email:** `admin@farmconnect.com`
- **Password:** `Admin@1234`
- **Role:** Set via Supabase SQL after registration

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@farmconnect.com';
```

---

## 7. Out of Scope

- Audit logs (not needed for showcase)
- Export to CSV (not needed for showcase)
- Real-time updates (polling not required)
- Multi-admin support edge cases
