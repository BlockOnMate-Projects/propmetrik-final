'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import {
    Building2,
    ArrowLeft,
    Shield,
    Lock,
    Sparkles,
    ArrowRight,
    Globe2,
    CheckCircle2,
} from 'lucide-react';

/* ====================================================================
   Enterprise SSO page — standalone route for direct SSO access
   Split-screen layout matching login & signup pages
   ==================================================================== */

function SSOForm() {
    const searchParams = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orgSlug, setOrgSlug] = useState('');

    const authError = searchParams.get('error');
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

    useEffect(() => {
        if (!authError) return;
        const map: Record<string, string> = {
            OAuthAccountNotLinked: 'This email is already linked to another provider.',
            AccessDenied: 'Access denied. Contact your organization administrator.',
            Configuration: 'SSO configuration error. Please contact support.',
        };
        setError(map[authError] || 'An error occurred during SSO sign in. Please try again.');
    }, [authError]);

    const handleSSOLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgSlug.trim()) {
            setError('Please enter your organization identifier.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await signIn('keycloak', { callbackUrl });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'SSO login failed.';
            setError(msg);
            setIsLoading(false);
        }
    };

    const ssoProviders = [
        'Okta',
        'Azure AD',
        'Google Workspace',
        'OneLogin',
        'SAML 2.0',
    ];

    return (
        <div className="w-full">
            <div className="mb-8">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                    <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-1">Enterprise SSO</h2>
                <p className="text-sm text-muted-foreground">
                    Sign in securely with your organization&apos;s identity provider.
                </p>
            </div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-start gap-3"
                    >
                        <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            <form onSubmit={handleSSOLogin} className="space-y-5">
                {/* Org slug */}
                <div>
                    <label className="block text-xs font-medium mb-1.5 text-muted-foreground">
                        Organization Identifier
                    </label>
                    <div className="flex">
                        <div className="relative flex-1">
                            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                required
                                value={orgSlug}
                                onChange={(e) => {
                                    setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                    setError(null);
                                }}
                                placeholder="your-company"
                                className="w-full pl-10 pr-4 py-3 bg-card/50 border border-border rounded-l-xl text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            />
                        </div>
                        <span className="px-4 py-3 bg-card border border-l-0 border-border rounded-r-xl text-muted-foreground text-xs font-mono whitespace-nowrap flex items-center">
                            .propmetrik.com
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Enter the unique identifier provided by your organization admin.
                    </p>
                </div>

                {/* How it works */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs text-muted-foreground font-medium mb-1">Secure enterprise authentication</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                You&apos;ll be redirected to your organization&apos;s identity provider to authenticate.
                                Your credentials never touch our servers.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Supported providers */}
                <div>
                    <p className="text-xs text-muted-foreground mb-2">Supported providers</p>
                    <div className="flex flex-wrap gap-2">
                        {ssoProviders.map((p) => (
                            <span
                                key={p}
                                className="px-3 py-1 bg-card/60 border border-border rounded-full text-[11px] text-muted-foreground font-medium"
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={isLoading || !orgSlug.trim()}
                    className="w-full bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                >
                    {isLoading ? (
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    ) : (
                        <>
                            Continue with SSO
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </form>

            {/* Back to login */}
            <div className="mt-8 flex items-center justify-center">
                <Link
                    href="/login"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to email login
                </Link>
            </div>

            {/* Help */}
            <div className="mt-6 pt-6 border-t border-border/50 text-center">
                <p className="text-xs text-muted-foreground">
                    Need help configuring SSO?{' '}
                    <a href="mailto:enterprise@propmetrik.com" className="text-primary hover:underline">
                        Contact our enterprise team
                    </a>
                </p>
            </div>
        </div>
    );
}

/* ================================================ */
/*  Page wrapper — split-screen layout              */
/* ================================================ */
export default function SSOLoginPage() {
    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* ====== Left panel — Hero ====== */}
            <div className="hidden lg:flex lg:w-[45%] xl:w-[48%] relative overflow-hidden flex-col justify-between">
                {/* Background */}
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-full"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80"
                            alt="Modern office"
                            className="w-full h-full object-cover"
                        />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/95 via-zinc-950/80 to-zinc-950/60" />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
                </div>

                {/* Content */}
                <div className="relative z-10 p-10 xl:p-14 flex flex-col justify-between h-full">
                    {/* Logo */}
                    <Link href="/">
                        <Image
                            src="/branding/logo-dark-bg.svg"
                            alt="PROPMETRIK"
                            width={180}
                            height={50}
                            className="h-10 w-auto object-contain"
                        />
                    </Link>

                    {/* Hero text */}
                    <div className="my-auto py-16">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full mb-6">
                                <Globe2 className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-medium text-primary">Enterprise Security</span>
                            </div>

                            <h1 className="text-4xl xl:text-5xl font-bold text-foreground tracking-tight leading-tight mb-6">
                                Secure access for{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    your entire team
                                </span>
                            </h1>

                            <p className="text-lg text-muted-foreground leading-relaxed max-w-md mb-10">
                                PROPMETRIK integrates with your existing identity provider for seamless, secure team access.
                            </p>

                            <div className="space-y-4">
                                {[
                                    { icon: <Shield className="w-4 h-4" />, text: 'Zero-trust security model' },
                                    { icon: <CheckCircle2 className="w-4 h-4" />, text: 'SAML 2.0 & OIDC support' },
                                    { icon: <Building2 className="w-4 h-4" />, text: 'Multi-tenant organization support' },
                                    { icon: <Lock className="w-4 h-4" />, text: 'Automated provisioning & deprovisioning' },
                                ].map((feat, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 + i * 0.1 }}
                                        className="flex items-center gap-3"
                                    >
                                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                            {feat.icon}
                                        </div>
                                        <span className="text-sm text-muted-foreground font-medium">{feat.text}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>

                    {/* Enterprise stat */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="bg-card/50 backdrop-blur border border-border/50 rounded-xl p-5"
                    >
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: 'Uptime SLA', value: '99.99%' },
                                { label: 'Avg SSO Login', value: '<2s' },
                                { label: 'Orgs Active', value: '120+' },
                            ].map((s) => (
                                <div key={s.label} className="text-center">
                                    <div className="text-lg font-bold text-foreground">{s.value}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* ====== Right panel — Form ====== */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile header */}
                <div className="lg:hidden flex items-center justify-between p-4 border-b border-border">
                    <Link href="/">
                        <Image
                            src="/branding/logo-dark-bg.svg"
                            alt="PROPMETRIK"
                            width={140}
                            height={40}
                            className="h-8 w-auto object-contain"
                        />
                    </Link>
                    <Link
                        href="/login"
                        className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Email login
                    </Link>
                </div>

                {/* Form area */}
                <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md"
                    >
                        <Suspense
                            fallback={
                                <div className="text-center text-muted-foreground py-20">
                                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    Loading...
                                </div>
                            }
                        >
                            <SSOForm />
                        </Suspense>
                    </motion.div>
                </div>

                {/* Bottom bar */}
                <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <Lock className="w-3 h-3" />
                            SSL Encrypted
                        </div>
                        <span className="text-zinc-800">|</span>
                        <span>PCI DSS Compliant</span>
                        <span className="text-zinc-800">|</span>
                        <span>SOC 2 Type II</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground normal-case">
                        <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
                        <span className="text-zinc-800">·</span>
                        <Link href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
