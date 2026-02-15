"use client";

/**
 * SignatureModal - Full-featured signature capture modal
 * Supports: Type (6 fonts), Draw (canvas), Upload (image), and Saved signatures
 * Generates PNG images for all signature types for consistent PDF embedding.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Eraser, Check } from "lucide-react";
import { SignatureData } from "@/lib/esign-types";

interface SignatureModalProps {
  signerName: string;
  signerIdentity?: string;
  onApply: (signature: SignatureData) => void;
  onCancel: () => void;
  /** When true, don't load or show saved signatures from localStorage */
  disableSaved?: boolean;
}

const SIGNATURE_FONTS = [
  { id: "dancing", name: "Elegant Script", style: "'Dancing Script', cursive" },
  { id: "caveat", name: "Casual Hand", style: "'Caveat', cursive" },
  { id: "pacifico", name: "Smooth Script", style: "'Pacifico', cursive" },
  { id: "greatvibes", name: "Formal Script", style: "'Great Vibes', cursive" },
  { id: "allura", name: "Classic Signature", style: "'Allura', cursive" },
  { id: "sacramento", name: "Modern Script", style: "'Sacramento', cursive" },
];

// Google Fonts preload link for typed signatures
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Caveat:wght@400;700&family=Pacifico&family=Great+Vibes&family=Allura&family=Sacramento&display=swap";

function generateTypedSignatureImage(text: string, fontFamily: string): Promise<string> {
  return new Promise((resolve) => {
    // Ensure font is loaded before drawing
    const tryRender = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `48px ${fontFamily}`;
      ctx.fillStyle = "#000000";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      resolve(canvas.toDataURL("image/png"));
    };
    // Use document.fonts.ready to wait for fonts
    if (document.fonts?.ready) {
      document.fonts.ready.then(tryRender);
    } else {
      tryRender();
    }
  });
}

const STORAGE_KEY_PREFIX = "cedyn_esign_signature";

function normalizeSignerIdentity(identity: string): string {
  return identity.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

function getStorageKey(identity?: string): string | null {
  if (!identity) return null;
  const normalized = normalizeSignerIdentity(identity);
  if (!normalized) return null;
  return `${STORAGE_KEY_PREFIX}:${normalized}`;
}

export default function SignatureModal({ signerName, signerIdentity, onApply, onCancel, disableSaved }: SignatureModalProps) {
  const [activeTab, setActiveTab] = useState<"saved" | "type" | "draw" | "upload">("type");
  const [typedSignature, setTypedSignature] = useState(signerName);
  const [selectedFont, setSelectedFont] = useState("dancing");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<SignatureData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const storageKey = getStorageKey(signerIdentity || signerName);

  // Load Google Fonts
  useEffect(() => {
    if (!document.querySelector(`link[href*="Dancing+Script"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
    // Wait for fonts to be ready
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => setFontsLoaded(true));
    } else {
      // Fallback: assume loaded after 1s
      setTimeout(() => setFontsLoaded(true), 1000);
    }
  }, []);

  // Load saved signature (skip on external signing pages)
  useEffect(() => {
    if (disableSaved || !storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSavedSignature(parsed);
        setActiveTab("saved");
      }
    } catch {
      // ignore
    }
  }, [disableSaved, storageKey]);

  // Initialize canvas
  useEffect(() => {
    if (activeTab === "draw" && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
      }
    }
  }, [activeTab]);

  const saveSignature = (sig: SignatureData) => {
    if (disableSaved || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(sig));
    setSavedSignature(sig);
  };

  // Drawing handlers
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // File upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setUploadedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Apply button
  const handleApply = async () => {
    let sig: SignatureData | null = null;

    if (activeTab === "type") {
      const fontStyle = SIGNATURE_FONTS.find((f) => f.id === selectedFont)?.style || SIGNATURE_FONTS[0].style;
      const imageData = await generateTypedSignatureImage(typedSignature || signerName, fontStyle);
      sig = { type: "typed", data: imageData, fontFamily: fontStyle };
    } else if (activeTab === "draw") {
      const canvas = canvasRef.current;
      if (canvas) {
        sig = { type: "drawn", data: canvas.toDataURL("image/png") };
      }
    } else if (activeTab === "upload" && uploadedImage) {
      sig = { type: "uploaded", data: uploadedImage };
    } else if (activeTab === "saved" && savedSignature) {
      sig = savedSignature;
    }

    if (sig) {
      if (!disableSaved) {
        saveSignature(sig);
      }
      onApply(sig);
    }
  };

  const isDisabled =
    (activeTab === "type" && !typedSignature) ||
    (activeTab === "draw" && !hasDrawn) ||
    (activeTab === "upload" && !uploadedImage);

  const tabs: { key: typeof activeTab; label: string }[] = [];
  if (savedSignature) tabs.push({ key: "saved", label: "Saved" });
  tabs.push({ key: "type", label: "Type" }, { key: "draw", label: "Draw" }, { key: "upload", label: "Upload" });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Add Your Signature</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.key === "saved" && "✓ "}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 min-h-[280px]">
          {/* Saved Tab */}
          {activeTab === "saved" && savedSignature && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Your saved signature:</p>
              <div className="border rounded-lg p-4 bg-white dark:bg-zinc-800 flex justify-center">
                <img src={savedSignature.data} alt="Saved signature" className="max-h-20 object-contain" />
              </div>
              <button
                className="text-sm text-destructive hover:underline"
                onClick={() => {
                  if (storageKey) {
                    localStorage.removeItem(storageKey);
                  }
                  setSavedSignature(null);
                  setActiveTab("type");
                }}
              >
                Remove saved signature
              </button>
            </div>
          )}

          {/* Type Tab */}
          {activeTab === "type" && (
            <div className="space-y-4">
              <Input
                value={typedSignature}
                onChange={(e) => setTypedSignature(e.target.value)}
                placeholder="Type your name"
                className="text-lg bg-white text-black border-primary/40"
              />
              <div className="grid grid-cols-2 gap-2">
                {SIGNATURE_FONTS.map((font) => (
                  <button
                    key={font.id}
                    className={`p-3 rounded-lg border text-center transition-colors bg-white ${
                      selectedFont === font.id
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setSelectedFont(font.id)}
                  >
                    <span style={{ fontFamily: font.style, fontSize: "22px", color: "#000" }}>
                      {typedSignature || signerName}
                    </span>
                    <span className="block text-xs text-gray-500 mt-1">{font.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Draw Tab */}
          {activeTab === "draw" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Draw your signature below:</p>
              <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={150}
                  className="w-full cursor-crosshair touch-none"
                  style={{ height: "150px" }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <Button variant="outline" size="sm" onClick={clearCanvas}>
                <Eraser className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === "upload" && (
            <div className="space-y-4">
              {uploadedImage ? (
                <div className="space-y-3">
                  <div className="border rounded-lg p-4 bg-white dark:bg-zinc-800 flex justify-center">
                    <img src={uploadedImage} alt="Uploaded signature" className="max-h-24 object-contain" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setUploadedImage(null)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-3 border-2 border-dashed rounded-lg py-10 cursor-pointer hover:border-primary/50 transition-colors">
                  <span className="text-3xl">📤</span>
                  <span className="text-sm text-muted-foreground">Click or drag to upload signature image</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t space-y-3">
          <p className="text-xs text-muted-foreground">
            By clicking &quot;Apply&quot;, I agree that this signature will be the electronic representation of my
            signature.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isDisabled}>
              <Check className="h-4 w-4 mr-1" /> Apply Signature
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
