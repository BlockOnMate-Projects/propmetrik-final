"use client";

/**
 * E-Sign Dashboard Page
 * 
 * Main landing page for e-signature functionality within the PROPMETRIK dashboard.
 * Lists envelopes, provides quick actions, and shows signing statistics.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  FileText, 
  PenTool, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Plus, 
  ChevronRight,
  Loader2,
  FileSignature
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Envelope {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  contextType?: string;
  contextEntityName?: string;
  signersCount?: number;
  completedCount?: number;
}

interface Stats {
  total: number;
  pending: number;
  completed: number;
  voided: number;
}

export default function ESignDashboard() {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, completed: 0, voided: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/v1/esign/envelopes?limit=10');
        const data = await response.json();
        setEnvelopes(data.envelopes || []);
        
        // Calculate stats from envelopes
        const all = data.envelopes || [];
        setStats({
          total: data.total || all.length,
          pending: all.filter((e: Envelope) => e.status === 'pending' || e.status === 'in_progress').length,
          completed: all.filter((e: Envelope) => e.status === 'completed').length,
          voided: all.filter((e: Envelope) => e.status === 'voided').length,
        });
      } catch (error) {
        console.error('Failed to fetch envelopes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case 'voided':
        return <Badge className="bg-red-100 text-red-800">Voided</Badge>;
      case 'expired':
        return <Badge className="bg-muted text-gray-800">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">E-Signatures</h1>
          <p className="text-muted-foreground">Manage your documents and signature requests</p>
        </div>
        <Button asChild>
          <Link href="/esign/new">
            <Plus className="mr-2 h-4 w-4" />
            New Envelope
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Documents</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <FileText className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting Signatures</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{stats.pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <Clock className="h-5 w-5 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.completed}</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Voided</CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats.voided}</CardTitle>
          </CardHeader>
          <CardContent>
            <XCircle className="h-5 w-5 text-red-500" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {}}>
          <CardHeader>
            <PenTool className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Request Signature</CardTitle>
            <CardDescription>Send a document for signing</CardDescription>
          </CardHeader>
        </Card>
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {}}>
          <CardHeader>
            <FileSignature className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Templates</CardTitle>
            <CardDescription>Use pre-built document templates</CardDescription>
          </CardHeader>
        </Card>
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {}}>
          <CardHeader>
            <FileText className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Reports</CardTitle>
            <CardDescription>View signing analytics</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Envelopes */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Documents</CardTitle>
            <Button variant="ghost" asChild>
              <Link href="/esign/envelopes">
                View All <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : envelopes.length > 0 ? (
            <div className="space-y-4">
              {envelopes.map((envelope) => (
                <div 
                  key={envelope.id} 
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{envelope.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {envelope.contextEntityName || 'Document'} • {new Date(envelope.createdAt).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(envelope.status)}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/esign/envelopes/${envelope.id}`}>
                        View <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No documents yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first signature request</p>
              <Button asChild>
                <Link href="/esign/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Envelope
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
