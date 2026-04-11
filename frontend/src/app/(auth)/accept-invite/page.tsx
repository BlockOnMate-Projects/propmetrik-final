'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import {
    Eye,
    EyeOff,
    Lock,
    Shield,
    CheckCircle2,
    Building2,
    ArrowRight,
    Sparkles,
    AlertTriangle,
    User,
    Clock,
} from 'lucide-react';

/* ====================================================================
   Accept Invite — password setup page for team invitations
   URL: /accept-invite?token=...
   ==================================================================== */

interface InviteDetails {
    email: string;
    role: string;
    organizationName: string;
    inviterName: string;
    expiresAt: string;
    status: string;
}

function AcceptInviteForm() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';

    /* --- state --- */
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const normalizeInvite = (payload: any): InviteDetails => ({
        email: payload.email,
        role: payload.role,
        organizationName: payload.organizationName || payload.organization_name,
        inviterName: payload.inviterName || payload.inviter_name,
        expiresAt: payload.expiresAt || payload.expires_at,
        status: payload.status,
    });

    /* --- fetch invite details --- */
    useEffect(() => {
        if (!token) {
            setError('No invitation token provided.');
            setLoading(false);
            return;
        }

        (async () => {
            try {
                let details: InviteDetails | null = null;

                const unifiedRes = await fetch(`/api/invitations/token/${encodeURIComponent(token)}`);
                if (unifiedRes.ok) {
                    const unifiedData = await unifiedRes.json();
                    details = normalizeInvite(unifiedData.invitation);
                } else {
                    const res = await fetch(`/api/valuation-org/invitations/details?token=${encodeURIComponent(token)}`);
                    const data = await res.json();

                    if (!res.ok || !data.success) {
                        const err = data.error;
                        setError(typeof err === 'string' ? err : err?.message || 'Invitation not found.');
                        setLoading(false);
                        return;
                    }

                    details = normalizeInvite(data.data);
                }

                if (details.status !== 'pending') {
                    setError(
                        details.status === 'accepted'
                            ? 'This invitation has already been accepted.'
                            : details.status === 'expired'
                              ? 'This invitation has expired. Ask your admin to resend it.'
                              : 'This invitation is no longer valid.'
                    );
                    setLoading(false);
                    return;
                }

                if (new Date(details.expiresAt) < new Date()) {
                    setError('This invitation has expired. Ask your admin to resend it.');
                    setLoading(false);
                    return;
                }

                setInvite(details);
            } catch {
                setError('Failed to load invitation details.');
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    /* --- password strength --- */
    const getPasswordStrength = (pw: string) => {
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        return score;
    };

    const strength = getPasswordStrength(password);
    const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][strength] || '';
    const strengthColor = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-emerald-500'][strength] || '';

    const canSubmit = firstName && lastName && password.length >= 8 && password === confirmPassword && !isSubmitting;

    /* --- submit --- */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setIsSubmitting(true);
        setError(null);

        try {
            let accepted = false;

            const unifiedRes = await fetch(`/api/invitations/token/${encodeURIComponent(token)}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, firstName, lastName }),
            });

            if (unifiedRes.ok) {
                accepted = true;
            } else if (unifiedRes.status !== 404) {
                const unifiedData = await unifiedRes.json().catch(() => null);
                const err = unifiedData?.error;
                setError(typeof err === 'string' ? err : err?.message || 'Failed to set up your account.');
                setIsSubmitting(false);
                return;
            }

            if (!accepted) {
                const res = await fetch('/api/valuation-org/invitations/accept-and-setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, password, firstName, lastName }),
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    const err = data.error;
                    setError(typeof err === 'string' ? err : err?.message || 'Failed to set up your account.');
                    setIsSubmitting(false);
                    return;
                }
            }

            setSuccess(true);
        } catch {
            setError('Something went wrong. Please try again.');
            setIsSubmitting(false);
        }
    };

    /* --- loading state --- */
    if (loading) {
        return (
            <div className="text-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-zinc-500 text-sm">Loading invitation...</p>
            </div>
        );
    }

    /* --- error state (no valid invite) --- */
    if (error && !invite) {
        return (
            <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Invitation Error</h2>
                <p className="text-zinc-400 text-sm mb-8 max-w-sm mx-auto">{error}</p>
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                    Go to Login
                </Link>
            </div>
        );
    }

    /* --- success state --- */
    if (success) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
            >
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
                <p className="text-zinc-400 text-sm mb-2">
                    Your account at <span className="text-white font-medium">{invite?.organizationName}</span> has been created.
                </p>
                <p className="text-zinc-500 text-xs mb-8">Sign in with your email and the password you just set.</p>
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all text-sm uppercase tracking-wider"
                >
                    Sign In <ArrowRight className="w-4 h-4" />
                </Link>
            </motion.div>
        );
    }

    /* --- main form --- */
    const roleDisplay = (invite?.role || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    return (
        <div className="w-full">
            {/* Invite info card */}
            <div className="mb-8 p-5 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm text-white font-medium">
                            {invite?.inviterName} invited you to join
                        </p>
                        <p className="text-lg text-white font-bold">{invite?.organizationName}</p>
                        <div className="flex items-center gap-3 mt-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/30 rounded-full text-xs font-medium text-primary">
                                <User className="w-3 h-3" />
                                {roleDisplay}
                            </span>
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Expires {new Date(invite?.expiresAt || '').toLocaleDateString('en-GB')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-1">Set up your account</h2>
                <p className="text-sm text-zinc-400">
                    You&apos;ll sign in as <span className="text-white font-medium">{invite?.email}</span>
                </p>
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 flex items-start gap-3"
                    >
                        <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name fields */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium mb-1.5 text-zinc-400">First Name</label>
                        <input
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            placeholder="John"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1.5 text-zinc-400">Last Name</label>
                        <input
                            type="text"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            placeholder="Doe"
                        />
                    </div>
                </div>

                {/* Password */}
                <div>
                    <label className="block text-xs font-medium mb-1.5 text-zinc-400">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(null); }}
                            placeholder="Min 8 characters"
                            className="w-full pl-10 pr-12 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    {/* Strength meter */}
                    {password && (
                        <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 flex gap-1">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div
                                        key={i}
                                        className={`h-1 flex-1 rounded-full transition-all ${
                                            i <= strength ? strengthColor : 'bg-zinc-800'
                                        }`}
                                    />
                                ))}
                            </div>
                            <span className="text-[10px] text-zinc-500 w-14 text-right">{strengthLabel}</span>
                        </div>
                    )}
                </div>

                {/* Confirm Password */}
                <div>
                    <label className="block text-xs font-medium mb-1.5 text-zinc-400">Confirm Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                            placeholder="Re-enter password"
                            className={`w-full pl-10 pr-4 py-3 bg-zinc-900/50 border rounded-xl text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all ${
                                confirmPassword && confirmPassword !== password
                                    ? 'border-red-500/50'
                                    : confirmPassword && confirmPassword === password
                                      ? 'border-green-500/50'
                                      : 'border-zinc-800'
                            }`}
                        />
                    </div>
                    {confirmPassword && confirmPassword !== password && (
                        <p className="text-xs text-red-400 mt-1">Passwords don&apos;t match</p>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                >
                    {isSubmitting ? (
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    ) : (
                        <>
                            Create Account & Join Team
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </form>

            <p className="mt-8 text-center text-xs text-zinc-600">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                    Sign in instead
                </Link>
            </p>
        </div>
    );
}

/* ================================================ */
/*  Page wrapper — split-screen layout              */
/* ================================================ */
export default function AcceptInvitePage() {
    return (
        <div className="flex min-h-screen bg-zinc-950 text-white">
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
                    <Link href="/">
                        <Image
                            src="/branding/logo-dark-bg.svg"
                            alt="PROPMETRIK"
                            width={180}
                            height={50}
                            className="h-10 w-auto object-contain"
                        />
                    </Link>

                    <div className="my-auto py-16">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full mb-6">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-medium text-primary">Your team is waiting</span>
                            </div>

                            <h1 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-tight mb-6">
                                Join your team on{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    PROPMETRIK
                                </span>
                            </h1>

                            <p className="text-lg text-zinc-400 leading-relaxed max-w-md mb-10">
                                Set up your password and start collaborating on valuations, reports, and market intelligence.
                            </p>

                            <div className="space-y-4">
                                {[
                                    { icon: <Shield className="w-4 h-4" />, text: 'Enterprise-grade security' },
                                    { icon: <Building2 className="w-4 h-4" />, text: 'Role-based access control' },
                                    { icon: <CheckCircle2 className="w-4 h-4" />, text: 'Institutional-grade valuations' },
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
                                        <span className="text-sm text-zinc-300 font-medium">{feat.text}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-xl p-5"
                    >
                        <p className="text-sm text-zinc-300 italic leading-relaxed mb-3">
                            &ldquo;Onboarding new team members used to take days. Now it&apos;s one click and they&apos;re in.&rdquo;
                        </p>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-yellow-400 flex items-center justify-center text-zinc-950 text-xs font-bold">
                                NA
                            </div>
                            <div>
                                <div className="text-xs font-bold text-white">Nana Adjei</div>
                                <div className="text-[10px] text-zinc-500">Firm Principal, AdjeiCo Valuations</div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* ====== Right panel — Form ====== */}
            <div className="flex-1 flex flex-col min-h-screen">
                <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-900">
                    <Link href="/">
                        <Image
                            src="/branding/logo-dark-bg.svg"
                            alt="PROPMETRIK"
                            width={140}
                            height={40}
                            className="h-8 w-auto object-contain"
                        />
                    </Link>
                    <Link href="/login" className="text-xs font-bold text-zinc-400 hover:text-white transition-colors">
                        Sign in
                    </Link>
                </div>

                <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md"
                    >
                        <Suspense
                            fallback={
                                <div className="text-center text-zinc-500 py-20">
                                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    Loading...
                                </div>
                            }
                        >
                            <AcceptInviteForm />
                        </Suspense>
                    </motion.div>
                </div>

                <div className="p-4 border-t border-zinc-900 flex items-center justify-center gap-4 text-[10px] text-zinc-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                        <Lock className="w-3 h-3" />
                        SSL Encrypted
                    </div>
                    <span className="text-zinc-800">|</span>
                    <span>PCI DSS Compliant</span>
                    <span className="text-zinc-800">|</span>
                    <span>SOC 2 Type II</span>
                </div>
            </div>
        </div>
    );
}
