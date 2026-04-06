import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Trash2, Edit, Droplets, Thermometer } from 'lucide-react';
import { PretextText } from '../ui/pretext-text';

interface Farm {
  id: string;
  name: string;
  location: string;
  size: number;
  type: string;
}

interface WaterReading {
  id: string;
  farmId: string;
  date: string;
  ph: number;
  temperature: number;
  dissolvedOxygen: number;
}

export function FarmManagement() {
  const [farms, setFarms] = useState<Farm[]>([
    {
      id: '1',
      name: 'Green Valley Farm',
      location: 'Pune, Maharashtra',
      size: 5000,
      type: 'Aquaponics',
    },
  ]);

  const [waterReadings, setWaterReadings] = useState<WaterReading[]>([
    {
      id: '1',
      farmId: '1',
      date: '2026-03-27',
      ph: 7.14,
      temperature: 24.5,
      dissolvedOxygen: 6.8,
    },
    {
      id: '2',
      farmId: '1',
      date: '2026-03-26',
      ph: 7.18,
      temperature: 24.2,
      dissolvedOxygen: 6.9,
    },
  ]);

  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(farms[0]);
  const [showAddFarm, setShowAddFarm] = useState(false);
  const [showAddReading, setShowAddReading] = useState(false);

  const [newFarm, setNewFarm] = useState({
    name: '',
    location: '',
    size: '',
    type: 'Aquaponics',
  });

  const [newReading, setNewReading] = useState({
    ph: '',
    temperature: '',
    dissolvedOxygen: '',
  });

  const handleAddFarm = () => {
    const farm: Farm = {
      id: Date.now().toString(),
      name: newFarm.name,
      location: newFarm.location,
      size: parseFloat(newFarm.size),
      type: newFarm.type,
    };
    setFarms([...farms, farm]);
    setNewFarm({ name: '', location: '', size: '', type: 'Aquaponics' });
    setShowAddFarm(false);
  };

  const handleAddReading = () => {
    if (!selectedFarm) return;

    const reading: WaterReading = {
      id: Date.now().toString(),
      farmId: selectedFarm.id,
      date: new Date().toISOString().split('T')[0],
      ph: parseFloat(newReading.ph),
      temperature: parseFloat(newReading.temperature),
      dissolvedOxygen: parseFloat(newReading.dissolvedOxygen),
    };
    setWaterReadings([reading, ...waterReadings]);
    setNewReading({ ph: '', temperature: '', dissolvedOxygen: '' });
    setShowAddReading(false);
  };

  const handleDeleteFarm = (id: string) => {
    setFarms(farms.filter((f) => f.id !== id));
    if (selectedFarm?.id === id) {
      setSelectedFarm(farms[0] || null);
    }
  };

  const handleDeleteReading = (id: string) => {
    setWaterReadings(waterReadings.filter((r) => r.id !== id));
  };

  const farmReadings = waterReadings.filter((r) => r.farmId === selectedFarm?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PretextText
            text="Farm Management"
            font={'600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
            lineHeight={40}
            className="text-gray-900 mb-2"
          />
          <PretextText
            text="Manage your farms and track water quality readings"
            font={'400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
            lineHeight={24}
            className="text-gray-600"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowAddFarm(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Farm
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Farms List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <PretextText
              text="Your Farms"
              font={'600 1.125rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
              lineHeight={28}
              className="text-gray-900 mb-4"
            />
            <div className="space-y-2">
              {farms.map((farm) => (
                <div
                  key={farm.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedFarm?.id === farm.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedFarm(farm)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{farm.name}</p>
                      <p className="text-sm text-gray-600">{farm.location}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFarm(farm.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>{farm.size} sq ft</span>
                    <span>•</span>
                    <span>{farm.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Farm Details & Water Readings */}
        <div className="lg:col-span-2 space-y-6">
          {selectedFarm ? (
            <>
              {/* Farm Info */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <PretextText
                    text={selectedFarm.name}
                    font={'600 1.125rem Inter, "Noto Sans", "Segoe UI", sans-serif'}
                    lineHeight={28}
                    className="text-gray-900"
                  />
                  <Button variant="outline" size="sm">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Location</p>
                    <p className="font-medium text-gray-900">{selectedFarm.location}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Size</p>
                    <p className="font-medium text-gray-900">{selectedFarm.size} sq ft</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Type</p>
                    <p className="font-medium text-gray-900">{selectedFarm.type}</p>
                  </div>
                </div>
              </div>

              {/* Water Readings */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-gray-900">Water Quality Readings</h3>
                  <Button
                    onClick={() => setShowAddReading(true)}
                    size="sm"
                    className="bg-cyan-600 hover:bg-cyan-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Reading
                  </Button>
                </div>

                {farmReadings.length > 0 ? (
                  <div className="space-y-3">
                    {farmReadings.map((reading) => (
                      <div
                        key={reading.id}
                        className="p-4 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-gray-600">
                            {new Date(reading.date).toLocaleDateString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteReading(reading.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="flex items-center gap-2">
                            <Droplets className="w-4 h-4 text-cyan-600" />
                            <div>
                              <p className="text-xs text-gray-600">pH Level</p>
                              <p className="font-medium text-gray-900">
                                {reading.ph.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Thermometer className="w-4 h-4 text-orange-600" />
                            <div>
                              <p className="text-xs text-gray-600">Temperature</p>
                              <p className="font-medium text-gray-900">
                                {reading.temperature}°C
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Droplets className="w-4 h-4 text-blue-600" />
                            <div>
                              <p className="text-xs text-gray-600">Dissolved O₂</p>
                              <p className="font-medium text-gray-900">
                                {reading.dissolvedOxygen} mg/L
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No water readings recorded yet
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <p className="text-gray-500">Select a farm to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Farm Modal */}
      {showAddFarm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-gray-900 mb-4">Add New Farm</h3>
            <div className="space-y-4">
              <div>
                <Label>Farm Name</Label>
                <Input
                  value={newFarm.name}
                  onChange={(e) => setNewFarm({ ...newFarm, name: e.target.value })}
                  placeholder="e.g., Green Valley Farm"
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={newFarm.location}
                  onChange={(e) =>
                    setNewFarm({ ...newFarm, location: e.target.value })
                  }
                  placeholder="e.g., Pune, Maharashtra"
                />
              </div>
              <div>
                <Label>Size (sq ft)</Label>
                <Input
                  type="number"
                  value={newFarm.size}
                  onChange={(e) => setNewFarm({ ...newFarm, size: e.target.value })}
                  placeholder="e.g., 5000"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddFarm} className="flex-1">
                  Add Farm
                </Button>
                <Button
                  onClick={() => setShowAddFarm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Reading Modal */}
      {showAddReading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-gray-900 mb-4">Add Water Reading</h3>
            <div className="space-y-4">
              <div>
                <Label>pH Level</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newReading.ph}
                  onChange={(e) =>
                    setNewReading({ ...newReading, ph: e.target.value })
                  }
                  placeholder="e.g., 7.2"
                />
              </div>
              <div>
                <Label>Temperature (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newReading.temperature}
                  onChange={(e) =>
                    setNewReading({ ...newReading, temperature: e.target.value })
                  }
                  placeholder="e.g., 24.5"
                />
              </div>
              <div>
                <Label>Dissolved Oxygen (mg/L)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newReading.dissolvedOxygen}
                  onChange={(e) =>
                    setNewReading({ ...newReading, dissolvedOxygen: e.target.value })
                  }
                  placeholder="e.g., 6.8"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddReading} className="flex-1">
                  Add Reading
                </Button>
                <Button
                  onClick={() => setShowAddReading(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
