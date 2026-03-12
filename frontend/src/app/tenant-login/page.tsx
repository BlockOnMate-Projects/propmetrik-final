'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Key,
} from 'lucide-react';

export default function TenantLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'magic-link' | 'set-password'>('login');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard/tenant';
  const setupToken = searchParams.get('setup_token');
  const setupEmail = searchParams.get('email');

  // If user has setup_token, go directly to set-password mode
  useEffect(() => {
    if (setupToken && setupEmail) {
      setMode('set-password');
      setEmail(setupEmail);
    }
  }, [setupToken, setupEmail]);

  // If already logged in as tenant, redirect
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.userType === 'tenant') {
      router.replace('/dashboard/tenant');
    }
  }, [status, session, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn('tenant-credentials', {
        email: email.trim(),
        password: password.trim(),
        redirect: false,
      });
      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Invalid email or password' : result.error);
      } else if (result?.ok) {
        router.replace(callbackUrl);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setMagicLinkLoading(true);
    setError('');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/v1/tenant-portal/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMagicLinkSent(true);
      } else {
        setError(data.message || 'Failed to send magic link');
      }
    } catch {
      setError('Failed to send magic link');
    } finally {
      setMagicLinkLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setSettingPassword(true);
    setError('');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/v1/tenant-portal/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: setupToken, email, password: newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Now log them in automatically
        const result = await signIn('tenant-credentials', {
          email,
          password: newPassword,
          redirect: false,
        });
        if (result?.ok) {
          router.replace('/dashboard/tenant');
        } else {
          setMode('login');
          setError('Password set successfully. Please log in.');
        }
      } else {
        setError(data.message || 'Failed to set password');
      }
    } catch {
      setError('Failed to set password');
    } finally {
      setSettingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-600/20">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to manage your tenancy</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" autoFocus
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password" autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={!email.trim() || !password.trim() || loading}
                className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-gray-400">or</span></div>
              </div>
              <button type="button" onClick={() => { setMode('magic-link'); setError(''); }}
                className="w-full py-2.5 bg-gray-50 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 border border-gray-200">
                <Sparkles className="w-4 h-4" /> Sign in with Magic Link
              </button>
            </form>
          )}

          {/* Magic Link Form */}
          {mode === 'magic-link' && !magicLinkSent && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="text-center mb-2">
                <Sparkles className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
                <h3 className="text-base font-semibold text-gray-900">Magic Link</h3>
                <p className="text-xs text-gray-500 mt-1">We&apos;ll email you a secure sign-in link</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" autoFocus
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
              </div>
              <button type="submit" disabled={!email.trim() || magicLinkLoading}
                className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {magicLinkLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Magic Link'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">
                Back to password login
              </button>
            </form>
          )}

          {/* Magic Link Sent */}
          {mode === 'magic-link' && magicLinkSent && (
            <div className="text-center py-4">
              <Mail className="w-10 h-10 text-cyan-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-1">Check your email!</h3>
              <p className="text-sm text-gray-500 mb-4">
                We&apos;ve sent a sign-in link to <strong className="text-gray-700">{email}</strong>
              </p>
              <p className="text-xs text-gray-400 mb-4">The link will expire in 15 minutes.</p>
              <button onClick={() => { setMagicLinkSent(false); setMode('login'); setError(''); }}
                className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                Back to login
              </button>
            </div>
          )}

          {/* Set Password */}
          {mode === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="text-center mb-2">
                <Key className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
                <h3 className="text-base font-semibold text-gray-900">Set Your Password</h3>
                <p className="text-xs text-gray-500 mt-1">Create a password for <strong className="text-gray-700">{email}</strong></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters" autoComplete="new-password"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password" autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
              </div>
              <button type="submit" disabled={!newPassword || !confirmPassword || settingPassword}
                className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {settingPassword ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting Password...</> : 'Set Password & Sign In'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Not a tenant?{' '}
            <Link href="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">
              Staff Login
            </Link>
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 text-gray-300">
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-[10px]">Propmetrik</span>
          </div>
        </div>
      </div>
    </div>
  );
}
