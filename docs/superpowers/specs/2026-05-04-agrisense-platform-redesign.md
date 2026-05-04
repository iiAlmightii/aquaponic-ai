# AgriSense Platform Redesign — Design Spec

**Date:** 2026-05-04
**Scope:** Full-app visual redesign + UX polish + performance hardening
**Goal:** Transform the current AquaponicAI app into a polished, publication-ready platform called AgriSense — suitable for IEEE paper screenshots, investor demos, and real farmer use.

---

## 1. Brand & Identity

| Token | Value |
|---|---|
| Product name | **AgriSense** (replaces "AquaponicAI" everywhere) |
| Tagline | Farm Intelligence Platform |
| Primary color | `#16a34a` (green-600) |
| Primary light | `#4ade80` (green-400) |
| Primary tint | `#f0fdf4` (green-50) |
| Sidebar bg | `#ffffff` (white) |
| Page bg | `#f8fafc` (slate-50) |
| Card bg | `#ffffff` |
| Border | `#e2e8f0` (slate-200) |
| Text primary | `#0f172a` (slate-900) |
| Text secondary | `#64748b` (slate-500) |
| Text muted | `#94a3b8` (slate-400) |
| Warning | `#f59e0b` (amber-500) |
| Error | `#ef4444` (red-500) |
| Font | Inter (already loaded via Tailwind) |

**Logo mark:** Green rounded square icon with a leaf/plant SVG inside. No emojis anywhere in the UI.

---

## 2. Navigation

### Desktop — Light Sidebar (220px wide)

```
┌─────────────────────┐
│ [🌱icon] AgriSense  │  ← brand lockup
├─────────────────────┤
│ OVERVIEW            │  ← nav group label
│   Dashboard         │  ← active: bg green-50, text green-800
│   Analytics         │
├─────────────────────┤
│ FARMING             │
│   Surveys           │
│   Farms             │
│   Reports           │
├─────────────────────┤
│ INTELLIGENCE        │
│   AI Advisor        │
├─────────────────────┤
│ [avatar] Chandan K  │  ← user chip at bottom
│          Farm Owner │
└─────────────────────┘
```

- All icons: Lucide React SVG icons (16px), no emojis
- Active state: `bg-green-50 text-green-800 font-semibold`
- Hover state: `bg-slate-50 text-slate-700`
- Inactive: `text-slate-500`
- Nav group labels: 10px uppercase, `text-slate-400`, letter-spacing wide

### Mobile — Bottom Navigation Bar

Five tabs at bottom: Dashboard, Surveys, Analytics, AI Advisor, More (farms + reports under "More"). No sidebar on mobile — full-width content area.

### Top Bar (per page)

- Left: Page title (16px, 700 weight) + subtitle (12px, muted)
- Right: Status pill (DB connected indicator) + primary CTA button ("+ New Survey" on Dashboard)
- Background: white, border-bottom slate-200, height 56px

---

## 3. Design System Components

### Stat / KPI Cards
- White card, 1px slate-200 border, 12px border-radius
- 3px colored top-border accent (green / blue / amber / purple per metric)
- Structure: icon block (36×36 rounded-10, tinted bg) → value (24px 800 weight) → label (12px muted) → trend indicator (11px, green for up, red for down)
- Grid: 4 columns on desktop, 2×2 on tablet, 2×2 on mobile

### Chart Carousel
- Single chart card, full width, with tab switcher (pill tabs top-right)
- 4 chart views:
  1. **Revenue vs Cost** — grouped bar chart (Recharts BarChart), 6-month window
  2. **ROI Trend** — area line chart (Recharts AreaChart) with gradient fill
  3. **Top Crops by Profit** — donut/pie chart (Recharts PieChart) with legend
  4. **Survey Activity** — 2×2 metric tiles (counts + avg ROI by type)
- Chart height: 200px on desktop, 180px on mobile
- All charts: responsive containers, no hard-coded pixel widths
- Tooltip on hover for all data points
- Empty state when no data: illustration + "Complete a survey to see insights"

### Loading States — Shimmer Skeletons
Every data-dependent section shows a skeleton while loading. No "data unavailable" text, no broken states visible to users.

```
Skeleton pulse: bg gradient slate-100→slate-200→slate-100, 1.4s animation
Card skeleton:  matches card dimensions exactly
Table skeleton: 4 rows of placeholder lines
Chart skeleton: rectangular placeholder at chart height
```

### Empty States
- Friendly illustration (simple SVG, green accent)
- Headline: "No surveys yet" / "No farms added"
- CTA button to take the next action
- Never show raw API errors to users

### Badges / Pills
- `Aquaponic`: green-50 bg, green-800 text, green-200 border
- `Land`: amber-50 bg, amber-800 text, amber-200 border
- `Completed`: green fill
- `In Progress`: amber fill
- `Failed`: red fill

### Buttons
- **Primary**: `bg-green-600 text-white hover:bg-green-700`, 8px radius, 12px font, 600 weight
- **Secondary**: `bg-white text-slate-800 border border-slate-200 hover:bg-slate-50`
- **Ghost**: `text-green-600 border border-green-200 hover:bg-green-50`
- **Destructive**: `bg-red-600 text-white hover:bg-red-700`

---

## 4. Screen-by-Screen Design

### 4.1 Dashboard

**Layout:** Topbar → KPI row (4 cards) → [Chart Carousel | Recent Surveys] → [Quick Actions | Recent Activity]

**KPI Cards (4):**
1. Monthly Revenue (₹) — green accent
2. Average ROI (%) — blue accent
3. Avg Payback Period (months) — amber accent
4. Active Farms (count) — purple accent

**Chart Carousel:** 4 tabs as described in section 3.

**Recent Surveys panel** (right column, 360px):
- List of last 4 completed surveys
- Each row: type dot (green=aquaponic, amber=land) → name → type badge → ROI value
- "View all" link at bottom

**Recent Activity feed** (bottom right):
- Derived from `reportAPI.history()` (already called on Dashboard mount) — no new backend endpoint needed
- Shows last 4 entries: survey completed events with farm name + relative timestamp
- Each item: colored icon, description, relative timestamp
- Replaces the removed "System Health" panel entirely

**Quick Actions** (bottom left, 3 cards):
- Start Aquaponic Survey
- Start Land Survey
- Ask AI Advisor

**Performance:** All 3 data calls (farms, analytics, reports) run in parallel via `Promise.allSettled`. Each section shows its own skeleton independently — partial data renders immediately, no full-page spinner.

### 4.2 Analytics

**Layout:** Topbar → Survey selector (dropdown) → metric cards → charts → detailed tables

**Survey selector:** Dropdown at top — "Viewing: [survey name]". Auto-selects latest. Changing selection re-renders the whole page for that survey.

**Sections (aquaponic):**
- Scenario cards: Base / Pessimistic / Optimistic side-by-side
- Revenue breakdown bar chart
- Financial timeline (payback curve)
- Recommendations from LLM (card with green left border)

**Sections (land):**
- Crop performance table with revenue/cost/profit per crop
- Market price table with override capability
- Financial summary card

**Empty state:** If no surveys exist → full-page empty state with CTA to start a survey. No "No Analysis Yet" text that looks like a bug.

**Performance:** Survey list and analytics data load in parallel on mount. No sequential waterfalls.

### 4.3 Surveys

**Layout:** Two cards side by side — "Start Aquaponic Survey" and "Start Land Survey". Below: history of past surveys as a table.

**Survey cards:**
- Icon, title, description, estimated time, "Start" button
- Shows count of completed surveys for that type

**History table:**
- Columns: Name, Type, Date, ROI, Status, Actions (View / Download PDF)
- Sortable by date
- Status badge per row

### 4.4 AI Advisor

**Layout:** Topbar → Survey context selector → chat window → input bar

**Survey selector:** Dropdown "Advising for: [survey name]" — already implemented, keep and polish to match new design system.

**Chat bubbles:**
- User: `bg-green-600 text-white`, right-aligned
- AI: `bg-white border border-slate-200 text-slate-800`, left-aligned, shadow-sm
- Thinking state: animated dots

**Empty state:** "Select a survey above and ask anything about your farm, crops, or finances."

### 4.5 Farms

**Layout:** Grid of farm cards + "Add Farm" button.

**Farm card:**
- Farm name, type badge, location, date added
- Water quality mini-status (if IoT readings exist)
- "View Details" link

### 4.6 Reports

**Layout:** Table of all generated reports.

**Columns:** Survey name, Type, Date, Scenarios, Actions (View / Download PDF / Share)

---

## 5. Performance & Reliability

### Parallel Data Loading
- Dashboard: `Promise.allSettled([farmAPI.list(), reportAPI.analytics(), reportAPI.history()])` — all parallel
- Analytics: survey list + analytics data in parallel on mount
- No page-level loading spinners — section-level skeletons only

### Error Handling (user-facing)
- API errors → inline error state in the affected section only, not full page
- Network timeout → retry button in the section
- Auth errors → redirect to login
- Never show stack traces, raw error objects, or "undefined" to users

### Connection Resilience
- DB connection pool (already implemented) — no NullPool
- Health status pill in topbar: green dot "Connected" / amber "Degraded" / red "Offline"
- This is the only place DB status is shown — not on a System Health panel

---

## 6. Mobile Responsive Rules

| Breakpoint | Layout |
|---|---|
| < 768px (mobile) | Bottom nav, single column, full-width cards |
| 768–1024px (tablet) | Sidebar collapses to icon-only (48px), 2-col content |
| > 1024px (desktop) | Full 220px sidebar, multi-column content |

Chart carousel: full width on all breakpoints. Recharts `<ResponsiveContainer width="100%" height={200}>` on all charts.

---

## 7. Implementation Approach

### Tech Stack (no new dependencies — both chart and icon libraries already installed)
- **Recharts 2.15.2** — already in package.json, use for all charts
- **Lucide React 0.487.0** — already in package.json, replaces current ad-hoc inline SVG usage
- **Tailwind CSS** — all styling via utility classes, no new CSS files
- No UI component library (shadcn/radix) — keep it simple, custom components only

### File Structure
```
frontend/src/app/
  components/
    layout/
      Sidebar.tsx          ← new: shared sidebar
      TopBar.tsx           ← new: shared topbar
      MobileNav.tsx        ← new: bottom nav
      AppShell.tsx         ← new: wraps sidebar + topbar + content
    ui/
      StatCard.tsx         ← new: reusable KPI card
      SkeletonCard.tsx     ← new: shimmer skeleton
      EmptyState.tsx       ← new: empty state with CTA
      Badge.tsx            ← new: type/status badges
      ChartCarousel.tsx    ← new: carousel wrapper
    dashboard/Dashboard.tsx  ← refactored
    analytics/Analytics.tsx  ← refactored
    surveys/               ← refactored
    ai/AIAdvisor.tsx       ← refactored (already updated)
    farms/FarmManagement.tsx ← refactored
    reports/               ← refactored
```

### Rollout Order
1. Build shared layout components (AppShell, Sidebar, TopBar, MobileNav)
3. Build UI primitives (StatCard, SkeletonCard, EmptyState, Badge, ChartCarousel)
4. Refactor Dashboard (most visible, validates the system)
5. Refactor Analytics
6. Refactor remaining screens (Surveys, AI Advisor, Farms, Reports)
7. Rename brand strings "AquaponicAI" → "AgriSense" across all files
8. Final pass: mobile responsive test on all screens

---

## 8. Out of Scope

- Backend API changes (design is purely frontend)
- Authentication / login screen redesign
- New features beyond what currently exists
- Dark mode
- Internationalization (Hindi/regional languages)
