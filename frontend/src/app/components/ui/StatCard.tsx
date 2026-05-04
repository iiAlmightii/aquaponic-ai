import { LucideIcon } from 'lucide-react';
import { Skeleton } from './skeleton';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: LucideIcon;
  accentColor?: 'green' | 'blue' | 'amber' | 'purple';
  loading?: boolean;
}

const ACCENT = {
  green:  { border: 'border-t-green-500',  iconBg: 'bg-green-50',  iconText: 'text-green-600'  },
  blue:   { border: 'border-t-blue-500',   iconBg: 'bg-blue-50',   iconText: 'text-blue-600'   },
  amber:  { border: 'border-t-amber-500',  iconBg: 'bg-amber-50',  iconText: 'text-amber-600'  },
  purple: { border: 'border-t-purple-500', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
};

export function StatCard({ label, value, trend, trendUp, icon: Icon, accentColor = 'green', loading = false }: StatCardProps) {
  const a = ACCENT[accentColor];

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 border-t-4 ${a.border} p-4`}>
        <Skeleton className="w-9 h-9 rounded-lg mb-3 bg-slate-100" />
        <Skeleton className="h-7 w-20 mb-1.5 bg-slate-100" />
        <Skeleton className="h-3.5 w-28 mb-2 bg-slate-100" />
        <Skeleton className="h-3 w-16 bg-slate-100" />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-t-4 ${a.border} p-4`}>
      <div className={`w-9 h-9 rounded-lg ${a.iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`w-[18px] h-[18px] ${a.iconText}`} />
      </div>
      <div className="text-2xl font-extrabold text-slate-900 leading-none mb-1">{value}</div>
      <div className="text-xs text-slate-500 mb-2">{label}</div>
      {trend && (
        <div className={`text-[11px] font-semibold ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
}
