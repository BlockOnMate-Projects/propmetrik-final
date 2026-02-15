'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
type Status = 'verifying' | 'success' | 'failed';

export default function PaymentCallbackPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('Verifying your payment...');
  const [amount, setAmount] = useState<string | null>(null);
  const verifiedRef = useRef(false);

  const reference = searchParams.get('reference') || searchParams.get('trxref');

  useEffect(() => {
    if (!reference) {
      setStatus('failed');
      setMessage('No payment reference found. Please contact support.');
      return;
    }

    // If we already verified this reference (e.g. page re-rendered), skip and redirect
    const cacheKey = `payment_verified_${reference}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      setStatus('success');
      setAmount(data.amount);
      setMessage('Payment confirmed!');
      setTimeout(() => { window.location.href = '/payments?payment=success'; }, 2000);
      return;
    }

    if (verifiedRef.current) return;
    verifiedRef.current = true;

    // Call verify endpoint directly (no auth required) to avoid expired-JWT issues
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/tenant-portal/payments/verify/${reference}`);
        const result = await res.json();

        if (res.ok && result.success !== false) {
          const paidAmount = result.payment?.amount
            ? `GHS ${Number(result.payment.amount).toLocaleString()}`
            : null;
          setStatus('success');
          setAmount(paidAmount);
          setMessage('Payment confirmed!');

          // Cache so reloads don't re-verify
          sessionStorage.setItem(cacheKey, JSON.stringify({ amount: paidAmount }));

          setTimeout(() => { window.location.href = '/payments?payment=success'; }, 3000);
        } else {
          setStatus('failed');
          setMessage(result.error || 'Payment could not be verified. Please contact your property manager.');
        }
      } catch (err: any) {
        setStatus('failed');
        setMessage(err.message || 'Payment verification failed. Please try again or contact support.');
      }
    })();
  }, [reference]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        {/* Status Icon */}
        <div className="mb-6">
          {status === 'verifying' && (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-50">
              <Loader2 className="w-10 h-10 text-cyan-600 animate-spin" />
            </div>
          )}
          {status === 'success' && (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 animate-in zoom-in">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          )}
          {status === 'failed' && (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {status === 'verifying' && 'Processing Payment'}
          {status === 'success' && 'Payment Successful'}
          {status === 'failed' && 'Payment Issue'}
        </h1>

        {/* Message */}
        <p className="text-gray-600 mb-4">{message}</p>

        {/* Amount */}
        {status === 'success' && amount && (
          <div className="bg-green-50 rounded-xl py-3 px-4 mb-6">
            <span className="text-sm text-green-700">Amount paid</span>
            <p className="text-2xl font-bold text-green-800">{amount}</p>
          </div>
        )}

        {/* Reference */}
        {reference && (
          <p className="text-xs text-gray-400 mb-6">
            Ref: {reference}
          </p>
        )}

        {/* Actions */}
        {status === 'verifying' && (
          <p className="text-sm text-gray-500">
            Please wait while we confirm your payment with Paystack...
          </p>
        )}

        {status === 'success' && (
          <p className="text-sm text-gray-500">
            Redirecting to your payments page...
          </p>
        )}

        {status === 'failed' && (
          <div className="space-y-3">
            <button
              onClick={() => { window.location.href = '/payments'; }}
              className="w-full py-3 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-colors"
            >
              Back to Payments
            </button>
            <button
              onClick={() => {
                if (reference) sessionStorage.removeItem(`payment_verified_${reference}`);
                verifiedRef.current = false;
                setStatus('verifying');
                setMessage('Verifying your payment...');
                window.location.reload();
              }}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Retry Verification
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
