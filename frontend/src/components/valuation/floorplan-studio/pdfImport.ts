// ============================================================================
// PDF plan import — rasterizes a PDF page to a PNG data URL for tracing.
// pdf.js is loaded lazily so it never weighs down the initial bundle.
// ============================================================================

import * as pdfjs from 'pdfjs-dist';
// webpack 5 / Next: resolve the worker as an asset URL (Vite's ?worker is unavailable)
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

// exposed for diagnostics/tests — same instance rasterizePdf uses
export { pdfjs };

export interface PdfPageImage {
  dataUrl: string;
  width: number;
  height: number;
  pageCount: number;
}

export async function rasterizePdf(data: ArrayBuffer, pageNumber = 1, targetWidth = 2400): Promise<PdfPageImage> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, targetWidth / base.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent:'print' renders without requestAnimationFrame scheduling, so it also
  // completes in background tabs (display intent stalls when rAF is throttled)
  await page.render({ canvasContext: ctx, viewport, canvas, intent: 'print' }).promise;

  const out: PdfPageImage = {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    pageCount: doc.numPages,
  };
  await doc.destroy();
  return out;
}
