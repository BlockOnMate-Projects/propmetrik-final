'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { publicationsApi, aiContentApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PressPage() {
  const [pressReleases, setPressReleases] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteTopic, setQuoteTopic] = useState('');
  const [generatedQuote, setGeneratedQuote] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    publicationsApi
      .getPublished({ product: 'press_release', limit: 20 })
      .then((r) => setPressReleases(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleGenerateQuote = async () => {
    if (!quoteTopic.trim()) return;
    setQuoteLoading(true);
    setGeneratedQuote('');
    try {
      const result = await aiContentApi.generateQuote({ topic: quoteTopic });
      setGeneratedQuote(result.data?.text || '');
    } catch {
      setGeneratedQuote(
        'Unable to generate quote at this time. Please try again.'
      );
    } finally {
      setQuoteLoading(false);
    }
  };

  const mediaKit = [
    { name: 'Company Fact Sheet', format: 'PDF', size: '245 KB' },
    { name: 'High-Res Logos', format: 'ZIP', size: '1.2 MB' },
    { name: 'Leadership Photos', format: 'ZIP', size: '3.5 MB' },
    { name: 'Brand Guidelines', format: 'PDF', size: '890 KB' },
  ];

  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      {/* Hero */}
      <section className="pb-16">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">
              PRESS &amp; MEDIA
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
              Press{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                Room
              </span>
            </h1>
            <p className="text-xl text-zinc-400 leading-relaxed">
              Official announcements, media resources, and analyst quotes from
              PROPMETRIK Research — West Africa&apos;s leading real estate
              intelligence platform.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="border-y border-zinc-800 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: 'Press Releases',
                count: pressReleases.length,
                href: '#releases',
              },
              { label: 'Media Kit', count: null, href: '#media-kit' },
              { label: 'Instant Quotes', count: null, href: '#quotes' },
              { label: 'Contact Press', count: null, href: '#contact' },
            ].map((item, i) => (
              <motion.a
                key={item.label}
                href={item.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-primary/50 transition-colors text-center"
              >
                <div className="text-white font-bold">{item.label}</div>
                {item.count !== null && (
                  <div className="text-sm text-zinc-500">
                    {item.count} published
                  </div>
                )}
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* Press Releases */}
      <section id="releases" className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <h2 className="text-3xl font-bold text-white mb-8">
            Press Releases
          </h2>

          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse"
                >
                  <div className="h-4 w-24 bg-zinc-800 rounded mb-3" />
                  <div className="h-6 w-3/4 bg-zinc-800 rounded mb-2" />
                  <div className="h-4 w-1/2 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : pressReleases.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="text-4xl mb-4">📰</div>
              <p className="text-zinc-400">
                Press releases will appear here once published.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pressReleases.map((pr, i) => (
                <motion.div
                  key={pr.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/insights/${pr.slug}`}>
                    <div className="group bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors">
                      <div className="text-sm text-zinc-500 mb-2">
                        {formatDate(pr.published_at)}
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">
                        {pr.title}
                      </h3>
                      {pr.excerpt && (
                        <p className="text-zinc-400 line-clamp-2">
                          {pr.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Media Kit */}
      <section id="media-kit" className="py-16 border-t border-zinc-800">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-3xl font-bold text-white mb-6">Media Kit</h2>
              <p className="text-zinc-400 mb-8">
                Download our media kit for logos, brand assets, company
                information, and leadership photos.
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
                      <div className="font-bold text-white mb-1">
                        {item.name}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {item.format} · {item.size}
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-primary text-zinc-950 font-bold rounded hover:bg-primary/90 transition-colors">
                      Download
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold text-white mb-6">
                Data for Press
              </h2>
              <div className="grid gap-4">
                {[
                  {
                    title: 'Embeddable Widgets',
                    desc: 'Embed live PROPMETRIK index charts directly into your articles with a single code snippet.',
                  },
                  {
                    title: 'Pre-formatted Charts',
                    desc: 'Publication-ready PNG/SVG charts of CCI, GHAI, GHPI indices with PROPMETRIK attribution.',
                  },
                  {
                    title: 'Market Statistics',
                    desc: 'Latest quarterly market statistics, price movements, and construction cost data.',
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-5"
                  >
                    <h3 className="font-bold text-white mb-1">{item.title}</h3>
                    <p className="text-sm text-zinc-400">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Instant Quote Generator */}
      <section id="quotes" className="py-16 border-t border-zinc-800">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-4">
              Instant Market Quotes
            </h2>
            <p className="text-zinc-400 mb-8">
              Need a data-driven market quote for your article? Our AI generates
              publication-ready quotes based on the latest PROPMETRIK data.
              Attribution: PROPMETRIK Research.
            </p>

            <div className="space-y-4">
              <input
                type="text"
                value={quoteTopic}
                onChange={(e) => setQuoteTopic(e.target.value)}
                placeholder='e.g., "Current state of Accra residential market"'
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-primary transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGenerateQuote();
                }}
              />
              <motion.button
                onClick={handleGenerateQuote}
                disabled={quoteLoading || !quoteTopic.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 bg-gradient-to-r from-primary to-yellow-400 text-zinc-950 font-bold rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-shadow disabled:opacity-50"
              >
                {quoteLoading ? 'Generating...' : 'Generate Quote'}
              </motion.button>

              {generatedQuote && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mt-4"
                >
                  <blockquote className="text-zinc-300 italic leading-relaxed mb-4">
                    &ldquo;{generatedQuote}&rdquo;
                  </blockquote>
                  <div className="text-sm text-zinc-500">
                    — PROPMETRIK Research,{' '}
                    {new Date().toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                  <div className="text-xs text-zinc-600 mt-2">
                    Attribution: PROPMETRIK Ghana Real Estate Intelligence
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-16 border-t border-zinc-800">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-4">
              Press Contact
            </h2>
            <p className="text-zinc-400 mb-8">
              For media inquiries, interview requests, or analyst commentary,
              please contact our communications team.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="space-y-3 text-zinc-300">
                <p>
                  <span className="text-zinc-500">Email:</span>{' '}
                  press@propmetrik.com
                </p>
                <p>
                  <span className="text-zinc-500">Phone:</span> +233 XX XXX
                  XXXX
                </p>
                <p>
                  <span className="text-zinc-500">Response Time:</span> Within
                  24 hours
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
