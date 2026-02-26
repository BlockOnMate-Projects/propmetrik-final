/**
 * PDF Service
 * Handles HTML to PDF conversion and page rendering
 */

// For client-side, we'll use html2canvas to capture the HTML and jsPDF for PDF creation
// In production, this would be handled server-side for better quality

interface PDFRenderResult {
    pages: { pageNumber: number; imageUrl: string }[];
    pdfUrl: string;
    totalPages: number;
}

/**
 * Convert HTML content to PDF and return page images
 * Note: For production, this should be done server-side using Puppeteer/Playwright
 */
export async function htmlToPdfPages(html: string): Promise<PDFRenderResult> {
    // For now, render the HTML in a hidden iframe and capture it
    return new Promise((resolve) => {
        // Create hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.width = '816px'; // 8.5" at 96 DPI
        iframe.style.height = '1056px'; // 11" at 96 DPI
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        // Write HTML to iframe
        const doc = iframe.contentDocument;
        if (!doc) {
            document.body.removeChild(iframe);
            resolve({ pages: [], pdfUrl: '', totalPages: 0 });
            return;
        }

        doc.open();
        doc.write(html);
        doc.close();

        // Wait for content to load
        setTimeout(async () => {
            try {
                // Dynamic import html2canvas
                const html2canvas = (await import('html2canvas')).default;
                
                // Capture the content
                const canvas = await html2canvas(doc.body, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    width: 816,
                    windowWidth: 816,
                });

                // For multi-page documents, we'd need to split based on content height
                // For now, treat as single page
                const imageUrl = canvas.toDataURL('image/png');

                // Cleanup
                document.body.removeChild(iframe);

                resolve({
                    pages: [{ pageNumber: 1, imageUrl }],
                    pdfUrl: '', // Would be set if we create actual PDF
                    totalPages: 1
                });
            } catch (error) {
                console.error('Failed to render PDF:', error);
                document.body.removeChild(iframe);
                resolve({ pages: [], pdfUrl: '', totalPages: 0 });
            }
        }, 500); // Give time for styles to load
    });
}

/**
 * Generate a placeholder page image for documents not yet rendered
 */
export function getPlaceholderPageImage(pageNumber: number, width = 612, height = 792): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Border
        ctx.strokeStyle = '#e5e5e5';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
        
        // Page number
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Page ${pageNumber}`, width / 2, height - 20);
        
        // Loading indicator
        ctx.fillStyle = '#d1d5db';
        ctx.font = '16px monospace';
        ctx.fillText('Loading document...', width / 2, height / 2);
    }
    
    return canvas.toDataURL('image/png');
}

/**
 * Split a long HTML document into pages
 * This is a simplified version - production would need proper pagination
 */
export function splitHtmlIntoPages(html: string, pageHeightPx = 1056): string[] {
    // For proper pagination, we'd need to:
    // 1. Render the HTML in a hidden container
    // 2. Calculate content height
    // 3. Split at natural break points
    // 4. Handle elements that shouldn't be split
    
    // For now, return the full HTML as a single page
    return [html];
}
