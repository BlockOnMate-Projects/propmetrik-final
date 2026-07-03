'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
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

    const cacheKey = `payment_verified_${reference}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      setStatus('success');
      setAmount(data.amount);
      setMessage('Payment confirmed!');
      setTimeout(() => { window.location.href = '/dashboard/tenant/payments?payment=success'; }, 2000);
      return;
    }

    if (verifiedRef.current) return;
    verifiedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/tenant-portal/payments/verify/${encodeURIComponent(reference)}`);
        const result = await res.json();

        if (res.ok && result.success !== false) {
          const paidAmount = result.payment?.amount
            ? `GHS ${Number(result.payment.amount).toLocaleString()}`
            : null;
          setStatus('success');
          setAmount(paidAmount);
          setMessage('Payment confirmed!');
          sessionStorage.setItem(cacheKey, JSON.stringify({ amount: paidAmount }));
          setTimeout(() => { window.location.href = '/dashboard/tenant/payments?payment=success'; }, 3000);
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
      <div className="bg-card rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
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

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {status === 'verifying' && 'Processing Payment'}
          {status === 'success' && 'Payment Successful'}
          {status === 'failed' && 'Payment Issue'}
        </h1>

        <p className="text-muted-foreground mb-4">{message}</p>

        {amount && status === 'success' && (
          <p className="text-lg font-semibold text-green-600 mb-4">{amount}</p>
        )}

        {status === 'failed' && (
          <a href="/dashboard/tenant/payments" className="inline-block mt-4 px-6 py-2 bg-cyan-600 text-foreground rounded-xl font-medium hover:bg-cyan-700 transition-colors">
            Return to Payments
          </a>
        )}

        {status === 'success' && (
          <p className="text-sm text-muted-foreground">Redirecting to payments...</p>
        )}
      </div>
    </div>
  );
}
