'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  verifyMagicLink,
  exchangeKeycloakCode,
  loginWithEmailPassword,
  getResetPasswordUrl,
  completePasswordSetup
} from '@/lib/api';

const PKCE_VERIFIER_STORAGE_KEY = 'tenant_portal_pkce_verifier';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingSetupLink, setVerifyingSetupLink] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const authCallbackHandledRef = useRef(false);

  // Check for magic link token in URL
  const token = searchParams.get('token');
  const code = searchParams.get('code');
  const loginHint = searchParams.get('loginHint');
  const oidcError = searchParams.get('error');
  const oidcErrorDescription = searchParams.get('error_description');
  const hasAuthCallback = Boolean(code);

  // Handle auth callbacks on mount
  useEffect(() => {
    if (hasAuthCallback) {
      if (authCallbackHandledRef.current) {
        return;
      }
      authCallbackHandledRef.current = true;
    } else {
      authCallbackHandledRef.current = false;
    }

    if (code) {
      verifyKeycloakCode(code);
      return;
    }

    if (token) {
      verifyMagicLinkToken(token);
      return;
    }

    if (oidcError) {
      const details = oidcErrorDescription ? decodeURIComponent(oidcErrorDescription) : null;
      setError(details || oidcError);
    }

    if (loginHint) {
      setEmail(loginHint);
    }
  }, [hasAuthCallback, code, token, loginHint, oidcError, oidcErrorDescription]);

  async function verifyKeycloakCode(authCode: string) {
    setLoading(true);
    setError(null);

    try {
      const redirectUri = `${window.location.origin}/login`;
      const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY) || undefined;
      const result = await exchangeKeycloakCode(authCode, redirectUri, codeVerifier);
      if (result.success) {
        sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
        router.replace('/dashboard');
      } else {
        setError(result.error || 'Failed to complete Keycloak login');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to complete Keycloak login');
    } finally {
      setLoading(false);
    }
  }

  async function verifyMagicLinkToken(token: string) {
    setVerifyingSetupLink(true);
    setSetupMode(false);
    setSetupToken(null);
    setMessage(null);
    setError(null);

    try {
      const result = await verifyMagicLink(token);
      if (result.success && result.setupRequired) {
        setSetupMode(true);
        setSetupToken(token);
        if (result.tenantEmail) {
          setEmail(result.tenantEmail);
        }
        setMessage('Set your password to activate your tenant portal access.');
      } else {
        setError(result.error || 'Invalid or expired setup link');
      }
    } catch (err) {
      setError('Failed to process setup link');
    } finally {
      setVerifyingSetupLink(false);
    }
  }

  async function handleCompleteSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!setupToken) {
      setError('Setup token is missing. Please use the invite link from your email.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      const result = await completePasswordSetup(setupToken, password, confirmPassword);
      if (result.success) {
        router.replace('/dashboard');
      } else {
        setError(result.error || 'Failed to complete account setup');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to complete account setup');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await loginWithEmailPassword(email.trim(), password);
      if (result.success) {
        router.replace('/dashboard');
      } else {
        setError(result.error || 'Invalid email or password');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setLoading(true);

    try {
      const redirectUri = `${window.location.origin}/login`;
      const result = await getResetPasswordUrl(redirectUri, email.trim() || undefined);
      window.location.href = result.url;
    } catch (err: any) {
      setError(err?.message || 'Failed to open password reset');
    } finally {
      setLoading(false);
    }
  }

  if (hasAuthCallback || verifyingSetupLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          {(loading || verifyingSetupLink) ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Verifying your setup link...</p>
            </>
          ) : error ? (
            <div>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => router.push('/login')}
                className="text-blue-600 hover:underline"
              >
                Try logging in again
              </button>
            </div>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Finalizing sign in...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tenant Portal</h1>
          <p className="text-gray-600 mt-2">Sign in with your invited tenant account</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-600 text-sm">{message}</p>
            </div>
          )}

          {setupMode ? (
            <form onSubmit={handleCompleteSetup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Create Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a new password"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Setting up account...' : 'Set Password & Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordLogin}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tenant@email.com"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end mb-6">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          <p className="text-xs text-gray-500 mt-4 text-center">
            Account access is invite-only. If you have not received an invitation, contact your landlord.
          </p>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Having trouble? Contact your property manager for assistance.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
