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
              <Tooltip formatter={(v: unknown) => fmt(v as number)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
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
              <Tooltip formatter={(v: unknown) => `${(v as number).toFixed(1)}%`} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
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
                <Tooltip formatter={(v: unknown) => fmt(v as number)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
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
