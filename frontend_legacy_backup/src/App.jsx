/**
 * App.jsx — Root router: public (Login/Register) vs. protected (Dashboard shell).
 */
import { useEffect } from 'react'
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import AppShell     from './components/AppShell'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const QuestionnairePage = lazy(() => import('./pages/QuestionnairePage'))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))
const FarmPage = lazy(() => import('./pages/FarmPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const LandSurveyPage = lazy(() => import('./pages/LandSurveyPage'))

function RequireAuth({ children }) {
  const isAuth = useStore(s => s.isAuth)
  return isAuth ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuth, fetchMe, restoreSurveyState } = useStore()

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      if (!isAuth) return
      try {
        await fetchMe()
        if (!cancelled) {
          await restoreSurveyState()
        }
      } catch {
        // auth errors are handled in store/api layer
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [isAuth, fetchMe, restoreSurveyState])

  const loadingFallback = (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass px-5 py-3 text-sm text-slate-300">Loading workspace...</div>
    </div>
  )

  return (
    <Suspense fallback={loadingFallback}>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/" element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }>
          <Route index             element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"  element={<DashboardPage />} />
          <Route path="survey"     element={<QuestionnairePage />} />
          <Route path="land-survey" element={<LandSurveyPage />} />
          <Route path="analysis"   element={<AnalysisPage />} />
          <Route path="farm"       element={<FarmPage />} />
          <Route path="reports"    element={<ReportsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
