import { Button } from '../ui/button';
import { TrendingUp, DollarSign, Activity, Droplets, ArrowUp } from 'lucide-react';

interface DashboardProps {
  user: any;
  onNavigate?: (view: string) => void;
}

export function Dashboard({ user, onNavigate }: DashboardProps) {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">
              Farm Command Center
            </p>
            <h1 className="text-gray-900 mb-2">Welcome, {user?.name}</h1>
            <p className="text-gray-600">
              Monitor your farm operations, analyze productivity and manage system health.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onNavigate?.('ai-survey')}
            >
              <ArrowUp className="w-4 h-4 mr-2" />
              Start AI Survey
            </Button>
            <Button variant="outline">Quick Actions</Button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Revenue Potential"
          value="₹191k"
          subtitle="+17% vs last period"
          icon={DollarSign}
        />
        <MetricCard
          title="Operating Profit"
          value="₹34.5k"
          subtitle="+5% vs last period"
          icon={TrendingUp}
        />
        <MetricCard
          title="Service Adoption"
          value="97.8%"
          subtitle="Healthy"
          icon={Activity}
        />
        <MetricCard
          title="Water pH Level"
          value="7.14"
          subtitle="Optimal range"
          icon={Droplets}
        />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-gray-900 mb-4">Dashboard Loading...</h3>
        <p className="text-gray-600">Charts and detailed metrics will appear here.</p>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
}

function MetricCard({ title, value, subtitle, icon: Icon }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="p-2 bg-emerald-50 rounded-lg">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
      </div>
      <div className="mb-2">
        <p className="text-gray-900">{value}</p>
      </div>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
