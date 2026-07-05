/**
 * PM document PDF generators — Draw Requests & Contractor Agreements.
 *
 * Branded single-page A4 documents with labelled signature blocks that align with
 * the e-sign field placements (via `changeOrderSignatureSlots`, the shared percent
 * slot coordinates). Replaces the placeholder-stub PDFs.
 */
import PDFDocument from 'pdfkit';
import { changeOrderSignatureSlots } from './changeOrderPdfGenerator';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 45;
const CW = PAGE_W - M * 2;
const NB = { lineBreak: false } as const;

const C = {
  dark: '#09090b', amber: '#f59e0b', white: '#ffffff', heading: '#0f172a',
  body: '#334155', muted: '#94a3b8', border: '#e2e8f0', lightBg: '#f8fafc',
} as const;

const fmtAmt = (n: number, ccy: string) =>
  `${ccy} ${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: Date | string | null) => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};
const humanize = (s?: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pct = (p: number, dim: number) => (p / 100) * dim;

/** Optional firm branding (all fall back to PROPMETRIK defaults). */
export interface PmDocBranding {
  brandName?: string;
  brandTagline?: string;
  brandLogo?: Buffer | null;
  brandAccent?: string;   // "#RRGGBB"
  brandPrimary?: string;  // "#RRGGBB"
  brandFooter?: string;
}

function header(doc: any, kicker: string, ref: string, brand?: PmDocBranding) {
  const brandName = brand?.brandName || 'PROPMETRIK';
  const brandTagline = brand?.brandTagline || 'PROJECT MANAGEMENT';
  const primary = brand?.brandPrimary || C.dark;
  const accent = brand?.brandAccent || C.amber;
  doc.rect(0, 0, PAGE_W, 64).fill(primary);
  doc.rect(0, 64, PAGE_W, 3).fill(accent);
  let logoShown = false;
  if (brand?.brandLogo && brand.brandLogo.length > 24) {
    try { doc.image(brand.brandLogo, M, 14, { fit: [140, 38] }); logoShown = true; } catch { /* fall back to name text */ }
  }
  if (!logoShown) {
    doc.fontSize(15).fillColor(accent).font('Helvetica-Bold').text(brandName, M, 16, { ...NB, width: CW / 2 });
    doc.fontSize(8).fillColor(C.muted).font('Helvetica').text(brandTagline, M, 35, { ...NB, width: CW / 2 });
  }
  doc.fontSize(16).fillColor(C.white).font('Helvetica-Bold').text(kicker, PAGE_W - M - 240, 16, { ...NB, width: 240, align: 'right' });
  doc.fontSize(9).fillColor(C.muted).font('Helvetica').text(ref, PAGE_W - M - 240, 38, { ...NB, width: 240, align: 'right' });
}

function metaGrid(doc: any, y: number, items: Array<[string, string]>) {
  const colW = CW / 3;
  items.forEach((m, i) => {
    const cx = M + (i % 3) * colW;
    const cy = y + Math.floor(i / 3) * 32;
    doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text(m[0], cx, cy, NB);
    doc.fontSize(9.5).fillColor(C.heading).font('Helvetica').text(m[1], cx, cy + 11, { ...NB, width: colW - 8 });
  });
  return y + Math.ceil(items.length / 3) * 32 + 6;
}

function amountRows(doc: any, y: number, rows: Array<[string, number, boolean]>, ccy: string) {
  const labelX = M + CW * 0.45;
  const valW = CW * 0.55;
  rows.forEach(([label, amt, bold]) => {
    if (bold) doc.rect(labelX - 6, y - 2, valW + 6, 20).fill('#fef3c7');
    doc.fontSize(bold ? 11 : 9.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? C.heading : C.body)
      .text(label, labelX, y + 3, { ...NB, width: valW * 0.55 });
    doc.fillColor(bold ? C.heading : C.body).text(fmtAmt(amt, ccy), labelX + valW * 0.55, y + 3, { ...NB, width: valW * 0.45 - 6, align: 'right' });
    y += bold ? 24 : 18;
  });
  return y;
}

function signatureBlocks(doc: any, signerLabels: string[]) {
  const slots = changeOrderSignatureSlots(signerLabels);
  doc.fontSize(8).fillColor(C.muted).font('Helvetica-Bold')
    .text('AUTHORISED SIGNATURES', M, pct(slots.length ? slots[0].sigY - 5 : 60, PAGE_H), NB);
  for (const s of slots) {
    const lineY = pct(s.sigY + s.sigH, PAGE_H) + 20;
    const sigLeft = pct(s.sigX, PAGE_W), sigRight = pct(s.sigX + s.sigW, PAGE_W);
    const dateLeft = pct(s.dateX, PAGE_W), dateRight = pct(s.dateX + s.dateW, PAGE_W);
    doc.moveTo(sigLeft, lineY).lineTo(sigRight, lineY).strokeColor(C.heading).lineWidth(0.8).stroke();
    doc.moveTo(dateLeft, lineY).lineTo(dateRight, lineY).strokeColor(C.heading).lineWidth(0.8).stroke();
    doc.fontSize(7.5).fillColor(C.heading).font('Helvetica-Bold').text(s.label, sigLeft, lineY + 4, { ...NB, width: sigRight - sigLeft });
    doc.fontSize(6.5).fillColor(C.muted).font('Helvetica').text('Authorised Signature', sigLeft, lineY + 14, NB);
    doc.fontSize(6.5).fillColor(C.muted).font('Helvetica').text('Date', dateLeft, lineY + 4, NB);
  }
}

function footer(doc: any, note: string, brand?: PmDocBranding) {
  const footerText = brand?.brandFooter || 'PROPMETRIK Ghana Ltd.';
  doc.fontSize(6).fillColor(C.muted).font('Helvetica')
    .text(`${footerText} · ${note}`, M, PAGE_H - 24, { ...NB, width: CW, align: 'center' });
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW REQUEST
// ─────────────────────────────────────────────────────────────────────────────
export interface DrawRequestPdfData extends PmDocBranding {
  draw_number: string; project_name?: string; status?: string; currency: string;
  total_amount: number; approved_amount?: number; retention_percentage?: number;
  retention_held?: number; net_amount?: number; notes?: string;
  submitted_date?: Date | string | null; created_at?: Date | string; signerLabels: string[];
}

export async function generateDrawRequestPdf(data: DrawRequestPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const ccy = data.currency || 'GHS';

      header(doc, 'DRAW REQUEST', data.draw_number, data);
      let y = 84;
      doc.fontSize(13).fillColor(C.heading).font('Helvetica-Bold')
        .text(`Payment Draw — ${data.project_name || 'Project'}`, M, y, { width: CW });
      y = doc.y + 8;
      y = metaGrid(doc, y, [
        ['PROJECT', data.project_name || '—'],
        ['DRAW NO.', data.draw_number],
        ['DATE', fmtDate(data.submitted_date || data.created_at)],
        ['STATUS', humanize(data.status) || '—'],
        ['RETENTION', `${data.retention_percentage || 0}%`],
      ]);
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 10;
      const approved = data.approved_amount ?? data.total_amount;
      const net = data.net_amount ?? approved - (data.retention_held || 0);
      y = amountRows(doc, y, [
        ['Total Draw Requested', data.total_amount, false],
        ['Approved Amount', approved, false],
        [`Retention Held (${data.retention_percentage || 0}%)`, -(data.retention_held || 0), false],
        ['Net Amount Payable', net, true],
      ], ccy);

      signatureBlocks(doc, data.signerLabels);
      footer(doc, 'This draw request is approved electronically.', data);
      doc.end();
    } catch (err) { reject(err); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACTOR AGREEMENT
// ─────────────────────────────────────────────────────────────────────────────
export interface ContractorContractPdfData extends PmDocBranding {
  contractor_company: string; project_name?: string; trade?: string; currency: string;
  contract_value: number; scope_of_work?: string; start_date?: Date | string | null;
  end_date?: Date | string | null; created_at?: Date | string; signerLabels: string[];
}

export async function generateContractorContractPdf(data: ContractorContractPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const ccy = data.currency || 'GHS';

      header(doc, 'CONTRACTOR AGREEMENT', data.contractor_company, data);
      let y = 84;
      doc.fontSize(13).fillColor(C.heading).font('Helvetica-Bold')
        .text(`Agreement — ${data.contractor_company}`, M, y, { width: CW });
      y = doc.y + 8;
      y = metaGrid(doc, y, [
        ['PROJECT', data.project_name || '—'],
        ['CONTRACTOR', data.contractor_company],
        ['TRADE', humanize(data.trade) || '—'],
        ['START DATE', fmtDate(data.start_date)],
        ['END DATE', fmtDate(data.end_date)],
        ['DATE', fmtDate(data.created_at)],
      ]);
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 8;
      doc.fontSize(7).fillColor(C.muted).font('Helvetica-Bold').text('SCOPE OF WORK', M, y, NB);
      y += 11;
      doc.fontSize(9).fillColor(C.body).font('Helvetica')
        .text(data.scope_of_work || `Engagement of ${data.contractor_company} for ${humanize(data.trade) || 'works'} on ${data.project_name || 'the project'}, per the terms agreed between the parties.`, M, y, { width: CW });
      y = doc.y + 8;
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(C.border).lineWidth(0.5).stroke();
      y += 10;
      y = amountRows(doc, y, [['Total Contract Value', data.contract_value, true]], ccy);

      signatureBlocks(doc, data.signerLabels);
      footer(doc, 'This agreement is executed electronically and binding on both parties.', data);
      doc.end();
    } catch (err) { reject(err); }
  });
}
