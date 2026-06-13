'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { guides, getGuideBySlug, getAdjacentGuides, getFolderForSlug } from '@/lib/guides';
import { fetchGuideContent } from '@/lib/guide-content';
import {
    ArrowLeft,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    BookOpen,
    ImageIcon,
    Loader2,
} from 'lucide-react';

export default function GuidePage() {
    const params = useParams();
    const slug = params?.slug as string;
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const guide = getGuideBySlug(slug);
    const { prev, next } = getAdjacentGuides(slug);
    const folder = getFolderForSlug(slug);

    useEffect(() => {
        if (!folder) return;
        setLoading(true);
        fetchGuideContent(folder).then((md) => {
            setContent(md);
            setLoading(false);
        });
    }, [folder]);

    if (!guide) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-foreground mb-4">Guide Not Found</h1>
                    <p className="text-muted-foreground mb-8">
                        The guide you&apos;re looking for doesn&apos;t exist.
                    </p>
                    <Link
                        href="/resources"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-zinc-950 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Resources
                    </Link>
                </div>
            </div>
        );
    }

    const Icon = guide.icon;

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <section className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12">
                    <div className="flex items-center justify-between h-14">
                        <Link
                            href="/resources"
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-500 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            All Resources
                        </Link>
                        <div className="flex items-center gap-4">
                            {prev && (
                                <Link
                                    href={`/resources/${prev.slug}`}
                                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-amber-500 transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Previous
                                </Link>
                            )}
                            {next && (
                                <Link
                                    href={`/resources/${next.slug}`}
                                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-amber-500 transition-colors"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Guide Hero */}
            <section className="pt-16 pb-12">
                <div className="max-w-4xl mx-auto px-4 md:px-8 lg:px-12">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <Icon className="w-5 h-5 text-amber-500" />
                            </div>
                            <span className="text-sm font-mono text-muted-foreground">
                                Chapter {String(guide.chapter).padStart(2, '0')}
                            </span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4 tracking-tight">
                            {guide.title}
                        </h1>
                        <p className="text-lg text-muted-foreground mb-6">{guide.description}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <ImageIcon className="w-4 h-4 text-amber-500" />
                                {guide.screenshotCount} screenshots
                            </div>
                            <div className="flex items-center gap-1.5">
                                <BookOpen className="w-4 h-4 text-amber-500" />
                                Step-by-step guide
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-4xl mx-auto px-4 md:px-8 lg:px-12">
                <div className="border-t border-border" />
            </div>

            {/* Markdown Content */}
            <section className="py-12">
                <div className="max-w-4xl mx-auto px-4 md:px-8 lg:px-12">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                            className="guide-content"
                        >
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    h1: ({ children }: any) => (
                                        <h1 className="text-3xl font-black text-foreground mt-16 mb-6 first:mt-0">
                                            {children}
                                        </h1>
                                    ),
                                    h2: ({ children }: any) => (
                                        <h2 className="text-2xl font-bold text-foreground mt-14 mb-4 pb-3 border-b border-border">
                                            {children}
                                        </h2>
                                    ),
                                    h3: ({ children }: any) => (
                                        <h3 className="text-xl font-semibold text-zinc-200 mt-10 mb-3">
                                            {children}
                                        </h3>
                                    ),
                                    h4: ({ children }: any) => (
                                        <h4 className="text-lg font-semibold text-muted-foreground mt-8 mb-2">
                                            {children}
                                        </h4>
                                    ),
                                    p: ({ children }: any) => (
                                        <p className="text-muted-foreground leading-relaxed mb-4">
                                            {children}
                                        </p>
                                    ),
                                    ul: ({ children }: any) => (
                                        <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6 ml-2">
                                            {children}
                                        </ul>
                                    ),
                                    ol: ({ children }: any) => (
                                        <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-6 ml-2">
                                            {children}
                                        </ol>
                                    ),
                                    li: ({ children }: any) => (
                                        <li className="text-muted-foreground leading-relaxed">
                                            {children}
                                        </li>
                                    ),
                                    a: ({ href, children }: any) => (
                                        <a
                                            href={href}
                                            className="text-amber-500 hover:text-amber-400 underline underline-offset-2 transition-colors"
                                        >
                                            {children}
                                        </a>
                                    ),
                                    strong: ({ children }: any) => (
                                        <strong className="text-zinc-200 font-semibold">
                                            {children}
                                        </strong>
                                    ),
                                    em: ({ children }: any) => (
                                        <em className="text-muted-foreground italic">{children}</em>
                                    ),
                                    blockquote: ({ children }: any) => (
                                        <blockquote className="border-l-4 border-amber-500/40 bg-amber-500/5 pl-4 py-3 pr-4 my-6 rounded-r-lg text-muted-foreground">
                                            {children}
                                        </blockquote>
                                    ),
                                    code: ({ children, className }: any) => {
                                        const isInline = !className;
                                        if (isInline) {
                                            return (
                                                <code className="px-1.5 py-0.5 bg-muted text-amber-600 dark:text-amber-400 text-sm rounded font-mono">
                                                    {children}
                                                </code>
                                            );
                                        }
                                        return (
                                            <code className={className}>
                                                {children}
                                            </code>
                                        );
                                    },
                                    pre: ({ children }: any) => (
                                        <pre className="bg-card border border-border rounded-xl p-4 overflow-x-auto mb-6 text-sm">
                                            {children}
                                        </pre>
                                    ),
                                    hr: () => (
                                        <hr className="border-border my-10" />
                                    ),
                                    table: ({ children }: any) => (
                                        <div className="overflow-x-auto mb-6 rounded-lg border border-border">
                                            <table className="min-w-full text-sm">
                                                {children}
                                            </table>
                                        </div>
                                    ),
                                    thead: ({ children }: any) => (
                                        <thead className="bg-card text-muted-foreground uppercase text-xs tracking-wider">
                                            {children}
                                        </thead>
                                    ),
                                    tbody: ({ children }: any) => (
                                        <tbody className="divide-y divide-border">
                                            {children}
                                        </tbody>
                                    ),
                                    tr: ({ children }: any) => (
                                        <tr className="hover:bg-card/50 transition-colors">
                                            {children}
                                        </tr>
                                    ),
                                    th: ({ children }: any) => (
                                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                                            {children}
                                        </th>
                                    ),
                                    td: ({ children }: any) => (
                                        <td className="px-4 py-3 text-muted-foreground">{children}</td>
                                    ),
                                    img: ({ src, alt }: any) => (
                                        <figure className="my-8">
                                            <div className="rounded-xl overflow-hidden border border-border bg-card">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={src}
                                                    alt={alt || ''}
                                                    className="w-full h-auto"
                                                    loading="lazy"
                                                />
                                            </div>
                                            {alt && (
                                                <figcaption className="mt-2 text-center text-sm text-muted-foreground italic">
                                                    {alt}
                                                </figcaption>
                                            )}
                                        </figure>
                                    ),
                                }}
                            >
                                {content || ''}
                            </ReactMarkdown>
                        </motion.div>
                    )}
                </div>
            </section>

            {/* Bottom Navigation */}
            <section className="border-t border-border py-12">
                <div className="max-w-4xl mx-auto px-4 md:px-8 lg:px-12">
                    <div className="flex items-stretch gap-4">
                        {prev ? (
                            <Link
                                href={`/resources/${prev.slug}`}
                                className="flex-1 group block p-6 bg-card/50 border border-border rounded-xl hover:border-amber-500/30 transition-all"
                            >
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                    <ArrowLeft className="w-4 h-4" />
                                    Previous
                                </div>
                                <div className="font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                                    {prev.title}
                                </div>
                            </Link>
                        ) : (
                            <div className="flex-1" />
                        )}
                        {next ? (
                            <Link
                                href={`/resources/${next.slug}`}
                                className="flex-1 group block p-6 bg-card/50 border border-border rounded-xl hover:border-amber-500/30 transition-all text-right"
                            >
                                <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground mb-2">
                                    Next
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                                <div className="font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                                    {next.title}
                                </div>
                            </Link>
                        ) : (
                            <div className="flex-1" />
                        )}
                    </div>

                    <div className="text-center mt-10">
                        <Link
                            href="/resources"
                            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-500 transition-colors"
                        >
                            <BookOpen className="w-4 h-4" />
                            View All Resources
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
