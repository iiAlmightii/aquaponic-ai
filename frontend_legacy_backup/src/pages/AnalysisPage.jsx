/**
 * pages/AnalysisPage.jsx — AI financial analysis results with charts, metrics, and recommendations.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell
} from 'recharts'
import { TrendingUp, AlertTriangle, CheckCircle, Info, Download, RefreshCw, Mic2 } from 'lucide-react'
import { useStore } from '../store'
import { farmAPI, financeSheetsAPI, reportAPI } from '../utils/api'

const PRIORITY_STYLES = {
  high:   'border-red-400/40 bg-red-500/10 text-red-300',
  medium: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  low:    'border-forest-400/40 bg-forest-500/10 text-forest-300',
}
const PRIORITY_ICONS = {
  high:   AlertTriangle,
  medium: Info,
  low:    CheckCircle,
}

function MetricCard({ label, value, sub, highlight }) {
  return (
    <div className={`stat-card ${highlight ? 'border-forest-400/30 glow-green-sm' : ''}`}>
      <span className="label-sm">{label}</span>
      <p className="text-2xl font-display font-bold text-slate-100 mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-4 py-3 text-sm shadow-xl">
      <p className="label-sm mb-2">Month {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-medium">{typeof p.value === 'number' ? `₹${p.value.toLocaleString('en-IN')}` : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function AnalysisPage() {
  const { analysis, session, startSession, resetSession, setSelectedFarmId } = useStore()
  const navigate = useNavigate()

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const [sheetPlan, setSheetPlan] = useState(null)
  const [sheetVersion, setSheetVersion] = useState(0)
  const sheetVersionRef = useRef(0)
  const [sheetSyncState, setSheetSyncState] = useState({ phase: 'idle', error: null, lastUpdatedAt: null })
  const inFlightRef = useRef(false)

  const sheetEnabled = import.meta.env.VITE_GOOGLE_SHEETS_ENABLED === 'true' && !!analysis?.farm_id

  useEffect(() => {
    let cancelled = false
    const loadFarms = async () => {
      try {
        const { data } = await farmAPI.list()
        if (cancelled) return
        const farms = data?.farms || []
        setProjects(farms)
        const localSelected = localStorage.getItem('selected_farm_id')
        const initial = localSelected || analysis?.farm_id || (farms[0]?.id ?? '')
        setSelectedProjectId(initial)
      } catch {
        if (!cancelled) setProjects([])
      }
    }
    loadFarms()
    return () => { cancelled = true }
  }, [analysis?.farm_id])

  const handleRunNewSurvey = async () => {
    const farmId = selectedProjectId || analysis?.farm_id || null
    setSelectedFarmId(farmId)
    resetSession()
    await startSession(farmId)
    navigate('/survey')
  }

  const handleExportPdf = async () => {
    if (!analysis?.session_id) return
    setDownloadingPdf(true)
    try {
      await reportAPI.download(analysis.session_id, `aquaponic-report-${analysis.session_id.slice(0, 8)}.pdf`)
    } finally {
      setDownloadingPdf(false)
    }
  }

  useEffect(() => {
    if (!sheetEnabled) return
    if (!analysis?.session_id) return

    let cancelled = false

    const run = async () => {
      try {
        if (cancelled) return
        setSheetSyncState({ phase: 'syncing', error: null, lastUpdatedAt: null })
        const { data: st } = await financeSheetsAPI.status(analysis.session_id)
        if (cancelled) return
        const initialVersion = Number(st?.sheet_version ?? 0)
        setSheetVersion(initialVersion)
        sheetVersionRef.current = initialVersion

        // Push once after loading; safe-guard with expected version when available.
        try {
          await financeSheetsAPI.push(analysis.session_id, initialVersion)
        } catch (e) {
          // If conflict, fall back to pulling.
          const { data: pull } = await financeSheetsAPI.pullIfChanged(analysis.session_id, initialVersion)
          if (pull?.changed) {
            setSheetPlan(pull.financial_plan)
            setSheetVersion(Number(pull.sheet_version ?? initialVersion))
            sheetVersionRef.current = Number(pull.sheet_version ?? initialVersion)
            setSheetSyncState({ phase: 'up_to_date', error: null, lastUpdatedAt: pull.updated_at ?? null })
          } else {
            setSheetSyncState((s) => ({ ...s, phase: 'up_to_date' }))
          }
        }
      } catch (e) {
        if (cancelled) return
        setSheetSyncState({ phase: 'error', error: e?.message || 'Sheets sync failed', lastUpdatedAt: null })
      }
    }

    run()

    const interval = setInterval(async () => {
      if (cancelled) return
      if (!analysis?.session_id) return
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const { data: payload } = await financeSheetsAPI.pullIfChanged(analysis.session_id, sheetVersionRef.current)
        if (payload?.changed) {
          const nextVersion = Number(payload.sheet_version ?? sheetVersionRef.current)
          setSheetPlan(payload.financial_plan)
          setSheetVersion(nextVersion)
          sheetVersionRef.current = nextVersion
          setSheetSyncState({ phase: 'up_to_date', error: null, lastUpdatedAt: payload.updated_at ?? null })
        } else {
          setSheetSyncState((s) => ({ ...s, phase: s.phase === 'error' ? 'error' : 'up_to_date' }))
        }
      } catch (e) {
        if (!cancelled) {
          setSheetSyncState((s) => ({ ...s, phase: 'error', error: e?.message || 'Sheets polling failed' }))
        }
      } finally {
        inFlightRef.current = false
      }
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sheetEnabled, analysis?.session_id])

  if (!analysis && !session) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-5 animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl glass flex items-center justify-center">
          <TrendingUp size={28} className="text-forest-400" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-slate-100">No Analysis Yet</h2>
        <p className="text-slate-400 text-sm">Complete the AI survey to generate your financial plan.</p>
        <button onClick={() => navigate('/survey')} className="btn-primary flex items-center gap-2 mx-auto">
          <Mic2 size={16} /> Start AI Survey
        </button>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <RefreshCw size={32} className="text-forest-400 animate-spin mx-auto" />
          <p className="text-slate-400">Generating your financial analysis…</p>
        </div>
      </div>
    )
  }

  const fp = sheetPlan ?? analysis.financial_plan
  const sheetBadge = sheetEnabled
    ? sheetSyncState.phase === 'error'
      ? `Sheets sync error`
      : `Sheets sync: ${sheetSyncState.phase === 'syncing' ? 'updating' : 'up to date'}`
    : null
  const baseFlows = fp?.scenarios?.base?.cash_flows ?? []
  const pessFlows = fp?.scenarios?.pessimistic?.cash_flows ?? []
  const optFlows  = fp?.scenarios?.optimistic?.cash_flows  ?? []

  // Merge scenarios for chart
  const scenarioData = baseFlows.map((b, i) => ({
    month:      b.month,
    base:       b.cumulative,
    pessimistic: pessFlows[i]?.cumulative ?? 0,
    optimistic:  optFlows[i]?.cumulative  ?? 0,
  }))

  // Monthly revenue vs opex bars
  const monthlyData = baseFlows.map(b => ({
    month:   b.month,
    revenue: b.revenue,
    opex:    b.opex,
    net:     b.net,
  }))

  const recs = fp?.ai_recommendations ?? []

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="label-sm">Decision Intelligence</p>
            <h2 className="page-title mt-1">Financial Analysis</h2>
            <p className="text-sm text-slate-400 mt-2">Scenario-based projections from your latest farm inputs, with AI guidance and risk flags.</p>
            {sheetBadge && (
              <p className="text-xs text-slate-500 mt-2" role="status" aria-live="polite">
                {sheetBadge}{sheetSyncState.lastUpdatedAt ? ` • ${sheetSyncState.lastUpdatedAt}` : ''}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={handleExportPdf} disabled={downloadingPdf} className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-50">
              <Download size={15} /> {downloadingPdf ? 'Exporting…' : 'Export PDF'}
            </button>
            <div className="hidden md:flex items-center rounded-xl border border-forest-700/30 bg-forest-900/30 px-3">
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value)
                  setSelectedFarmId(e.target.value || null)
                }}
                className="bg-transparent text-sm text-slate-200 outline-none py-2"
                aria-label="Select project"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="text-slate-900">{p.name}</option>
                ))}
              </select>
            </div>
            <button onClick={handleRunNewSurvey} className="btn-primary flex items-center gap-2 text-sm">
              <Mic2 size={15} /> Run New Survey
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-in">
        <MetricCard label="Total CAPEX" value={fp?.total_capex ? `₹${fp.total_capex.toLocaleString('en-IN')}` : '—'} />
        <MetricCard label="Annual Revenue" value={fp?.total_revenue_annual ? `₹${fp.total_revenue_annual.toLocaleString('en-IN')}` : '—'} />
        <MetricCard label="Annual Profit" value={fp?.net_profit_annual ? `₹${fp.net_profit_annual.toLocaleString('en-IN')}` : '—'} highlight={fp?.net_profit_annual > 0} />
        <MetricCard label="ROI" value={fp?.roi_percent ? `${fp.roi_percent.toFixed(1)}%` : '—'} sub="Target return" highlight />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-in">
        <MetricCard label="Annual OPEX" value={fp?.total_opex_annual ? `₹${fp.total_opex_annual.toLocaleString('en-IN')}` : '—'} />
        <MetricCard label="Payback Period" value={fp?.payback_period_months ? `${fp.payback_period_months} mo` : '—'} sub="CAPEX recovery" />
        <MetricCard label="Break-Even" value={fp?.break_even_month ? `Month ${fp.break_even_month}` : '—'} sub="Positive cash month" />
        <MetricCard label="NPV" value={fp?.scenarios?.base?.npv ? `₹${Math.round(fp.scenarios.base.npv).toLocaleString('en-IN')}` : '—'} sub="Net present value" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Scenario Cumulative Cash Flow */}
        <div className="panel lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title text-lg">Cumulative Cash Flow — Scenarios</h2>
            <span className="label-sm">{fp?.horizon_months ?? 12} months</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={scenarioData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="optGrad"  x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2ecc8e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2ecc8e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#f5a623" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#f5a623" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: '#6a9e8f', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Month', position: 'insideBottom', offset: -2, fill: '#6a9e8f', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6a9e8f', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#6a9e8f' }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="optimistic"  name="Optimistic"  stroke="#2ecc8e" strokeWidth={2} fill="url(#optGrad)"  />
              <Area type="monotone" dataKey="base"        name="Base"        stroke="#5ddaad" strokeWidth={2} fill="none" strokeDasharray="6 3" />
              <Area type="monotone" dataKey="pessimistic" name="Pessimistic" stroke="#f5a623" strokeWidth={2} fill="url(#pessGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Revenue vs OPEX bars */}
        <div className="panel lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title text-lg">Revenue vs OPEX</h2>
            <span className="label-sm">Monthly (Base)</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData.slice(0, 12)} margin={{ top: 5, right: 5, bottom: 0, left: -20 }} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: '#6a9e8f', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6a9e8f', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6a9e8f' }} />
              <Bar dataKey="revenue" name="Revenue" fill="#2ecc8e" radius={[4,4,0,0]} fillOpacity={0.8} />
              <Bar dataKey="opex"    name="OPEX"    fill="#f5a623" radius={[4,4,0,0]} fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Recommendations */}
      {recs.length > 0 && (
        <div className="panel">
          <h2 className="section-title text-lg mb-4">AI Recommendations</h2>
          <div className="space-y-3">
            {recs.map((rec, i) => {
              const Icon = PRIORITY_ICONS[rec.priority] ?? Info
              return (
                <div key={i} className={`flex gap-4 p-4 rounded-xl border ${PRIORITY_STYLES[rec.priority]}`}>
                  <Icon size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider">{rec.category}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-black/20 font-mono">{rec.priority}</span>
                    </div>
                    <p className="font-medium text-sm text-slate-200">{rec.title}</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{rec.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Farm Answers Summary */}
      <div className="panel">
        <h2 className="section-title text-lg mb-4">Survey Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(analysis.farm_answers ?? {}).map(([k, v]) => (
            <div key={k} className="glass-sm px-3 py-2.5">
              <p className="label-sm truncate">{k.replace(/_/g, ' ')}</p>
              <p className="text-sm text-slate-200 font-medium mt-0.5 truncate">
                {Array.isArray(v) ? v.join(', ') : String(v)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
