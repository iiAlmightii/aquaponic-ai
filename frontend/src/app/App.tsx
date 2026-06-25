import { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { Dashboard } from './components/dashboard/Dashboard';
import { AISurvey } from './components/surveys/AISurvey';
import { LandVoiceSurvey } from './components/surveys/LandVoiceSurvey';
import { FarmManagement } from './components/farms/FarmManagement';
import { Reports } from './components/reports/Reports';
import { Analytics } from './components/analytics/Analytics';
import { AIAdvisor } from './components/ai/AIAdvisor';
import { CropFeasibility } from './components/crop/CropFeasibility';
import { SurveysHub } from './components/surveys/SurveysHub';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { MainLayout } from './components/layout/MainLayout';
import { useStore } from './store';

type View = 'login' | 'register' | 'dashboard' | 'surveys' | 'ai-survey' | 'land-survey' | 'farms' | 'reports' | 'analytics' | 'ai-advisor' | 'crop-feasibility' | 'admin-panel';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

function App() {
  const [currentView, setCurrentView] = useState<View>('login');
  
  const isAuth = useStore((state: any) => state.isAuth);
  const user = useStore((state: any) => state.user);
  const fetchMe = useStore((state: any) => state.fetchMe);
  const logout = useStore((state: any) => state.logout);

  // Load user data if authenticated but no user profile is loaded
  useEffect(() => {
    if (isAuth && !user) {
      fetchMe();
    }
  }, [isAuth, user, fetchMe]);

  // Handle routing based on auth state
  useEffect(() => {
    if (isAuth && (currentView === 'login' || currentView === 'register')) {
      setCurrentView('dashboard');
    } else if (!isAuth && currentView !== 'register') {
      setCurrentView('login');
    }
  }, [isAuth]);

  // Auth views
  if (!isAuth) {
    if (currentView === 'register') {
      return <Register onSwitchToLogin={() => setCurrentView('login')} />;
    }
    return <Login onSwitchToRegister={() => setCurrentView('register')} />;
  }

  // Authenticated views
  return (
    <MainLayout
      user={user || { name: 'User', email: '', role: 'farmer' }}
      currentView={currentView}
      onNavigate={setCurrentView}
      onLogout={logout}
    >
      {currentView === 'dashboard' && <Dashboard user={user} onNavigate={setCurrentView} />}
      {currentView === 'surveys' && <SurveysHub onNavigate={setCurrentView} />}
      {currentView === 'ai-survey' && <AISurvey />}
      {currentView === 'land-survey' && <LandVoiceSurvey />}
      {currentView === 'farms' && <FarmManagement />}
      {currentView === 'reports' && <Reports onNavigate={setCurrentView} />}
      {currentView === 'analytics' && <Analytics />}
      {currentView === 'ai-advisor' && <AIAdvisor />}
      {currentView === 'crop-feasibility' && <CropFeasibility onNavigate={setCurrentView} />}
      {currentView === 'admin-panel' && <AdminDashboard onNavigate={setCurrentView} />}
    </MainLayout>
  );
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function AppWithGoogle() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  );
}
