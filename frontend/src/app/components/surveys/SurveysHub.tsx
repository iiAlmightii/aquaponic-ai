// frontend/src/app/components/surveys/SurveysHub.tsx
import { useEffect, useState } from 'react';
import { Sprout, Mic, FileText, ChevronRight } from 'lucide-react';
import { reportAPI } from '../../utils/api';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/skeleton';

interface SurveysHubProps {
  onNavigate: (view: string) => void;
}

interface SurveyRow {
  session_id: string;
  survey_type: string;
  project_name: string;
  completed_at: string | null;
  roi_percent: number;
  revenue: number;
}

const relativeTime = (iso: string | null) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function SurveysHub({ onNavigate }: SurveysHubProps) {
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportAPI.analytics()
      .then((res: any) => setSurveys(res?.data?.top_sessions ?? []))
      .catch(() => setSurveys([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate('ai-survey')}
          className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-start gap-3 hover:border-green-300 hover:shadow-md transition-all text-left group"
        >
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
            <Sprout className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Aquaponic Survey</h3>
            <p className="text-sm text-slate-500 mt-1">Voice-guided financial planning for aquaponic farms. Takes ~5 minutes.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-600 group-hover:gap-2 transition-all">
            Start survey <ChevronRight className="w-4 h-4" />
          </span>
        </button>

        <button
          onClick={() => onNavigate('land-survey')}
          className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-start gap-3 hover:border-amber-300 hover:shadow-md transition-all text-left group"
        >
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
            <Mic className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Land Farm Survey</h3>
            <p className="text-sm text-slate-500 mt-1">Capture land, crops, costs, and market prices to generate a financial plan.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 group-hover:gap-2 transition-all">
            Start survey <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Survey History</h3>
          <p className="text-xs text-slate-400 mt-0.5">All completed surveys, sorted by profit</p>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-2 h-2 rounded-full bg-slate-100" />
                <Skeleton className="h-4 flex-1 bg-slate-100" />
                <Skeleton className="h-4 w-16 bg-slate-100" />
                <Skeleton className="h-4 w-12 bg-slate-100" />
                <Skeleton className="h-6 w-16 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No surveys completed yet"
            description="Complete your first aquaponic or land survey to see history here"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">Name</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Type</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">Date</th>
                  <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">ROI</th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s.session_id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">{s.project_name}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        s.survey_type === 'ai'
                          ? 'bg-green-50 text-green-800 border-green-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {s.survey_type === 'ai' ? 'Aquaponic' : 'Land'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{relativeTime(s.completed_at)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">
                      {s.roi_percent != null ? `${s.roi_percent.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
