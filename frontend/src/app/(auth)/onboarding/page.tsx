'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import {
    CheckCircle2,
    CreditCard,
    Building2,
    ArrowRight,
    Lock,
    Sparkles,
} from 'lucide-react';

/* ====================================================================
   Plan options (same as signup page)
   ==================================================================== */
const planCategories = [
    {
        group: 'Full Platform',
        plans: [
            { label: 'Core', price: 'GHS 390/mo', value: 'full-platform-core' },
            { label: 'Pro', price: 'GHS 975/mo', value: 'full-platform-pro', popular: true },
            { label: 'Enterprise', price: 'GHS 3,250/mo', value: 'full-platform-enterprise' },
        ],
    },
    {
        group: 'Property Mgmt',
        plans: [
            { label: 'Basic', price: 'GHS 390/mo', value: 'pm-basic' },
            { label: 'Premium', price: 'GHS 780/mo', value: 'pm-premium', popular: true },
            { label: 'Enterprise', price: 'GHS 1,560/mo', value: 'pm-enterprise' },
        ],
    },
    {
        group: 'CRM & Deals',
        plans: [
            { label: 'Starter', price: 'GHS 325/mo', value: 'crm-starter' },
            { label: 'Professional', price: 'GHS 650/mo', value: 'crm-professional', popular: true },
            { label: 'Enterprise', price: 'GHS 1,300/mo', value: 'crm-enterprise' },
        ],
    },
    {
        group: 'Data Intelligence',
        plans: [
            { label: 'Developer', price: 'GHS 260/mo', value: 'data-developer' },
            { label: 'Business', price: 'GHS 650/mo', value: 'data-business', popular: true },
            { label: 'Enterprise', price: 'GHS 1,950/mo', value: 'data-enterprise' },
        ],
    },
    {
        group: 'Project Mgmt',
        plans: [
            { label: 'Starter', price: 'GHS 325/mo', value: 'proj-starter' },
            { label: 'Professional', price: 'GHS 650/mo', value: 'proj-professional', popular: true },
            { label: 'Enterprise', price: 'GHS 1,300/mo', value: 'proj-enterprise' },
        ],
    },
];

const allPlans = planCategories.flatMap((c) =>
    c.plans.map((p) => ({ ...p, group: c.group }))
);

/* ====================================================================
   Onboarding Form — Plan Selection + Payment
   For authenticated users who signed up via Google OAuth
   ==================================================================== */
function OnboardingForm() {
    const router = useRouter();
    const { data: session, status } = useSession();

    /* ------ payment bypass (env-driven, no code change to go live) ------ */
    const paymentBypass = process.env.NEXT_PUBLIC_PAYMENT_BYPASS === 'yes';

    const [step, setStep] = useState(1);
    const [selectedPlan, setSelectedPlan] = useState('');
    const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
    const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'bank_transfer'>('paystack');
    const [billingPhone, setBillingPhone] = useState('');
    const [billingAddress, setBillingAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedPlanInfo = allPlans.find((p) => p.value === selectedPlan);

    // Redirect if not authenticated or already onboarded
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/login');
        } else if (status === 'authenticated' && session?.user?.onboardingCompleted !== false) {
            router.replace('/dashboard');
        }
    }, [status, session, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPlan) {
            setError('Please select a plan.');
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/subscriptions/subscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.accessToken}`,
                },
                body: JSON.stringify({
                    plan_slug: selectedPlan,
                    billing_interval: billingInterval,
                    payment_provider: paymentMethod,
                    billing_phone: billingPhone || undefined,
                    billing_address: billingAddress || undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Subscription creation failed' }));
                throw new Error(err.error || err.message || 'Could not create subscription');
            }

            const subData = await res.json();

            if (paymentMethod === 'paystack' && subData.payment_url) {
                window.location.href = subData.payment_url;
            } else if (paymentMethod === 'bank_transfer') {
                window.location.href = `/dashboard/billing?welcome=true&invoice=${subData.invoice_id || ''}`;
            } else {
                window.location.href = '/dashboard?welcome=true';
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            setError(message);
            setIsLoading(false);
        }
    };

    if (status === 'loading') {
        return (
            <div className="text-center text-zinc-500 py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                Loading...
            </div>
        );
    }

    const steps = paymentBypass ? ['Plan'] : ['Plan', 'Payment'];

    return (
        <div className="w-full">
            {/* Welcome message */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full mb-4">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary">Welcome to PROPMETRIK</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">
                    Hi {session?.user?.name?.split(' ')[0]}, let&apos;s get you set up
                </h1>
                <p className="text-sm text-zinc-400">Choose a plan to unlock the full platform.</p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
                {steps.map((s, i) => {
                    const stepNum = i + 1;
                    const isActive = step === stepNum;
                    const isDone = step > stepNum;
                    return (
                        <div key={s} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => { if (isDone) setStep(stepNum); }}
                                disabled={!isDone}
                                className={`flex items-center gap-2 transition-all ${isDone ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-gradient-to-r from-primary to-yellow-400 text-zinc-950'
                                        : isDone
                                          ? 'bg-primary/20 text-primary border border-primary/50'
                                          : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                }`}>
                                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
                                </div>
                                <span className={`text-xs font-medium ${
                                    isActive ? 'text-white' : isDone ? 'text-primary' : 'text-zinc-500'
                                }`}>
                                    {s}
                                </span>
                            </button>
                            {i < steps.length - 1 && (
                                <div className={`w-8 sm:w-12 h-px mx-1 ${step > stepNum ? 'bg-primary/50' : 'bg-zinc-700'}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            <form onSubmit={handleSubmit}>
                <AnimatePresence mode="wait">
                    {/* ========== STEP 1: Plan Selection ========== */}
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1">Choose your plan</h2>
                                <p className="text-sm text-zinc-400">Select a product and tier that fits your needs.</p>
                            </div>

                            {/* Billing toggle */}
                            <div className="flex items-center justify-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit mx-auto">
                                <button
                                    type="button"
                                    onClick={() => setBillingInterval('monthly')}
                                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                                        billingInterval === 'monthly'
                                            ? 'bg-primary text-zinc-950'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Monthly
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBillingInterval('annual')}
                                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                                        billingInterval === 'annual'
                                            ? 'bg-primary text-zinc-950'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Annual
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                        billingInterval === 'annual'
                                            ? 'bg-zinc-950/20 text-zinc-950'
                                            : 'bg-green-500/10 text-green-400'
                                    }`}>
                                        -17%
                                    </span>
                                </button>
                            </div>

                            {/* Plan cards */}
                            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1 styled-scrollbar">
                                {planCategories.map((cat) => (
                                    <div key={cat.group}>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2 px-1">
                                            {cat.group}
                                        </div>
                                        <div className="space-y-2">
                                            {cat.plans.map((p) => {
                                                const isSelected = selectedPlan === p.value;
                                                return (
                                                    <button
                                                        key={p.value}
                                                        type="button"
                                                        onClick={() => setSelectedPlan(p.value)}
                                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                                                            isSelected
                                                                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                                                : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                                                isSelected ? 'border-primary' : 'border-zinc-700'
                                                            }`}>
                                                                {isSelected && (
                                                                    <motion.div
                                                                        initial={{ scale: 0 }}
                                                                        animate={{ scale: 1 }}
                                                                        className="w-2.5 h-2.5 rounded-full bg-primary"
                                                                    />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="text-sm font-semibold text-white">{p.label}</span>
                                                                {p.popular && (
                                                                    <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-bold uppercase">
                                                                        Popular
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-sm font-bold text-zinc-300">{p.price}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <motion.button
                                type={paymentBypass ? 'submit' : 'button'}
                                disabled={!selectedPlan || (paymentBypass && isLoading)}
                                onClick={paymentBypass ? undefined : () => setStep(2)}
                                whileHover={{ scale: selectedPlan ? 1.01 : 1 }}
                                whileTap={{ scale: selectedPlan ? 0.99 : 1 }}
                                className="w-full bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl uppercase tracking-wider hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {paymentBypass && isLoading ? (
                                    <svg
                                        className="animate-spin h-5 w-5 text-current"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        />
                                    </svg>
                                ) : paymentBypass ? (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Start Free Trial
                                    </>
                                ) : (
                                    <>
                                        Continue
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </motion.button>
                        </motion.div>
                    )}

                    {/* ========== STEP 2: Payment ========== */}
                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-5"
                        >
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1">Payment details</h2>
                                <p className="text-sm text-zinc-400">Choose how you&apos;d like to pay.</p>
                            </div>

                            {/* Order summary */}
                            {selectedPlanInfo && (
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs text-zinc-500 uppercase tracking-wider">{selectedPlanInfo.group}</div>
                                        <div className="text-sm font-bold text-white">{selectedPlanInfo.label} Plan</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-white">{selectedPlanInfo.price}</div>
                                        <div className="text-[10px] text-zinc-500 uppercase">{billingInterval}</div>
                                    </div>
                                </div>
                            )}

                            {/* Payment method */}
                            <div className="grid grid-cols-2 gap-3">
                                <label className="cursor-pointer group">
                                    <input
                                        type="radio"
                                        name="payment_method"
                                        className="peer sr-only"
                                        checked={paymentMethod === 'paystack'}
                                        onChange={() => setPaymentMethod('paystack')}
                                    />
                                    <div className="p-4 border border-zinc-800 rounded-xl text-center peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:ring-1 peer-checked:ring-primary/30 transition-all group-hover:border-zinc-700">
                                        <CreditCard className="w-5 h-5 mx-auto mb-2 text-zinc-400" />
                                        <span className="text-sm font-bold text-white block">Paystack</span>
                                        <span className="text-[10px] text-zinc-500">Card / MoMo</span>
                                    </div>
                                </label>
                                <label className="cursor-pointer group">
                                    <input
                                        type="radio"
                                        name="payment_method"
                                        className="peer sr-only"
                                        checked={paymentMethod === 'bank_transfer'}
                                        onChange={() => setPaymentMethod('bank_transfer')}
                                    />
                                    <div className="p-4 border border-zinc-800 rounded-xl text-center peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:ring-1 peer-checked:ring-primary/30 transition-all group-hover:border-zinc-700">
                                        <Building2 className="w-5 h-5 mx-auto mb-2 text-zinc-400" />
                                        <span className="text-sm font-bold text-white block">Bank Transfer</span>
                                        <span className="text-[10px] text-zinc-500">Invoice</span>
                                    </div>
                                </label>
                            </div>

                            {/* Payment detail panel */}
                            <AnimatePresence mode="wait">
                                {paymentMethod === 'paystack' ? (
                                    <motion.div
                                        key="paystack"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800"
                                    >
                                        <p className="text-sm text-zinc-400 mb-3">
                                            You&apos;ll be redirected to Paystack&apos;s secure checkout.
                                        </p>
                                        <div className="flex gap-2 mb-3">
                                            <span className="h-7 px-2.5 bg-white text-zinc-900 rounded-md text-[10px] font-bold flex items-center justify-center">
                                                VISA
                                            </span>
                                            <span className="h-7 px-2.5 bg-white text-zinc-900 rounded-md text-[10px] font-bold flex items-center justify-center">
                                                Mastercard
                                            </span>
                                            <span className="h-7 px-2.5 bg-yellow-400 text-zinc-900 rounded-md text-[10px] font-bold flex items-center justify-center">
                                                MTN MoMo
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                            <Lock className="w-3 h-3" />
                                            256-bit SSL encrypted. PCI DSS compliant.
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="bank"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800 space-y-4"
                                    >
                                        <p className="text-sm text-zinc-400">
                                            An invoice with bank details will be sent to your email.
                                        </p>
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Billing Phone</label>
                                            <input
                                                type="tel"
                                                value={billingPhone}
                                                onChange={(e) => setBillingPhone(e.target.value)}
                                                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                                placeholder="+233 24 123 4567"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Billing Address</label>
                                            <input
                                                type="text"
                                                value={billingAddress}
                                                onChange={(e) => setBillingAddress(e.target.value)}
                                                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                                placeholder="Street Address, City"
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="px-6 py-3.5 border border-zinc-800 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:border-zinc-600 transition-all"
                                >
                                    Back
                                </button>
                                <motion.button
                                    type="submit"
                                    disabled={isLoading}
                                    whileHover={{ scale: !isLoading ? 1.01 : 1 }}
                                    whileTap={{ scale: !isLoading ? 0.99 : 1 }}
                                    className="flex-1 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl uppercase tracking-wider hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <svg className="animate-spin h-5 w-5 text-current" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                    ) : paymentMethod === 'paystack' ? (
                                        <>
                                            <Lock className="w-4 h-4" />
                                            Proceed to Paystack
                                        </>
                                    ) : (
                                        'Request Invoice'
                                    )}
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>
        </div>
    );
}

/* ====================================================================
   Page layout — centered card on dark background
   ==================================================================== */
export default function OnboardingPage() {
    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-center p-6 border-b border-zinc-900">
                <Link href="/">
                    <Image
                        src="/branding/logo-dark-bg.svg"
                        alt="PROPMETRIK"
                        width={160}
                        height={44}
                        className="h-9 w-auto object-contain"
                    />
                </Link>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md"
                >
                    <OnboardingForm />
                </motion.div>
            </div>

            {/* Bottom bar */}
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
    );
}
