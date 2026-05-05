import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Trash2, Droplets, Thermometer, Fish, Leaf, RefreshCw, AlertCircle, Sprout } from 'lucide-react';
import { PretextText } from '../ui/pretext-text';
import { farmAPI, reportAPI } from '../../utils/api';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/EmptyState';

export function FarmManagement() {
  const [farms, setFarms] = useState<any[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<any>(null);
  const [records, setRecords] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddFarm, setShowAddFarm] = useState(false);
  const [showAddReading, setShowAddReading] = useState(false);
  const [newFarm, setNewFarm] = useState({ name: '', location: '', area_sqm: '', system_type: 'aquaponics' });
  const [newReading, setNewReading] = useState({ ph: '', temperature_c: '', dissolved_oxygen_mg_l: '' });

  const loadFarms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await farmAPI.list();
      setFarms(data.farms || []);
      if (data.farms?.length && !selectedFarm) {
        setSelectedFarm(data.farms[0]);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load farms');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async (farmId: string) => {
    setRecordsLoading(true);
    try {
      const { data } = await farmAPI.records(farmId);
      setRecords(data);
    } catch {
      setRecords(null);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => { loadFarms(); }, [loadFarms]);

  useEffect(() => {
    if (selectedFarm?.id) loadRecords(selectedFarm.id);
  }, [selectedFarm?.id, loadRecords]);

  const handleAddFarm = async () => {
    if (!newFarm.name.trim()) return;
    try {
      const { data } = await farmAPI.create({
        name: newFarm.name.trim(),
        location: newFarm.location.trim(),
        area_sqm: newFarm.area_sqm ? parseFloat(newFarm.area_sqm) : null,
        system_type: newFarm.system_type,
      });
      setFarms(prev => [data, ...prev]);
      setSelectedFarm(data);
      setNewFarm({ name: '', location: '', area_sqm: '', system_type: 'aquaponics' });
      setShowAddFarm(false);
    } catch (e: any) {
      setError(e.message || 'Failed to create farm');
    }
  };

  const handleAddReading = async () => {
    if (!selectedFarm) return;
    try {
      await farmAPI.createWaterReading(selectedFarm.id, {
        ph: newReading.ph ? parseFloat(newReading.ph) : null,
        temperature_c: newReading.temperature_c ? parseFloat(newReading.temperature_c) : null,
        dissolved_oxygen_mg_l: newReading.dissolved_oxygen_mg_l ? parseFloat(newReading.dissolved_oxygen_mg_l) : null,
      });
      setNewReading({ ph: '', temperature_c: '', dissolved_oxygen_mg_l: '' });
      setShowAddReading(false);
      loadRecords(selectedFarm.id);
    } catch (e: any) {
      setError(e.message || 'Failed to add reading');
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PretextText text="Farm Records" font={'600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif'} lineHeight={40} className="text-gray-900 mb-2" />
          <PretextText text="Farms auto-created from surveys. Add water readings manually." font={'400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif'} lineHeight={24} className="text-gray-600" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadFarms}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button onClick={() => setShowAddFarm(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" /> Add Farm
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {farms.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="No farms yet"
          description="Add your first farm to start tracking water quality and performance."
          actionLabel="Add Farm"
          onAction={() => setShowAddFarm(true)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Farm list */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-xl hover:border-green-200 hover:shadow-sm transition-all p-6">
              <p className="font-semibold text-gray-900 mb-4">Your Farms</p>
              <div className="space-y-2">
                {farms.map((farm) => (
                  <div
                    key={farm.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedFarm?.id === farm.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedFarm(farm)}
                  >
                    <p className="font-medium text-gray-900">{farm.name}</p>
                    <p className="text-sm text-gray-500">{farm.location || '—'}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {farm.area_sqm && <span>{farm.area_sqm} m²</span>}
                      <span>{farm.system_type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Farm details */}
          <div className="lg:col-span-2 space-y-4">
            {selectedFarm ? (
              <>
                {/* Farm info */}
                <div className="bg-white border border-slate-200 rounded-xl hover:border-green-200 hover:shadow-sm transition-all p-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-sm text-gray-500 mb-1">Location</p><p className="font-medium text-gray-900">{selectedFarm.location || '—'}</p></div>
                    <div><p className="text-sm text-gray-500 mb-1">Area</p><p className="font-medium text-gray-900">{selectedFarm.area_sqm ? `${selectedFarm.area_sqm} m²` : '—'}</p></div>
                    <div><p className="text-sm text-gray-500 mb-1">Type</p><p className="font-medium text-gray-900 capitalize">{selectedFarm.system_type}</p></div>
                  </div>
                </div>

                {recordsLoading ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading records...
                  </div>
                ) : records ? (
                  <>
                    {/* Fish batches from survey */}
                    {records.fish_batches?.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-xl hover:border-green-200 hover:shadow-sm transition-all p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Fish className="w-5 h-5 text-blue-500" />
                          <h3 className="font-semibold text-gray-900">Fish Batches</h3>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">From Survey</span>
                        </div>
                        <div className="space-y-3">
                          {records.fish_batches.map((b: any) => (
                            <div key={b.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                              <div>
                                <p className="font-medium text-gray-900">{b.species}</p>
                                <p className="text-sm text-gray-500">{b.quantity} fish • {b.tank_liters}L tank</p>
                              </div>
                              <div className="text-right text-sm text-gray-500">
                                <p>Start: {b.start_date || '—'}</p>
                                <p>Harvest: {b.expected_harvest_date || '—'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Crop records from survey */}
                    {records.crop_records?.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-xl hover:border-green-200 hover:shadow-sm transition-all p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Leaf className="w-5 h-5 text-emerald-500" />
                          <h3 className="font-semibold text-gray-900">Crops</h3>
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">From Survey</span>
                        </div>
                        <div className="space-y-2">
                          {records.crop_records.map((c: any) => (
                            <div key={c.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                              <p className="font-medium text-gray-900">{c.crop_name}</p>
                              <div className="text-sm text-gray-500">
                                {c.growing_area_sqm && <span>{c.growing_area_sqm} m²</span>}
                                {c.expected_yield_kg && <span className="ml-3">{c.expected_yield_kg} kg/mo</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Water readings */}
                    <div className="bg-white border border-slate-200 rounded-xl hover:border-green-200 hover:shadow-sm transition-all p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Water Quality Readings</h3>
                        <Button onClick={() => setShowAddReading(true)} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                          <Plus className="w-4 h-4 mr-1" /> Add Reading
                        </Button>
                      </div>
                      {records.water_readings?.length > 0 ? (
                        <div className="space-y-3">
                          {records.water_readings.map((r: any) => (
                            <div key={r.id} className="p-4 border border-gray-200 rounded-lg">
                              <p className="text-xs text-gray-400 mb-3">{new Date(r.timestamp).toLocaleString()}</p>
                              <div className="grid grid-cols-3 gap-4">
                                {r.ph !== null && (
                                  <div className="flex items-center gap-2">
                                    <Droplets className="w-4 h-4 text-cyan-600" />
                                    <div><p className="text-xs text-gray-500">pH</p><p className="font-medium text-gray-900">{Number(r.ph).toFixed(2)}</p></div>
                                  </div>
                                )}
                                {r.temperature_c !== null && (
                                  <div className="flex items-center gap-2">
                                    <Thermometer className="w-4 h-4 text-orange-500" />
                                    <div><p className="text-xs text-gray-500">Temp</p><p className="font-medium text-gray-900">{r.temperature_c}°C</p></div>
                                  </div>
                                )}
                                {r.dissolved_oxygen_mg_l !== null && (
                                  <div className="flex items-center gap-2">
                                    <Droplets className="w-4 h-4 text-blue-500" />
                                    <div><p className="text-xs text-gray-500">DO</p><p className="font-medium text-gray-900">{r.dissolved_oxygen_mg_l} mg/L</p></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-gray-400 py-6">No water readings yet</p>
                      )}
                    </div>

                    {/* Download report */}
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const { data } = await reportAPI.history();
                            const match = data.reports?.find((r: any) => r.farm_id === selectedFarm.id);
                            if (match) await reportAPI.download(match.session_id, `${selectedFarm.name}-report.pdf`);
                            else alert('No completed report found for this farm yet.');
                          } catch { alert('Could not fetch report.'); }
                        }}
                      >
                        Download Latest Report
                      </Button>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                Select a farm to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Farm Modal */}
      {showAddFarm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Add New Farm</h3>
            <div className="space-y-4">
              <div><Label>Farm Name *</Label><Input value={newFarm.name} onChange={e => setNewFarm({...newFarm, name: e.target.value})} placeholder="e.g. Green Valley Aquaponics" /></div>
              <div><Label>Location</Label><Input value={newFarm.location} onChange={e => setNewFarm({...newFarm, location: e.target.value})} placeholder="e.g. Pune, Maharashtra" /></div>
              <div><Label>Area (m²)</Label><Input type="number" value={newFarm.area_sqm} onChange={e => setNewFarm({...newFarm, area_sqm: e.target.value})} placeholder="e.g. 100" /></div>
              <div className="flex gap-2">
                <Button onClick={handleAddFarm} className="flex-1 bg-emerald-600 hover:bg-emerald-700">Add Farm</Button>
                <Button onClick={() => setShowAddFarm(false)} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Reading Modal */}
      {showAddReading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Add Water Reading</h3>
            <div className="space-y-4">
              <div><Label>pH Level</Label><Input type="number" step="0.01" value={newReading.ph} onChange={e => setNewReading({...newReading, ph: e.target.value})} placeholder="e.g. 7.2" /></div>
              <div><Label>Temperature (°C)</Label><Input type="number" step="0.1" value={newReading.temperature_c} onChange={e => setNewReading({...newReading, temperature_c: e.target.value})} placeholder="e.g. 24.5" /></div>
              <div><Label>Dissolved Oxygen (mg/L)</Label><Input type="number" step="0.1" value={newReading.dissolved_oxygen_mg_l} onChange={e => setNewReading({...newReading, dissolved_oxygen_mg_l: e.target.value})} placeholder="e.g. 6.8" /></div>
              <div className="flex gap-2">
                <Button onClick={handleAddReading} className="flex-1 bg-cyan-600 hover:bg-cyan-700">Save Reading</Button>
                <Button onClick={() => setShowAddReading(false)} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
