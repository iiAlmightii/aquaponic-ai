# FarmConnect Frontend Redesign — Mission Control Architecture

**Date:** 2026-05-29
**Status:** Approved for implementation
**Approach:** Option B — Mission Control Architecture

---

## Problem Statement

The existing frontend answers "Am I making money?" partially, but fails to answer "Is my farm healthy?" or "What should I do next?" within 5 seconds. The UI feels like an admin CRUD dashboard with charts bolted on, not an investor-ready AgriTech SaaS product.

Ten specific failures identified in audit:
1. Dashboard hides IoT health data that the backend already provides
2. Dashboard quick-actions are navigation shortcuts, not intelligence
3. Analytics is ~1000 lines on a single scroll — no hierarchy
4. AI Advisor is page-isolated — not integrated as a persistent copilot
5. Farms renders IoT readings as raw table rows with no visualization
6. Reports is a plain download list with no metric preview
7. Nav group labels render raw i18n key strings (bug: `nav_group_overview` shown literally)
8. No farm health score or break-even progress anywhere in the UI
9. `ChartCarousel` hides data behind swipe interactions
10. Inconsistent color semantics across components

---

## Design Philosophy

Every screen must answer one or more of:
1. **Am I making money?** → KPI strip, Revenue/Profit/ROI with trends
2. **Is my farm healthy?** → Farm Health Score from IoT readings
3. **What should I do next?** → AI Insights panel, priority-sorted recommendations

---

## Design System

### Color Tokens (extending `theme.css`)

```css
/* Semantic additions — no new dependencies */
--color-positive:  #16a34a;   /* green-600 — up trends, healthy, CTAs */
--color-warning:   #d97706;   /* amber-600 — needs attention */
--color-critical:  #dc2626;   /* red-600   — alerts, critical status */
--color-info:      #2563eb;   /* blue-600  — neutral insights */
```

Primary green stays `#16a34a` (green-600). Page background `#f8fafc` (slate-50). Cards `#ffffff`. All borders `#e2e8f0` (slate-200).

### Typography Scale

| Role | Classes |
|------|---------|
| Page title | `text-2xl font-semibold text-slate-900` |
| Section label | `text-[11px] font-semibold uppercase tracking-widest text-slate-400` |
| KPI value | `text-2xl font-bold tabular-nums text-slate-900` |
| KPI label | `text-xs font-medium text-slate-500` |
| Body | `text-sm text-slate-700` |
| Caption | `text-xs text-slate-400` |

### Spacing

- Page padding: `p-6`
- Card padding: `p-5` (standard) / `p-4` (compact)
- Grid gap: `gap-4`
- Section gap: `space-y-6`

### Radius & Shadow

- Standard cards: `rounded-xl border border-slate-200` (no box-shadow)
- Elevated (modals, dropdowns): `rounded-xl shadow-md`
- Floating copilot: `rounded-2xl shadow-2xl`
- Badges/chips: `rounded-full`

---

## New Shared Components

### `KpiCard`
Replaces `StatCard`. Props: `label`, `value`, `delta`, `deltaPositive`, `sparklineData`, `icon`, `loading`.

Renders:
- Label (top-left, caption style)
- Icon (top-right, 20px, color-coded)
- Value (large, tabular-nums)
- Delta badge: `+12% ↑` in green or `−8% ↓` in red
- Mini sparkline: 20px tall Recharts `LineChart`, no axes, no tooltip, 6 data points
- Hover: tooltip with period comparison

### `FarmHealthScore`
Props: `score` (0–100), `parameters` (array of parameter objects), `loading`.

Score formula (client-computed from latest IoT reading):
- pH in range 6.5–7.5 → 25 pts (borderline 6.3–6.5 or 7.5–7.7 → 12 pts)
- Temp in range 22–28°C → 25 pts (borderline 20–22 or 28–30 → 12 pts)
- DO ≥ 5.5 mg/L → 25 pts (DO 4.5–5.5 → 12 pts)
- NH3 ≤ 0.5 ppm → 25 pts (NH3 0.5–1.0 → 12 pts)
- Missing reading for a parameter → 0 pts for that parameter

Status levels:
- 90–100: Excellent (green)
- 70–89: Needs Attention (amber)
- <70: Critical (red)

Renders: SVG ring chart (stroke-dashoffset animated on mount), large score number, status badge.

### `ParameterCard`
Props: `label`, `value`, `unit`, `range` ({min, max}), `sparklineData`, `status` ('healthy'|'warning'|'critical').

Renders: parameter name, current value + unit, status dot (green/amber/red — red pulses via `animate-pulse`), mini sparkline.

### `BreakEvenProgress`
Props: `currentMonth`, `breakEvenMonth`, `horizon`.

Renders: horizontal progress bar with labeled month markers at M0, M(breakEven), M(horizon). Fill = `(currentMonth / horizon) * 100%`. A "you are here" indicator. Text: "Month 8 of 12 — break-even reached."

### `InsightCard`
Props: `priority` ('critical'|'warning'|'opportunity'), `category`, `title`, `detail`, `metric`.

Maps to existing `Recommendation` type in Analytics. Colors:
- critical → red-50 bg, red-600 text
- warning → amber-50 bg, amber-600 text
- opportunity → green-50 bg, green-600 text

### `ScenarioSelector`
Props: `value`, `onChange`.

Three-button pill toggle: `[Pessimistic -25%]` `[Base]` `[Optimistic +30%]`. Active state: filled green pill. Used in both Dashboard KPI strip and Analytics header.

### `PeriodSelector`
Props: `value` ('7d'|'30d'|'90d'|'1y'), `onChange`.

Four-button pill toggle. Stored in component state (not persisted). Used in Dashboard and Analytics.

---

## Navigation Redesign

### Bug fix
Nav group labels pass raw i18n keys as `group.labelKey` to `<p>` directly without calling `tr()`. Fix: wrap with `tr(group.labelKey)`.

### Sidebar groups

```
FarmConnect [logo]

OVERVIEW
  Dashboard
  Analytics

OPERATIONS
  Surveys
  Farms & IoT
  Reports

INTELLIGENCE
  AI Advisor

─────────────
[Avatar] Name
         email  [logout]
```

Group labels translated via `tr()`. "Farms" nav item label changes from `tr('nav_farms')` to display "Farms & IoT" to signal IoT capability.

### Mobile bottom nav

```
[Dashboard] [Analytics] [Surveys] [Farms] [AI]
```

Replace `MoreHorizontal` icon for Farms with `Sprout` icon.

### Floating AI Copilot

A persistent `FloatingAdvisor` component added to `MainLayout` inside the main scroll area, `position: fixed`, `bottom-6 right-6`. Renders a green circular FAB with `Sparkles` icon. On click: slides up a `480×440px` panel using `motion.div` with `y: 400 → 0` animation. Panel shows 3 insight chips initially; expands to full chat. "Open full page" navigates to `ai-advisor` view.

Component: `frontend/src/app/components/ai/FloatingAdvisor.tsx`

---

## Dashboard: Mission Control

**File:** `frontend/src/app/components/dashboard/Dashboard.tsx` (full rewrite)

### Layout

```
Welcome back, [Name]           [7d][30d][90d][1y]

[Revenue] [Profit] [ROI] [Break-even] [Active Farms]
  KpiCard  KpiCard  KpiCard  BreakEvenProgress  KpiCard

─────────────────────────────────────────────────────
FARM HEALTH COMMAND CENTER
[FarmHealthScore ring]  |  [ParameterCard × 4]

─────────────────────────────────────────────────────
[Revenue vs Cost area chart 6mo]  |  [InsightCard × 3]
                                     AI INSIGHTS TODAY

─────────────────────────────────────────────────────
RECENT SURVEYS                           [View all →]
[table: Name | Type | ROI | Date | Status]
```

### Data sources

- `farmAPI.list()` → farm count, pick first farm for health score
- `farmAPI.records(farmId)` → IoT readings for health score and parameter cards
- `reportAPI.dashboard()` → top_sessions (recent surveys table), monthly_data (sparkline + area chart)
- AI Insights: computed client-side using `generateRecommendations()` logic from Analytics (move to a shared utility)

### KPI cards

1. **Revenue**: `allRevenue` from `top_sessions`. Sparkline from `monthly_data` revenue values.
2. **Profit**: computed as revenue minus costs from monthly_data.
3. **ROI**: `allRoi` from top_sessions average.
4. **Break-even**: `BreakEvenProgress` component using data from latest session's financial plan. Falls back to a simple "No data yet" state.
5. **Active Farms**: `farmsCount`. Delta shows how many are "healthy" (score ≥ 70) as a sub-label.

### Farm Health Command Center

Loaded from `farmAPI.records(farms[0].id)`. If no IoT data, shows an `EmptyState` with "Add your first water reading" CTA. No skeleton for health section — loads after farms load.

### AI Insights Panel

Pulls top 3 recommendations from Analytics `generateRecommendations()`. Move `generateRecommendations` to `utils/farmHealthUtils.ts` so Dashboard can use it without importing all of Analytics.

### Recent Surveys Table

Replace the dot-and-name list with a proper `<table>` (or equivalent grid):
```
Name         Type        ROI    Date      Status
────────────────────────────────────────────────
Tilapia Q1   Aquaponic  42%    2d ago    ✓
Wheat S2     Land       28%    1w ago    ✓
```

Max 5 rows. Each row clickable → navigates to Analytics.

---

## Analytics: Executive Dashboard

**File:** `frontend/src/app/components/analytics/Analytics.tsx` (restructure)

### Layout change

From: single scroll.
To: four named sections (smooth scroll within page, optional sticky mini-nav in Phase 7).

### Section 1 — Executive Summary

Same 4 KPI cards. Add:
- `BreakEvenProgress` bar spanning full width below KPIs
- NPV callout: small highlighted card `NPV ₹2.4L at 8% discount rate`

### Section 2 — Cash Flow

- Cumulative CF chart (all 3 scenarios overlaid) — unchanged
- Revenue vs OPEX bar chart — unchanged
- Cost donut + Revenue mix donut side-by-side — unchanged

### Section 3 — Scenario Forecasting

**Major upgrade.** Replace the tiny header toggle with three scenario comparison cards:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Pessimistic  │  │     Base     │  │  Optimistic  │
│    -25%      │  │  (selected)  │  │    +30%      │
│ Annual Rev   │  │ Annual Rev   │  │ Annual Rev   │
│   ₹3.1L      │  │   ₹4.2L      │  │   ₹5.4L      │
│ Profit ₹0.8L │  │ Profit ₹1.8L │  │ Profit ₹2.6L │
│ ROI   28%    │  │ ROI   42%    │  │ ROI   55%    │
│ Payback 14mo │  │ Payback 8mo  │  │ Payback 6mo  │
└──────────────┘  └──────────────┘  └──────────────┘
```

Clicking a card sets the active scenario (same behavior as current toggle). Active card has green border and subtle green-50 background. `AnimatePresence` crossfade on value change.

Below: scenario comparison bar chart (existing). Assumptions sliders (existing, keep collapsible).

### Section 4 — AI Recommendations

Existing recommendations list, styled as `InsightCard` components. Priority sort: critical first.

---

## Farms: IoT Health Center

**File:** `frontend/src/app/components/farms/FarmManagement.tsx` (restructure)

### Layout

Desktop: two-panel `grid-cols-[280px_1fr]`.
Mobile: stack (farm list collapses to a selector dropdown on mobile).

### Left panel — Farm list

Each item: farm name, system type badge, health score badge (`92 ●`). Active farm has green-50 bg + green border-l-2.

"+ Add Farm" button at bottom.

### Right panel — Farm detail

1. Farm info header: name (h2), system type + area + location (caption)
2. `FarmHealthScore` ring chart + score + status
3. `ParameterCard × 4` grid: pH, Temperature, DO, Ammonia
4. Historical Trends: Recharts `LineChart` with 4 series (one per parameter), last 30 readings, `ResponsiveContainer height=220`. Series toggleable via legend click.
5. "Add Reading" button opens existing form (keep as-is, just move to a `Sheet` / slide-in panel instead of inline form)

---

## Reports: Insight Library

**File:** `frontend/src/app/components/reports/Reports.tsx` (restructure)

### Header stats (keep existing)
3 stat chips: Total, This month, Downloads.

### Report cards grid
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

Each card:
- Project name (bold, `text-base`)
- Survey type badge (Aquaponic = green, Land = amber)
- Date (caption)
- Divider
- 4-cell metric preview: Revenue, ROI, Profit, Payback — sourced by cross-referencing `reportAPI.analytics()` `top_sessions` array (already cached at 60s TTL) with the report's `session_id`. If no match found, metric section is hidden entirely (no placeholder text).
- Two action buttons: `[↓ PDF]` and `[Open Analytics →]` (navigates to analytics with that session pre-selected)

---

## AI Advisor: Integrated Intelligence

**File:** `frontend/src/app/components/ai/AIAdvisor.tsx` (polish)

### Changes
- Remove decorative blur blobs (`absolute` div with `blur-3xl`)
- Page background: `bg-slate-50` (matches rest of app)
- Add "Today's Insights" section at the very top of the page: 3 auto-generated `InsightCard` components from latest survey's recommendations. Shows before any chat messages. Collapses if user has started chatting.
- Farm context card in right sidebar: shows selected survey's 4 key metrics inline (Revenue, ROI, Payback, NPV)
- Prompt suggestions stay as pills at the bottom of the input area

---

## Surveys Hub

**File:** `frontend/src/app/components/surveys/SurveysHub.tsx` (polish)

### Changes
- Two launch cards: increase padding, add estimated time ("~5 min"), add voice icon for aquaponic survey
- Add "Resume" badge if a session_id exists in localStorage for that type
- History table: add Status column (colored badge: `completed` = green, `in_progress` = amber), ROI column with trend arrow if available

---

## Animation Strategy

All animations use `motion` (Framer Motion v12, already installed).

| Element | Animation |
|---------|-----------|
| KPI cards | Stagger fade-in: `initial={{ opacity:0, y:12 }}`, `transition={{ delay: index * 0.06 }}` |
| KPI values | Count-up via `useMotionValue` → formatted string on mount |
| Health score ring | CSS `stroke-dashoffset` transition `duration: 1.2s ease-out` on mount |
| Parameter alert dot | `animate-pulse` Tailwind class on critical status |
| Scenario card switch | `AnimatePresence` + `layout` prop for smooth value crossfade |
| Insight cards | Stagger: `initial={{ opacity:0, y:8 }}`, `transition={{ delay: index * 0.05 }}` |
| Floating AI panel | `initial={{ y: 400, opacity: 0 }}` → `animate={{ y: 0, opacity: 1 }}` |
| Floating AI button | `whileHover={{ scale: 1.05 }}` `whileTap={{ scale: 0.95 }}` |
| Skeleton → content | `AnimatePresence` with `mode="wait"`, opacity fade |
| Chart areas | `opacity: 0 → 1` with `delay: 200ms` |
| Page-level | `initial={{ opacity: 0 }}` on page root `motion.div` |

**Not animated:** Nav items, form inputs, table rows, pagination.

---

## Shared Utility

**New file:** `frontend/src/app/utils/farmHealthUtils.ts`

Exports:
- `computeFarmHealthScore(readings: WaterReading[]): number` — extracts latest reading, applies formula
- `getHealthStatus(score: number): 'excellent' | 'warning' | 'critical'`
- `generateInsights(inputs: Inputs, metrics: Metrics): Recommendation[]` — renamed from `generateRecommendations` in Analytics; Analytics imports from here going forward

Used by: Dashboard, FarmHealthScore component, FarmManagement, Analytics.

---

## Implementation Roadmap

### Phase 1 — Design System & Shared Components (no screen changes)
Files: `src/styles/theme.css`, `src/app/components/ui/KpiCard.tsx`, `src/app/components/ui/FarmHealthScore.tsx`, `src/app/components/ui/ParameterCard.tsx`, `src/app/components/ui/BreakEvenProgress.tsx`, `src/app/components/ui/InsightCard.tsx`, `src/app/components/ui/ScenarioSelector.tsx`, `src/app/components/ui/PeriodSelector.tsx`, `src/app/utils/farmHealthUtils.ts`

### Phase 2 — Dashboard: Mission Control
Files: `src/app/components/dashboard/Dashboard.tsx`
Removes: `ChartCarousel` usage (component file kept but unused)

### Phase 3 — Analytics: Executive Dashboard
Files: `src/app/components/analytics/Analytics.tsx`
Key change: ScenarioCards section, BreakEvenProgress in summary

### Phase 4 — Farms: IoT Health Center
Files: `src/app/components/farms/FarmManagement.tsx`
Key change: two-panel layout, ParameterCards, historical LineChart

### Phase 5 — Reports + Surveys
Files: `src/app/components/reports/Reports.tsx`, `src/app/components/surveys/SurveysHub.tsx`

### Phase 6 — Floating AI Copilot
Files: `src/app/components/ai/FloatingAdvisor.tsx` (new), `src/app/components/layout/MainLayout.tsx` (add FloatingAdvisor)

### Phase 7 — Polish: AI Advisor page, nav bug fix, count-up counters, mobile pass
Files: `src/app/components/ai/AIAdvisor.tsx`, `src/app/components/layout/MainLayout.tsx` (nav group label bug fix), all KpiCard usages (count-up)

---

## What Is NOT Changed

- Backend: zero changes
- API layer (`utils/api.js`): zero changes
- Auth flow (`Login.tsx`, `Register.tsx`): zero changes
- Survey flow (`AISurvey.tsx`, `LandVoiceSurvey.tsx`): zero changes
- Store (`store/index.js`): zero changes
- i18n system (`utils/i18n.ts`): zero changes
- All existing Recharts chart logic: reused as-is, only layout/section changes
- All existing data fetching logic: moved or reused, not rewritten
