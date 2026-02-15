"use client";

/**
 * Lease Envelope Page — Single-View E-Signature Workflow
 *
 * One unified view:
 *   - Dropdown to select signers, drag fields for ALL signers
 *   - Click YOUR OWN fields to sign them inline (auto-fill)
 *   - "Sign & Send" button always visible, BLOCKED until:
 *       a) Every signer has at least one signature field
 *       b) All YOUR fields are signed
 *   - Other signers' fields are visible but you can't sign them
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Send,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import FieldPlacement from "@/components/esign/FieldPlacement";
import { createEnvelope } from "@/lib/esign-api";
import {
  DocumentFile,
  Recipient,
  PlacedField,
  SignatureData,
  RECIPIENT_COLORS,
} from "@/lib/esign-types";

// ─── Types ───────────────────────────────────────────────

interface LeaseDocumentData {
  documentUrl: string;
  documentKey?: string;
  filename: string;
  tenancyId?: string;
  applicationId?: string;
  propertyName?: string;
  signers: Array<{ name: string; email: string; role?: string; order?: number }>;
  subject: string;
  message: string;
}

// ─── Current user helper ──────────────────────────────────

function useCurrentUser() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; signerId: string } | null>(null);
  useEffect(() => {
    try {
      const session = localStorage.getItem("pm_user_session");
      if (session) {
        const parsed = JSON.parse(session);
        const id = parsed.id || "unknown";
        const rawId = id.replace(/-/g, "").substring(0, 8).toUpperCase();
        const signerId = `PMT-${rawId.substring(0, 4)}-${rawId.substring(4, 8)}`;
        setUser({ id, name: parsed.name || "Current User", email: parsed.email || "user@propmetrik.com", signerId });
        return;
      }
    } catch { /* ignore */ }
    setUser({ id: "unknown", name: "Current User", email: "user@propmetrik.com", signerId: "PMT-0000-0000" });
  }, []);
  return user;
}

// ─── Page ────────────────────────────────────────────────

export default function LeaseEnvelopePage() {
  const router = useRouter();
  const currentUser = useCurrentUser();

  // Data
  const [leaseData, setLeaseData] = useState<LeaseDocumentData | null>(null);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [signedFields, setSignedFields] = useState<Set<string>>(new Set());

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  // ─── Derived state ────────────────────────────────

  const myRecipient = useMemo(
    () => (currentUser ? recipients.find((r) => r.email.toLowerCase() === currentUser.email.toLowerCase()) : null),
    [currentUser, recipients]
  );

  const otherRecipients = useMemo(
    () => recipients.filter((r) => r.id !== myRecipient?.id),
    [recipients, myRecipient]
  );

  // My fields = fields assigned to the current user
  const myFields = useMemo(
    () => (myRecipient ? fields.filter((f) => f.recipientId === myRecipient.id) : []),
    [fields, myRecipient]
  );

  const mySignedCount = myFields.filter((f) => signedFields.has(f.id)).length;
  const allMySigned = myFields.length > 0 && myFields.every((f) => signedFields.has(f.id));

  // Every signer must have at least one signature field placed
  const allSignersHaveFields = recipients
    .filter((r) => r.role !== "cc" && r.role !== "viewer")
    .every((r) => fields.some((f) => f.recipientId === r.id && f.type === "signature"));

  // Can SEND? All own fields signed + every signer has signature fields
  const canSend = allMySigned && allSignersHaveFields;

  // Status message for the Send button
  const sendButtonState = sending
    ? { label: "Sending...", icon: <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> }
    : !allSignersHaveFields
    ? { label: "Place signature fields for all signers", icon: null }
    : !allMySigned
    ? { label: `Sign your fields (${mySignedCount}/${myFields.length})`, icon: null }
    : { label: "Sign & Send", icon: <Send className="h-4 w-4 mr-1.5" /> };

  // ─── Load lease data ──────────────────────────────

  useEffect(() => {
    const loadLeaseData = async () => {
      try {
        setLoading(true);

        const stored = sessionStorage.getItem("esign_lease_document");
        if (!stored) throw new Error("No lease document data found. Please generate a lease first.");

        const data: LeaseDocumentData = JSON.parse(stored);
        setLeaseData(data);

        // Fetch the PDF
        const resp = await fetch(data.documentUrl, { mode: "cors", credentials: "omit" });
        if (!resp.ok) throw new Error("Failed to fetch lease document");
        const blob = await resp.blob();
        const file = new File([blob], data.filename, { type: "application/pdf" });

        const docId = `lease-${Date.now()}`;
        const doc: DocumentFile = { id: docId, name: data.filename, source: "desktop", file };
        setDocuments([doc]);

        // Build recipients — normalize all to "signer"
        const rList: Recipient[] = data.signers.map((s, i) => ({
          id: `r-${i + 1}`,
          name: s.name,
          email: s.email,
          role: "signer" as const,
          color: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length],
          order: s.order || i + 1,
        }));
        setRecipients(rList);
        setFields([]);
      } catch (err: any) {
        console.error("Lease envelope load error:", err);
        setError(err.message || "Failed to load lease document");
      } finally {
        setLoading(false);
      }
    };

    loadLeaseData();
  }, []);

  // ─── Handlers ──────────────────────────────────────

  const handleFieldSigned = useCallback((fieldId: string, signatureData?: SignatureData, value?: string) => {
    setSignedFields((prev) => new Set([...prev, fieldId]));
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, signatureData, value } : f)));
  }, []);

  const handleSend = async () => {
    if (!leaseData || !canSend) return;
    setSending(true);
    setError(null);

    try {
      const formData = new FormData();

      // The backend expects: file (singular), name, message, signers, contextType, etc.
      const doc = documents[0];
      if (doc?.file) {
        formData.append("file", doc.file);
      }

      formData.append("name", leaseData.subject || leaseData.filename || "Lease Agreement");
      formData.append("message", leaseData.message || "");
      formData.append("contextType", "lease");
      if (leaseData.applicationId) {
        formData.append("contextEntityId", leaseData.applicationId);
      }
      formData.append("contextEntityName", leaseData.propertyName || leaseData.subject || "Lease Agreement");

      // Signers array with field placement data
      const signersPayload = recipients.map((r) => {
        const rFields = fields.filter((f) => f.recipientId === r.id);
        return {
          name: r.name,
          email: r.email,
          role: "signer",
          order: r.order,
          fields: rFields.map((f) => {
            const isSignatureField = f.type === "signature" || f.type === "initial";
            const resolvedValue = isSignatureField
              ? (f.signatureData?.data || f.value)
              : (f.value || undefined);

            return {
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
            value: resolvedValue,
            signed: signedFields.has(f.id),
            };
          }),
        };
      });

      formData.append("signers", JSON.stringify(signersPayload));

      const result = await createEnvelope(formData);
      const envelopeId = result?.data?.id;

      // Transition application from approved → lease_generated
      if (leaseData.applicationId) {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
          const token = localStorage.getItem("pm_access_token") || localStorage.getItem("token") || "";
          const session = localStorage.getItem("pm_user_session");
          const userId = session ? JSON.parse(session).id : "";
          await fetch(`${apiBase}/pm/applications/${leaseData.applicationId}/send-lease`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(userId ? { "X-User-Id": userId } : {}),
            },
            body: JSON.stringify({
              leaseData: { envelopeId: envelopeId || null },
            }),
          });
        } catch (e) {
          console.warn("Failed to update application status:", e);
          // Non-fatal — envelope was already sent
        }
      }

      sessionStorage.removeItem("esign_lease_document");
      setDone(true);

      if (leaseData.applicationId) {
        setTimeout(() => {
          router.push(`/dashboard/property-management/applications/${leaseData.applicationId}?esign=success`);
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to send envelope");
    } finally {
      setSending(false);
    }
  };

  // ─── Loading ───────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading lease document...</p>
        </div>
      </div>
    );
  }

  if (error && !leaseData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold">Failed to Load</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard/property-management/applications">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Applications
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ─── Done ──────────────────────────────────────────

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">Lease Sent for Signing!</h2>
          <p className="text-muted-foreground text-sm">
            Your signature has been applied. The tenant will receive an email with their signing link.
          </p>
          <div className="space-y-2">
            {otherRecipients.map((r) => (
              <div key={r.id} className="flex items-center gap-2 justify-center text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                <span>{r.name}</span>
                <span className="text-muted-foreground">{r.email}</span>
                <Badge variant="outline" className="text-xs">Pending signature</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Redirecting back to application...</p>
        </div>
      </div>
    );
  }

  // ─── Main UI — Single unified view ─────────────────

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-background shrink-0">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={leaseData?.applicationId ? `/dashboard/property-management/applications/${leaseData.applicationId}` : "/dashboard/e-sign"}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="font-semibold">Lease Agreement</h1>
              {leaseData?.propertyName && (
                <p className="text-sm text-muted-foreground">{leaseData.propertyName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Signer badges with signing progress */}
            <div className="hidden md:flex gap-1">
              {recipients.map((r) => {
                const isMine = r.id === myRecipient?.id;
                const rFields = fields.filter((f) => f.recipientId === r.id);
                const rSigned = rFields.filter((f) => signedFields.has(f.id)).length;
                const allSigned = rFields.length > 0 && rSigned === rFields.length;
                return (
                  <Badge
                    key={r.id}
                    style={{ backgroundColor: r.color, color: "white" }}
                    className="text-xs"
                  >
                    {r.name}
                    {isMine ? " (You)" : ""}
                    {allSigned ? " ✓" : rFields.length > 0 ? ` ${rSigned}/${rFields.length}` : ""}
                  </Badge>
                );
              })}
            </div>

            {/* Send button — always visible, blocked until ready */}
            <Button
              onClick={handleSend}
              disabled={!canSend || sending}
            >
              {sendButtonState.icon}
              {sendButtonState.label}
            </Button>
          </div>
        </div>
      </div>

      {/* Context bar — tells user what to do */}
      <div className="border-b px-4 py-1.5 bg-muted/30 text-xs text-muted-foreground shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          {!allSignersHaveFields ? (
            <>
              <span>📋</span>
              <span>Place signature fields for each signer using the dropdown, then click your own to sign</span>
            </>
          ) : !allMySigned ? (
            <>
              <span>✍️</span>
              <span className="font-medium text-foreground">Click your fields to sign them</span>
              <Badge variant="outline" className="ml-auto text-xs">
                {mySignedCount} / {myFields.length} signed
              </Badge>
            </>
          ) : (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              <span className="font-medium text-green-500">Ready to send!</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Single unified FieldPlacement — dropdown to assign, click-to-sign own fields */}
      <div className="flex-1 overflow-hidden">
        <FieldPlacement
          documents={documents}
          recipients={recipients}
          fields={fields}
          onFieldsChange={setFields}
          isSelfSigning={true}
          signedFields={signedFields}
          onFieldSigned={handleFieldSigned}
          currentUser={currentUser || undefined}
          allowedFieldTypes={["signature", "initial", "date_signed", "name"]}
        />
      </div>

      {/* Sending overlay */}
      {sending && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Sending lease to tenant...</p>
          </div>
        </div>
      )}
    </div>
  );
}
