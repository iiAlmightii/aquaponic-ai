// frontend/src/app/components/crop/CropFeasibility.tsx
import { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Leaf, Search, ChevronRight, Loader2, Sprout } from 'lucide-react';
import { useStore } from '../../store';
import { cropAPI } from '../../utils/api';
import { FarmSelector } from '../ui/FarmSelector';
import { EnvironmentPanel, EnvironmentData } from './EnvironmentPanel';
import { CropResultCard, CropResult } from './CropResultCard';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

type CropMode = 'choose' | 'suggest';
type SeasonTab = 'all' | 'kharif' | 'rabi' | 'perennial';

interface CropListItem {
  name: string;
  category: string;
  season: string;
  difficulty: string;
}

const DIFFICULTY_DOT: Record<string, string> = {
  easy: 'bg-green-400',
  medium: 'bg-amber-400',
  hard: 'bg-red-400',
};

export function CropFeasibility({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const selectedFarmId = useStore((s: any) => s.selectedFarmId);
  const farms = useStore((s: any) => s.farms);
  const selectedFarm = farms.find((f: any) => f.id === selectedFarmId);

  const [cropList, setCropList] = useState<CropListItem[]>([]);
  const [mode, setMode] = useState<CropMode>('choose');
  const [activeTab, setActiveTab] = useState<SeasonTab>('all');
  const [search, setSearch] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [envData, setEnvData] = useState<EnvironmentData | null>(null);
  const [results, setResults] = useState<CropResult[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Load crop list
  useEffect(() => {
    cropAPI.list().then(({ data }: any) => setCropList(data.crops || [])).catch(() => {});
  }, []);

  const filteredCrops = useMemo(() => {
    return cropList.filter(c => {
      const matchTab = activeTab === 'all' || c.season === activeTab;
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [cropList, activeTab, search]);

  const toggleCrop = (name: string) => {
    setSelectedCrops(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const runAnalysis = async () => {
    if (!selectedFarmId) return;
    setAnalyzing(true);
    setError('');
    setResults(null);
    try {
      const { data } = await cropAPI.analyzeFarm({
        farm_id: selectedFarmId,
        crops: mode === 'choose' ? selectedCrops : [],
        soil_type: envData?.soil_type || null,
        soil_ph: envData?.soil_ph || null,
        irrigation_method: envData?.irrigation_method || null,
        water_source: envData?.water_source || null,
        use_current_weather: true,
        temperature_override: envData?.temperature_override ?? null,
        humidity_override: envData?.humidity_override ?? null,
      });
      setResults((data.results || []).sort((a: any, b: any) => b.score - a.score));
    } catch (e: any) {
      setError(e?.message || 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const canAnalyze = !!selectedFarmId && (mode === 'suggest' || selectedCrops.length > 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Crop Feasibility</h1>
            <p className="text-xs text-slate-400 mt-0.5">Analyze crop suitability using live weather and ICAR agronomic data</p>
          </div>
        </div>
        <FarmSelector />
      </div>

      {!selectedFarmId ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <Sprout className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Select a farm to begin</p>
          <p className="text-xs text-slate-400 mt-1">Choose a farm from the dropdown above to load its data</p>
        </div>
      ) : (
        <>
          {/* Farm + Environment */}
          <div className="space-y-3">
            {selectedFarm && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">{selectedFarm.name}</span>
                <span className="text-slate-300">·</span>
                <span>{selectedFarm.system_type}</span>
                {selectedFarm.area_sqm && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{selectedFarm.area_sqm} m²</span>
                  </>
                )}
              </div>
            )}
            <EnvironmentPanel farmId={selectedFarmId} onChange={setEnvData} />
          </div>

          {/* Crop selection */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Crop Selection
              </p>
              <div className="flex rounded-full border border-slate-200 overflow-hidden text-xs">
                {(['choose', 'suggest'] as CropMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={cn('px-3 py-1 font-medium transition-colors capitalize',
                      mode === m ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50')}>
                    {m === 'choose' ? 'Choose crops' : 'Suggest best'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'choose' && (
              <>
                <div className="flex items-center gap-3">
                  {(['all', 'kharif', 'rabi', 'perennial'] as SeasonTab[]).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={cn('text-xs font-medium px-3 py-1 rounded-full capitalize transition-colors',
                        activeTab === tab ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100')}>
                      {tab}
                    </button>
                  ))}
                  <div className="relative ml-auto">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search crops…"
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 w-36" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {filteredCrops.map(crop => (
                    <button key={crop.name} onClick={() => toggleCrop(crop.name)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        selectedCrops.includes(crop.name)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-green-300'
                      )}>
                      <span className={cn('w-2 h-2 rounded-full', DIFFICULTY_DOT[crop.difficulty] || 'bg-slate-300')} />
                      {crop.name}
                    </button>
                  ))}
                </div>

                {selectedCrops.length > 0 && (
                  <p className="text-xs text-slate-500">{selectedCrops.length} crop{selectedCrops.length > 1 ? 's' : ''} selected</p>
                )}
              </>
            )}

            {mode === 'suggest' && (
              <p className="text-xs text-slate-500">
                We'll rank all crops by suitability for your farm's conditions and show the top 5.
              </p>
            )}
          </div>

          {/* Run Analysis button */}
          <button onClick={runAnalysis} disabled={!canAnalyze || analyzing}
            className={cn(
              'w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
              canAnalyze && !analyzing
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}>
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
            ) : (
              <><Leaf className="w-4 h-4" /> Run Feasibility Analysis</>
            )}
          </button>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {analyzing && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-slate-100" />)}
            </div>
          )}

          {results && !analyzing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  {results.filter(r => r.score >= 60).length} of {results.length} crops well-suited for your farm
                </p>
                <button onClick={() => onNavigate?.('analytics')}
                  className="text-xs text-green-600 hover:text-green-700 flex items-center gap-0.5 font-semibold">
                  View Analytics <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {results.map(r => <CropResultCard key={r.crop} result={r} />)}
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
