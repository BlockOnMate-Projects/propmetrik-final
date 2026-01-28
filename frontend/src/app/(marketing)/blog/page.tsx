'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Calendar, User, ArrowRight, TrendingUp } from 'lucide-react';

export default function BlogPage() {
    const featuredPost = {
        title: 'Ghana\'s Real Estate Market: 2026 Outlook and Investment Opportunities',
        excerpt: 'An in-depth analysis of emerging trends, growth sectors, and key investment opportunities in Ghana\'s evolving real estate landscape.',
        date: 'January 15, 2026',
        author: 'PropMetrik Research Team',
        category: 'Market Analysis',
        readTime: '8 min read',
        image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80'
    };

    const posts = [
        {
            title: 'Construction Cost Trends: What Developers Need to Know',
            excerpt: 'Material costs continue to fluctuate. Here\'s how smart developers are managing budgets in 2026.',
            date: 'January 12, 2026',
            author: 'Kofi Mensah',
            category: 'Development',
            readTime: '5 min read'
        },
        {
            title: 'Understanding Property Valuations in Ghana',
            excerpt: 'A comprehensive guide to valuation methodologies used in the Ghanaian market.',
            date: 'January 8, 2026',
            author: 'Ama Serwaa',
            category: 'Valuation',
            readTime: '7 min read'
        },
        {
            title: 'The Rise of Proptech in West Africa',
            excerpt: 'How technology is transforming real estate transactions across the region.',
            date: 'January 5, 2026',
            author: 'PropMetrik Research Team',
            category: 'Technology',
            readTime: '6 min read'
        },
        {
            title: 'Kumasi Real Estate: An Emerging Market',
            excerpt: 'Why investors are increasingly looking beyond Accra to Ghana\'s second city.',
            date: 'December 28, 2025',
            author: 'Kwame Asante',
            category: 'Markets',
            readTime: '6 min read'
        },
        {
            title: 'Navigating Land Title Verification in Ghana',
            excerpt: 'Essential steps to protect your investment and avoid land disputes.',
            date: 'December 20, 2025',
            author: 'Ama Serwaa',
            category: 'Legal',
            readTime: '10 min read'
        },
        {
            title: 'Commercial Real Estate Trends Q4 2025',
            excerpt: 'Office, retail, and industrial market performance across Greater Accra.',
            date: 'December 15, 2025',
            author: 'PropMetrik Research Team',
            category: 'Commercial',
            readTime: '8 min read'
        },
    ];

    const categories = ['All', 'Market Analysis', 'Development', 'Valuation', 'Technology', 'Legal', 'Commercial'];

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
                            Market Insights &{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                                Industry News
                            </span>
                        </h1>
                        <p className="text-xl text-zinc-400 leading-relaxed">
                            Expert perspectives on Ghana's real estate market, industry trends, and proptech innovation.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Category Filter */}
            <section className="pb-12">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="flex flex-wrap gap-3">
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

            {/* Featured Post */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="group bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                    >
                        <div className="grid lg:grid-cols-2 gap-0">
                            <div className="relative aspect-video lg:aspect-auto">
                                <img
                                    src={featuredPost.image}
                                    alt={featuredPost.title}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute top-4 left-4">
                                    <span className="px-3 py-1 bg-primary text-zinc-950 text-xs font-bold rounded">
                                        FEATURED
                                    </span>
                                </div>
                            </div>

                            <div className="p-8 lg:p-12 flex flex-col justify-center">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                        {featuredPost.category}
                                    </span>
                                    <span className="text-sm text-zinc-500">{featuredPost.readTime}</span>
                                </div>

                                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 group-hover:text-primary transition-colors">
                                    {featuredPost.title}
                                </h2>

                                <p className="text-zinc-400 text-lg mb-6">
                                    {featuredPost.excerpt}
                                </p>

                                <div className="flex items-center gap-4 mb-6">
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                        <User className="w-4 h-4" />
                                        {featuredPost.author}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                        <Calendar className="w-4 h-4" />
                                        {featuredPost.date}
                                    </div>
                                </div>

                                <Link href="/blog/ghana-2026-outlook">
                                    <button className="flex items-center gap-2 text-primary font-bold hover:gap-4 transition-all">
                                        Read Article <ArrowRight className="w-4 h-4" />
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Blog Posts Grid */}
            <section className="pb-16">
                <div className="container mx-auto px-4 md:px-6">
                    <h2 className="text-3xl font-bold text-white mb-8">Recent Articles</h2>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {posts.map((post, index) => (
                            <motion.article
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="group bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                            >
                                <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                                    <TrendingUp className="w-12 h-12 text-zinc-700" />
                                </div>

                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                            {post.category}
                                        </span>
                                        <span className="text-xs text-zinc-500">{post.readTime}</span>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-primary transition-colors line-clamp-2">
                                        {post.title}
                                    </h3>

                                    <p className="text-zinc-400 text-sm mb-4 line-clamp-2">
                                        {post.excerpt}
                                    </p>

                                    <div className="flex items-center gap-3 text-xs text-zinc-500 mb-4">
                                        <div className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {post.author}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {post.date}
                                        </div>
                                    </div>

                                    <Link href={`/blog/${post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                                        <button className="flex items-center gap-2 text-primary text-sm font-bold hover:gap-4 transition-all">
                                            Read More <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </Link>
                                </div>
                            </motion.article>
                        ))}
                    </div>
                </div>
            </section>

            {/* Newsletter CTA */}
            <section className="py-16 border-t border-zinc-800">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                            Stay Informed with Our Newsletter
                        </h2>
                        <p className="text-xl text-zinc-400 mb-8">
                            Get weekly insights, market updates, and exclusive research delivered to your inbox.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
                            <input
                                type="email"
                                placeholder="Enter your email"
                                className="flex-1 px-6 py-4 bg-zinc-900 border border-zinc-800 text-white rounded focus:outline-none focus:border-primary transition-colors"
                            />
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="px-8 py-4 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold rounded hover:shadow-lg hover:shadow-primary/50 transition-shadow"
                            >
                                Subscribe
                            </motion.button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
