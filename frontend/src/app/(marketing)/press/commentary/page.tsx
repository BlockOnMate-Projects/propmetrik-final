'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { aiContentApi } from '@/lib/publications-api';

export default function ExpertCommentaryPage() {
  const [quoteTopic, setQuoteTopic] = useState('');
  const [generatedQuote, setGeneratedQuote] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);

  const handleGenerateQuote = async () => {
    if (!quoteTopic.trim()) return;
    setQuoteLoading(true);
    setGeneratedQuote('');
    try {
      const result = await aiContentApi.generateQuote({ topic: quoteTopic });
      setGeneratedQuote(result.data?.text || '');
    } catch {
      setGeneratedQuote('Unable to generate quote at this time. Please try again.');
    } finally {
      setQuoteLoading(false);
    }
  };

  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">Analyst Access</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-5">Expert Commentary</h1>
            <p className="text-zinc-400 text-lg">
              Book PROPMETRIK analysts for interviews, op-eds, and panel discussions. Or generate
              instant, data-driven market quotes for your publication.
            </p>
          </div>
        </div>
      </section>

      {/* Instant Quote Generator */}
      <section className="pb-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-4">Instant Market Quotes</h2>
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

      {/* Book an Analyst */}
      <section className="border-t border-zinc-800 pt-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-4">Book an Analyst</h2>
            <p className="text-zinc-400 mb-8">
              Request a PROPMETRIK analyst for interviews, op-eds, conference panels, or
              bespoke market commentary.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="space-y-3 text-zinc-300">
                <p><span className="text-zinc-500">Email:</span> press@propmetrik.com</p>
                <p><span className="text-zinc-500">Phone:</span> +233 XX XXX XXXX</p>
                <p><span className="text-zinc-500">Response Time:</span> Within 24 hours</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
