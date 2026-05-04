# AgriSense Platform Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the full AquaponicsAI frontend into AgriSense — a polished, publication-ready farm intelligence platform with a light sidebar, Recharts data visualisation, shimmer skeletons, and graceful empty states across all screens.

**Architecture:** Pure frontend refactor — no backend changes. Shared layout components (AppShell in MainLayout) wrap all authenticated views. UI primitives (StatCard, EmptyState, ChartCarousel) are built once and used everywhere. Each screen is refactored top-to-bottom in rollout order: layout → dashboard → analytics → remaining screens → brand rename sweep.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Recharts 2.15.2 (already installed), Lucide React 0.487.0 (already installed), shadcn/ui primitives (Skeleton, Badge, Tabs, Card, Button — all already in `frontend/src/app/components/ui/`)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/app/components/layout/MainLayout.tsx` | **Modify** | Sidebar-first layout, mobile bottom nav, brand rename |
| `frontend/src/app/components/ui/StatCard.tsx` | **Create** | Reusable KPI card with icon, value, label, trend |
| `frontend/src/app/components/ui/EmptyState.tsx` | **Create** | Empty state with icon, title, description, CTA |
| `frontend/src/app/components/ui/ChartCarousel.tsx` | **Create** | 4-tab Recharts carousel (Revenue/ROI/Crops/Surveys) |
| `frontend/src/app/components/dashboard/Dashboard.tsx` | **Modify** | New layout: KPI cards, ChartCarousel, recent surveys, activity feed |
| `frontend/src/app/components/analytics/Analytics.tsx` | **Modify** | Survey selector, scenario cards, charts, skeleton states |
| `frontend/src/app/components/surveys/SurveysHub.tsx` | **Create** | Survey hub: two launch cards + history table |
| `frontend/src/app/components/ai/AIAdvisor.tsx` | **Modify** | Visual polish to match design system (chat bubbles, selector) |
| `frontend/src/app/components/farms/FarmManagement.tsx` | **Modify** | Card grid layout, badges, skeleton loader |
| `frontend/src/app/components/reports/Reports.tsx` | **Modify** | Table layout, badges, skeleton loader |
| `frontend/src/app/App.tsx` | **Modify** | Add `surveys` view, wire SurveysHub, brand rename |

---

## Task 1: Refactor MainLayout — Sidebar + Mobile Bottom Nav

**Files:**
- Modify: `frontend/src/app/components/layout/MainLayout.tsx`

- [ ] **Step 1: Replace MainLayout.tsx with the sidebar-first layout**

```tsx
// frontend/src/app/components/layout/MainLayout.tsx
import { ReactNode, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Sprout,
  FileText,
  Bot,
  LogOut,
  Menu,
  X,
  Leaf,
  MoreHorizontal,
} from 'lucide-react';

type View = 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor';

interface MainLayoutProps {
  children: ReactNode;
  user: any;
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
}

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
      { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'FARMING',
    items: [
      { id: 'surveys', name: 'Surveys', icon: ClipboardList },
      { id: 'farms', name: 'Farms', icon: Sprout },
      { id: 'reports', name: 'Reports', icon: FileText },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { id: 'ai-advisor', name: 'AI Advisor', icon: Bot },
    ],
  },
];

// Bottom nav shows 5 most important items on mobile
const MOBILE_NAV = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { id: 'surveys', name: 'Surveys', icon: ClipboardList },
  { id: 'analytics', name: 'Analytics', icon: BarChart3 },
  { id: 'ai-advisor', name: 'AI', icon: Bot },
  { id: 'farms', name: 'More', icon: MoreHorizontal },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  surveys: 'Surveys',
  'ai-survey': 'Aquaponic Survey',
  'land-survey': 'Land Survey',
  farms: 'Farms',
  reports: 'Reports',
  analytics: 'Analytics',
  'ai-advisor': 'AI Advisor',
};

export function MainLayout({ children, user, currentView, onNavigate, onLogout }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavItem = ({ id, name, Icon }: { id: string; name: string; Icon: any }) => {
    const active = currentView === id || (id === 'surveys' && ['ai-survey', 'land-survey'].includes(currentView));
    return (
      <button
        onClick={() => { onNavigate(id as View); setMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
          active
            ? 'bg-green-50 text-green-800 font-semibold'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {name}
      </button>
    );
  };

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
        <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Leaf className="w-4 h-4 text-white" />
        </div>
        <span className="font-extrabold text-slate-900 tracking-tight">
          Agri<span className="text-green-600">Sense</span>
        </span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ id, name, icon: Icon }) => (
                <NavItem key={id} id={id} name={name} Icon={Icon} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User chip */}
      <div className="px-2.5 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {(user?.name || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{user?.name || 'User'}</p>
            <p className="text-[10px] text-slate-400 truncate">{user?.email || ''}</p>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[220px] flex-shrink-0 flex-col fixed h-full z-20">
        <Sidebar />
      </div>

      {/* Mobile slide-in menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-[220px] flex flex-col">
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 md:ml-[220px] flex flex-col h-screen overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold text-slate-900">{PAGE_TITLES[currentView] ?? currentView}</h1>
          </div>
        </header>

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-30">
        {MOBILE_NAV.map(({ id, name, icon: Icon }) => {
          const active = currentView === id || (id === 'surveys' && ['ai-survey', 'land-survey'].includes(currentView));
          return (
            <button
              key={id}
              onClick={() => onNavigate(id as View)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-green-700' : 'text-slate-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-green-600' : ''}`} />
              {name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to add `surveys` view and wire SurveysHub**

Add `'surveys'` to the `View` type. We'll create `SurveysHub` in Task 6, but add the import and route now:

```tsx
// frontend/src/app/App.tsx — add to imports
import { SurveysHub } from './components/surveys/SurveysHub';

// Update the View type:
type View = 'login' | 'register' | 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor';

// Add to the authenticated views render block:
{currentView === 'surveys' && <SurveysHub onNavigate={setCurrentView} />}
```

- [ ] **Step 3: Build the app and check for TypeScript errors**

```bash
cd /home/chandan/Downloads/aquaponic-ai/frontend
npm run build 2>&1 | tail -30
```

Expected: build succeeds (SurveysHub import will fail — acceptable until Task 6 creates the file; fix by commenting out that import temporarily if needed).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/layout/MainLayout.tsx frontend/src/app/App.tsx
git commit -m "feat: refactor MainLayout to sidebar-first with mobile bottom nav, rebrand to AgriSense"
```

---

## Task 2: Build StatCard Primitive

**Files:**
- Create: `frontend/src/app/components/ui/StatCard.tsx`

- [ ] **Step 1: Create StatCard component**

```tsx
// frontend/src/app/components/ui/StatCard.tsx
import { LucideIcon } from 'lucide-react';
import { Skeleton } from './skeleton';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  accentColor?: 'green' | 'blue' | 'amber' | 'purple';
  loading?: boolean;
}

const ACCENT = {
  green:  { border: 'border-t-green-500',  iconBg: 'bg-green-50',  iconText: 'text-green-600'  },
  blue:   { border: 'border-t-blue-500',   iconBg: 'bg-blue-50',   iconText: 'text-blue-600'   },
  amber:  { border: 'border-t-amber-500',  iconBg: 'bg-amber-50',  iconText: 'text-amber-600'  },
  purple: { border: 'border-t-purple-500', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
};

export function StatCard({ label, value, trend, trendUp, icon: Icon, accentColor = 'green', loading = false }: StatCardProps) {
  const a = ACCENT[accentColor];

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 border-t-4 ${a.border} p-4`}>
        <Skeleton className="w-9 h-9 rounded-lg mb-3 bg-slate-100" />
        <Skeleton className="h-7 w-20 mb-1.5 bg-slate-100" />
        <Skeleton className="h-3.5 w-28 mb-2 bg-slate-100" />
        <Skeleton className="h-3 w-16 bg-slate-100" />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-t-4 ${a.border} p-4`}>
      <div className={`w-9 h-9 rounded-lg ${a.iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`w-[18px] h-[18px] ${a.iconText}`} />
      </div>
      <div className="text-2xl font-extrabold text-slate-900 leading-none mb-1">{value}</div>
      <div className="text-xs text-slate-500 mb-2">{label}</div>
      {trend && (
        <div className={`text-[11px] font-semibold ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/components/ui/StatCard.tsx
git commit -m "feat: add StatCard UI primitive"
```

---

## Task 3: Build EmptyState Primitive

**Files:**
- Create: `frontend/src/app/components/ui/EmptyState.tsx`

- [ ] **Step 1: Create EmptyState component**

```tsx
// frontend/src/app/components/ui/EmptyState.tsx
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs mb-5">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-green-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/components/ui/EmptyState.tsx
git commit -m "feat: add EmptyState UI primitive"
```

---

## Task 4: Build ChartCarousel

**Files:**
- Create: `frontend/src/app/components/ui/ChartCarousel.tsx`

- [ ] **Step 1: Create ChartCarousel component**

The carousel accepts pre-computed chart data (passed as props) and renders 4 tabs. The Dashboard fetches the data and passes it in.

```tsx
// frontend/src/app/components/ui/ChartCarousel.tsx
import { useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Skeleton } from './skeleton';

export interface RevenueDataPoint { month: string; revenue: number; cost: number; }
export interface RoiDataPoint     { month: string; roi: number; }
export interface CropDataPoint    { name: string; value: number; }

interface ChartCarouselProps {
  revenueData: RevenueDataPoint[];
  roiData: RoiDataPoint[];
  cropData: CropDataPoint[];
  surveyStats: { aquaCount: number; landCount: number; aquaRoi: number; landRoi: number };
  loading?: boolean;
}

const TABS = ['Revenue', 'ROI', 'Crops', 'Surveys'] as const;
type Tab = typeof TABS[number];

const CROP_COLORS = ['#16a34a', '#4ade80', '#86efac', '#f59e0b', '#fb923c'];

const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${n}`;

export function ChartCarousel({ revenueData, roiData, cropData, surveyStats, loading = false }: ChartCarouselProps) {
  const [active, setActive] = useState<Tab>('Revenue');

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32 bg-slate-100" />
          <Skeleton className="h-8 w-48 rounded-lg bg-slate-100" />
        </div>
        <Skeleton className="h-[200px] w-full rounded-lg bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {active === 'Revenue' && 'Revenue vs Cost'}
            {active === 'ROI' && 'ROI Trend'}
            {active === 'Crops' && 'Top Crops by Profit'}
            {active === 'Surveys' && 'Survey Activity'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {active === 'Revenue' && 'All farms · Last 6 months'}
            {active === 'ROI' && 'Monthly return on investment'}
            {active === 'Crops' && 'Across all land surveys'}
            {active === 'Surveys' && 'Completed surveys breakdown'}
          </p>
        </div>
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                active === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      {active === 'Revenue' && (
        revenueData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">No revenue data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="cost" fill="#bbf7d0" radius={[4, 4, 0, 0]} name="Cost" />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </BarChart>
          </ResponsiveContainer>
        )
      )}

      {active === 'ROI' && (
        roiData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">Complete a survey to see ROI trend</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={roiData}>
              <defs>
                <linearGradient id="roiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Area type="monotone" dataKey="roi" stroke="#16a34a" strokeWidth={2.5} fill="url(#roiGrad)" dot={{ r: 3, fill: '#16a34a' }} name="ROI %" />
            </AreaChart>
          </ResponsiveContainer>
        )
      )}

      {active === 'Crops' && (
        cropData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">No crop data yet</div>
        ) : (
          <div className="flex items-center gap-6 h-[200px]">
            <ResponsiveContainer width="40%" height="100%">
              <PieChart>
                <Pie data={cropData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {cropData.map((_, i) => <Cell key={i} fill={CROP_COLORS[i % CROP_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {cropData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CROP_COLORS[i % CROP_COLORS.length] }} />
                  <span className="text-xs text-slate-600 flex-1 truncate">{item.name}</span>
                  <span className="text-xs font-bold text-slate-900">{fmt(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {active === 'Surveys' && (
        <div className="grid grid-cols-2 gap-3 py-3">
          {[
            { label: 'Aquaponic surveys', value: surveyStats.aquaCount, sub: `Avg ROI: ${surveyStats.aquaRoi.toFixed(0)}%`, color: 'text-green-700' },
            { label: 'Land surveys', value: surveyStats.landCount, sub: `Avg ROI: ${surveyStats.landRoi.toFixed(0)}%`, color: 'text-amber-700' },
            { label: 'Total completed', value: surveyStats.aquaCount + surveyStats.landCount, sub: 'All time', color: 'text-slate-700' },
            { label: 'Best ROI type', value: surveyStats.aquaRoi >= surveyStats.landRoi ? 'Aquaponic' : 'Land', sub: 'Higher average', color: 'text-blue-700' },
          ].map((tile) => (
            <div key={tile.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className={`text-2xl font-extrabold ${tile.color}`}>{tile.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{tile.label}</div>
              <div className="text-[11px] font-semibold text-slate-400 mt-1.5">{tile.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/components/ui/ChartCarousel.tsx
git commit -m "feat: add ChartCarousel with 4 Recharts views (revenue, ROI, crops, surveys)"
```

---

## Task 5: Refactor Dashboard

**Files:**
- Modify: `frontend/src/app/components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Rewrite Dashboard.tsx**

```tsx
// frontend/src/app/components/dashboard/Dashboard.tsx
import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Clock, Sprout, ClipboardList, Bot, ChevronRight } from 'lucide-react';
import { farmAPI, reportAPI } from '../../utils/api';
import { StatCard } from '../ui/StatCard';
import { EmptyState } from '../ui/EmptyState';
import { ChartCarousel, RevenueDataPoint, RoiDataPoint, CropDataPoint } from '../ui/ChartCarousel';
import { Skeleton } from '../ui/skeleton';

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
  const [loading, setLoading] = useState(true);
  const [farmsCount, setFarmsCount] = useState(0);
  const [topSessions, setTopSessions] = useState<TopSession[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [roiData, setRoiData] = useState<RoiDataPoint[]>([]);
  const [cropData, setCropData] = useState<CropDataPoint[]>([]);
  const [surveyStats, setSurveyStats] = useState({ aquaCount: 0, landCount: 0, aquaRoi: 0, landRoi: 0 });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [farmsRes, analyticsRes] = await Promise.allSettled([
        farmAPI.list(),
        reportAPI.analytics(),
      ]);

      if (farmsRes.status === 'fulfilled') {
        setFarmsCount((farmsRes.value?.data ?? []).length);
      }

      if (analyticsRes.status === 'fulfilled') {
        const data = analyticsRes.value?.data ?? {};
        const sessions: TopSession[] = data.top_sessions ?? [];
        setTopSessions(sessions.slice(0, 4));

        // Build chart data from monthly_data if present
        const monthly: Record<string, { revenue: number; cost: number; roi: number; count: number }> = {};
        (data.monthly_data ?? []).forEach((m: any) => {
          const key = m.month ?? m.month_key ?? '';
          if (!key) return;
          monthly[key] = {
            revenue: (m.ai_revenue ?? 0) + (m.land_revenue ?? 0),
            cost: (m.ai_cost ?? 0) + (m.land_cost ?? 0),
            roi: ((m.ai_roi ?? 0) + (m.land_roi ?? 0)) / Math.max((m.ai_count ?? 0) + (m.land_count ?? 0), 1),
            count: (m.ai_count ?? 0) + (m.land_count ?? 0),
          };
        });

        const months = Object.keys(monthly).sort().slice(-6);
        setRevenueData(months.map((m) => ({ month: m.slice(-3), revenue: monthly[m].revenue, cost: monthly[m].cost })));
        setRoiData(months.filter((m) => monthly[m].count > 0).map((m) => ({ month: m.slice(-3), roi: monthly[m].roi })));

        // Crop data from top_crop_revenue if present
        const crops: CropDataPoint[] = (data.top_crops ?? [])
          .slice(0, 5)
          .map((c: any) => ({ name: c.crop ?? c.name ?? 'Unknown', value: c.revenue ?? c.profit ?? 0 }));
        setCropData(crops);

        // Survey stats
        const aqua = sessions.filter((s) => s.survey_type === 'ai');
        const land = sessions.filter((s) => s.survey_type === 'land');
        setSurveyStats({
          aquaCount: data.ai_completed_count ?? aqua.length,
          landCount: data.land_completed_count ?? land.length,
          aquaRoi: aqua.length ? aqua.reduce((s, r) => s + (r.roi_percent ?? 0), 0) / aqua.length : 0,
          landRoi: land.length ? land.reduce((s, r) => s + (r.roi_percent ?? 0), 0) / land.length : 0,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  // Compute KPI stats from top sessions
  const allRevenue = topSessions.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const allRoi = topSessions.length ? topSessions.reduce((s, r) => s + (r.roi_percent ?? 0), 0) / topSessions.length : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Welcome line */}
      <div>
        <p className="text-xs text-slate-400 mb-0">
          Welcome back, <span className="font-semibold text-slate-600">{user?.name ?? 'Farmer'}</span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Monthly Revenue"
          value={loading ? '—' : allRevenue > 0 ? `₹${(allRevenue / 100000).toFixed(1)}L` : '₹0'}
          trend={allRevenue > 0 ? 'from surveys' : undefined}
          trendUp
          icon={DollarSign}
          accentColor="green"
          loading={loading}
        />
        <StatCard
          label="Average ROI"
          value={loading ? '—' : allRoi > 0 ? `${allRoi.toFixed(0)}%` : '—'}
          trend={allRoi > 0 ? 'across farms' : undefined}
          trendUp={allRoi > 0}
          icon={TrendingUp}
          accentColor="blue"
          loading={loading}
        />
        <StatCard
          label="Surveys Completed"
          value={loading ? '—' : `${surveyStats.aquaCount + surveyStats.landCount}`}
          trend={surveyStats.aquaCount + surveyStats.landCount > 0 ? `${surveyStats.aquaCount} aqua · ${surveyStats.landCount} land` : undefined}
          trendUp
          icon={ClipboardList}
          accentColor="amber"
          loading={loading}
        />
        <StatCard
          label="Active Farms"
          value={loading ? '—' : `${farmsCount}`}
          trend={farmsCount > 0 ? 'registered' : undefined}
          trendUp
          icon={Sprout}
          accentColor="purple"
          loading={loading}
        />
      </div>

      {/* Chart + Recent Surveys */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Chart carousel */}
        <ChartCarousel
          revenueData={revenueData}
          roiData={roiData}
          cropData={cropData}
          surveyStats={surveyStats}
          loading={loading}
        />

        {/* Recent Surveys */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Recent Surveys</h3>
            <button onClick={() => onNavigate?.('surveys')} className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-2 h-2 rounded-full bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-1"><Skeleton className="h-3.5 w-3/4 bg-slate-100" /><Skeleton className="h-3 w-1/2 bg-slate-100" /></div>
                  <Skeleton className="h-4 w-10 bg-slate-100" />
                </div>
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
            <div className="space-y-0 divide-y divide-slate-50">
              {topSessions.map((s) => (
                <div key={s.session_id} className="flex items-center gap-3 py-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.survey_type === 'ai' ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{s.project_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {s.survey_type === 'ai' ? 'Aquaponic' : 'Land'} · {relativeTime(s.completed_at)}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-900 flex-shrink-0">
                    {s.roi_percent != null ? `${s.roi_percent.toFixed(0)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'New Aquaponic Survey', sub: 'Voice-guided, ~5 min', view: 'ai-survey', icon: Sprout, bg: 'bg-green-50', iconColor: 'text-green-600' },
          { label: 'New Land Survey', sub: 'Crop & financial plan', view: 'land-survey', icon: ClipboardList, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
          { label: 'Ask AI Advisor', sub: 'Powered by Sarvam 30B', view: 'ai-advisor', icon: Bot, bg: 'bg-blue-50', iconColor: 'text-blue-600' },
        ].map((action) => (
          <button
            key={action.view}
            onClick={() => onNavigate?.(action.view)}
            className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-green-200 hover:bg-green-50/30 transition-colors text-left group"
          >
            <div className={`w-10 h-10 rounded-xl ${action.bg} flex items-center justify-center flex-shrink-0`}>
              <action.icon className={`w-5 h-5 ${action.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{action.label}</p>
              <p className="text-xs text-slate-400">{action.sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the app and verify no TypeScript errors**

```bash
cd /home/chandan/Downloads/aquaponic-ai/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/dashboard/Dashboard.tsx
git commit -m "feat: refactor Dashboard with KPI cards, ChartCarousel, recent surveys, quick actions"
```

---

## Task 6: Create SurveysHub Page

**Files:**
- Create: `frontend/src/app/components/surveys/SurveysHub.tsx`

- [ ] **Step 1: Create SurveysHub component**

```tsx
// frontend/src/app/components/surveys/SurveysHub.tsx
import { useEffect, useState } from 'react';
import { Sprout, Mic, FileText, Download, ChevronRight } from 'lucide-react';
import { reportAPI } from '../../utils/api';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/skeleton';

interface SurveysHubProps {
  onNavigate: (view: string) => void;
}

interface SurveyRow {
  session_id: string;
  survey_type: string;
  project_name: string;
  completed_at: string | null;
  roi_percent: number;
  revenue: number;
}

const relativeTime = (iso: string | null) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function SurveysHub({ onNavigate }: SurveysHubProps) {
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportAPI.analytics()
      .then((res: any) => setSurveys(res?.data?.top_sessions ?? []))
      .catch(() => setSurveys([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Launch cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate('ai-survey')}
          className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-start gap-3 hover:border-green-300 hover:shadow-md transition-all text-left group"
        >
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
            <Sprout className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Aquaponic Survey</h3>
            <p className="text-sm text-slate-500 mt-1">Voice-guided financial planning for aquaponic farms. Takes ~5 minutes.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-600 group-hover:gap-2 transition-all">
            Start survey <ChevronRight className="w-4 h-4" />
          </span>
        </button>

        <button
          onClick={() => onNavigate('land-survey')}
          className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-start gap-3 hover:border-amber-300 hover:shadow-md transition-all text-left group"
        >
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
            <Mic className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Land Farm Survey</h3>
            <p className="text-sm text-slate-500 mt-1">Capture land, crops, costs, and market prices to generate a financial plan.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 group-hover:gap-2 transition-all">
            Start survey <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      </div>

      {/* History table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Survey History</h3>
          <p className="text-xs text-slate-400 mt-0.5">All completed surveys, sorted by profit</p>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-2 h-2 rounded-full bg-slate-100" />
                <Skeleton className="h-4 flex-1 bg-slate-100" />
                <Skeleton className="h-4 w-16 bg-slate-100" />
                <Skeleton className="h-4 w-12 bg-slate-100" />
                <Skeleton className="h-6 w-16 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No surveys completed yet"
            description="Complete your first aquaponic or land survey to see history here"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Name</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Type</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Date</th>
                  <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">ROI</th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s.session_id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">{s.project_name}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        s.survey_type === 'ai'
                          ? 'bg-green-50 text-green-800 border-green-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {s.survey_type === 'ai' ? 'Aquaponic' : 'Land'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{relativeTime(s.completed_at)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">
                      {s.roi_percent != null ? `${s.roi_percent.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/chandan/Downloads/aquaponic-ai/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/surveys/SurveysHub.tsx frontend/src/app/App.tsx
git commit -m "feat: add SurveysHub page with launch cards and survey history table"
```

---

## Task 7: Refactor Analytics Page

**Files:**
- Modify: `frontend/src/app/components/analytics/Analytics.tsx`

- [ ] **Step 1: Add skeleton loading and EmptyState to Analytics**

Read the current Analytics.tsx, then wrap all loading states with Skeleton and replace the "No Analysis Yet" blank state with EmptyState. The core logic stays the same — only the visual presentation changes.

The key changes:
1. Replace the loading spinner with section-level skeletons
2. Replace blank/null states with `<EmptyState>`
3. Apply the AgriSense design tokens (green-600 accents, slate borders, rounded-xl cards)
4. Remove the inline `h-[calc(100vh-...)]` height hacks — let the AppShell handle scrolling

Add these imports at the top of `Analytics.tsx`:

```tsx
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/EmptyState';
import { BarChart3, ClipboardList } from 'lucide-react';
```

Replace the "No Analysis Yet" blank render (currently shown when `!analysis && !bootstrapping`) with:

```tsx
{!analysis && !bootstrapping && (
  <div className="p-4 md:p-6">
    <EmptyState
      icon={ClipboardList}
      title="No analysis yet"
      description="Complete an aquaponic or land survey to see your financial analysis here."
      actionLabel="Start a Survey"
      onAction={() => {/* navigate to surveys — wire via prop if needed */}}
    />
  </div>
)}
```

Replace loading spinner blocks with:
```tsx
{bootstrapping && (
  <div className="p-4 md:p-6 space-y-4">
    <Skeleton className="h-8 w-64 bg-slate-100" />
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl bg-slate-100" />)}
    </div>
    <Skeleton className="h-48 rounded-xl bg-slate-100" />
  </div>
)}
```

Wrap all card containers with the AgriSense card class:
```tsx
// Replace: className="bg-white shadow rounded-lg p-4"  (or similar)
// With:    className="bg-white border border-slate-200 rounded-xl p-5"
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/chandan/Downloads/aquaponic-ai/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/analytics/Analytics.tsx
git commit -m "feat: polish Analytics with skeletons, EmptyState, AgriSense card styles"
```

---

## Task 8: Polish AI Advisor, FarmManagement, Reports

**Files:**
- Modify: `frontend/src/app/components/ai/AIAdvisor.tsx`
- Modify: `frontend/src/app/components/farms/FarmManagement.tsx`
- Modify: `frontend/src/app/components/reports/Reports.tsx`

- [ ] **Step 1: Polish AIAdvisor.tsx — apply design tokens**

The survey selector + chat logic is already implemented. Apply visual polish:

```tsx
// In AIAdvisor.tsx — update the outer wrapper div:
// Old: className="flex flex-col h-[calc(100vh-6rem)] ..."
// New:
<div className="flex flex-col h-full max-w-3xl mx-auto px-4 md:px-6 py-5"
     style={{ height: 'calc(100vh - 56px)' }}>
  {/* header */}
  <div className="mb-4">
    <h2 className="text-base font-bold text-slate-900">AI Advisor</h2>
    <p className="text-xs text-slate-400 mt-0.5">Powered by Sarvam 30B · Personalised to your farm data</p>
  </div>

  {/* Survey selector — already exists, update classes: */}
  {/* label: className="block text-xs font-semibold text-slate-600 mb-1.5" */}
  {/* select: className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" */}

  {/* User bubble: className="bg-green-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm" */}
  {/* AI bubble: className="bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm shadow-sm" */}

  {/* Input bar send button: className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors" */}
</div>
```

- [ ] **Step 2: Polish FarmManagement.tsx — card grid and skeletons**

Read the current FarmManagement, then make these targeted changes:

Replace the loading spinner with a skeleton grid:
```tsx
{loading && (
  <div className="p-4 md:p-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-36 rounded-xl bg-slate-100" />)}
    </div>
  </div>
)}
```

Replace empty state text with EmptyState component:
```tsx
import { EmptyState } from '../ui/EmptyState';
import { Sprout } from 'lucide-react';

// When no farms:
<EmptyState
  icon={Sprout}
  title="No farms yet"
  description="Add your first farm to start tracking water quality and performance."
  actionLabel="Add Farm"
  onAction={() => setShowAddForm(true)}  // wire to existing add-farm logic
/>
```

Apply card styles to each farm card:
```tsx
// Replace existing farm card container class with:
className="bg-white border border-slate-200 rounded-xl p-5 hover:border-green-200 hover:shadow-sm transition-all"
```

- [ ] **Step 3: Polish Reports.tsx — table and skeletons**

Read the current Reports.tsx, then apply:

```tsx
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/EmptyState';
import { FileText } from 'lucide-react';

// Replace loading spinner with skeleton rows:
{loading && (
  <div className="p-4 md:p-6 space-y-3">
    {[1,2,3].map(i => (
      <div key={i} className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl p-4">
        <Skeleton className="h-4 flex-1 bg-slate-100" />
        <Skeleton className="h-4 w-20 bg-slate-100" />
        <Skeleton className="h-4 w-24 bg-slate-100" />
        <Skeleton className="h-8 w-24 rounded-lg bg-slate-100" />
      </div>
    ))}
  </div>
)}

// Replace empty state with:
<EmptyState
  icon={FileText}
  title="No reports yet"
  description="Complete a survey to generate your first financial report."
/>

// Table container:
className="bg-white border border-slate-200 rounded-xl overflow-hidden"

// Table header cells:
className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 bg-slate-50"

// Aquaponic badge in table:
className="bg-green-50 text-green-800 border border-green-200 text-[11px] font-semibold px-2 py-0.5 rounded-md"

// Land badge in table:
className="bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold px-2 py-0.5 rounded-md"
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/chandan/Downloads/aquaponic-ai/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/ai/AIAdvisor.tsx \
         frontend/src/app/components/farms/FarmManagement.tsx \
         frontend/src/app/components/reports/Reports.tsx
git commit -m "feat: polish AIAdvisor, FarmManagement, Reports with AgriSense design tokens and skeletons"
```

---

## Task 9: Brand Rename Sweep

**Files:**
- Modify: `frontend/src/app/App.tsx` (title tag if present)
- Modify: `frontend/index.html` (page title)
- Modify: `frontend/src/app/components/auth/Login.tsx` (logo/brand text)
- Modify: `frontend/src/app/components/auth/Register.tsx` (logo/brand text)

- [ ] **Step 1: Rename brand in index.html**

```bash
grep -rn "AquaponicAI\|AquaponicsAI\|Aquaponic AI" /home/chandan/Downloads/aquaponic-ai/frontend/ --include="*.html" --include="*.tsx" --include="*.ts" --include="*.js" 2>/dev/null
```

For each occurrence found, replace with "AgriSense". The main locations:
- `frontend/index.html`: `<title>AquaponicsAI</title>` → `<title>AgriSense</title>`
- `frontend/src/app/components/auth/Login.tsx`: brand text in header
- `frontend/src/app/components/auth/Register.tsx`: brand text in header

- [ ] **Step 2: Update Login.tsx brand block**

Read `Login.tsx`, find the brand/logo section, and replace with:

```tsx
<div className="flex items-center gap-2.5 justify-center mb-2">
  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
    <Leaf className="w-4 h-4 text-white" />
  </div>
  <span className="text-xl font-extrabold text-slate-900 tracking-tight">
    Agri<span className="text-green-600">Sense</span>
  </span>
</div>
```

Ensure `Leaf` is imported from `lucide-react` in Login.tsx.

- [ ] **Step 3: Apply same brand block to Register.tsx**

Same change as Step 2, applied to Register.tsx.

- [ ] **Step 4: Verify no occurrences remain**

```bash
grep -rn "AquaponicAI\|AquaponicsAI\|Aquaponic AI" /home/chandan/Downloads/aquaponic-ai/frontend/src/ 2>/dev/null
```

Expected: zero results (or only inside comments that don't matter).

- [ ] **Step 5: Build final time**

```bash
cd /home/chandan/Downloads/aquaponic-ai/frontend
npm run build 2>&1 | tail -20
```

Expected: clean build, zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html \
         frontend/src/app/components/auth/Login.tsx \
         frontend/src/app/components/auth/Register.tsx
git commit -m "feat: rename brand AquaponicsAI → AgriSense across all frontend files"
```

---

## Task 10: Deploy and Verify

- [ ] **Step 1: Rebuild Docker frontend container**

```bash
cd /home/chandan/Downloads/aquaponic-ai
docker compose up -d --build frontend 2>&1 | tail -15
```

Expected: frontend container rebuilt and started.

- [ ] **Step 2: Smoke test all screens**

Open http://localhost:3001 (or http://localhost:80 via nginx) and verify:
- [ ] Login screen shows "AgriSense" brand
- [ ] Sidebar shows light theme with grouped nav items and SVG icons
- [ ] Dashboard shows 4 KPI cards and chart carousel
- [ ] Chart carousel tabs (Revenue / ROI / Crops / Surveys) all render without errors
- [ ] Surveys page shows two launch cards and history table
- [ ] Analytics loads with skeleton then data (no blank "No Analysis Yet" without reason)
- [ ] AI Advisor shows survey selector and green chat bubbles
- [ ] Mobile bottom nav visible at < 768px width (use browser DevTools responsive mode)
- [ ] No "AquaponicsAI" text visible anywhere in the app

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: post-deploy smoke test fixes"
```
