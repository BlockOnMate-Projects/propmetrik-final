'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
    Eye,
    EyeOff,
    Mail,
    Lock,
    Shield,
    Building2,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    CheckCircle2,
    BarChart3,
    Globe2,
    Zap,
} from 'lucide-react';

/* ====================================================================
   Login page — split-screen with integrated SSO
   Tab 1 = Credentials   Tab 2 = Enterprise SSO
   ==================================================================== */

const features = [
    { icon: <BarChart3 className="w-4 h-4" />, text: 'Institutional-grade valuations' },
    { icon: <Globe2 className="w-4 h-4" />, text: 'Ghana-first property data' },
    { icon: <Shield className="w-4 h-4" />, text: 'Bank-level security & compliance' },
    { icon: <Zap className="w-4 h-4" />, text: 'Real-time market intelligence' },
];

/* ------------------------------------------------ */
/*  LoginForm — handles credentials & SSO           */
/* ------------------------------------------------ */
function LoginForm() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
    const authError = searchParams.get('error');

    /* --- tabs --- */
    type AuthTab = 'credentials' | 'sso';
    const [activeTab, setActiveTab] = useState<AuthTab>('credentials');

    /* --- credentials state --- */
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    /* --- SSO state --- */
    const [orgSlug, setOrgSlug] = useState('');

    /* --- shared state --- */
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* Map NextAuth / Keycloak error codes to user-friendly text */
    useEffect(() => {
        if (!authError) return;
        const map: Record<string, string> = {
            OAuthAccountNotLinked: 'This email is already linked to another provider.',
            AccessDenied: 'Access denied. Contact your administrator.',
            Configuration: 'SSO configuration error. Please contact support.',
            CredentialsSignin: 'Invalid email or password.',
        };
        setError(map[authError] || 'Authentication failed. Please try again.');
    }, [authError]);

    /* --- credentials submit --- */
    const handleCredentialsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (res?.error) {
                setError('Invalid email or password. Please try again.');
                setIsLoading(false);
                return;
            }

            // NextAuth session is now set — redirect
            window.location.href = callbackUrl;
        } catch (err: unknown) {
            console.error('[Login] Exception:', err);
            const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
            setError(message);
            setIsLoading(false);
        }
    };

    /* --- SSO submit --- */
    const handleSSOSubmit = async (e: React.FormEvent) => {
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
            const msg = err instanceof Error ? err.message : 'SSO signin failed.';
            setError(msg);
            setIsLoading(false);
        }
    };

    /* --- spinner --- */
    const Spinner = () => (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
        </svg>
    );

    return (
        <div className="w-full">
            {/* ---- Tab switcher ---- */}
            <div className="flex rounded-xl bg-card/60 border border-border p-1 mb-8">
                {(['credentials', 'sso'] as AuthTab[]).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => {
                            setActiveTab(tab);
                            setError(null);
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab
                                ? 'bg-muted text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-muted-foreground'
                        }`}
                    >
                        {tab === 'credentials' ? (
                            <>
                                <Mail className="w-4 h-4" /> Email
                            </>
                        ) : (
                            <>
                                <Building2 className="w-4 h-4" /> Enterprise SSO
                            </>
                        )}
                    </button>
                ))}
            </div>

            {/* ---- Error banner ---- */}
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

            <AnimatePresence mode="wait">
                {/* ========== CREDENTIALS TAB ========== */}
                {activeTab === 'credentials' && (
                    <motion.div
                        key="cred"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-foreground mb-1">Welcome back</h2>
                            <p className="text-sm text-muted-foreground">Sign in to your account to continue.</p>
                        </div>

                        <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                            {/* Email */}
                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => { setEmail(e.target.value); setError(null); }}
                                        placeholder="you@company.com"
                                        className="w-full pl-10 pr-4 py-3 bg-card/50 border border-border rounded-xl text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                                    <Link href="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                                        Forgot password?
                                    </Link>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                                        placeholder="••••••••"
                                        className="w-full pl-10 pr-12 py-3 bg-card/50 border border-border rounded-xl text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Remember me */}
                            <div className="flex items-center gap-2">
                                <input
                                    id="rememberMe"
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary/50 focus:ring-offset-0"
                                />
                                <label htmlFor="rememberMe" className="text-sm text-muted-foreground">Remember me for 30 days</label>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading || !email || !password}
                                className="w-full bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                            >
                                {isLoading ? <Spinner /> : (
                                    <>
                                        Sign In
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="relative my-8">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-background px-4 text-xs text-muted-foreground uppercase tracking-wider">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        {/* Google Sign-In */}
                        <button
                            type="button"
                            onClick={() => signIn('google', { callbackUrl })}
                            className="w-full border border-border bg-card/30 text-muted-foreground font-medium py-3 rounded-xl hover:bg-muted hover:border-border transition-all flex items-center justify-center gap-2.5 text-sm"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button>

                        {/* Enterprise SSO button */}
                        <button
                            type="button"
                            onClick={() => { setActiveTab('sso'); setError(null); }}
                            className="w-full border border-border bg-card/30 text-muted-foreground font-medium py-3 rounded-xl hover:bg-muted hover:border-border transition-all flex items-center justify-center gap-2.5 text-sm"
                        >
                            <Building2 className="w-4 h-4 text-primary" />
                            Enterprise SSO
                        </button>

                        {/* Sign up link */}
                        <p className="mt-8 text-center text-sm text-muted-foreground">
                            Don&apos;t have an account?{' '}
                            <Link href="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
                                Get started
                            </Link>
                        </p>
                    </motion.div>
                )}

                {/* ========== SSO TAB ========== */}
                {activeTab === 'sso' && (
                    <motion.div
                        key="sso"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-foreground mb-1">Enterprise SSO</h2>
                            <p className="text-sm text-muted-foreground">Sign in with your organization&apos;s identity provider.</p>
                        </div>

                        <form onSubmit={handleSSOSubmit} className="space-y-5">
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

                            {/* SSO info callout */}
                            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium mb-1">How SSO works</p>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            You&apos;ll be redirected to your organization&apos;s identity provider (Okta, Azure AD, Google Workspace, etc.) to authenticate securely.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading || !orgSlug.trim()}
                                className="w-full bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                            >
                                {isLoading ? <Spinner /> : (
                                    <>
                                        Continue with SSO
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Back to email login */}
                        <button
                            type="button"
                            onClick={() => { setActiveTab('credentials'); setError(null); }}
                            className="mt-6 mx-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to email login
                        </button>

                        {/* Help */}
                        <div className="mt-8 pt-6 border-t border-border/50 text-center">
                            <p className="text-xs text-muted-foreground">
                                Need help? Contact{' '}
                                <a href="mailto:support@propmetrik.com" className="text-primary hover:underline">
                                    support@propmetrik.com
                                </a>
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ================================================ */
/*  Page wrapper — split-screen layout              */
/* ================================================ */
export default function LoginPage() {
    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* ====== Left panel — Hero ====== */}
            <div className="dark hidden lg:flex lg:w-[45%] xl:w-[48%] relative overflow-hidden flex-col justify-between">
                {/* Background */}
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-full"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&q=80"
                            alt="Accra cityscape"
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
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-medium text-primary">Trusted by 500+ professionals</span>
                            </div>

                            <h1 className="text-4xl xl:text-5xl font-bold text-foreground tracking-tight leading-tight mb-6">
                                Your property intelligence{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    command center
                                </span>
                            </h1>

                            <p className="text-lg text-muted-foreground leading-relaxed max-w-md mb-10">
                                Access real-time valuations, market data, and deal insights — all in one platform built for Ghana.
                            </p>

                            <div className="space-y-4">
                                {features.map((feat, i) => (
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

                    {/* Testimonial */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="bg-card/50 backdrop-blur border border-border/50 rounded-xl p-5"
                    >
                        <p className="text-sm text-muted-foreground italic leading-relaxed mb-3">
                            &ldquo;The valuation reports are institutional quality. Our clients and banks trust the data — it&apos;s a game changer.&rdquo;
                        </p>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-yellow-400 flex items-center justify-center text-zinc-950 text-xs font-bold">
                                KM
                            </div>
                            <div>
                                <div className="text-xs font-bold text-foreground">Kwame Mensah</div>
                                <div className="text-[10px] text-muted-foreground">Snr. Valuer, Capital Estate Partners</div>
                            </div>
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
                        href="/signup"
                        className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                    >
                        Sign up
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
                            <LoginForm />
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
