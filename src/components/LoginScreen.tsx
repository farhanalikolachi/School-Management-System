import React, { useState } from 'react';
import { Eye, EyeOff, Lock, KeyRound, ArrowLeft, ShieldCheck } from 'lucide-react';
import { apiRequest, setAuthTokens } from '../lib/api';
import { detectRoleFromIdentifier } from '../lib/domain';
import { useToast } from './UiPrimitives';

export interface LoggedInUser {
  id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  avatarUrl?: string | null;
  mustChangePassword: boolean;
}

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: LoggedInUser) => void;
}) {
  const { notify } = useToast();
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetHint, setResetHint] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const detectedPortal = detectRoleFromIdentifier(identifier);

  const performLogin = async (loginIdentifier: string, loginPassword: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ user: LoggedInUser; sessionToken: string; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword }),
      });
      setAuthTokens(res.sessionToken, res.csrfToken);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(identifier, password);
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string; resetCodePreview?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setResetHint(res.resetCodePreview ? `Verification code: ${res.resetCodePreview}` : '');
      notify(res.message, 'info');
      setMode('reset');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ identifier, resetCode, newPassword }),
      });
      notify('Password reset successful. Sign in with your new password.', 'success');
      setMode('login');
      setPassword('');
      setNewPassword('');
      setResetCode('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-stretch">
      {/* Left Architectural Campus Panel */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-[#0F2942]">
        <img
          src="/src/assets/images/campus_login_hero_1794654887782.jpg"
          alt="SindhTech Institute modern campus"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#081626]/95 via-[#0F2942]/75 to-[#0F2942]/45" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3.5">
            <img
              src="/src/assets/images/institute_crest_1794654889307.jpg"
              alt="SindhTech Institute Crest"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover bg-white p-0.5 shadow-md"
            />
            <div>
              <div className="font-display font-bold text-xl tracking-tight">SindhTech Institute</div>
              <div className="text-xs text-slate-300">Academy &amp; Professional Training Center · Pakistan</div>
            </div>
          </div>

          <div className="max-w-lg space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Administered by Wajid Ali Kolachi · Pakistan
              </div>
              <h1 className="font-display text-3xl xl:text-4xl font-bold leading-tight text-balance">
                Unified Academy, Attendance, Fee &amp; Course Operations
              </h1>
              <p className="text-sm xl:text-base text-slate-200 leading-relaxed">
                Manage Academy Classes (Nursery through Class 12 — full Classes 6th–12th Science, ICS &amp; Matric tracks) alongside dynamic technical skill programs such as Video Editing from one role-secured workspace.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/15 text-xs">
              <div className="bg-white/8 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
                <div className="font-display font-bold text-lg text-white tabular-nums">Nursery–12</div>
                <div className="text-slate-300 mt-0.5">Classes 6th–12th &amp; Wing</div>
              </div>
              <div className="bg-white/8 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
                <div className="font-display font-bold text-lg text-white tabular-nums">3 Portals</div>
                <div className="text-slate-300 mt-0.5">Admin · Teacher · Student</div>
              </div>
              <div className="bg-white/8 backdrop-blur-xs rounded-xl p-3.5 border border-white/10">
                <div className="font-display font-bold text-lg text-white">Verified</div>
                <div className="text-slate-300 mt-0.5">QR ID &amp; PDF Ledgers</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg shadow-slate-900/5 p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 lg:hidden pb-2 border-b border-slate-100 dark:border-slate-800">
            <img
              src="/src/assets/images/institute_crest_1794654889307.jpg"
              alt="SindhTech Institute Crest"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-cover border border-slate-200"
            />
            <div>
              <div className="font-display font-bold text-lg text-slate-900 dark:text-white">SindhTech Institute</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Management Portal</div>
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {mode === 'login' ? 'Sign in to your portal' : mode === 'forgot' ? 'Recover account access' : 'Set a new password'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {mode === 'login'
                ? 'Enter your prefixed Login ID or email. Your portal is detected automatically.'
                : mode === 'forgot'
                  ? 'Enter your Login ID or email to generate a reset verification code.'
                  : 'Enter the verification code and choose a strong password.'}
            </p>
          </div>

          {error && (
            <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="login-identifier" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Login ID or Email
                  </label>
                  {detectedPortal && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0F2942] dark:text-blue-400">
                      Detected: {detectedPortal} Portal
                    </span>
                  )}
                </div>
                <input
                  id="login-identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                  }}
                  placeholder="e.g. ADMINID01, TEACHERID1001, STUDENTIDSTI1001, or Email"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F2942] dark:focus:ring-blue-500 transition-colors"
                />
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                  Prefixes: STUDENTID... (Student) · TEACHERID... (Teacher) · ADMINID... / Email (Admin)
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('forgot');
                    }}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F2942] dark:focus:ring-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-60"
              >
                <Lock className="w-4 h-4" />
                {loading
                  ? 'Signing in...'
                  : detectedPortal
                    ? `Sign In to ${detectedPortal.charAt(0).toUpperCase() + detectedPortal.slice(1)} Portal`
                    : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div>
                <label htmlFor="forgot-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Username or Email
                </label>
                <input
                  id="forgot-id"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F2942] text-white text-sm font-medium hover:bg-[#163A5C]"
              >
                {loading ? 'Generating code...' : 'Generate Reset Code'}
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              {resetHint && (
                <div className="px-3.5 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 font-mono-tabular">
                  {resetHint}
                </div>
              )}
              <div>
                <label htmlFor="reset-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Verification Code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono-tabular uppercase"
                />
              </div>
              <div>
                <label htmlFor="reset-new-pass" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  New Password
                </label>
                <input
                  id="reset-new-pass"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, uppercase, lowercase & digit"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#0F2942] text-white text-sm font-medium hover:bg-[#163A5C]"
              >
                <KeyRound className="w-4 h-4" />
                {loading ? 'Updating...' : 'Reset Password'}
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function MandatoryPasswordChangeScreen({
  user,
  onCompleted,
  onLogout,
}: {
  user: LoggedInUser;
  onCompleted: () => void;
  onLogout: () => void;
}) {
  const { notify } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      notify('Password updated. Welcome to SindhTech Institute.', 'success');
      onCompleted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 space-y-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              First-Login Password Update Required
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Account: {user.username} · Role: {user.role}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          For security, replace your temporary credential password with a personal password before accessing your {user.role} dashboard.
        </p>

        {error && (
          <div role="alert" className="px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tmp-pwd" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Temporary / Current Password
            </label>
            <input
              id="tmp-pwd"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>
          <div>
            <label htmlFor="new-pwd" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              New Password
            </label>
            <input
              id="new-pwd"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, uppercase, lowercase & number"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cnf-pwd" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirm New Password
            </label>
            <input
              id="cnf-pwd"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2 gap-3">
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Updating...' : 'Update Password & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
