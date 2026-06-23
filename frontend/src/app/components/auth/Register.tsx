import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Leaf } from 'lucide-react';
import { useStore } from '../../store';
import { LangCode, createT } from '../../utils/i18n';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export function Register({ onSwitchToLogin }: RegisterProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const register = useStore((state: any) => state.register);
  const lang: LangCode = (useStore((s: any) => s.globalLanguage) || 'en') as LangCode;
  const tr = createT(lang);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError(tr('passwords_no_match'));
      setIsLoading(false);
      return;
    }

    try {
      await register(email, name, password);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Logo and Header */}
          <div className="text-center space-y-3">
            <div className="flex items-center gap-2.5 justify-center mb-2">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <Leaf className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                Agri<span className="text-green-600">Sense</span>
              </span>
            </div>
            <h1 className="text-gray-900">{tr('create_account')}</h1>
            <p className="text-muted-foreground">
              {tr('login_subtitle')}
            </p>
          </div>

          {/* Register Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tr('full_name')}</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{tr('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{tr('password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{tr('confirm_password')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={isLoading}
            >
              {isLoading ? tr('creating_account') : tr('create_account')}
            </Button>
          </form>

          {/* Login Link */}
          <div className="text-center text-sm">
            <span className="text-muted-foreground">{tr('already_account')} </span>
            <button
              onClick={onSwitchToLogin}
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {tr('sign_in')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
