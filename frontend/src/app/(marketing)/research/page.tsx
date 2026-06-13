'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, Calendar } from 'lucide-react';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ResearchPage() {
    const [reports, setReports] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        publicationsApi
            .getPublished({ limit: 60 })
            .then((res) => setReports(res.data || []))
            .catch(() => setReports([]))
            .finally(() => setLoading(false));
    }, []);

    // Most recent two surface as "featured" (the API returns newest first).
    const featured = reports.slice(0, 2);
    const rest = reports.slice(2);

    return (
        <main className="pt-32 pb-24 bg-background">
            {/* Hero Section */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-3xl"
                    >
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6">
                            Research &{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Market Insights
                            </span>
                        </h1>
                        <p className="text-xl text-muted-foreground leading-relaxed">
                            Our library of market reports, trend analyses, and investment guides for Ghana's real estate market.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Reports */}
            <section className="py-12">
                <div className="container mx-auto px-4 md:px-6">
                    {loading ? (
                        <div className="grid lg:grid-cols-2 gap-8">
                            {[...Array(2)].map((_, idx) => (
                                <div key={idx} className="bg-card border border-border rounded-lg p-6 animate-pulse h-48" />
                            ))}
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="text-center py-20 border border-border rounded-lg bg-card">
                            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-foreground mb-2">Research coming soon</h3>
                            <p className="text-muted-foreground max-w-md mx-auto">
                                We're preparing our first market reports. Subscribe to be notified when they're published.
                            </p>
                        </div>
                    ) : (
                        <>
                            {featured.length > 0 && (
                                <>
                                    <h2 className="text-3xl font-bold text-foreground mb-8">Featured Reports</h2>
                                    <div className="grid lg:grid-cols-2 gap-8 mb-16">
                                        {featured.map((report) => (
                                            <Link key={report.id} href={`/insights/${report.slug}`}>
                                                <motion.div
                                                    initial={{ opacity: 0, y: 20 }}
                                                    whileInView={{ opacity: 1, y: 0 }}
                                                    viewport={{ once: true }}
                                                    className="group bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors h-full"
                                                >
                                                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-yellow-400/20 flex items-center justify-center">
                                                        <FileText className="w-16 h-16 text-primary" />
                                                    </div>
                                                    <div className="p-6">
                                                        <span className="text-sm text-muted-foreground flex items-center gap-1 mb-3">
                                                            <Calendar className="w-4 h-4" />
                                                            {formatDate(report.published_at)}
                                                        </span>
                                                        <h3 className="text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                                                            {report.title}
                                                        </h3>
                                                        {report.excerpt && <p className="text-muted-foreground">{report.excerpt}</p>}
                                                    </div>
                                                </motion.div>
                                            </Link>
                                        ))}
                                    </div>
                                </>
                            )}

                            <h2 className="text-3xl font-bold text-foreground mb-8">All Reports</h2>
                            <div className="space-y-4">
                                {rest.map((report) => (
                                    <Link key={report.id} href={`/insights/${report.slug}`}>
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
                                        >
                                            <span className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                                                <Calendar className="w-4 h-4" />
                                                {formatDate(report.published_at)}
                                            </span>
                                            <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                                                {report.title}
                                            </h3>
                                            {report.excerpt && <p className="text-muted-foreground text-sm">{report.excerpt}</p>}
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* CTA */}
            <section className="py-16 border-t border-border">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                            Get Full Access to Our Research
                        </h2>
                        <p className="text-xl text-muted-foreground mb-8">
                            Subscribe to PROPMETRIK Market Intelligence for access to our reports, custom research, and market data.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link href="/services/market-intelligence">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold tracking-wider uppercase hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                                >
                                    View Plans
                                </motion.button>
                            </Link>
                            <Link href="/contact">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="px-8 py-4 border-2 border-border text-foreground font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
                                >
                                    Contact Sales
                                </motion.button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
