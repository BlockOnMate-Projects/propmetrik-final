"use client";

/**
 * FieldPlacement - Full-featured drag-drop field placement on PDF pages
 *
 * Features:
 *   - Drag fields from palette onto PDF pages
 *   - Move/resize placed fields
 *   - Self-signing mode: auto-fill fields on drop/click
 *   - Signature modal integration
 *   - Per-recipient color coding
 *   - Zoom, page navigation
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  PlacedField,
  Recipient,
  DocumentFile,
  SignatureData,
  STANDARD_FIELDS,
  DATA_FIELDS,
  getFieldDef,
} from "@/lib/esign-types";
import PDFViewer, { PageData, generateTextAsImage } from "./PDFViewer";
import SignatureModal from "./SignatureModal";
import { Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

// ─── Props ──────────────────────────────────────────────

interface FieldPlacementProps {
  documents: DocumentFile[];
  recipients: Recipient[];
  fields: PlacedField[];
  onFieldsChange: (fields: PlacedField[]) => void;
  isSelfSigning?: boolean;
  signedFields?: Set<string>;
  onFieldSigned?: (fieldId: string, signatureData?: SignatureData, value?: string) => void;
  currentUser?: { name: string; email: string };
  /** Optional whitelist of field types to show in the palette */
  allowedFieldTypes?: string[];
}

// ─── Helpers ─────────────────────────────────────────────

function generateInitials(name: string): string {
  if (!name) return "XX";
  return name
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ─── Component ───────────────────────────────────────────

export default function FieldPlacement({
  documents,
  recipients,
  fields,
  onFieldsChange,
  isSelfSigning = false,
  signedFields = new Set(),
  onFieldSigned,
  currentUser,
  allowedFieldTypes,
}: FieldPlacementProps) {
  const [activeRecipient, setActiveRecipient] = useState<Recipient | null>(
    recipients.find((r) => r.role === "signer") || null
  );

  // Sync activeRecipient when recipients load asynchronously
  useEffect(() => {
    if (!activeRecipient && recipients.length > 0) {
      setActiveRecipient(recipients.find((r) => r.role === "signer") || recipients[0]);
    }
  }, [recipients, activeRecipient]);
  const [activeDocument, setActiveDocument] = useState<DocumentFile | null>(documents[0] || null);
  const [zoom, setZoom] = useState(100);
  const [draggedFieldType, setDraggedFieldType] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<PlacedField | null>(null);
  const [searchFields, setSearchFields] = useState("");
  const [pdfPages, setPdfPages] = useState<PageData[]>([]);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [fieldToSign, setFieldToSign] = useState<PlacedField | null>(null);
  const [localFieldValues, setLocalFieldValues] = useState<Map<string, { value?: string; signatureData?: SignatureData }>>(new Map());

  // Drag/resize state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const signers = recipients.filter((r) => r.role !== "cc" && r.role !== "viewer");
  const signedCount = fields.filter((f) => signedFields.has(f.id)).length;

  // Determine which recipient belongs to the current user (for scoped auto-fill)
  const myRecipientId = currentUser
    ? recipients.find((r) => r.email.toLowerCase() === currentUser.email.toLowerCase())?.id ?? null
    : null;
  const isMyField = (field: PlacedField) => myRecipientId != null && field.recipientId === myRecipientId;

  // In self-signing mode, show only the current user's fields in the sidebar
  const myFields = isSelfSigning ? fields.filter(isMyField) : fields;
  const mySignedCount = isSelfSigning ? myFields.filter((f) => signedFields.has(f.id)).length : signedCount;

  // ─── Auto-fill helper (self-signing mode) ──────────

  const storeLocalValue = (fieldId: string, value?: string, signatureData?: SignatureData) => {
    setLocalFieldValues((prev) => {
      const m = new Map(prev);
      m.set(fieldId, { value, signatureData });
      return m;
    });
  };

  const autoFillField = useCallback(
    (field: PlacedField) => {
      if (field.type === "signature") {
        setFieldToSign(field);
        setShowSignatureModal(true);
      } else if (field.type === "initial") {
        const initials = generateInitials(currentUser?.name || "");
        const img = generateTextAsImage(initials, { fontSize: 18, isInitials: true, width: 80, height: 40 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, initials, sd);
        onFieldSigned?.(field.id, sd, initials);
      } else if (field.type === "date_signed") {
        const val = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
        const img = generateTextAsImage(val, { fontSize: 14, width: 120, height: 30 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, val, sd);
        onFieldSigned?.(field.id, sd, val);
      } else if (field.type === "name" && currentUser) {
        const img = generateTextAsImage(currentUser.name, { fontSize: 14, width: 180, height: 30 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, currentUser.name, sd);
        onFieldSigned?.(field.id, sd, currentUser.name);
      } else if (field.type === "email" && currentUser) {
        const img = generateTextAsImage(currentUser.email, { fontSize: 14, width: 250, height: 35 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, currentUser.email, sd);
        onFieldSigned?.(field.id, sd, currentUser.email);
      } else if (field.type === "checkbox") {
        const img = generateTextAsImage("", { isCheckbox: true, checked: true, width: 30, height: 30 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, "checked", sd);
        onFieldSigned?.(field.id, sd, "checked");
      } else if (field.type === "company") {
        const val = currentUser?.name ? `${currentUser.name}'s Company` : "Company";
        const img = generateTextAsImage(val, { fontSize: 14, width: 180, height: 30 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, val, sd);
        onFieldSigned?.(field.id, sd, val);
      } else if (field.type === "title") {
        const val = "Authorized Signatory";
        const img = generateTextAsImage(val, { fontSize: 14, width: 180, height: 30 });
        const sd: SignatureData = { type: "typed", data: img };
        storeLocalValue(field.id, val, sd);
        onFieldSigned?.(field.id, sd, val);
      }
    },
    [currentUser, onFieldSigned]
  );

  // ─── Drop new field from palette ──────────────────

  const handlePageDrop = (e: React.DragEvent, pageNum: number, pageElement: HTMLDivElement) => {
    e.preventDefault();
    if (!draggedFieldType || !activeRecipient || !activeDocument) return;

    const rect = pageElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newField: PlacedField = {
      id: `field-${Date.now()}`,
      type: draggedFieldType as PlacedField["type"],
      recipientId: activeRecipient.id,
      documentId: activeDocument.id,
      page: pageNum,
      x: Math.max(2, Math.min(78, x)),
      y: Math.max(2, Math.min(92, y)),
      width: draggedFieldType === "signature" ? 14 : 10,
      height: draggedFieldType === "signature" ? 4 : 2.5,
      required: true,
    };

    onFieldsChange([...fields, newField]);
    setDraggedFieldType(null);

    // Always select the new field — signing happens on explicit click only
    setSelectedField(newField);
  };

  // ─── Field mouse interactions ─────────────────────

  const handleFieldMouseDown = (e: React.MouseEvent, field: PlacedField) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, field: PlacedField, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    setIsResizing(true);
    setResizeHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleFieldClick = (e: React.MouseEvent, field: PlacedField) => {
    e.stopPropagation();
    if (isSelfSigning && isMyField(field) && !signedFields.has(field.id)) {
      autoFillField(field);
    } else {
      setSelectedField(field);
    }
  };

  // ─── Move / Resize via mousemove ──────────────────

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedField) return;
      const pageEl = pageRefs.current.get(selectedField.page);
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
      const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

      if (isDragging) {
        const newX = Math.max(2, Math.min(78, selectedField.x + deltaX));
        const newY = Math.max(2, Math.min(92, selectedField.y + deltaY));
        onFieldsChange(fields.map((f) => (f.id === selectedField.id ? { ...f, x: newX, y: newY } : f)));
        setDragStart({ x: e.clientX, y: e.clientY });
        setSelectedField({ ...selectedField, x: newX, y: newY });
      }

      if (isResizing && resizeHandle) {
        let newW = selectedField.width,
          newH = selectedField.height,
          newX = selectedField.x,
          newY = selectedField.y;

        if (resizeHandle.includes("e")) newW = Math.max(8, Math.min(40, selectedField.width + deltaX));
        if (resizeHandle.includes("w")) {
          const dw = -deltaX;
          newW = Math.max(8, Math.min(40, selectedField.width + dw));
          newX = selectedField.x - dw;
        }
        if (resizeHandle.includes("s")) newH = Math.max(3, Math.min(20, selectedField.height + deltaY));
        if (resizeHandle.includes("n")) {
          const dh = -deltaY;
          newH = Math.max(3, Math.min(20, selectedField.height + dh));
          newY = selectedField.y - dh;
        }

        onFieldsChange(
          fields.map((f) => (f.id === selectedField.id ? { ...f, x: newX, y: newY, width: newW, height: newH } : f))
        );
        setDragStart({ x: e.clientX, y: e.clientY });
        setSelectedField({ ...selectedField, x: newX, y: newY, width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, selectedField, dragStart, fields, onFieldsChange, resizeHandle]);

  const deleteField = (fieldId: string) => {
    onFieldsChange(fields.filter((f) => f.id !== fieldId));
    setSelectedField(null);
  };

  const getFieldsForPage = useCallback(
    (pageNum: number) => {
      if (!activeDocument) return [];
      return fields.filter((f) => f.documentId === activeDocument.id && f.page === pageNum);
    },
    [fields, activeDocument]
  );

  const getRecipientById = (id: string) => recipients.find((r) => r.id === id);

  const handleApplySignature = (sig: SignatureData) => {
    if (fieldToSign) {
      storeLocalValue(fieldToSign.id, undefined, sig);
      onFieldSigned?.(fieldToSign.id, sig);
      setShowSignatureModal(false);
      setFieldToSign(null);
    }
  };

  // ─── Render ───────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] border rounded-lg overflow-hidden bg-background">
      {/* ─ Left Sidebar ─ */}
      <div className="w-64 border-r bg-slate-900/60 dark:bg-slate-900/80 overflow-y-auto shrink-0">
        {/* Always show NormalSidebar: dropdown to pick signer + drag palette */}
        <NormalSidebar
            recipients={signers}
            activeRecipient={activeRecipient}
            onRecipientChange={setActiveRecipient}
            searchFields={searchFields}
            onSearchChange={setSearchFields}
            onFieldDragStart={setDraggedFieldType}
            allowedFieldTypes={allowedFieldTypes}
          />
      </div>

      {/* ─ Main PDF area ─ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!selectedField}
              onClick={() => selectedField && deleteField(selectedField.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
              <span className="text-xs">−</span>
            </Button>
            <span className="text-xs w-10 text-center">{zoom}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(150, z + 10))}>
              <span className="text-xs">+</span>
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{pdfPages.length} pages</span>
        </div>

        {/* PDF scroll area */}
        <div className="flex-1 overflow-auto bg-zinc-200 dark:bg-zinc-800">
          <div
            className="flex flex-col items-center gap-4 py-4 px-2"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
          >
            {pdfPages.map((page) => (
              <div
                key={page.pageNum}
                className="relative bg-white shadow-lg"
                ref={(el) => {
                  if (el) pageRefs.current.set(page.pageNum, el);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const el = pageRefs.current.get(page.pageNum);
                  if (el) handlePageDrop(e, page.pageNum, el);
                }}
                onClick={() => setSelectedField(null)}
              >
                <div className="absolute -top-3 left-2 z-10 bg-zinc-700 text-white text-[10px] px-2 py-0.5 rounded">
                  Page {page.pageNum}
                </div>
                <img src={page.dataUrl} alt={`Page ${page.pageNum}`} draggable={false} className="block" />

                {/* Placed fields */}
                {getFieldsForPage(page.pageNum).map((field) => {
                  const recipient = getRecipientById(field.recipientId);
                  const isSelected = selectedField?.id === field.id;
                  const isSigned = signedFields.has(field.id);
                  const localVal = localFieldValues.get(field.id);
                  const mine = isMyField(field);
                  const borderColor = isSigned ? "#22c55e" : recipient?.color || "#7c3aed";

                  return (
                    <div
                      key={field.id}
                      className={`absolute transition-shadow ${isSelected ? "ring-2 ring-primary shadow-lg" : ""} ${
                        isSelfSigning && mine && !isSigned ? "cursor-pointer hover:brightness-95" : ""
                      }`}
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                        border: `1.5px solid ${borderColor}`,
                        borderRadius: 3,
                        backgroundColor: isSigned
                          ? "rgba(34,197,94,0.08)"
                          : `${borderColor}10`,
                        cursor: isDragging ? "grabbing" : "grab",
                        zIndex: isSelected ? 20 : 10,
                      }}
                      onMouseDown={(e) => handleFieldMouseDown(e, field)}
                      onClick={(e) => handleFieldClick(e, field)}
                    >
                      {/* Content */}
                      <div className="w-full h-full flex items-center justify-center overflow-hidden select-none" style={{ fontSize: `${Math.max(8, Math.min(16, (field.height || 30) * 0.65))}px` }}>
                        {isSigned ? (
                          <FieldSignedContent
                            field={field}
                            localVal={localVal}
                            currentUser={currentUser}
                            isSelfSigning={isSelfSigning}
                            onChangeSignature={() => {
                              setFieldToSign(field);
                              setShowSignatureModal(true);
                            }}
                          />
                        ) : isSelfSigning && mine ? (
                          <span className="text-center px-1 leading-tight">
                            {getFieldDef(field.type)?.icon || "📝"} Click to{" "}
                            {field.type === "signature" ? "sign" : "fill"}
                          </span>
                        ) : isSelfSigning && !mine ? (
                          <span className="text-center px-1 leading-tight text-muted-foreground">
                            {getFieldDef(field.type)?.icon || "📝"} {recipient?.name || "Signer"}
                          </span>
                        ) : (
                          <span className="text-center px-1 leading-tight">
                            {getFieldDef(field.type)?.icon || "📝"} {field.type.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      {/* Resize handles + delete */}
                      {isSelected && (
                        <>
                          <button
                            className="absolute -top-2 -right-2 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center text-[8px] z-30"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              deleteField(field.id);
                            }}
                          >
                            ✕
                          </button>
                          {["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((h) => (
                            <div
                              key={h}
                              className={`absolute w-2 h-2 bg-primary rounded-full z-30 ${getResizeHandlePosition(h)}`}
                              style={{ cursor: getResizeCursor(h) }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field, h)}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Drop hint */}
                {draggedFieldType && (
                  <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary/30 flex items-center justify-center pointer-events-none z-5">
                    <span className="text-sm text-primary/60 font-medium">Drop field here</span>
                  </div>
                )}
              </div>
            ))}
            {pdfPages.length === 0 && (
              <div className="text-center text-muted-foreground py-20">No document loaded</div>
            )}
          </div>
        </div>
      </div>

      {/* ─ Right Sidebar (thumbnails + doc switcher) ─ */}
      <div className="w-28 border-l bg-muted/20 overflow-y-auto shrink-0 hidden lg:block">
        <div className="p-2 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground px-1 truncate">
            {activeDocument?.name}
          </p>
          <p className="text-[10px] text-muted-foreground px-1">{pdfPages.length} pages</p>
          {pdfPages.map((page) => {
            const fc = getFieldsForPage(page.pageNum).length;
            return (
              <div key={page.pageNum} className="relative rounded border overflow-hidden hover:border-primary transition-colors cursor-pointer">
                <img src={page.dataUrl} alt={`Thumb ${page.pageNum}`} className="w-full" />
                <span className="absolute bottom-0 inset-x-0 text-center text-[9px] bg-black/50 text-white py-0.5">
                  {page.pageNum}
                </span>
                {fc > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-primary text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center">
                    {fc}
                  </span>
                )}
              </div>
            );
          })}
          {documents.length > 1 && (
            <div className="pt-2 border-t space-y-1">
              <p className="text-[9px] font-medium text-muted-foreground px-1">Other docs</p>
              {documents
                .filter((d) => d.id !== activeDocument?.id)
                .map((doc) => (
                  <button
                    key={doc.id}
                    className="block w-full text-left text-[10px] px-1 py-1 rounded hover:bg-muted transition-colors truncate"
                    onClick={() => setActiveDocument(doc)}
                  >
                    📄 {doc.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureModal
          signerName={currentUser?.name || ""}
          signerIdentity={currentUser?.email || currentUser?.name || ""}
          onApply={handleApplySignature}
          onCancel={() => {
            setShowSignatureModal(false);
            setFieldToSign(null);
          }}
        />
      )}

      {/* Hidden PDF loader - loads pages into state */}
      <HiddenPdfLoader
        document={activeDocument}
        onPagesLoaded={setPdfPages}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function HiddenPdfLoader({
  document: doc,
  onPagesLoaded,
}: {
  document: DocumentFile | null;
  onPagesLoaded: (pages: PageData[]) => void;
}) {
  useEffect(() => {
    const load = async () => {
      if (!doc?.file && !doc?.previewUrl) {
        onPagesLoaded([]);
        return;
      }
      try {
        // @ts-expect-error — runtime URL import bypasses webpack to avoid pdfjs-dist v5 conflicts
        const pdfjsLib = await import(/* webpackIgnore: true */ "/pdf.min.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        let arrayBuffer: ArrayBuffer;
        if (doc.file) {
          arrayBuffer = await doc.file.arrayBuffer();
        } else {
          const resp = await fetch(doc.previewUrl!);
          if (!resp.ok) throw new Error(`Failed to fetch PDF: ${resp.status}`);
          arrayBuffer = await resp.arrayBuffer();
        }
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: PageData[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const canvas = window.document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await (page.render({ canvasContext: ctx, viewport } as any).promise);
            pages.push({
              pageNum: i,
              dataUrl: canvas.toDataURL(),
              width: viewport.width,
              height: viewport.height,
            });
          }
        }
        onPagesLoaded(pages);
      } catch (err) {
        console.error("PDF load error:", err);
        onPagesLoaded([]);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  return null;
}

/** Self-signing sidebar: progress + essential field palette */
function SelfSignSidebar({
  fields,
  signedFields,
  signedCount,
  onFieldDragStart,
  hideDragPalette = false,
  signers = [],
  allFields = [],
}: {
  fields: PlacedField[];
  signedFields: Set<string>;
  signedCount: number;
  onFieldDragStart: (type: string) => void;
  hideDragPalette?: boolean;
  signers?: Array<{ id: string; name: string; color: string }>;
  allFields?: PlacedField[];
}) {
  const progress = fields.length > 0 ? (signedCount / fields.length) * 100 : 0;
  return (
    <div className="p-3 space-y-4">
      <div>
        <h3 className="font-semibold text-sm text-slate-100">Sign Your Fields</h3>
        <p className="text-xs text-slate-400 mt-1">
          {fields.length === 0
            ? "No fields assigned to you"
            : signedCount === fields.length
            ? "All your fields signed! Ready to send."
            : `Click each field to sign — ${signedCount} of ${fields.length} done`}
        </p>
      </div>

      {fields.length > 0 && (
        <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {!hideDragPalette && (
        <>
          <div>
            <p className="text-xs font-medium mb-2 text-slate-300">Add Your Signature</p>
            <div className="space-y-1">
              {[
                { type: "signature", label: "Signature", icon: "✍️" },
                { type: "initial", label: "Initial", icon: "🔤" },
              ].map((f) => (
                <DraggableFieldItem key={f.type} {...f} onDragStart={() => onFieldDragStart(f.type)} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium mb-2 text-slate-300">Auto-Fill Fields</p>
            <div className="space-y-1">
              {[
                { type: "date_signed", label: "Date Signed", icon: "📅" },
                { type: "name", label: "Name", icon: "👤" },
                { type: "email", label: "Email", icon: "📧" },
              ].map((f) => (
                <DraggableFieldItem key={f.type} {...f} onDragStart={() => onFieldDragStart(f.type)} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Your fields to sign */}
      {fields.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2 text-slate-300">Your Fields</p>
          <div className="space-y-1">
            {fields.map((field) => {
              const isSigned = signedFields.has(field.id);
              return (
                <div
                  key={field.id}
                  className={`text-xs flex items-center gap-2 px-2 py-1.5 rounded ${
                    isSigned
                      ? "bg-green-900/40 text-green-300 border border-green-700/50"
                      : "bg-slate-800 text-slate-200 border border-slate-700/50"
                  }`}
                >
                  <span>{isSigned ? "✓" : "○"}</span>
                  <span className="flex-1 truncate">
                    {getFieldDef(field.type)?.icon} {field.type.replace("_", " ")}
                  </span>
                  <span className="text-slate-400">P{field.page}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Show other signers' field counts */}
      {signers.length > 1 && allFields.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2 text-slate-300">Other Signers</p>
          <div className="space-y-1">
            {signers
              .filter((s) => allFields.some((f) => f.recipientId === s.id) && !fields.some((f) => f.recipientId === s.id))
              .map((s) => {
                const sFields = allFields.filter((f) => f.recipientId === s.id);
                return (
                  <div
                    key={s.id}
                    className="text-xs flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/50 text-slate-400 border border-slate-700/30"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span>{sFields.length} field{sFields.length !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Normal (send-to-others) sidebar: recipient selector + full field palette */
function NormalSidebar({
  recipients,
  activeRecipient,
  onRecipientChange,
  searchFields,
  onSearchChange,
  onFieldDragStart,
  allowedFieldTypes,
}: {
  recipients: Recipient[];
  activeRecipient: Recipient | null;
  onRecipientChange: (r: Recipient) => void;
  searchFields: string;
  onSearchChange: (s: string) => void;
  onFieldDragStart: (type: string) => void;
  allowedFieldTypes?: string[];
}) {
  const filterByAllowed = (f: { type: string; label: string }) =>
    (!allowedFieldTypes || allowedFieldTypes.includes(f.type)) &&
    f.label.toLowerCase().includes(searchFields.toLowerCase());

  const standardFields = STANDARD_FIELDS.filter(filterByAllowed);
  const dataFields = DATA_FIELDS.filter(filterByAllowed);

  return (
    <div className="p-3 space-y-4">
      {/* Recipient selector */}
      <div>
        <p className="text-xs font-medium mb-1.5">Assign to</p>
        <select
          className="w-full border rounded px-2 py-1.5 text-sm bg-background"
          value={activeRecipient?.id || ""}
          onChange={(e) => {
            const r = recipients.find((r) => r.id === e.target.value);
            if (r) onRecipientChange(r);
          }}
          style={{ borderColor: activeRecipient?.color }}
        >
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.email})
            </option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search fields"
          value={searchFields}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-7 h-8 text-xs"
        />
      </div>

      {/* Standard Fields */}
      {standardFields.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Standard Fields</p>
          <div className="space-y-1">
            {standardFields.map((f) => (
              <DraggableFieldItem
                key={f.type}
                type={f.type}
                label={f.label}
                icon={f.icon}
                color={activeRecipient?.color}
                onDragStart={() => onFieldDragStart(f.type)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Data Fields */}
      {dataFields.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Data Fields</p>
          <div className="space-y-1">
            {dataFields.map((f) => (
              <DraggableFieldItem
                key={f.type}
                type={f.type}
                label={f.label}
                icon={f.icon}
                color={activeRecipient?.color}
                onDragStart={() => onFieldDragStart(f.type)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Draggable field palette item */
function DraggableFieldItem({
  type,
  label,
  icon,
  color,
  onDragStart,
}: {
  type: string;
  label: string;
  icon: string;
  color?: string;
  onDragStart: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded border cursor-grab hover:bg-slate-700/50 transition-colors text-xs text-slate-200 bg-slate-800/50 border-slate-700"
      draggable
      onDragStart={onDragStart}
      style={{ borderLeftColor: color || "#7c3aed", borderLeftWidth: 3 }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/** Signed field content display */
function FieldSignedContent({
  field,
  localVal,
  currentUser,
  isSelfSigning,
  onChangeSignature,
}: {
  field: PlacedField;
  localVal?: { value?: string; signatureData?: SignatureData };
  currentUser?: { name: string; email: string };
  isSelfSigning: boolean;
  onChangeSignature: () => void;
}) {
  const sigData = localVal?.signatureData || field.signatureData;

  if (field.type === "signature" && sigData) {
    return (
      <div className="relative w-full h-full">
        <img
          src={sigData.data}
          alt="Signature"
          className="w-full h-full object-contain"
        />
        {isSelfSigning && (
          <button
            className="absolute bottom-0 right-0 text-[8px] bg-white/80 px-1 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onChangeSignature();
            }}
          >
            Change
          </button>
        )}
      </div>
    );
  }

  // For other field types (name, email, date, initial), show with professional font
  const displayVal =
    localVal?.value ||
    field.value ||
    (field.type === "name" ? currentUser?.name : field.type === "email" ? currentUser?.email : "✓");

  return (
    <span
      className="text-green-800 truncate px-0.5 w-full block"
      style={{
        fontFamily: "'Times New Roman', 'Georgia', 'Garamond', serif",
        fontSize: "100%",
        fontWeight: field.type === "name" ? 600 : 400,
        lineHeight: 1.1,
      }}
    >
      {displayVal}
    </span>
  );
}

// ─── Resize handle positioning helpers ──────────────────

function getResizeHandlePosition(handle: string): string {
  const map: Record<string, string> = {
    nw: "-top-1 -left-1",
    ne: "-top-1 -right-1",
    sw: "-bottom-1 -left-1",
    se: "-bottom-1 -right-1",
    n: "-top-1 left-1/2 -translate-x-1/2",
    s: "-bottom-1 left-1/2 -translate-x-1/2",
    e: "top-1/2 -right-1 -translate-y-1/2",
    w: "top-1/2 -left-1 -translate-y-1/2",
  };
  return map[handle] || "";
}

function getResizeCursor(handle: string): string {
  const map: Record<string, string> = {
    nw: "nw-resize",
    ne: "ne-resize",
    sw: "sw-resize",
    se: "se-resize",
    n: "n-resize",
    s: "s-resize",
    e: "e-resize",
    w: "w-resize",
  };
  return map[handle] || "default";
}
