"use client";

/**
 * PDF Viewer component - renders all PDF pages using pdfjs-dist
 * Used by FieldPlacement and external signing pages.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PageData {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
}

interface PDFViewerProps {
  file?: File | null;
  pdfUrl?: string;
  zoom?: number;
  onPagesLoaded?: (pages: PageData[]) => void;
  /** Render overlay content on each page (fields, drop zones, etc.) */
  renderPageOverlay?: (page: PageData, pageRef: HTMLDivElement) => React.ReactNode;
  /** Called on drag-over a page */
  onPageDragOver?: (e: React.DragEvent, pageNum: number) => void;
  /** Called on drop on a page */
  onPageDrop?: (e: React.DragEvent, pageNum: number, pageElement: HTMLDivElement) => void;
  onPageClick?: (e: React.MouseEvent, pageNum: number) => void;
  showThumbnails?: boolean;
  className?: string;
}

export default function PDFViewer({
  file,
  pdfUrl,
  zoom: externalZoom,
  onPagesLoaded,
  renderPageOverlay,
  onPageDragOver,
  onPageDrop,
  onPageClick,
  showThumbnails = true,
  className,
}: PDFViewerProps) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(externalZoom ?? 100);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Sync external zoom
  useEffect(() => {
    if (externalZoom !== undefined) setZoom(externalZoom);
  }, [externalZoom]);

  // Load PDF
  useEffect(() => {
    const loadPdf = async () => {
      if (!file && !pdfUrl) return;
      setLoading(true);
      setPages([]);

      try {
        // @ts-expect-error — runtime URL import bypasses webpack to avoid pdfjs-dist v5 conflicts
        const pdfjsLib = await import(/* webpackIgnore: true */ "/pdf.min.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        let source: any;
        if (file) {
          const arrayBuffer = await file.arrayBuffer();
          source = { data: arrayBuffer };
        } else if (pdfUrl) {
          source = { url: pdfUrl };
        }

        const pdf = await pdfjsLib.getDocument(source).promise;
        const newPages: PageData[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await (page.render({ canvasContext: ctx, viewport } as any).promise);
            newPages.push({
              pageNum: i,
              dataUrl: canvas.toDataURL(),
              width: viewport.width,
              height: viewport.height,
            });
          }
        }

        setPages(newPages);
        onPagesLoaded?.(newPages);
      } catch (error) {
        console.error("Error loading PDF:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pdfUrl]);

  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Expose page refs for external use
  const getPageRef = useCallback((pageNum: number) => pageRefs.current.get(pageNum), []);

  return (
    <div className={`flex h-full ${className || ""}`}>
      {/* Main document area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium w-10 text-center">{zoom}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{pages.length} pages</span>
        </div>

        {/* Scroll container */}
        <div className="flex-1 overflow-auto bg-zinc-200 dark:bg-muted" ref={scrollContainerRef}>
          {loading && (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading document...</p>
            </div>
          )}

          <div
            className="flex flex-col items-center gap-4 py-4 px-2"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
          >
            {pages.map((page) => (
              <div
                key={page.pageNum}
                className="relative bg-card shadow-lg"
                ref={(el) => {
                  if (el) pageRefs.current.set(page.pageNum, el);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  onPageDragOver?.(e, page.pageNum);
                }}
                onDrop={(e) => {
                  const el = pageRefs.current.get(page.pageNum);
                  if (el) onPageDrop?.(e, page.pageNum, el);
                }}
                onClick={(e) => onPageClick?.(e, page.pageNum)}
              >
                {/* Page number badge */}
                <div className="absolute -top-3 left-2 z-10 bg-zinc-700 text-foreground text-[10px] px-2 py-0.5 rounded">
                  Page {page.pageNum}
                </div>
                <img src={page.dataUrl} alt={`Page ${page.pageNum}`} draggable={false} className="block" />
                {/* Overlay */}
                {renderPageOverlay && pageRefs.current.get(page.pageNum) && renderPageOverlay(page, pageRefs.current.get(page.pageNum)!)}
              </div>
            ))}
            {pages.length === 0 && !loading && (
              <div className="text-center text-muted-foreground py-20">No document loaded</div>
            )}
          </div>
        </div>
      </div>

      {/* Thumbnail sidebar */}
      {showThumbnails && pages.length > 0 && (
        <div className="w-28 border-l bg-muted/20 overflow-y-auto shrink-0 hidden md:block">
          <div className="p-2 space-y-2">
            {pages.map((page) => (
              <button
                key={page.pageNum}
                className="w-full rounded border hover:border-primary transition-colors overflow-hidden"
                onClick={() => scrollToPage(page.pageNum)}
              >
                <img src={page.dataUrl} alt={`Thumb ${page.pageNum}`} className="w-full" />
                <span className="block text-[10px] text-center py-0.5">{page.pageNum}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Utility: generate text as a PNG image ─────────────────

export function generateTextAsImage(
  text: string,
  options: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    width?: number;
    height?: number;
    isInitials?: boolean;
    isCheckbox?: boolean;
    checked?: boolean;
  } = {}
): string {
  const {
    fontSize = 16,
    fontFamily = "Arial, sans-serif",
    color = "#1a1a2e",
    width = 200,
    height = 40,
    isInitials = false,
    isCheckbox = false,
    checked = true,
  } = options;

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  if (isCheckbox) {
    const boxSize = Math.min(width, height) * 0.8;
    const offsetX = (width - boxSize) / 2;
    const offsetY = (height - boxSize) / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, boxSize, boxSize);
    if (checked) {
      ctx.beginPath();
      ctx.moveTo(offsetX + boxSize * 0.2, offsetY + boxSize * 0.5);
      ctx.lineTo(offsetX + boxSize * 0.4, offsetY + boxSize * 0.75);
      ctx.lineTo(offsetX + boxSize * 0.8, offsetY + boxSize * 0.25);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  } else {
    const actualFontSize = isInitials ? fontSize * 1.5 : fontSize;
    ctx.font = `${isInitials ? "bold " : ""}${actualFontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = isInitials ? "center" : "left";
    const x = isInitials ? width / 2 : 5;
    ctx.fillText(text, x, height / 2);
  }

  return canvas.toDataURL("image/png");
}
