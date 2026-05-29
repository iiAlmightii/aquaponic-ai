# FarmConnect UX Redesign — Mission Control Architecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the FarmConnect frontend from a CRUD admin dashboard into an investor-ready AgriTech Mission Control that answers "Am I making money?", "Are my farms performing well?", and "What should I do next?" within 5 seconds.

**Architecture:** 7 independent phases that each ship without breaking the running app. Phase 1 builds the shared component library all other phases depend on. Each subsequent phase replaces one screen or layout piece. The existing data-fetching logic, API layer, store, auth flow, and survey flow are untouched.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), Recharts 2, Framer Motion v12 (`motion/react`), Zustand, Lucide icons. All dependencies already installed.

---

## File Map

**Create:**
- `frontend/src/app/utils/analysisUtils.ts` — shared types + financial calculation functions extracted from Analytics
- `frontend/src/app/components/ui/KpiCard.tsx` — KPI display with sparkline and delta badge
- `frontend/src/app/components/ui/BreakEvenProgress.tsx` — animated break-even progress bar
- `frontend/src/app/components/ui/InsightCard.tsx` — priority-coloured AI recommendation card
- `frontend/src/app/components/ui/ScenarioSelector.tsx` — 3-button scenario pill toggle
- `frontend/src/app/components/ui/PeriodSelector.tsx` — 4-button period pill toggle
- `frontend/src/app/components/ui/SurveyPerformanceCard.tsx` — aquaponic/land survey stats
- `frontend/src/app/components/ai/FloatingAdvisor.tsx` — persistent floating AI copilot FAB + panel

**Modify:**
- `frontend/src/styles/theme.css` — add 4 semantic color tokens
- `frontend/src/app/components/dashboard/Dashboard.tsx` — full Mission Control rewrite
- `frontend/src/app/components/analytics/Analytics.tsx` — add sections, ScenarioCards, BreakEvenProgress, InsightCards; extract shared logic to analysisUtils
- `frontend/src/app/components/farms/FarmManagement.tsx` — layout polish, remove PretextText
- `frontend/src/app/components/reports/Reports.tsx` — card grid with metric preview
- `frontend/src/app/components/surveys/SurveysHub.tsx` — launch card polish, resume badge, ROI column
- `frontend/src/app/components/ai/AIAdvisor.tsx` — remove blur blobs, Today's Insights, farm context card
- `frontend/src/app/components/layout/MainLayout.tsx` — fix nav i18n bug, mount FloatingAdvisor

---

## Task 1: Design Tokens + analysisUtils.ts

**Files:**
- Modify: `frontend/src/styles/theme.css`
- Create: `frontend/src/app/utils/analysisUtils.ts`

- [ ] **Step 1: Add semantic color tokens to theme.css**

Open `frontend/src/styles/theme.css`. After the existing `:root` block's last variable (`--sidebar-ring: oklch(0.708 0 0);`), insert inside `:root`:

```css
  --color-positive:  #16a34a;
  --color-warning:   #d97706;
  --color-critical:  #dc2626;
  --color-info:      #2563eb;
```

- [ ] **Step 2: Create `frontend/src/app/utils/analysisUtils.ts`**

This file extracts all shared types and calculation functions from `Analytics.tsx`. They are copied exactly — do not change the logic.

```ts
// Shared financial analysis types and utilities.
// Analytics.tsx imports from here; Dashboard and FloatingAdvisor also use generateInsights.

export type Priority = 'high' | 'medium' | 'low';

export interface FlowRow {
  month: number;
  revenue: number;
  opex: number;
  net: number;
  cumulative: number;
}

export interface Inputs {
  fishRev: number;
  cropRev: number;
  capex: number;
  feed: number;
  labor: number;
  util: number;
  maint: number;
  other: number;
  horizon: number;
}

export interface Metrics {
  monthRev: number;
  monthOpex: number;
  monthNet: number;
  annRev: number;
  annOpex: number;
  annProfit: number;
  roi: number;
  payback: number | null;
  breakEvenMonth: number | null;
  flows: FlowRow[];
  npv: number;
  capex: number;
}

export interface Recommendation {
  priority: Priority;
  category: string;
  title: string;
  detail: string;
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtRs(value: number): string {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

export function buildInputs(analysis: any): Inputs {
  const answers = analysis?.farm_answers || {};
  const plan = analysis?.financial_plan || {};
  const baseCashFlows = plan?.scenarios?.base?.cash_flows || [];
  const horizonFromPlan =
    Array.isArray(baseCashFlows) && baseCashFlows.length > 0 ? baseCashFlows.length : 24;

  return {
    fishRev: num(answers.monthly_fish_revenue, 55000),
    cropRev: num(answers.monthly_crop_revenue, 18000),
    capex: num(
      plan.total_capex,
      num(answers.infrastructure_cost, 300000) +
        num(answers.equipment_cost, 150000) +
        num(answers.initial_stock_cost, 50000),
    ),
    feed: num(answers.monthly_feed_cost, 12000),
    labor: num(answers.monthly_labor_cost, 20000),
    util: num(answers.monthly_utilities_cost, 7000),
    maint: num(answers.monthly_maintenance_cost, 3000),
    other: num(answers.monthly_other_cost, 2000),
    horizon: Math.max(6, Math.min(60, num(horizonFromPlan, 24))),
  };
}

export function buildLandInputs(landDashboard: any): Inputs {
  const summary = landDashboard?.summary || {};
  const costs = landDashboard?.cost_breakdown || {};

  return {
    fishRev: 0,
    cropRev: num(summary.total_revenue, 0) / 12,
    capex: Math.max(100000, num(summary.total_capex, 300000)),
    feed: num(costs.seeds, 0) / 12,
    labor: (num(costs.labor, 0) + num(costs.seasonal_labor, 0)) / 12,
    util: (num(costs.electricity, 0) + num(costs.fuel, 0) + num(costs.transport, 0)) / 12,
    maint: (num(costs.maintenance, 0) + num(costs.land_rent, 0) + num(costs.pesticide, 0)) / 12,
    other: 0,
    horizon: 12,
  };
}

export function computeMetrics(inp: Inputs, factor = 1): Metrics {
  const monthRev = (inp.fishRev + inp.cropRev) * factor;
  const monthOpex = inp.feed + inp.labor + inp.util + inp.maint + inp.other;
  const monthNet = monthRev - monthOpex;
  const annRev = monthRev * 12;
  const annOpex = monthOpex * 12;
  const annProfit = annRev - annOpex;
  const roi = inp.capex > 0 ? (annProfit / inp.capex) * 100 : 0;
  const payback = monthNet > 0 ? inp.capex / monthNet : null;

  const flows: FlowRow[] = [];
  let cumulative = -inp.capex;
  let breakEvenMonth: number | null = null;

  for (let m = 1; m <= inp.horizon; m += 1) {
    cumulative += monthNet;
    if (cumulative >= 0 && breakEvenMonth === null) breakEvenMonth = m;
    flows.push({
      month: m,
      revenue: Math.round(monthRev),
      opex: Math.round(monthOpex),
      net: Math.round(monthNet),
      cumulative: Math.round(cumulative),
    });
  }

  const monthlyRate = Math.pow(1.08, 1 / 12) - 1;
  const npv =
    -inp.capex +
    flows.reduce((acc, _, i) => acc + monthNet / Math.pow(1 + monthlyRate, i + 1), 0);

  return {
    monthRev, monthOpex, monthNet, annRev, annOpex, annProfit,
    roi, payback, breakEvenMonth, flows, npv: Math.round(npv), capex: inp.capex,
  };
}

export function generateInsights(inp: Inputs, base: Metrics): Recommendation[] {
  const recs: Recommendation[] = [];
  const totalOpex = inp.feed + inp.labor + inp.util + inp.maint + inp.other;
  const feedRatio = totalOpex > 0 ? inp.feed / totalOpex : 0;
  const totalRevenue = inp.fishRev + inp.cropRev;
  const fishShare = totalRevenue > 0 ? inp.fishRev / totalRevenue : 0;

  if (feedRatio > 0.38) {
    recs.push({
      priority: 'high',
      category: 'Cost Reduction',
      title: `Feed cost is ${Math.round(feedRatio * 100)}% of OPEX`,
      detail: `Target below 35% via improved feed conversion and bulk purchasing. Estimated saving: ${fmtRs(inp.feed * 0.1)}/month.`,
    });
  }
  if (base.payback && base.payback > 24) {
    recs.push({
      priority: 'medium',
      category: 'Revenue',
      title: `Payback is ${Math.round(base.payback)} months`,
      detail: `Introduce direct sales channels to improve margin. Potential uplift: ${fmtRs((inp.fishRev + inp.cropRev) * 0.15)}/month.`,
    });
  }
  if (fishShare > 0.8) {
    recs.push({
      priority: 'medium',
      category: 'Diversification',
      title: `${Math.round(fishShare * 100)}% of revenue comes from fish`,
      detail: 'Reduce concentration risk by adding higher-value crops to the grow bed portfolio.',
    });
  }
  if (base.roi > 25 && base.payback && base.payback < 24) {
    recs.push({
      priority: 'low',
      category: 'Growth',
      title: `ROI is healthy at ${Math.round(base.roi)}%`,
      detail: 'Consider staged expansion funded from operating surplus to preserve cash-flow safety.',
    });
  }
  if (inp.util > inp.feed * 1.2) {
    recs.push({
      priority: 'high',
      category: 'Energy',
      title: 'Utilities exceed feed cost',
      detail: 'Audit pumps and lighting; efficient pumps and LED controls can materially reduce power cost.',
    });
  }
  if (recs.length === 0) {
    recs.push({
      priority: 'low',
      category: 'Performance',
      title: 'Current assumptions are balanced',
      detail: 'Cost and revenue mix are within healthy bounds. Focus on consistency and market stability.',
    });
  }
  return recs;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `analysisUtils.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/theme.css frontend/src/app/utils/analysisUtils.ts
git commit -m "feat: add semantic color tokens and extract analysisUtils shared library"
```

---

## Task 2: KpiCard Component

**Files:**
- Create: `frontend/src/app/components/ui/KpiCard.tsx`

- [ ] **Step 1: Create `frontend/src/app/components/ui/KpiCard.tsx`**

```tsx
import { type LucideIcon } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Skeleton } from './skeleton';
import { cn } from './utils';

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  sparklineData?: number[];
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaPositive,
  sparklineData,
  icon: Icon,
  iconColor = 'text-slate-400',
  loading,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-3.5 w-24 bg-slate-100" />
        <Skeleton className="h-7 w-28 bg-slate-100" />
        <Skeleton className="h-3 w-16 bg-slate-100" />
      </div>
    );
  }

  const chartData = (sparklineData ?? []).map((v, i) => ({ i, v }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={cn('w-4 h-4 flex-shrink-0', iconColor)} />
      </div>
      <p className="text-2xl font-bold tabular-nums text-slate-900 leading-tight">{value}</p>
      <div className="flex items-end justify-between mt-2 gap-2">
        {delta ? (
          <span
            className={cn(
              'text-xs font-semibold',
              deltaPositive === false ? 'text-red-500' : 'text-green-600',
            )}
          >
            {deltaPositive === false ? '↓' : '↑'} {delta}
          </span>
        ) : (
          <span />
        )}
        {chartData.length > 1 && (
          <div className="w-16 h-5 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={deltaPositive === false ? '#ef4444' : '#16a34a'}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep KpiCard
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/ui/KpiCard.tsx
git commit -m "feat: add KpiCard component with sparkline and delta badge"
```

---

## Task 3: BreakEvenProgress Component

**Files:**
- Create: `frontend/src/app/components/ui/BreakEvenProgress.tsx`

- [ ] **Step 1: Create `frontend/src/app/components/ui/BreakEvenProgress.tsx`**

```tsx
interface BreakEvenProgressProps {
  breakEvenMonth: number | null;
  horizon: number;
}

export function BreakEvenProgress({ breakEvenMonth, horizon }: BreakEvenProgressProps) {
  if (!breakEvenMonth) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium text-slate-500 mb-1">Break-even</p>
        <p className="text-2xl font-bold text-slate-300">—</p>
        <p className="text-xs text-slate-400 mt-1">Complete a survey to see break-even</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((breakEvenMonth / horizon) * 100));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">Break-even</p>
      <p className="text-2xl font-bold tabular-nums text-slate-900 leading-tight">
        Month {breakEvenMonth}
      </p>
      <p className="text-xs text-slate-400 mb-3">of {horizon}-month horizon</p>
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-slate-400">M0</span>
        <span className="text-[10px] font-semibold text-green-600">M{breakEvenMonth}</span>
        <span className="text-[10px] text-slate-400">M{horizon}</span>
      </div>
    </div>
  );
}
```

This component is also used inline in Analytics (not as a KPI card variant) — a wider version. The same component works in both contexts because it adapts to its container width.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/components/ui/BreakEvenProgress.tsx
git commit -m "feat: add BreakEvenProgress component"
```

---

## Task 4: InsightCard Component

**Files:**
- Create: `frontend/src/app/components/ui/InsightCard.tsx`

- [ ] **Step 1: Create `frontend/src/app/components/ui/InsightCard.tsx`**

```tsx
import { AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from './utils';

type InsightLevel = 'critical' | 'warning' | 'opportunity';

interface InsightCardProps {
  priority: string; // accepts 'high'|'medium'|'low'|'critical'|'warning'|'opportunity'
  category: string;
  title: string;
  detail: string;
  index?: number;
}

const PRIORITY_MAP: Record<string, InsightLevel> = {
  high: 'critical',
  medium: 'warning',
  low: 'opportunity',
  critical: 'critical',
  warning: 'warning',
  opportunity: 'opportunity',
};

const CONFIG: Record<InsightLevel, { bg: string; border: string; text: string; badge: string; Icon: typeof AlertTriangle }> = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    Icon: AlertTriangle,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    Icon: Info,
  },
  opportunity: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
    Icon: TrendingUp,
  },
};

export function InsightCard({ priority, category, title, detail, index = 0 }: InsightCardProps) {
  const level: InsightLevel = PRIORITY_MAP[priority] ?? 'opportunity';
  const c = CONFIG[level];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className={cn('rounded-xl border p-4', c.bg, c.border)}
    >
      <div className="flex items-start gap-3">
        <c.Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', c.text)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn('text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5', c.badge)}>
              {level}
            </span>
            <span className="text-[11px] text-slate-500">{category}</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{detail}</p>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/components/ui/InsightCard.tsx
git commit -m "feat: add InsightCard component for priority-coloured AI recommendations"
```

---

## Task 5: ScenarioSelector, PeriodSelector, SurveyPerformanceCard

**Files:**
- Create: `frontend/src/app/components/ui/ScenarioSelector.tsx`
- Create: `frontend/src/app/components/ui/PeriodSelector.tsx`
- Create: `frontend/src/app/components/ui/SurveyPerformanceCard.tsx`

- [ ] **Step 1: Create `frontend/src/app/components/ui/ScenarioSelector.tsx`**

```tsx
import { cn } from './utils';

export type ScenarioKey = 'base' | 'pessimistic' | 'optimistic';

interface ScenarioSelectorProps {
  value: ScenarioKey;
  onChange: (v: ScenarioKey) => void;
}

const OPTIONS: { key: ScenarioKey; label: string }[] = [
  { key: 'pessimistic', label: 'Pessimistic −25%' },
  { key: 'base', label: 'Base' },
  { key: 'optimistic', label: 'Optimistic +30%' },
];

export function ScenarioSelector({ value, onChange }: ScenarioSelectorProps) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === opt.key
              ? 'bg-green-600 text-white'
              : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/app/components/ui/PeriodSelector.tsx`**

```tsx
import { cn } from './utils';

export type Period = '7d' | '30d' | '90d' | '1y';

interface PeriodSelectorProps {
  value: Period;
  onChange: (v: Period) => void;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '1y', label: '1y' },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === p.key
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/app/components/ui/SurveyPerformanceCard.tsx`**

```tsx
import { Skeleton } from './skeleton';

interface SurveyPerformanceCardProps {
  aquaCount: number;
  landCount: number;
  aquaAvgRoi: number;
  landAvgRoi: number;
  loading?: boolean;
}

export function SurveyPerformanceCard({
  aquaCount,
  landCount,
  aquaAvgRoi,
  landAvgRoi,
  loading,
}: SurveyPerformanceCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-3 w-32 bg-slate-100" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-14 bg-slate-100 rounded-lg" />
          <Skeleton className="h-14 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Survey Performance
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-0.5">
          <p className="text-xs text-slate-500">Aquaponics</p>
          <p className="text-xl font-bold text-slate-900">
            {aquaCount}{' '}
            <span className="text-sm font-normal text-slate-400">surveys</span>
          </p>
          <p className="text-xs font-semibold text-green-600">
            {aquaAvgRoi > 0 ? `Avg ROI ${aquaAvgRoi.toFixed(0)}%` : 'No data yet'}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-slate-500">Land Farming</p>
          <p className="text-xl font-bold text-slate-900">
            {landCount}{' '}
            <span className="text-sm font-normal text-slate-400">surveys</span>
          </p>
          <p className="text-xs font-semibold text-amber-600">
            {landAvgRoi > 0 ? `Avg ROI ${landAvgRoi.toFixed(0)}%` : 'No data yet'}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/ui/ScenarioSelector.tsx \
        frontend/src/app/components/ui/PeriodSelector.tsx \
        frontend/src/app/components/ui/SurveyPerformanceCard.tsx
git commit -m "feat: add ScenarioSelector, PeriodSelector, SurveyPerformanceCard components"
```

---

## Task 6: Dashboard — Mission Control Rewrite

**Files:**
- Modify: `frontend/src/app/components/dashboard/Dashboard.tsx`

Replace the entire file content with the following. The data-fetching logic is preserved; what changes is the layout and the components used to display data.

- [ ] **Step 1: Replace `frontend/src/app/components/dashboard/Dashboard.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  Sprout,
  ClipboardList,
  ChevronRight,
  Target,
} from 'lucide-react';
import { motion } from 'motion/react';
import { farmAPI, reportAPI } from '../../utils/api';
import { useStore } from '../../store';
import { LangCode, createT } from '../../utils/i18n';
import { KpiCard } from '../ui/KpiCard';
import { BreakEvenProgress } from '../ui/BreakEvenProgress';
import { InsightCard } from '../ui/InsightCard';
import { SurveyPerformanceCard } from '../ui/SurveyPerformanceCard';
import { PeriodSelector } from '../ui/PeriodSelector';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/skeleton';
import { buildInputs, computeMetrics, generateInsights } from '../../utils/analysisUtils';
import type { Recommendation } from '../../utils/analysisUtils';
import type { Period } from '../ui/PeriodSelector';

interface DashboardProps {
  user: any;
  onNavigate?: (view: string) => void;
}

interface TopSession {
  session_id: string;
  survey_type: string;
  project_name: string;
  completed_at: string | null;
  revenue: number;
  cost: number;
  profit: number;
  roi_percent: number;
}

const relativeTime = (iso: string | null) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export function Dashboard({ user, onNavigate }: DashboardProps) {
  const lang: LangCode = (useStore((s: any) => s.globalLanguage) || 'en') as LangCode;
  const tr = createT(lang);
  const analysis = useStore((s: any) => s.analysis);

  const [farmsLoading, setFarmsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [farmsCount, setFarmsCount] = useState(0);
  const [topSessions, setTopSessions] = useState<TopSession[]>([]);
  const [revenueData, setRevenueData] = useState<{ month: string; revenue: number; cost: number }[]>([]);
  const [topCropsData, setTopCropsData] = useState<{ name: string; value: number }[]>([]);
  const [surveyStats, setSurveyStats] = useState({
    aquaCount: 0,
    landCount: 0,
    aquaRoi: 0,
    landRoi: 0,
  });
  const [period, setPeriod] = useState<Period>('30d');

  useEffect(() => {
    farmAPI
      .list()
      .then((res: any) => setFarmsCount((res?.data ?? []).length))
      .catch(() => {})
      .finally(() => setFarmsLoading(false));

    reportAPI
      .dashboard()
      .then((res: any) => {
        const data = res?.data ?? {};
        const sessions: TopSession[] = data.top_sessions ?? [];
        setTopSessions(sessions.slice(0, 5));

        const monthly: Record<string, { revenue: number; cost: number }> = {};
        (data.monthly_data ?? []).forEach((m: any) => {
          const key = m.month ?? m.month_key ?? '';
          if (!key) return;
          monthly[key] = {
            revenue: (m.ai_revenue ?? 0) + (m.land_revenue ?? 0),
            cost: (m.ai_cost ?? 0) + (m.land_cost ?? 0),
          };
        });
        const months = Object.keys(monthly).sort().slice(-6);
        setRevenueData(
          months.map((m) => ({
            month: m.slice(-3),
            revenue: monthly[m].revenue,
            cost: monthly[m].cost,
          })),
        );

        const crops = (data.top_crops ?? [])
          .slice(0, 5)
          .map((c: any) => ({
            name: c.crop ?? c.name ?? 'Unknown',
            value: c.revenue ?? c.profit ?? 0,
          }));
        setTopCropsData(crops);

        const aqua = sessions.filter((s) => s.survey_type === 'ai');
        const land = sessions.filter((s) => s.survey_type === 'land');
        setSurveyStats({
          aquaCount: data.ai_completed_count ?? aqua.length,
          landCount: data.land_completed_count ?? land.length,
          aquaRoi: aqua.length
            ? aqua.reduce((sum, r) => sum + (r.roi_percent ?? 0), 0) / aqua.length
            : 0,
          landRoi: land.length
            ? land.reduce((sum, r) => sum + (r.roi_percent ?? 0), 0) / land.length
            : 0,
        });
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, []);

  const allRevenue = topSessions.reduce((sum, r) => sum + (r.revenue ?? 0), 0);
  const allProfit = revenueData.reduce((sum, m) => sum + (m.revenue - m.cost), 0);
  const allRoi = topSessions.length
    ? topSessions.reduce((sum, r) => sum + (r.roi_percent ?? 0), 0) / topSessions.length
    : 0;

  const revSparkline = revenueData.map((m) => m.revenue);
  const profitSparkline = revenueData.map((m) => m.revenue - m.cost);
  const roiSparkline = topSessions.slice(-6).map((s) => s.roi_percent ?? 0);

  const breakEvenData = useMemo(() => {
    if (!analysis) return null;
    const inputs = buildInputs(analysis);
    const metrics = computeMetrics(inputs, 1);
    return { breakEvenMonth: metrics.breakEvenMonth, horizon: inputs.horizon };
  }, [analysis]);

  const insights: Recommendation[] = useMemo(() => {
    if (!analysis) return [];
    const apiRecs = analysis?.financial_plan?.ai_recommendations;
    if (Array.isArray(apiRecs) && apiRecs.length > 0) {
      return apiRecs.slice(0, 3).map((r: any) => ({
        priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'low') as any,
        category: String(r.category || 'Insight'),
        title: String(r.title || ''),
        detail: String(r.detail || ''),
      }));
    }
    const inputs = buildInputs(analysis);
    const metrics = computeMetrics(inputs, 1);
    return generateInsights(inputs, metrics).slice(0, 3);
  }, [analysis]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
    >
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Welcome back
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">{user?.name ?? 'Farmer'}</h1>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: tr('monthly_revenue'),
            value: allRevenue > 0 ? `₹${(allRevenue / 100000).toFixed(1)}L` : '₹0',
            delta: allRevenue > 0 ? tr('from_surveys') : undefined,
            deltaPositive: true,
            sparklineData: revSparkline,
            icon: DollarSign,
            iconColor: 'text-green-500',
          },
          {
            label: 'Net Profit',
            value: allProfit !== 0 ? `₹${(Math.abs(allProfit) / 100000).toFixed(1)}L` : '₹0',
            delta: allProfit !== 0 ? (allProfit > 0 ? 'profitable' : 'loss') : undefined,
            deltaPositive: allProfit >= 0,
            sparklineData: profitSparkline,
            icon: TrendingUp,
            iconColor: 'text-blue-500',
          },
          {
            label: tr('average_roi'),
            value: allRoi > 0 ? `${allRoi.toFixed(0)}%` : '—',
            delta: allRoi > 0 ? tr('across_farms') : undefined,
            deltaPositive: allRoi > 0,
            sparklineData: roiSparkline,
            icon: TrendingUp,
            iconColor: 'text-purple-500',
          },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <KpiCard {...kpi} loading={analyticsLoading} />
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3 * 0.06 }}
        >
          {analyticsLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <Skeleton className="h-3.5 w-20 bg-slate-100" />
              <Skeleton className="h-7 w-24 bg-slate-100" />
              <Skeleton className="h-2 w-full bg-slate-100 mt-4" />
            </div>
          ) : (
            <BreakEvenProgress
              breakEvenMonth={breakEvenData?.breakEvenMonth ?? null}
              horizon={breakEvenData?.horizon ?? 24}
            />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 4 * 0.06 }}
        >
          <KpiCard
            label={tr('active_farms')}
            value={`${farmsCount}`}
            delta={farmsCount > 0 ? 'registered' : undefined}
            deltaPositive
            icon={Sprout}
            iconColor="text-green-500"
            loading={farmsLoading}
          />
        </motion.div>
      </div>

      {/* Survey performance + Top crops */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SurveyPerformanceCard
          aquaCount={surveyStats.aquaCount}
          landCount={surveyStats.landCount}
          aquaAvgRoi={surveyStats.aquaRoi}
          landAvgRoi={surveyStats.landRoi}
          loading={analyticsLoading}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Top Crops
          </p>
          {analyticsLoading ? (
            <Skeleton className="h-24 bg-slate-100 rounded-lg" />
          ) : topCropsData.length === 0 ? (
            <EmptyState
              icon={Sprout}
              title="No crop data yet"
              description="Complete a survey to see crop performance"
            />
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart
                data={topCropsData}
                layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                barSize={10}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={84}
                />
                <Tooltip
                  formatter={(v: number) => [`₹${Math.round(v).toLocaleString('en-IN')}`, 'Revenue']}
                />
                <Bar dataKey="value" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Revenue chart + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Revenue vs Cost
          </p>
          {analyticsLoading ? (
            <Skeleton className="h-40 bg-slate-100 rounded-lg" />
          ) : revenueData.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No revenue data"
              description="Complete a survey to see trends"
            />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={revenueData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                  width={48}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    `₹${Math.round(v).toLocaleString('en-IN')}`,
                    name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#16a34a"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  name="Revenue"
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#f97316"
                  strokeWidth={2}
                  fill="url(#costGrad)"
                  name="Cost"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              AI Insights Today
            </p>
            <button
              onClick={() => onNavigate?.('analytics')}
              className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-0.5"
            >
              Full Analysis <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {analyticsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : insights.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No insights yet"
              description="Complete a survey for AI recommendations"
              actionLabel="Start Survey"
              onAction={() => onNavigate?.('surveys')}
            />
          ) : (
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <InsightCard key={i} {...ins} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent surveys */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {tr('recent_surveys')}
          </p>
          <button
            onClick={() => onNavigate?.('surveys')}
            className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-0.5"
          >
            {tr('view_all')} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {analyticsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : topSessions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No surveys yet"
            description="Start your first survey to see results here"
            actionLabel="Start Survey"
            onAction={() => onNavigate?.('surveys')}
          />
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Name', 'Type', 'ROI', 'Date', 'Status'].map((h, i) => (
                    <th
                      key={h}
                      className={`text-xs font-medium text-slate-400 pb-2 ${i > 1 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topSessions.map((s) => (
                  <tr
                    key={s.session_id}
                    onClick={() => onNavigate?.('analytics')}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 font-medium text-slate-900 truncate max-w-[160px]">
                      {s.project_name}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                          s.survey_type === 'ai'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {s.survey_type === 'ai' ? 'Aquaponic' : 'Land'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">
                      {s.roi_percent != null ? `${s.roi_percent.toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-slate-400 text-xs">
                      {relativeTime(s.completed_at)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="text-[11px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                        ✓ Done
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Start dev server and verify Dashboard renders**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. Log in. Verify:
- 5 KPI cards visible (Revenue, Profit, ROI, Break-even, Active Farms)
- Break-even shows "—" if no analysis in store, or a progress bar if analysis exists
- Survey Performance card shows two columns (Aquaponics / Land Farming)
- Top Crops bar chart renders (or EmptyState if no data)
- Revenue vs Cost area chart renders (or EmptyState)
- AI Insights panel shows InsightCards (or EmptyState)
- Recent surveys table has 5 columns with headers
- No console errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/dashboard/Dashboard.tsx
git commit -m "feat: rewrite Dashboard as Mission Control with 5 KPIs, survey performance, AI insights"
```

---

## Task 7: Analytics — Sections, ScenarioCards, BreakEvenProgress, InsightCards

**Files:**
- Modify: `frontend/src/app/components/analytics/Analytics.tsx`

This task makes 5 targeted changes to Analytics.tsx. Do NOT rewrite the file — make surgical edits.

- [ ] **Step 1: Replace imports at the top of Analytics.tsx**

Find the existing import block (lines 1–36 approx). Replace the entire import section with:

```tsx
import { type ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/EmptyState';
import { BarChart3, ClipboardList } from 'lucide-react';
import { useStore } from '../../store';
import { landSurveyAPI, reportAPI } from '../../utils/api';
import { InsightCard } from '../ui/InsightCard';
import { BreakEvenProgress } from '../ui/BreakEvenProgress';
import { cn } from '../ui/utils';
import {
  type Inputs,
  type Metrics,
  type Recommendation,
  type Priority,
  buildInputs,
  buildLandInputs,
  computeMetrics,
  generateInsights,
} from '../../utils/analysisUtils';
```

- [ ] **Step 2: Remove local type and function definitions**

Delete the following blocks that are now imported from `analysisUtils.ts`:
- `type ScenarioKey = ...` — keep this one, it's only used in Analytics
- `type Priority = 'high' | 'medium' | 'low';` — DELETE (now imported)
- `type SurveyMode = ...` — keep this one
- `interface Inputs { ... }` — DELETE (now imported)
- `interface Recommendation { ... }` — DELETE (now imported)
- `interface FlowRow { ... }` — DELETE (now imported)
- `interface Metrics { ... }` — DELETE (now imported)
- The `function num(...)` block — DELETE
- The `function buildInputs(...)` block — DELETE
- The `function buildLandInputs(...)` block — DELETE
- The `function computeMetrics(...)` block — DELETE
- The `function generateRecommendations(...)` block — DELETE

Also replace every call to `generateRecommendations(` with `generateInsights(`.

- [ ] **Step 3: Add ScenarioCard local component**

After the existing `function SliderRow(...)` definition and before `export function Analytics()`, insert:

```tsx
function ScenarioCard({
  label,
  metrics,
  isActive,
  onClick,
}: {
  label: string;
  metrics: Metrics;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-5 text-left transition-colors w-full',
        isActive
          ? 'border-green-500 bg-green-50'
          : 'border-slate-200 bg-white hover:border-green-200',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        {isActive && (
          <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-bold uppercase tracking-wide">
            Active
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {([
          ['Annual Rev', fmtRs(metrics.annRev), false],
          ['Profit', fmtRs(metrics.annProfit), metrics.annProfit < 0],
          ['ROI', `${metrics.roi.toFixed(1)}%`, metrics.roi < 0],
          ['Payback', metrics.payback ? `${Math.round(metrics.payback)}mo` : 'N/A', false],
        ] as [string, string, boolean][]).map(([l, v, neg]) => (
          <div key={l} className="flex items-center justify-between text-xs">
            <span className="text-slate-500">{l}</span>
            <span className={cn('font-semibold', neg ? 'text-red-600' : 'text-slate-900')}>{v}</span>
          </div>
        ))}
      </div>
    </button>
  );
}
```

Note: `fmtRs` is still defined locally in Analytics.tsx — keep it. The `type ScenarioKey` in this local component is already declared at the top of the file — remove the duplicate `type ScenarioKey = ...` line from the local ScenarioCard block.

- [ ] **Step 4: Add BreakEvenProgress + NPV callout after the KPI grid in the JSX**

Find the section after `</div>` that closes the `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` KPI grid. Insert immediately after it:

```tsx
      {/* Break-even progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
          Break-even Progress
        </p>
        <BreakEvenProgress
          breakEvenMonth={curr.breakEvenMonth}
          horizon={inputs.horizon}
        />
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">NPV</span>
          <span className="text-sm font-semibold text-slate-900">{fmtRs(curr.npv)}</span>
          <span className="text-xs text-slate-500">
            at 8% discount rate · {inputs.horizon} months
          </span>
        </div>
      </div>
```

- [ ] **Step 5: Add ScenarioCards section before the scenario analysis bar chart**

Find the `<div className="rounded-xl border border-slate-200 bg-white p-5">` that contains `<h2 className="mb-4 text-sm font-semibold text-gray-900">Scenario Analysis (Projected Annual Profit)</h2>`. Insert immediately before that div:

```tsx
      {/* Scenario comparison */}
      <div className="space-y-4">
        <div className="border-t border-slate-100 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Scenario Forecasting
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SCENARIOS.map((sc) => {
            const m = sc.key === 'base' ? base : sc.key === 'pessimistic' ? pess : opti;
            return (
              <ScenarioCard
                key={sc.key}
                label={sc.label}
                metrics={m}
                isActive={scenario === sc.key}
                onClick={() => setScenario(sc.key as ScenarioKey)}
              />
            );
          })}
        </div>
      </div>
```

- [ ] **Step 6: Replace recommendation cards with InsightCard**

Find the `<div className="space-y-3">` inside the `<div className="rounded-xl border border-slate-200 bg-white p-5">` that has `AI Recommendations` in its heading. Replace the inner `recommendations.map(...)` block with:

```tsx
          <div className="space-y-2">
            {recommendations.map((rec, idx) => (
              <InsightCard
                key={`${rec.title}-${idx}`}
                priority={rec.priority}
                category={rec.category}
                title={rec.title}
                detail={rec.detail}
                index={idx}
              />
            ))}
          </div>
```

- [ ] **Step 7: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are errors about `Priority` already being declared, ensure the local `type Priority` block was removed in Step 2.

- [ ] **Step 8: Verify Analytics visually**

```bash
cd frontend && npm run dev
```

Navigate to Analytics. Verify:
- Break-even progress bar appears below KPI cards
- NPV callout in blue appears
- Three ScenarioCards appear (Pessimistic, Base, Optimistic) and clicking each changes active highlight
- Existing cumulative CF and bar charts still work
- AI Recommendations show as InsightCard components with coloured backgrounds
- No console errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/components/analytics/Analytics.tsx
git commit -m "feat: restructure Analytics with BreakEvenProgress, ScenarioCards, InsightCards; extract to analysisUtils"
```

---

## Task 8: Farms — Layout Polish

**Files:**
- Modify: `frontend/src/app/components/farms/FarmManagement.tsx`

The current component already has a two-panel layout (lg:col-span-1 + lg:col-span-2). This task polishes the visual styling without changing any logic.

- [ ] **Step 1: Remove PretextText import and usage**

Find:
```tsx
import { PretextText } from '../ui/pretext-text';
```
Delete this line.

Find the two `<PretextText .../>` components in the page header and replace with:
```tsx
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{tr('farm_records')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tr('farms_desc')}</p>
        </div>
```

- [ ] **Step 2: Update the root wrapper div**

Find `<div className="space-y-6">` (the outer return div) and change to:
```tsx
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
    >
```

Change the closing `</div>` at the bottom to `</motion.div>`.

Add `import { motion } from 'motion/react';` to the imports at the top of the file.

- [ ] **Step 3: Polish farm list items in the left panel**

Find the farm list item div (the one with `border-2 cursor-pointer`):
```tsx
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedFarm?.id === farm.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
```

Replace with:
```tsx
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedFarm?.id === farm.id
                        ? 'border-l-4 border-green-500 bg-green-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
```

Also add a system_type badge to each farm item. Find `<p className="text-sm text-gray-500">{farm.location || '—'}</p>` and replace with:
```tsx
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                        farm.system_type === 'aquaponics'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {farm.system_type}
                      </span>
                      {farm.area_sqm && (
                        <span className="text-xs text-slate-400">{farm.area_sqm} m²</span>
                      )}
                    </div>
```

Remove the old `<div className="flex gap-3 mt-1 text-xs text-gray-400">...</div>` that used to show area and system_type.

- [ ] **Step 4: Polish farm detail header**

Find the farm info card (the one with `grid grid-cols-3 gap-4`). Replace the entire card div with:

```tsx
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">{selectedFarm.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${
                          selectedFarm.system_type === 'aquaponics'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {selectedFarm.system_type}
                        </span>
                        {selectedFarm.area_sqm && (
                          <span className="text-xs text-slate-400">{selectedFarm.area_sqm} m²</span>
                        )}
                        {selectedFarm.location && (
                          <span className="text-xs text-slate-400">· {selectedFarm.location}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
```

- [ ] **Step 5: Verify visually**

```bash
cd frontend && npm run dev
```

Navigate to Farms. Verify:
- Page header shows standard h1 (no PretextText component)
- Farm list items have system_type badge
- Active farm has green left border highlight
- Selected farm header shows farm name as h2 with type badge and area/location caption
- Fish batches, crop records, water readings sections still render correctly
- Add farm and add reading modals still work

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/farms/FarmManagement.tsx
git commit -m "feat: polish FarmManagement layout, remove PretextText, add type badges"
```

---

## Task 9: Reports — Card Grid with Metric Previews

**Files:**
- Modify: `frontend/src/app/components/reports/Reports.tsx`

- [ ] **Step 1: Read the current Reports.tsx structure**

Look at lines 35–130 of `frontend/src/app/components/reports/Reports.tsx` to understand the current render structure before editing.

- [ ] **Step 2: Add analytics cross-reference state**

In `Reports.tsx`, inside the `Reports` component, after the existing state declarations add:

```tsx
  const [sessionMetrics, setSessionMetrics] = useState<Record<string, any>>({});
```

In the existing `useEffect` that loads reports, after `setReports(mapped)` (in the `.then` handler), add:

```tsx
        // Load analytics to get financial metrics per session for card previews
        try {
          const analyticsRes = await reportAPI.analytics();
          const topSessions: any[] = analyticsRes?.data?.top_sessions || [];
          const map: Record<string, any> = {};
          topSessions.forEach((s: any) => { map[s.session_id] = s; });
          setSessionMetrics(map);
        } catch { /* metrics preview is best-effort */ }
```

- [ ] **Step 3: Change the prop type of onNavigate**

Find:
```tsx
type ReportView = 'ai-survey' | 'land-survey';
interface ReportsProps {
  onNavigate?: (view: ReportView) => void;
}
```

Replace with:
```tsx
interface ReportsProps {
  onNavigate?: (view: string) => void;
}
```

- [ ] **Step 4: Replace the report list JSX with a card grid**

Find the section that renders the list of reports. It will be inside the `reports.length === 0 ? ... : (...)` ternary. Replace the non-empty branch with:

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => {
              const metrics = sessionMetrics[report.sessionId];
              return (
                <div
                  key={report.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-base font-semibold text-slate-900 leading-tight">
                        {report.title}
                      </p>
                      <span
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 ${
                          report.type === 'AI Survey'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {report.type === 'AI Survey' ? 'Aquaponic' : 'Land'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{report.generatedDate}</p>
                  </div>

                  {metrics && (
                    <>
                      <div className="border-t border-slate-100" />
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          ['Revenue', metrics.revenue > 0 ? `₹${(metrics.revenue / 100000).toFixed(1)}L` : '—'],
                          ['ROI', metrics.roi_percent != null ? `${metrics.roi_percent.toFixed(0)}%` : '—'],
                          ['Profit', metrics.profit != null ? `₹${(metrics.profit / 100000).toFixed(1)}L` : '—'],
                          ['Payback', '—'],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                            <p className="text-sm font-semibold text-slate-900">{val}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="border-t border-slate-100 pt-3 flex gap-2 mt-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      disabled={busyKey === report.sessionId}
                      onClick={async () => {
                        setBusyKey(report.sessionId);
                        try {
                          const blob = await reportAPI.get(report.sessionId);
                          downloadBlob(blob.data, `${report.title}.pdf`);
                          setDownloadsCount((c) => c + 1);
                        } catch {
                          /* ignore */
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      {busyKey === report.sessionId ? 'Downloading…' : 'PDF'}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-green-600 hover:bg-green-700"
                      onClick={() => onNavigate?.('analytics')}
                    >
                      Open Analytics
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
```

- [ ] **Step 5: Verify visually**

```bash
cd frontend && npm run dev
```

Navigate to Reports. Verify:
- Reports show as a card grid (not a flat list)
- Cards show project name, type badge, date
- If session has matching analytics data, 4 metric chips appear
- PDF download button still works
- "Open Analytics" button navigates to analytics view

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/reports/Reports.tsx
git commit -m "feat: redesign Reports as insight card grid with metric previews and analytics navigation"
```

---

## Task 10: Surveys Hub — Polish

**Files:**
- Modify: `frontend/src/app/components/surveys/SurveysHub.tsx`

- [ ] **Step 1: Add Resume badge to launch cards**

In `SurveysHub.tsx`, inside the component body, add after the state declarations:

```tsx
  const hasAquaSession = !!localStorage.getItem('aqua_session_id');
  const hasLandSession = !!localStorage.getItem('land_survey_session_id');
```

On the Aquaponic launch card button, after the `<div>` that wraps the h3/p, add:
```tsx
          {hasAquaSession && (
            <span className="inline-flex items-center text-[10px] font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">
              Resume →
            </span>
          )}
```

On the Land Farming launch card button, do the same with `hasLandSession` and `bg-amber-100 text-amber-700`.

- [ ] **Step 2: Add Status column to the history table**

Find `<th ... >{tr('col_roi')}</th>` (last th in thead). After it, add:
```tsx
                  <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">
                    Status
                  </th>
```

Find the `<td ... >{s.roi_percent != null...}</td>` (last td in the row). After it, add:
```tsx
                    <td className="px-5 py-3 text-right">
                      <span className="text-[11px] font-semibold bg-green-50 text-green-700 rounded-full px-2 py-0.5">
                        ✓ Done
                      </span>
                    </td>
```

- [ ] **Step 3: Add estimated time badge to launch cards**

On the Aquaponic card, find `<p className="text-sm text-slate-500 mt-1">{tr('aquaponic_survey_desc')}</p>` and add after it:
```tsx
            <span className="text-[10px] text-slate-400 font-medium">⏱ ~5 min · Voice-guided</span>
```

On the Land card:
```tsx
            <span className="text-[10px] text-slate-400 font-medium">⏱ ~8 min · Crop & financial plan</span>
```

- [ ] **Step 4: Verify visually**

```bash
cd frontend && npm run dev
```

Navigate to Surveys. Verify:
- Launch cards show timing hints
- If `aqua_session_id` or `land_survey_session_id` in localStorage, Resume badge appears
- History table has a Status column showing "✓ Done"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/surveys/SurveysHub.tsx
git commit -m "feat: polish SurveysHub with resume badge, estimated time, and status column"
```

---

## Task 11: FloatingAdvisor Component

**Files:**
- Create: `frontend/src/app/components/ai/FloatingAdvisor.tsx`

- [ ] **Step 1: Create `frontend/src/app/components/ai/FloatingAdvisor.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, ChevronRight, Sparkles, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useStore } from '../../store';
import { InsightCard } from '../ui/InsightCard';
import { buildInputs, computeMetrics, generateInsights } from '../../utils/analysisUtils';
import type { Recommendation } from '../../utils/analysisUtils';
import { cn } from '../ui/utils';

type Message = { role: 'user' | 'ai'; text: string };

interface FloatingAdvisorProps {
  onOpenFullPage: () => void;
}

export function FloatingAdvisor({ onOpenFullPage }: FloatingAdvisorProps) {
  const [open, setOpen] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const analysis = useStore((s: any) => s.analysis);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const insights: Recommendation[] = useMemo(() => {
    if (!analysis) return [];
    const apiRecs = analysis?.financial_plan?.ai_recommendations;
    if (Array.isArray(apiRecs) && apiRecs.length > 0) {
      return apiRecs.slice(0, 3).map((r: any) => ({
        priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'low') as any,
        category: String(r.category || 'Insight'),
        title: String(r.title || ''),
        detail: String(r.detail || ''),
      }));
    }
    const inputs = buildInputs(analysis);
    const metrics = computeMetrics(inputs, 1);
    return generateInsights(inputs, metrics).slice(0, 3);
  }, [analysis]);

  const sessionId =
    typeof window !== 'undefined'
      ? localStorage.getItem('last_completed_session_id')
      : null;

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setChatMode(true);
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post(
        '/ai/chat',
        { message: msg, session_id: sessionId || undefined },
        { timeout: 90_000 },
      );
      setMessages((prev) => [...prev, { role: 'ai', text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Sorry, the AI advisor is unavailable right now.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-[320px] sm:w-[400px] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '480px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-green-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-slate-900">AI Advisor</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onOpenFullPage();
                    setOpen(false);
                  }}
                  className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-0.5"
                >
                  Full page <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600 ml-1"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {!chatMode && insights.length > 0 ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Today's Insights
                  </p>
                  {insights.map((ins, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(`Tell me more: ${ins.title}`)}
                      className="w-full text-left hover:opacity-90 transition-opacity"
                    >
                      <InsightCard {...ins} index={i} />
                    </button>
                  ))}
                </>
              ) : !chatMode && insights.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Complete a survey to see AI insights here.
                </p>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        msg.role === 'user' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-green-600 text-white rounded-tr-sm'
                            : 'bg-slate-100 text-slate-800 rounded-tl-sm',
                        )}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-1.5 px-3 py-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce [animation-delay:-0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce [animation-delay:-0.1s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-bounce" />
                    </div>
                  )}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-3 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask about your farm…"
                  disabled={loading}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  className="rounded-xl bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 flex items-center justify-center transition-colors"
        aria-label={open ? 'Close AI Advisor' : 'Open AI Advisor'}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span
              key="s"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles className="w-5 h-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/components/ai/FloatingAdvisor.tsx
git commit -m "feat: add FloatingAdvisor persistent FAB with insight chips and chat panel"
```

---

## Task 12: MainLayout — Mount FloatingAdvisor + Fix Nav Bug

**Files:**
- Modify: `frontend/src/app/components/layout/MainLayout.tsx`

- [ ] **Step 1: Fix the nav group label i18n bug**

In `MainLayout.tsx`, find the nav group label rendering inside `SidebarContent`. It currently looks like:
```tsx
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {group.labelKey}
            </p>
```

Replace `{group.labelKey}` with `{tr(group.labelKey)}`.

- [ ] **Step 2: Import FloatingAdvisor and add to MainLayout**

Add this import at the top of `MainLayout.tsx`:
```tsx
import { FloatingAdvisor } from '../ai/FloatingAdvisor';
```

In the `MainLayout` function, find the `<main className="flex-1 overflow-y-auto pb-16 md:pb-0">` block. After `</main>` and before the mobile bottom nav `<nav>`, add:

```tsx
        <FloatingAdvisor onOpenFullPage={() => onNavigate('ai-advisor' as View)} />
```

- [ ] **Step 3: Fix the mobile nav Farms icon**

Find in `MOBILE_NAV_DEFS`:
```tsx
  { id: 'farms',      nameKey: 'nav_farms',     icon: MoreHorizontal },
```

Replace with:
```tsx
  { id: 'farms',      nameKey: 'nav_farms',     icon: Sprout },
```

Ensure `Sprout` is imported from lucide-react (it already is in the existing file).

- [ ] **Step 4: Verify**

```bash
cd frontend && npm run dev
```

Open the app. Verify:
- Nav sidebar group headings now show translated text (e.g. "Overview" instead of "nav_group_overview")
- A green floating button (Sparkles icon) appears bottom-right on every page
- Clicking it opens the AI panel with insights or an empty chat
- "Full page" link opens the AI Advisor page and closes the panel
- Mobile bottom nav Farms tab shows Sprout icon instead of MoreHorizontal

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/layout/MainLayout.tsx
git commit -m "fix: translate nav group labels; feat: mount FloatingAdvisor in layout; fix: Farms mobile icon"
```

---

## Task 13: AIAdvisor — Polish

**Files:**
- Modify: `frontend/src/app/components/ai/AIAdvisor.tsx`

- [ ] **Step 1: Remove decorative blur blobs**

In `AIAdvisor.tsx`, find and delete the entire `<div className="pointer-events-none absolute inset-0 overflow-hidden">` block that contains the two blurred circles. It looks like:

```tsx
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 right-[-4rem] h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute top-40 left-[-5rem] h-72 w-72 rounded-full bg-green-100/70 blur-3xl" />
      </div>
```

- [ ] **Step 2: Change page background**

Find the outermost div of `AIAdvisor`:
```tsx
    <div className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-amber-50">
```

Replace with:
```tsx
    <div className="min-h-[calc(100vh-56px)] bg-slate-50">
```

Also update the inner container div from:
```tsx
      <div className="relative mx-auto flex min-h-[calc(100vh-56px)] max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
```
to:
```tsx
      <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
```

- [ ] **Step 3: Add Today's Insights section**

Add these imports at the top of `AIAdvisor.tsx`:

```tsx
import { InsightCard } from '../ui/InsightCard';
import { buildInputs, computeMetrics, generateInsights } from '../../utils/analysisUtils';
import type { Recommendation } from '../../utils/analysisUtils';
import { AnimatePresence, motion } from 'motion/react';
```

Inside the `AIAdvisor` component, add this `useMemo` after the existing state declarations:

```tsx
  const analysis = useStore((s: any) => s.analysis);

  const todaysInsights: Recommendation[] = useMemo(() => {
    if (!analysis) return [];
    const apiRecs = analysis?.financial_plan?.ai_recommendations;
    if (Array.isArray(apiRecs) && apiRecs.length > 0) {
      return apiRecs.slice(0, 3).map((r: any) => ({
        priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'low') as any,
        category: String(r.category || 'Insight'),
        title: String(r.title || ''),
        detail: String(r.detail || ''),
      }));
    }
    const inputs = buildInputs(analysis);
    const metrics = computeMetrics(inputs, 1);
    return generateInsights(inputs, metrics).slice(0, 3);
  }, [analysis]);
```

In the JSX, find the `<div className="grid flex-1 gap-5 lg:grid-cols-[1fr_320px]">` that wraps the chat and sidebar. Insert a Today's Insights section immediately before it:

```tsx
        <AnimatePresence>
          {messages.length === 0 && todaysInsights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                  Today's Insights
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {todaysInsights.map((ins, i) => (
                    <InsightCard key={i} {...ins} index={i} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
```

- [ ] **Step 4: Add farm context card to the right sidebar**

In the right `<aside>` of AIAdvisor, find the existing "Advisor mode" card. After its closing `</div>`, add:

```tsx
            {selectedSurvey && analysis && (
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">
                  Farm Metrics
                </p>
                {(() => {
                  const inputs = buildInputs(analysis);
                  const metrics = computeMetrics(inputs, 1);
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Annual Rev', `₹${(metrics.annRev / 100000).toFixed(1)}L`],
                        ['ROI', `${metrics.roi.toFixed(0)}%`],
                        ['Payback', metrics.payback ? `${Math.round(metrics.payback)}mo` : 'N/A'],
                        ['NPV', `₹${(metrics.npv / 100000).toFixed(1)}L`],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">{l}</p>
                          <p className="text-sm font-semibold text-slate-900">{v}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
```

Also add the `buildInputs`, `computeMetrics` imports at the top if not already added in Step 3.

- [ ] **Step 5: Verify visually**

```bash
cd frontend && npm run dev
```

Navigate to AI Advisor. Verify:
- Page background is `bg-slate-50` (clean, no gradient, no blobs)
- "Today's Insights" section appears at the top before any messages, with 3 InsightCards
- The insights section disappears once a message is sent (AnimatePresence collapse)
- Selected survey's Farm Metrics card appears in the right sidebar when a survey is selected
- Chat still works normally

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/ai/AIAdvisor.tsx
git commit -m "feat: polish AIAdvisor — remove decorative blobs, add Today's Insights, farm context card"
```

---

## Final Verification

- [ ] **Full build check**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no TypeScript errors. Ignore bundle-size warnings.

- [ ] **End-to-end smoke test**

```bash
cd frontend && npm run dev
```

Walk through each screen and confirm:
1. **Dashboard**: 5 KPI cards, survey performance, top crops chart, revenue area chart, AI insights panel, recent surveys table — all render or show appropriate EmptyState
2. **Analytics**: Break-even bar + NPV callout visible, 3 ScenarioCards clickable and update charts, AI Recommendations styled as InsightCards
3. **Farms**: Farm list with type badges, farm detail with h2 header and type/area caption, add-farm modal works
4. **Reports**: Card grid layout, PDF download works, "Open Analytics" navigates to analytics
5. **Surveys Hub**: Two launch cards with timing hints, history table has Status column
6. **AI Advisor**: Clean slate-50 bg, Today's Insights at top, insights disappear when chatting
7. **Global**: Floating AI button visible on every page, opens/closes panel, insights load or show "complete a survey" message; nav group labels show translated text; mobile nav Farms shows Sprout icon

- [ ] **Final commit**

```bash
git add -A
git commit -m "chore: complete FarmConnect Mission Control UX redesign"
```
