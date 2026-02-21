'use client';

import { motion } from 'framer-motion';

const resources = [
  {
    title: 'Embeddable Widgets',
    desc: 'Embed live PROPMETRIK index charts directly into your articles with a single code snippet. Auto-updates with PropMetrik branding.',
    icon: '📊',
  },
  {
    title: 'Pre-formatted Charts',
    desc: 'Publication-ready PNG/SVG charts of CCI, GHAI, GHPI indices with PropMetrik attribution. Ready for print and digital.',
    icon: '📈',
  },
  {
    title: 'Market Statistics',
    desc: 'Latest quarterly market statistics, price movements, and construction cost data formatted for immediate editorial use.',
    icon: '📋',
  },
  {
    title: 'Instant Quotes',
    desc: 'AI-generated, data-driven market quotes ready for attribution. Request quotes on any Ghana real estate topic.',
    icon: '💬',
  },
];

export default function DataForJournalistsPage() {
  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">For the Press</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-5">Data for Journalists</h1>
            <p className="text-zinc-400 text-lg">
              Attribution-ready charts, embeddable widgets, and market statistics for journalists covering
              Ghana and West Africa real estate.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl">
            {resources.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors"
              >
                <div className="text-2xl mb-3">{item.icon}</div>
                <h3 className="font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 max-w-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Request Data Access</h2>
            <p className="text-zinc-400 mb-6">
              Journalists can request complimentary access to PROPMETRIK data for editorial purposes.
              All data usage must include attribution to PROPMETRIK Research.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="space-y-3 text-zinc-300">
                <p><span className="text-zinc-500">Email:</span> press@propmetrik.com</p>
                <p><span className="text-zinc-500">Subject:</span> Data Request — [Publication Name]</p>
                <p><span className="text-zinc-500">Response Time:</span> Within 24 hours</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
