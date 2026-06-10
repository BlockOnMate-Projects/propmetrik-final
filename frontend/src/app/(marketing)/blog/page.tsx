'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Calendar, User, ArrowRight, TrendingUp } from 'lucide-react';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function humanizeType(type: string): string {
    return (type || 'Article').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function authorOf(p: Publication): string {
    return p.author_name || p.author_title || 'PROPMETRIK Research';
}

export default function BlogPage() {
    const [posts, setPosts] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        publicationsApi
            .getPublished({ limit: 60 })
            .then((res) => setPosts(res.data || []))
            .catch(() => setPosts([]))
            .finally(() => setLoading(false));
    }, []);

    const featured = posts[0];
    const rest = posts.slice(1);

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

            {loading ? (
                <section className="pb-16">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg h-72 animate-pulse" />
                    </div>
                </section>
            ) : posts.length === 0 ? (
                <section className="pb-16">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="text-center py-20 border border-zinc-800 rounded-lg bg-zinc-900">
                            <TrendingUp className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Articles coming soon</h3>
                            <p className="text-zinc-400 max-w-md mx-auto">
                                We're preparing our first market insights. Subscribe below to be notified when they're published.
                            </p>
                        </div>
                    </div>
                </section>
            ) : (
                <>
                    {/* Featured Post */}
                    <section className="pb-16">
                        <div className="container mx-auto px-4 md:px-6">
                            <Link href={`/insights/${featured.slug}`}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className="group bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                                >
                                    <div className="grid lg:grid-cols-2 gap-0">
                                        <div className="relative aspect-video lg:aspect-auto bg-gradient-to-br from-primary/20 to-yellow-400/20 flex items-center justify-center">
                                            {featured.cover_image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={featured.cover_image_url} alt={featured.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <TrendingUp className="w-16 h-16 text-primary" />
                                            )}
                                            <div className="absolute top-4 left-4">
                                                <span className="px-3 py-1 bg-primary text-zinc-950 text-xs font-bold rounded">FEATURED</span>
                                            </div>
                                        </div>
                                        <div className="p-8 lg:p-12 flex flex-col justify-center">
                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                                    {humanizeType(featured.type)}
                                                </span>
                                                {featured.reading_time_minutes > 0 && (
                                                    <span className="text-sm text-zinc-500">{featured.reading_time_minutes} min read</span>
                                                )}
                                            </div>
                                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 group-hover:text-primary transition-colors">
                                                {featured.title}
                                            </h2>
                                            {featured.excerpt && <p className="text-zinc-400 text-lg mb-6">{featured.excerpt}</p>}
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="flex items-center gap-2 text-sm text-zinc-500">
                                                    <User className="w-4 h-4" />
                                                    {authorOf(featured)}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-zinc-500">
                                                    <Calendar className="w-4 h-4" />
                                                    {formatDate(featured.published_at)}
                                                </div>
                                            </div>
                                            <span className="flex items-center gap-2 text-primary font-bold group-hover:gap-4 transition-all">
                                                Read Article <ArrowRight className="w-4 h-4" />
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            </Link>
                        </div>
                    </section>

                    {/* Blog Posts Grid */}
                    {rest.length > 0 && (
                        <section className="pb-16">
                            <div className="container mx-auto px-4 md:px-6">
                                <h2 className="text-3xl font-bold text-white mb-8">Recent Articles</h2>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {rest.map((post, index) => (
                                        <Link key={post.id} href={`/insights/${post.slug}`}>
                                            <motion.article
                                                initial={{ opacity: 0, y: 20 }}
                                                whileInView={{ opacity: 1, y: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: index * 0.05 }}
                                                className="group bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-primary/50 transition-colors h-full"
                                            >
                                                <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                                                    {post.cover_image_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <TrendingUp className="w-12 h-12 text-zinc-700" />
                                                    )}
                                                </div>
                                                <div className="p-6">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded">
                                                            {humanizeType(post.type)}
                                                        </span>
                                                        {post.reading_time_minutes > 0 && (
                                                            <span className="text-xs text-zinc-500">{post.reading_time_minutes} min read</span>
                                                        )}
                                                    </div>
                                                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-primary transition-colors line-clamp-2">
                                                        {post.title}
                                                    </h3>
                                                    {post.excerpt && <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{post.excerpt}</p>}
                                                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                                                        <div className="flex items-center gap-1">
                                                            <User className="w-3 h-3" />
                                                            {authorOf(post)}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {formatDate(post.published_at)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.article>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}
                </>
            )}

            {/* Newsletter CTA */}
            <section className="py-16 border-t border-zinc-800">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                            Stay Informed with Our Newsletter
                        </h2>
                        <p className="text-xl text-zinc-400 mb-8">
                            Get market insights and research updates delivered to your inbox.
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
