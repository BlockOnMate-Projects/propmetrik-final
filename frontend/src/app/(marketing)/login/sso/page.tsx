'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Building2, ArrowLeft } from 'lucide-react';

function SSOContent() {
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orgSlug, setOrgSlug] = useState('');
    
    const authError = searchParams.get('error');
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

    useEffect(() => {
        if (authError) {
            switch (authError) {
                case 'OAuthAccountNotLinked':
                    setError('This email is already associated with another account.');
                    break;
                case 'AccessDenied':
                    setError('Access denied. Please contact your administrator.');
                    break;
                case 'Configuration':
                    setError('SSO configuration error. Please contact support.');
                    break;
                default:
                    setError('An error occurred during SSO sign in. Please try again.');
            }
        }
    }, [authError]);

    const handleSSOLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!orgSlug.trim()) {
            setError('Please enter your organization identifier');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // In production, you'd validate the org and get their SSO config
            // For now, directly sign in with Keycloak
            await signIn('keycloak', { callbackUrl });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'SSO login failed';
            setError(message);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <Link href="/" className="mb-8">
                <Image
                    src="/branding/logo-full.png"
                    alt="PROPMETRIK Logo"
                    width={200}
                    height={55}
                    className="h-12 w-auto object-contain"
                />
            </Link>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-2xl"
            >
                <div className="text-center mb-8">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-amber-500" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Enterprise SSO</h1>
                    <p className="text-zinc-400 text-sm">Sign in with your organization&apos;s identity provider</p>
                </div>

                {error && (
                    <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md p-3 mb-6">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSSOLogin} className="space-y-5">
                    <div>
                        <label htmlFor="orgSlug" className="block text-sm font-medium text-zinc-300 mb-2">
                            Organization Identifier
                        </label>
                        <div className="flex">
                            <input
                                id="orgSlug"
                                type="text"
                                value={orgSlug}
                                onChange={(e) => {
                                    setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                    setError(null);
                                }}
                                placeholder="your-company"
                                className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-l-md text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                            />
                            <span className="px-4 py-3 bg-zinc-800 border border-l-0 border-zinc-700 rounded-r-md text-zinc-500 text-sm">
                                .propmetrik.com
                            </span>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                            Enter your organization&apos;s unique identifier (provided by your admin)
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !orgSlug.trim()}
                        className="w-full bg-amber-600 text-white font-bold py-3 rounded-md uppercase tracking-widest hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            'Continue with SSO'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <Link 
                        href="/login" 
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to regular login
                    </Link>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-800">
                    <p className="text-xs text-zinc-500 text-center">
                        Need help? Contact{' '}
                        <a href="mailto:support@propmetrik.com" className="text-amber-500 hover:underline">
                            support@propmetrik.com
                        </a>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}

function LoadingFallback() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
        </div>
    );
}

export default function SSOLoginPage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <SSOContent />
        </Suspense>
    );
}
