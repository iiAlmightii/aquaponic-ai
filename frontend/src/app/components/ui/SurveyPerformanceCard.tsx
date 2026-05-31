import { Skeleton } from './skeleton';

interface SurveyPerformanceCardProps {
  aquaCount: number;
  landCount: number;
  aquaAvgRoi: number;
  landAvgRoi: number;
  loading?: boolean;
}

export function SurveyPerformanceCard({
  aquaCount,
  landCount,
  aquaAvgRoi,
  landAvgRoi,
  loading,
}: SurveyPerformanceCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-3 w-32 bg-slate-100" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-14 bg-slate-100 rounded-lg" />
          <Skeleton className="h-14 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Survey Performance
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-0.5">
          <p className="text-xs text-slate-500">Aquaponics</p>
          <p className="text-xl font-bold text-slate-900">
            {aquaCount}{' '}
            <span className="text-sm font-normal text-slate-400">surveys</span>
          </p>
          <p className="text-xs font-semibold text-green-600">
            {aquaAvgRoi > 0 ? `Avg ROI ${aquaAvgRoi.toFixed(0)}%` : 'No data yet'}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-slate-500">Land Farming</p>
          <p className="text-xl font-bold text-slate-900">
            {landCount}{' '}
            <span className="text-sm font-normal text-slate-400">surveys</span>
          </p>
          <p className="text-xs font-semibold text-amber-600">
            {landAvgRoi > 0 ? `Avg ROI ${landAvgRoi.toFixed(0)}%` : 'No data yet'}
          </p>
        </div>
      </div>
    </div>
  );
}
