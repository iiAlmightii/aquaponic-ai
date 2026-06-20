// frontend/src/app/components/crop/CropResultCard.tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, MapPin, Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../ui/utils';

export interface MatchRow {
  factor: string;
  current: string;
  optimal: string;
  status: 'good' | 'warning' | 'critical';
}

export interface CropResult {
  crop: string;
  score: number;
  feasibility: string;
  season: string;
  match_table: MatchRow[];
  yield_estimate: {
    best_kg: number;
    average_kg: number;
    worst_kg: number;
    cycles_per_year: number;
    growth_days: number;
  };
  profitability: {
    market_price_per_kg: number;
    best_revenue_inr: number;
    average_revenue_inr: number;
    worst_revenue_inr: number;
  } | null;
  alternatives: { crop: string; score: number; feasibility: string }[];
  suggested_regions: string[];
}

const FEASIBILITY_COLORS: Record<string, string> = {
  Excellent: 'bg-green-100 text-green-800',
  Good: 'bg-teal-100 text-teal-800',
  Challenging: 'bg-amber-100 text-amber-800',
  Difficult: 'bg-orange-100 text-orange-800',
  'Not Feasible': 'bg-red-100 text-red-700',
};

const SEASON_COLORS: Record<string, string> = {
  kharif: 'bg-sky-50 text-sky-700',
  rabi: 'bg-purple-50 text-purple-700',
  perennial: 'bg-green-50 text-green-700',
};

const STATUS_DOT: Record<string, string> = {
  good: '✓',
  warning: '⚠',
  critical: '✗',
};

const STATUS_COLOR: Record<string, string> = {
  good: 'text-green-600',
  warning: 'text-amber-500',
  critical: 'text-red-500',
};

function ScoreGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? '#16a34a' :
    score >= 60 ? '#0d9488' :
    score >= 40 ? '#d97706' : '#ef4444';
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <svg width="56" height="56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-bold text-slate-800 -mt-9">{score}</span>
      <span className="text-[9px] text-slate-400 mt-1">/100</span>
    </div>
  );
}

const fmtRs = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`;

export function CropResultCard({ result }: { result: CropResult }) {
  const [expanded, setExpanded] = useState(result.score >= 60);

  const avgRevenue = result.profitability?.average_revenue_inr;
  const isHighRevenue = avgRevenue != null && avgRevenue >= 100000;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header — always visible */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <ScoreGauge score={result.score} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-900">{result.crop}</h3>
              <span className={cn(
                'text-[10px] font-semibold rounded-full px-2 py-0.5',
                SEASON_COLORS[result.season] || 'bg-slate-100 text-slate-600'
              )}>
                {result.season}
              </span>
              <span className={cn(
                'text-[10px] font-semibold rounded-full px-2 py-0.5',
                FEASIBILITY_COLORS[result.feasibility] || 'bg-slate-100 text-slate-600'
              )}>
                {result.feasibility}
              </span>
            </div>
            {result.yield_estimate?.average_kg != null && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                {isHighRevenue
                  ? <TrendingUp className="w-3 h-3 text-green-500" />
                  : <TrendingDown className="w-3 h-3 text-slate-400" />}
                Avg yield: {result.yield_estimate.average_kg} kg/year
                {result.profitability && ` · ${fmtRs(result.profitability.average_revenue_inr)}`}
              </p>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </div>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-5 pb-5 space-y-4 border-t border-slate-100">

              {/* Environmental match table */}
              {result.match_table.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-4 mb-2">
                    Environmental Match
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-left pb-1 font-medium">Factor</th>
                        <th className="text-left pb-1 font-medium">Current</th>
                        <th className="text-left pb-1 font-medium">Optimal</th>
                        <th className="text-left pb-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {result.match_table.map(row => (
                        <tr key={row.factor}>
                          <td className="py-1 text-slate-600">{row.factor}</td>
                          <td className="py-1 font-medium text-slate-800">{row.current}</td>
                          <td className="py-1 text-slate-500">{row.optimal}</td>
                          <td className={cn('py-1 font-semibold', STATUS_COLOR[row.status])}>
                            {STATUS_DOT[row.status]}{' '}
                            {row.status === 'good' ? 'Good' : row.status === 'warning' ? 'Warning' : 'Critical'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Yield + Profitability */}
              {result.yield_estimate?.average_kg != null && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Yield bars */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                      Yield Forecast
                    </p>
                    {(['best', 'average', 'worst'] as const).map(scenario => {
                      const key = `${scenario}_kg` as 'best_kg' | 'average_kg' | 'worst_kg';
                      const kg = result.yield_estimate[key];
                      const maxKg = result.yield_estimate.best_kg;
                      return (
                        <div key={scenario} className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs text-slate-500 w-14 capitalize">{scenario}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${(kg / maxKg) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 w-16 text-right">{kg} kg</span>
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-slate-400 mt-1">
                      {result.yield_estimate.cycles_per_year}x/yr · {result.yield_estimate.growth_days} days/cycle
                    </p>
                  </div>

                  {/* Profitability */}
                  {result.profitability && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                        Profitability · ₹{result.profitability.market_price_per_kg}/kg
                      </p>
                      {(['best', 'average', 'worst'] as const).map(scenario => {
                        const key = `${scenario}_revenue_inr` as
                          'best_revenue_inr' | 'average_revenue_inr' | 'worst_revenue_inr';
                        return (
                          <div key={scenario} className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500 capitalize">{scenario}</span>
                            <span className="font-semibold text-slate-800">
                              {fmtRs(result.profitability![key])}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Low-score section: suggested regions + alternatives */}
              {result.score < 50 && (
                <div className="bg-red-50 rounded-lg p-4 space-y-3 border border-red-100">
                  {result.suggested_regions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <p className="text-xs font-semibold text-slate-600">
                          {result.crop} performs well in:
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.suggested_regions.map(region => (
                          <span
                            key={region}
                            className="text-[11px] bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600"
                          >
                            {region}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.alternatives.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sprout className="w-3.5 h-3.5 text-green-600" />
                        <p className="text-xs font-semibold text-slate-600">
                          Better alternatives for your conditions:
                        </p>
                      </div>
                      <div className="space-y-1">
                        {result.alternatives.map(alt => (
                          <div key={alt.crop} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-700 w-24">{alt.crop}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${alt.score}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-green-700 w-8 text-right">
                              {alt.score}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CropResultCard;
