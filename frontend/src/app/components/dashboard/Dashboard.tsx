import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import {
  TrendingUp,
  DollarSign,
  Activity,
  Droplets,
  AlertCircle,
  CheckCircle,
  ArrowUp,
} from 'lucide-react';
import { PretextText } from '../ui/pretext-text';
import { farmAPI, reportAPI } from '../../utils/api';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DashboardProps {
  user: any;
  onNavigate?: (view: string) => void;
}

export function Dashboard({ user, onNavigate }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState('');
  const [metrics, setMetrics] = useState({
    farmsCount: 0,
    reportsCount: 0,
    waterReadingsCount: 0,
    latestPh: null as number | null,
  });

  const platformModules = [
    {
      title: 'Task & Work Management',
      description:
        'Plan daily work, assign tasks, and keep your team aligned with recurring checklists and reminders.',
      action: 'Open Farm Records',
      onClick: () => onNavigate?.('farms'),
    },
    {
      title: 'Farm Accounting & Margins',
      description:
        'Track production costs, compare revenue against operating spend, and improve return on every cycle.',
      action: 'Open Analytics',
      onClick: () => onNavigate?.('analytics'),
    },
    {
      title: 'Crop, Livestock & Yield',
      description:
        'Keep production records in one place so you can identify trends, risks, and growth opportunities faster.',
      action: 'Start AI Survey',
      onClick: () => onNavigate?.('ai-survey'),
    },
  ];

  const [profitTrendData, setProfitTrendData] = useState<Array<{ month: string; aiProfit: number; landProfit: number; totalProfit: number }>>([]);
  const [waterStabilityData, setWaterStabilityData] = useState<Array<{ day: string; ph: number }>>([]);
  const [systemSnapshot, setSystemSnapshot] = useState<Array<{ name: string; value: number | string; status: 'success' | 'warning' }>>([]);
  const [actionQueue, setActionQueue] = useState<Array<{ id: number; type: 'warning' | 'info'; message: string; details: string }>>([]);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setBackendError('');
      try {
        const [farmsRes, reportsRes, analyticsRes] = await Promise.all([
          farmAPI.list(),
          reportAPI.history(),
          reportAPI.analytics().catch(() => null),
        ]);
        const farms = farmsRes?.data?.farms || [];
        const reports = reportsRes?.data?.reports || [];

        let fishBatchesCount = 0;
        let cropRecordsCount = 0;
        let totalReadings = 0;
        let latestPh: number | null = null;
        let latestReadingTs = 0;
        const readings: Array<{ timestamp: string; ph: number | null }> = [];

        await Promise.all(
          farms.map(async (farm: any) => {
            try {
              const recordsRes = await farmAPI.records(farm.id);
              const fish = recordsRes?.data?.fish_batches || [];
              const crops = recordsRes?.data?.crop_records || [];
              const water = recordsRes?.data?.water_readings || [];

              fishBatchesCount += fish.length;
              cropRecordsCount += crops.length;
              totalReadings += water.length;

              water.forEach((w: any) => {
                if (w?.ph != null) {
                  readings.push({ timestamp: String(w.timestamp || ''), ph: Number(w.ph) });
                }
                const ts = new Date(w?.timestamp || '').getTime();
                if (!Number.isNaN(ts) && ts > latestReadingTs && w?.ph != null) {
                  latestReadingTs = ts;
                  latestPh = Number(w.ph);
                }
              });
            } catch {
              // Keep rendering with partial data if one farm records call fails.
            }
          })
        );

        const now = new Date();
        let trendRows: Array<{ month: string; aiProfit: number; landProfit: number; totalProfit: number }> = [];

        if (analyticsRes?.data) {
          const surveyByMonth = analyticsRes.data.surveys_by_month || [];
          const aiTrend = analyticsRes.data.ai_financial_trend || [];
          const landTrend = analyticsRes.data.land_financial_trend || [];
          const aiByMonth = Object.fromEntries(aiTrend.map((r: any) => [r.month, r]));
          const landByMonth = Object.fromEntries(landTrend.map((r: any) => [r.month, r]));

          trendRows = surveyByMonth.slice(-6).map((row: any) => {
            const ai = aiByMonth[row.month] || {};
            const land = landByMonth[row.month] || {};
            const aiProfit = Number(ai.avg_profit || 0);
            const landProfit = Number(land.avg_profit || 0);
            return {
              month: row.label || row.month,
              aiProfit,
              landProfit,
              totalProfit: aiProfit + landProfit,
            };
          });
        }

        if (trendRows.length === 0) {
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            trendRows.push({
              month: d.toLocaleString('en-US', { month: 'short' }),
              aiProfit: 0,
              landProfit: 0,
              totalProfit: 0,
            });
          }
        }

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const daily: Record<string, { sum: number; count: number }> = {};
        readings.forEach((r) => {
          const dt = new Date(r.timestamp);
          if (Number.isNaN(dt.getTime()) || r.ph == null) return;
          const k = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
          if (!daily[k]) daily[k] = { sum: 0, count: 0 };
          daily[k].sum += r.ph;
          daily[k].count += 1;
        });
        const waterSeries: Array<{ day: string; ph: number }> = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
          const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const agg = daily[k];
          waterSeries.push({
            day: days[d.getDay()],
            ph: agg && agg.count ? Number((agg.sum / agg.count).toFixed(2)) : 0,
          });
        }

        setMetrics({
          farmsCount: farms.length,
          reportsCount: reports.length,
          waterReadingsCount: totalReadings,
          latestPh,
        });
        setProfitTrendData(trendRows);
        setWaterStabilityData(waterSeries);
        setSystemSnapshot([
          { name: 'Active Fish Batches', value: fishBatchesCount, status: fishBatchesCount > 0 ? 'success' : 'warning' },
          { name: 'Crop Records', value: cropRecordsCount, status: cropRecordsCount > 0 ? 'success' : 'warning' },
          { name: 'Water Readings', value: totalReadings, status: totalReadings > 0 ? 'success' : 'warning' },
        ]);
        setActionQueue([
          {
            id: 1,
            type: farms.length === 0 ? 'warning' : 'info',
            message: farms.length === 0 ? 'No farms configured yet' : 'Farm records available',
            details:
              farms.length === 0
                ? 'Create your first farm in Farm Records to start collecting operational data.'
                : `${farms.length} farm record(s) available in your workspace.`,
          },
          {
            id: 2,
            type:
              latestPh == null || latestPh < 6.8 || latestPh > 7.5
                ? 'warning'
                : 'info',
            message:
              latestPh == null
                ? 'No pH readings captured yet'
                : latestPh < 6.8 || latestPh > 7.5
                  ? 'pH outside target range'
                  : 'Water pH stable',
            details:
              latestPh == null
                ? 'Add water readings to unlock pH trend insights and stability monitoring.'
                : `Latest pH is ${Number(latestPh).toFixed(2)}. Target operating band is 6.8 - 7.5.`,
          },
        ]);
      } catch (e: any) {
        setBackendError(e?.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const goToFarms = () => onNavigate?.('farms');
  const goToAnalytics = () => onNavigate?.('analytics');

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-br from-white via-emerald-50 to-cyan-50 rounded-xl p-6 sm:p-8 shadow-sm border border-emerald-100">
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
          <div>
            <p className="text-xs sm:text-sm text-emerald-700 uppercase tracking-[0.12em] mb-3 font-semibold">
              Farm Management Software
            </p>
            <PretextText
              text="The modern way to manage your farm."
              font={'700 2.1rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={44}
              className="text-gray-900 mb-3"
            />
            <PretextText
              text={`Welcome, ${user?.name || 'User'}. Run your crops, livestock, inventory and expenses from one unified workspace.`}
              font={'400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={24}
              className="text-gray-700 mb-5"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onNavigate?.('ai-survey')}
              >
                <ArrowUp className="w-4 h-4 mr-2" />
                Start Planning Session
              </Button>
              <Button variant="outline" onClick={goToAnalytics}>Open Analytics Studio</Button>
            </div>
          </div>
          <div className="bg-white/80 rounded-xl border border-emerald-100 p-5">
            <p className="text-sm text-gray-600 mb-4">Operational Snapshot</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Active Farms</p>
                <p className="text-lg font-semibold text-emerald-900">{metrics.farmsCount}</p>
              </div>
              <div className="rounded-lg bg-cyan-50 p-3">
                <p className="text-xs text-cyan-700">Completed Reports</p>
                <p className="text-lg font-semibold text-cyan-900">{metrics.reportsCount}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Water Readings</p>
                <p className="text-lg font-semibold text-amber-900">{metrics.waterReadingsCount}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">Latest pH</p>
                <p className="text-lg font-semibold text-blue-900">{metrics.latestPh == null ? 'N/A' : metrics.latestPh.toFixed(2)}</p>
              </div>
            </div>
            {backendError ? <p className="text-xs text-red-600 mt-3">{backendError}</p> : null}
          </div>
        </div>
      </div>

      {/* Platform Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {platformModules.map((module) => (
          <div key={module.title} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <h3 className="text-gray-900 mb-2 font-semibold">{module.title}</h3>
            <p className="text-sm text-gray-600 mb-4">{module.description}</p>
            <Button variant="outline" className="w-full" onClick={module.onClick}>
              {module.action}
            </Button>
          </div>
        ))}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Farms"
          value={`${metrics.farmsCount}`}
          subtitle="Live from /farm"
          icon={DollarSign}
        />
        <MetricCard
          title="Completed Reports"
          value={`${metrics.reportsCount}`}
          subtitle="Live from /report/history"
          icon={TrendingUp}
        />
        <MetricCard
          title="Water Readings"
          value={`${metrics.waterReadingsCount}`}
          subtitle="Live from farm records"
          icon={Activity}
        />
        <MetricCard
          title="Latest pH Level"
          value={metrics.latestPh == null ? 'N/A' : metrics.latestPh.toFixed(2)}
          subtitle="From latest backend reading"
          icon={Droplets}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h3>Monthly Profit Trend</h3>
            <span className="text-sm text-gray-500">AI + Land plans (6 months)</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={profitTrendData}>
              <defs>
                <linearGradient id="colorAIProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorLandProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip formatter={(v: any) => `INR ${Number(v || 0).toLocaleString('en-IN')}`} />
              <Legend />
              <Area
                type="monotone"
                dataKey="aiProfit"
                stroke="#0ea5e9"
                fillOpacity={1}
                fill="url(#colorAIProfit)"
                name="AI Avg Profit"
              />
              <Area
                type="monotone"
                dataKey="landProfit"
                stroke="#8b5cf6"
                fillOpacity={1}
                fill="url(#colorLandProfit)"
                name="Land Avg Profit"
              />
              <Line
                type="monotone"
                dataKey="totalProfit"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="Combined"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* System Snapshot */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="mb-6">System Snapshot</h3>
          <div className="space-y-4">
            {systemSnapshot.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.value}</span>
                  {item.status === 'success' && (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  )}
                  {item.status === 'warning' && (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="mb-4">Quick Navigation</h4>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-sm" onClick={goToFarms}>
                Add Water Readings
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm" onClick={goToFarms}>
                Record Farm Activity
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Water Stability Chart & Action Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h3>Weekly Water Stability</h3>
            <span className="text-sm text-gray-500">Last 7 Days</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={waterStabilityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#9ca3af" />
              <YAxis domain={[6.8, 7.5]} stroke="#9ca3af" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="ph"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ fill: '#06b6d4', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="mb-6">Action Queue</h3>
          <div className="space-y-4">
            {actionQueue.map((action) => (
              <div
                key={action.id}
                className={`p-4 rounded-lg border ${
                  action.type === 'warning'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <p className="font-medium text-gray-900 mb-1">{action.message}</p>
                <PretextText
                  text={action.details}
                  font={'400 0.875rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
                  lineHeight={22}
                  className="text-sm text-gray-600"
                />
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full mt-4" onClick={goToAnalytics}>
            View All Actions
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
}

function MetricCard({ title, value, subtitle, icon: Icon }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="p-2 bg-emerald-50 rounded-lg">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
      </div>
      <div className="mb-2">
        <p className="text-gray-900">{value}</p>
      </div>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
