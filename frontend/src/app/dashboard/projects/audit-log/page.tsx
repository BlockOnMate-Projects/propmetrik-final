'use client';

import { useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';

const ACTION_COLORS: Record<string, string> = { create: 'bg-green-500/20 text-green-400', update: 'bg-blue-500/20 text-blue-400', delete: 'bg-red-500/20 text-red-400', login: 'bg-purple-500/20 text-purple-400', logout: 'bg-zinc-500/20 text-zinc-400', export: 'bg-yellow-500/20 text-yellow-400', import: 'bg-cyan-500/20 text-cyan-400', approve: 'bg-green-500/20 text-green-400', reject: 'bg-red-500/20 text-red-400', view: 'bg-zinc-500/20 text-zinc-400' };

export default function AuditLogPage() {
  const { toast } = useToast();
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (action) params.set('action', action);
  if (resource) params.set('resource_type', resource);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  params.set('page', String(page));
  params.set('limit', '50');

  const { data: logs } = useQuery({
    queryKey: ['audit-log', action, resource, dateFrom, dateTo, page],
    queryFn: () => authedFetch(`/api/audit-log?${params.toString()}`).then(r => r.json()),
  });
  const { data: stats } = useQuery({
    queryKey: ['audit-log-stats'],
    queryFn: () => authedFetch('/api/audit-log/stats').then(r => r.json()),
  });

  const doExport = async (format: string) => {
    try {
      const ep = new URLSearchParams();
      if (action) ep.set('action', action);
      if (resource) ep.set('resource_type', resource);
      if (dateFrom) ep.set('date_from', dateFrom);
      if (dateTo) ep.set('date_to', dateTo);
      ep.set('format', format);
      const res = await authedFetch(`/api/audit-log/export?${ep.toString()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `audit-log.${format}`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported as ${format.toUpperCase()}` });
    } catch { toast({ title: 'Export failed', variant: 'destructive' }); }
  };

  const filtered = (logs?.data || []).filter((l: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (l.resource_type || '').toLowerCase().includes(s) || (l.action || '').toLowerCase().includes(s) || (l.user_email || '').toLowerCase().includes(s) || (l.details || '').toLowerCase().includes(s);
  });

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">AUDIT LOG</h1>
          <p className="text-[10px] font-mono text-zinc-500">SOC 2 COMPLIANCE • ACTIVITY TRACKING • EXPORT</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs" onClick={() => doExport('csv')}>EXPORT CSV</Button>
          <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs" onClick={() => doExport('json')}>EXPORT JSON</Button>
        </div>
      </div>

      {/* Stats */}
      {stats?.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">TOTAL EVENTS</p><p className="text-2xl font-bold text-white">{stats.data.total_events || 0}</p></CardContent></Card>
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">TODAY</p><p className="text-2xl font-bold text-amber-400">{stats.data.today_events || 0}</p></CardContent></Card>
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">UNIQUE USERS</p><p className="text-2xl font-bold text-white">{stats.data.unique_users || 0}</p></CardContent></Card>
          <Card className="bg-zinc-900/80 border-zinc-800"><CardContent className="p-4"><p className="text-[10px] font-mono text-zinc-500">RESOURCE TYPES</p><p className="text-2xl font-bold text-white">{(stats.data.by_resource || []).length}</p></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><Label className="text-[10px] font-mono text-zinc-500">SEARCH</Label><Input className="bg-zinc-800 border-zinc-700 text-white" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div><Label className="text-[10px] font-mono text-zinc-500">ACTION</Label>
              <Select value={action} onValueChange={v => { setAction(v === 'all' ? '' : v); setPage(1); }}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="All" /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="all">All</SelectItem><SelectItem value="create">Create</SelectItem><SelectItem value="update">Update</SelectItem><SelectItem value="delete">Delete</SelectItem><SelectItem value="login">Login</SelectItem><SelectItem value="export">Export</SelectItem><SelectItem value="approve">Approve</SelectItem></SelectContent></Select></div>
            <div><Label className="text-[10px] font-mono text-zinc-500">RESOURCE</Label>
              <Select value={resource} onValueChange={v => { setResource(v === 'all' ? '' : v); setPage(1); }}><SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="All" /></SelectTrigger><SelectContent className="bg-zinc-800 border-zinc-700"><SelectItem value="all">All</SelectItem>{(stats?.data?.by_resource || []).map((r: any) => <SelectItem key={r.resource_type} value={r.resource_type}>{r.resource_type}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-[10px] font-mono text-zinc-500">FROM</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></div>
            <div><Label className="text-[10px] font-mono text-zinc-500">TO</Label><Input type="date" className="bg-zinc-800 border-zinc-700 text-white" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Log Entries */}
      <div className="space-y-1">
        {filtered.map((entry: any) => (
          <Card key={entry.id} className="bg-zinc-900/80 border-zinc-800">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-600 w-32 shrink-0">{new Date(entry.created_at).toLocaleString()}</span>
                <Badge className={ACTION_COLORS[entry.action] || 'bg-zinc-500/20 text-zinc-400'}>{entry.action}</Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">{entry.resource_type}</Badge>
                <span className="text-xs text-white truncate max-w-xs">{entry.details || `${entry.action} ${entry.resource_type}`}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-zinc-500">{entry.user_email || 'system'}</span>
                {entry.ip_address && <span className="text-[10px] font-mono text-zinc-600">{entry.ip_address}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {!filtered.length && <p className="text-center text-zinc-500 py-8 text-sm">No audit log entries found</p>}
      </div>

      {/* Pagination */}
      {(logs?.pagination?.total_pages || 0) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-zinc-500">Page {page} of {logs.pagination.total_pages}</span>
          <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 text-xs" disabled={page >= logs.pagination.total_pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
