/**
 * pages/ReportsPage.jsx — Real completed-session report list and download.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Download, Clock, CheckCircle, RefreshCw, BarChart3 } from 'lucide-react'
import { reportAPI } from '../utils/api'
import { useStore } from '../store'

export default function ReportsPage() {
  const navigate = useNavigate()
  const { fetchAnalysis } = useStore()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingSessionId, setDownloadingSessionId] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')

  const loadReports = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await reportAPI.history()
      setRows(data?.reports || [])
    } catch (e) {
      setError(e.message || 'Failed to load completed survey reports.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  const projectOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.project_name).filter(Boolean)))
    return ['all', ...names]
  }, [rows])

  const filteredRows = useMemo(() => {
    if (projectFilter === 'all') return rows
    return rows.filter((r) => r.project_name === projectFilter)
  }, [rows, projectFilter])

  const handleDownload = async (sessionId) => {
    setDownloadingSessionId(sessionId)
    try {
      await reportAPI.download(sessionId, `aquaponic-report-${sessionId.slice(0, 8)}.pdf`)
    } finally {
      setDownloadingSessionId('')
    }
  }

  const handleOpenAnalysis = async (sessionId) => {
    await fetchAnalysis(sessionId)
    navigate('/analysis')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="panel">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="label-sm">Reporting</p>
            <h2 className="page-title mt-1">Report Studio</h2>
            <p className="text-sm text-slate-400 mt-2">Only completed survey reports are listed here. No placeholder entries.</p>
          </div>
          <button onClick={loadReports} className="btn-ghost flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <aside className="xl:col-span-1 panel h-fit">
          <p className="label-sm">Project Filter</p>
          <div className="mt-3 space-y-2 text-sm">
            {projectOptions.map((option) => (
              <button
                key={option}
                onClick={() => setProjectFilter(option)}
                className={`w-full text-left data-list-row ${projectFilter === option ? 'border-forest-500/45 text-slate-100' : 'text-slate-300 hover:text-slate-100'}`}
              >
                {option === 'all' ? 'All projects' : option}
              </button>
            ))}
          </div>
        </aside>

        <section className="xl:col-span-3 space-y-3">
          {loading && <div className="panel text-sm text-slate-400">Loading completed survey reports…</div>}
          {!loading && error && <div className="panel text-sm text-red-300">{error}</div>}
          {!loading && !error && filteredRows.length === 0 && (
            <div className="panel text-sm text-slate-400">No completed survey reports found for this filter yet.</div>
          )}

          {!loading && !error && filteredRows.map((r) => (
            <div key={r.session_id} className="panel !p-3.5 flex items-center gap-3 hover:border-forest-600/40 transition-colors">
              <div className="icon-chip w-9 h-9 rounded-lg flex-shrink-0">
                <FileText size={18} className="text-forest-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-200 text-sm truncate">{r.project_name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] px-2 py-0.5 rounded-md border font-medium bg-forest-500/15 text-forest-300 border-forest-500/30">completed survey</span>
                  <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={11} />{r.completed_at ? new Date(r.completed_at).toLocaleString() : '-'}</span>
                  <span className="text-xs text-slate-500">{r.session_id.slice(0, 8)}…</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <CheckCircle size={14} className="text-forest-400" />
                <button
                  onClick={() => handleOpenAnalysis(r.session_id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-sm text-xs text-slate-300 hover:text-forest-300 hover:border-forest-500/40 transition-colors"
                >
                  <BarChart3 size={12} /> Open
                </button>
                <button
                  onClick={() => handleDownload(r.session_id)}
                  disabled={downloadingSessionId === r.session_id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-sm text-xs text-slate-300 hover:text-forest-300 hover:border-forest-500/40 transition-colors disabled:opacity-50"
                >
                  <Download size={12} /> {downloadingSessionId === r.session_id ? 'Preparing…' : 'PDF'}
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
