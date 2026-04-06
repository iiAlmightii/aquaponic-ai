import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Mic2, BarChart3, Leaf, FileText,
  LogOut, Fish, Bell, Settings, Sun, Moon, Search, Wheat, ChevronRight
} from 'lucide-react'
import { useStore } from '../store'
import ToastContainer from './ui/ToastContainer'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Overview', section: 'Plan' },
  { to: '/survey', icon: Mic2, label: 'AI Survey', section: 'Plan' },
  { to: '/land-survey', icon: Wheat, label: 'Land Voice Survey', section: 'Plan' },
  { to: '/analysis', icon: BarChart3, label: 'Financial Analysis', section: 'Plan' },
  { to: '/farm', icon: Leaf, label: 'Farm Records', section: 'Operations' },
  { to: '/reports', icon: FileText, label: 'Reports', section: 'Operations' },
]

const PAGE_TITLES = {
  '/dashboard': 'Farm Command Center',
  '/survey': 'AI Guided Survey',
  '/land-survey': 'Land Voice Survey',
  '/analysis': 'Performance Analysis',
  '/farm': 'Farm Operations',
  '/reports': 'Reporting Studio',
}

export default function AppShell() {
  const [theme, setTheme] = useState('light')
  const { user, logout } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => { logout(); navigate('/login') }

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light'
    setTheme(saved)
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const currentTitle = PAGE_TITLES[location.pathname] || 'AquaponicAI Workspace'
  const isLightTheme = theme === 'light'

  return (
    <div className="min-h-screen bg-orchard">
      <header className="sticky top-0 z-30 border-b border-slate-300/65 bg-white/92 backdrop-blur-md">
        <div className="mx-auto max-w-[1380px] px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5"
          >
            <div className="w-9 h-9 rounded-xl bg-[#e8f4ec] border border-[#bcdcc6] flex items-center justify-center">
              <Fish size={17} className="text-[#137149]" />
            </div>
            <div className="text-left">
              <p className="font-display text-[1.15rem] leading-none text-[#114b36]">AquaponicAI</p>
              <p className="text-[11px] text-slate-500">Farm management platform</p>
            </div>
          </button>

          <nav className="hidden lg:flex items-center gap-1.5">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-[#11563c] bg-[#e8f4ec] border border-[#cce3d4]'
                      : 'text-slate-700 hover:text-[#14573e] hover:bg-[#f2f7f3]'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <div className="hidden xl:flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-300/80 bg-white min-w-[280px] text-slate-500">
              <Search size={14} />
              <input
                aria-label="Search"
                placeholder="Search fields, batches, reports"
                className="bg-transparent text-sm placeholder:text-slate-400 outline-none w-full text-slate-700"
              />
            </div>
            <button
              onClick={toggleTheme}
              className="h-10 px-3 rounded-xl border border-slate-300/80 bg-white text-slate-600 hover:text-[#14573e] transition-colors flex items-center gap-1.5"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span className="text-xs font-semibold tracking-wide uppercase">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button className="w-10 h-10 rounded-xl border border-slate-300/80 bg-white flex items-center justify-center text-slate-600 hover:text-[#14573e] transition-colors">
              <Bell size={16} />
            </button>
            <button className="w-10 h-10 rounded-xl border border-slate-300/80 bg-white flex items-center justify-center text-slate-600 hover:text-[#14573e] transition-colors">
              <Settings size={16} />
            </button>
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-300/80 bg-white text-slate-700 hover:text-red-600 transition-colors"
            >
              <LogOut size={15} />
              <span className="text-sm">Sign out</span>
            </button>
            <div className="w-10 h-10 rounded-xl bg-[#e8f4ec] border border-[#bcdcc6] flex items-center justify-center text-[#137149] font-semibold">
              {user?.full_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-4 lg:px-8 py-6 lg:py-8">
        <section className="mb-5 rounded-2xl border border-slate-300/70 bg-white px-5 lg:px-6 py-4 lg:py-5 shadow-[0_12px_30px_rgba(15,38,28,0.07)]">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Operations Workspace</p>
              <h1 className="font-display text-[2rem] leading-tight text-[#21352c]">{currentTitle}</h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden md:inline">Active Workspace:</span>
              <span className="font-semibold text-[#14573e]">Green Ridge Pilot Farm</span>
              <ChevronRight size={15} className="text-slate-400" />
              <span className="text-slate-500">Cycle #4 live</span>
            </div>
          </div>
        </section>

        <Outlet />
      </main>

      <ToastContainer />
    </div>
  )
}
