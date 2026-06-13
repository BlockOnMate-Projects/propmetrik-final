'use client';

import { useEffect, useState } from 'react';
import { indicesApi } from '@/lib/publications-api';
import type { IndexValue } from '@/lib/publications-api';

export default function PublicationsIndicesPage() {
  const [indices, setIndices] = useState<IndexValue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await indicesApi.getAll();
        setIndices(res.data || []);
      } catch {
        setIndices([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="bg-card border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Index</th>
              <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Region</th>
              <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Value</th>
              <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">MoM</th>
              <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">YoY</th>
              <th className="text-left px-4 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Published</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, idx) => (
                <tr key={idx} className="border-b border-border/50">
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                  </td>
                </tr>
              ))
            ) : indices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground font-mono text-sm">
                  No index values available yet.
                </td>
              </tr>
            ) : (
              indices.map((index) => (
                <tr key={index.id} className="border-b border-border/50">
                  <td className="px-4 py-3 text-sm text-zinc-200 font-mono uppercase">{index.index_type}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{index.region}</td>
                  <td className="px-4 py-3 text-sm text-foreground font-mono">{index.value}</td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index.change_mom ?? '-'}</td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{index.change_yoy ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {index.published_at ? new Date(index.published_at).toLocaleDateString('en-GB') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
