'use client';

import { useState, Suspense, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

function SignupForm() {
    const searchParams = useSearchParams();
    const plan = searchParams.get('plan');
    const category = searchParams.get('category');

    // Simplified pricing options for the dropdown
    const planOptions = [
        { value: '', label: 'Select a plan...' },
        { label: 'Full Platform - Core (GHS 390)', value: 'core-package' },
        { label: 'Full Platform - Pro (GHS 975)', value: 'pro-package' },
        { label: 'Full Platform - Enterprise (GHS 3,250)', value: 'enterprise' },
        { label: 'Property Mgmt - Basic (GHS 390)', value: 'basic' },
        { label: 'Property Mgmt - Premium (GHS 780)', value: 'premium' },
        { label: 'CRM - Starter (GHS 325)', value: 'starter' },
        { label: 'CRM - Professional (GHS 650)', value: 'professional' },
        { label: 'Data - Developer (GHS 260)', value: 'developer' },
        { label: 'Data - Business (GHS 650)', value: 'business' },
    ];

    const [isLoading, setIsLoading] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(plan || '');
    const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'bank_transfer'>('paystack');

    // Update local state if URL param changes
    useEffect(() => {
        if (plan) {
            setSelectedPlan(plan);
        }
    }, [plan]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate signup delay
        setTimeout(() => {
            setIsLoading(false);
            if (paymentMethod === 'paystack') {
                alert("Redirecting to Paystack Checkout...");
            } else {
                alert("Account created! Invoice sent to your email.");
            }
        }, 1500);
    };

    return (
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-2xl">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">Create an account</h1>
                <p className="text-zinc-400 text-sm mb-6">Get started with PROPMETRIK today</p>

                <div className="text-left">
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Selected Plan</label>
                    <select
                        value={selectedPlan}
                        onChange={(e) => setSelectedPlan(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer"
                        style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%22//www.w3.org/2000/svg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7em top 50%', backgroundSize: '.65em auto' }}
                    >
                        {planOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-zinc-300">First Name</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="John"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2 text-zinc-300">Last Name</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="Doe"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-zinc-300">Email Address</label>
                    <input
                        type="email"
                        required
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="name@company.com"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-zinc-300">Company Name</label>
                    <input
                        type="text"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="Optional"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-zinc-300">Password</label>
                    <input
                        type="password"
                        required
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        placeholder="Create a password"
                    />
                </div>

                {/* Payment Section */}
                <div className="pt-6 border-t border-zinc-800">
                    <h2 className="text-lg font-bold mb-4">Payment Details</h2>

                    <div className="space-y-4">
                        <div className="flex gap-4 mb-4">
                            <label className="flex-1 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="payment_method"
                                    className="peer sr-only"
                                    checked={paymentMethod === 'paystack'}
                                    onChange={() => setPaymentMethod('paystack')}
                                />
                                <div className="p-3 border border-zinc-700 rounded-lg text-center peer-checked:border-primary peer-checked:bg-primary/10 transition-all group-hover:border-zinc-500">
                                    <span className="text-sm font-bold">Paystack</span>
                                    <span className="block text-xs text-zinc-500">Card / MoMo</span>
                                </div>
                            </label>
                            <label className="flex-1 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="payment_method"
                                    className="peer sr-only"
                                    checked={paymentMethod === 'bank_transfer'}
                                    onChange={() => setPaymentMethod('bank_transfer')}
                                />
                                <div className="p-3 border border-zinc-700 rounded-lg text-center peer-checked:border-primary peer-checked:bg-primary/10 transition-all group-hover:border-zinc-500">
                                    <span className="text-sm font-bold">Bank Transfer</span>
                                    <span className="block text-xs text-zinc-500">Invoice</span>
                                </div>
                            </label>
                        </div>

                        <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 text-sm text-zinc-400">
                            {paymentMethod === 'paystack' ? (
                                <>
                                    <p className="mb-3">You will be redirected to Paystack's secure checkout to complete payment via:</p>
                                    <div className="flex gap-2 mb-2">
                                        <span className="h-6 px-2 bg-white text-zinc-900 rounded text-[10px] font-bold flex items-center justify-center">VISA</span>
                                        <span className="h-6 px-2 bg-white text-zinc-900 rounded text-[10px] font-bold flex items-center justify-center">Mastercard</span>
                                        <span className="h-6 px-2 bg-yellow-400 text-zinc-900 rounded text-[10px] font-bold flex items-center justify-center">MTN MoMo</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-2">All transactions are encrypted and secure.</p>
                                </>
                            ) : (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <p className="mb-4">An invoice with bank details will be sent to your email.</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Billing Phone Number</label>
                                            <input
                                                type="tel"
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                                placeholder="+233 24 123 4567"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Billing Address</label>
                                            <input
                                                type="text"
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                                placeholder="Street Address, City"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-md uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mt-6"
                >
                    {isLoading ? (
                        <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        paymentMethod === 'paystack' ? "Proceed to Paystack" : "Request Invoice"
                    )}
                </button>
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

export default function SignupPage() {
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
            >
                <Suspense fallback={<div className="text-white">Loading form...</div>}>
                    <SignupForm />
                </Suspense>
            </motion.div>
        </div>
    );
}
