'use client';

/**
 * ComplianceDashboard Component
 * Phase 3: Compliance & Document Management
 * 
 * Displays:
 * - Overall compliance score with risk indicator
 * - Permit status overview
 * - Expiring permits alerts
 * - Upcoming inspections
 * - Recent compliance activity
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileCheck,
  Calendar,
  Shield,
  TrendingUp,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { complianceApi, ComplianceDashboard as ComplianceDashboardData } from '@/lib/projects-api';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface ComplianceDashboardProps {
  projectId: string;
  onViewPermits?: () => void;
  onViewInspections?: () => void;
}

export function ComplianceDashboard({ 
  projectId, 
  onViewPermits,
  onViewInspections 
}: ComplianceDashboardProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['compliance-dashboard', projectId],
    queryFn: () => complianceApi.getDashboard(projectId),
  });

  if (isLoading) {
    return <ComplianceDashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load compliance data</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { score, permits, upcoming_inspections, expiring_soon, recent_activity } = data;

  return (
    <div className="space-y-6">
      {/* Score Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <ComplianceScoreCard score={score} />
        <PermitStatsCard permits={permits} />
        <ExpiringAlertsCard permits={expiring_soon} />
        <InspectionsCard inspections={upcoming_inspections} />
      </div>

      {/* Permits and Inspections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Permits Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-medium">Permits Overview</CardTitle>
              <CardDescription>Status of all required permits</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onViewPermits}>
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {permits.slice(0, 5).map((permit) => (
                <div key={permit.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <PermitStatusIcon status={permit.status} />
                    <div>
                      <p className="font-medium text-sm">{permit.permit_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {permit.authority_name || 'No authority assigned'}
                      </p>
                    </div>
                  </div>
                  <PermitStatusBadge status={permit.status} />
                </div>
              ))}
              {permits.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No permits added yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Inspections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-medium">Upcoming Inspections</CardTitle>
              <CardDescription>Scheduled regulatory inspections</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onViewInspections}>
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcoming_inspections.slice(0, 5).map((inspection) => (
                <div key={inspection.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-sm">{inspection.inspection_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {inspection.inspector_name || 'Inspector TBD'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {inspection.scheduled_date 
                        ? format(new Date(inspection.scheduled_date), 'MMM d, yyyy')
                        : 'Not scheduled'}
                    </p>
                    {inspection.scheduled_date && (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(inspection.scheduled_date), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {upcoming_inspections.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No upcoming inspections
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Permits Alert */}
      {expiring_soon.length > 0 && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-base font-medium text-yellow-800 dark:text-yellow-200">
                Permits Expiring Soon
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {expiring_soon.map((permit) => (
                <div key={permit.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                  <p className="font-medium text-sm">{permit.permit_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires: {permit.expiration_date 
                      ? format(new Date(permit.expiration_date), 'MMM d, yyyy')
                      : 'Unknown'}
                  </p>
                  <p className="text-xs text-yellow-600 font-medium mt-1">
                    {permit.expiration_date && 
                      formatDistanceToNow(new Date(permit.expiration_date), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recent_activity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recent_activity.map((activity, index) => (
                <div key={index} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className={cn(
                    'h-2 w-2 rounded-full',
                    activity.type === 'permit' ? 'bg-blue-500' : 'bg-green-500'
                  )} />
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{activity.name}</span>
                      {' '}
                      <span className="text-muted-foreground">
                        {activity.type === 'permit' ? 'permit' : 'inspection'}
                      </span>
                      {' → '}
                      <span className={cn(
                        'font-medium',
                        activity.status === 'approved' || activity.status === 'passed' 
                          ? 'text-green-600' 
                          : activity.status === 'rejected' || activity.status === 'failed'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      )}>
                        {activity.status}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.updated_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Sub-components

function ComplianceScoreCard({ score }: { score: ComplianceDashboardData['score'] }) {
  const scoreValue = score?.compliance_score ?? 0;
  const riskLevel = score?.risk_level ?? 'unknown';

  const riskColors = {
    low: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    high: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    critical: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    unknown: 'text-gray-600 bg-gray-100 dark:bg-gray-900/30',
  };

  const progressColors = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-orange-500',
    critical: 'bg-red-500',
    unknown: 'bg-gray-500',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-medium">Compliance Score</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-4xl font-bold">{scoreValue}</span>
          <span className="text-muted-foreground mb-1">/100</span>
        </div>
        <Progress 
          value={scoreValue} 
          className={cn('h-2', progressColors[riskLevel])}
        />
        <div className="mt-3">
          <Badge className={cn('font-medium', riskColors[riskLevel])}>
            {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function PermitStatsCard({ permits }: { permits: ComplianceDashboardData['permits'] }) {
  const approved = permits.filter(p => p.status === 'approved' || p.status === 'approved_with_conditions').length;
  const pending = permits.filter(p => ['not_started', 'documents_gathering', 'application_submitted', 'under_review', 'additional_info_required'].includes(p.status)).length;
  const expired = permits.filter(p => p.status === 'expired').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-medium">Permit Status</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-bold text-green-600">{approved}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{expired}</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </div>
        </div>
        <div className="mt-3">
          <p className="text-sm text-muted-foreground text-center">
            {permits.length} total permits
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpiringAlertsCard({ permits }: { permits: ComplianceDashboardData['expiring_soon'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-base font-medium">Expiring Soon</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-4xl font-bold text-yellow-600">{permits.length}</span>
          <span className="text-muted-foreground mb-1">permits</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Expiring within 60 days
        </p>
        {permits.length > 0 && (
          <div className="mt-2">
            <Badge variant="outline" className="text-yellow-600 border-yellow-500">
              Action Required
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InspectionsCard({ inspections }: { inspections: ComplianceDashboardData['upcoming_inspections'] }) {
  const nextInspection = inspections[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-500" />
          <CardTitle className="text-base font-medium">Inspections</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-4xl font-bold text-blue-600">{inspections.length}</span>
          <span className="text-muted-foreground mb-1">upcoming</span>
        </div>
        {nextInspection && nextInspection.scheduled_date ? (
          <p className="text-sm text-muted-foreground">
            Next: {format(new Date(nextInspection.scheduled_date), 'MMM d')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No scheduled inspections
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PermitStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'approved':
    case 'approved_with_conditions':
    case 'renewed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'rejected':
    case 'expired':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'not_required':
      return <CheckCircle2 className="h-5 w-5 text-gray-400" />;
    default:
      return <Clock className="h-5 w-5 text-yellow-500" />;
  }
}

function PermitStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    not_required: { label: 'Not Required', className: 'bg-gray-100 text-gray-700' },
    not_started: { label: 'Not Started', className: 'bg-gray-100 text-gray-700' },
    documents_gathering: { label: 'Gathering Docs', className: 'bg-blue-100 text-blue-700' },
    application_submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-700' },
    under_review: { label: 'Under Review', className: 'bg-yellow-100 text-yellow-700' },
    additional_info_required: { label: 'Info Required', className: 'bg-orange-100 text-orange-700' },
    approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
    approved_with_conditions: { label: 'Conditional', className: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
    expired: { label: 'Expired', className: 'bg-red-100 text-red-700' },
    renewed: { label: 'Renewed', className: 'bg-green-100 text-green-700' },
  };

  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' };

  return (
    <Badge className={cn('font-medium', config.className)}>
      {config.label}
    </Badge>
  );
}

function ComplianceDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-24 mb-2" />
              <Skeleton className="h-2 w-full mb-3" />
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center justify-between py-3 border-b last:border-0">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ComplianceDashboard;
