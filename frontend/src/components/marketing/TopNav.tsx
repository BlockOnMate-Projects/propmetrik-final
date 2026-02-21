'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function TopNav() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { scrollY } = useScroll();
    const pathname = usePathname();

    useMotionValueEvent(scrollY, "change", (latest) => {
        setIsScrolled(latest > 50);
    });

    const isLinkActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname === href || pathname.startsWith(`${href}/`);
    };

    const navLinks = [
        { name: 'Home', href: '/' },
        { name: 'Services', href: '/services' },
        { name: 'About', href: '/about' },
        { name: 'Pricing', href: '/pricing' },
        { name: 'Contact', href: '/contact' },
        {
            name: 'Insights',
            href: '/insights',
            children: [
                { name: 'Ghana Real Estate Outlook', href: '/insights/outlook' },
                { name: 'Ghana Property Snapshot', href: '/insights/snapshot' },
                { name: 'Indices & Data', href: '/insights/indices' },
                { name: 'Policy Papers', href: '/insights/policy-papers' },
            ],
        },
        {
            name: 'Press',
            href: '/press',
            children: [
                { name: 'Press Releases', href: '/press/releases' },
                { name: 'Expert Commentary', href: '/press/commentary' },
                { name: 'Media Kit', href: '/press/media-kit' },
            ],
        },
    ];

    return (
        <motion.header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent",
                isScrolled ? "bg-zinc-950/80 backdrop-blur-md border-zinc-800 py-3 md:py-4" : "bg-transparent py-4 md:py-6"
            )}
        >
            <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/branding/logo-dark-bg.svg"
                        alt="PROPMETRIK Logo"
                        width={200}
                        height={55}
                        className="h-10 sm:h-14 w-auto object-contain"
                    />
                </Link>

                {/* Desktop nav */}
                <nav className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <div key={link.name} className="relative group">
                            <Link
                                href={link.href}
                                className={cn(
                                    "text-sm font-medium tracking-wide transition-colors hover:text-amber-500 uppercase",
                                    isLinkActive(link.href) ? "text-amber-500" : "text-zinc-400"
                                )}
                            >
                                {link.name}
                            </Link>

                            {link.children && (
                                <div className="absolute left-0 top-full mt-3 w-56 rounded-lg border border-zinc-800 bg-zinc-950/95 backdrop-blur-md opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150">
                                    <div className="py-2">
                                        {link.children.map((child) => (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={cn(
                                                    "block px-4 py-2 text-xs uppercase tracking-wide transition-colors",
                                                    pathname === child.href ? "text-amber-500 bg-zinc-900" : "text-zinc-400 hover:text-white hover:bg-zinc-900/70"
                                                )}
                                            >
                                                {child.name}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </nav>

                <div className="flex items-center gap-3 sm:gap-6">
                    <Link
                        href="/login"
                        className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-amber-500 transition-colors hidden sm:inline"
                    >
                        Login
                    </Link>
                    <Link
                        href="/signup"
                        className="px-4 sm:px-6 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-sm transition-all bg-amber-600 text-white hover:bg-amber-700"
                    >
                        Get Started
                    </Link>

                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setMobileOpen(o => !o)}
                        className="md:hidden p-1.5 text-zinc-400 hover:text-white transition-colors"
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile dropdown */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden overflow-hidden bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800"
                    >
                        <nav className="flex flex-col py-2 px-4">
                            {navLinks.map((link) => (
                                <div key={link.name} className="border-b border-zinc-800/50">
                                    <Link
                                        href={link.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={cn(
                                            "py-3 text-sm font-medium tracking-wide uppercase transition-colors block",
                                            isLinkActive(link.href) ? "text-amber-500" : "text-zinc-400 hover:text-white"
                                        )}
                                    >
                                        {link.name}
                                    </Link>

                                    {link.children && (
                                        <div className="pb-2 pl-3">
                                            {link.children.map((child) => (
                                                <Link
                                                    key={child.href}
                                                    href={child.href}
                                                    onClick={() => setMobileOpen(false)}
                                                    className={cn(
                                                        "block py-2 text-xs uppercase tracking-wide transition-colors",
                                                        pathname === child.href ? "text-amber-500" : "text-zinc-500 hover:text-zinc-200"
                                                    )}
                                                >
                                                    {child.name}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <Link
                                href="/login"
                                onClick={() => setMobileOpen(false)}
                                className="py-3 text-sm font-medium tracking-wide uppercase text-zinc-400 hover:text-amber-500 transition-colors sm:hidden"
                            >
                                Login
                            </Link>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.header>
    );
}
