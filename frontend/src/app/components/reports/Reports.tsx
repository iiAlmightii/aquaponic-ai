import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Download, FileText, Calendar, TrendingUp } from 'lucide-react';
import { PretextText } from '../ui/pretext-text';
import { landSurveyAPI, reportAPI } from '../../utils/api';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useStore } from '../../store';
import { LangCode, createT } from '../../utils/i18n';
import { FarmSelector } from '../ui/FarmSelector';

interface Report {
  id: string;
  sessionId: string;
  farm_id?: string;
  type: 'AI Survey' | 'Land Voice';
  generatedDate: string;
  title: string;
  status: 'completed' | 'processing';
}

interface ReportsProps {
  onNavigate?: (view: string) => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Reports({ onNavigate }: ReportsProps) {
  const lang: LangCode = (useStore((s: any) => s.globalLanguage) || 'en') as LangCode;
  const tr = createT(lang);
  const selectedFarmId = useStore((s: any) => s.selectedFarmId);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadsCount, setDownloadsCount] = useState(0);
  const [totalReports, setTotalReports] = useState(0);
  const [thisMonthCount, setThisMonthCount] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await reportAPI.history(20);
        const payload = res?.data || {};
        const rows = payload.reports || [];
        setTotalReports(Number(payload.total_count || rows.length));
        setThisMonthCount(Number(payload.this_month_count || 0));
        const mapped: Report[] = rows.map((row: any) => {
          const sessionId = String(row.session_id || '');
          const projectName = String(row.project_name || 'Untitled Project');
          const isoDate = row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString();
          return {
            id: sessionId,
            sessionId,
            farm_id: row.farm_id ? String(row.farm_id) : undefined,
            type: projectName.toLowerCase().includes('land') ? 'Land Voice' : 'AI Survey',
            generatedDate: isoDate,
            title: `${projectName} Report`,
            status: 'completed',
          };
        });
        setReports(mapped);
        // Best-effort: load analytics to enrich report cards with financial metrics
        try {
          const analyticsRes = await reportAPI.analytics();
          const topSessions: any[] = analyticsRes?.data?.top_sessions || [];
          const map: Record<string, any> = {};
          topSessions.forEach((s: any) => { map[s.session_id] = s; });
          setSessionMetrics(map);
        } catch { /* metrics preview is best-effort */ }
      } catch (e: any) {
        setError(e.message || 'Failed to load reports.');
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const filtered = useMemo(
    () => selectedFarmId ? reports.filter((r: any) => r.farm_id === selectedFarmId) : reports,
    [reports, selectedFarmId],
  );
  const visibleReports = useMemo(() => filtered.length, [filtered]);

  const handleDownloadReport = async (report: Report, format: 'pdf' | 'csv' | 'json') => {
    const actionKey = `${report.sessionId}:${format}`;
    setBusyKey(actionKey);
    try {
      if (format === 'pdf') {
        await reportAPI.download(report.sessionId, `aquaponic-report-${report.sessionId.slice(0, 8)}.pdf`);
      } else if (format === 'csv') {
        const res = await landSurveyAPI.exportCsv(report.sessionId);
        const filename = `land-survey-${report.sessionId.slice(0, 8)}.csv`;
        downloadBlob(res.data, filename);
      } else {
        const res = await landSurveyAPI.exportJson(report.sessionId);
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const filename = `land-survey-${report.sessionId.slice(0, 8)}.json`;
        downloadBlob(blob, filename);
      }
      setDownloadsCount((prev) => prev + 1);
    } catch (e: any) {
      alert(e.message || 'Download failed for this report.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleExportToSpreadsheet = async (report: Report) => {
    const actionKey = `${report.sessionId}:sheets`;
    setBusyKey(actionKey);
    try {
      await landSurveyAPI.syncSheet(report.sessionId);
      alert('Successfully exported to Google Sheets.');
    } catch (e: any) {
      alert(e.message || 'Export to Sheets failed for this report.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <PretextText
              text={tr('reports_title')}
              font={'600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={40}
              className="text-gray-900 mb-2"
            />
            <PretextText
              text={tr('reports_desc')}
              font={'400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={24}
              className="text-gray-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <FarmSelector />
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onNavigate?.('ai-survey')}>
              <TrendingUp className="w-4 h-4 mr-2" />
              {tr('generate_report')}
            </Button>
          </div>
        </div>
      </div>

      {/* Reports Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{tr('total_reports')}</p>
              <p className="text-gray-900">{totalReports || visibleReports}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{tr('this_month')}</p>
              <p className="text-gray-900">{thisMonthCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Download className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Downloads</p>
              <p className="text-gray-900">{downloadsCount}</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Reports Grid */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl p-4">
              <Skeleton className="h-4 flex-1 bg-slate-100" />
              <Skeleton className="h-4 w-20 bg-slate-100" />
              <Skeleton className="h-4 w-24 bg-slate-100" />
              <Skeleton className="h-8 w-24 rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={FileText}
          title={tr('no_reports')}
          description={tr('complete_survey_report')}
        />
      )}

      {!loading && filtered.length > 0 && (
        <div>
          <h3 className="text-gray-900 mb-4">{tr('report_history')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((report) => {
              const metrics = sessionMetrics[report.sessionId];
              return (
                <div
                  key={report.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-base font-semibold text-slate-900 leading-tight">
                        {report.title}
                      </p>
                      <span
                        className={`text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 ${
                          report.type === 'AI Survey'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {report.type === 'AI Survey' ? 'Aquaponic' : 'Land'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {new Date(report.generatedDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  {metrics && (
                    <>
                      <div className="border-t border-slate-100" />
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          ['Revenue', metrics.revenue > 0 ? `₹${(metrics.revenue / 100000).toFixed(1)}L` : '—'],
                          ['ROI', metrics.roi_percent != null ? `${metrics.roi_percent.toFixed(0)}%` : '—'],
                          ['Profit', metrics.profit != null ? `₹${(metrics.profit / 100000).toFixed(1)}L` : '—'],
                          ['Payback', '—'],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
                            <p className="text-sm font-semibold text-slate-900">{val}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="border-t border-slate-100 pt-3 flex gap-2 mt-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      disabled={busyKey === report.sessionId}
                      onClick={async () => {
                        setBusyKey(report.sessionId);
                        try {
                          await reportAPI.download(
                            report.sessionId,
                            `aquaponic-report-${report.sessionId.slice(0, 8)}.pdf`,
                          );
                          setDownloadsCount((c) => c + 1);
                        } catch {
                          /* ignore */
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      {busyKey === report.sessionId ? 'Downloading…' : 'PDF'}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-green-600 hover:bg-green-700"
                      onClick={() => onNavigate?.('analytics')}
                    >
                      Open Analytics
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Export Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 mb-1">
              Spreadsheet Sync Available
            </p>
            <p className="text-sm text-blue-800">
              Export reports directly to Google Sheets for easy collaboration and further
              analysis. CSV and JSON exports maintain semantic alignment with spreadsheet
              data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
