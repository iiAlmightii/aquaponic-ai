import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Leaf, Globe, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../store';
import { SUPPORTED_LANGUAGES, LangCode } from '../../utils/i18n';

interface LoginProps {
  onSwitchToRegister: () => void;
}

export function Login({ onSwitchToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useStore((state: any) => state.login);
  const googleLogin = useStore((state: any) => state.googleLogin);
  const globalLanguage = useStore((s: any) => s.globalLanguage);
  const setGlobalLanguage = useStore((s: any) => s.setGlobalLanguage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError('');
    try {
      await googleLogin(credentialResponse.credential);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4">

      {/* Language selector */}
      <div className="fixed top-4 right-4 flex items-center gap-1.5 bg-white rounded-lg px-3 py-1.5 shadow-sm border border-slate-200">
        <Globe className="w-3.5 h-3.5 text-slate-400" />
        <select
          value={globalLanguage}
          onChange={(e) => setGlobalLanguage(e.target.value as LangCode)}
          className="text-sm text-slate-700 bg-transparent border-none outline-none cursor-pointer font-medium"
        >
          {SUPPORTED_LANGUAGES.map(l => (
            <option key={l.code} value={l.code}>{l.nativeLabel}</option>
          ))}
        </select>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

          {/* Green header strip */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-8 pt-8 pb-6 text-white text-center">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Leaf className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight">
                Farm<span className="text-green-200">Connect</span>
              </span>
            </div>
            <p className="text-green-100 text-sm">Smart Farm Planning & Management</p>
          </div>

          <div className="px-8 py-7 space-y-5">
            <h2 className="text-xl font-semibold text-slate-800 text-center">Welcome back</h2>

            {/* Google Sign In */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in failed. Please try again.')}
                useOneTap
                theme="outline"
                shape="rectangular"
                size="large"
                text="signin_with"
                width="320"
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">or sign in with email</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all placeholder:text-slate-400 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all placeholder:text-slate-400 disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToRegister}
                className="text-green-600 hover:text-green-700 font-semibold"
              >
                Create account
              </button>
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          By signing in you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
