import { useState } from 'react';
import { Leaf, Mail, KeyRound, Lock, ArrowLeft, CheckCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';

interface ForgotPasswordProps {
  onBack: () => void;
}

type Step = 'email' | 'otp' | 'success';

export function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expiresIn, setExpiresIn] = useState(600);

  const API = (import.meta.env.VITE_API_URL as string) || '/api/v1';

  // Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/password/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to generate OTP');
      if (!data.otp) {
        setError('No account found with that email address.');
        return;
      }
      setGeneratedOtp(data.otp);
      setExpiresIn(data.expires_in_seconds || 600);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm OTP + set new password
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reset failed');
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-8 pt-8 pb-6 text-white text-center">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Leaf className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight">
                Farm<span className="text-green-200">Connect</span>
              </span>
            </div>
            <p className="text-green-100 text-sm">Password Recovery</p>
          </div>

          <div className="px-8 py-7">

            {/* ── Step: Email ─────────────────────────────────────── */}
            {step === 'email' && (
              <>
                <div className="mb-5 text-center">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-7 h-7 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800">Forgot your password?</h2>
                  <p className="text-sm text-slate-500 mt-1">Enter your email to receive a one-time code</p>
                </div>

                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
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

                  {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-lg">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Generating OTP...</>
                    ) : (
                      <><KeyRound className="w-4 h-4" /> Get OTP</>
                    )}
                  </button>
                </form>
              </>
            )}

            {/* ── Step: OTP + New Password ─────────────────────────── */}
            {step === 'otp' && (
              <>
                <div className="mb-5 text-center">
                  <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="w-7 h-7 text-amber-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800">Enter your OTP</h2>
                  <p className="text-sm text-slate-500 mt-1">A one-time code has been generated for <strong>{email}</strong></p>
                </div>

                {/* OTP Display box */}
                {generatedOtp && (
                  <div className="mb-5 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
                    <p className="text-xs text-amber-700 font-medium mb-1">Your OTP (valid 10 min)</p>
                    <p className="text-4xl font-mono font-bold tracking-widest text-amber-800 select-all">
                      {generatedOtp}
                    </p>
                    <p className="text-xs text-amber-600 mt-1.5">Copy this code and paste it below</p>
                  </div>
                )}

                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">OTP Code</label>
                    <input
                      type="text"
                      placeholder="6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      />
                      <button type="button" onClick={() => setShowPassword(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Repeat new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      />
                      <button type="button" onClick={() => setShowConfirm(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    disabled={isLoading || otp.length < 6}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Resetting...</>
                    ) : (
                      <><Lock className="w-4 h-4" /> Reset Password</>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStep('email'); setError(''); setGeneratedOtp(null); }}
                    className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
                  >
                    ← Use a different email
                  </button>
                </form>
              </>
            )}

            {/* ── Step: Success ─────────────────────────────────────── */}
            {step === 'success' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-9 h-9 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800 mb-2">Password Reset!</h2>
                <p className="text-sm text-slate-500 mb-6">
                  Your password has been updated successfully. You can now sign in with your new password.
                </p>
                <button
                  onClick={onBack}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  Go to Sign In
                </button>
              </div>
            )}

            {/* Back link (email & OTP steps) */}
            {step !== 'success' && (
              <div className="mt-5 text-center">
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
