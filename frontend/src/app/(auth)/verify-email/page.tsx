'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

function VerifyEmailInner() {
    const params = useSearchParams();
    const token = params.get('token');
    const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setState('error');
            setMessage('No verification token found in the link.');
            return;
        }
        (async () => {
            try {
                const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    setState('success');
                    setMessage('Your email has been verified.');
                } else {
                    setState('error');
                    setMessage(data.message || 'This verification link is invalid or has expired.');
                }
            } catch {
                setState('error');
                setMessage('Something went wrong. Please try again.');
            }
        })();
    }, [token]);

    return (
        <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-6 w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
                {state === 'loading' && <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />}
                {state === 'success' && <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />}
                {state === 'error' && <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />}
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
                {state === 'loading' ? 'Verifying your email…' : state === 'success' ? 'Email verified' : 'Verification failed'}
            </h1>
            <p className="text-sm text-muted-foreground mb-8">{message || 'Please wait a moment.'}</p>
            {state !== 'loading' && (
                <Link
                    href={state === 'success' ? '/dashboard' : '/login'}
                    className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold px-6 py-3 rounded-xl uppercase tracking-wider hover:shadow-lg hover:shadow-primary/25 transition-all"
                >
                    {state === 'success' ? 'Go to dashboard' : 'Back to sign in'}
                </Link>
            )}
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
            <Link href="/" className="mb-10">
                <Image src="/branding/logo-dark-bg.svg" alt="PROPMETRIK" width={160} height={44} className="h-9 w-auto object-contain" />
            </Link>
            <Suspense fallback={<div className="text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                <VerifyEmailInner />
            </Suspense>
        </div>
    );
}
