import { useEffect } from 'react';
import { motion } from 'motion/react';
import { History, TrendingUp, TrendingDown } from 'lucide-react';
import { useStore } from '../../store';
import { Skeleton } from '../ui/skeleton';

interface FarmTimelineProps {
  farmId: string;
}

const relativeDate = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
};

const fmtRs = (v: number) =>
  Math.abs(v) >= 100000
    ? `₹${(v / 100000).toFixed(1)}L`
    : `₹${Math.round(v / 1000)}k`;

export function FarmTimeline({ farmId }: FarmTimelineProps) {
  const farmSessions = useStore((s: any) => s.farmSessions);
  const fetchFarmTimeline = useStore((s: any) => s.fetchFarmTimeline);
  const fetchAnalysis = useStore((s: any) => s.fetchAnalysis);

  useEffect(() => {
    if (farmId) fetchFarmTimeline(farmId);
  }, [farmId]);

  if (!farmSessions) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl bg-slate-100" />)}
      </div>
    );
  }

  if (farmSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <History className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-sm font-medium text-slate-500">No history yet</p>
        <p className="text-xs text-slate-400 mt-0.5">Complete a survey to start tracking this farm's evolution</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Farm History
      </p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-100" />

        <div className="space-y-3">
          {farmSessions.map((entry: any, i: number) => {
            const isLatest = i === 0;
            const profitable = (entry.profit ?? 0) >= 0;

            return (
              <motion.div
                key={entry.session_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => fetchAnalysis(entry.session_id)}
                className="relative pl-9 cursor-pointer group"
              >
                {/* Dot */}
                <div className={`absolute left-1.5 top-4 w-3 h-3 rounded-full border-2 border-white ${isLatest ? 'bg-green-500' : 'bg-slate-300'}`} />

                <div className="rounded-xl border border-slate-100 bg-white p-3 hover:border-green-200 hover:bg-green-50/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {isLatest && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                          Current
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                        entry.source === 'edit'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {entry.source === 'edit' ? 'Edit' : 'Survey'}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 uppercase">
                        {entry.survey_type === 'land' ? 'Land' : 'Aquaponic'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {entry.completed_at ? relativeDate(entry.completed_at) : ''}
                    </span>
                  </div>

                  <div className="flex gap-4">
                    <div>
                      <p className="text-[9px] uppercase text-slate-400 font-semibold">Revenue</p>
                      <p className="text-xs font-bold text-slate-800">{fmtRs(entry.revenue ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-400 font-semibold">ROI</p>
                      <p className={`text-xs font-bold ${(entry.roi_percent ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {entry.roi_percent != null ? `${entry.roi_percent.toFixed(0)}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-slate-400 font-semibold">Net Profit</p>
                      <p className={`text-xs font-bold flex items-center gap-0.5 ${profitable ? 'text-green-600' : 'text-red-500'}`}>
                        {profitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {fmtRs(Math.abs(entry.profit ?? 0))}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
