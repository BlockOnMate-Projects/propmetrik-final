'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function TopNav() {
    const [isScrolled, setIsScrolled] = useState(false);
    const { scrollY } = useScroll();
    const pathname = usePathname();

    useMotionValueEvent(scrollY, "change", (latest) => {
        setIsScrolled(latest > 50);
    });

    const navLinks = [
        { name: 'About', href: '/about' },
        { name: 'Services', href: '/services' },
        { name: 'Pricing', href: '/pricing' },
    ];

    return (
        <motion.header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent",
                isScrolled ? "bg-zinc-950/80 backdrop-blur-md border-zinc-800 py-4" : "bg-transparent py-6"
            )}
        >
            <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/branding/logo-dark-bg.svg"
                        alt="PROPMETRIK Logo"
                        width={200}
                        height={55}
                        className="h-14 w-auto object-contain"
                    />
                </Link>

                <nav className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={cn(
                                "text-sm font-medium tracking-wide transition-colors hover:text-amber-500 uppercase",
                                pathname === link.href ? "text-amber-500" : "text-zinc-400"
                            )}
                        >
                            {link.name}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-6">
                    <Link
                        href="/login"
                        className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-amber-500 transition-colors"
                    >
                        Login
                    </Link>
                    <Link
                        href="/signup"
                        className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm transition-all bg-amber-600 text-white hover:bg-amber-700"
                    >
                        Get Started
                    </Link>
                </div>
            </div>
        </motion.header>
    );
}
