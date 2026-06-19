import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../../store';
import { cn } from './utils';
import { Skeleton } from './skeleton';

interface FarmSelectorProps {
  className?: string;
}

export function FarmSelector({ className }: FarmSelectorProps) {
  const farms = useStore((s: any) => s.farms);
  const selectedFarmId = useStore((s: any) => s.selectedFarmId);
  const selectFarm = useStore((s: any) => s.selectFarm);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedFarm = farms.find((f: any) => f.id === selectedFarmId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (farms.length === 0) {
    return <Skeleton className={cn('h-8 w-32 rounded-full', className)} />;
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {selectedFarm ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="max-w-[140px] truncate">{selectedFarm.name}</span>
          </>
        ) : (
          <>
            <Sprout className="w-3.5 h-3.5 text-slate-400" />
            <span>All Farms</span>
          </>
        )}
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden"
          >
            <div className="py-1">
              <button
                onClick={() => { selectFarm(null); setOpen(false); }}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm transition-colors',
                  !selectedFarmId
                    ? 'bg-green-50 text-green-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                All Farms
              </button>
              {farms.map((farm: any) => (
                <button
                  key={farm.id}
                  onClick={() => { selectFarm(farm.id); setOpen(false); }}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2',
                    selectedFarmId === farm.id
                      ? 'bg-green-50 text-green-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    selectedFarmId === farm.id ? 'bg-green-500' : 'bg-slate-300'
                  )} />
                  <span className="truncate">{farm.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
