"use client";

/**
 * Create New Envelope - Full wizard
 *
 * Modes: Self-sign, Send-to-others, Sign-and-send (hybrid)
 * Steps: 1) Prepare (doc + recipients) → 2) Place Fields → 3) Sign / Review & Send → 4) Complete / Send
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
  Send,
  Loader2,
  FileText,
  User,
  Mail,
  AlertCircle,
  CheckCircle,
  PenTool,
  Download,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FieldPlacement from "@/components/esign/FieldPlacement";
import { createEnvelope, getOrCreateSignerId } from "@/lib/esign-api";
import {
  DocumentFile,
  Recipient,
  PlacedField,
  SignatureData,
  ExternalDocumentData,
  RECIPIENT_COLORS,
} from "@/lib/esign-types";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─── Current user mock (replace with auth context) ──────

function useCurrentUser() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; signerId: string } | null>(null);
  useEffect(() => {
    try {
      const session = localStorage.getItem('pm_user_session');
      if (session) {
        const parsed = JSON.parse(session);
        const id = parsed.id || 'unknown';
        // Generate a permanent signer ID: PMT-XXXX-XXXX from first 8 chars of user UUID
        const rawId = id.replace(/-/g, '').substring(0, 8).toUpperCase();
        const signerId = `PMT-${rawId.substring(0, 4)}-${rawId.substring(4, 8)}`;
        setUser({ id, name: parsed.name || 'Current User', email: parsed.email || 'user@propmetrik.com', signerId });
        return;
      }
    } catch { /* ignore */ }
    const name = localStorage.getItem("user_name") || "Current User";
    const email = localStorage.getItem("user_email") || "user@propmetrik.com";
    setUser({ id: 'unknown', name, email, signerId: 'PMT-0000-0000' });
  }, []);
  return user;
}

// ─── Step definitions ────────────────────────────────────

const STEPS_SEND = [
  { id: 1, label: "Prepare", icon: "📝" },
  { id: 2, label: "Place Fields", icon: "✍️" },
  { id: 3, label: "Review & Send", icon: "📤" },
];
const STEPS_SELF = [
  { id: 1, label: "Prepare", icon: "📝" },
  { id: 2, label: "Sign", icon: "✍️" },
  { id: 3, label: "Complete", icon: "✓" },
];
const STEPS_HYBRID = [
  { id: 1, label: "Prepare", icon: "📝" },
  { id: 2, label: "Place Fields", icon: "✍️" },
  { id: 3, label: "Sign", icon: "✍️" },
  { id: 4, label: "Review & Send", icon: "📤" },
];

export default function NewEnvelopePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();

  const isSelfMode = searchParams.get("mode") === "self";

  const [step, setStep] = useState(1);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [signedFields, setSignedFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [savedEnvelopeId, setSavedEnvelopeId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);

  // Signing mode detection
  const [isSelfSigning, setIsSelfSigning] = useState(isSelfMode);
  const [isSignAndSend, setIsSignAndSend] = useState(false);
  const [currentUserRecipientId, setCurrentUserRecipientId] = useState<string | null>(null);

  // Settings
  const [reminderDays, setReminderDays] = useState("3");
  const [expiresInDays, setExpiresInDays] = useState("30");

  // External document from sessionStorage (PM/CRM/Valuation integration)
  useEffect(() => {
    const stored = sessionStorage.getItem("esign_lease_document");
    if (stored) {
      try {
        const ext: ExternalDocumentData = JSON.parse(stored);
        loadExternalDocument(ext);
        sessionStorage.removeItem("esign_lease_document");
      } catch { /* ignore */ }
    }
  }, []);

  const loadExternalDocument = async (ext: ExternalDocumentData) => {
    try {
      const resp = await fetch(ext.documentUrl, { mode: "cors", credentials: "omit" });
      if (!resp.ok) throw new Error("Failed to fetch document");
      const blob = await resp.blob();
      const file = new File([blob], ext.filename, { type: "application/pdf" });

      const doc: DocumentFile = { id: `ext-${Date.now()}`, name: ext.filename, source: "desktop", file };
      setDocuments([doc]);
      setSubject(ext.subject);
      setMessage(ext.message);

      const rList: Recipient[] = ext.signers.map((s, i) => ({
        id: `r-${i + 1}`,
        name: s.name,
        email: s.email,
        role: "signer",
        color: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length],
        order: i + 1,
      }));
      setRecipients(rList);
      detectMode(rList);
      setStep(2);
    } catch (err) {
      console.error("External doc load error:", err);
    }
  };

  // ─── Mode Detection ────────────────────────────────

  const detectMode = useCallback(
    (rList: Recipient[]) => {
      const signers = rList.filter((r) => r.role === "signer");
      const me = currentUser
        ? signers.find((s) => s.email.toLowerCase() === currentUser.email.toLowerCase())
        : null;

      if (signers.length === 1 && signers[0].id === "self-signer") {
        setIsSelfSigning(true);
        setIsSignAndSend(false);
        setCurrentUserRecipientId("self-signer");
      } else if (me && signers.length > 1) {
        setIsSelfSigning(false);
        setIsSignAndSend(true);
        setCurrentUserRecipientId(me.id);
      } else if (me && signers.length === 1) {
        setIsSelfSigning(true);
        setIsSignAndSend(false);
        setCurrentUserRecipientId(me.id);
      } else {
        setIsSelfSigning(false);
        setIsSignAndSend(false);
        setCurrentUserRecipientId(null);
      }
    },
    [currentUser]
  );

  const STEPS = isSelfSigning ? STEPS_SELF : isSignAndSend ? STEPS_HYBRID : STEPS_SEND;
  const totalSteps = STEPS.length;

  // ─── Validation ────────────────────────────────────

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return documents.length > 0 && recipients.filter((r) => r.role === "signer").length > 0 && subject.trim() !== "";
      case 2:
        if (isSelfSigning) {
          return fields.length > 0 && fields.every((f) => signedFields.has(f.id));
        }
        // Each signer needs at least one signature field
        const signers = recipients.filter((r) => r.role === "signer");
        return signers.every((s) => fields.some((f) => f.recipientId === s.id && f.type === "signature"));
      case 3:
        if (isSignAndSend) {
          const myFields = fields.filter((f) => f.recipientId === currentUserRecipientId);
          return myFields.length > 0 && myFields.every((f) => signedFields.has(f.id));
        }
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, documents, recipients, fields, subject, isSelfSigning, isSignAndSend, signedFields, currentUserRecipientId]);

  // ─── Handlers ──────────────────────────────────────

  const handleFieldSigned = (fieldId: string, signatureData?: SignatureData, value?: string) => {
    setSignedFields((prev) => new Set([...prev, fieldId]));
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, signatureData, value } : f)));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please select a PDF file");
      return;
    }
    const doc: DocumentFile = { id: `doc-${Date.now()}`, name: file.name, source: "desktop", file };
    setDocuments([doc]);
    if (!subject) setSubject(`Please sign: ${file.name}`);
    setError(null);
  };

  const addRecipient = () => {
    const id = `r-${Date.now()}`;
    setRecipients([
      ...recipients,
      { id, name: "", email: "", role: "signer", color: RECIPIENT_COLORS[recipients.length % RECIPIENT_COLORS.length], order: recipients.length + 1 },
    ]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter((r) => r.id !== id).map((r, i) => ({ ...r, order: i + 1 })));
      setFields(fields.filter((f) => f.recipientId !== id));
    }
  };

  const updateRecipient = (id: string, key: keyof Recipient, val: string | number) => {
    setRecipients(recipients.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  // Self-sign / signing alone setup
  const handleSigningAloneChange = (signingAlone: boolean) => {
    if (!currentUser) return;
    const selfR: Recipient = {
      id: "self-signer",
      name: currentUser.name,
      email: currentUser.email,
      role: "signer",
      color: RECIPIENT_COLORS[0],
      order: 1,
    };

    if (signingAlone) {
      // Only current user as signer
      setRecipients([selfR]);
      setIsSelfSigning(true);
      setIsSignAndSend(false);
      setCurrentUserRecipientId("self-signer");
      // Remove fields assigned to other signers
      setFields(fields.filter((f) => f.recipientId === "self-signer"));
    } else {
      // Keep current user + allow adding others
      const otherRecipients = recipients.filter((r) => r.id !== "self-signer");
      setRecipients([selfR, ...otherRecipients]);
      setIsSelfSigning(false);
      setIsSignAndSend(true);
      setCurrentUserRecipientId("self-signer");
    }
  };

  // Initialize current user as signer on mount
  useEffect(() => {
    if (currentUser && recipients.length === 0) {
      const selfR: Recipient = {
        id: "self-signer",
        name: currentUser.name,
        email: currentUser.email,
        role: "signer",
        color: RECIPIENT_COLORS[0],
        order: 1,
      };
      setRecipients([selfR]);
      setIsSelfSigning(true);
      setCurrentUserRecipientId("self-signer");
    }
  }, [isSelfMode, currentUser]);

  // ─── Submit / Send ─────────────────────────────────

  // For send-to-others mode: calls the backend
  const handleSend = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const envelopeData = {
        subject,
        message,
        documents: documents.map((d) => ({ id: d.id, name: d.name, source: d.source })),
        recipients: recipients.map((r) => ({ name: r.name, email: r.email, role: r.role, order: r.order })),
        fields: fields.map((f) => ({
          type: f.type,
          recipientEmail: recipients.find((r) => r.id === f.recipientId)?.email,
          documentIndex: documents.findIndex((d) => d.id === f.documentId),
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
        })),
        settings: {
          reminderFrequencyDays: parseInt(reminderDays),
          expiresInDays: parseInt(expiresInDays),
        },
      };

      const formData = new FormData();
      formData.append("envelope_data", JSON.stringify(envelopeData));
      documents.forEach((d) => d.file && formData.append("files", d.file));

      const result = await createEnvelope(formData);
      router.push(`/dashboard/e-sign?created=${result?.data?.id || result?.envelope_id || result?.id || "true"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send envelope");
    } finally {
      setIsSubmitting(false);
    }
  };

  // For self-sign mode: generate signed PDF locally AND save to backend
  const handleGeneratePreview = async () => {
    // Prevent duplicate saves (React strict mode can double-fire effects)
    if (savedEnvelopeId || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const blob = await generateSignedPdf();
      if (!blob) throw new Error("Failed to generate signed document");
      setSignedPdfBlob(blob);
      // Clean up old URL if any
      if (signedPdfUrl) URL.revokeObjectURL(signedPdfUrl);
      setSignedPdfUrl(URL.createObjectURL(blob));

      // Also save to backend so it appears in dashboard + can be re-downloaded
      try {
        const signedFile = new File([blob], documents[0]?.name || "signed_document.pdf", { type: "application/pdf" });
        const formData = new FormData();
        formData.append("file", signedFile);
        formData.append("name", subject || documents[0]?.name || "Self-Signed Document");
        formData.append("message", message);
        formData.append("contextType", "self_signed");
        formData.append("contextEntityName", subject || documents[0]?.name || "Self-Signed Document");
        formData.append("signers", JSON.stringify([{
          name: currentUser?.name || "Self",
          email: currentUser?.email || "",
          role: "signer",
          order: 1,
        }]));
        const result = await createEnvelope(formData);
        setSavedEnvelopeId(result?.data?.id || result?.id);
      } catch (backendErr) {
        console.warn("Saved locally but failed to save to backend:", backendErr);
        // Don't block the flow — user still has the PDF locally
      }

      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate signed PDF");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Generate signed PDF (self-sign) ──────────────

  const generateSignedPdf = async (): Promise<Blob | null> => {
    const doc = documents[0];
    if (!doc?.file) return null;

    try {
      const pdfBytes = await doc.file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

      for (const field of fields) {
        if (!signedFields.has(field.id)) continue;
        const page = pages[field.page - 1];
        if (!page) continue;

        const pw = page.getWidth();
        const ph = page.getHeight();
        const absX = (field.x / 100) * pw;
        const absY = (field.y / 100) * ph;
        const absW = (field.width / 100) * pw;
        const absH = (field.height / 100) * ph;
        const pdfY = ph - absY - absH;

        // Signature/initial fields with image data
        if (field.signatureData?.data) {
          try {
            const base64 = field.signatureData.data.split(",")[1];
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const img = field.signatureData.data.includes("image/png")
              ? await pdfDoc.embedPng(bytes)
              : await pdfDoc.embedJpg(bytes);

            page.drawImage(img, { x: absX, y: pdfY, width: absW, height: absH });

            if (field.type === "signature" && currentUser) {
              page.drawText("Signed by:", { x: absX, y: pdfY + absH + 2, size: 6, font: timesRoman, color: rgb(0.3, 0.3, 0.3) });
              page.drawText(currentUser.signerId, { x: absX, y: pdfY - 8, size: 6, font: timesRomanBold, color: rgb(0, 0.4, 0.7) });
            }
          } catch (imgErr) {
            console.error("Error embedding field image:", imgErr);
          }
        } else {
          // Text fields: name, email, date_signed — use Times New Roman, scale to field height
          const textVal =
            field.value ||
            (field.type === "name" ? currentUser?.name : "") ||
            (field.type === "email" ? currentUser?.email : "") ||
            (field.type === "date_signed" ? new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "") ||
            "";

          if (textVal) {
            // Scale font size proportional to field height (70% of field height, max 14pt, min 7pt)
            const fontSize = Math.min(14, Math.max(7, absH * 0.7));
            const textFont = field.type === "name" ? timesRomanBold : timesRoman;
            const textWidth = textFont.widthOfTextAtSize(textVal, fontSize);

            // Center text vertically within the field
            const textY = pdfY + (absH - fontSize) / 2;
            // Left-align with small padding
            const textX = absX + 2;

            page.drawText(textVal, {
              x: textX,
              y: textY,
              size: fontSize,
              font: textFont,
              color: rgb(0.1, 0.1, 0.1),
              maxWidth: absW - 4,
            });
          }
        }
      }

      const savedBytes = await pdfDoc.save();
      return new Blob([new Uint8Array(savedBytes)], { type: "application/pdf" });
    } catch (err) {
      console.error("PDF generation error:", err);
      return null;
    }
  };

  const handleDownloadSigned = async () => {
    setIsDownloading(true);
    try {
      // Use already-generated blob if available, otherwise generate new one
      const blob = signedPdfBlob || await generateSignedPdf();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `signed_${documents[0]?.name || "document.pdf"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      alert("Failed to download");
    } finally {
      setIsDownloading(false);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (signedPdfUrl) URL.revokeObjectURL(signedPdfUrl);
    };
  }, [signedPdfUrl]);

  // ─── Render ────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3 shrink-0">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard/e-sign"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <h1 className="text-lg font-semibold">Create Envelope</h1>
          </div>

          {/* Step Indicators */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  step === s.id ? "bg-primary text-primary-foreground" : step > s.id ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.id ? <CheckCircle className="h-3 w-3" /> : <span>{s.id}</span>}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Step 1: Prepare */}
        {step === 1 && (
          <PrepareStep
            documents={documents}
            recipients={recipients}
            subject={subject}
            message={message}
            error={error}
            isSelfSigning={isSelfSigning}
            currentUser={currentUser}
            onFileChange={handleFileChange}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onAddRecipient={addRecipient}
            onRemoveRecipient={removeRecipient}
            onUpdateRecipient={updateRecipient}
            onSigningAloneChange={handleSigningAloneChange}
            onRecipientsDetect={detectMode}
          />
        )}

        {/* Step 2: Field Placement (all modes) */}
        {step === 2 && (
          <FieldPlacement
            documents={documents}
            recipients={isSelfSigning ? recipients : recipients}
            fields={fields}
            onFieldsChange={setFields}
            isSelfSigning={isSelfSigning}
            signedFields={signedFields}
            onFieldSigned={handleFieldSigned}
            currentUser={currentUser || undefined}
          />
        )}

        {/* Step 3: Self-sign — Preview & Download */}
        {step === 3 && isSelfSigning && (
          <SelfSignCompleteStep
            documents={documents}
            isComplete={isComplete}
            isSubmitting={isSubmitting}
            isDownloading={isDownloading}
            signedPdfUrl={signedPdfUrl}
            onGeneratePreview={handleGeneratePreview}
            onDownload={handleDownloadSigned}
            fields={fields}
            signedFields={signedFields}
          />
        )}

        {/* Step 3: Sign-and-send — current user signs their fields */}
        {step === 3 && isSignAndSend && (
          <FieldPlacement
            documents={documents}
            recipients={recipients.filter((r) => r.id === currentUserRecipientId)}
            fields={fields.filter((f) => f.recipientId === currentUserRecipientId)}
            onFieldsChange={(newFields) => {
              setFields((prev) => prev.map((f) => {
                const updated = newFields.find((nf) => nf.id === f.id);
                return updated || f;
              }));
            }}
            isSelfSigning={true}
            signedFields={signedFields}
            onFieldSigned={handleFieldSigned}
            currentUser={currentUser || undefined}
          />
        )}

        {/* Step 3: Review & Send (send-to-others) */}
        {step === 3 && !isSelfSigning && !isSignAndSend && (
          <ReviewStep
            documents={documents}
            recipients={recipients}
            fields={fields}
            subject={subject}
            message={message}
            reminderDays={reminderDays}
            expiresInDays={expiresInDays}
            isSubmitting={isSubmitting}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onReminderChange={setReminderDays}
            onExpiresChange={setExpiresInDays}
            onSend={handleSend}
          />
        )}

        {/* Step 4: Review & Send (sign-and-send hybrid) */}
        {step === 4 && isSignAndSend && (
          <ReviewStep
            documents={documents}
            recipients={recipients}
            fields={fields}
            subject={subject}
            message={message}
            reminderDays={reminderDays}
            expiresInDays={expiresInDays}
            isSubmitting={isSubmitting}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onReminderChange={setReminderDays}
            onExpiresChange={setExpiresInDays}
            onSend={handleSend}
            currentUserSigned
            currentUserRecipientId={currentUserRecipientId}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3 shrink-0">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>{step > 1 && !isComplete && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}</div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/dashboard/e-sign">Cancel</Link></Button>
            {step < totalSteps && !isComplete ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                {step === 2 && isSelfSigning ? "Preview Signed PDF →" : "Next →"}
              </Button>
            ) : isSelfSigning && isComplete ? (
              <Button asChild><Link href="/dashboard/e-sign">✓ Done</Link></Button>
            ) : isComplete ? (
              <Button asChild><Link href="/dashboard/e-sign">Back to Dashboard</Link></Button>
            ) : null}
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
          <Alert variant="destructive" className="w-96">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Prepare ─────────────────────────────────

function PrepareStep({
  documents, recipients, subject, message, error, isSelfSigning, currentUser,
  onFileChange, onSubjectChange, onMessageChange,
  onAddRecipient, onRemoveRecipient, onUpdateRecipient, onSigningAloneChange, onRecipientsDetect,
}: any) {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">

      {/* Document Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Document</CardTitle>
          <CardDescription>Upload the PDF to be signed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Subject / Envelope Name</Label>
            <Input value={subject} onChange={(e: any) => onSubjectChange(e.target.value)} placeholder="e.g., Tenancy Agreement" />
          </div>
          <div>
            <Label>PDF Document</Label>
            <input type="file" accept=".pdf" onChange={onFileChange} className="hidden" id="pdf-upload" />
            {documents.length > 0 ? (
              <div className="flex items-center gap-3 p-4 border rounded-lg bg-accent/50">
                <FileText className="h-10 w-10 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{documents[0].name}</p>
                  <p className="text-sm text-muted-foreground">{documents[0].file ? `${(documents[0].file.size / 1024 / 1024).toFixed(2)} MB` : ""}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => {}}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label htmlFor="pdf-upload" className="flex flex-col items-center gap-2 w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 justify-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm">Click to upload PDF</span>
              </label>
            )}
          </div>
          <div>
            <Label>Message (optional)</Label>
            <Textarea value={message} onChange={(e: any) => onMessageChange(e.target.value)} placeholder="Please review and sign..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Signers */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Signers</CardTitle>
              <CardDescription>Who needs to sign this document?</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current user is always a signer */}
          <div className="flex gap-3 items-center p-3 border rounded-lg bg-primary/5 border-primary/20">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0" style={{ backgroundColor: RECIPIENT_COLORS[0] }}>
              1
            </div>
            <div className="flex-1 flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <PenTool className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">{currentUser?.name || "You"}</p>
                  <p className="text-xs text-muted-foreground">{currentUser?.email || ""}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">You (Signer)</Badge>
            </div>
          </div>

          {/* Signing alone toggle */}
          <label className="flex items-center gap-3 px-3 py-2 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
            <input
              type="checkbox"
              checked={isSelfSigning}
              onChange={(e) => onSigningAloneChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <div>
              <p className="text-sm font-medium">I am signing alone</p>
              <p className="text-xs text-muted-foreground">No other signers are needed</p>
            </div>
          </label>

          {/* Other signers (shown when not signing alone) */}
          {!isSelfSigning && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-muted-foreground">Other Signers</p>
                <Button variant="outline" size="sm" onClick={onAddRecipient}>
                  <Plus className="h-4 w-4 mr-1" /> Add Signer
                </Button>
              </div>
              {recipients.filter((r: Recipient) => r.id !== "self-signer").map((r: Recipient, i: number) => (
                <div key={r.id} className="flex gap-3 items-start p-3 border rounded-lg">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0" style={{ backgroundColor: r.color }}>
                    {i + 2}
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input placeholder="Full Name" value={r.name} onChange={(e: any) => onUpdateRecipient(r.id, "name", e.target.value)} />
                    <Input type="email" placeholder="email@example.com" value={r.email} onChange={(e: any) => onUpdateRecipient(r.id, "email", e.target.value)} />
                    <Select value={r.role} onValueChange={(v: string) => onUpdateRecipient(r.id, "role", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="signer">Signer</SelectItem>
                        <SelectItem value="cc">Copy (CC)</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => onRemoveRecipient(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {recipients.filter((r: Recipient) => r.id !== "self-signer").length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  <p>No other signers added yet. Click &quot;Add Signer&quot; to add someone.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 3 (self-sign): Preview & Download ─────────

function SelfSignCompleteStep({
  documents, isComplete, isSubmitting, isDownloading, signedPdfUrl,
  onGeneratePreview, onDownload, fields, signedFields,
}: {
  documents: DocumentFile[];
  isComplete: boolean;
  isSubmitting: boolean;
  isDownloading: boolean;
  signedPdfUrl: string | null;
  onGeneratePreview: () => void;
  onDownload: () => void;
  fields: PlacedField[];
  signedFields: Set<string>;
}) {
  const allSigned = fields.every((f: PlacedField) => signedFields.has(f.id));
  const signedCount = fields.filter((f: PlacedField) => signedFields.has(f.id)).length;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-generate preview when all fields are signed and component mounts
  useEffect(() => {
    if (allSigned && !isComplete && !isSubmitting) {
      onGeneratePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allSigned) {
    return (
      <div className="container mx-auto py-16 max-w-md text-center">
        <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Signing Incomplete</h2>
        <p className="text-muted-foreground mb-4">{signedCount} of {fields.length} fields completed. Go back to sign remaining fields.</p>
        <ul className="text-sm text-left space-y-1 max-w-xs mx-auto">
          {fields.filter((f: PlacedField) => !signedFields.has(f.id)).map((f: PlacedField) => (
            <li key={f.id} className="text-muted-foreground">• {f.type.replace("_", " ")} on page {f.page}</li>
          ))}
        </ul>
      </div>
    );
  }

  // Generating preview
  if (isSubmitting) {
    return (
      <div className="container mx-auto py-16 max-w-md text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <h2 className="text-lg font-semibold">Generating signed document...</h2>
        <p className="text-muted-foreground text-sm">Embedding your signatures into the PDF</p>
      </div>
    );
  }

  // Preview ready
  if (isComplete && signedPdfUrl) {
    return (
      <div className="flex flex-col h-full">
        {/* Preview header */}
        <div className="border-b px-4 py-3 bg-accent/30">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold">Signed Document Preview</h2>
                <p className="text-xs text-muted-foreground">
                  Review your signed document below. Download when ready.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onDownload} disabled={isDownloading} size="sm">
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Download PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Document info bar */}
        <div className="border-b px-4 py-2 bg-background">
          <div className="flex items-center gap-3 max-w-5xl mx-auto">
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{documents[0]?.name}</span>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
              ✓ All {fields.length} field{fields.length !== 1 ? "s" : ""} signed
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              Signed on {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* PDF Preview */}
        <div className="flex-1 bg-muted/50 overflow-auto flex items-start justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden w-full max-w-3xl" style={{ height: "calc(100vh - 280px)" }}>
            <iframe
              ref={iframeRef}
              src={`${signedPdfUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              title="Signed document preview"
            />
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="border-t px-4 py-3 bg-accent/30">
          <div className="flex items-center justify-center gap-4 max-w-5xl mx-auto">
            <p className="text-sm text-muted-foreground">
              Satisfied with your signed document?
            </p>
            <Button onClick={onDownload} disabled={isDownloading} variant="default">
              {isDownloading ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Downloading...</>
              ) : (
                <><Download className="h-4 w-4 mr-1" /> Download Signed PDF</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: trigger generation
  return (
    <div className="container mx-auto py-16 max-w-md text-center space-y-6">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
      <h2 className="text-xl font-bold">All Fields Signed!</h2>
      <p className="text-muted-foreground">Click below to preview your signed document.</p>
      <Button onClick={onGeneratePreview} disabled={isSubmitting} size="lg">
        {isSubmitting ? (
          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
        ) : (
          <><Eye className="h-4 w-4 mr-1" /> Preview Signed Document</>
        )}
      </Button>
    </div>
  );
}

// ─── Review & Send Step ──────────────────────────────

function ReviewStep({
  documents, recipients, fields, subject, message,
  reminderDays, expiresInDays, isSubmitting,
  onSubjectChange, onMessageChange, onReminderChange, onExpiresChange, onSend,
  currentUserSigned, currentUserRecipientId,
}: any) {
  const signers = recipients.filter((r: Recipient) => r.role === "signer");
  const ccRecipients = recipients.filter((r: Recipient) => r.role === "cc");

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">📄 Documents ({documents.length})</CardTitle></CardHeader>
            <CardContent>
              {documents.map((d: DocumentFile) => (
                <div key={d.id} className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm">{d.name}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">👥 Recipients ({recipients.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {signers.map((s: Recipient) => {
                const hasSigned = currentUserSigned && s.id === currentUserRecipientId;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.email}</span>
                    </div>
                    {hasSigned ? (
                      <Badge className="bg-green-100 text-green-800 text-xs">✓ Signed</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Signer</Badge>
                    )}
                  </div>
                );
              })}
              {ccRecipients.map((r: Recipient) => (
                <div key={r.id} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-sm">{r.name}</span>
                  <Badge variant="outline" className="text-xs">CC</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">✍️ Fields ({fields.length})</CardTitle></CardHeader>
            <CardContent>
              {signers.map((s: Recipient) => {
                const sf = fields.filter((f: PlacedField) => f.recipientId === s.id);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">— {sf.length} fields</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Message + Settings */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📧 Email Message</CardTitle>
              <CardDescription>Customize the message recipients will see</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Subject</Label>
                <Input value={subject} onChange={(e: any) => onSubjectChange(e.target.value)} />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea value={message} onChange={(e: any) => onMessageChange(e.target.value)} rows={5} placeholder="Add a personal message..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">⚙️ Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Reminder Frequency</Label>
                <Select value={reminderDays} onValueChange={onReminderChange}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No reminders</SelectItem>
                    <SelectItem value="1">Every day</SelectItem>
                    <SelectItem value="3">Every 3 days</SelectItem>
                    <SelectItem value="7">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Expires After</Label>
                <Select value={expiresInDays} onValueChange={onExpiresChange}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Button onClick={onSend} disabled={isSubmitting || !subject.trim()} className="w-full" size="lg">
            {isSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</> : <><Send className="h-4 w-4 mr-1" /> Send Envelope</>}
          </Button>
          <p className="text-xs text-muted-foreground text-center">Recipients will receive an email with a link to sign</p>
        </div>
      </div>
    </div>
  );
}


