interface BreakEvenProgressProps {
  breakEvenMonth: number | null;
  horizon: number;
}

export function BreakEvenProgress({ breakEvenMonth, horizon }: BreakEvenProgressProps) {
  if (!breakEvenMonth) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium text-slate-500 mb-1">Break-even</p>
        <p className="text-2xl font-bold text-slate-300">—</p>
        <p className="text-xs text-slate-400 mt-1">Complete a survey to see break-even</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((breakEvenMonth / horizon) * 100));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">Break-even</p>
      <p className="text-2xl font-bold tabular-nums text-slate-900 leading-tight">
        Month {breakEvenMonth}
      </p>
      <p className="text-xs text-slate-400 mb-3">of {horizon}-month horizon</p>
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-slate-400">M0</span>
        <span className="text-[10px] font-semibold text-green-600">M{breakEvenMonth}</span>
        <span className="text-[10px] text-slate-400">M{horizon}</span>
      </div>
    </div>
  );
}
