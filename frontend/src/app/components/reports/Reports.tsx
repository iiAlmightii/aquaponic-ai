import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Download, FileText, Calendar, TrendingUp } from 'lucide-react';
import { PretextText } from '../ui/pretext-text';
import { landSurveyAPI, reportAPI } from '../../utils/api';

interface Report {
  id: string;
  sessionId: string;
  type: 'AI Survey' | 'Land Voice';
  generatedDate: string;
  title: string;
  status: 'completed' | 'processing';
}

type ReportView = 'ai-survey' | 'land-survey';

interface ReportsProps {
  onNavigate?: (view: ReportView) => void;
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
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadsCount, setDownloadsCount] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await reportAPI.history();
        const rows = res?.data?.reports || [];
        const mapped: Report[] = rows.map((row: any) => {
          const sessionId = String(row.session_id || '');
          const projectName = String(row.project_name || 'Untitled Project');
          const isoDate = row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString();
          return {
            id: sessionId,
            sessionId,
            type: projectName.toLowerCase().includes('land') ? 'Land Voice' : 'AI Survey',
            generatedDate: isoDate,
            title: `${projectName} Report`,
            status: 'completed',
          };
        });
        setReports(mapped);
      } catch (e: any) {
        setError(e.message || 'Failed to load reports.');
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return reports.filter((r) => {
      const d = new Date(r.generatedDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [reports]);

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
              text="Reports & History"
              font={'600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={40}
              className="text-gray-900 mb-2"
            />
            <PretextText
              text="Access and download reports from your completed surveys and analyses"
              font={'400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={24}
              className="text-gray-600"
            />
          </div>
          <div className="flex gap-2">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onNavigate?.('ai-survey')}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Generate New Report
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
              <p className="text-sm text-gray-600">Total Reports</p>
              <p className="text-gray-900">{reports.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">This Month</p>
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

      {/* Reports List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-gray-900">Report History</h3>
        </div>

        <div className="divide-y divide-gray-200">
          {loading && (
            <div className="p-6 text-sm text-gray-600">Loading reports...</div>
          )}

          {!loading && reports.length === 0 && (
            <div className="p-6 text-sm text-gray-600">No completed reports yet.</div>
          )}

          {!loading && reports.map((report) => (
            <div key={report.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        report.type === 'AI Survey'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {report.type}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(report.generatedDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <PretextText
                    text={report.title}
                    font={'600 1rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
                    lineHeight={24}
                    className="text-gray-900 mb-1"
                  />
                  <p className="text-sm text-gray-600">Session ID: {report.sessionId}</p>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadReport(report, 'pdf')}
                      disabled={busyKey === `${report.sessionId}:pdf`}
                    >
                      <Download className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">PDF</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadReport(report, 'csv')}
                      disabled={busyKey === `${report.sessionId}:csv`}
                    >
                      <Download className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">CSV</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadReport(report, 'json')}
                      disabled={busyKey === `${report.sessionId}:json`}
                    >
                      <Download className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">JSON</span>
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleExportToSpreadsheet(report)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={busyKey === `${report.sessionId}:sheets`}
                  >
                    Export to Sheets
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
