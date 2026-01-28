'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getMaintenanceStatus,
  getSessionToken,
  MaintenanceRequest
} from '@/lib/api';

interface StatusHistoryEntry {
  status: string;
  updatedAt: string;
  updatedBy: string;
  notes?: string;
}

interface MaintenanceDetails extends MaintenanceRequest {
  tenant: {
    fullName: string;
    email: string;
    phone: string;
  };
  property: {
    title: string;
    address: string;
  };
  assignedTo?: {
    name: string;
    company?: string;
    phone?: string;
  };
  scheduledDate?: string;
  completedDate?: string;
  resolution?: string;
  images?: string[];
  statusHistory: StatusHistoryEntry[];
}

const STATUS_STEPS = [
  { key: 'open', label: 'Submitted', icon: '📝' },
  { key: 'assigned', label: 'Assigned', icon: '👷' },
  { key: 'in_progress', label: 'In Progress', icon: '🔧' },
  { key: 'completed', label: 'Completed', icon: '✅' }
];

export default function MaintenanceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [request, setRequest] = useState<MaintenanceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.push('/login');
      return;
    }

    async function loadRequest() {
      try {
        const data = await getMaintenanceStatus(requestId);
        setRequest(data as MaintenanceDetails);
      } catch (err: any) {
        setError(err.message);
        if (err.message === 'Session expired') {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    }

    loadRequest();
  }, [router, requestId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'assigned':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'emergency':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCurrentStepIndex = () => {
    if (!request) return 0;
    if (request.status === 'cancelled') return -1;
    return STATUS_STEPS.findIndex(s => s.key === request.status);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Request not found'}</p>
          <Link href="/maintenance" className="text-blue-600 hover:underline">
            Return to maintenance requests
          </Link>
        </div>
      </div>
    );
  }

  const currentStep = getCurrentStepIndex();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/maintenance" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">{request.title}</h1>
              <p className="text-sm text-gray-500">
                Request #{request.id.slice(0, 8)}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(request.status)}`}>
              {request.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Progress */}
        {request.status !== 'cancelled' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Status Progress</h2>
            <div className="flex items-center justify-between">
              {STATUS_STEPS.map((step, index) => (
                <div key={step.key} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${index <= currentStep
                      ? 'bg-blue-100'
                      : 'bg-gray-100'
                      }`}>
                      {step.icon}
                    </div>
                    <p className={`text-sm mt-2 font-medium ${index <= currentStep
                      ? 'text-blue-600'
                      : 'text-gray-400'
                      }`}>
                      {step.label}
                    </p>
                  </div>
                  {index < STATUS_STEPS.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 ${index < currentStep
                      ? 'bg-blue-500'
                      : 'bg-gray-200'
                      }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Details</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Category</dt>
                <dd className="font-medium">{request.category}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Priority</dt>
                <dd>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${getPriorityColor(request.priority)}`}>
                    {request.priority}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Location</dt>
                <dd className="font-medium">{request.location || 'Not specified'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Submitted</dt>
                <dd className="font-medium">
                  {new Date(request.createdAt).toLocaleString()}
                </dd>
              </div>
              {request.scheduledDate && (
                <div>
                  <dt className="text-sm text-gray-500">Scheduled Visit</dt>
                  <dd className="font-medium text-blue-600">
                    {new Date(request.scheduledDate).toLocaleString()}
                  </dd>
                </div>
              )}
              {request.completedDate && (
                <div>
                  <dt className="text-sm text-gray-500">Completed</dt>
                  <dd className="font-medium text-green-600">
                    {new Date(request.completedDate).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Assigned Technician */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Assigned To</h2>
            {request.assignedTo ? (
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{request.assignedTo.name}</p>
                  {request.assignedTo.company && (
                    <p className="text-sm text-gray-500">{request.assignedTo.company}</p>
                  )}
                  {request.assignedTo.phone && (
                    <a
                      href={`tel:${request.assignedTo.phone}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {request.assignedTo.phone}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Technician not yet assigned</p>
                <p className="text-sm">We'll notify you once someone is assigned</p>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{request.description}</p>
        </div>

        {/* Images */}
        {request.images && request.images.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Photos</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {request.images.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square"
                >
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Resolution */}
        {request.resolution && (
          <div className="bg-green-50 rounded-lg shadow p-6 mb-6 border border-green-200">
            <h2 className="text-lg font-semibold text-green-800 mb-4">Resolution</h2>
            <p className="text-green-700">{request.resolution}</p>
          </div>
        )}

        {/* Status History */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity History</h2>
          {request.statusHistory && request.statusHistory.length > 0 ? (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              <ul className="space-y-6">
                {request.statusHistory.map((entry, index) => (
                  <li key={index} className="relative pl-10">
                    <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${index === 0 ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                      <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-blue-500' : 'bg-gray-400'
                        }`}></div>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Status changed to{' '}
                        <span className={`px-2 py-0.5 rounded text-sm ${getStatusColor(entry.status)}`}>
                          {entry.status.replace('_', ' ')}
                        </span>
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(entry.updatedAt).toLocaleString()} by {entry.updatedBy}
                      </p>
                      {entry.notes && (
                        <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No activity recorded yet</p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4">
          <Link
            href="/maintenance"
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg text-center hover:bg-gray-200 transition-colors"
          >
            Back to Requests
          </Link>
          {request.status === 'open' && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to cancel this request?')) {
                  // TODO: Implement cancel functionality
                }
              }}
              className="px-6 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            >
              Cancel Request
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
