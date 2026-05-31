import { cn } from './utils';

export type ScenarioKey = 'base' | 'pessimistic' | 'optimistic';

interface ScenarioSelectorProps {
  value: ScenarioKey;
  onChange: (v: ScenarioKey) => void;
}

const OPTIONS: { key: ScenarioKey; label: string }[] = [
  { key: 'pessimistic', label: 'Pessimistic −25%' },
  { key: 'base', label: 'Base' },
  { key: 'optimistic', label: 'Optimistic +30%' },
];

export function ScenarioSelector({ value, onChange }: ScenarioSelectorProps) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === opt.key
              ? 'bg-green-600 text-white'
              : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
