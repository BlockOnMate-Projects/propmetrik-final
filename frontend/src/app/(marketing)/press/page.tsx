'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Calendar, ExternalLink, Award, Users } from 'lucide-react';

export default function PressPage() {
    const pressReleases = [
        {
            title: 'PROPMETRIK Raises $2M in Seed Funding to Expand Across West Africa',
            date: 'January 10, 2026',
            excerpt: 'Leading proptech platform secures funding from prominent African VCs to accelerate growth and product development.',
            category: 'Funding'
        },
        {
            title: 'PROPMETRIK Partners with Ghana Lands Commission for Digital Title Verification',
            date: 'December 15, 2025',
            excerpt: 'Strategic partnership aims to streamline property transactions and reduce land disputes through technology.',
            category: 'Partnership'
        },
        {
            title: 'PROPMETRIK Surpasses 5,000 Property Valuations Milestone',
            date: 'November 28, 2025',
            excerpt: 'Platform celebrates major milestone as adoption accelerates among banks, developers, and investors.',
            category: 'Milestone'
        },
        {
            title: 'PROPMETRIK Wins "Best Proptech Innovation" at Ghana Tech Awards',
            date: 'October 20, 2025',
            excerpt: 'Recognition highlights platform\'s impact on modernizing Ghana\'s real estate industry.',
            category: 'Award'
        },
    ];

    const mediaKit = [
        { name: 'Company Fact Sheet', format: 'PDF', size: '245 KB' },
        { name: 'High-Res Logos', format: 'ZIP', size: '1.2 MB' },
        { name: 'Leadership Photos', format: 'ZIP', size: '3.5 MB' },
        { name: 'Brand Guidelines', format: 'PDF', size: '890 KB' },
    ];

    const coverage = [
        {
            outlet: 'Ghana Business News',
            headline: 'How PROPMETRIK is Revolutionizing Real Estate Valuations',
            date: 'January 2026',
            link: '#'
        },
        {
            outlet: 'TechCabal',
            headline: 'Meet the Ghanaian Startup Bringing Transparency to Property Markets',
            date: 'December 2025',
            link: '#'
        },
        {
            outlet: 'African Business Magazine',
            headline: 'Proptech\'s Rise in West Africa: A Case Study',
            date: 'November 2025',
            link: '#'
        },
        {
            outlet: 'Ventures Africa',
            headline: 'Ghana\'s PROPMETRIK Secures Strategic Partnerships',
            date: 'October 2025',
            link: '#'
        },
    ];

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
                            Press &{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Media
                            </span>
                        </h1>
                        <p className="text-xl text-zinc-400 leading-relaxed mb-8">
                            Latest news, announcements, and media coverage of PROPMETRIK's mission to transform real estate in Ghana and beyond.
                        </p>
                        <Link href="/contact">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="px-6 py-3 bg-primary text-zinc-950 font-bold rounded hover:bg-primary/90 transition-colors"
                            >
                                Media Inquiries
                            </motion.button>
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* Press Releases */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <h2 className="text-3xl font-bold text-white mb-8">Press Releases</h2>

                    <div className="space-y-6">
                        {pressReleases.map((release, index) => (
                            <motion.article
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="group bg-zinc-900 border border-zinc-800 rounded-lg p-6 md:p-8 hover:border-primary/50 transition-colors"
                            >
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                                {release.category}
                                            </span>
                                            <span className="text-sm text-zinc-500 flex items-center gap-1">
                                                <Calendar className="w-4 h-4" />
                                                {release.date}
                                            </span>
                                        </div>

                                        <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                                            {release.title}
                                        </h3>

                                        <p className="text-zinc-400 mb-4">
                                            {release.excerpt}
                                        </p>
                                    </div>

                                    <Link href={`/press/${release.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                                        <button className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border border-zinc-700 text-white font-medium rounded hover:border-primary hover:text-primary transition-colors shrink-0">
                                            Read Full Release
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                    </Link>
                                </div>
                            </motion.article>
                        ))}
                    </div>
                </div>
            </section>

            {/* Media Coverage */}
            <section className="py-16 border-y border-zinc-800">
                <div className="container mx-auto px-4 md:px-6">
                    <h2 className="text-3xl font-bold text-white mb-8">In the News</h2>

                    <div className="grid md:grid-cols-2 gap-6">
                        {coverage.map((item, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="group bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors"
                            >
                                <div className="text-sm text-zinc-500 mb-2">{item.outlet} · {item.date}</div>
                                <h3 className="text-xl font-bold text-white mb-4 group-hover:text-primary transition-colors">
                                    {item.headline}
                                </h3>
                                <a href={item.link} target="_blank" rel="noopener noreferrer">
                                    <button className="flex items-center gap-2 text-primary text-sm font-bold hover:gap-4 transition-all">
                                        Read Article <ExternalLink className="w-4 h-4" />
                                    </button>
                                </a>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Media Kit */}
            <section className="py-16">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid lg:grid-cols-2 gap-12">
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-6">Media Kit</h2>
                            <p className="text-zinc-400 mb-8">
                                Download our media kit for logos, brand assets, company information, and leadership photos.
                            </p>

                            <div className="space-y-4">
                                {mediaKit.map((item, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: -20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: index * 0.1 }}
                                        className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-primary/50 transition-colors"
                                    >
                                        <div>
                                            <div className="font-bold text-white mb-1">{item.name}</div>
                                            <div className="text-sm text-zinc-500">{item.format} · {item.size}</div>
                                        </div>
                                        <button className="px-4 py-2 bg-primary text-zinc-950 font-bold rounded hover:bg-primary/90 transition-colors">
                                            Download
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold text-white mb-6">Contact Press Team</h2>
                            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
                                <div className="space-y-6">
                                    <div>
                                        <div className="text-sm text-zinc-500 mb-1">Media Inquiries</div>
                                        <div className="text-white font-medium">press@propmetrik.com</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-zinc-500 mb-1">General Information</div>
                                        <div className="text-white font-medium">info@propmetrik.com</div>
                                    </div>
                                    <div>
                                        <div className="text-sm text-zinc-500 mb-1">Office Address</div>
                                        <div className="text-white font-medium">PROPMETRIK<br />Accra, Ghana</div>
                                    </div>
                                </div>

                                <div className="mt-8 pt-8 border-t border-zinc-800">
                                    <div className="text-sm text-zinc-400 mb-4">
                                        For urgent media requests, please contact us directly via email. We typically respond within 24 hours.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Awards & Recognition */}
            <section className="py-16 bg-zinc-900/50">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-white mb-4">Awards & Recognition</h2>
                        <p className="text-zinc-400">Celebrating our commitment to innovation and excellence</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                        {[
                            { name: 'Best Proptech Innovation', org: 'Ghana Tech Awards 2025' },
                            { name: 'Top 10 Startups to Watch', org: 'African Business Magazine 2025' },
                            { name: 'Innovation in Real Estate', org: 'West Africa Proptech Summit 2025' },
                        ].map((award, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="text-center p-6 bg-zinc-900 border border-zinc-800 rounded-lg"
                            >
                                <Award className="w-12 h-12 text-primary mx-auto mb-4" />
                                <div className="font-bold text-white mb-2">{award.name}</div>
                                <div className="text-sm text-zinc-400">{award.org}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
}
