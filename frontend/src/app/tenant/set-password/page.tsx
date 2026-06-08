'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
  Building2,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { verifyMagicLink, completePasswordSetup } from '@/lib/tenant/api';

// The API returns errors as a plain string for handled cases and as
// { code, message } from the global error handler. Always coerce to a string
// so we never hand a raw object to React for rendering.
function toErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tenantEmail, setTenantEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Validate the invite token (without consuming it) and surface the email.
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setError('This setup link is missing its token. Use the link from your invite email.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await verifyMagicLink(token);
        if (cancelled) return;
        if (data.success) {
          setTokenValid(true);
          setTenantEmail(data.tenantEmail || '');
        } else {
          setTokenValid(false);
          setError(toErrorMessage(data.error, 'This setup link is invalid or has expired.'));
        }
      } catch {
        if (!cancelled) {
          setTokenValid(false);
          setError('Could not validate your setup link. Please try again.');
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = await completePasswordSetup(token, password, confirmPassword);
      if (!data.success) {
        setError(toErrorMessage(data.error, 'Could not set your password. The link may have expired.'));
        setSubmitting(false);
        return;
      }

      // Password is now set in Keycloak — sign the tenant straight in.
      const email = tenantEmail;
      const signInResult = await signIn('tenant-credentials', {
        email,
        password,
        redirect: false,
      });
      if (signInResult?.ok) {
        router.replace('/dashboard/tenant');
      } else {
        // Password is set; fall back to the login page if auto sign-in fails.
        router.replace(`/tenant-login?loginHint=${encodeURIComponent(email)}`);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-600/20">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Activate Your Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Create a password to access your tenant portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          {verifying ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm">Validating your invite…</p>
            </div>
          ) : !tokenValid ? (
            <div className="py-2">
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <p className="text-center text-xs text-gray-400">
                Contact your property manager for a new invitation, or{' '}
                <Link href="/tenant-login" className="text-cyan-600 hover:text-cyan-700 font-medium">
                  go to sign in
                </Link>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {tenantEmail && (
                <div className="px-4 py-3 bg-cyan-50 border border-cyan-100 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                  <p className="text-sm text-cyan-700">
                    Setting up the portal for <strong>{tenantEmail}</strong>
                  </p>
                </div>
              )}

              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    autoFocus
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!password || !confirmPassword || submitting}
                className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
                ) : (
                  <>Activate &amp; Sign In <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-300">
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-[10px]">Propmetrik</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TenantSetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
        </div>
      }
    >
      <SetPasswordInner />
    </Suspense>
  );
}
