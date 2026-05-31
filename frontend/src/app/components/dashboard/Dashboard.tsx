import { useEffect, useMemo, useState, useId } from 'react';
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
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/skeleton';
import { buildInputs, computeMetrics, generateInsights } from '../../utils/analysisUtils';
import type { Recommendation } from '../../utils/analysisUtils';

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

  const chartId = useId().replace(/:/g, '');
  const revGradId = `revGrad-${chartId}`;
  const costGradId = `costGrad-${chartId}`;

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

  const analysisData = useMemo(() => {
    if (!analysis) return { breakEvenData: null, insights: [] as Recommendation[] };
    const inputs = buildInputs(analysis);
    const metrics = computeMetrics(inputs, 1);
    const breakEvenData = { breakEvenMonth: metrics.breakEvenMonth, horizon: inputs.horizon };
    const apiRecs = analysis?.financial_plan?.ai_recommendations;
    const insights: Recommendation[] = Array.isArray(apiRecs) && apiRecs.length > 0
      ? apiRecs.slice(0, 3).map((r: any) => ({
          priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'low') as any,
          category: String(r.category || 'Insight'),
          title: String(r.title || ''),
          detail: String(r.detail || ''),
        }))
      : generateInsights(inputs, metrics).slice(0, 3);
    return { breakEvenData, insights };
  }, [analysis]);

  const { breakEvenData, insights } = analysisData;

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
            label: tr('net_profit'),
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
                  <linearGradient id={revGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={costGradId} x1="0" y1="0" x2="0" y2="1">
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
                  fill={`url(#${revGradId})`}
                  name="Revenue"
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#f97316"
                  strokeWidth={2}
                  fill={`url(#${costGradId})`}
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
                    onKeyDown={(e) => e.key === 'Enter' && onNavigate?.('analytics')}
                    role="button"
                    tabIndex={0}
                    className="hover:bg-slate-50 cursor-pointer transition-colors focus:outline-none focus:bg-slate-50"
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
