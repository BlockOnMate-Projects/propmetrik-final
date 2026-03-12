'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getTenantProfile,
  getPaymentSummary,
  getMaintenanceRequests,
  getSessionToken,
  TenantProfile,
  PaymentSummary,
  MaintenanceRequest
} from '@/lib/api';

export default function TenantDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.push('/login');
      return;
    }

    async function loadDashboard() {
      try {
        const profileData = await getTenantProfile();
        setProfile(profileData);

        // Load data for first active tenancy
        const activeTenancy = profileData.tenancies?.find(t => t.status === 'active');
        if (activeTenancy) {
          const [summary, requests] = await Promise.all([
            getPaymentSummary(activeTenancy.id),
            getMaintenanceRequests(activeTenancy.id)
          ]);
          setPaymentSummary(summary);
          setMaintenanceRequests(requests);
        }
      } catch (err: any) {
        setError(err.message);
        if (err.message === 'Session expired') {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="text-blue-600 hover:underline"
          >
            Return to login
          </button>
        </div>
      </div>
    );
  }

  const activeTenancy = profile?.tenancies?.find(t => t.status === 'active');
  const openRequests = maintenanceRequests.filter(r => r.status !== 'completed' && r.status !== 'cancelled');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Tenant Portal</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-600">{profile?.fullName}</span>
              <Link
                href="/profile"
                className="text-sm text-blue-600 hover:underline"
              >
                Profile
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900">
            Welcome back, {profile?.fullName?.split(' ')[0]}!
          </h2>
          {activeTenancy && (
            <p className="text-gray-600 mt-1">
              {activeTenancy.propertyTitle} • {activeTenancy.propertyAddress}
            </p>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Payment Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Outstanding Balance
            </h3>
            <p className={`text-3xl font-bold mt-2 ${
              (paymentSummary?.totalOutstanding || 0) > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {paymentSummary?.currency || 'GHS'} {(paymentSummary?.totalOutstanding || 0).toLocaleString()}
            </p>
            {paymentSummary?.overdueSchedules && paymentSummary.overdueSchedules > 0 && (
              <p className="text-sm text-red-500 mt-1">
                {paymentSummary.overdueSchedules} overdue payment(s)
              </p>
            )}
            <Link
              href="/payments"
              className="text-blue-600 text-sm hover:underline mt-4 inline-block"
            >
              View payment details →
            </Link>
          </div>

          {/* Next Payment */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Next Payment Due
            </h3>
            {paymentSummary?.nextPaymentDue ? (
              <>
                <p className="text-3xl font-bold mt-2 text-gray-900">
                  {paymentSummary.currency} {paymentSummary.nextPaymentDue.amount.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Due: {new Date(paymentSummary.nextPaymentDue.dueDate).toLocaleDateString()}
                </p>
              </>
            ) : (
              <p className="text-gray-500 mt-2">No upcoming payments</p>
            )}
            <Link
              href="/payments/make"
              className="text-blue-600 text-sm hover:underline mt-4 inline-block"
            >
              Make a payment →
            </Link>
          </div>

          {/* Maintenance Requests */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Open Maintenance Requests
            </h3>
            <p className="text-3xl font-bold mt-2 text-gray-900">
              {openRequests.length}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {openRequests.filter(r => r.priority === 'high' || r.priority === 'emergency').length} high priority
            </p>
            <Link
              href="/maintenance"
              className="text-blue-600 text-sm hover:underline mt-4 inline-block"
            >
              View requests →
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/payments/make"
                className="flex items-center justify-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-900">Pay Rent</span>
                </div>
              </Link>
              
              <Link
                href="/tenant/maintenance/new"
                className="flex items-center justify-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-900">Report Issue</span>
                </div>
              </Link>
              
              <Link
                href="/documents"
                className="flex items-center justify-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-900">Documents</span>
                </div>
              </Link>
              
              <Link
                href="/profile"
                className="flex items-center justify-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-900">My Profile</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Maintenance</h3>
            {maintenanceRequests.length > 0 ? (
              <div className="space-y-3">
                {maintenanceRequests.slice(0, 3).map((request) => (
                  <div key={request.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-gray-900">{request.title}</p>
                      <p className="text-sm text-gray-500">{request.category}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      request.status === 'completed' ? 'bg-green-100 text-green-800' :
                      request.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      request.status === 'assigned' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {request.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No maintenance requests</p>
            )}
          </div>
        </div>

        {/* Lease Info */}
        {activeTenancy && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Lease</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Property</p>
                <p className="font-medium">{activeTenancy.propertyTitle}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Monthly Rent</p>
                <p className="font-medium">{activeTenancy.rentCurrency} {(activeTenancy.rentAmount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Lease Start</p>
                <p className="font-medium">{activeTenancy.startDate ? new Date(activeTenancy.startDate).toLocaleDateString() : '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Lease End</p>
                <p className="font-medium">{activeTenancy.endDate ? new Date(activeTenancy.endDate).toLocaleDateString() : '—'}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
