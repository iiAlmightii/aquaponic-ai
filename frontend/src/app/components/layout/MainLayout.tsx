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
  Globe,
  Shield,
  LucideIcon,
} from 'lucide-react';
import { useStore } from '../../store';
import { SUPPORTED_LANGUAGES, LangCode, t, createT } from '../../utils/i18n';
import { FloatingAdvisor } from '../ai/FloatingAdvisor';

type View = 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor' | 'crop-feasibility' | 'admin-panel';

interface MainLayoutProps {
  children: ReactNode;
  user: any;
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
}

const NAV_GROUP_DEFS = [
  {
    labelKey: 'nav_group_overview',
    items: [
      { id: 'dashboard',  nameKey: 'nav_dashboard',  icon: LayoutDashboard },
      { id: 'analytics',  nameKey: 'nav_analytics',  icon: BarChart3 },
    ],
  },
  {
    labelKey: 'nav_group_farming',
    items: [
      { id: 'surveys',    nameKey: 'nav_surveys',    icon: ClipboardList },
      { id: 'farms',      nameKey: 'nav_farms',      icon: Sprout },
      { id: 'reports',    nameKey: 'nav_reports',    icon: FileText },
    ],
  },
  {
    labelKey: 'nav_group_intel',
    items: [
      { id: 'ai-advisor',       nameKey: 'nav_ai_advisor',       icon: Bot },
      { id: 'crop-feasibility', nameKey: 'nav_crop_feasibility', icon: Leaf },
    ],
  },
];

const MOBILE_NAV_DEFS = [
  { id: 'dashboard',  nameKey: 'nav_dashboard', icon: LayoutDashboard },
  { id: 'surveys',    nameKey: 'nav_surveys',   icon: ClipboardList },
  { id: 'analytics',  nameKey: 'nav_analytics', icon: BarChart3 },
  { id: 'ai-advisor', nameKey: 'nav_ai_advisor', icon: Bot },
  { id: 'farms',      nameKey: 'nav_farms',     icon: Sprout },
];

const PAGE_TITLE_KEYS: Record<string, string> = {
  dashboard:    'page_dashboard',
  surveys:      'page_surveys',
  'ai-survey':  'page_ai_survey',
  'land-survey':'page_land_survey',
  farms:        'page_farms',
  reports:      'page_reports',
  analytics:    'page_analytics',
  'ai-advisor':       'page_ai_advisor',
  'crop-feasibility': 'page_crop_feasibility',
  'admin-panel':      'Admin Panel',
};

// Fix 1 & 4: Module-level NavItem with typed LucideIcon prop
interface NavItemProps {
  id: string;
  name: string;
  Icon: LucideIcon;
  currentView: View;
  onNavigate: (view: View) => void;
  setMobileMenuOpen: (open: boolean) => void;
}

function NavItem({ id, name, Icon, currentView, onNavigate, setMobileMenuOpen }: NavItemProps) {
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
}

// Fix 1: Module-level SidebarContent (named to avoid conflict with <aside>)
interface SidebarProps {
  user: any;
  currentView: View;
  onNavigate: (view: View) => void;
  onLogout: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  lang: LangCode;
}

function SidebarContent({ user, currentView, onNavigate, onLogout, setMobileMenuOpen, lang }: SidebarProps) {
  const tr = createT(lang);
  const navGroups = [
    ...NAV_GROUP_DEFS,
    ...(user?.role === 'admin' ? [{
      labelKey: 'Admin',
      items: [
        { id: 'admin-panel', nameKey: 'Admin Panel', icon: Shield },
      ],
    }] : []),
  ];
  return (
    <aside className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
        <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Leaf className="w-4 h-4 text-white" />
        </div>
        <span className="font-extrabold text-slate-900 tracking-tight">
          Farm<span className="text-green-600">Connect</span>
        </span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {navGroups.map((group) => (
          <div key={group.labelKey}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {tr(group.labelKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ id, nameKey, icon: Icon }) => (
                <NavItem
                  key={id}
                  id={id}
                  name={tr(nameKey)}
                  Icon={Icon}
                  currentView={currentView}
                  onNavigate={onNavigate}
                  setMobileMenuOpen={setMobileMenuOpen}
                />
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
          {/* Fix 2: aria-label on logout button */}
          <button onClick={onLogout} aria-label="Log out" className="text-slate-400 hover:text-slate-600 transition-colors">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function LanguageSelector() {
  const globalLanguage = useStore((s: any) => s.globalLanguage);
  const setGlobalLanguage = useStore((s: any) => s.setGlobalLanguage);
  const current = SUPPORTED_LANGUAGES.find(l => l.code === globalLanguage) ?? SUPPORTED_LANGUAGES[0];
  return (
    <div className="flex items-center gap-1.5">
      <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <select
        value={globalLanguage}
        onChange={(e) => setGlobalLanguage(e.target.value as LangCode)}
        className="text-sm text-slate-700 bg-transparent border-none outline-none cursor-pointer pr-1 font-medium"
        title="Switch language"
        aria-label="Select language"
      >
        {SUPPORTED_LANGUAGES.map(l => (
          <option key={l.code} value={l.code}>{l.nativeLabel}</option>
        ))}
      </select>
    </div>
  );
}

export function MainLayout({ children, user, currentView, onNavigate, onLogout }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lang: LangCode = (useStore((s: any) => s.globalLanguage) || 'en') as LangCode;
  const tr = createT(lang);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[220px] flex-shrink-0 flex-col fixed h-full z-20">
        <SidebarContent
          user={user}
          currentView={currentView}
          onNavigate={onNavigate}
          onLogout={onLogout}
          setMobileMenuOpen={setMobileMenuOpen}
          lang={lang}
        />
      </div>

      {/* Mobile slide-in menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-[220px] flex flex-col">
            <SidebarContent
              user={user}
              currentView={currentView}
              onNavigate={onNavigate}
              onLogout={onLogout}
              setMobileMenuOpen={setMobileMenuOpen}
              lang={lang}
            />
          </div>
          {/* Fix 3: keyboard dismissal on mobile overlay */}
          <div
            className="flex-1 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setMobileMenuOpen(false)}
            role="button"
            tabIndex={-1}
            aria-label="Close menu"
          />
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
            <h1 className="text-base font-bold text-slate-900">{tr(PAGE_TITLE_KEYS[currentView] ?? currentView)}</h1>
          </div>
          <LanguageSelector />
        </header>

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>

        <FloatingAdvisor onOpenFullPage={() => onNavigate('ai-advisor' as View)} />
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-30">
        {MOBILE_NAV_DEFS.map(({ id, nameKey, icon: Icon }) => {
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
              {tr(nameKey)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
