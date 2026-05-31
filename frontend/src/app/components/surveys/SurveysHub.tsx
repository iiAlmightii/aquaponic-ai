// frontend/src/app/components/surveys/SurveysHub.tsx
import { useEffect, useState } from 'react';
import { Sprout, Mic, FileText, ChevronRight } from 'lucide-react';
import { reportAPI } from '../../utils/api';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/skeleton';
import { useStore } from '../../store';
import { LangCode, createT } from '../../utils/i18n';

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

export function SurveysHub({ onNavigate }: SurveysHubProps) {
  const lang: LangCode = (useStore((s: any) => s.globalLanguage) || 'en') as LangCode;
  const tr = createT(lang);

  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const hasAquaSession = !!localStorage.getItem('aqua_session_id');
  const hasLandSession = !!localStorage.getItem('land_survey_session_id');

  useEffect(() => {
    reportAPI.analytics()
      .then((res: any) => setSurveys(res?.data?.top_sessions ?? []))
      .catch(() => setSurveys([]))
      .finally(() => setLoading(false));
  }, []);

  const relativeTime = (iso: string | null) => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return tr('today');
    if (d === 1) return tr('yesterday');
    if (d < 7) return `${d} ${tr('days_ago')}`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

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
            <h3 className="text-base font-bold text-slate-900">{tr('aquaponic_survey_title')}</h3>
            <p className="text-sm text-slate-500 mt-1">{tr('aquaponic_survey_desc')}</p>
            <span className="text-[10px] text-slate-400 font-medium">⏱ ~5 min · Voice-guided</span>
          </div>
          {hasAquaSession && (
            <span className="inline-flex items-center text-[10px] font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5 mb-1">
              Resume →
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-600 group-hover:gap-2 transition-all">
            {tr('start_survey')} <ChevronRight className="w-4 h-4" />
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
            <h3 className="text-base font-bold text-slate-900">{tr('land_survey_title')}</h3>
            <p className="text-sm text-slate-500 mt-1">{tr('land_survey_desc')}</p>
            <span className="text-[10px] text-slate-400 font-medium">⏱ ~8 min · Crop & financial plan</span>
          </div>
          {hasLandSession && (
            <span className="inline-flex items-center text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 mb-1">
              Resume →
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 group-hover:gap-2 transition-all">
            {tr('start_survey')} <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{tr('survey_history')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{tr('all_completed_surveys')}</p>
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
            title={tr('no_surveys_completed')}
            description={tr('complete_first_survey')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{tr('col_name')}</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">{tr('col_type')}</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-3 py-3">{tr('col_date')}</th>
                  <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">{tr('col_roi')}</th>
                  <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-5 py-3">
                    Status
                  </th>
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
                        {s.survey_type === 'ai' ? tr('type_aquaponic') : tr('type_land')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{relativeTime(s.completed_at)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-slate-900">
                      {s.roi_percent != null ? `${s.roi_percent.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-[11px] font-semibold bg-green-50 text-green-700 rounded-full px-2 py-0.5">
                        ✓ Done
                      </span>
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
