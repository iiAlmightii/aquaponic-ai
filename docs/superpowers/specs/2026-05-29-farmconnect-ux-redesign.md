# FarmConnect Frontend Redesign — Mission Control Architecture

**Date:** 2026-05-29
**Status:** Approved for implementation
**Approach:** Option B — Mission Control Architecture

---

## Problem Statement

The existing frontend answers "Am I making money?" partially, but fails to surface "Is my farm performing well?" or "What should I do next?" within 5 seconds. The UI feels like an admin CRUD dashboard with charts bolted on, not an investor-ready AgriTech SaaS product.

Failures identified in audit:
1. Dashboard quick-actions are navigation shortcuts, not intelligence
2. Analytics is ~1000 lines on a single scroll — no hierarchy
3. AI Advisor is page-isolated — not integrated as a persistent copilot
4. Farms is a plain CRUD form with no farm summary or financial context
5. Reports is a download list with no metric preview
6. Nav group labels render raw i18n key strings (bug: `nav_group_overview` shown literally)
7. No break-even progress visualization anywhere
8. `ChartCarousel` hides data behind swipe interactions
9. Inconsistent color semantics across components

---

## Design Philosophy

Every screen must answer one or more of:
1. **Am I making money?** → KPI strip with Revenue, Profit, ROI, Break-even progress
2. **Are my farms performing well?** → Survey performance stats, top crops, ROI trends
3. **What should I do next?** → AI Insights panel, priority-sorted recommendations

---

## Design System

### Color Tokens (extending `theme.css`)

```css
/* Semantic additions — no new dependencies */
--color-positive:  #16a34a;   /* green-600 — up trends, positive, CTAs */
--color-warning:   #d97706;   /* amber-600 — needs attention */
--color-critical:  #dc2626;   /* red-600   — alerts, critical */
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

### `BreakEvenProgress`
Props: `breakEvenMonth`, `horizon`, `reached` (boolean).

Renders: horizontal progress bar with labeled markers at M0, M(breakEven), M(horizon). Fill = `(breakEvenMonth / horizon) * 100%`. Text: "Break-even at Month 8 of 12" or "Break-even not reached in horizon." Falls back to `EmptyState`-style message if no financial data exists.

### `InsightCard`
Props: `priority` ('critical'|'warning'|'opportunity'), `category`, `title`, `detail`.

Maps to existing `Recommendation` type in Analytics. Colors:
- critical → red-50 bg, red-700 text, red-200 border
- warning → amber-50 bg, amber-700 text, amber-200 border
- opportunity → green-50 bg, green-700 text, green-200 border

### `ScenarioSelector`
Props: `value` ('base'|'pessimistic'|'optimistic'), `onChange`.

Three-button pill toggle: `[Pessimistic -25%]` `[Base]` `[Optimistic +30%]`. Active state: filled green pill. Used in Analytics header and Scenario section.

### `PeriodSelector`
Props: `value` ('7d'|'30d'|'90d'|'1y'), `onChange`.

Four-button pill toggle. Stored in component state (not persisted). Used in Dashboard.

### `SurveyPerformanceCard`
Props: `aquaCount`, `landCount`, `aquaAvgRoi`, `landAvgRoi`, `loading`.

Two side-by-side stat blocks (Aquaponics | Land Farming), each showing survey count and average ROI. Used in Dashboard.

---

## Navigation Redesign

### Bug fix
Nav group labels pass raw i18n keys as `group.labelKey` directly to `<p>` without calling `tr()`. Fix: `{tr(group.labelKey)}`.

### Sidebar groups

```
FarmConnect [logo]

OVERVIEW
  Dashboard
  Analytics

OPERATIONS
  Surveys
  Farms
  Reports

INTELLIGENCE
  AI Advisor

─────────────
[Avatar] Name
         email  [logout]
```

Group labels translated via `tr()`. No label changes to individual nav items beyond the group label bug fix.

### Mobile bottom nav

```
[Dashboard] [Analytics] [Surveys] [Farms] [AI]
```

Replace `MoreHorizontal` icon for Farms with `Sprout` icon.

### Floating AI Copilot

A persistent `FloatingAdvisor` component added to `MainLayout` inside the main content area, `position: fixed`, `bottom-6 right-6`. Renders a green circular FAB (40px) with `Sparkles` icon. On click: slides up a `480×440px` panel using `motion.div` with `y: 400 → 0` animation. Panel shows 3 insight chips from latest survey's recommendations initially; expands to full chat on demand. "Open full page →" link navigates to `ai-advisor` view. Uses the same `/ai/chat` endpoint as AIAdvisor, picking `session_id` from `localStorage.last_completed_session_id`.

Component: `frontend/src/app/components/ai/FloatingAdvisor.tsx`

---

## Dashboard: Mission Control

**File:** `frontend/src/app/components/dashboard/Dashboard.tsx` (full rewrite)

### Layout

```
Welcome back, [Name]               [7d] [30d] [90d] [1y]

┌──────────┬──────────┬──────────┬──────────────┬──────────┐
│ Revenue  │  Profit  │   ROI    │ Break-even   │  Farms   │
│  KpiCard │  KpiCard │  KpiCard │ BreakEven    │  KpiCard │
│          │          │          │ Progress     │          │
└──────────┴──────────┴──────────┴──────────────┴──────────┘

─────────────────────────────────────────────────────────────
SURVEY PERFORMANCE
┌──────────────────────────────┬──────────────────────────┐
│  SurveyPerformanceCard       │  Top Crops chart         │
│  Aquaponics: 4 surveys       │  (horizontal bar, from   │
│  Avg ROI: 42%                │   dashboard top_crops)   │
│  Land: 2 surveys             │                          │
│  Avg ROI: 28%                │                          │
└──────────────────────────────┴──────────────────────────┘

─────────────────────────────────────────────────────────────
┌──────────────────────────────┬──────────────────────────┐
│  Revenue vs Cost             │  AI INSIGHTS TODAY       │
│  (area chart, 6 months)      │  InsightCard × 3         │
│                              │  [→ Full Analysis]       │
└──────────────────────────────┴──────────────────────────┘

─────────────────────────────────────────────────────────────
RECENT SURVEYS                                 [View all →]
┌──────────────────────────────────────────────────────────┐
│ Name        │ Type       │ ROI   │ Date    │ Status      │
│─────────────────────────────────────────────────────────│
│ Tilapia Q1  │ Aquaponic  │ 42%   │ 2d ago  │ ✓ Complete │
│ Wheat S2    │ Land       │ 28%   │ 1w ago  │ ✓ Complete │
└──────────────────────────────────────────────────────────┘
```

### Data sources

- `farmAPI.list()` → `farmsCount` for Active Farms KpiCard
- `reportAPI.dashboard()` → `top_sessions` (recent surveys table + break-even data from latest session), `monthly_data` (sparklines, area chart), `top_crops` (top crops bar chart), `ai_completed_count`, `land_completed_count`, `ai_roi`, `land_roi` (survey performance)
- AI Insights: computed client-side using `generateInsights()` from `utils/analysisUtils.ts` applied to latest session's financial data

### KPI cards (5)

1. **Revenue** — `allRevenue` from `top_sessions`. Sparkline from `monthly_data` revenue values.
2. **Profit** — `allRevenue - allCost` from `monthly_data`. Sparkline from monthly profit values.
3. **ROI** — average `roi_percent` across `top_sessions`. Sparkline from monthly ROI values.
4. **Break-even** — `BreakEvenProgress` component. Data from latest session's `financial_plan.scenarios.base`. Shows "Month 8 / 12" with filled bar. Falls back to "—" if no session exists.
5. **Active Farms** — `farmsCount` from `farmAPI.list()`. Sub-label: "registered farms."

### Survey Performance section

`SurveyPerformanceCard` uses `dashboard.ai_completed_count`, `dashboard.land_completed_count`, `surveyStats.aquaRoi`, `surveyStats.landRoi` (already computed in current Dashboard code). No new API calls.

Top Crops bar chart: horizontal `BarChart` from `dashboard.top_crops`, 5 items max, sorted by revenue descending. Falls back to `EmptyState` if no crop data.

### AI Insights Panel

Top 3 items from `generateInsights()` applied to latest session's inputs and metrics. Rendered as `InsightCard` components, stagger-animated.

### Recent Surveys Table

Replaces the dot-and-name list with a proper grid/table: Name, Type badge, ROI, relative date, Status chip. Max 5 rows. Each row clickable → navigates to Analytics.

---

## Analytics: Executive Dashboard

**File:** `frontend/src/app/components/analytics/Analytics.tsx` (restructure)

### Layout change

From: single scroll.
To: four named sections, separated by visible section headers with dividers. Smooth scroll within the page.

### Section 1 — Executive Summary

Existing 4 KPI cards (`KPI` component → upgraded to use `KpiCard` styles). Below them:
- `BreakEvenProgress` bar spanning full width
- NPV callout: a narrow highlighted card `"NPV ₹2.4L · 8% discount rate · 24-month horizon"`

### Section 2 — Cash Flow

- Cumulative CF line chart (3 scenarios overlaid) — logic unchanged
- Revenue vs OPEX bar chart — logic unchanged
- Cost breakdown donut + Revenue mix donut side-by-side — logic unchanged

### Section 3 — Scenario Forecasting

**Major upgrade.** Replace the tiny three-button pill toggle in the header with three prominent comparison cards:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Pessimistic  │  │     Base     │  │  Optimistic  │
│    −25%      │  │  ● selected  │  │    +30%      │
│              │  │              │  │              │
│ Rev  ₹3.1L   │  │ Rev  ₹4.2L   │  │ Rev  ₹5.4L   │
│ Profit ₹0.8L │  │ Profit ₹1.8L │  │ Profit ₹2.6L │
│ ROI    28%   │  │ ROI    42%   │  │ ROI    55%   │
│ Payback 14mo │  │ Payback 8mo  │  │ Payback 6mo  │
└──────────────┘  └──────────────┘  └──────────────┘
```

Clicking a card sets the active scenario (same state logic as current). Active card: `border-green-500 bg-green-50`. Values animate with `AnimatePresence` on scenario change.

Below: existing scenario comparison horizontal bar chart. Assumptions sliders section (existing, keep collapsible, label: "Adjust Assumptions — Live Recalculation").

### Section 4 — AI Recommendations

Existing recommendations list restyled as `InsightCard` components, sorted critical → warning → opportunity.

---

## Farms: Farm Management

**File:** `frontend/src/app/components/farms/FarmManagement.tsx` (layout restructure only)

### Layout

Desktop: two-panel `grid-cols-[260px_1fr]`.
Mobile: single column — farm selector dropdown at top, detail below.

### Left panel — Farm list

Each farm item shows: farm name, system type badge (Aquaponics / Land), area (if set). Active farm: green-50 bg + green `border-l-2`. "Add Farm" button at bottom of list.

### Right panel — Farm detail

When a farm is selected:
1. **Header**: Farm name (h2), system type badge, area (m²), location — caption row
2. **Farm stats row**: 3 metric chips from the farm's latest completed survey (if available via `reportAPI.analytics()` cross-reference on farm name match): Latest Revenue, Latest ROI, Survey Count. Falls back gracefully if no survey data found.
3. **Add/Edit form**: existing form fields (name, location, area, system_type) in a clean `Card` layout. Currently inline, stays inline — no modal needed.
4. **Recent readings section**: the existing raw readings table, kept as-is for now. No chart (IoT not in scope).

---

## Reports: Insight Library

**File:** `frontend/src/app/components/reports/Reports.tsx` (restructure)

### Header stats (keep existing)
3 stat chips: Total reports, This month, Downloads.

### Report cards grid
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

Each card:
- Project name (`text-base font-semibold`)
- Survey type badge (Aquaponic = green, Land = amber)
- Generated date (caption)
- Divider
- 4-cell metric grid: Revenue, Profit, ROI, Payback — sourced by cross-referencing `reportAPI.analytics()` `top_sessions` (cached 60s) with the report's `session_id`. If no match, metric section hidden entirely.
- Two action buttons: `[↓ PDF]` and `[Open Analytics →]` (sets session context and navigates to analytics view)

---

## AI Advisor: Integrated Intelligence

**File:** `frontend/src/app/components/ai/AIAdvisor.tsx` (polish)

### Changes
- Remove decorative blur blobs (the two `absolute` divs with `blur-3xl` bg colors)
- Page background: `bg-slate-50` (matches rest of platform)
- Add **"Today's Insights"** collapsible section at top of page: 3 `InsightCard` components auto-generated from latest survey's recommendations via `generateInsights()`. Visible when `messages.length === 0`; collapses (via `AnimatePresence`) once the user sends their first message
- Right sidebar: add a **Farm Context card** below "Advisor mode" — shows selected survey's project name, 4 key metrics (Revenue, ROI, Payback, NPV) if session data is available in Zustand `analysis` state
- Keep prompt suggestion pills at input area bottom

---

## Surveys Hub

**File:** `frontend/src/app/components/surveys/SurveysHub.tsx` (polish)

### Changes
- Two launch cards: increase to `p-6`, add estimated time badge ("~5 min"), voice icon (`Mic`) on Aquaponic card
- Add "Resume →" badge on the relevant card if `localStorage.getItem('aqua_session_id')` or `localStorage.getItem('land_survey_session_id')` exists
- History table: add **Status** column (colored badge: `completed` = green, in-progress = amber), add **ROI** column with value and green/red arrow

---

## Animation Strategy

All animations use `motion` (Framer Motion v12, already installed as `motion/react`).

| Element | Animation |
|---------|-----------|
| KPI cards | Stagger fade-in: `initial={{ opacity:0, y:12 }}`, `transition={{ delay: index * 0.06 }}` |
| KPI values | Count-up on mount: `useMotionValue(0)` animated to target, formatted via `useTransform` |
| Scenario card switch | `AnimatePresence` + `layout` prop on metric values for crossfade |
| Insight cards | Stagger: `initial={{ opacity:0, y:8 }}`, `transition={{ delay: index * 0.05 }}` |
| Today's Insights collapse | `AnimatePresence` `height: auto → 0` |
| Floating AI panel | `initial={{ y: 400, opacity: 0 }}` → `animate={{ y: 0, opacity: 1 }}` |
| Floating AI button | `whileHover={{ scale: 1.05 }}` `whileTap={{ scale: 0.95 }}` |
| Skeleton → content | `AnimatePresence mode="wait"` opacity fade |
| Chart load | `initial={{ opacity: 0 }}` with `delay: 150ms` |
| Page root | `initial={{ opacity: 0 }}` `animate={{ opacity: 1 }}` on each page's root `motion.div` |

**Not animated:** Nav items, form inputs, table rows, pagination controls.

---

## Shared Utility

**New file:** `frontend/src/app/utils/analysisUtils.ts`

Exports:
- `generateInsights(inputs: Inputs, metrics: Metrics): Recommendation[]` — renamed from `generateRecommendations` in `Analytics.tsx`. Analytics imports from here going forward. Used by Dashboard AI Insights panel and FloatingAdvisor.

No IoT utilities. The file is purely financial analysis helpers.

---

## Implementation Roadmap

### Phase 1 — Design System & Shared Components
New/modified files:
- `src/styles/theme.css` — 4 semantic color tokens
- `src/app/components/ui/KpiCard.tsx` — replaces StatCard
- `src/app/components/ui/BreakEvenProgress.tsx`
- `src/app/components/ui/InsightCard.tsx`
- `src/app/components/ui/ScenarioSelector.tsx`
- `src/app/components/ui/PeriodSelector.tsx`
- `src/app/components/ui/SurveyPerformanceCard.tsx`
- `src/app/utils/analysisUtils.ts` — `generateInsights` extracted from Analytics

### Phase 2 — Dashboard: Mission Control
- `src/app/components/dashboard/Dashboard.tsx` — full rewrite
- Removes: `ChartCarousel` usage (file kept, now unused)

### Phase 3 — Analytics: Executive Dashboard
- `src/app/components/analytics/Analytics.tsx` — restructure into 4 sections
- Key additions: ScenarioCards, BreakEvenProgress, InsightCard styling
- Import `generateInsights` from `analysisUtils.ts` (remove local definition)

### Phase 4 — Farms: Farm Management
- `src/app/components/farms/FarmManagement.tsx` — two-panel layout restructure

### Phase 5 — Reports + Surveys
- `src/app/components/reports/Reports.tsx` — card grid with metric previews
- `src/app/components/surveys/SurveysHub.tsx` — polish launch cards + history table

### Phase 6 — Floating AI Copilot
- `src/app/components/ai/FloatingAdvisor.tsx` — new component
- `src/app/components/layout/MainLayout.tsx` — mount FloatingAdvisor

### Phase 7 — Polish
- `src/app/components/ai/AIAdvisor.tsx` — Today's Insights, remove blobs, farm context card
- `src/app/components/layout/MainLayout.tsx` — fix nav group i18n bug
- All `KpiCard` usages — add count-up animation
- Mobile responsive pass across all redesigned screens

---

## What Is NOT Changed

- Backend: zero changes
- API layer (`utils/api.js`): zero changes
- Auth flow (`Login.tsx`, `Register.tsx`): zero changes
- Survey flow (`AISurvey.tsx`, `LandVoiceSurvey.tsx`): zero changes
- Store (`store/index.js`): zero changes
- i18n system (`utils/i18n.ts`): zero changes
- All existing Recharts chart logic: reused as-is, only layout and section structure changes
- All existing data-fetching logic: moved or reused, not rewritten
- IoT / water readings: not in scope, existing `farmAPI.records()` call in FarmManagement left as-is but not visualized
