'use client';

import { motion } from 'framer-motion';

const assets = [
  { name: 'Company Fact Sheet', format: 'PDF', size: '245 KB' },
  { name: 'High-Res Logos (SVG/PNG)', format: 'ZIP', size: '1.2 MB' },
  { name: 'Leadership Photos', format: 'ZIP', size: '3.5 MB' },
  { name: 'Brand Guidelines', format: 'PDF', size: '890 KB' },
  { name: 'Executive Bios', format: 'PDF', size: '320 KB' },
];

export default function MediaKitPage() {
  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">Brand Assets</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-5">Media Kit</h1>
            <p className="text-zinc-400 text-lg">
              Download PROPMETRIK logos, brand guidelines, company information, and leadership photos
              for use in publications and media.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6 max-w-3xl">
          <div className="space-y-4">
            {assets.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-5 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-primary/50 transition-colors"
              >
                <div>
                  <div className="font-bold text-white mb-1">{item.name}</div>
                  <div className="text-sm text-zinc-500">{item.format} · {item.size}</div>
                </div>
                <button className="px-5 py-2.5 bg-primary text-zinc-950 font-bold rounded hover:bg-primary/90 transition-colors text-sm">
                  Download
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
