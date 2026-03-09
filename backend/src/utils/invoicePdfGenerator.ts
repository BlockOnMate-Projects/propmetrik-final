/**
 * Invoice PDF Generator
 *
 * Generates a professional, branded single-page A4 invoice PDF using PDFKit.
 * Returns a Buffer that can be attached to emails.
 *
 * Matches the PROPMETRIK / Bloomberg-style branding.
 */
import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface InvoicePdfLineItem {
  description: string;
  qty: number;
  unit?: string;
  unitRate: number;
  amount?: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;

  // From / To
  vendorCompany: string;
  vendorEmail?: string;
  clientName: string;
  clientEmail?: string;

  // Financials
  lineItems: InvoicePdfLineItem[];
  subtotal: number;
  taxAmount?: number;
  discount?: number;
  retention?: number;
  platformFee?: number;
  totalDue: number;

  // Optional
  projectName?: string;
  notes?: string;
  terms?: string;
  paymentLink?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOURS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  dark:       '#09090b',
  amber:      '#f59e0b',
  amberLight: '#fef3c7',
  white:      '#ffffff',
  heading:    '#0f172a',
  body:       '#334155',
  muted:      '#94a3b8',
  border:     '#e2e8f0',
  lightBg:    '#f8fafc',
  positive:   '#059669',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const M = 40;   // page margin (tighter for single-page fit)
const PW = 595.28;  // A4 width in points
const CW = PW - M * 2;
const NB = { lineBreak: false } as const; // prevent PDFKit from auto-advancing cursor

function fmtAmt(n: number): string {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | Date | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ccy = data.currency || 'GHS';
      let y = 0;

      // ════════════ HEADER BAND (compact) ════════════
      doc.rect(0, 0, PW, 70).fill(C.dark);
      doc.rect(0, 70, PW, 3).fill(C.amber);

      doc.fontSize(16).fillColor(C.amber).font('Helvetica-Bold')
        .text('PROPMETRIK', M, 18, { ...NB, width: CW / 2 });
      doc.fontSize(8).fillColor(C.muted).font('Helvetica')
        .text('PROJECT MANAGEMENT', M, 38, { ...NB, width: CW / 2 });

      doc.fontSize(18).fillColor(C.white).font('Helvetica-Bold')
        .text('INVOICE', PW - M - 180, 18, { ...NB, width: 180, align: 'right' });
      doc.fontSize(9).fillColor(C.muted).font('Helvetica')
        .text(data.invoiceNumber, PW - M - 180, 42, { ...NB, width: 180, align: 'right' });

      y = 82;

      // ════════════ META ROW (single line) ════════════
      doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold');
      doc.text('ISSUE DATE', M, y, NB);
      doc.text('DUE DATE', M + 140, y, NB);
      if (data.projectName) doc.text('PROJECT', M + 280, y, NB);
      y += 11;

      doc.fontSize(9).fillColor(C.heading).font('Helvetica');
      doc.text(fmtDate(data.issueDate), M, y, NB);
      doc.text(fmtDate(data.dueDate), M + 140, y, NB);
      if (data.projectName) doc.text(data.projectName, M + 280, y, { ...NB, width: CW - 280 });
      y += 18;

      // ════════════ FROM / TO (side by side, compact) ════════════
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 8;

      const colW = CW / 2 - 10;
      const fromToStartY = y;

      // FROM column
      doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text('FROM', M, y, NB);
      doc.fontSize(10).fillColor(C.heading).font('Helvetica-Bold').text(data.vendorCompany, M, y + 11, { ...NB, width: colW });
      if (data.vendorEmail) {
        doc.fontSize(8).fillColor(C.body).font('Helvetica').text(data.vendorEmail, M, y + 24, { ...NB, width: colW });
      }

      // TO column
      doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text('BILL TO', M + colW + 20, fromToStartY, NB);
      doc.fontSize(10).fillColor(C.heading).font('Helvetica-Bold').text(data.clientName, M + colW + 20, fromToStartY + 11, { ...NB, width: colW });
      if (data.clientEmail) {
        doc.fontSize(8).fillColor(C.body).font('Helvetica').text(data.clientEmail, M + colW + 20, fromToStartY + 24, { ...NB, width: colW });
      }

      y = fromToStartY + 38;
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 8;

      // ════════════ LINE ITEMS TABLE ════════════
      const descW = CW * 0.48;
      const qtyW  = CW * 0.08;
      const unitW = CW * 0.08;
      const rateW = CW * 0.16;
      const amtW  = CW * 0.20;

      // Header
      doc.rect(M, y, CW, 20).fill('#1f2937');
      const hY = y + 6;
      doc.fontSize(7).fillColor(C.white).font('Helvetica-Bold');
      doc.text('DESCRIPTION',  M + 6,                    hY, { ...NB, width: descW - 6 });
      doc.text('QTY',          M + descW,                 hY, { ...NB, width: qtyW, align: 'center' });
      doc.text('UNIT',         M + descW + qtyW,          hY, { ...NB, width: unitW, align: 'center' });
      doc.text('RATE',         M + descW + qtyW + unitW,  hY, { ...NB, width: rateW, align: 'right' });
      doc.text('AMOUNT',       M + descW + qtyW + unitW + rateW, hY, { ...NB, width: amtW - 6, align: 'right' });
      y += 20;

      // Rows
      const rowH = 20;
      data.lineItems.forEach((li, i) => {
        if (y + rowH > 760) { doc.addPage(); y = M; }

        if (i % 2 === 0) doc.rect(M, y, CW, rowH).fill(C.lightBg);

        const rY = y + 5;
        const qty = li.qty || 1;
        const rate = li.unitRate || 0;
        const amt = li.amount ?? (qty * rate);

        doc.fontSize(8).fillColor(C.body).font('Helvetica');
        doc.text(li.description || '—',  M + 6,                    rY, { ...NB, width: descW - 6 });
        doc.text(String(qty),             M + descW,                 rY, { ...NB, width: qtyW, align: 'center' });
        doc.text(li.unit || '—',          M + descW + qtyW,          rY, { ...NB, width: unitW, align: 'center' });
        doc.text(`${ccy} ${fmtAmt(rate)}`,M + descW + qtyW + unitW,  rY, { ...NB, width: rateW, align: 'right' });
        doc.text(`${ccy} ${fmtAmt(amt)}`, M + descW + qtyW + unitW + rateW, rY, { ...NB, width: amtW - 6, align: 'right' });

        y += rowH;
      });

      // Bottom border
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 10;

      // ════════════ FEE SUMMARY (right-aligned) ════════════
      const summaryX = M + CW * 0.55;
      const summaryW = CW * 0.45;
      const labelW = summaryW * 0.60;
      const valW = summaryW * 0.40;

      const addRow = (label: string, value: string, bold = false, bg?: string) => {
        if (y + 18 > 790) { doc.addPage(); y = M; }
        if (bg) doc.rect(summaryX - 4, y - 1, summaryW + 8, 18).fill(bg);
        doc.fontSize(bold ? 10 : 8)
          .fillColor(bold ? C.heading : C.body)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(label, summaryX, y + 2, { ...NB, width: labelW });
        doc.text(value, summaryX + labelW, y + 2, { ...NB, width: valW, align: 'right' });
        y += 18;
      };

      addRow('Subtotal', `${ccy} ${fmtAmt(data.subtotal)}`);
      if (data.taxAmount && data.taxAmount > 0) addRow('Tax', `${ccy} ${fmtAmt(data.taxAmount)}`);
      if (data.discount && data.discount > 0) addRow('Discount', `- ${ccy} ${fmtAmt(data.discount)}`);
      if (data.retention && data.retention > 0) addRow('Retention', `- ${ccy} ${fmtAmt(data.retention)}`);
      if (data.platformFee && data.platformFee > 0) addRow('PROPMETRIK Fee (0.25%)', `${ccy} ${fmtAmt(data.platformFee)}`);

      y += 2;
      addRow('TOTAL DUE', `${ccy} ${fmtAmt(data.totalDue)}`, true, C.amberLight);
      y += 8;

      // ════════════ PAYMENT LINK ════════════
      if (data.paymentLink) {
        if (y + 36 > 770) { doc.addPage(); y = M; }
        doc.roundedRect(M, y, CW, 30, 4).fill(C.amber);
        doc.fontSize(9).fillColor(C.dark).font('Helvetica-Bold')
          .text(`Pay Online: ${data.paymentLink}`, M + 10, y + 9, { ...NB, width: CW - 20, link: data.paymentLink });
        y += 38;
      }

      // ════════════ NOTES (compact) ════════════
      if (data.notes) {
        if (y + 30 > 780) { doc.addPage(); y = M; }
        doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
        y += 6;
        doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text('NOTES', M, y, NB);
        y += 10;
        doc.fontSize(8).fillColor(C.body).font('Helvetica').text(data.notes, M, y, { width: CW });
        y = doc.y + 4;
      }

      // ════════════ FOOTER ON ALL PAGES ════════════
      const pages = doc.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);
        const footY = 841.89 - 24;
        doc.fontSize(6).fillColor(C.muted).font('Helvetica');
        doc.text('PROPMETRIK — Powered by Cedyn Group', M, footY, { ...NB, width: CW / 2, align: 'left' });
        doc.text(`Page ${i + 1} of ${pages.count}`, M + CW / 2, footY, { ...NB, width: CW / 2, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
