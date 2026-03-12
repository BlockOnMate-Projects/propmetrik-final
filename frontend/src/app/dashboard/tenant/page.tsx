'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import {
  getPaymentSummary,
  getMaintenanceRequests,
  PaymentSummary,
  MaintenanceRequest
} from '@/lib/tenant/api';
import {
  CreditCard,
  Wrench,
  FileText,
  User,
  Calendar,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Zap,
  RefreshCw,
} from 'lucide-react';

const T = '/dashboard/tenant';

function DashboardContent() {
  const { profile, activeTenancy } = usePortal();
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTenancy) { setLoading(false); return; }

    Promise.all([
      getPaymentSummary(activeTenancy.id).catch(() => null),
      getMaintenanceRequests(activeTenancy.id).catch(() => []),
    ]).then(([summary, requests]) => {
      setPaymentSummary(summary);
      setMaintenanceRequests(requests);
    }).finally(() => setLoading(false));
  }, [activeTenancy]);

  const openRequests = maintenanceRequests.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
  const highPriority = openRequests.filter(r => r.priority === 'high' || r.priority === 'emergency');
  const firstName = profile.fullName?.split(' ')[0] || 'Tenant';

  const leaseProgress = activeTenancy ? (() => {
    const start = new Date(activeTenancy.startDate).getTime();
    const end = new Date(activeTenancy.endDate).getTime();
    const now = Date.now();
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  })() : 0;

  const daysRemaining = activeTenancy
    ? Math.max(0, Math.ceil((new Date(activeTenancy.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const nextPaymentDays = paymentSummary?.nextPaymentDue
    ? Math.max(0, Math.ceil((new Date(paymentSummary.nextPaymentDue.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="space-y-6 lg:space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">
          Welcome back, {firstName}!
        </h2>
        {activeTenancy && (
          <p className="text-gray-500 mt-1">
            {activeTenancy.propertyTitle} • {activeTenancy.propertyAddress}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              (paymentSummary?.totalOutstanding || 0) > 0 ? 'bg-red-50' : 'bg-emerald-50'
            }`}>
              <TrendingUp className={`w-4 h-4 ${
                (paymentSummary?.totalOutstanding || 0) > 0 ? 'text-red-500' : 'text-emerald-500'
              }`} />
            </div>
          </div>
          <p className={`text-2xl lg:text-3xl font-bold ${
            (paymentSummary?.totalOutstanding || 0) > 0 ? 'text-red-600' : 'text-emerald-600'
          }`}>
            {paymentSummary?.currency || 'GHS'} {(paymentSummary?.totalOutstanding || 0).toLocaleString()}
          </p>
          {paymentSummary?.overdueSchedules && paymentSummary.overdueSchedules > 0 ? (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {paymentSummary.overdueSchedules} overdue
            </p>
          ) : (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> All clear
            </p>
          )}
          <Link href={`${T}/payments`} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium mt-3 inline-flex items-center gap-1">
            View details <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Due</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          {paymentSummary?.nextPaymentDue ? (
            <>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900">
                {paymentSummary.currency} {paymentSummary.nextPaymentDue.amount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {nextPaymentDays !== null && nextPaymentDays <= 7 ? (
                  <span className="text-amber-600 font-medium">
                    <Clock className="w-3 h-3 inline" /> in {nextPaymentDays} days
                  </span>
                ) : (
                  new Date(paymentSummary.nextPaymentDue.dueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-400 mt-1">No upcoming</p>
              <p className="text-xs text-gray-400">payments</p>
            </>
          )}
          <Link href={`${T}/payments`} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium mt-3 inline-flex items-center gap-1">
            Make payment <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Maintenance</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-cyan-500" />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-bold text-gray-900">{openRequests.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {highPriority.length > 0 ? (
              <span className="text-orange-600 font-medium">{highPriority.length} high priority</span>
            ) : (
              'open requests'
            )}
          </p>
          <Link href={`${T}/maintenance`} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium mt-3 inline-flex items-center gap-1">
            View requests <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lease</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-purple-500" />
            </div>
          </div>
          {activeTenancy ? (
            <>
              <p className="text-lg font-bold text-gray-900">
                {daysRemaining > 0 ? `${daysRemaining} days` : 'Expired'}
              </p>
              <div className="mt-2">
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      leaseProgress > 85 ? 'bg-amber-500' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${leaseProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {Math.round(leaseProgress)}% elapsed
                </p>
              </div>
            </>
          ) : (
            <p className="text-lg font-medium text-gray-400">No active lease</p>
          )}
          <Link href={`${T}/documents`} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium mt-2 inline-flex items-center gap-1">
            View lease <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
          {[
            { href: `${T}/payments`, label: 'Pay Rent', icon: CreditCard, gradient: 'from-cyan-500 to-cyan-600' },
            { href: `${T}/maintenance/new`, label: 'Report Issue', icon: Wrench, gradient: 'from-emerald-500 to-emerald-600' },
            { href: `${T}/documents`, label: 'Documents', icon: FileText, gradient: 'from-purple-500 to-purple-600' },
            { href: `${T}/payments`, label: 'Auto-Pay', icon: RefreshCw, gradient: 'from-amber-500 to-amber-600' },
            { href: `${T}/messages`, label: 'Messages', icon: Zap, gradient: 'from-blue-500 to-blue-600' },
            { href: `${T}/profile`, label: 'My Profile', icon: User, gradient: 'from-gray-500 to-gray-600' },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex flex-col items-center justify-center p-4 lg:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Activity</h3>
            <Link href={`${T}/payments`} className="text-xs text-cyan-600 hover:underline font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <div className="skeleton h-4 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/2 rounded mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {paymentSummary && paymentSummary.totalPaid > 0 && (
                  <div className="px-6 py-3.5 flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">Rent payment received</p>
                      <p className="text-xs text-gray-500">{paymentSummary.currency} {paymentSummary.totalPaid.toLocaleString()} total paid</p>
                    </div>
                    <span className="text-xs text-gray-400">Recent</span>
                  </div>
                )}
                {maintenanceRequests.slice(0, 3).map(req => (
                  <Link key={req.id} href={`${T}/maintenance/${req.id}`} className="px-6 py-3.5 flex items-center gap-3.5 hover:bg-gray-50 transition-colors">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      req.status === 'completed' ? 'bg-emerald-50' :
                      req.status === 'in_progress' ? 'bg-blue-50' :
                      'bg-amber-50'
                    }`}>
                      <Wrench className={`w-4 h-4 ${
                        req.status === 'completed' ? 'text-emerald-500' :
                        req.status === 'in_progress' ? 'text-blue-500' :
                        'text-amber-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{req.title}</p>
                      <p className="text-xs text-gray-500 capitalize">{req.status.replace('_', ' ')} • {req.category}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </Link>
                ))}
                {maintenanceRequests.length === 0 && !paymentSummary?.totalPaid && (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Clock className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500">No recent activity</p>
                    <p className="text-xs text-gray-400 mt-1">Your activity will appear here</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Maintenance Requests</h3>
            <Link href={`${T}/maintenance`} className="text-xs text-cyan-600 hover:underline font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : maintenanceRequests.length > 0 ? (
              maintenanceRequests.slice(0, 4).map(req => (
                <Link key={req.id} href={`${T}/maintenance/${req.id}`} className="px-6 py-3.5 flex items-center gap-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{req.title}</p>
                    <p className="text-xs text-gray-500">{req.category} • {new Date(req.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    req.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                    req.status === 'in_progress' ? 'bg-blue-50 text-blue-700' :
                    req.status === 'assigned' ? 'bg-amber-50 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {req.status.replace('_', ' ')}
                  </span>
                </Link>
              ))
            ) : (
              <div className="py-12 text-center">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">All good!</p>
                <p className="text-xs text-gray-400 mt-1">No active maintenance requests</p>
                <Link href={`${T}/maintenance/new`} className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-cyan-600 hover:text-cyan-700">
                  Submit a request <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTenancy && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Your Lease</h3>
            <Link href={`${T}/documents`} className="text-xs text-cyan-600 hover:underline font-medium inline-flex items-center gap-1">
              View full lease <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Property</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{activeTenancy.propertyTitle}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Rent</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {activeTenancy.rentCurrency} {activeTenancy.rentAmount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Lease Start</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {new Date(activeTenancy.startDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Lease End</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {new Date(activeTenancy.endDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PortalShell>
      <DashboardContent />
    </PortalShell>
  );
}
