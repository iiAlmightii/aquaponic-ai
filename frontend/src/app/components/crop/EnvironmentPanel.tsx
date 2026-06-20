// frontend/src/app/components/crop/EnvironmentPanel.tsx
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Pencil, Check, Wifi, Database } from 'lucide-react';
import { cropAPI } from '../../utils/api';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

export interface EnvironmentData {
  temperature_c: number | null;
  humidity_pct: number | null;
  rainfall_mm_annual: number | null;
  soil_type: string;
  soil_ph: number | null;
  irrigation_method: string;
  water_source: string;
  use_current_weather: boolean;
  temperature_override: number | null;
  humidity_override: number | null;
}

interface EnvironmentPanelProps {
  farmId: string | null;
  onChange: (env: EnvironmentData) => void;
}

const SOIL_TYPES = ['Loamy', 'Clay', 'Sandy', 'Red Laterite', 'Black Cotton Soil', 'Alluvial', 'Sandy Loam'];
const IRRIGATION = ['Drip', 'Flood', 'Sprinkler', 'Rainfed'];
const WATER_SOURCES = ['Borewell', 'River', 'Canal', 'Rainwater'];

function SourceBadge({ source }: { source: string }) {
  const live = source === 'openweathermap';
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
      live ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
    )}>
      {live ? <Wifi className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
      {live ? 'OpenWeatherMap' : 'IMD Static'}
    </span>
  );
}

function EditableField({
  label, value, unit, onOverride,
}: { label: string; value: number | null; unit: string; onOverride: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
            autoFocus
          />
          <span className="text-xs text-slate-400">{unit}</span>
          <button onClick={() => { onOverride(draft === '' ? null : parseFloat(draft)); setEditing(false); }}
            className="text-green-600 hover:text-green-700">
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-800">
            {value != null ? `${value} ${unit}` : '—'}
          </span>
          <button onClick={() => { setDraft(String(value ?? '')); setEditing(true); }}
            className="text-slate-400 hover:text-slate-600">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function EnvironmentPanel({ farmId, onChange }: EnvironmentPanelProps) {
  const [loading, setLoading] = useState(false);
  const [weatherSource, setWeatherSource] = useState<string>('');
  const [current, setCurrent] = useState<{ temp: number | null; humidity: number | null }>({ temp: null, humidity: null });
  const [longTerm, setLongTerm] = useState<any>(null);
  const [env, setEnv] = useState<EnvironmentData>({
    temperature_c: null, humidity_pct: null, rainfall_mm_annual: null,
    soil_type: '', soil_ph: null, irrigation_method: '', water_source: '',
    use_current_weather: true, temperature_override: null, humidity_override: null,
  });

  useEffect(() => {
    if (!farmId) return;
    setLoading(true);
    cropAPI.weather(farmId)
      .then(({ data }: any) => {
        setWeatherSource(data.current.source);
        setCurrent({ temp: data.current.temperature_c, humidity: data.current.humidity_pct });
        setLongTerm(data.long_term);
        const next: EnvironmentData = {
          temperature_c: data.current.temperature_c,
          humidity_pct: data.current.humidity_pct,
          rainfall_mm_annual: data.long_term?.avg_rainfall_mm_annual ?? null,
          soil_type: '',
          soil_ph: null,
          irrigation_method: '',
          water_source: '',
          use_current_weather: true,
          temperature_override: null,
          humidity_override: null,
        };
        setEnv(next);
        onChange(next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [farmId]);

  const update = (patch: Partial<EnvironmentData>) => {
    const next = { ...env, ...patch };
    setEnv(next);
    onChange(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-slate-200 bg-white p-5 space-y-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Environmental Data
      </p>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current conditions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-slate-600">Current Conditions</p>
              {weatherSource && <SourceBadge source={weatherSource} />}
            </div>
            <EditableField label="Temperature" value={env.temperature_override ?? current.temp}
              unit="°C" onOverride={v => update({ temperature_override: v })} />
            <EditableField label="Humidity" value={env.humidity_override ?? current.humidity}
              unit="%" onOverride={v => update({ humidity_override: v })} />
            {env.rainfall_mm_annual != null && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Annual Rainfall</p>
                <p className="text-sm font-semibold text-slate-800">{env.rainfall_mm_annual} mm</p>
                <p className="text-[10px] text-slate-400">30-year IMD average</p>
              </div>
            )}
          </div>

          {/* Long-term averages */}
          {longTerm && (
            <div className="space-y-2 bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">
                IMD 30-year normals · {longTerm.state}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span>Avg Temp: <b>{longTerm.avg_temp_c}°C</b></span>
                <span>Avg Humidity: <b>{longTerm.avg_humidity_pct}%</b></span>
                <span>Annual Rain: <b>{longTerm.avg_rainfall_mm_annual}mm</b></span>
                <span>Kharif: <b>{longTerm.kharif_start_month}</b></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual inputs */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Soil Type</label>
          <select value={env.soil_type} onChange={e => update({ soil_type: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
            <option value="">Select soil type</option>
            {SOIL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Soil pH</label>
          <input type="number" min={0} max={14} step={0.1}
            value={env.soil_ph ?? ''} onChange={e => update({ soil_ph: e.target.value === '' ? null : parseFloat(e.target.value) })}
            placeholder="e.g. 6.5"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Irrigation Method</label>
          <select value={env.irrigation_method} onChange={e => update({ irrigation_method: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
            <option value="">Select method</option>
            {IRRIGATION.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Water Source</label>
          <select value={env.water_source} onChange={e => update({ water_source: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none">
            <option value="">Select source</option>
            {WATER_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    </motion.div>
  );
}

export default EnvironmentPanel;
