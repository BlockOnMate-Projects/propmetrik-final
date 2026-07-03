'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import {
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

function TenantLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard/tenant';
  // Keycloak appends loginHint on the post-onboarding redirect; pre-fill the email.
  const loginHint = searchParams.get('loginHint') || searchParams.get('email');

  // Staff login lives on the MAIN host — this page runs on the tenant.* subdomain, where
  // the middleware bounces a relative /login back to /tenant-login. Derive the main-host URL
  // env-aware by stripping the 'tenant.' prefix → dev http://localhost:3000/login,
  // prod https://propmetrik.com/login. Prod URL is the SSR fallback before mount.
  const [staffLoginUrl, setStaffLoginUrl] = useState('https://propmetrik.com/login');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setStaffLoginUrl(`${window.location.protocol}//${window.location.host.replace(/^tenant\./, '')}/login`);
    }
  }, []);

  useEffect(() => {
    if (loginHint) setEmail(loginHint);
  }, [loginHint]);

  // Already authenticated as a tenant → go to the portal.
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
    setNotice('');
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

  // Emails a set-password link via the app's own 3-tier mailer (Keycloak SMTP is not
  // configured, so its hosted reset flow can never deliver). The link lands on
  // /tenant/set-password, where the tenant chooses a new password.
  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then click “Set / forgot password”.');
      return;
    }
    setResetLoading(true);
    setError('');
    setNotice('');
    try {
      // Call the bare /api path — next.config rewrites /api/* → backend /api/v1/*.
      // Do NOT prefix NEXT_PUBLIC_API_URL (it is '/api'), which would double to /api/api/… → 404.
      const res = await fetch(`/api/tenant-portal/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON body (e.g. an HTML error page) */ }
      // Error/notice state MUST be a string — assigning an object ({code,message}) crashes React.
      const asText = (v: any, fallback: string): string =>
        typeof v === 'string' ? v : (v && typeof v.message === 'string' ? v.message : fallback);
      if (res.ok && data?.success) {
        setNotice(asText(data?.message, 'If an account exists for that email, a link to set your password has been sent. Check your inbox.'));
      } else {
        setError(asText(data?.error, 'Could not send the password link. Contact your property manager.'));
      }
    } catch {
      setError('Could not send the password link. Contact your property manager.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-600/20">
            <Building2 className="w-7 h-7 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage your tenancy</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-xl border border-gray-100 p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {notice && (
            <div className="mb-4 px-4 py-3 bg-cyan-50 border border-cyan-100 rounded-xl">
              <p className="text-sm text-cyan-700">{notice}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" autoFocus
                  className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password" autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={!email.trim() || !password.trim() || loading}
              className="w-full py-2.5 bg-cyan-600 text-foreground rounded-xl text-sm font-semibold hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>

            <button type="button" onClick={handleResetPassword} disabled={resetLoading}
              className="w-full py-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium flex items-center justify-center gap-2 disabled:text-muted-foreground">
              {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening...</> : 'Set / forgot password'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            First time here? Use “Set / forgot password” to create your password,
            then sign in.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Not a tenant?{' '}
            <a href={staffLoginUrl} className="text-cyan-600 hover:text-cyan-700 font-medium">
              Staff Login
            </a>
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

// useSearchParams() must sit inside a <Suspense> boundary or Next.js 15 fails the production
// build ("should be wrapped in a suspense boundary") when prerendering this route. Wrapping the
// form keeps the page prerenderable while the search-param read stays client-side.
export default function TenantLoginPage() {
  return (
    <Suspense fallback={null}>
      <TenantLoginForm />
    </Suspense>
  );
}
