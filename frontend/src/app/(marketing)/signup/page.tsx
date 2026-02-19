'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import {
    CheckCircle2,
    Shield,
    CreditCard,
    Building2,
    Eye,
    EyeOff,
    ChevronDown,
    ArrowRight,
    Sparkles,
    Lock,
    Users,
    TrendingUp,
    Database,
} from 'lucide-react';

/* ====================================================================
   Multi-step signup form
   Step 1 = Account details
   Step 2 = Plan selection + billing
   Step 3 = Payment
   ==================================================================== */
function SignupForm() {
    const searchParams = useSearchParams();
    const plan = searchParams.get('plan');
    const category = searchParams.get('category');
    const billingParam = searchParams.get('billing');

    /* ------ plan options ------ */
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

    // Derive the flat option list for the select fallback
    const allPlans = planCategories.flatMap((c) =>
        c.plans.map((p) => ({ ...p, group: c.group }))
    );

    /* ------ state ------ */
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPlan, setSelectedPlan] = useState(plan || '');
    const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>(
        (billingParam as 'monthly' | 'annual') || 'monthly'
    );
    const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'bank_transfer'>('paystack');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [billingPhone, setBillingPhone] = useState('');
    const [billingAddress, setBillingAddress] = useState('');

    // Sync from URL params
    useEffect(() => {
        if (plan) {
            setSelectedPlan(plan);
            setStep(1); // start at account if plan is pre-selected
        }
    }, [plan]);
    useEffect(() => {
        if (billingParam === 'monthly' || billingParam === 'annual') setBillingInterval(billingParam);
    }, [billingParam]);

    /* ------ helpers ------ */
    const selectedPlanInfo = allPlans.find((p) => p.value === selectedPlan);

    const canProceedStep1 = firstName && lastName && email && password && password.length >= 8;
    const canProceedStep2 = !!selectedPlan;

    /* ------ submit ------ */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        if (!selectedPlan) {
            setError('Please select a plan.');
            setIsLoading(false);
            return;
        }

        try {
            const signupRes = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    password,
                    companyName: company || undefined,
                }),
            });

            if (!signupRes.ok) {
                const err = await signupRes.json().catch(() => ({ message: 'Signup failed' }));
                throw new Error(err.message || 'Account creation failed');
            }

            const { token } = await signupRes.json();

            const subRes = await fetch('/api/subscriptions/subscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    plan_slug: selectedPlan,
                    billing_interval: billingInterval,
                    payment_provider: paymentMethod,
                    billing_phone: billingPhone || undefined,
                    billing_address: billingAddress || undefined,
                }),
            });

            if (!subRes.ok) {
                const err = await subRes.json().catch(() => ({ message: 'Subscription creation failed' }));
                throw new Error(err.message || 'Could not create subscription');
            }

            const subData = await subRes.json();

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

    /* ------ step indicator ------ */
    const steps = ['Account', 'Plan', 'Payment'];

    return (
        <div className="w-full">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-10">
                {steps.map((s, i) => {
                    const stepNum = i + 1;
                    const isActive = step === stepNum;
                    const isDone = step > stepNum;
                    return (
                        <div key={s} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isDone) setStep(stepNum);
                                }}
                                disabled={!isDone}
                                className={`flex items-center gap-2 transition-all ${
                                    isDone ? 'cursor-pointer' : 'cursor-default'
                                }`}
                            >
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        isActive
                                            ? 'bg-gradient-to-r from-primary to-yellow-400 text-zinc-950'
                                            : isDone
                                              ? 'bg-primary/20 text-primary border border-primary/50'
                                              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                    }`}
                                >
                                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
                                </div>
                                <span
                                    className={`text-xs font-medium hidden sm:block ${
                                        isActive ? 'text-white' : isDone ? 'text-primary' : 'text-zinc-500'
                                    }`}
                                >
                                    {s}
                                </span>
                            </button>
                            {i < steps.length - 1 && (
                                <div
                                    className={`w-8 sm:w-12 h-px mx-1 ${
                                        step > stepNum ? 'bg-primary/50' : 'bg-zinc-700'
                                    }`}
                                />
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
                        className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 flex items-start gap-3"
                    >
                        <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            <form onSubmit={handleSubmit}>
                <AnimatePresence mode="wait">
                    {/* ========== STEP 1: Account ========== */}
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
                                <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
                                <p className="text-sm text-zinc-400">Start your 14-day free trial. No credit card required.</p>
                            </div>

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

                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-zinc-400">Work Email</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                    placeholder="name@company.com"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-zinc-400">Company <span className="text-zinc-600">(optional)</span></label>
                                <input
                                    type="text"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                    placeholder="Acme Realty"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-zinc-400">Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                        placeholder="Min 8 characters"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {password && (
                                    <div className="mt-2 flex gap-1">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div
                                                key={i}
                                                className={`h-1 flex-1 rounded-full transition-colors ${
                                                    password.length >= i * 3
                                                        ? i <= 2
                                                            ? 'bg-red-500'
                                                            : i === 3
                                                              ? 'bg-yellow-500'
                                                              : 'bg-green-500'
                                                        : 'bg-zinc-800'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <motion.button
                                type="button"
                                disabled={!canProceedStep1}
                                onClick={() => setStep(2)}
                                whileHover={{ scale: canProceedStep1 ? 1.01 : 1 }}
                                whileTap={{ scale: canProceedStep1 ? 0.99 : 1 }}
                                className="w-full mt-2 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl uppercase tracking-wider hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </motion.button>

                            <p className="text-center text-[11px] text-zinc-600 mt-3">
                                By continuing, you agree to our{' '}
                                <Link href="/terms" className="text-zinc-400 hover:text-primary transition-colors">Terms</Link>{' '}
                                and{' '}
                                <Link href="/privacy" className="text-zinc-400 hover:text-primary transition-colors">Privacy Policy</Link>.
                            </p>
                        </motion.div>
                    )}

                    {/* ========== STEP 2: Plan Selection ========== */}
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

                            {/* Plan cards - scrollable */}
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
                                                            <div
                                                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                                                    isSelected ? 'border-primary' : 'border-zinc-700'
                                                                }`}
                                                            >
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

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="px-6 py-3.5 border border-zinc-800 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:border-zinc-600 transition-all"
                                >
                                    Back
                                </button>
                                <motion.button
                                    type="button"
                                    disabled={!canProceedStep2}
                                    onClick={() => setStep(3)}
                                    whileHover={{ scale: canProceedStep2 ? 1.01 : 1 }}
                                    whileTap={{ scale: canProceedStep2 ? 0.99 : 1 }}
                                    className="flex-1 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold py-3.5 rounded-xl uppercase tracking-wider hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    Continue
                                    <ArrowRight className="w-4 h-4" />
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                    {/* ========== STEP 3: Payment ========== */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
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

                            {/* Order summary mini */}
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
                                        <CreditCard className="w-5 h-5 mx-auto mb-2 text-zinc-400 peer-checked:text-primary" />
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
                                        <Building2 className="w-5 h-5 mx-auto mb-2 text-zinc-400 peer-checked:text-primary" />
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
                                    onClick={() => setStep(2)}
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

            <div className="mt-8 text-center text-sm text-zinc-500">
                Already have an account?{' '}
                <Link href="/login" className="text-white hover:text-primary font-medium transition-colors">
                    Sign in
                </Link>
            </div>
        </div>
    );
}

/* ====================================================================
   Page layout — split screen: hero left / form right
   ==================================================================== */
export default function SignupPage() {
    const features = [
        { icon: <Database className="w-5 h-5" />, text: '50,000+ verified data points' },
        { icon: <TrendingUp className="w-5 h-5" />, text: 'AI valuations with 95% accuracy' },
        { icon: <Users className="w-5 h-5" />, text: '500+ professionals on the platform' },
        { icon: <Shield className="w-5 h-5" />, text: 'Enterprise-grade security & compliance' },
    ];

    return (
        <div className="min-h-screen bg-zinc-950 flex">
            {/* ====== Left panel — Visual / branding ====== */}
            <div className="hidden lg:flex lg:w-[45%] xl:w-[48%] relative overflow-hidden flex-col justify-between">
                {/* Background */}
                <div className="absolute inset-0">
                    <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                        className="w-full h-full"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80"
                            alt="Modern property"
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
                            src="/branding/logo-full.png"
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
                                <span className="text-xs font-medium text-primary">14-day free trial</span>
                            </div>

                            <h1 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-tight mb-6">
                                The operating system for{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                    African real estate
                                </span>
                            </h1>

                            <p className="text-lg text-zinc-400 leading-relaxed max-w-md mb-10">
                                Join 500+ professionals using PROPMETRIK to make data-driven property decisions.
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
                                        <span className="text-sm text-zinc-300 font-medium">{feat.text}</span>
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
                        className="bg-zinc-900/50 backdrop-blur border border-zinc-800/50 rounded-xl p-5"
                    >
                        <p className="text-sm text-zinc-300 italic leading-relaxed mb-3">
                            &ldquo;PROPMETRIK transformed how we approach valuations in Ghana. The data quality is unmatched.&rdquo;
                        </p>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-yellow-400 flex items-center justify-center text-zinc-950 text-xs font-bold">
                                AK
                            </div>
                            <div>
                                <div className="text-xs font-bold text-white">Ama Koranteng</div>
                                <div className="text-[10px] text-zinc-500">Head of Valuations, GoldKey Properties</div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* ====== Right panel — Form ====== */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile header */}
                <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-900">
                    <Link href="/">
                        <Image
                            src="/branding/logo-full.png"
                            alt="PROPMETRIK"
                            width={140}
                            height={40}
                            className="h-8 w-auto object-contain"
                        />
                    </Link>
                    <Link
                        href="/login"
                        className="text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                    >
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
                            <SignupForm />
                        </Suspense>
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
        </div>
    );
}
