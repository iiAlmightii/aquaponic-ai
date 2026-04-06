/**
 * pages/FarmPage.jsx — Farm overview: fish batches, crop records, water readings.
 */
import { useEffect, useMemo, useState } from 'react'
import { Fish, Leaf, Droplets, Plus, Activity, RefreshCw } from 'lucide-react'
import { farmAPI } from '../utils/api'
import { useStore } from '../store'

const STATUS_COLORS = {
  active:    'bg-forest-500/20 text-forest-300 border-forest-500/30',
  harvested: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  growing:   'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  lost:      'bg-red-500/20 text-red-300 border-red-500/30',
}

const TABS = [
  { id: 'fish',  label: 'Fish Batches',   icon: Fish     },
  { id: 'crops', label: 'Crop Records',   icon: Leaf     },
  { id: 'water', label: 'Water Quality',  icon: Droplets },
]

export default function FarmPage() {
  const [tab, setTab] = useState('fish')
  const { analysis, setSelectedFarmId } = useStore()
  const [farms, setFarms] = useState([])
  const [activeFarmId, setActiveFarmId] = useState('')
  const [records, setRecords] = useState({ fish_batches: [], crop_records: [], water_readings: [], farm: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWaterForm, setShowWaterForm] = useState(false)
  const [savingWater, setSavingWater] = useState(false)
  const [waterForm, setWaterForm] = useState({
    ph: '', dissolved_oxygen_mg_l: '', temperature_c: '', ammonia_mg_l: '',
    nitrite_mg_l: '', nitrate_mg_l: '', turbidity_ntu: '', tds_ppm: ''
  })

  const loadRecords = async (farmId) => {
    if (!farmId) return
    setLoading(true)
    setError('')
    try {
      const { data } = await farmAPI.records(farmId)
      setRecords(data || { fish_batches: [], crop_records: [], water_readings: [], farm: null })
    } catch (e) {
      setError(e.message || 'Failed to load farm records')
      setRecords({ fish_batches: [], crop_records: [], water_readings: [], farm: null })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setLoading(true)
      try {
        const { data } = await farmAPI.list()
        if (cancelled) return
        const list = data?.farms || []
        setFarms(list)
        const remembered = localStorage.getItem('selected_farm_id') || analysis?.farm_id || localStorage.getItem('last_farm_id')
        const chosen = remembered && list.find((f) => f.id === remembered) ? remembered : (list[0]?.id || '')
        setActiveFarmId(chosen)
        if (chosen) {
          setSelectedFarmId(chosen)
          await loadRecords(chosen)
        } else {
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load projects')
          setLoading(false)
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [analysis?.farm_id, setSelectedFarmId])

  const fishTotal = useMemo(() => records.fish_batches.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0), [records.fish_batches])
  const activeFishBatches = useMemo(() => records.fish_batches.filter((r) => r.status === 'active').length, [records.fish_batches])

  const handleFarmSwitch = async (farmId) => {
    setActiveFarmId(farmId)
    setSelectedFarmId(farmId || null)
    if (farmId) {
      await loadRecords(farmId)
    } else {
      setRecords({ fish_batches: [], crop_records: [], water_readings: [], farm: null })
    }
  }

  const handleAddRecord = () => {
    if (tab !== 'water') {
      setError('Fish and crop records are sourced from your AI survey inputs. Use AI Survey to update production plan.')
      return
    }
    setShowWaterForm((v) => !v)
  }

  const handleWaterSubmit = async (e) => {
    e.preventDefault()
    if (!activeFarmId) return
    setSavingWater(true)
    setError('')
    try {
      const payload = Object.fromEntries(
        Object.entries(waterForm).map(([k, v]) => [k, v === '' ? null : Number(v)])
      )
      await farmAPI.createWaterReading(activeFarmId, payload)
      setShowWaterForm(false)
      setWaterForm({ ph: '', dissolved_oxygen_mg_l: '', temperature_c: '', ammonia_mg_l: '', nitrite_mg_l: '', nitrate_mg_l: '', turbidity_ntu: '', tds_ppm: '' })
      await loadRecords(activeFarmId)
    } catch (e2) {
      setError(e2.message || 'Failed to save water reading')
    } finally {
      setSavingWater(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="label-sm">Operations</p>
            <h2 className="page-title mt-1">Farm Management Board</h2>
            <p className="text-sm text-slate-400 mt-2">Track fish inventory, crop beds, and water logs from your real survey/project data.</p>
          </div>
          <div className="flex gap-3">
            <select
              value={activeFarmId}
              onChange={(e) => handleFarmSwitch(e.target.value)}
              className="rounded-xl border border-forest-700/35 bg-forest-900/30 px-3 py-2 text-sm text-slate-200"
            >
              {!farms.length && <option value="">No projects</option>}
              {farms.map((f) => (<option key={f.id} value={f.id} className="text-slate-900">{f.name}</option>))}
            </select>
            <button onClick={() => activeFarmId && loadRecords(activeFarmId)} className="btn-ghost flex items-center gap-2 text-sm">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={handleAddRecord} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={15} /> {tab === 'water' ? 'Log Water Reading' : 'Add Record'}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="panel text-sm text-red-300">{error}</div>}

      {showWaterForm && tab === 'water' && (
        <form onSubmit={handleWaterSubmit} className="panel grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['ph', 'pH'],
            ['temperature_c', 'Temp (C)'],
            ['dissolved_oxygen_mg_l', 'DO (mg/L)'],
            ['ammonia_mg_l', 'Ammonia'],
            ['nitrite_mg_l', 'Nitrite'],
            ['nitrate_mg_l', 'Nitrate'],
            ['turbidity_ntu', 'Turbidity'],
            ['tds_ppm', 'TDS (ppm)'],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-slate-300">
              <span className="block mb-1">{label}</span>
              <input
                type="number"
                step="any"
                value={waterForm[key]}
                onChange={(e) => setWaterForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="input-field"
              />
            </label>
          ))}
          <div className="col-span-2 md:col-span-4 flex gap-3 mt-1">
            <button type="submit" disabled={savingWater} className="btn-primary text-sm disabled:opacity-50">{savingWater ? 'Saving…' : 'Save Reading'}</button>
            <button type="button" onClick={() => setShowWaterForm(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 stagger-in">
        {[
          { label: 'Active Fish Batches', value: String(activeFishBatches), icon: Fish, color: 'text-forest-400' },
          { label: 'Crop Grow Beds', value: String(records.crop_records.length), icon: Leaf, color: 'text-emerald-400' },
          { label: 'Total Fish Count', value: String(fishTotal), icon: Activity, color: 'text-blue-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="label-sm">{label}</span>
              <div className="icon-chip w-8 h-8 rounded-lg"><Icon size={15} className={color} /></div>
            </div>
            <p className="text-2xl font-display font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-forest-900/50 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
              ${tab === id
                ? 'bg-forest-700/60 text-slate-100 border border-forest-500/30'
                : 'text-slate-400 hover:text-slate-300'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Fish Table */}
      {tab === 'fish' && (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm dense-table">
            <thead>
              <tr className="border-b border-forest-700/20">
                {['Species', 'Quantity', 'Tank (L)', 'Feed/day', 'Start', 'Harvest', 'Status'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 label-sm">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-5 py-4 text-slate-400" colSpan={7}>Loading fish records…</td></tr>
              )}
              {!loading && records.fish_batches.length === 0 && (
                <tr><td className="px-5 py-4 text-slate-400" colSpan={7}>No fish records yet. Complete AI survey with fish inputs.</td></tr>
              )}
              {!loading && records.fish_batches.map((b, i) => (
                <tr key={b.id} className={`border-b border-forest-700/10 hover:bg-forest-800/20 transition-colors ${i % 2 === 0 ? '' : 'bg-forest-900/10'}`}>
                  <td className="px-5 py-3.5 font-medium text-slate-200">{b.species}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{b.quantity}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{Number(b.tank_liters || 0).toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{b.feed_kg_per_day ?? 0} kg</td>
                  <td className="px-5 py-3.5 text-slate-400">{b.start_date || '-'}</td>
                  <td className="px-5 py-3.5 text-slate-400">{b.expected_harvest_date || '-'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_COLORS[b.status] || STATUS_COLORS.active}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Crops Table */}
      {tab === 'crops' && (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm dense-table">
            <thead>
              <tr className="border-b border-forest-700/20">
                {['Crop', 'Area (m²)', 'Yield (kg)', 'Planted', 'Harvest', 'Status'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 label-sm">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-5 py-4 text-slate-400" colSpan={6}>Loading crop records…</td></tr>
              )}
              {!loading && records.crop_records.length === 0 && (
                <tr><td className="px-5 py-4 text-slate-400" colSpan={6}>No crop records yet. Complete AI survey with crop inputs.</td></tr>
              )}
              {!loading && records.crop_records.map((c, i) => (
                <tr key={c.id} className={`border-b border-forest-700/10 hover:bg-forest-800/20 transition-colors ${i % 2 === 0 ? '' : 'bg-forest-900/10'}`}>
                  <td className="px-5 py-3.5 font-medium text-slate-200">{c.crop_name}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{c.growing_area_sqm ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{c.expected_yield_kg ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-400">-</td>
                  <td className="px-5 py-3.5 text-slate-400">-</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_COLORS[c.status] || STATUS_COLORS.growing}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Water Quality Placeholder */}
      {tab === 'water' && (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm dense-table">
            <thead>
              <tr className="border-b border-forest-700/20">
                {['Timestamp', 'pH', 'Temp (C)', 'DO', 'Ammonia', 'Nitrite', 'Nitrate', 'Source'].map((h) => (
                  <th key={h} className="text-left px-5 py-3.5 label-sm">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-5 py-4 text-slate-400" colSpan={8}>Loading water readings…</td></tr>
              )}
              {!loading && records.water_readings.length === 0 && (
                <tr><td className="px-5 py-4 text-slate-400" colSpan={8}>No water readings yet. Use Log Water Reading to add manual values.</td></tr>
              )}
              {!loading && records.water_readings.map((r) => (
                <tr key={r.id} className="border-b border-forest-700/10 hover:bg-forest-800/20 transition-colors">
                  <td className="px-5 py-3.5 text-slate-300">{r.timestamp ? new Date(r.timestamp).toLocaleString() : '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{r.ph ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{r.temperature_c ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{r.dissolved_oxygen_mg_l ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{r.ammonia_mg_l ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{r.nitrite_mg_l ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-300 font-mono">{r.nitrate_mg_l ?? '-'}</td>
                  <td className="px-5 py-3.5 text-slate-400">{r.source || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
