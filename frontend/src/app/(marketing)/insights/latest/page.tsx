'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'market_flash', label: 'Market Flash' },
  { key: 'data_brief', label: 'Data Brief' },
] as const;

type Tab = (typeof TABS)[number]['key'];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const ALLOWED = new Set(['market_flash', 'data_brief']);

export default function InsightsLatestPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');

  useEffect(() => {
    publicationsApi
      .getPublished({ limit: 60 })
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((i) => ALLOWED.has(i.type))
      .filter((i) => (activeTab === 'all' ? true : i.type === activeTab))
      .filter((i) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return i.title.toLowerCase().includes(q) || (i.excerpt || '').toLowerCase().includes(q);
      });
  }, [items, activeTab, query]);

  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">Updated Daily</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-5">Latest</h1>
            <p className="text-zinc-400 text-lg">
              Real-time market intelligence — Market Flash updates and Data Briefs as events unfold.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search latest insights..."
            className="w-full md:w-[520px] px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-primary transition-colors"
          />
          <div className="flex flex-wrap gap-2 mt-5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary text-zinc-950 border-primary'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, idx) => (
                <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse">
                  <div className="h-5 w-2/3 bg-zinc-800 rounded mb-2" />
                  <div className="h-4 w-full bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">No items found matching your criteria.</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((item) => (
                <Link key={item.id} href={`/insights/${item.slug}`}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-zinc-500">{formatDate(item.published_at)}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                        {item.type === 'market_flash' ? 'Market Flash' : 'Data Brief'}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">{item.title}</h2>
                    {item.excerpt && <p className="text-sm text-zinc-400 line-clamp-2">{item.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
