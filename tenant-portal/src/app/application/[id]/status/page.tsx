"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getApplicationStatus, ApplicationStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, FileText, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function ApplicationStatusPage() {
  const params = useParams();
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        if (!params.id) return;
        const data = await getApplicationStatus(params.id as string);
        setStatus(data);
      } catch (err) {
        setError("Failed to load application status");
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Application Not Found</h1>
          <p className="text-muted-foreground">{error || "We couldn't find an application with that ID."}</p>
        </div>
      </div>
    );
  }

  const steps = [
    { id: 'submitted', label: 'Submitted', icon: FileText },
    { id: 'reviewing', label: 'Under Review', icon: Clock },
    { id: 'approved', label: 'Decision Made', icon: CheckCircle2 },
    { id: 'lease_sent', label: 'Lease Pending', icon: FileText },
  ];

  // Logic to determine active step would go here based on backend status enum
  const getStepStatus = (stepId: string) => {
    const statusMap: Record<string, number> = {
      'submitted': 0,
      'under_review': 1,
      'approved': 2,
      'lease_sent': 3,
      'signed': 4
    };

    // Simple mock logic for demonstration
    const currentStatusIndex = statusMap[status.status.toLowerCase()] ?? 0;
    const stepIndex = steps.findIndex(s => s.id === stepId); // This logic needs alignment with actual enum

    // Fallback simple active logic
    if (status.status.toLowerCase() === stepId) return 'current';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Application Status</h1>
          <p className="text-slate-500 mt-2">Tracking ID: {status.id}</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{status.propertyName}</CardTitle>
                <CardDescription>
                  {status.propertyAddress && <span className="block">{status.propertyAddress}</span>}
                  Submitted on {status.submittedAt ? new Date(status.submittedAt).toLocaleDateString() : 'N/A'}
                </CardDescription>
              </div>
              <Badge variant={
                status.status === 'approved' ? 'default' :
                  status.status === 'rejected' ? 'destructive' : 'secondary'
              } className="text-sm px-3 py-1">
                {status.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative py-8">
              {/* Timeline */}
              <div className="space-y-8">
                {status.timeline.length > 0 ? status.timeline.map((event, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-4 rounded-full bg-primary" />
                      {i !== status.timeline.length - 1 && (
                        <div className="w-0.5 grow bg-slate-200" />
                      )}
                    </div>
                    <div className="pb-8">
                      <p className="font-semibold text-slate-900">{event.stage}</p>
                      <p className="text-sm text-slate-500">{event.date ? new Date(event.date).toLocaleDateString() : ''}</p>
                      {event.notes && <p className="mt-1 text-sm text-slate-700">{event.notes}</p>}
                    </div>
                  </div>
                )) : (
                  <p className="text-slate-500">No status updates yet.</p>
                )}
              </div>
            </div>

            {status.status === 'lease_generated' && (
              <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-900">Lease Ready to Sign</h4>
                  <p className="text-sm text-blue-700">Congratulations! Please review and sign your lease.</p>
                </div>
                {status.signerToken ? (
                  <a href={`${process.env.NEXT_PUBLIC_MAIN_APP_URL || 'http://localhost:3000'}/sign/${status.signerToken}`}>
                    <Button>Sign Lease <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </a>
                ) : (
                  <Link href={`/lease/${status.id}`}>
                    <Button>Review Lease <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
