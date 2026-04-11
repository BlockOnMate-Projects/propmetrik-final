'use client';

import { useEffect, useState } from 'react';
import { newsletterApi } from '@/lib/publications-api';

type Subscriber = {
  id?: string;
  email?: string;
  name?: string;
  organization?: string;
  role?: string;
  status?: string;
  created_at?: string;
};

export default function PublicationsNewsletterPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await newsletterApi.getSubscribers(1, 100);
        setSubscribers((res.data as Subscriber[]) || []);
        setTotal(res.total || 0);
      } catch {
        setSubscribers([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Total Subscribers</div>
        <div className="text-2xl font-bold text-white font-mono mt-1">{total.toLocaleString()}</div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Organization</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={idx} className="border-b border-zinc-800/50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                    </td>
                  </tr>
                ))
              ) : subscribers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500 font-mono text-sm">
                    No newsletter subscribers yet.
                  </td>
                </tr>
              ) : (
                subscribers.map((subscriber, idx) => (
                  <tr key={subscriber.id || `${subscriber.email || 'subscriber'}-${idx}`} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 text-sm text-zinc-200 font-mono">{subscriber.email || '-'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{subscriber.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{subscriber.organization || '-'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{subscriber.role || '-'}</td>
                    <td className="px-4 py-3 text-xs font-mono uppercase text-zinc-400">{subscriber.status || 'active'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500 font-mono">
                      {subscriber.created_at ? new Date(subscriber.created_at).toLocaleDateString('en-GB') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
