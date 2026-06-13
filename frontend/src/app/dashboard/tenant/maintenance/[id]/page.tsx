'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PortalShell from '@/components/tenant/PortalShell';
import { getMaintenanceRequest, addMaintenanceComment, MaintenanceRequest, MaintenanceComment } from '@/lib/tenant/api';
import { useToast } from '@/contexts/TenantToastContext';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  MessageSquare,
  Send,
  Loader2,
  User,
  Building2,
  Wrench,
  Phone,
  Image as ImageIcon,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  submitted: { label: 'Submitted', color: 'text-blue-600', bg: 'bg-blue-50', icon: Clock },
  acknowledged: { label: 'Acknowledged', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: CheckCircle2 },
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

const STATUS_STEPS = ['submitted', 'acknowledged', 'in_progress', 'scheduled', 'completed'];

const T = '/dashboard/tenant';

function MaintenanceDetailContent() {
  const params = useParams();
  const id = params.id as string;
  const { addToast } = useToast();
  const [request, setRequest] = useState<MaintenanceRequest | null>(null);
  const [comments, setComments] = useState<MaintenanceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => {
    loadRequest();
  }, [id]);

  const loadRequest = async () => {
    try {
      const data = await getMaintenanceRequest(id);
      setRequest(data.request || data);
      setComments(data.comments || []);
    } catch {
      addToast('error', 'Failed to load request details');
    } finally {
      setLoading(false);
    }
  };

  const handleComment = async () => {
    if (!newComment.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      await addMaintenanceComment(id, newComment.trim());
      setNewComment('');
      loadRequest();
      addToast('success', 'Comment added');
    } catch {
      addToast('error', 'Failed to add comment');
    } finally {
      setSendingComment(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>;
  }

  if (!request) {
    return (
      <div className="text-center py-16">
        <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">Request not found</p>
        <Link href={`${T}/maintenance`} className="text-sm text-cyan-600 hover:underline mt-2 inline-block">Back to Maintenance</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.submitted;
  const priorityCfg = PRIORITY_CONFIG[request.priority || 'medium'] || PRIORITY_CONFIG.medium;
  const currentStepIndex = STATUS_STEPS.indexOf(request.status);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Link href={`${T}/maintenance`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-700 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Maintenance
      </Link>

      {/* Header */}
      <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{request.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Submitted {new Date(request.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${priorityCfg.color}`}>
              {priorityCfg.label}
            </span>
          </div>
        </div>

        {request.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{request.description}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Category</p>
            <p className="text-sm font-medium text-gray-900 capitalize mt-0.5">{request.category || '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Preferred Date</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {request.preferredDate ? new Date(request.preferredDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Preferred Time</p>
            <p className="text-sm font-medium text-gray-900 capitalize mt-0.5">{request.preferredTime || 'Any'}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Entry Permission</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{request.permissionToEnter ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      {/* Assigned Vendor & Scheduled Visit */}
      {request.vendorName && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Assigned Vendor</h3>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-50 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 text-cyan-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{request.vendorName}</p>
              {request.vendorContact && (
                <p className="text-xs text-muted-foreground mt-0.5">{request.vendorContact}</p>
              )}
              {request.vendorPhone && (
                <a href={`tel:${request.vendorPhone}`} className="inline-flex items-center gap-1.5 text-xs text-cyan-600 hover:underline mt-1">
                  <Phone className="w-3 h-3" /> {request.vendorPhone}
                </a>
              )}
            </div>
          </div>
          {request.scheduledDate && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-purple-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Scheduled Visit</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(request.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  {request.scheduledTimeStart && (
                    <span className="text-muted-foreground">
                      {' · '}{request.scheduledTimeStart.slice(0, 5)}
                      {request.scheduledTimeEnd ? `–${request.scheduledTimeEnd.slice(0, 5)}` : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress Tracker */}
      {request.status !== 'cancelled' && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Progress</h3>
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200" />
            <div className="absolute left-0 top-4 h-0.5 bg-cyan-500 transition-all" style={{ width: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 100}%` }} />
            {STATUS_STEPS.map((step, i) => {
              const isComplete = i <= currentStepIndex;
              const isCurrent = i === currentStepIndex;
              return (
                <div key={step} className="relative flex flex-col items-center z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isComplete ? 'bg-cyan-500 text-foreground' : 'bg-gray-200 text-muted-foreground'
                  } ${isCurrent ? 'ring-4 ring-cyan-100' : ''}`}>
                    {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <p className={`text-[10px] mt-1.5 font-medium capitalize whitespace-nowrap ${isComplete ? 'text-cyan-600' : 'text-muted-foreground'}`}>
                    {STATUS_CONFIG[step]?.label || step}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Photos */}
      {request.photos && request.photos.length > 0 && (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            <ImageIcon className="w-4 h-4 inline mr-1.5" /> Photos
          </h3>
          <div className="flex flex-wrap gap-2">
            {request.photos.map((photo: string, i: number) => (
              <a key={i} href={photo} target="_blank" rel="noopener noreferrer"
                className="w-24 h-24 rounded-lg overflow-hidden border border-border hover:opacity-80 transition-opacity">
                <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          <MessageSquare className="w-4 h-4 inline mr-1.5" /> Comments ({comments.length})
        </h3>
        {comments.length > 0 ? (
          <div className="space-y-4 mb-4">
            {comments.map(comment => {
              const isTenant = comment.senderType === 'tenant';
              return (
                <div key={comment.id} className={`flex gap-3 ${isTenant ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isTenant ? 'bg-cyan-100' : 'bg-muted'}`}>
                    {isTenant ? <User className="w-4 h-4 text-cyan-600" /> : <Building2 className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className={`max-w-[80%] ${isTenant ? 'text-right' : ''}`}>
                    <div className={`px-3 py-2 rounded-xl text-sm ${isTenant ? 'bg-cyan-50 text-gray-900' : 'bg-muted text-gray-900'}`}>
                      {comment.content}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {comment.senderName || (isTenant ? 'You' : 'Management')} · {new Date(comment.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-4 text-center py-4">No comments yet</p>
        )}
        <div className="flex items-end gap-2 pt-3 border-t border-gray-100">
          <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
            placeholder="Add a comment..." rows={1}
            className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 resize-none"
            style={{ minHeight: '42px', maxHeight: '120px' }} />
          <button onClick={handleComment} disabled={!newComment.trim() || sendingComment}
            className="p-2.5 bg-cyan-600 text-foreground rounded-xl hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0">
            {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenanceDetailPage() {
  return (
    <PortalShell title="Maintenance Request">
      <MaintenanceDetailContent />
    </PortalShell>
  );
}
