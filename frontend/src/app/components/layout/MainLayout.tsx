import { ReactNode, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Sprout,
  FileText,
  Bot,
  LogOut,
  Menu,
  Leaf,
  MoreHorizontal,
} from 'lucide-react';

type View = 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor';

interface MainLayoutProps {
  children: ReactNode;
  user: any;
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
}

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
      { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'FARMING',
    items: [
      { id: 'surveys', name: 'Surveys', icon: ClipboardList },
      { id: 'farms', name: 'Farms', icon: Sprout },
      { id: 'reports', name: 'Reports', icon: FileText },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { id: 'ai-advisor', name: 'AI Advisor', icon: Bot },
    ],
  },
];

// Bottom nav shows 5 most important items on mobile
const MOBILE_NAV = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { id: 'surveys', name: 'Surveys', icon: ClipboardList },
  { id: 'analytics', name: 'Analytics', icon: BarChart3 },
  { id: 'ai-advisor', name: 'AI', icon: Bot },
  { id: 'farms', name: 'More', icon: MoreHorizontal },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  surveys: 'Surveys',
  'ai-survey': 'Aquaponic Survey',
  'land-survey': 'Land Survey',
  farms: 'Farms',
  reports: 'Reports',
  analytics: 'Analytics',
  'ai-advisor': 'AI Advisor',
};

export function MainLayout({ children, user, currentView, onNavigate, onLogout }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NavItem = ({ id, name, Icon }: { id: string; name: string; Icon: any }) => {
    const active = currentView === id || (id === 'surveys' && ['ai-survey', 'land-survey'].includes(currentView));
    return (
      <button
        onClick={() => { onNavigate(id as View); setMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
          active
            ? 'bg-green-50 text-green-800 font-semibold'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {name}
      </button>
    );
  };

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
        <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Leaf className="w-4 h-4 text-white" />
        </div>
        <span className="font-extrabold text-slate-900 tracking-tight">
          Agri<span className="text-green-600">Sense</span>
        </span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ id, name, icon: Icon }) => (
                <NavItem key={id} id={id} name={name} Icon={Icon} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User chip */}
      <div className="px-2.5 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {(user?.name || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{user?.name || 'User'}</p>
            <p className="text-[10px] text-slate-400 truncate">{user?.email || ''}</p>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[220px] flex-shrink-0 flex-col fixed h-full z-20">
        <Sidebar />
      </div>

      {/* Mobile slide-in menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-[220px] flex flex-col">
            <Sidebar />
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 md:ml-[220px] flex flex-col h-screen overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold text-slate-900">{PAGE_TITLES[currentView] ?? currentView}</h1>
          </div>
        </header>

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-30">
        {MOBILE_NAV.map(({ id, name, icon: Icon }) => {
          const active = currentView === id || (id === 'surveys' && ['ai-survey', 'land-survey'].includes(currentView));
          return (
            <button
              key={id}
              onClick={() => onNavigate(id as View)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-green-700' : 'text-slate-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-green-600' : ''}`} />
              {name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
