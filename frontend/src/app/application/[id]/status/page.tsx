'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getApplicationStatus, ApplicationStatus } from '@/lib/tenant/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Building2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock; desc: string }> = {
  submitted: { label: 'Submitted', color: 'text-blue-600', bg: 'bg-blue-50', icon: Clock, desc: 'Your application has been received and is awaiting review.' },
  under_review: { label: 'Under Review', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock, desc: 'Your application is currently being evaluated by the property manager.' },
  approved: { label: 'Approved', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2, desc: 'Congratulations! Your application has been approved.' },
  rejected: { label: 'Not Approved', color: 'text-red-600', bg: 'bg-red-50', icon: XCircle, desc: 'Unfortunately, your application was not approved at this time.' },
  lease_generated: { label: 'Lease Sent', color: 'text-purple-600', bg: 'bg-purple-50', icon: FileText, desc: 'Your lease agreement is ready. Please review and sign it.' },
  signed: { label: 'Lease Signed', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2, desc: 'Your lease is signed and your tenancy is active. Welcome home!' },
};

// Ordered timeline stages shown in the progress tracker.
const STEPS = ['submitted', 'under_review', 'approved', 'lease_generated', 'signed'];
const STEP_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  lease_generated: 'Lease Sent',
  signed: 'Lease Signed',
};

// Map raw application status + derived lease flags → the timeline stage to show.
function resolveStage(status: {
  status: string;
  leaseGenerated?: boolean;
  leaseSigned?: boolean;
}): string {
  const raw = (status.status || '').toLowerCase();
  if (raw === 'rejected') return 'rejected';
  if (status.leaseSigned) return 'signed';
  if (status.leaseGenerated || raw === 'lease_generated') return 'lease_generated';
  if (raw === 'approved') return 'approved';
  if (raw === 'under_review' || raw === 'reviewing') return 'under_review';
  return 'submitted';
}

export default function ApplicationStatusPage() {
  const params = useParams();
  const id = params.id as string;
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadStatus();
  }, [id]);

  const loadStatus = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getApplicationStatus(id);
      setStatus(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Application Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">
              We couldn&apos;t find an application with this tracking ID. Please check the link and try again.
            </p>
            <Button onClick={loadStatus} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" /> Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stage = resolveStage(status);
  const cfg = STATUS_CONFIG[stage] || STATUS_CONFIG.submitted;
  const StatusIcon = cfg.icon;
  const currentStepIdx = STEPS.indexOf(stage);
  const isRejected = stage === 'rejected';

  return (
    <div className="min-h-screen bg-muted">
      <div className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Application Status</h1>
              <p className="text-sm text-muted-foreground">Tracking ID: {id}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Status Card */}
        <Card>
          <CardContent className="py-8 text-center">
            <div className={`w-16 h-16 ${cfg.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <StatusIcon className={`w-8 h-8 ${cfg.color}`} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">{cfg.label}</h2>
            <p className="text-sm text-muted-foreground">{cfg.desc}</p>
            {status.updatedAt && (
              <p className="text-xs text-muted-foreground mt-3">
                Last updated: {new Date(status.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        {!isRejected && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between relative">
                <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200" />
                <div className="absolute left-0 top-4 h-0.5 bg-cyan-500 transition-all"
                  style={{ width: `${Math.max(0, (currentStepIdx / (STEPS.length - 1)) * 100)}%` }} />
                {STEPS.map((step, i) => {
                  const isComplete = i <= currentStepIdx;
                  const isCurrent = i === currentStepIdx;
                  return (
                    <div key={step} className="relative flex flex-col items-center z-10">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isComplete ? 'bg-cyan-500 text-foreground' : 'bg-gray-200 text-muted-foreground'
                      } ${isCurrent ? 'ring-4 ring-cyan-100' : ''}`}>
                        {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                      </div>
                      <p className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${isComplete ? 'text-cyan-600' : 'text-muted-foreground'}`}>
                        {STEP_LABEL[step]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {/* Lease signed — terminal success state */}
        {stage === 'signed' && (
          <Card className="border-emerald-200">
            <CardContent className="py-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Lease signed & tenancy active</p>
                  <p className="text-xs text-muted-foreground">All parties have signed. Your executed lease is available in your tenant portal.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {status.leaseSignedUrl && /^https?:\/\//.test(status.leaseSignedUrl) && (
                  <a href={status.leaseSignedUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full gap-2">
                      <FileText className="w-4 h-4" /> View Signed Lease
                    </Button>
                  </a>
                )}
                <Link href="/tenant/dashboard">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">Go to Tenant Portal</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lease sent, awaiting signature */}
        {stage === 'lease_generated' && status.leaseId && (
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Lease Agreement Ready</p>
                  <p className="text-xs text-muted-foreground">Your lease agreement is ready for review and signing</p>
                </div>
              </div>
              <Link href={`/dashboard/tenant/lease/${status.leaseId}`}>
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700">Review & Sign Lease</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Refresh */}
        <div className="text-center">
          <button onClick={loadStatus} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-700 font-medium">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
          </button>
        </div>

        <div className="text-center pt-4 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Building2 className="w-4 h-4" />
            <span className="text-xs">Propmetrik Tenant Portal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
