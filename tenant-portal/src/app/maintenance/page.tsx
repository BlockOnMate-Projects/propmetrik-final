'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PortalShell, { usePortal } from '@/components/portal/PortalShell';
import {
  getMaintenanceRequests,
  MaintenanceRequest,
} from '@/lib/api';
import { Plus, Wrench } from 'lucide-react';

function MaintenanceListContent() {
  const { activeTenancy } = usePortal();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!activeTenancy) { setLoading(false); return; }
    getMaintenanceRequests(activeTenancy.id)
      .then(setRequests)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeTenancy]);

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true;
    if (filter === 'open') return !['completed', 'cancelled'].includes(request.status);
    if (filter === 'completed') return request.status === 'completed';
    return request.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-gray-100 text-gray-800';
      case 'assigned':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'emergency':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="skeleton w-full h-5" />
            </div>
            <div className="skeleton w-48 h-4 mt-2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/dashboard" className="text-cyan-600 hover:underline">Return to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Maintenance Requests</h2>
          <p className="text-gray-500 text-sm">Track and manage your maintenance requests</p>
        </div>
        <Link
          href="/maintenance/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl font-medium shadow-sm hover:shadow-md hover:from-cyan-600 hover:to-cyan-700 transition-all"
        >
          <Plus className="w-4 h-4" /> New Request
        </Link>
      </div>
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: 'All' },
          { value: 'open', label: 'Open' },
          { value: 'assigned', label: 'Assigned' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' }
        ].map((option) => (
          <button
            key={option.label}
            onClick={() => setFilter(option.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === option.value
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>

        {/* Request List */}
      {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">No maintenance requests</h3>
            <p className="text-xs text-gray-400 mb-4">
              {filter === 'all'
                ? "You haven't submitted any requests yet."
                : `No requests matching "${filter}" status.`}
            </p>
            <Link
              href="/maintenance/new"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700"
            >
              Submit a Request
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filteredRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/maintenance/${request.id}`}
                  className="block hover:bg-gray-50/50 transition-colors"
                >
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{request.title}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getStatusColor(request.status)}`}>
                            {request.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs">
                          <span className="text-gray-500">{request.category}</span>
                          <span className={`font-medium ${getPriorityColor(request.priority)}`}>{request.priority}</span>
                          <span className="text-gray-400">{new Date(request.createdAt).toLocaleDateString()}</span>
                        </div>
                        {request.description && (
                          <p className="mt-1.5 text-xs text-gray-500 line-clamp-1">{request.description}</p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-gray-300 ml-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-gray-900">{requests.length}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-amber-600">{requests.filter(r => r.status === 'open').length}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-cyan-600">{requests.filter(r => r.status === 'in_progress').length}</p>
            <p className="text-xs text-gray-500">In Progress</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-emerald-600">{requests.filter(r => r.status === 'completed').length}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </div>
    </div>
  );
}

export default function MaintenanceListPage() {
  return (
    <PortalShell title="Maintenance">
      <MaintenanceListContent />
    </PortalShell>
  );
}
