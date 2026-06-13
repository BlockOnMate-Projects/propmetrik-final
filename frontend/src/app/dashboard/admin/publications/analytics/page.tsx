'use client';

import { useEffect, useState } from 'react';
import { publicationsApi } from '@/lib/publications-api';
import type { CmsAnalytics } from '@/lib/publications-api';

export default function PublicationsAnalyticsPage() {
  const [analytics, setAnalytics] = useState<CmsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await publicationsApi.getCmsAnalytics();
        setAnalytics(res.data || null);
      } catch {
        setAnalytics(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return <div className="h-56 bg-card border border-border animate-pulse" />;
  }

  if (!analytics) {
    return (
      <div className="bg-card border border-border p-6 text-muted-foreground font-mono text-sm">
        Failed to load publication analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: analytics.total_publications },
          { label: 'Published', value: analytics.published },
          { label: 'Drafts', value: analytics.drafts },
          { label: 'Total Views', value: analytics.total_views.toLocaleString() },
          { label: 'Subscribers', value: analytics.total_subscribers.toLocaleString() },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border p-3">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{stat.label}</div>
            <div className="text-xl font-bold text-foreground font-mono mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border p-4">
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">Publications by Type</div>
        <div className="space-y-2">
          {analytics.publications_by_type.length === 0 ? (
            <div className="text-muted-foreground font-mono text-sm">No type analytics yet.</div>
          ) : (
            analytics.publications_by_type.map((item) => (
              <div key={item.type} className="flex items-center justify-between border border-border bg-background/60 px-3 py-2">
                <span className="text-sm text-muted-foreground font-mono">{item.type}</span>
                <span className="text-sm text-foreground font-mono">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
