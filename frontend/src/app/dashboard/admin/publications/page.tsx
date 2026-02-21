'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { publicationsApi } from '@/lib/publications-api';
import type { Publication, PublicationFilters, CmsAnalytics } from '@/lib/publications-api';

const PRODUCT_LABELS: Record<string, string> = {
  outlook: 'Ghana Real Estate Outlook',
  snapshot: 'Ghana Property Snapshot',
  policy_paper: 'Policy Paper',
  press_release: 'Press Release',
  podcast: 'Podcast',
};

const EDITION_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  weekly: 'Weekly',
  adhoc: 'Ad-hoc',
};

/** @deprecated — fallback for pre-migration publications */
const TYPE_LABELS: Record<string, string> = {
  market_flash: 'Market Flash',
  data_brief: 'Data Brief',
  marketbeat: 'MarketBeat',
  research_report: 'Research Report',
  special_report: 'Special Report',
  annual_flagship: 'Annual Flagship',
  policy_paper: 'Policy Paper',
  podcast: 'Podcast Episode',
  video: 'Video Commentary',
  index_update: 'Index Update',
  webinar: 'Webinar',
  press_release: 'Press Release',
};

// Product → website category mapping
const PRODUCT_CATEGORY: Record<string, 'insights' | 'press'> = {
  outlook: 'insights',
  snapshot: 'insights',
  policy_paper: 'insights',
  podcast: 'insights',
  press_release: 'press',
};

const PRODUCT_WEBSITE_PATH: Record<string, string> = {
  outlook: '/insights/outlook',
  snapshot: '/insights/snapshot',
  policy_paper: '/insights/policy-papers',
  podcast: '/insights/podcasts-video',
  press_release: '/press/releases',
};

const CATEGORY_BADGE: Record<string, string> = {
  insights: 'bg-blue-900/30 text-blue-400 border-blue-800',
  press: 'bg-amber-900/30 text-amber-400 border-amber-800',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  review: 'bg-yellow-900/50 text-yellow-400',
  published: 'bg-green-900/50 text-green-400',
  archived: 'bg-red-900/50 text-red-400',
  scheduled: 'bg-blue-900/50 text-blue-400',
};

const TIER_COLORS: Record<string, string> = {
  public: 'text-green-400',
  registered: 'text-blue-400',
  professional: 'text-amber-400',
  enterprise: 'text-red-400',
};

export default function PublicationsAdminPage() {
  const router = useRouter();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [analytics, setAnalytics] = useState<CmsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PublicationFilters>({
    page: 1,
    limit: 20,
  });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Client-side category filtering
  const filteredPublications = categoryFilter
    ? publications.filter((pub) => (PRODUCT_CATEGORY[pub.product] || 'insights') === categoryFilter)
    : publications;

  const loadPublications = useCallback(async () => {
    setLoading(true);
    try {
      const finalFilters = { ...filters };
      if (search.trim()) finalFilters.search = search.trim();
      const res = await publicationsApi.list(finalFilters);
      setPublications(res.data || []);
      setTotal(res.total || 0);
    } catch {
      console.error('Failed to load publications');
    } finally {
      setLoading(false);
    }
  }, [filters, search]);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await publicationsApi.getCmsAnalytics();
      setAnalytics(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    loadPublications();
  }, [loadPublications]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handlePublish = async (id: string) => {
    if (!confirm('Publish this publication? It will become publicly visible.')) return;
    try {
      await publicationsApi.publish(id);
      loadPublications();
    } catch (e) {
      alert('Failed to publish');
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Archive this publication?')) return;
    try {
      await publicationsApi.archive(id);
      loadPublications();
    } catch {
      alert('Failed to archive');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this publication?')) return;
    try {
      await publicationsApi.delete(id);
      loadPublications();
    } catch {
      alert('Failed to delete');
    }
  };

  const totalPages = Math.ceil(total / (filters.limit || 20));

  return (
    <div className="space-y-6">
      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: analytics.total_publications },
            { label: 'Published', value: analytics.published },
            { label: 'Drafts', value: analytics.drafts },
            { label: 'Total Views', value: analytics.total_views.toLocaleString() },
            { label: 'Subscribers', value: analytics.total_subscribers.toLocaleString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-zinc-900 border border-zinc-800 p-3"
            >
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                {stat.label}
              </div>
              <div className="text-xl font-bold text-white font-mono mt-1">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-zinc-900 border border-zinc-800 p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setFilters((p) => ({ ...p, page: 1 }));
              loadPublications();
            }
          }}
          placeholder="Search publications..."
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 font-mono"
        />

        <select
          value={filters.product || filters.type || ''}
          onChange={(e) => {
            const val = e.target.value || undefined;
            // If it's a product key, filter by product; otherwise legacy type
            if (val && PRODUCT_LABELS[val]) {
              setFilters((p) => ({ ...p, product: val, type: undefined, page: 1 }));
            } else {
              setFilters((p) => ({ ...p, type: val, product: undefined, page: 1 }));
            }
          }}
          className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white font-mono"
        >
          <option value="">All Products</option>
          {Object.entries(PRODUCT_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.status || ''}
          onChange={(e) =>
            setFilters((p) => ({
              ...p,
              status: e.target.value || undefined,
              page: 1,
            }))
          }
          className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white font-mono"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="scheduled">Scheduled</option>
        </select>

        <select
          value={filters.access_tier || ''}
          onChange={(e) =>
            setFilters((p) => ({
              ...p,
              access_tier: e.target.value || undefined,
              page: 1,
            }))
          }
          className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white font-mono"
        >
          <option value="">All Tiers</option>
          <option value="public">Public</option>
          <option value="registered">Registered</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-sm text-white font-mono"
        >
          <option value="">All Categories</option>
          <option value="insights">📊 Insights</option>
          <option value="press">📰 Press</option>
        </select>
      </div>

      {/* Publications Table */}
      <div className="bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Tier
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                    </td>
                  </tr>
                ))
              ) : filteredPublications.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-zinc-500 font-mono text-sm"
                  >
                    No publications found. Create your first one!
                  </td>
                </tr>
              ) : (
                filteredPublications.map((pub) => (
                  <tr
                    key={pub.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    onClick={() =>
                      router.push(`/dashboard/admin/publications/${pub.id}`)
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm text-white font-medium truncate max-w-[300px]">
                        {pub.title}
                      </div>

                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const cat = PRODUCT_CATEGORY[pub.product] || 'insights';
                        return (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase border rounded ${
                              CATEGORY_BADGE[cat] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            }`}
                            title={`Published to ${PRODUCT_WEBSITE_PATH[pub.product] || '/'}`}
                          >
                            {cat}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-zinc-400">
                        {PRODUCT_LABELS[pub.product] || TYPE_LABELS[pub.type] || pub.product || pub.type}
                        {pub.edition && EDITION_LABELS[pub.edition] ? ` · ${EDITION_LABELS[pub.edition]}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded ${
                          STATUS_COLORS[pub.status] || 'bg-zinc-700 text-zinc-300'
                        }`}
                      >
                        {pub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-mono capitalize ${
                          TIER_COLORS[pub.access_tier] || 'text-zinc-400'
                        }`}
                      >
                        {pub.access_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-zinc-500">
                      {pub.published_at
                        ? new Date(pub.published_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : new Date(pub.created_at).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pub.status === 'draft' && (
                          <button
                            onClick={() => handlePublish(pub.id)}
                            className="px-2 py-1 text-[10px] font-mono text-green-400 border border-green-800 rounded hover:bg-green-900/30"
                          >
                            Publish
                          </button>
                        )}
                        {pub.status !== 'archived' && (
                          <button
                            onClick={() => handleArchive(pub.id)}
                            className="px-2 py-1 text-[10px] font-mono text-yellow-400 border border-yellow-800 rounded hover:bg-yellow-900/30"
                          >
                            Archive
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(pub.id)}
                          className="px-2 py-1 text-[10px] font-mono text-red-400 border border-red-800 rounded hover:bg-red-900/30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <div className="text-xs font-mono text-zinc-500">
              Page {filters.page} of {totalPages} · {total} total
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    page: Math.max(1, (p.page || 1) - 1),
                  }))
                }
                disabled={(filters.page || 1) <= 1}
                className="px-3 py-1 text-xs font-mono text-zinc-400 border border-zinc-700 rounded hover:border-red-600 disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    page: Math.min(totalPages, (p.page || 1) + 1),
                  }))
                }
                disabled={(filters.page || 1) >= totalPages}
                className="px-3 py-1 text-xs font-mono text-zinc-400 border border-zinc-700 rounded hover:border-red-600 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
