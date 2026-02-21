'use client';

import { useEffect, useState } from 'react';
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

export default function PressReleasesPage() {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicationsApi
      .getPublished({ product: 'press_release', limit: 30 })
      .then((res) => setItems(res.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="pt-32 pb-24 bg-zinc-950">
      <section className="pb-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <div className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-4">Official Announcements</div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-5">Press Releases</h1>
            <p className="text-zinc-400 text-lg">
              Official PROPMETRIK announcements, partnership news, and product launches.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="container mx-auto px-4 md:px-6">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse">
                  <div className="h-4 w-32 bg-zinc-800 rounded mb-2" />
                  <div className="h-6 w-3/4 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-10 text-center text-zinc-500">
              No press releases published yet.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <Link key={item.id} href={`/insights/${item.slug}`}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-primary/50 transition-colors">
                    <div className="text-xs text-zinc-500 mb-2">{formatDate(item.published_at)}</div>
                    <h2 className="text-xl font-bold text-white mb-1">{item.title}</h2>
                    {item.excerpt && <p className="text-zinc-400 text-sm line-clamp-2">{item.excerpt}</p>}
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
