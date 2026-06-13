'use client';

import { useEffect, useState } from 'react';
import { publicationsApi } from '@/lib/publications-api';
import type { Taxonomy } from '@/lib/publications-api';

// Category mapping for display
const CATEGORY_MAP: Record<string, { category: 'insights' | 'press'; website_path: string }> = {
  market_flash: { category: 'insights', website_path: '/insights/latest' },
  data_brief: { category: 'insights', website_path: '/insights/latest' },
  marketbeat: { category: 'insights', website_path: '/insights/marketbeat' },
  research_report: { category: 'insights', website_path: '/insights/reports' },
  special_report: { category: 'insights', website_path: '/insights/special-reports' },
  annual_flagship: { category: 'insights', website_path: '/insights/reports' },
  policy_paper: { category: 'insights', website_path: '/insights/policy-papers' },
  podcast: { category: 'insights', website_path: '/insights/podcasts-video' },
  video: { category: 'insights', website_path: '/insights/podcasts-video' },
  index_update: { category: 'insights', website_path: '/insights/indices' },
  webinar: { category: 'insights', website_path: '/insights/podcasts-video' },
  press_release: { category: 'press', website_path: '/press/releases' },
};

export default function PublicationsSettingsPage() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await publicationsApi.getTaxonomy();
        setTaxonomy(res.data || null);
      } catch {
        setTaxonomy(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const insightsTypes = taxonomy?.types?.filter((t) => CATEGORY_MAP[t.value]?.category === 'insights') || [];
  const pressTypes = taxonomy?.types?.filter((t) => CATEGORY_MAP[t.value]?.category === 'press') || [];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border p-4">
        <div className="text-sm text-muted-foreground">
          Publication settings and taxonomy reference. The <strong className="text-foreground">Category</strong> determines which website section (Insights or Press) a publication appears on when published.
        </div>
      </div>

      {loading ? (
        <div className="h-56 bg-card border border-border animate-pulse" />
      ) : !taxonomy ? (
        <div className="bg-card border border-border p-6 text-muted-foreground font-mono text-sm">
          Failed to load publication settings.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Category → Type Mapping */}
          <div className="bg-card border border-border p-4">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Website Category Mapping
            </div>

            {/* Insights */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-800 rounded">
                  Insights
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">/insights/* — Research & thought leadership</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-muted-foreground">Publication Type</th>
                      <th className="text-left py-2 pr-4 text-muted-foreground">Description</th>
                      <th className="text-left py-2 text-muted-foreground">Website Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insightsTypes.map((t) => (
                      <tr key={t.value} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-foreground">{t.label}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{t.description}</td>
                        <td className="py-2 text-blue-600 dark:text-blue-400">{CATEGORY_MAP[t.value]?.website_path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Press */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-800 rounded">
                  Press
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">/press/* — Corporate communications & media</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-muted-foreground">Publication Type</th>
                      <th className="text-left py-2 pr-4 text-muted-foreground">Description</th>
                      <th className="text-left py-2 text-muted-foreground">Website Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pressTypes.map((t) => (
                      <tr key={t.value} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-foreground">{t.label}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{t.description}</td>
                        <td className="py-2 text-amber-600 dark:text-amber-400">{CATEGORY_MAP[t.value]?.website_path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Existing taxonomy sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Sectors', items: taxonomy.sectors.map((x) => x.label) },
              { label: 'Topics', items: taxonomy.topics.map((x) => x.label) },
              { label: 'Regions', items: taxonomy.regions.map((x) => x.label) },
              { label: 'Access Tiers', items: taxonomy.access_tiers.map((x) => x.label) },
              { label: 'Statuses', items: taxonomy.statuses.map((x) => x.label) },
            ].map((section) => (
              <div key={section.label} className="bg-card border border-border p-4">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">{section.label}</div>
                <div className="flex flex-wrap gap-2">
                  {section.items.map((item) => (
                    <span
                      key={item}
                      className="px-2 py-1 text-xs font-mono bg-muted text-muted-foreground border border-border"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
