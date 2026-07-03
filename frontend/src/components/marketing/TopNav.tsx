'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import MarketTicker from './MarketTicker';

export default function TopNav() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { scrollY } = useScroll();
    const pathname = usePathname();
    const { theme, resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // Detect if we're on a white background page (marketplace or property detail)
    const isWhiteBackground = pathname?.startsWith('/marketplace') || pathname?.startsWith('/apply');
    // Light nav (white bg) OR light theme → use the dark-text logo so it's readable.
    const useLightLogo = isWhiteBackground || (mounted && resolvedTheme !== 'dark');

    // Tenant Portal lives on the tenant.* subdomain of the current host — env-aware:
    // prod → https://tenant.propmetrik.com, dev → http://tenant.localhost:3000.
    // Falls back to the prod URL for SSR / before mount.
    const tenantPortalUrl = mounted && typeof window !== 'undefined'
        ? `${window.location.protocol}//tenant.${window.location.host}`
        : 'https://tenant.propmetrik.com';

    useMotionValueEvent(scrollY, "change", (latest) => {
        setIsScrolled(latest > 50);
    });

    const isLinkActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname === href || pathname.startsWith(`${href}/`);
    };

    const navLinks: Array<{ name: string; href: string; children?: { name: string; href: string }[] }> = [
        { name: 'Home', href: '/' },
        { name: 'Marketplace', href: '/marketplace' },
        { name: 'Services', href: '/services' },
        { name: 'About', href: '/about' },
        { name: 'Pricing', href: '/pricing' },
        // Insights & Press intentionally omitted from the top nav — they live in the footer (Footer.tsx).
    ];

    return (
        <motion.header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
                isWhiteBackground
                    ? isScrolled
                        ? "bg-card/95 backdrop-blur-md border-border shadow-sm"
                        : "bg-card border-gray-100"
                    : isScrolled
                        ? "bg-background/80 backdrop-blur-md border-border"
                        : "bg-transparent border-transparent"
            )}
        >
            {/* Live Ghana market-intelligence ticker — full-width strip ABOVE the nav */}
            <MarketTicker />

            <div className={cn(
                "container mx-auto px-4 md:px-6 flex items-center justify-between",
                // Tightened to absorb the ticker strip above without growing the
                // overall fixed-header height (which page top-paddings depend on).
                isScrolled ? "py-2 md:py-2.5" : "py-2.5 md:py-3"
            )}>
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src={useLightLogo ? "/branding/logo-transparent.svg" : "/branding/logo-dark-bg.svg"}
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
                                    "text-sm font-medium tracking-wide transition-colors uppercase",
                                    isWhiteBackground
                                        ? isLinkActive(link.href) ? "text-indigo-600" : "text-muted-foreground hover:text-indigo-600"
                                        : isLinkActive(link.href) ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"
                                )}
                            >
                                {link.name}
                            </Link>

                            {link.children && (
                                <div className={cn(
                                    "absolute left-0 top-full mt-3 w-56 rounded-lg border opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150",
                                    isWhiteBackground
                                        ? "bg-card border-border shadow-lg"
                                        : "bg-background/95 border-border backdrop-blur-md"
                                )}>
                                    <div className="py-2">
                                        {link.children.map((child) => (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={cn(
                                                    "block px-4 py-2 text-xs uppercase tracking-wide transition-colors",
                                                    isWhiteBackground
                                                        ? pathname === child.href ? "text-indigo-600 bg-indigo-50" : "text-muted-foreground hover:text-indigo-600 hover:bg-muted"
                                                        : pathname === child.href ? "text-amber-500 bg-card" : "text-muted-foreground hover:text-foreground hover:bg-card/70"
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
                    {mounted && (
                        <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
                            {([
                                { id: 'light', icon: Sun, label: 'Light' },
                                { id: 'dark', icon: Moon, label: 'Dark' },
                                { id: 'system', icon: Monitor, label: 'System' },
                            ] as const).map(({ id, icon: Icon, label }) => (
                                <button
                                    key={id}
                                    onClick={() => setTheme(id)}
                                    aria-label={`${label} theme`}
                                    aria-pressed={theme === id}
                                    title={label}
                                    className={cn(
                                        "p-1.5 rounded-full transition-colors",
                                        theme === id
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                </button>
                            ))}
                        </div>
                    )}
                    <a
                        href={tenantPortalUrl}
                        className={cn(
                            "text-xs font-bold uppercase tracking-widest transition-colors hidden sm:inline",
                            isWhiteBackground
                                ? "text-muted-foreground hover:text-indigo-600"
                                : "text-muted-foreground hover:text-amber-500"
                        )}
                    >
                        Tenant Portal
                    </a>
                    <Link
                        href="/login"
                        className={cn(
                            "text-xs font-bold uppercase tracking-widest transition-colors hidden sm:inline",
                            isWhiteBackground
                                ? "text-muted-foreground hover:text-indigo-600"
                                : "text-muted-foreground hover:text-amber-500"
                        )}
                    >
                        Login
                    </Link>
                    <Link
                        href="/signup"
                        className={cn(
                            "px-4 sm:px-6 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-sm transition-all",
                            isWhiteBackground
                                ? "bg-indigo-600 text-foreground hover:bg-indigo-700"
                                : "bg-amber-600 text-foreground hover:bg-amber-700"
                        )}
                    >
                        Get Started
                    </Link>

                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setMobileOpen(o => !o)}
                        className={cn(
                            "md:hidden p-1.5 transition-colors",
                            isWhiteBackground
                                ? "text-muted-foreground hover:text-indigo-600"
                                : "text-muted-foreground hover:text-foreground"
                        )}
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
                        className={cn(
                            "md:hidden overflow-hidden backdrop-blur-md border-t",
                            isWhiteBackground
                                ? "bg-card/95 border-border"
                                : "bg-background/95 border-border"
                        )}
                    >
                        <nav className="flex flex-col py-2 px-4">
                            {navLinks.map((link) => (
                                <div key={link.name} className={cn("border-b", isWhiteBackground ? "border-gray-100" : "border-border/50")}>
                                    <Link
                                        href={link.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={cn(
                                            "py-3 text-sm font-medium tracking-wide uppercase transition-colors block",
                                            isWhiteBackground
                                                ? isLinkActive(link.href) ? "text-indigo-600" : "text-muted-foreground hover:text-indigo-600"
                                                : isLinkActive(link.href) ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
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
                                                        isWhiteBackground
                                                            ? pathname === child.href ? "text-indigo-600" : "text-muted-foreground hover:text-indigo-600"
                                                            : pathname === child.href ? "text-amber-500" : "text-muted-foreground hover:text-zinc-200"
                                                    )}
                                                >
                                                    {child.name}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <a
                                href={tenantPortalUrl}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    "py-3 text-sm font-medium tracking-wide uppercase transition-colors sm:hidden",
                                    isWhiteBackground
                                        ? "text-muted-foreground hover:text-indigo-600"
                                        : "text-muted-foreground hover:text-amber-500"
                                )}
                            >
                                Tenant Portal
                            </a>
                            <Link
                                href="/login"
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    "py-3 text-sm font-medium tracking-wide uppercase transition-colors sm:hidden",
                                    isWhiteBackground
                                        ? "text-muted-foreground hover:text-indigo-600"
                                        : "text-muted-foreground hover:text-amber-500"
                                )}
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
