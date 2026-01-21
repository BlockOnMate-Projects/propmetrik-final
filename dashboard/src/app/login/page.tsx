'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate login delay
        setTimeout(() => {
            setIsLoading(false);
            // Handle actual login logic here
            alert("Login functionality to be implemented with backend.");
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <Link href="/" className="mb-8">
                <Image
                    src="/branding/logo-full.png"
                    alt="Propmetrik Logo"
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
                    <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
                    <p className="text-zinc-400 text-sm">Enter your credentials to access your account</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
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
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-zinc-300">Password</label>
                            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                                Forgot password?
                            </Link>
                        </div>
                        <input
                            type="password"
                            required
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-md uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            "Sign In"
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center text-sm text-zinc-500">
                    Don't have an account?{' '}
                    <Link href="/signup" className="text-white hover:text-primary font-medium transition-colors">
                        Sign up
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
