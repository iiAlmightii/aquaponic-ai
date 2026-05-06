import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Sprout, ClipboardList, Bot, ChevronRight } from 'lucide-react';
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
  // Split loading so the farms card and quick actions don't wait on the slow analytics call.
  const [farmsLoading, setFarmsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [farmsCount, setFarmsCount] = useState(0);
  const [topSessions, setTopSessions] = useState<TopSession[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [roiData, setRoiData] = useState<RoiDataPoint[]>([]);
  const [cropData, setCropData] = useState<CropDataPoint[]>([]);
  const [surveyStats, setSurveyStats] = useState({ aquaCount: 0, landCount: 0, aquaRoi: 0, landRoi: 0 });

  useEffect(() => {
    // Farms resolves independently — its card updates as soon as it arrives.
    farmAPI.list()
      .then((res: any) => setFarmsCount((res?.data ?? []).length))
      .catch(() => {})
      .finally(() => setFarmsLoading(false));

    // Analytics is the slow call — cached in api.js so Dashboard→Analytics navigation skips the network.
    reportAPI.analytics()
      .then((res: any) => {
        const data = res?.data ?? {};
        const sessions: TopSession[] = data.top_sessions ?? [];
        setTopSessions(sessions.slice(0, 4));

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

        const crops: CropDataPoint[] = (data.top_crops ?? [])
          .slice(0, 5)
          .map((c: any) => ({ name: c.crop ?? c.name ?? 'Unknown', value: c.revenue ?? c.profit ?? 0 }));
        setCropData(crops);

        const aqua = sessions.filter((s) => s.survey_type === 'ai');
        const land = sessions.filter((s) => s.survey_type === 'land');
        setSurveyStats({
          aquaCount: data.ai_completed_count ?? aqua.length,
          landCount: data.land_completed_count ?? land.length,
          aquaRoi: aqua.length ? aqua.reduce((sum, r) => sum + (r.roi_percent ?? 0), 0) / aqua.length : 0,
          landRoi: land.length ? land.reduce((sum, r) => sum + (r.roi_percent ?? 0), 0) / land.length : 0,
        });
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, []);

  const allRevenue = topSessions.reduce((sum, r) => sum + (r.revenue ?? 0), 0);
  const allRoi = topSessions.length
    ? topSessions.reduce((sum, r) => sum + (r.roi_percent ?? 0), 0) / topSessions.length
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <p className="text-xs text-slate-400">
          Welcome back, <span className="font-semibold text-slate-600">{user?.name ?? 'Farmer'}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Monthly Revenue"
          value={allRevenue > 0 ? `₹${(allRevenue / 100000).toFixed(1)}L` : '₹0'}
          trend={allRevenue > 0 ? 'from surveys' : undefined}
          trendUp
          icon={DollarSign}
          accentColor="green"
          loading={analyticsLoading}
        />
        <StatCard
          label="Average ROI"
          value={allRoi > 0 ? `${allRoi.toFixed(0)}%` : '—'}
          trend={allRoi > 0 ? 'across farms' : undefined}
          trendUp={allRoi > 0}
          icon={TrendingUp}
          accentColor="blue"
          loading={analyticsLoading}
        />
        <StatCard
          label="Surveys Completed"
          value={`${surveyStats.aquaCount + surveyStats.landCount}`}
          trend={
            surveyStats.aquaCount + surveyStats.landCount > 0
              ? `${surveyStats.aquaCount} aqua · ${surveyStats.landCount} land`
              : undefined
          }
          trendUp
          icon={ClipboardList}
          accentColor="amber"
          loading={analyticsLoading}
        />
        <StatCard
          label="Active Farms"
          value={`${farmsCount}`}
          trend={farmsCount > 0 ? 'registered' : undefined}
          trendUp
          icon={Sprout}
          accentColor="purple"
          loading={farmsLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <ChartCarousel
          revenueData={revenueData}
          roiData={roiData}
          cropData={cropData}
          surveyStats={surveyStats}
          loading={analyticsLoading}
        />

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Recent Surveys</h3>
            <button
              onClick={() => onNavigate?.('surveys')}
              className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-0.5"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {analyticsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-2 h-2 rounded-full bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-3/4 bg-slate-100" />
                    <Skeleton className="h-3 w-1/2 bg-slate-100" />
                  </div>
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
            <div className="divide-y divide-slate-50">
              {topSessions.map((s) => (
                <div key={s.session_id} className="flex items-center gap-3 py-2.5">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      s.survey_type === 'ai' ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                  />
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

      {/* Quick actions never need data — render immediately */}
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
