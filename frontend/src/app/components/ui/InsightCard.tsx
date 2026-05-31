import { AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from './utils';

type InsightLevel = 'critical' | 'warning' | 'opportunity';

interface InsightCardProps {
  priority: string; // accepts 'high'|'medium'|'low'|'critical'|'warning'|'opportunity'
  category: string;
  title: string;
  detail: string;
  index?: number;
}

const PRIORITY_MAP: Record<string, InsightLevel> = {
  high: 'critical',
  medium: 'warning',
  low: 'opportunity',
  critical: 'critical',
  warning: 'warning',
  opportunity: 'opportunity',
};

const CONFIG: Record<InsightLevel, { bg: string; border: string; text: string; badge: string; Icon: typeof AlertTriangle }> = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    Icon: AlertTriangle,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    Icon: Info,
  },
  opportunity: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
    Icon: TrendingUp,
  },
};

export function InsightCard({ priority, category, title, detail, index = 0 }: InsightCardProps) {
  const level: InsightLevel = PRIORITY_MAP[priority] ?? 'opportunity';
  const c = CONFIG[level];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className={cn('rounded-xl border p-4', c.bg, c.border)}
    >
      <div className="flex items-start gap-3">
        <c.Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', c.text)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn('text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5', c.badge)}>
              {level}
            </span>
            <span className="text-[11px] text-slate-500">{category}</span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{detail}</p>
        </div>
      </div>
    </motion.div>
  );
}
