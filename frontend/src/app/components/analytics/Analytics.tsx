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
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Info,
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

type ScenarioKey = 'base' | 'pessimistic' | 'optimistic';
type Priority = 'high' | 'medium' | 'low';
type SurveyMode = 'aquaponics' | 'land';

interface Inputs {
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

interface Recommendation {
  priority: Priority;
  category: string;
  title: string;
  detail: string;
}

interface FlowRow {
  month: number;
  revenue: number;
  opex: number;
  net: number;
  cumulative: number;
}

interface Metrics {
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

const SCENARIOS: { key: ScenarioKey; label: string; factor: number }[] = [
  { key: 'base', label: 'Base', factor: 1.0 },
  { key: 'pessimistic', label: 'Pessimistic -25%', factor: 0.75 },
  { key: 'optimistic', label: 'Optimistic +30%', factor: 1.3 },
];

const COST_COLORS = ['#22c55e', '#0ea5e9', '#f59e0b', '#f97316', '#6366f1'];
const REV_COLORS = ['#059669', '#84cc16', '#0ea5e9'];

const PRIORITY_CONFIG: Record<
  Priority,
  { badge: string; icon: ComponentType<{ size?: number; className?: string }>; iconCls: string }
> = {
  high: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertTriangle,
    iconCls: 'text-red-500',
  },
  medium: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Info,
    iconCls: 'text-amber-500',
  },
  low: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
    iconCls: 'text-emerald-500',
  },
};

const GRID_COLOR = '#eef2f7';
const TICK_STYLE = { fill: '#64748b', fontSize: 11 };
const LAND_SESSION_KEY = 'land_survey_session_id';

function num(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildInputs(analysis: any): Inputs {
  const answers = analysis?.farm_answers || {};
  const plan = analysis?.financial_plan || {};
  const baseCashFlows = plan?.scenarios?.base?.cash_flows || [];
  const horizonFromPlan = Array.isArray(baseCashFlows) && baseCashFlows.length > 0 ? baseCashFlows.length : 24;

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

function buildLandInputs(landDashboard: any): Inputs {
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

function computeMetrics(inp: Inputs, factor = 1): Metrics {
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
    if (cumulative >= 0 && breakEvenMonth === null) {
      breakEvenMonth = m;
    }
    flows.push({
      month: m,
      revenue: Math.round(monthRev),
      opex: Math.round(monthOpex),
      net: Math.round(monthNet),
      cumulative: Math.round(cumulative),
    });
  }

  const monthlyRate = Math.pow(1.08, 1 / 12) - 1;
  const npv = -inp.capex +
    flows.reduce((acc, _, i) => acc + monthNet / Math.pow(1 + monthlyRate, i + 1), 0);

  return {
    monthRev,
    monthOpex,
    monthNet,
    annRev,
    annOpex,
    annProfit,
    roi,
    payback,
    breakEvenMonth,
    flows,
    npv: Math.round(npv),
    capex: inp.capex,
  };
}

function generateRecommendations(inp: Inputs, base: Metrics): Recommendation[] {
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
      detail: `Target below 35% by improving feed conversion and bulk purchasing. Estimated saving: ${fmtRs(
        inp.feed * 0.1,
      )}/month.`,
    });
  }

  if (base.payback && base.payback > 24) {
    recs.push({
      priority: 'medium',
      category: 'Revenue',
      title: `Payback is ${Math.round(base.payback)} months`,
      detail: `Introduce direct sales channels to improve margin. Potential uplift: ${fmtRs(
        (inp.fishRev + inp.cropRev) * 0.15,
      )}/month.`,
    });
  }

  if (fishShare > 0.8) {
    recs.push({
      priority: 'medium',
      category: 'Diversification',
      title: `${Math.round(fishShare * 100)}% of revenue comes from fish`,
      detail: `Reduce concentration risk by adding higher-value crops to the grow bed portfolio.`,
    });
  }

  if (base.roi > 25 && base.payback && base.payback < 24) {
    recs.push({
      priority: 'low',
      category: 'Growth',
      title: `ROI is healthy at ${Math.round(base.roi)}%`,
      detail: `Consider staged expansion funded from operating surplus to preserve cash-flow safety.`,
    });
  }

  if (inp.util > inp.feed * 1.2) {
    recs.push({
      priority: 'high',
      category: 'Energy',
      title: 'Utilities exceed feed cost',
      detail: 'Audit pumps and lighting schedules; efficient pumps and LED controls can materially reduce power cost.',
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

function fmt(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

function fmtRs(value: number): string {
  return `INR ${fmt(value)}`;
}

function fmtLakh(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}${Math.round(abs / 100000) / 10}L`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
  return `${sign}${Math.round(abs)}`;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-medium text-gray-800 mb-2">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={`${entry.name}-${idx}`} className="flex items-center gap-2 text-gray-600">
          <span className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
          <span>{entry.name}:</span>
          <span className="text-gray-800 font-medium">{typeof entry.value === 'number' ? fmtRs(entry.value) : entry.value}</span>
        </p>
      ))}
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        {trend === 'up' && <TrendingUp size={14} className="text-emerald-600" />}
        {trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  display,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  display: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-gray-600">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 flex-1 accent-emerald-600"
      />
      <span className="w-24 shrink-0 text-right font-mono text-xs text-emerald-700">{display}</span>
    </div>
  );
}

export function Analytics() {
  const analysis = useStore((state: any) => state.analysis);
  const session = useStore((state: any) => state.session);
  const loading = useStore((state: any) => state.loading);
  const restoreSurveyState = useStore((state: any) => state.restoreSurveyState);
  const fetchAnalysis = useStore((state: any) => state.fetchAnalysis);

  const [surveyMode, setSurveyMode] = useState<SurveyMode>('aquaponics');
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [showSliders, setShowSliders] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(!analysis);
  const [landBootstrapping, setLandBootstrapping] = useState(true);
  const [landContext, setLandContext] = useState<any>(null);
  const [landDashboard, setLandDashboard] = useState<any>(null);
  const [inputs, setInputs] = useState<Inputs>(() => buildInputs(analysis));

  useEffect(() => {
    let alive = true;

    const run = async () => {
      // Fetch analytics and restore aquaponics state in parallel (single analytics call shared by both paths)
      const [, analyticsResult] = await Promise.allSettled([
        analysis ? Promise.resolve() : restoreSurveyState().catch(() => {}),
        reportAPI.analytics().catch(() => null),
      ]);

      if (!alive) return;

      const analyticsData = analyticsResult.status === 'fulfilled' ? analyticsResult.value?.data : null;
      const topSessions: any[] = analyticsData?.top_sessions || [];

      // Fallback: if localStorage had no session, use latest aquaponics session from server
      const currentAnalysis = useStore.getState().analysis;
      if (!currentAnalysis) {
        const latestAqua = topSessions.find((row: any) => row.survey_type === 'ai');
        if (latestAqua?.session_id) {
          try { await fetchAnalysis(latestAqua.session_id); } catch { /* ignore */ }
        }
      }
      if (alive) setBootstrapping(false);

      // Land loading — reuse analyticsData already fetched above (no duplicate call)
      const latestLand = topSessions.find((row: any) => row.survey_type === 'land');
      if (!latestLand?.session_id) {
        if (alive) { setLandContext(null); setLandDashboard(null); setLandBootstrapping(false); }
        return;
      }

      try {
        const [sessionRes, dashboardRes] = await Promise.all([
          landSurveyAPI.get(latestLand.session_id),
          landSurveyAPI.dashboard(latestLand.session_id),
        ]);
        if (!alive) return;
        setLandContext(sessionRes?.data || null);
        setLandDashboard(dashboardRes?.data || null);
      } catch {
        if (alive) { setLandContext(null); setLandDashboard(null); }
      } finally {
        if (alive) setLandBootstrapping(false);
      }
    };

    run();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (surveyMode === 'aquaponics' && !analysis && landDashboard) {
      setSurveyMode('land');
    }
  }, [surveyMode, analysis, landDashboard]);

  useEffect(() => {
    if (surveyMode === 'land') {
      setInputs(buildLandInputs(landDashboard));
    } else {
      setInputs(buildInputs(analysis));
    }
  }, [surveyMode, analysis?.session_id, landDashboard?.session_id]);

  const setInput = useCallback((key: keyof Inputs, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const factor = SCENARIOS.find((item) => item.key === scenario)?.factor ?? 1;

  const base = useMemo(() => computeMetrics(inputs, 1), [inputs]);
  const pess = useMemo(() => computeMetrics(inputs, 0.75), [inputs]);
  const opti = useMemo(() => computeMetrics(inputs, 1.3), [inputs]);
  const curr = useMemo(() => computeMetrics(inputs, factor), [inputs, factor]);
  const generatedRecs = useMemo(() => generateRecommendations(inputs, base), [inputs, base]);

  const apiRecommendations = useMemo(() => {
    const list = analysis?.financial_plan?.ai_recommendations;
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && item.title && item.detail)
      .map((item) => ({
        priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'low',
        category: String(item.category || 'Recommendation'),
        title: String(item.title),
        detail: String(item.detail),
      })) as Recommendation[];
  }, [analysis]);

  const landApiRecommendations = useMemo(() => {
    const list = landDashboard?.recommendations;
    if (!Array.isArray(list)) return [];
    return list
      .filter((item: any) => item && item.title && item.detail)
      .map((item: any) => ({
        priority: (['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'low') as Priority,
        category: String(item.category || 'Recommendation'),
        title: String(item.title),
        detail: String(item.detail),
      })) as Recommendation[];
  }, [landDashboard]);

  const recommendations: Recommendation[] =
    surveyMode === 'land'
      ? landApiRecommendations.length > 0
        ? landApiRecommendations
        : generatedRecs
      : apiRecommendations.length > 0
      ? apiRecommendations
      : generatedRecs;

  const cumulData = useMemo(
    () =>
      base.flows.map((row, idx) => ({
        month: row.month,
        Base: row.cumulative,
        Pessimistic: pess.flows[idx]?.cumulative ?? 0,
        Optimistic: opti.flows[idx]?.cumulative ?? 0,
      })),
    [base, pess, opti],
  );

  const barStep = Math.max(1, Math.floor(inputs.horizon / 12));
  const barData = useMemo(
    () =>
      curr.flows
        .filter((_, idx) => idx % barStep === 0)
        .map((row) => ({ Month: `M${row.month}`, Revenue: row.revenue, OPEX: row.opex, Net: row.net })),
    [curr.flows, barStep],
  );

  const costData =
    surveyMode === 'land'
      ? [
          { name: 'Seeds', value: inputs.feed },
          { name: 'Labor', value: inputs.labor },
          { name: 'Energy & Transport', value: inputs.util },
          { name: 'Rent & Maintenance', value: inputs.maint },
          { name: 'Other', value: inputs.other },
        ]
      : [
          { name: 'Fish Feed', value: inputs.feed },
          { name: 'Labor', value: inputs.labor },
          { name: 'Utilities', value: inputs.util },
          { name: 'Maintenance', value: inputs.maint },
          { name: 'Other', value: inputs.other },
        ];

  const revData = useMemo(() => {
    if (surveyMode === 'land') {
      const crops = (landDashboard?.crop_performance || [])
        .map((row: any) => ({
          name: String(row.crop || 'Crop'),
          value: Math.round(num(row.revenue_annual, 0) * factor),
        }))
        .sort((a: any, b: any) => b.value - a.value);

      if (crops.length === 0) {
        return [{ name: 'Crop Sales', value: Math.round(inputs.cropRev * factor) }];
      }

      if (crops.length === 1) {
        return crops;
      }

      const top = crops[0];
      const second = crops[1];
      const restValue = crops.slice(2).reduce((sum: number, row: any) => sum + row.value, 0);
      return restValue > 0
        ? [top, second, { name: 'Other Crops', value: restValue }]
        : [top, second];
    }

    return [
      { name: 'Fish Sales', value: Math.round(inputs.fishRev * factor) },
      { name: 'Crop Sales', value: Math.round(inputs.cropRev * factor) },
    ];
  }, [surveyMode, landDashboard, factor, inputs.cropRev, inputs.fishRev]);

  const priceDown = computeMetrics(inputs, 0.9);
  const yieldDown = computeMetrics(inputs, 0.855);

  const scenarioData = [
    { name: 'Optimistic (+30%)', value: Math.round(opti.annProfit) },
    { name: 'Base', value: Math.round(base.annProfit) },
    { name: 'Price -10%', value: Math.round(priceDown.annProfit) },
    { name: 'Yield -10%', value: Math.round(yieldDown.annProfit) },
    { name: 'Cost +10%', value: Math.round(base.annRev - base.annOpex * 1.1) },
    { name: 'Pessimistic (-25%)', value: Math.round(pess.annProfit) },
  ];

  const exportCSV = useCallback(() => {
    const header = 'Month,Revenue,OPEX,Net Profit,Cumulative CF\n';
    const rows = curr.flows
      .map((row) => `${row.month},${row.revenue},${row.opex},${row.net},${row.cumulative}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AgriSense_CashFlow_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [curr.flows]);

  const exportExcel = useCallback(() => {
    const workbook = XLSX.utils.book_new();

    const summaryRows = [
      ['AgriSense - Financial Plan'],
      ['Generated', new Date().toLocaleDateString('en-IN')],
      ['Scenario', SCENARIOS.find((s) => s.key === scenario)?.label || 'Base'],
      [],
      ['Metric', 'Value'],
      ['Total CAPEX', curr.capex],
      ['Annual Revenue', Math.round(curr.annRev)],
      ['Annual OPEX', Math.round(curr.annOpex)],
      ['Annual Profit', Math.round(curr.annProfit)],
      ['ROI (%)', curr.roi.toFixed(1)],
      ['Payback (months)', curr.payback ? curr.payback.toFixed(1) : 'N/A'],
      ['Break-even month', curr.breakEvenMonth ?? 'N/A'],
      ['NPV', curr.npv],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    const cashHeader = [
      'Month',
      'Base Revenue',
      'Base OPEX',
      'Base Net',
      'Base Cumulative',
      'Pessimistic Net',
      'Pessimistic Cumulative',
      'Optimistic Net',
      'Optimistic Cumulative',
    ];
    const cashRows = base.flows.map((row, idx) => [
      row.month,
      row.revenue,
      row.opex,
      row.net,
      row.cumulative,
      pess.flows[idx]?.net ?? 0,
      pess.flows[idx]?.cumulative ?? 0,
      opti.flows[idx]?.net ?? 0,
      opti.flows[idx]?.cumulative ?? 0,
    ]);

    const cashSheet = XLSX.utils.aoa_to_sheet([cashHeader, ...cashRows]);
    cashSheet['!cols'] = Array(9).fill({ wch: 22 });
    XLSX.utils.book_append_sheet(workbook, cashSheet, 'Monthly Cash Flow');

    const recHeader = ['Priority', 'Category', 'Title', 'Detail'];
    const recRows = recommendations.map((rec) => [rec.priority.toUpperCase(), rec.category, rec.title, rec.detail]);
    const recSheet = XLSX.utils.aoa_to_sheet([recHeader, ...recRows]);
    recSheet['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 45 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(workbook, recSheet, 'AI Recommendations');

    XLSX.writeFile(workbook, `AgriSense_Financial_Plan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [base.flows, curr, opti.flows, pess.flows, recommendations, scenario]);

  const activeLoading = bootstrapping || landBootstrapping || loading;
  const hasActiveData = surveyMode === 'land' ? !!landDashboard : !!analysis;
  const activeAnswers = surveyMode === 'land' ? landContext?.context?.answers || {} : analysis?.farm_answers || {};

  if (activeLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-64 bg-slate-100" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl bg-slate-100" />)}
        </div>
        <Skeleton className="h-48 rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!hasActiveData) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={ClipboardList}
          title="No analysis yet"
          description="Complete an aquaponic or land survey to see your financial analysis here."
          actionLabel="Start a Survey"
          onAction={() => {/* no-op — navigation prop not available here */}}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Financial Plan Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              AI-generated from your selected survey, with live assumptions and scenario modeling.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-emerald-200 bg-white p-1">
              <button
                onClick={() => setSurveyMode('aquaponics')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  surveyMode === 'aquaponics' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-emerald-50'
                }`}
              >
                Aquaponics Survey
              </button>
              <button
                onClick={() => setSurveyMode('land')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  surveyMode === 'land' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-emerald-50'
                }`}
              >
                Land Survey
              </button>
            </div>
            <div className="flex rounded-xl border border-emerald-200 bg-white p-1">
              {SCENARIOS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setScenario(item.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    scenario === item.key
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-600 hover:bg-emerald-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={exportExcel}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Annual Revenue"
          value={fmtRs(curr.annRev)}
          sub={
            surveyMode === 'land'
              ? `Crops ${fmtRs(inputs.cropRev * factor)}/mo`
              : `Fish ${fmtRs(inputs.fishRev * factor)}/mo, Crops ${fmtRs(inputs.cropRev * factor)}/mo`
          }
          trend="up"
        />
        <KPI
          label="Annual Profit"
          value={fmtRs(curr.annProfit)}
          sub={curr.annProfit > 0 ? 'Profitable in selected scenario' : 'Loss-making in selected scenario'}
          trend={curr.annProfit > 0 ? 'up' : 'down'}
        />
        <KPI
          label="ROI"
          value={`${curr.roi.toFixed(1)}%`}
          sub={`NPV ${fmtRs(curr.npv)} on CAPEX ${fmtRs(curr.capex)}`}
          trend={curr.roi >= 0 ? 'up' : 'down'}
        />
        <KPI
          label="Payback Period"
          value={curr.payback ? `${Math.round(curr.payback)} months` : 'N/A'}
          sub={curr.breakEvenMonth ? `Break-even month ${curr.breakEvenMonth}` : 'No break-even in horizon'}
          trend={curr.payback && curr.payback < 24 ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Cumulative Cash Flow (All Scenarios)</h2>
            <span className="text-xs text-gray-500">{inputs.horizon} months</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={cumulData}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="month" tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={fmtLakh} width={52} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 3" />
              <Line type="monotone" dataKey="Base" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Optimistic" stroke="#0ea5e9" strokeWidth={1.8} dot={false} strokeDasharray="5 3" />
              <Line type="monotone" dataKey="Pessimistic" stroke="#f59e0b" strokeWidth={1.8} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Monthly Revenue vs OPEX</h2>
            <span className="text-xs text-gray-500 capitalize">{scenario}</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="Month" tick={{ ...TICK_STYLE, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={fmtLakh} width={48} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="OPEX" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Net" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Cost Breakdown (Monthly)</h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={costData} dataKey="value" innerRadius={50} outerRadius={76} paddingAngle={2}>
                  {costData.map((_, idx) => (
                    <Cell key={`cost-${idx}`} fill={COST_COLORS[idx % COST_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => fmtRs(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {costData.map((item, idx) => {
                const total = costData.reduce((sum, row) => sum + row.value, 0);
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="h-2 w-2 rounded-sm" style={{ background: COST_COLORS[idx] }} />
                      {item.name}
                    </span>
                    <span className="font-medium text-gray-800">{pct}% ({fmtRs(item.value)})</span>
                  </div>
                );
              })}
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                <span className="text-gray-500">Total OPEX / month</span>
                <span className="font-semibold text-gray-900">{fmtRs(costData.reduce((sum, row) => sum + row.value, 0))}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Revenue Mix ({scenario})</h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={revData} dataKey="value" innerRadius={50} outerRadius={76} paddingAngle={2}>
                  {revData.map((_, idx) => (
                    <Cell key={`rev-${idx}`} fill={REV_COLORS[idx % REV_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => fmtRs(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {revData.map((item, idx) => {
                const total = revData.reduce((sum, row) => sum + row.value, 0);
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                return (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="h-2 w-2 rounded-sm" style={{ background: REV_COLORS[idx] }} />
                      {item.name}
                    </span>
                    <span className="font-medium text-gray-800">{pct}% ({fmtRs(item.value)})</span>
                  </div>
                );
              })}
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                <span className="text-gray-500">Total revenue / month</span>
                <span className="font-semibold text-gray-900">{fmtRs(revData.reduce((sum, row) => sum + row.value, 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Scenario Analysis (Projected Annual Profit)</h2>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={scenarioData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 120 }} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
            <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={fmtLakh} />
            <YAxis type="category" dataKey="name" tick={{ ...TICK_STYLE, fontSize: 11 }} axisLine={false} tickLine={false} width={116} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine x={0} stroke="#cbd5e1" />
            <Bar dataKey="value" name="Annual Profit" radius={[0, 4, 4, 0]}>
              {scenarioData.map((row, idx) => (
                <Cell key={`scenario-${idx}`} fill={row.value >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button
          onClick={() => setShowSliders((prev) => !prev)}
          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-emerald-50/50"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-gray-800">Adjust Assumptions (Live Recalculation)</span>
          </div>
          {showSliders ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </button>
        <AnimatePresence>
          {showSliders ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-t border-gray-100"
            >
              <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Revenue Inputs</p>
                  {surveyMode === 'aquaponics' && (
                    <SliderRow label="Fish revenue/mo" min={10000} max={300000} step={5000} value={inputs.fishRev} onChange={(v) => setInput('fishRev', v)} display={fmtRs(inputs.fishRev)} />
                  )}
                  <SliderRow label="Crop revenue/mo" min={5000} max={500000} step={5000} value={inputs.cropRev} onChange={(v) => setInput('cropRev', v)} display={fmtRs(inputs.cropRev)} />
                  <SliderRow label="Horizon" min={6} max={60} step={6} value={inputs.horizon} onChange={(v) => setInput('horizon', v)} display={`${inputs.horizon} mo`} />
                  {base.monthNet !== 0 ? (
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <span className="font-semibold">Monthly Net: </span>
                      <span className={base.monthNet >= 0 ? 'text-emerald-700' : 'text-red-600'}>{fmtRs(base.monthNet)}</span>
                      <span className="ml-2 text-gray-500">({base.monthNet >= 0 ? `+${Math.round((base.monthNet / base.monthOpex) * 100)}% margin` : 'loss'})</span>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cost Inputs</p>
                  <SliderRow label="CAPEX total" min={100000} max={5000000} step={50000} value={inputs.capex} onChange={(v) => setInput('capex', v)} display={fmtRs(inputs.capex)} />
                  <SliderRow label={surveyMode === 'land' ? 'Seeds & inputs/mo' : 'Fish feed/mo'} min={1000} max={200000} step={2000} value={inputs.feed} onChange={(v) => setInput('feed', v)} display={fmtRs(inputs.feed)} />
                  <SliderRow label="Labor/mo" min={5000} max={300000} step={5000} value={inputs.labor} onChange={(v) => setInput('labor', v)} display={fmtRs(inputs.labor)} />
                  <SliderRow label={surveyMode === 'land' ? 'Energy & transport/mo' : 'Utilities/mo'} min={1000} max={150000} step={2000} value={inputs.util} onChange={(v) => setInput('util', v)} display={fmtRs(inputs.util)} />
                  <SliderRow label={surveyMode === 'land' ? 'Rent, pesticide & maint/mo' : 'Maintenance/mo'} min={1000} max={100000} step={1000} value={inputs.maint} onChange={(v) => setInput('maint', v)} display={fmtRs(inputs.maint)} />
                  <SliderRow label="Other/mo" min={0} max={100000} step={1000} value={inputs.other} onChange={(v) => setInput('other', v)} display={fmtRs(inputs.other)} />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">AI Recommendations ({surveyMode === 'land' ? 'Land' : 'Aquaponics'})</h2>
        <div className="space-y-3">
          {recommendations.map((rec, idx) => {
            const config = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.low;
            const Icon = config.icon;
            return (
              <motion.div
                key={`${rec.title}-${idx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex gap-3">
                  <Icon size={16} className={config.iconCls} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.badge}`}>
                        {rec.priority}
                      </span>
                      <span className="text-[11px] text-gray-500">{rec.category}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{rec.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{rec.detail}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {Object.keys(activeAnswers || {}).length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Survey Data Used For This Plan</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(activeAnswers).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <p className="truncate text-[11px] uppercase tracking-wide text-gray-500">{key.replace(/_/g, ' ')}</p>
                <p className="mt-0.5 truncate text-sm font-medium text-gray-800">
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
