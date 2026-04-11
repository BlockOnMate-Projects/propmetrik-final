"use client";

/**
 * External Signing Page (Enhanced)
 *
 * Token-based public page for signers to:
 * - View the PDF document
 * - Navigate through required fields
 * - Sign using drawn / typed / uploaded signature (via SignatureModal)
 * - Decline with reason
 * - See completion status
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  Loader2,
  PenTool,
  RefreshCw,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import SignatureModal from "@/components/esign/SignatureModal";
import { SignatureData, PlacedField } from "@/lib/esign-types";
import { generateTextAsImage } from "@/components/esign/PDFViewer";

// ─── Types ───────────────────────────────────────────────

interface SignerInfo {
  envelope: {
    id: string;
    name: string;
    subject?: string;
    message?: string;
    status: string;
    documentPdfUrl?: string;
  };
  signer: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
  fields: Array<{
    id: string;
    type: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    label?: string;
    value?: string;
    signedAt?: string;
    signerId?: string;
    signerName?: string;
    readOnly?: boolean;
  }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export default function SigningPage() {
  const params = useParams();
  const token = params?.token as string;

  // State
  const [signerInfo, setSignerInfo] = useState<SignerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [signing, setSigning] = useState(false);

  // Field-by-field signing
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [completedFields, setCompletedFields] = useState<Map<string, { signatureData?: SignatureData; value?: string }>>(new Map());

  // Signature modal
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingFieldId, setPendingFieldId] = useState<string | null>(null);

  // Decline dialog
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  // PDF viewer
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 612, height: 792 });

  const isImageDataUrl = (value?: string): boolean => {
    return typeof value === "string" && value.startsWith("data:image/");
  };

  // ─── Load signer info ──────────────────────────────

  const loadSignerInfo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/esign/sign-envelope/${token}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Invalid or expired signing link");
      const data = await response.json();
      setSignerInfo(data);

      if (data.signer?.status === "signed" || data.signer?.status === "completed") {
        setSigned(true);
      } else if (data.signer?.status === "declined") {
        setDeclined(true);
      }

      // Pre-populate completedFields with other signers' already-signed fields
      // and the current signer's already-signed fields (if any)
      const preCompleted = new Map<string, { signatureData?: SignatureData; value?: string }>();
      for (const field of data.fields || []) {
        if (field.value && field.signedAt) {
          const isImage = isImageDataUrl(field.value);

          preCompleted.set(field.id, {
            signatureData: isImage ? { type: "drawn" as const, data: field.value } : undefined,
            value: isImage ? undefined : field.value,
          });
        }
      }
      if (preCompleted.size > 0) {
        setCompletedFields(preCompleted);
      }

      // Load PDF if URL available
      if (data.envelope?.documentPdfUrl) {
        const ts = Date.now();
        loadPdf(`${API_BASE}${data.envelope.documentPdfUrl}?t=${ts}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load signing information");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadSignerInfo();
  }, [token, loadSignerInfo]);

  // ─── PDF rendering (using pdfjs) ──────────────────

  const loadPdf = async (url: string) => {
    setPdfLoading(true);
    try {
      // @ts-expect-error — runtime URL import bypasses webpack to avoid pdfjs-dist v5 conflicts
      const pdfjsLib = await import(/* webpackIgnore: true */ "/pdf.min.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const loadingTask = pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      const pages: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        if (i === 1) setPdfDimensions({ width: viewport.width, height: viewport.height });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        pages.push(canvas.toDataURL());
      }
      setPdfPages(pages);
    } catch (err) {
      console.error("PDF load error:", err);
    } finally {
      setPdfLoading(false);
    }
  };

  // ─── Field helpers ─────────────────────────────────

  // All fields for rendering on the PDF (includes other signers' fields)
  const allFields = signerInfo?.fields || [];
  // Only current signer's fields for progress tracking & navigation
  const myFields = allFields.filter((f) => !f.readOnly);
  const requiredFields = myFields.filter((f) => f.required).length > 0 ? myFields.filter((f) => f.required) : myFields;
  const allFieldsComplete = requiredFields.every((f) => completedFields.has(f.id));
  const myCompletedCount = requiredFields.filter((f) => completedFields.has(f.id)).length;
  const progress = requiredFields.length > 0 ? (myCompletedCount / requiredFields.length) * 100 : 0;
  const currentField = requiredFields[currentFieldIndex];

  const scrollToField = (field: { page: number; y: number }) => {
    const el = pageRefs.current.get(field.page);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleFieldClick = (field: SignerInfo["fields"][0]) => {
    if (completedFields.has(field.id)) return; // already done

    if (field.type === "signature" || field.type === "initials") {
      setPendingFieldId(field.id);
      setShowSignatureModal(true);
    } else {
      // Auto-fill text fields
      autoFillField(field);
    }
  };

  const autoFillField = async (field: SignerInfo["fields"][0]) => {
    const signer = signerInfo?.signer;
    if (!signer) return;

    let value = "";
    switch (field.type) {
      case "date_signed":
        value = new Date().toLocaleDateString('en-GB');
        break;
      case "name":
        value = signer.name;
        break;
      case "email":
        value = signer.email;
        break;
      case "company":
        value = "";
        break;
      case "title":
        value = "";
        break;
      case "checkbox":
        value = "✓";
        break;
      default:
        value = field.label || field.type;
    }

    // Generate image for consistency
    const imgData = generateTextAsImage(value, { width: 200, height: 40 });
    setCompletedFields((prev) => {
      const next = new Map(prev);
      next.set(field.id, { signatureData: imgData ? { type: "typed", data: imgData } : undefined, value });
      return next;
    });

    // Advance to next incomplete
    advanceField(field.id);
  };

  const handleSignatureCapture = (data: SignatureData) => {
    if (!pendingFieldId) return;
    setCompletedFields((prev) => {
      const next = new Map(prev);
      next.set(pendingFieldId, { signatureData: data });
      return next;
    });
    advanceField(pendingFieldId);
    setShowSignatureModal(false);
    setPendingFieldId(null);
  };

  const advanceField = (justCompletedId: string) => {
    const nextIdx = requiredFields.findIndex((f, i) => i > currentFieldIndex && f.id !== justCompletedId && !completedFields.has(f.id));
    if (nextIdx >= 0) {
      setCurrentFieldIndex(nextIdx);
      scrollToField(requiredFields[nextIdx]);
    }
  };

  // ─── Submit ────────────────────────────────────────

  const handleSign = async () => {
    setSigning(true);
    try {
      const response = await fetch(`${API_BASE}/esign/sign-envelope/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentGiven: true,
          consentText: "I agree to sign this document electronically",
          fields: Array.from(completedFields.entries())
            .filter(([fieldId]) => {
              // Only submit fields that belong to the current signer (not readOnly)
              const field = allFields.find((f) => f.id === fieldId);
              return field && !field.readOnly;
            })
            .map(([fieldId, data]) => ({
            fieldId,
            value: data.value,
            signatureImage: data.signatureData?.data,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sign document");
      }
      setSigned(true);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: any) {
      alert(err.message || "Failed to sign document");
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) {
      alert("Please provide a reason for declining");
      return;
    }
    setSigning(true);
    try {
      const response = await fetch(`${API_BASE}/esign/sign-envelope/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason }),
      });
      if (!response.ok) throw new Error("Failed to decline signature");
      setDeclined(true);
      setShowDeclineDialog(false);
    } catch (err: any) {
      alert(err.message || "Failed to decline");
    } finally {
      setSigning(false);
    }
  };

  // ─── Loading / Error / Complete states ─────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md">
          <CardHeader>
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-center">Link Expired or Invalid</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-500">Please contact the sender for a new signing link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md">
          <CardHeader>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-center">Document Signed!</CardTitle>
            <CardDescription className="text-center">
              Thank you for signing. You will receive a copy of the signed document via email.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md">
          <CardHeader>
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-center">Signature Declined</CardTitle>
            <CardDescription className="text-center">
              You have declined to sign this document. The sender has been notified.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ─── Main Signing UI ──────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b px-4 py-3 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">{signerInfo?.envelope.name || signerInfo?.envelope.subject || "Document"}</h1>
              <p className="text-xs text-muted-foreground">Signing as {signerInfo?.signer.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{myCompletedCount}/{requiredFields.length} fields</span>
              <Progress value={progress} className="w-32 h-2" />
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowDeclineDialog(true)} disabled={signing}>
              Decline
            </Button>
            <Button size="sm" onClick={handleSign} disabled={signing || !allFieldsComplete}>
              {signing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              {allFieldsComplete ? "Finish & Sign" : `${requiredFields.length - myCompletedCount} remaining`}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {/* Sidebar - Field List */}
        <div className="w-64 bg-white dark:bg-gray-900 border-r hidden md:block shrink-0 overflow-auto">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm mb-2">Required Fields</h2>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">{myCompletedCount} of {requiredFields.length} completed</p>
          </div>
          <div className="p-2 space-y-1">
            {requiredFields.map((field, i) => {
              const done = completedFields.has(field.id);
              const isCurrent = i === currentFieldIndex;
              return (
                <button
                  key={field.id}
                  onClick={() => {
                    setCurrentFieldIndex(i);
                    scrollToField(field);
                  }}
                  className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                    isCurrent ? "bg-primary/10 text-primary" : done ? "text-muted-foreground" : "hover:bg-accent"
                  }`}
                >
                  {done ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${isCurrent ? "border-primary" : "border-muted-foreground/30"}`} />
                  )}
                  <span className="capitalize truncate">{field.type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">p.{field.page}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PDF Area */}
        <div className="flex-1 overflow-auto p-4">
          {signerInfo?.envelope.message && (
            <div className="max-w-3xl mx-auto mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-300 italic">&ldquo;{signerInfo.envelope.message}&rdquo;</p>
            </div>
          )}

          {pdfLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading PDF...</span>
            </div>
          ) : pdfPages.length === 0 ? (
            /* Fallback: no PDF, show fields as cards */
            <div className="max-w-2xl mx-auto space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><PenTool className="h-5 w-5" /> Sign Document</CardTitle>
                  <CardDescription>Complete all required fields below to sign</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {requiredFields.map((field, i) => {
                    const done = completedFields.has(field.id);
                    return (
                      <div
                        key={field.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                          done ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-dashed border-primary/50 hover:border-primary"
                        }`}
                        onClick={() => !done && handleFieldClick(field)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">{field.type.replace(/_/g, " ")}</span>
                          {done ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" /> Done
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Click to {field.type === "signature" || field.type === "initials" ? "sign" : "fill"}</Badge>
                          )}
                        </div>
                        {done && completedFields.get(field.id)?.signatureData?.data && (
                          <img
                            src={completedFields.get(field.id)!.signatureData!.data}
                            alt="Signed"
                            className="h-10 mt-2 object-contain"
                          />
                        )}
                        {done && completedFields.get(field.id)?.value && !completedFields.get(field.id)?.signatureData?.data && (
                          <p className="text-sm mt-1">{completedFields.get(field.id)!.value}</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Full PDF with overlaid fields */
            <div className="max-w-3xl mx-auto space-y-4">
              {pdfPages.map((pageImg, pageIdx) => {
                const pageNum = pageIdx + 1;
                const pageFields = allFields.filter((f) => f.page === pageNum);
                return (
                  <div
                    key={pageNum}
                    ref={(el) => { if (el) pageRefs.current.set(pageNum, el); }}
                    className="relative bg-white shadow-lg rounded"
                    style={{ width: "100%", aspectRatio: `${pdfDimensions.width} / ${pdfDimensions.height}` }}
                  >
                    <img src={pageImg} alt={`Page ${pageNum}`} className="w-full h-full object-contain rounded" />

                    {/* Field overlays — includes both current signer and other signers' fields */}
                    {pageFields.map((field) => {
                      const done = completedFields.has(field.id);
                      const fieldData = completedFields.get(field.id);
                      const isReadOnly = field.readOnly;

                      return (
                        <div
                          key={field.id}
                          className={`absolute rounded transition-colors ${
                            isReadOnly && done
                              ? "border border-gray-300 bg-transparent"
                              : done
                              ? "border-2 border-green-400 bg-green-50/80"
                              : field.id === currentField?.id
                              ? "border-2 border-primary bg-primary/20 animate-pulse cursor-pointer"
                              : "border-2 border-yellow-400 bg-yellow-50/60 hover:bg-yellow-100/80 cursor-pointer"
                          }`}
                          style={{
                            left: `${field.x}%`,
                            top: `${field.y}%`,
                            width: `${field.width}%`,
                            height: `${field.height}%`,
                          }}
                          onClick={() => !done && !isReadOnly && handleFieldClick(field)}
                        >
                          {done && fieldData?.signatureData?.data ? (
                            <img src={fieldData.signatureData.data} alt="Signed" className="w-full h-full object-contain" />
                          ) : done && fieldData?.value ? (
                            <span className="text-xs flex items-center justify-center h-full">{fieldData.value}</span>
                          ) : !isReadOnly ? (
                            <span className="text-xs flex items-center justify-center h-full text-primary font-medium capitalize gap-1">
                              <ArrowDown className="h-3 w-3" /> {field.type.replace(/_/g, " ")}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom bar */}
      <div className="md:hidden bg-white dark:bg-gray-900 border-t px-4 py-3 sticky bottom-0 z-30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{completedFields.size}/{requiredFields.length} fields</span>
          <Progress value={progress} className="w-32 h-2" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentFieldIndex <= 0}
            onClick={() => {
              setCurrentFieldIndex(Math.max(0, currentFieldIndex - 1));
              if (requiredFields[currentFieldIndex - 1]) scrollToField(requiredFields[currentFieldIndex - 1]);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            className="flex-1"
            size="sm"
            onClick={() => currentField && handleFieldClick(currentField)}
            disabled={!currentField || completedFields.has(currentField?.id || "")}
          >
            {currentField ? `Sign: ${currentField.type.replace(/_/g, " ")}` : "All Done"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentFieldIndex >= requiredFields.length - 1}
            onClick={() => {
              const next = Math.min(requiredFields.length - 1, currentFieldIndex + 1);
              setCurrentFieldIndex(next);
              if (requiredFields[next]) scrollToField(requiredFields[next]);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureModal
          onApply={handleSignatureCapture}
          onCancel={() => {
            setShowSignatureModal(false);
            setPendingFieldId(null);
          }}
          signerName={signerInfo?.signer.name || ""}
          signerIdentity={signerInfo?.signer.email || signerInfo?.signer.id || ""}
          disableSaved
        />
      )}

      {/* Decline Dialog */}
      {showDeclineDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Decline Signature</CardTitle>
              <CardDescription>Please provide a reason for declining to sign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Reason for declining..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowDeclineDialog(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleDecline}
                  disabled={signing || !declineReason.trim()}
                >
                  {signing ? "Declining..." : "Confirm Decline"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4 text-xs text-muted-foreground flex items-center justify-center gap-1">
        <Shield className="h-3 w-3" /> PROPMETRIK E-Signature &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
