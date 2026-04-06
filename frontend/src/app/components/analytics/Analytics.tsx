import { useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Layers, Activity, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { reportAPI } from '../../utils/api';
import { PretextText } from '../ui/pretext-text';
import { Button } from '../ui/button';

const CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#f97316', '#8b5cf6'];

function inr(value: number) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function Analytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await reportAPI.analytics();
      setData(res?.data || null);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const overview = data?.overview || {};
  const surveyMonth = data?.surveys_by_month || [];
  const completionByType = data?.completion_by_type || [];
  const aiTrend = data?.ai_financial_trend || [];
  const landTrend = data?.land_financial_trend || [];
  const roiDistribution = data?.roi_distribution || [];
  const topLandCrops = data?.top_land_crops || [];
  const waterTrend = data?.water_quality_trend || [];
  const topSessions = data?.top_sessions || [];

  const profitTrend = useMemo(() => {
    const aiByMonth = Object.fromEntries(aiTrend.map((d: any) => [d.month, d]));
    const landByMonth = Object.fromEntries(landTrend.map((d: any) => [d.month, d]));
    return surveyMonth.map((row: any) => {
      const ai = aiByMonth[row.month] || {};
      const land = landByMonth[row.month] || {};
      const aiProfit = Number(ai.avg_profit || 0);
      const landProfit = Number(land.avg_profit || 0);
      return {
        month: row.month,
        label: row.label,
        ai_profit: aiProfit,
        land_profit: landProfit,
        total_profit: aiProfit + landProfit,
      };
    });
  }, [aiTrend, landTrend, surveyMonth]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <BarChart3 className="w-5 h-5" />
              <span className="text-sm font-medium">Survey Intelligence</span>
            </div>
            <PretextText
              text="Analytics Studio"
              font={'700 2rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={40}
              className="text-gray-900"
            />
            <p className="text-sm text-gray-600 mt-1">
              Visual analysis across all AI Survey and Land Voice sessions.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Sessions" value={overview.total_sessions || 0} hint="All survey attempts" />
        <MetricCard title="Completion Rate" value={pct(overview.completion_rate || 0)} hint="Completed vs total" />
        <MetricCard title="Avg AI Profit" value={inr(overview.avg_ai_profit || 0)} hint="Annual, completed AI plans" />
        <MetricCard title="Avg Land Profit" value={inr(overview.avg_land_profit || 0)} hint="Annual, completed land plans" />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-8 border border-gray-200 text-sm text-gray-600">Loading analytics...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Survey Volume By Month">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={surveyMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="ai" stackId="s" fill="#059669" name="AI Survey" />
                  <Bar dataKey="land" stackId="s" fill="#8b5cf6" name="Land Voice" />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Completion Status By Survey Type">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={completionByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="type" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" stackId="s" fill="#059669" />
                  <Bar dataKey="in_progress" stackId="s" fill="#f59e0b" />
                  <Bar dataKey="abandoned" stackId="s" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Profit Trend By Month (AI + Land)">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={profitTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => inr(Number(v || 0))} />
                  <Legend />
                  <Area type="monotone" dataKey="ai_profit" fill="#0ea5e9" stroke="#0ea5e9" name="AI Avg Profit" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="land_profit" fill="#8b5cf6" stroke="#8b5cf6" name="Land Avg Profit" fillOpacity={0.2} />
                  <Line type="monotone" dataKey="total_profit" stroke="#059669" strokeWidth={2} dot={false} name="Combined" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="ROI Distribution (AI Plans)">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={roiDistribution} dataKey="count" nameKey="bucket" cx="50%" cy="50%" outerRadius={95} label>
                    {roiDistribution.map((_: any, idx: number) => (
                      <Cell key={`roi-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel title="Top Land Crops By Profit">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topLandCrops} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis type="number" />
                  <YAxis dataKey="crop" type="category" width={120} />
                  <Tooltip formatter={(v: any) => inr(Number(v || 0))} />
                  <Legend />
                  <Bar dataKey="total_profit" fill="#059669" name="Total Profit" />
                  <Bar dataKey="total_revenue" fill="#0ea5e9" name="Total Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Water Quality Trend (Last 30 Days)">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={waterTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg_ph" stroke="#8b5cf6" dot={false} name="Avg pH" />
                  <Line type="monotone" dataKey="avg_do" stroke="#059669" dot={false} name="Avg DO" />
                  <Line type="monotone" dataKey="avg_temp_c" stroke="#f97316" dot={false} name="Avg Temp (C)" />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-emerald-600" />
              <h3 className="text-gray-900 font-semibold">Top Survey Outcomes</h3>
            </div>
            {topSessions.length === 0 ? (
              <p className="text-sm text-gray-600">No completed sessions available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="text-left py-2">Session</th>
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">Project</th>
                      <th className="text-right py-2">Revenue</th>
                      <th className="text-right py-2">Cost</th>
                      <th className="text-right py-2">Profit</th>
                      <th className="text-right py-2">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSessions.map((row: any) => (
                      <tr key={row.session_id} className="border-b border-gray-100">
                        <td className="py-2 text-gray-900">{String(row.session_id).slice(0, 8)}</td>
                        <td className="py-2">{row.survey_type === 'land' ? 'Land Voice' : 'AI Survey'}</td>
                        <td className="py-2">{row.project_name}</td>
                        <td className="py-2 text-right">{inr(row.revenue)}</td>
                        <td className="py-2 text-right">{inr(row.cost)}</td>
                        <td className="py-2 text-right font-medium text-emerald-700">{inr(row.profit)}</td>
                        <td className="py-2 text-right">{pct(row.roi_percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Activity className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Why this is better than a generic trend graph</p>
                <p className="text-sm text-emerald-800 mt-1">
                  This view shows actionable patterns: survey mix, completion quality, profitability trend, ROI spread,
                  crop-level economics, and water stability. It is designed for decision making, not just reporting counts.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-900 font-semibold">{title}</h3>
        <TrendingUp className="w-4 h-4 text-gray-400" />
      </div>
      {children}
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">{title}</p>
      <p className="text-gray-900 text-xl font-semibold mb-1">{value}</p>
      <p className="text-sm text-gray-500">{hint}</p>
    </div>
  );
}
