/**
 * Change Order PDF Generator
 *
 * Produces a professional, branded single-page A4 change-order document using
 * PDFKit, with labelled signature blocks. The block positions are exported as
 * percentage coordinates (`changeOrderSignatureSlots`) so the e-sign field
 * builder places each signer's signature/date EXACTLY on the drawn lines —
 * keeping the document and the e-sign overlay in sync.
 *
 * Replaces the old placeholder stub that emitted a blank page.
 */
import PDFDocument from 'pdfkit';

const PAGE_W = 595.28; // A4 width (pt)
const PAGE_H = 841.89; // A4 height (pt)
const M = 45;
const CW = PAGE_W - M * 2;
const NB = { lineBreak: false } as const;

const C = {
  dark: '#09090b',
  amber: '#f59e0b',
  white: '#ffffff',
  heading: '#0f172a',
  body: '#334155',
  muted: '#94a3b8',
  border: '#e2e8f0',
  lightBg: '#f8fafc',
  positive: '#059669',
  negative: '#dc2626',
} as const;

/** A signature + date slot, in PERCENT-from-top-left of the page (0-100). */
export interface SignatureSlot {
  label: string;
  sigX: number; sigY: number; sigW: number; sigH: number;
  dateX: number; dateY: number; dateW: number; dateH: number;
}

/**
 * Signature slot coordinates (percent of page) for up to `count` signers.
 * Used by BOTH the PDF (to draw the lines) and the e-sign field builder (to
 * place the fields), so they always align.
 */
export function changeOrderSignatureSlots(labels: string[]): SignatureSlot[] {
  // Stack blocks down the lower third of the page.
  const startTop = 62; // % from top of first block
  const step = 11;     // % between blocks
  return labels.map((label, i) => {
    const y = startTop + i * step;
    return {
      label,
      sigX: 8, sigY: y, sigW: 34, sigH: 7,
      dateX: 60, dateY: y, dateW: 24, dateH: 6,
    };
  });
}

export interface ChangeOrderPdfData {
  co_number: string;
  title: string;
  description?: string;
  reason?: string;
  reason_details?: string;
  co_type?: string;
  status?: string;
  currency: string;
  original_contract_amount: number;
  previous_changes_amount: number;
  this_change_amount: number;
  new_contract_amount: number;
  schedule_impact_days?: number;
  new_completion_date?: Date | string | null;
  project_name?: string;
  created_at?: Date | string;
  /** Display labels for each signer block, in signing order. */
  signerLabels: string[];

  // ── Optional firm branding (all fall back to PROPMETRIK defaults) ──
  brandName?: string;
  brandTagline?: string;
  brandLogo?: Buffer | null;
  brandAccent?: string;   // "#RRGGBB"
  brandPrimary?: string;  // "#RRGGBB"
  brandFooter?: string;
}

const fmtAmt = (n: number, ccy: string) =>
  `${ccy} ${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: Date | string | null) => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const humanize = (s?: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function generateChangeOrderPdf(data: ChangeOrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ccy = data.currency || 'GHS';
      const pct = (p: number, dim: number) => (p / 100) * dim;

      // Firm branding (falls back to PROPMETRIK)
      const brandName = data.brandName || 'PROPMETRIK';
      const brandTagline = data.brandTagline || 'PROJECT MANAGEMENT';
      const primary = data.brandPrimary || C.dark;
      const accent = data.brandAccent || C.amber;
      const footerText = data.brandFooter || 'PROPMETRIK Ghana Ltd.';

      // ── Header band ──
      doc.rect(0, 0, PAGE_W, 64).fill(primary);
      doc.rect(0, 64, PAGE_W, 3).fill(accent);
      let coLogoShown = false;
      if (data.brandLogo && data.brandLogo.length > 24) {
        try { doc.image(data.brandLogo, M, 14, { fit: [140, 38] }); coLogoShown = true; } catch { /* fall back to name text */ }
      }
      if (!coLogoShown) {
        doc.fontSize(15).fillColor(accent).font('Helvetica-Bold').text(brandName, M, 16, { ...NB, width: CW / 2 });
        doc.fontSize(8).fillColor(C.muted).font('Helvetica').text(brandTagline, M, 35, { ...NB, width: CW / 2 });
      }
      doc.fontSize(17).fillColor(C.white).font('Helvetica-Bold').text('CHANGE ORDER', PAGE_W - M - 220, 16, { ...NB, width: 220, align: 'right' });
      doc.fontSize(9).fillColor(C.muted).font('Helvetica').text(data.co_number, PAGE_W - M - 220, 38, { ...NB, width: 220, align: 'right' });

      let y = 84;
      // ── Title ──
      doc.fontSize(13).fillColor(C.heading).font('Helvetica-Bold').text(data.title || 'Change Order', M, y, { width: CW });
      y = doc.y + 8;

      // ── Meta grid ──
      const meta: Array<[string, string]> = [
        ['PROJECT', data.project_name || '—'],
        ['DATE', fmtDate(data.created_at)],
        ['TYPE', humanize(data.co_type) || '—'],
        ['REASON', humanize(data.reason) || '—'],
        ['STATUS', humanize(data.status) || '—'],
        ['SCHEDULE IMPACT', `${data.schedule_impact_days || 0} day(s)`],
      ];
      const colW = CW / 3;
      meta.forEach((m, i) => {
        const cx = M + (i % 3) * colW;
        const cy = y + Math.floor(i / 3) * 32;
        doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text(m[0], cx, cy, NB);
        doc.fontSize(9.5).fillColor(C.heading).font('Helvetica').text(m[1], cx, cy + 11, { ...NB, width: colW - 8 });
      });
      y += 72;

      // ── Description ──
      if (data.description) {
        doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
        y += 8;
        doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text('DESCRIPTION OF CHANGE', M, y, NB);
        y += 11;
        doc.fontSize(9).fillColor(C.body).font('Helvetica').text(data.description, M, y, { width: CW });
        y = doc.y + 6;
        if (data.reason_details) {
          doc.fontSize(8.5).fillColor(C.body).font('Helvetica-Oblique').text(data.reason_details, M, y, { width: CW });
          y = doc.y + 6;
        }
      }

      // ── Cost summary ──
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 10;
      const rows: Array<[string, number, boolean]> = [
        ['Original Contract Amount', data.original_contract_amount, false],
        ['Previous Approved Changes', data.previous_changes_amount, false],
        ['This Change Order', data.this_change_amount, false],
        ['Revised Contract Total', data.new_contract_amount, true],
      ];
      const labelX = M + CW * 0.45;
      const valW = CW * 0.55;
      rows.forEach(([label, amt, bold]) => {
        if (bold) doc.rect(labelX - 6, y - 2, valW + 6, 20).fill('#fef3c7');
        doc.fontSize(bold ? 11 : 9.5).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(bold ? C.heading : C.body)
          .text(label, labelX, y + 3, { ...NB, width: valW * 0.55 });
        const amtColor = bold ? C.heading : (amt < 0 ? C.negative : C.body);
        doc.fillColor(amtColor).text(fmtAmt(amt, ccy), labelX + valW * 0.55, y + 3, { ...NB, width: valW * 0.45 - 6, align: 'right' });
        y += bold ? 24 : 18;
      });

      // ── Signature blocks (drawn at the exact slots the e-sign fields target) ──
      const slots = changeOrderSignatureSlots(data.signerLabels);
      doc.fontSize(8).fillColor(C.muted).font('Helvetica-Bold')
        .text('AUTHORISED SIGNATURES', M, pct(slots.length ? slots[0].sigY - 5 : 60, PAGE_H), NB);

      for (const s of slots) {
        // Put the ruled line ~20pt BELOW the signature box so the e-sign renderer's
        // PMT-ID stamp (printed just under the signature image) has clear space and
        // never collides with the caption.
        const lineY = pct(s.sigY + s.sigH, PAGE_H) + 20;
        const sigLeft = pct(s.sigX, PAGE_W);
        const sigRight = pct(s.sigX + s.sigW, PAGE_W);
        const dateLeft = pct(s.dateX, PAGE_W);
        const dateRight = pct(s.dateX + s.dateW, PAGE_W);
        // ruled lines
        doc.moveTo(sigLeft, lineY).lineTo(sigRight, lineY).strokeColor(C.heading).lineWidth(0.8).stroke();
        doc.moveTo(dateLeft, lineY).lineTo(dateRight, lineY).strokeColor(C.heading).lineWidth(0.8).stroke();
        // captions UNDER the lines (name + role on the signature side, "Date" on the other)
        doc.fontSize(7.5).fillColor(C.heading).font('Helvetica-Bold').text(s.label, sigLeft, lineY + 4, { ...NB, width: sigRight - sigLeft });
        doc.fontSize(6.5).fillColor(C.muted).font('Helvetica').text('Authorised Signature', sigLeft, lineY + 14, NB);
        doc.fontSize(6.5).fillColor(C.muted).font('Helvetica').text('Date', dateLeft, lineY + 4, NB);
      }

      // ── Footer ──
      doc.fontSize(6).fillColor(C.muted).font('Helvetica')
        .text(`${footerText} · This change order is executed electronically.`, M, PAGE_H - 24, { ...NB, width: CW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
