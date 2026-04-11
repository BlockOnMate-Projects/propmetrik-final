"use client";

/**
 * Envelope Detail Page
 *
 * Shows envelope info, signer statuses, document list, audit trail, and actions.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Ban,
  Send,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  User,
  Mail,
  Calendar,
  ShieldCheck,
  Copy,
  ExternalLink,
  Eye,
  PenTool,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  getEnvelope,
  voidEnvelope,
  resendEnvelope,
  downloadEnvelopeDocument,
} from "@/lib/esign-api";
import {
  Envelope,
  EnvelopeSigner,
  EnvelopeDocument,
  AuditEntry,
} from "@/lib/esign-types";

// ─── Status badge ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    draft: { color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: <FileText className="h-3 w-3" />, label: "Draft" },
    sent: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <Send className="h-3 w-3" />, label: "Sent" },
    pending: { color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Clock className="h-3 w-3" />, label: "Pending" },
    completed: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle className="h-3 w-3" />, label: "Completed" },
    signed: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle className="h-3 w-3" />, label: "Signed" },
    declined: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle className="h-3 w-3" />, label: "Declined" },
    voided: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <Ban className="h-3 w-3" />, label: "Voided" },
    expired: { color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <AlertCircle className="h-3 w-3" />, label: "Expired" },
  };
  const s = map[status] || map.pending!;
  return (
    <Badge className={`gap-1 ${s.color}`}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

// ─── Time helper ─────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

// ─── Page ────────────────────────────────────────────────

export default function EnvelopeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const envelopeId = params?.id as string;

  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Actions state
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchEnvelope = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEnvelope(envelopeId);
      setEnvelope(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load envelope");
    } finally {
      setLoading(false);
    }
  }, [envelopeId]);

  useEffect(() => {
    if (envelopeId) fetchEnvelope();
  }, [envelopeId, fetchEnvelope]);

  // ─── Actions ────────────────────────────────────────

  const handleVoid = async () => {
    setIsVoiding(true);
    setActionError(null);
    try {
      await voidEnvelope(envelopeId, voidReason);
      setVoidDialogOpen(false);
      setVoidReason("");
      await fetchEnvelope();
    } catch (err: any) {
      setActionError(err.message || "Failed to void envelope");
    } finally {
      setIsVoiding(false);
    }
  };

  const handleResend = async (signerEmail?: string) => {
    setIsResending(true);
    setActionError(null);
    try {
      await resendEnvelope(envelopeId, signerEmail);
      await fetchEnvelope();
    } catch (err: any) {
      setActionError(err.message || "Failed to resend");
    } finally {
      setIsResending(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const blob = await downloadEnvelopeDocument(envelopeId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${envelope?.subject || "document"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionError(err.message || "Failed to download");
    } finally {
      setIsDownloading(false);
    }
  };

  const copySigningLink = (link: string) => {
    navigator.clipboard.writeText(link);
  };

  // ─── Loading / Error ──────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !envelope) {
    return (
      <div className="container mx-auto py-16 max-w-md text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">Envelope Not Found</h2>
        <p className="text-muted-foreground mb-4">{error || "The requested envelope could not be loaded."}</p>
        <Button variant="outline" asChild>
          <Link href="/dashboard/e-sign">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const signers: EnvelopeSigner[] = envelope.signers || [];
  const documents: EnvelopeDocument[] = envelope.documents || [];
  const auditLog: AuditEntry[] = envelope.audit_log || envelope.auditLog || [];
  const isActive = ["sent", "pending"].includes(envelope.status);

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/e-sign"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{envelope.subject || envelope.name || "Envelope"}</h1>
            <div className="flex items-center gap-3 mt-1">
              <StatusBadge status={envelope.status} />
              <span className="text-sm text-muted-foreground">Created {timeAgo(envelope.created_at || envelope.createdAt || "")}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchEnvelope()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Download
          </Button>
          {isActive && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleResend()} disabled={isResending}>
                {isResending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Resend All
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setVoidDialogOpen(true)}>
                <Ban className="h-4 w-4 mr-1" /> Void
              </Button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="signers">Signers ({signers.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit Log ({auditLog.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Details Card */}
            <Card>
              <CardHeader><CardTitle className="text-base">Envelope Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={envelope.status} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Envelope ID</span>
                  <span className="font-mono text-xs">{envelope.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(envelope.created_at || envelope.createdAt || "")}</span>
                </div>
                {(envelope.completed_at || envelope.completedAt) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Completed</span>
                    <span>{formatDate(envelope.completed_at || envelope.completedAt || "")}</span>
                  </div>
                )}
                {(envelope.voided_at || envelope.voidedAt) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Voided</span>
                    <span>{formatDate(envelope.voided_at || envelope.voidedAt || "")}</span>
                  </div>
                )}
                {envelope.message && (
                  <div className="pt-2 border-t">
                    <span className="text-sm text-muted-foreground block mb-1">Message</span>
                    <p className="text-sm italic">&ldquo;{envelope.message}&rdquo;</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Signer Summary */}
            <Card>
              <CardHeader><CardTitle className="text-base">Signing Progress</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {signers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No signers</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(signers.filter((s) => s.status === "signed" || s.status === "completed").length / signers.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {signers.filter((s) => s.status === "signed" || s.status === "completed").length}/{signers.length}
                      </span>
                    </div>
                    {signers.map((s, i) => (
                      <div key={s.id || i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white ${
                            s.status === "signed" || s.status === "completed" ? "bg-green-500" : s.status === "declined" ? "bg-red-500" : "bg-gray-400"
                          }`}>
                            {(s.name || s.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{s.name || s.email}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Audit */}
          {auditLog.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditLog.slice(0, 5).map((entry, i) => (
                    <div key={entry.id || i} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <span className="font-medium">{entry.action || entry.event_type || entry.eventType || ""}</span>
                        {entry.details && <span className="text-muted-foreground ml-1">— {typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details)}</span>}
                      </div>
                      <span className="text-muted-foreground shrink-0">{timeAgo(entry.created_at || entry.createdAt || entry.timestamp || "")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Signers Tab */}
        <TabsContent value="signers" className="space-y-4 mt-4">
          {signers.map((signer, i) => (
            <Card key={signer.id || i}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                      signer.status === "signed" || signer.status === "completed" ? "bg-green-500" : signer.status === "declined" ? "bg-red-500" : "bg-blue-500"
                    }`}>
                      {(signer.name || signer.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold">{signer.name || "Unknown"}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {signer.email || "-"}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <StatusBadge status={signer.status} />
                        {signer.role && <Badge variant="outline" className="text-xs capitalize">{signer.role}</Badge>}
                        {(signer.signing_order || signer.signingOrder) && (
                          <span className="text-xs text-muted-foreground">Order: {signer.signing_order || signer.signingOrder}</span>
                        )}
                      </div>
                      {(signer.signed_at || signer.signedAt) && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Signed: {formatDate(signer.signed_at || signer.signedAt || "")}
                        </p>
                      )}
                      {signer.decline_reason && (
                        <p className="text-xs text-red-500 mt-1">Reason: {signer.decline_reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {signer.signing_url && signer.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => window.open(signer.signing_url!, '_blank')}>
                          <PenTool className="h-3 w-3 mr-1" /> Sign Now
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => copySigningLink(signer.signing_url!)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy Link
                        </Button>
                      </>
                    )}
                    {isActive && signer.status === "pending" && (
                      <Button variant="outline" size="sm" onClick={() => handleResend(signer.email)} disabled={isResending}>
                        <Send className="h-3 w-3 mr-1" /> Resend
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No documents attached
              </CardContent>
            </Card>
          ) : (
            documents.map((doc, i) => (
              <Card key={doc.id || i}>
                <CardContent className="pt-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-10 w-10 text-primary" />
                    <div>
                      <p className="font-medium">{doc.name || doc.filename || `Document ${i + 1}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.size ? `${(doc.size / 1024 / 1024).toFixed(2)} MB` : ""} {doc.mime_type || doc.mimeType || "PDF"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {doc.url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-3 w-3 mr-1" /> View
                        </a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleDownload} disabled={isDownloading}>
                      <Download className="h-3 w-3 mr-1" /> Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Audit Trail
              </CardTitle>
              <CardDescription>Complete timeline of all actions</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No audit entries yet</p>
              ) : (
                <div className="space-y-0">
                  {auditLog.map((entry, i) => {
                    const isLast = i === auditLog.length - 1;
                    return (
                      <div key={entry.id || i} className="flex gap-4">
                        {/* Timeline line */}
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shrink-0" />
                          {!isLast && <div className="w-px flex-1 bg-border" />}
                        </div>
                        <div className={`pb-6 flex-1 ${isLast ? "" : ""}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-medium capitalize">
                                {(entry.action || entry.event_type || entry.eventType || "").replace(/_/g, " ")}
                              </p>
                              {entry.actor_email && (
                                <p className="text-xs text-muted-foreground">{entry.actor_name || entry.actor_email}</p>
                              )}
                              {entry.details && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details)}
                                </p>
                              )}
                              {entry.ip_address && (
                                <p className="text-xs text-muted-foreground mt-0.5">IP: {entry.ip_address}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                              {formatDate(entry.created_at || entry.createdAt || entry.timestamp || "")}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Void Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Envelope</DialogTitle>
            <DialogDescription>
              This will void the envelope and notify all signers. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for voiding (optional)"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={isVoiding}>
              {isVoiding ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Voiding...</> : "Void Envelope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
