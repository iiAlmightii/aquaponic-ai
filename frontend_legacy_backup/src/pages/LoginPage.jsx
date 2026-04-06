/**
 * pages/LoginPage.jsx + RegisterPage.jsx — Auth screens with animated design.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Fish, Eye, EyeOff, Loader2, Sun, Moon } from 'lucide-react'
import { useStore } from '../store'

function AuthLayout({ children, title, subtitle }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return localStorage.getItem('theme') || 'light'
  })

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <div className="min-h-screen bg-forest-950 bg-grid flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-forest-700/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-forest-600/8 rounded-full blur-3xl" />
      </div>

      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 h-10 px-3 rounded-xl glass-sm flex items-center gap-2 text-slate-300 hover:text-forest-300 transition-colors z-20"
        title="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        <span className="text-xs font-semibold uppercase tracking-wide">{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 relative z-10 animate-slide-up overflow-hidden rounded-3xl border border-forest-700/30 shadow-2xl shadow-forest-900/30">
        <div className="hidden lg:flex flex-col justify-between p-10 bg-forest-900/75 border-r border-forest-700/30">
          <div>
            <div className="w-14 h-14 rounded-2xl bg-forest-500/15 border border-forest-400/25 flex items-center justify-center mb-6 glow-green">
              <Fish size={26} className="text-forest-400" />
            </div>
            <h3 className="font-display text-4xl text-slate-100 leading-tight">Farm operations cockpit for aquaponic teams.</h3>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">Unified planning, AI-guided surveys, and financial reporting for daily farm decisions.</p>
          </div>
          <div className="space-y-2 text-sm text-slate-400">
            <p>• Adaptive survey workflows</p>
            <p>• Financial scenario modeling</p>
            <p>• Operational logs and exports</p>
          </div>
        </div>

        <div className="p-6 lg:p-10 bg-forest-950/70">
          <div className="lg:hidden text-center mb-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-forest-500/15 border border-forest-400/25 flex items-center justify-center mb-4 glow-green">
              <Fish size={26} className="text-forest-400" />
            </div>
          </div>

          <div className="text-center lg:text-left mb-6">
            <h1 className="font-display text-3xl font-bold text-slate-100">{title}</h1>
            <p className="text-slate-400 text-sm mt-2">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────
export function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const { login } = useStore()
  const navigate  = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message ?? 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your AquaponicAI account">
      <form onSubmit={handleSubmit} className="panel space-y-4">
        <div className="space-y-1.5">
          <label className="label-sm">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@farm.com" className="input-field" />
        </div>

        <div className="space-y-1.5">
          <label className="label-sm">Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="input-field pr-11" />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
          {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
        </button>

        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/register" className="text-forest-400 hover:text-forest-300 font-medium">Create one free</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export default LoginPage

// ── Register ──────────────────────────────────────────────────────────────────
export function RegisterPage() {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const { register } = useStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await register(email, name, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message ?? 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Get started" subtitle="Create your free AquaponicAI account">
      <form onSubmit={handleSubmit} className="panel space-y-4">
        <div className="space-y-1.5">
          <label className="label-sm">Full Name</label>
          <input type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder="Priya Sharma" className="input-field" />
        </div>
        <div className="space-y-1.5">
          <label className="label-sm">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@farm.com" className="input-field" />
        </div>
        <div className="space-y-1.5">
          <label className="label-sm">Password</label>
          <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters" className="input-field" />
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
          {loading ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : 'Create Account'}
        </button>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-forest-400 hover:text-forest-300 font-medium">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
