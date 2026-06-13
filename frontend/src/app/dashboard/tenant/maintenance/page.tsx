'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import { getMaintenanceRequests, MaintenanceRequest } from '@/lib/tenant/api';
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  CalendarDays,
  ArrowLeft,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  submitted: { label: 'Submitted', color: 'text-blue-600', bg: 'bg-blue-50', icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertCircle },
  scheduled: { label: 'Scheduled', color: 'text-purple-600', bg: 'bg-purple-50', icon: CalendarDays },
  completed: { label: 'Completed', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-muted-foreground', bg: 'bg-muted', icon: AlertCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-muted-foreground bg-muted' },
  medium: { label: 'Medium', color: 'text-amber-600 bg-amber-50' },
  high: { label: 'High', color: 'text-orange-600 bg-orange-50' },
  urgent: { label: 'Urgent', color: 'text-red-600 bg-red-50' },
};

const T = '/dashboard/tenant';

function MaintenanceContent() {
  const { activeTenancy } = usePortal();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const showSuccess = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success') === 'true';

  useEffect(() => {
    if (activeTenancy) loadRequests();
  }, [activeTenancy]);

  const loadRequests = async () => {
    try {
      const data = await getMaintenanceRequests(activeTenancy!.id);
      setRequests(data);
    } catch {} finally {
      setLoading(false);
    }
  };

  const filtered = requests.filter(r => {
    if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase()) && !r.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: requests.length,
    open: requests.filter(r => !['completed', 'cancelled'].includes(r.status)).length,
    completed: requests.filter(r => r.status === 'completed').length,
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {showSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800 font-medium">Your maintenance request has been submitted successfully!</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total</p>
        </div>
        <div className="bg-card rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.open}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Open</p>
        </div>
        <div className="bg-card rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search requests..."
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2.5 border border-border rounded-xl text-sm bg-card focus:ring-2 focus:ring-cyan-500 appearance-none">
              <option value="">All Status</option>
              {Object.entries(STATUS_CONFIG).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
            </select>
          </div>
          <Link href={`${T}/maintenance/new`}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-foreground rounded-xl text-sm font-medium hover:bg-cyan-700 transition-colors">
            <Plus className="w-4 h-4" /> New Request
          </Link>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">
            {searchQuery || statusFilter ? 'No matching requests found' : 'No maintenance requests yet'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchQuery || statusFilter ? 'Try adjusting your search or filter' : 'Submit a request when something needs fixing'}
          </p>
          {!searchQuery && !statusFilter && (
            <Link href={`${T}/maintenance/new`} className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-cyan-600 text-foreground rounded-xl text-sm font-medium hover:bg-cyan-700">
              <Plus className="w-4 h-4" /> Create Request
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => {
            const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted;
            const priorityCfg = PRIORITY_CONFIG[req.priority || 'medium'] || PRIORITY_CONFIG.medium;
            const StatusIcon = statusCfg.icon;
            return (
              <Link key={req.id} href={`${T}/maintenance/${req.id}`}
                className="block bg-card rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-border transition-all p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg ${statusCfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <StatusIcon className={`w-4 h-4 ${statusCfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{req.title}</p>
                        {req.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{req.description}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${priorityCfg.color}`}>
                        {priorityCfg.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Back */}
      <Link href={`${T}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-700 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <PortalShell title="Maintenance">
      <MaintenanceContent />
    </PortalShell>
  );
}
