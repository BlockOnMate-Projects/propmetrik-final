'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requestMagicLink, requestOTP, verifyOTP, verifyMagicLink } from '@/lib/api';

type AuthMethod = 'email' | 'phone';
type AuthStep = 'input' | 'verify' | 'magic-sent';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [method, setMethod] = useState<AuthMethod>('phone');
  const [step, setStep] = useState<AuthStep>('input');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Check for magic link token in URL
  const token = searchParams.get('token');

  // Handle magic link verification on mount
  useState(() => {
    if (token) {
      verifyMagicLinkToken(token);
    }
  });

  async function verifyMagicLinkToken(token: string) {
    setLoading(true);
    try {
      const result = await verifyMagicLink(token);
      if (result.success) {
        router.push('/dashboard');
      } else {
        setError(result.error || 'Invalid or expired link');
      }
    } catch (err) {
      setError('Failed to verify link');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitIdentifier(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (method === 'email') {
        const result = await requestMagicLink(identifier);
        if (result.success) {
          setStep('magic-sent');
          setMessage('Check your email for the login link');
        } else {
          setError('Failed to send magic link');
        }
      } else {
        const result = await requestOTP(identifier, 'sms');
        if (result.success) {
          setStep('verify');
          setMessage('Enter the OTP sent to your phone');
        } else {
          setError('Failed to send OTP');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await verifyOTP(identifier, otp, 'sms');
      if (result.success) {
        router.push('/dashboard');
      } else {
        setError(result.error || 'Invalid OTP');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Verifying your login link...</p>
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
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tenant Portal</h1>
          <p className="text-gray-600 mt-2">Sign in to manage your tenancy</p>
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

          {step === 'input' && (
            <>
              {/* Method Selector */}
              <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMethod('phone');
                    setIdentifier('');
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${method === 'phone'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Phone (OTP)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMethod('email');
                    setIdentifier('');
                  }}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${method === 'email'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Email (Magic Link)
                </button>
              </div>

              <form onSubmit={handleSubmitIdentifier}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {method === 'phone' ? 'Phone Number' : 'Email Address'}
                  </label>
                  {method === 'phone' ? (
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500">
                        +233
                      </span>
                      <input
                        type="tel"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="244123456"
                        required
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  ) : (
                    <input
                      type="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !identifier}
                  className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </span>
                  ) : method === 'phone' ? (
                    'Send OTP'
                  ) : (
                    'Send Magic Link'
                  )}
                </button>
              </form>
            </>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyOTP}>
              <p className="text-gray-600 mb-4 text-center">
                Enter the 6-digit code sent to<br />
                <span className="font-medium text-gray-900">+233 {identifier}</span>
              </p>

              <div className="mb-6">
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  maxLength={6}
                  className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  'Verify & Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('input');
                  setOtp('');
                }}
                className="w-full mt-4 text-sm text-blue-600 hover:underline"
              >
                ← Use a different number
              </button>
            </form>
          )}

          {step === 'magic-sent' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Check Your Email</h3>
              <p className="text-gray-600 mb-4">
                We sent a login link to<br />
                <span className="font-medium text-gray-900">{identifier}</span>
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Click the link in the email to sign in. The link expires in 15 minutes.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('input');
                  setIdentifier('');
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                ← Use a different email
              </button>
            </div>
          )}
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
