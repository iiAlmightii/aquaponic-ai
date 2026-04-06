/**
 * pages/DashboardPage.jsx — Main analytics dashboard.
 * Shows KPI cards, revenue/cost charts, water quality, and quick-action links.
 */
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { TrendingUp, TrendingDown, Droplets, Mic2, FileText, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react'
import { useStore } from '../store'

// ── Mock data (replace with API calls) ───────────────────────────────────────
const revenueData = [
  { month: 'Jan', fish: 42000, crops: 18000, opex: 28000 },
  { month: 'Feb', fish: 45000, crops: 20000, opex: 29000 },
  { month: 'Mar', fish: 38000, crops: 22000, opex: 27500 },
  { month: 'Apr', fish: 52000, crops: 25000, opex: 31000 },
  { month: 'May', fish: 58000, crops: 28000, opex: 33000 },
  { month: 'Jun', fish: 61000, crops: 30000, opex: 34500 },
]

const waterQualityData = [
  { day: 'Mon', ph: 7.1, do: 6.8, temp: 24.2 },
  { day: 'Tue', ph: 7.3, do: 6.5, temp: 24.5 },
  { day: 'Wed', ph: 7.0, do: 7.1, temp: 23.8 },
  { day: 'Thu', ph: 6.9, do: 6.9, temp: 24.1 },
  { day: 'Fri', ph: 7.2, do: 7.2, temp: 24.3 },
  { day: 'Sat', ph: 7.4, do: 6.6, temp: 24.6 },
  { day: 'Sun', ph: 7.1, do: 7.0, temp: 24.0 },
]

const KPIS = [
  { label: 'Monthly Revenue', value: '₹1,91,000', delta: '+12.4% vs last month', up: true, icon: TrendingUp, color: 'text-forest-400' },
  { label: 'Operating Cost', value: '₹34,500', delta: '+2.1% variance', up: false, icon: TrendingDown, color: 'text-amber-400' },
  { label: 'Stock Survival', value: '97.8%', delta: 'Healthy', up: true, icon: ShieldCheck, color: 'text-forest-300' },
  { label: 'Water pH (avg)', value: '7.14', delta: 'Optimal range', up: true, icon: Droplets, color: 'text-blue-400' },
]

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-4 py-3 text-sm shadow-xl">
      <p className="label-sm mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-medium text-slate-100">
            {typeof p.value === 'number' && p.name !== 'ph' && p.name !== 'do' && p.name !== 'temp'
              ? `₹${p.value.toLocaleString('en-IN')}` : p.value}
          </span>
        </p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { user, analysis } = useStore()
  const navigate = useNavigate()

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="panel">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="label-sm">Today • {getGreeting()}</p>
            <h2 className="page-title mt-1">Welcome, {user?.full_name?.split(' ')[0] ?? 'Farmer'}</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl">Monitor profitability, resource use, water stability, and upcoming risks in one operating workspace built for practical farm decisions.</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => navigate('/survey')} className="btn-primary flex items-center gap-2 text-sm">
              <Mic2 size={16} /> Start AI Survey
            </button>
            <button onClick={() => navigate('/reports')} className="btn-ghost flex items-center gap-2 text-sm">
              <FileText size={16} /> Open Reports
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-6 stagger-in">
          {KPIS.map((k) => (
            <div key={k.label} className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <span className="label-sm">{k.label}</span>
                <div className="w-9 h-9 rounded-lg border border-slate-300/80 bg-slate-900/40 flex items-center justify-center">
                  <k.icon size={15} className={k.color} />
                </div>
              </div>
              <p className="text-3xl font-display font-semibold text-slate-200">{k.value}</p>
              <p className={`text-xs mt-1 ${k.up ? 'text-forest-400' : 'text-amber-400'}`}>{k.delta}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <section className="xl:col-span-9 space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title text-xl">Revenue vs Operating Cost</h3>
              <span className="label-sm">Last 6 Months</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={revenueData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fishGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2ecc8e" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#2ecc8e" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="cropGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5ddaad" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#5ddaad" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="opexGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5a623" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#f5a623" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#6b7280' }} />
                <Area type="monotone" dataKey="fish" name="Fish Revenue" stroke="#2ecc8e" strokeWidth={2} fill="url(#fishGrad)" />
                <Area type="monotone" dataKey="crops" name="Crop Revenue" stroke="#5ddaad" strokeWidth={2} fill="url(#cropGrad)" />
                <Area type="monotone" dataKey="opex" name="OPEX" stroke="#f5a623" strokeWidth={2} fill="url(#opexGrad)" strokeDasharray="5 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="panel grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title text-xl">Weekly Water Stability</h3>
              <span className="label-sm">Sensor Summary</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={waterQualityData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#6b7280' }} />
                <Line type="monotone" dataKey="ph" name="pH" stroke="#2ecc8e" strokeWidth={2} dot={{ r: 3, fill: '#2ecc8e' }} />
                <Line type="monotone" dataKey="do" name="DO" stroke="#5ddaad" strokeWidth={2} dot={{ r: 3, fill: '#5ddaad' }} />
                <Line type="monotone" dataKey="temp" name="Temp °C" stroke="#f5a623" strokeWidth={2} dot={{ r: 3, fill: '#f5a623' }} />
              </LineChart>
            </ResponsiveContainer>
            </div>

            <div className="lg:col-span-2 border border-slate-300/75 rounded-2xl p-4 bg-slate-900/45">
              <h4 className="font-display text-xl text-slate-200">Action Queue</h4>
              <p className="text-sm text-slate-500 mt-1">Operational priorities based on latest trends.</p>
              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl border border-amber-300/65 bg-amber-900/50 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold"><AlertTriangle size={15} /> Feed cost threshold crossed</div>
                  <p className="text-xs text-slate-500 mt-1">Review contract pricing and feed conversion ratio before next cycle.</p>
                </div>
                <button onClick={() => navigate('/analysis')} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-300 bg-white hover:border-forest-600/55 text-sm text-slate-600">
                  Open Full Financial Analysis <ChevronRight size={15} />
                </button>
                <button onClick={() => navigate('/farm')} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-300 bg-white hover:border-forest-600/55 text-sm text-slate-600">
                  Review Farm Records <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="xl:col-span-3 space-y-4">
          <div className="panel">
            <h3 className="section-title text-xl">System Snapshot</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between"><span className="text-slate-500">Active Fish Batches</span><span className="font-semibold text-slate-100">3</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Crop Beds Online</span><span className="font-semibold text-slate-100">8</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Target ROI</span><span className="font-semibold text-forest-300">28.3%</span></div>
            </div>
          </div>

          <div className="panel">
            <h3 className="section-title text-xl">Quick Navigation</h3>
            <div className="mt-3 space-y-2">
              <button onClick={() => navigate('/land-survey')} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-600 text-left hover:border-forest-600/50">Land Voice Survey</button>
              <button onClick={() => navigate('/reports')} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-600 text-left hover:border-forest-600/50">Reports Workspace</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
