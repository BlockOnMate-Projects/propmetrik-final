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

const INDEX_LABELS: Record<string, string> = {
  ghpi: 'Ghana House Price Index',
  ghai: 'Ghana Housing Affordability Index',
  cci: 'Construction Cost Index',
  gcpi: 'Ghana Commercial Property Index',
};

export default function InsightsIndicesPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    publicationsApi
      .getPublished({ product: 'outlook', type: 'index_update', limit: 60 })
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
    <main className="pt-32 pb-24 bg-background">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">Proprietary Benchmarks</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-5">Indices &amp; Data</h1>
            <p className="text-muted-foreground text-lg">
              PROPMETRIK&apos;s proprietary indices — GHPI, GHAI, CCI, GCPI — with historical time-series, methodology papers,
              and analyst commentary on each release.
            </p>
          </div>
        </div>
      </section>

      {/* Index Cards */}
      <section className="pb-12">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(INDEX_LABELS).map(([key, name]) => (
              <div
                key={key}
                className="bg-card border border-border rounded-lg p-5 hover:border-primary/50 transition-colors"
              >
                <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">{key.toUpperCase()}</div>
                <div className="text-foreground font-bold text-sm">{name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search index updates..."
            className="w-full md:w-[520px] px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-zinc-500 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, idx) => (
                <div key={idx} className="bg-card border border-border rounded-lg p-6 animate-pulse">
                  <div className="h-5 w-2/3 bg-muted rounded mb-2" />
                  <div className="h-4 w-full bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">No index updates found.</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((item) => (
                <Link key={item.id} href={`/insights/${item.slug}`}>
                  <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
                    <div className="text-xs text-muted-foreground mb-2">{formatDate(item.published_at)}</div>
                    <h2 className="text-xl font-bold text-foreground mb-1">{item.title}</h2>
                    {item.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{item.excerpt}</p>}
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
