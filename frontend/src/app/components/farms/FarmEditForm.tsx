import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../../store';
import { cn } from '../ui/utils';

interface FarmEditFormProps {
  farmId: string;
  surveyType: 'ai' | 'land';
  onClose: () => void;
  onSaved: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number';
  section: string;
}

const AI_FIELDS: FieldDef[] = [
  { key: 'farm_name',                label: 'Farm Name',                  type: 'text',   section: 'Basic Info' },
  { key: 'farm_location',            label: 'Location',                   type: 'text',   section: 'Basic Info' },
  { key: 'infrastructure_cost',      label: 'Infrastructure Cost (₹)',    type: 'number', section: 'Capital (CAPEX)' },
  { key: 'equipment_cost',           label: 'Equipment Cost (₹)',         type: 'number', section: 'Capital (CAPEX)' },
  { key: 'initial_stock_cost',       label: 'Initial Stock Cost (₹)',     type: 'number', section: 'Capital (CAPEX)' },
  { key: 'monthly_feed_cost',        label: 'Monthly Feed Cost (₹)',      type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_labor_cost',       label: 'Monthly Labor Cost (₹)',     type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_utilities_cost',   label: 'Monthly Utilities (₹)',      type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_maintenance_cost', label: 'Monthly Maintenance (₹)',    type: 'number', section: 'Monthly Costs (OPEX)' },
  { key: 'monthly_fish_revenue',     label: 'Monthly Fish Revenue (₹)',   type: 'number', section: 'Monthly Revenue' },
  { key: 'monthly_crop_revenue',     label: 'Monthly Crop Revenue (₹)',   type: 'number', section: 'Monthly Revenue' },
  { key: 'monthly_other_revenue',    label: 'Monthly Other Revenue (₹)',  type: 'number', section: 'Monthly Revenue' },
];

const LAND_FIELDS: FieldDef[] = [
  { key: 'farm_name',        label: 'Farm Name',            type: 'text',   section: 'Basic Info' },
  { key: 'farm_location',    label: 'Location',             type: 'text',   section: 'Basic Info' },
  { key: 'land_area',        label: 'Land Area (acres)',    type: 'number', section: 'Basic Info' },
  { key: 'total_investment', label: 'Total Investment (₹)', type: 'number', section: 'Capital' },
  { key: 'monthly_revenue',  label: 'Monthly Revenue (₹)', type: 'number', section: 'Revenue' },
  { key: 'monthly_cost',     label: 'Monthly Cost (₹)',    type: 'number', section: 'Costs' },
];

export function FarmEditForm({ farmId, surveyType, onClose, onSaved }: FarmEditFormProps) {
  const analysis = useStore((s: any) => s.analysis);
  const editFarm = useStore((s: any) => s.editFarm);
  const addToast = useStore((s: any) => s.addToast);

  const currentAnswers = analysis?.context_data?.answers ?? analysis?.answers ?? {};
  const fields = surveyType === 'land' ? LAND_FIELDS : AI_FIELDS;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.key] = currentAnswers[f.key] != null ? String(currentAnswers[f.key]) : '';
    }
    return init;
  });

  const [saving, setSaving] = useState(false);

  const sections = [...new Set(fields.map((f) => f.section))];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const answers: Record<string, string | number> = {};
      for (const f of fields) {
        const raw = values[f.key];
        if (raw === '') continue;
        answers[f.key] = f.type === 'number' ? parseFloat(raw) || 0 : raw;
      }
      await editFarm(farmId, answers, surveyType);
      addToast({ type: 'success', message: 'Farm updated. All analytics refreshed.' });
      onSaved();
      onClose();
    } catch (err: any) {
      addToast({ type: 'error', message: err?.message ?? 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit Farm Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">Changes create a new snapshot and refresh all analytics</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {sections.map((section) => (
            <div key={section}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                {section}
              </p>
              <div className="space-y-3">
                {fields.filter((f) => f.section === section).map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder={f.type === 'number' ? '0' : ''}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors',
              saving ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recalculating…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save &amp; Recalculate
              </>
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}
