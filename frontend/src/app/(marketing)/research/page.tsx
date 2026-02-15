'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, Download, TrendingUp, Calendar } from 'lucide-react';

export default function ResearchPage() {
    const reports = [
        {
            title: 'Ghana Residential Market Report Q4 2025',
            description: 'Comprehensive analysis of residential property trends across Accra, Kumasi, and Takoradi',
            date: 'December 2025',
            category: 'Residential',
            pages: 45,
            featured: true
        },
        {
            title: 'Commercial Real Estate Outlook 2026',
            description: 'Office, retail, and industrial market forecasts for Greater Accra Region',
            date: 'January 2026',
            category: 'Commercial',
            pages: 38,
            featured: true
        },
        {
            title: 'Land Values & Development Trends',
            description: 'Analysis of undeveloped land pricing and infrastructure impact assessment',
            date: 'November 2025',
            category: 'Land',
            pages: 32,
            featured: false
        },
        {
            title: 'Construction Cost Index Report',
            description: 'Quarterly update on material and labor costs across Ghana',
            date: 'December 2025',
            category: 'Data',
            pages: 24,
            featured: false
        },
        {
            title: 'Kumasi Property Market Analysis',
            description: 'Deep dive into Ashanti Region property market dynamics',
            date: 'October 2025',
            category: 'Regional',
            pages: 28,
            featured: false
        },
        {
            title: 'Ghana Real Estate Investment Guide',
            description: 'Comprehensive guide for international investors entering Ghana market',
            date: 'September 2025',
            category: 'Investment',
            pages: 52,
            featured: false
        },
    ];

    const categories = ['All', 'Residential', 'Commercial', 'Land', 'Data', 'Regional', 'Investment'];

    return (
        <main className="pt-32 pb-24 bg-zinc-950">
            {/* Hero Section */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-3xl"
                    >
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
                            Research &{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Market Insights
                            </span>
                        </h1>
                        <p className="text-xl text-zinc-400 leading-relaxed">
                            Access our comprehensive library of market reports, trend analyses, and investment guides for Ghana's real estate market.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Stats */}
            <section className="border-y border-zinc-800 py-12">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        {[
                            { label: 'Reports Published', value: '48+' },
                            { label: 'Markets Covered', value: '12' },
                            { label: 'Data Points', value: '50K+' },
                            { label: 'Subscribers', value: '300+' },
                        ].map((stat, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="text-center"
                            >
                                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">{stat.value}</div>
                                <div className="text-sm text-zinc-400 uppercase tracking-wider">{stat.label}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Category Filter */}
            <section className="py-12">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="flex flex-wrap gap-3 justify-center">
                        {categories.map((category) => (
                            <button
                                key={category}
                                className="px-6 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-sm font-medium text-zinc-300 hover:border-primary hover:text-primary transition-colors"
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Featured Reports */}
            <section className="py-12">
                <div className="container mx-auto px-4 md:px-6">
                    <h2 className="text-3xl font-bold text-white mb-8">Featured Reports</h2>

                    <div className="grid lg:grid-cols-2 gap-8 mb-16">
                        {reports.filter(r => r.featured).map((report, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="group bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                            >
                                <div className="aspect-video bg-gradient-to-br from-primary/20 to-yellow-400/20 flex items-center justify-center">
                                    <FileText className="w-16 h-16 text-primary" />
                                </div>

                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                            {report.category}
                                        </span>
                                        <span className="text-sm text-zinc-500 flex items-center gap-1">
                                            <Calendar className="w-4 h-4" />
                                            {report.date}
                                        </span>
                                    </div>

                                    <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                                        {report.title}
                                    </h3>

                                    <p className="text-zinc-400 mb-4">{report.description}</p>

                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-zinc-500">{report.pages} pages</span>
                                        <Link href="/contact">
                                            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-zinc-950 font-bold rounded hover:bg-primary/90 transition-colors">
                                                <Download className="w-4 h-4" />
                                                Download
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <h2 className="text-3xl font-bold text-white mb-8">All Reports</h2>

                    <div className="space-y-4">
                        {reports.filter(r => !r.featured).map((report, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.05 }}
                                className="group bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors"
                            >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                                {report.category}
                                            </span>
                                            <span className="text-sm text-zinc-500 flex items-center gap-1">
                                                <Calendar className="w-4 h-4" />
                                                {report.date}
                                            </span>
                                        </div>

                                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">
                                            {report.title}
                                        </h3>

                                        <p className="text-zinc-400 text-sm">{report.description}</p>
                                    </div>

                                    <div className="flex items-center gap-4 shrink-0">
                                        <span className="text-sm text-zinc-500">{report.pages} pages</span>
                                        <Link href="/contact">
                                            <button className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border border-zinc-700 text-white font-medium rounded hover:border-primary hover:text-primary transition-colors">
                                                <Download className="w-4 h-4" />
                                                Download
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-16 border-t border-zinc-800">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                            Get Full Access to Our Research
                        </h2>
                        <p className="text-xl text-zinc-400 mb-8">
                            Subscribe to PROPMETRIK Market Intelligence for unlimited access to all reports, custom research, and real-time market data.
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
                                    className="px-8 py-4 border-2 border-zinc-700 text-white font-bold tracking-wider uppercase hover:border-primary hover:text-primary transition-colors"
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
