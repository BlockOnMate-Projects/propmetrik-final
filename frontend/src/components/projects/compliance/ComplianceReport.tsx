'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Download,
  Send,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  FileSignature,
  Users,
  Loader2,
  ExternalLink,
  History,
  Mail,
  User,
  Calendar
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/authed-fetch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ComplianceReportProps {
  projectId: string;
  projectName: string;
}

interface Signee {
  signee_type: 'internal' | 'external';
  user_id?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface ComplianceReportRecord {
  id: string;
  project_id: string;
  report_type: string;
  report_title?: string;
  pdf_url: string;
  signing_request_id?: string;
  signing_status?: string;
  generated_by: string;
  created_at: string;
  signed_at?: string;
}

// API functions
const complianceReportApi = {
  generateReport: async (
    projectId: string,
    options: {
      include_inspections?: boolean;
      include_timeline?: boolean;
      include_recommendations?: boolean;
      for_signing?: boolean;
      signees?: Signee[];
    }
  ) => {
    const response = await authedFetch(`${API_URL}/projects/${projectId}/compliance/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!response.ok) throw new Error('Failed to generate report');
    return response.json();
  },

  getReports: async (projectId: string): Promise<ComplianceReportRecord[]> => {
    const response = await authedFetch(`${API_URL}/projects/${projectId}/compliance/reports`);
    if (!response.ok) throw new Error('Failed to fetch reports');
    return response.json();
  },

  downloadReport: (projectId: string, reportId: string) => {
    window.open(`${API_URL}/projects/${projectId}/compliance/report/${reportId}/download`, '_blank');
  },
};

// Signing status badge
function SigningStatusBadge({ status }: { status?: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    pending_sign: { label: 'Pending Signatures', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    partially_signed: { label: 'Partially Signed', variant: 'outline', icon: <Users className="h-3 w-3" /> },
    signed: { label: 'Fully Signed', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
    voided: { label: 'Voided', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
  };

  if (!status) return null;

  const config = statusConfig[status] || { label: status, variant: 'secondary' as const, icon: null };

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function ComplianceReport({ projectId, projectName }: ComplianceReportProps) {
  const queryClient = useQueryClient();
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isSigningDialogOpen, setIsSigningDialogOpen] = useState(false);
  
  // Generate options
  const [includeInspections, setIncludeInspections] = useState(true);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [includeRecommendations, setIncludeRecommendations] = useState(true);
  const [forSigning, setForSigning] = useState(false);
  
  // Signees
  const [signees, setSignees] = useState<Signee[]>([
    { signee_type: 'external', name: '', email: '', role: 'Project Manager' },
  ]);

  // Fetch existing reports
  const { data: reports, isLoading } = useQuery({
    queryKey: ['compliance-reports', projectId],
    queryFn: () => complianceReportApi.getReports(projectId),
  });

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      complianceReportApi.generateReport(projectId, {
        include_inspections: includeInspections,
        include_timeline: includeTimeline,
        include_recommendations: includeRecommendations,
        for_signing: forSigning,
        signees: forSigning ? signees.filter((s) => s.name && s.email) : undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['compliance-reports', projectId] });
      toast.success(
        forSigning
          ? 'Report generated and sent for signing'
          : 'Compliance report generated successfully'
      );
      setIsGenerateDialogOpen(false);
      
      // Optionally open the PDF
      if (data.pdf_url) {
        window.open(data.pdf_url, '_blank');
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate report: ${error.message}`);
    },
  });

  const handleAddSignee = () => {
    setSignees([...signees, { signee_type: 'external', name: '', email: '', role: '' }]);
  };

  const handleRemoveSignee = (index: number) => {
    setSignees(signees.filter((_, i) => i !== index));
  };

  const handleSigneeChange = (index: number, field: keyof Signee, value: string) => {
    const updated = [...signees];
    (updated[index] as any)[field] = value;
    setSignees(updated);
  };

  const handleGenerate = () => {
    if (forSigning && signees.filter((s) => s.name && s.email).length === 0) {
      toast.error('Please add at least one signee');
      return;
    }
    generateMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Compliance Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and manage compliance reports for stakeholders
          </p>
        </div>
        <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Generate Compliance Report</DialogTitle>
              <DialogDescription>
                Create a comprehensive compliance report for {projectName}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Report Options */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Report Sections</Label>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-inspections"
                    checked={includeInspections}
                    onCheckedChange={(checked) => setIncludeInspections(checked as boolean)}
                  />
                  <label
                    htmlFor="include-inspections"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include Inspection Log
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-timeline"
                    checked={includeTimeline}
                    onCheckedChange={(checked) => setIncludeTimeline(checked as boolean)}
                  />
                  <label
                    htmlFor="include-timeline"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include Regulatory Timeline
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-recommendations"
                    checked={includeRecommendations}
                    onCheckedChange={(checked) => setIncludeRecommendations(checked as boolean)}
                  />
                  <label
                    htmlFor="include-recommendations"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include Recommendations
                  </label>
                </div>
              </div>
              
              <Separator />
              
              {/* E-Sign Option */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="for-signing"
                    checked={forSigning}
                    onCheckedChange={(checked) => setForSigning(checked as boolean)}
                  />
                  <label
                    htmlFor="for-signing"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                  >
                    <FileSignature className="h-4 w-4 text-blue-600" />
                    Request E-Signatures
                  </label>
                </div>
                
                {forSigning && (
                  <div className="space-y-4 pl-6 border-l-2 border-blue-100">
                    <p className="text-sm text-muted-foreground">
                      Add people who need to review and sign this report
                    </p>
                    
                    {signees.map((signee, index) => (
                      <div key={index} className="grid grid-cols-3 gap-2 items-end">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            placeholder="Full name"
                            value={signee.name || ''}
                            onChange={(e) => handleSigneeChange(index, 'name', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input
                            type="email"
                            placeholder="email@example.com"
                            value={signee.email || ''}
                            onChange={(e) => handleSigneeChange(index, 'email', e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Label className="text-xs">Role</Label>
                            <Select
                              value={signee.role || ''}
                              onValueChange={(value) => handleSigneeChange(index, 'role', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Project Manager">Project Manager</SelectItem>
                                <SelectItem value="Site Engineer">Site Engineer</SelectItem>
                                <SelectItem value="Contractor">Contractor</SelectItem>
                                <SelectItem value="Client">Client</SelectItem>
                                <SelectItem value="Consultant">Consultant</SelectItem>
                                <SelectItem value="Investor">Investor</SelectItem>
                                <SelectItem value="Regulator">Regulator</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {signees.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="mt-5"
                              onClick={() => handleRemoveSignee(index)}
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddSignee}
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      Add Signee
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : forSigning ? (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Generate & Send
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Report
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reports List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Report History
          </CardTitle>
          <CardDescription>
            Previously generated compliance reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reports && reports.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Generated</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>E-Sign Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">
                            {format(new Date(report.created_at), 'MMM d, yyyy')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(report.created_at), 'h:mm a')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {report.report_type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {report.signing_request_id ? (
                        <SigningStatusBadge status={report.signing_status} />
                      ) : (
                        <span className="text-sm text-muted-foreground">No signatures</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(report.pdf_url, '_blank')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => complianceReportApi.downloadReport(projectId, report.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {report.signing_request_id && report.signing_status !== 'signed' && (
                          <Button variant="ghost" size="sm">
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="font-medium text-gray-700 mb-2">No Reports Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Generate your first compliance report to share with stakeholders
              </p>
              <Button variant="outline" onClick={() => setIsGenerateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <FileSignature className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-blue-900 mb-1">E-Signature Integration</h4>
              <p className="text-sm text-blue-700">
                Compliance reports can be sent for digital signatures. Signers will receive 
                an email with a secure link to review and sign the document. All signatures 
                are legally binding under Ghana&apos;s Electronic Transactions Act, 2008 (Act 772).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
