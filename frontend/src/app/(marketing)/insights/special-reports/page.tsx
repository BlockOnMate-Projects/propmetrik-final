'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function InsightsSpecialReportsPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    publicationsApi
      .getPublished({ product: 'outlook', edition: 'annual', limit: 60 })
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.excerpt || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">Flagship Deep-Dives</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-5">Special Reports</h1>
            <p className="text-zinc-400 text-lg">
              Ghana Horizons, PropTech &amp; Innovation, Wealth &amp; Luxury Property — premium deep-dive publications
              for senior leaders, international investors, and development finance institutions.
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
            placeholder="Search special reports..."
            className="w-full md:w-[520px] px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, idx) => (
                <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse">
                  <div className="h-5 w-2/3 bg-zinc-800 rounded mb-2" />
                  <div className="h-4 w-full bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">No special reports found.</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((item) => (
                <Link key={item.id} href={`/insights/${item.slug}`}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors">
                    <div className="text-xs text-zinc-500 mb-2">{formatDate(item.published_at)}</div>
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
