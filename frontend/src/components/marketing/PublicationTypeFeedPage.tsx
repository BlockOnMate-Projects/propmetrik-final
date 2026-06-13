'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication } from '@/lib/publications-api';

type PublicationTypeFeedPageProps = {
  title: string;
  subtitle: string;
  /** @deprecated Use product + edition instead */
  publicationType?: string;
  product?: string;
  edition?: string;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PublicationTypeFeedPage({
  title,
  subtitle,
  publicationType,
  product,
  edition,
}: PublicationTypeFeedPageProps) {
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const filters: any = { limit: 30 };
        if (product) filters.product = product;
        if (edition) filters.edition = edition;
        if (publicationType) filters.type = publicationType;
        const res = await publicationsApi.getPublished(filters);
        setItems(res.data || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [publicationType, product, edition]);

  return (
    <main className="pt-32 pb-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-4">{title}</h1>
        <p className="text-muted-foreground text-lg mb-10">{subtitle}</p>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
                <div className="h-4 w-32 bg-muted rounded mb-2" />
                <div className="h-6 w-3/4 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
            No publications available in this category yet.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <Link key={item.id} href={`/insights/${item.slug}`}>
                <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
                  <div className="text-xs text-muted-foreground mb-2">{formatDate(item.published_at)}</div>
                  <h2 className="text-xl font-bold text-foreground mb-1">{item.title}</h2>
                  {item.excerpt && <p className="text-muted-foreground text-sm line-clamp-2">{item.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
