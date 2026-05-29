import { type LucideIcon } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Skeleton } from './skeleton';
import { cn } from './utils';

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  sparklineData?: number[];
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaPositive,
  sparklineData,
  icon: Icon,
  iconColor = 'text-slate-400',
  loading,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-3.5 w-24 bg-slate-100" />
        <Skeleton className="h-7 w-28 bg-slate-100" />
        <Skeleton className="h-3 w-16 bg-slate-100" />
      </div>
    );
  }

  const chartData = (sparklineData ?? []).map((v, i) => ({ i, v }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={cn('w-4 h-4 flex-shrink-0', iconColor)} />
      </div>
      <p className="text-2xl font-bold tabular-nums text-slate-900 leading-tight">{value}</p>
      <div className="flex items-end justify-between mt-2 gap-2">
        {delta ? (
          <span
            className={cn(
              'text-xs font-semibold',
              deltaPositive === false ? 'text-red-500' : 'text-green-600',
            )}
          >
            {deltaPositive === false ? '↓' : '↑'} {delta}
          </span>
        ) : (
          <span />
        )}
        {chartData.length > 1 && (
          <div className="w-16 h-5 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={deltaPositive === false ? '#ef4444' : '#16a34a'}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
