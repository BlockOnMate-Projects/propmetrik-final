/**
 * PROPMETRIK PDF Report Kit
 *
 * Centralized, reusable PDF building blocks for every report across the
 * platform: project management, compliance, valuation, portfolio, etc.
 *
 * Uses PDFKit (pdfkit npm package).  All helpers accept a plain PDFKit
 * document instance — no sub-classing required.
 *
 * Usage:
 *   import { PDF, pdfCover, pdfSection, pdfStatCards, ... } from '../utils/pdfReportKit';
 *   const doc = PDF.create();          // pre-configured A4 doc
 *   pdfCover(doc, { ... });
 *   pdfSection(doc, 'Budget');
 *   pdfStatCards(doc, [ ... ]);
 *   PDF.addFooters(doc);
 *   doc.end();
 */

import PDFDocument from 'pdfkit';

// ─────────────────────────────────────────────────────────────────────────────
// BRAND COLOURS
// ─────────────────────────────────────────────────────────────────────────────
export const COLORS = {
  // Brand
  brand:        '#d97706',
  brandLight:   '#fef3c7',
  brandDark:    '#92400e',

  // Neutrals
  heading:      '#111827',
  body:         '#374151',
  muted:        '#6b7280',
  border:       '#d1d5db',
  lightBg:      '#f9fafb',
  white:        '#ffffff',

  // Semantic
  positive:     '#059669',
  positiveBg:   '#d1fae5',
  negative:     '#dc2626',
  negativeBg:   '#fee2e2',
  warning:      '#d97706',
  warningBg:    '#fef3c7',
  info:         '#2563eb',
  infoBg:       '#dbeafe',

  // Table
  tableBand:    '#f3f4f6',
  tableHead:    '#1f2937',
  tableHeadFg:  '#ffffff',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
export const PAGE = {
  width:   595.28,   // A4 points
  height:  841.89,
  margin:  50,
  get contentWidth() { return this.width - this.margin * 2; },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────
export function fmtGHS(n: number | undefined | null): string {
  const v = Number(n) || 0;
  if (v >= 1e9) return `GHS ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `GHS ${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `GHS ${(v / 1e3).toFixed(1)}K`;
  return `GHS ${v.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function fmtPct(n: number | undefined | null): string {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

export function titleCase(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function safeDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT FACTORY
// ─────────────────────────────────────────────────────────────────────────────
export const PDF = {
  /** Create a pre-configured A4 document with buffered pages (for footer injection). */
  create(opts?: PDFKit.PDFDocumentOptions): InstanceType<typeof PDFDocument> {
    return new PDFDocument({
      margin: PAGE.margin,
      size: 'A4',
      bufferPages: true,
      ...opts,
    });
  },

  /** Inject page footers on every page (call BEFORE doc.end()). */
  addFooters(doc: any, leftText = 'PROPMETRIK Report — Confidential') {
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      const cw = PAGE.contentWidth;
      doc.fontSize(7).fillColor(COLORS.muted)
        .text(leftText, PAGE.margin, PAGE.height - 30, { width: cw / 2, align: 'left' })
        .text(`Page ${i + 1} of ${pages.count}`, PAGE.margin + cw / 2, PAGE.height - 30, { width: cw / 2, align: 'right' });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE SPACE HELPER
// ─────────────────────────────────────────────────────────────────────────────
export function ensureSpace(doc: any, needed: number) {
  if (doc.y > PAGE.height - needed - 40) doc.addPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// COVER PAGE
// ─────────────────────────────────────────────────────────────────────────────
export interface CoverPageOptions {
  /** Large title (e.g. project name or "Portfolio Summary Report"). */
  title: string;
  /** Smaller sub-title beneath the dark strip. */
  subtitle: string;
  /** Additional lines in the centre (e.g. "GHS 375K Budget | 3 Projects"). */
  meta?: string[];
  /** Override the brand-strip colour (default: COLORS.brand). */
  accentColor?: string;
  /** Optional: "Report Type" badge text shown on the right of the strip. */
  reportType?: string;
  /** Override the brand tagline below PROPMETRIK (default: "Project Management Platform"). */
  brandTagline?: string;
  /** Optional QR image data URL rendered in the footer area. */
  qrCodeDataUrl?: string;
}

export function pdfCover(doc: any, opts: CoverPageOptions) {
  const M  = PAGE.margin;
  const CW = PAGE.contentWidth;
  const accent = opts.accentColor || COLORS.brand;
  const PW = PAGE.width;
  const PH = PAGE.height;
  const background = '#18181b';
  const backgroundAlt = '#27272a';
  const white = '#ffffff';
  const soft = '#a1a1aa';
  const faint = '#71717a';
  const border = 'rgba(255,255,255,0.10)';
  const overlayColor = '#ffffff';
  const titleX = M + 12;
  const titleY = 230;
  const stats = (opts.meta || []).slice(0, 3).map((line, index) => {
    const parts = line.split(':');
    return {
      label: parts[0] || `Metric ${index + 1}`,
      value: parts.slice(1).join(':').trim() || line,
    };
  });

  doc.rect(0, 0, PW, PH).fill(background);
  doc.save();
  doc.fillColor(backgroundAlt).opacity(0.55);
  doc.rect(0, 0, PW, PH).fill();
  doc.restore();
  doc.rect(0, 0, PW, 4).fill(accent);

  doc.save();
  doc.strokeColor(overlayColor).opacity(0.10).lineWidth(0.6);
  for (let x = 16; x < PW; x += 22) {
    for (let y = 16; y < PH; y += 22) {
      doc.moveTo(x - 2, y).lineTo(x + 2, y).stroke();
      doc.moveTo(x, y - 2).lineTo(x, y + 2).stroke();
    }
  }
  doc.restore();

  doc.roundedRect(titleX, 40, 36, 36, 8).fill(accent);
  doc.fontSize(20).fillColor(white).font('Helvetica-Bold')
    .text('P', titleX, 48, { width: 36, align: 'center' });
  doc.fontSize(18).fillColor(white).font('Helvetica-Bold')
    .text('PROPMETRIK', titleX + 48, 45, { width: 220 });
  doc.fontSize(8).fillColor(soft).font('Helvetica')
    .text(opts.brandTagline || 'Real Estate Intelligence', titleX + 48, 62, { width: 220 });

  const now = new Date();
  const currentDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fontSize(8).fillColor(faint).font('Helvetica')
    .text('DOCUMENT DATE', PW - M - 120, 48, { width: 120, align: 'right' });
  doc.fontSize(12).fillColor(white).font('Helvetica-Bold')
    .text(currentDate, PW - M - 120, 60, { width: 120, align: 'right' });

  doc.save();
  doc.strokeColor('rgba(255,255,255,0.15)').lineWidth(0.6);
  doc.moveTo(titleX, 102).lineTo(PW - M, 102).stroke();
  doc.restore();

  doc.rect(titleX, titleY, 4, 144).fill(accent);
  doc.fontSize(11).fillColor(accent).font('Helvetica')
    .text(opts.reportType || 'REPORT', titleX + 24, titleY - 4, {
      width: 180,
      characterSpacing: 2.4,
    });
  doc.fontSize(32).fillColor(white).font('Helvetica-Bold')
    .text(opts.title, titleX + 24, titleY + 18, {
      width: 280,
      lineGap: 2,
    });
  doc.fontSize(18).fillColor(soft).font('Helvetica')
    .text(opts.subtitle, titleX + 24, doc.y + 8, { width: 280 });

  const subAccentY = doc.y + 10;
  doc.fontSize(16).fillColor(accent).font('Helvetica-Bold')
    .text((opts.meta || [])[3] || '', titleX + 24, subAccentY, { width: 220 });

  const cardY = 520;
  const cardW = (CW - 24) / 3;
  stats.forEach((stat, index) => {
    const x = titleX + index * (cardW + 12);
    doc.save();
    doc.fillColor(white).opacity(0.05);
    doc.roundedRect(x, cardY, cardW, 72, 10).fill();
    doc.restore();
    doc.save();
    doc.strokeColor(border).lineWidth(1);
    doc.roundedRect(x, cardY, cardW, 72, 10).stroke();
    doc.restore();
    doc.fontSize(8).fillColor(faint).font('Helvetica')
      .text(stat.label.toUpperCase(), x + 16, cardY + 14, {
        width: cardW - 32,
        characterSpacing: 1.2,
      });
    doc.fontSize(18).fillColor(white).font('Helvetica-Bold')
      .text(stat.value, x + 16, cardY + 32, { width: cardW - 32 });
  });

  doc.fontSize(8).fillColor('#52525b').font('Helvetica')
    .text('Generated via PROPMETRIK', titleX, PH - 108, { width: 220 });
  doc.fontSize(8).fillColor('#52525b').font('Helvetica')
    .text('Professional valuation report', titleX, PH - 94, { width: 220 });

  const qrX = PW - M - 76;
  const qrY = PH - 118;
  doc.roundedRect(qrX, qrY, 64, 64, 8).fill(white);
  if (opts.qrCodeDataUrl) {
    const matches = opts.qrCodeDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (matches) {
      doc.image(Buffer.from(matches[1], 'base64'), qrX + 8, qrY + 8, {
        width: 48,
        height: 48,
      });
    }
  }

  doc.addPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE HEADER (lighter — used on continuation pages)
// ─────────────────────────────────────────────────────────────────────────────
export function pdfPageHeader(doc: any, title: string, subtitle?: string) {
  doc.rect(0, 0, PAGE.width, 56).fill(COLORS.heading);
  doc.rect(0, 56, PAGE.width, 3).fill(COLORS.brand);
  doc.fontSize(9).fillColor(COLORS.brand).text('PROPMETRIK', PAGE.margin, 14);
  doc.fontSize(13).fillColor(COLORS.white).text(title, PAGE.margin, 28, { width: PAGE.contentWidth - 100 });
  if (subtitle) {
    doc.fontSize(8).fillColor(COLORS.muted).text(subtitle, PAGE.width - PAGE.margin - 140, 28, { width: 140, align: 'right' });
  }
  doc.y = 80;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HEADING
// ─────────────────────────────────────────────────────────────────────────────
export function pdfSection(doc: any, title: string) {
  ensureSpace(doc, 60);
  doc.moveDown(0.8);
  const y = doc.y;
  // Accent bar
  doc.rect(PAGE.margin, y, 4, 18).fill(COLORS.brand);
  doc.fontSize(13).fillColor(COLORS.heading).text(title.toUpperCase(), PAGE.margin + 12, y + 2);
  doc.moveDown(0.3);
  doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.margin + PAGE.contentWidth, doc.y)
    .strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.moveDown(0.6);
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARDS  (up to 4 in a row)
// ─────────────────────────────────────────────────────────────────────────────
export interface StatCard { label: string; value: string; color?: string; }

export function pdfStatCards(doc: any, stats: StatCard[]) {
  ensureSpace(doc, 70);
  const count = Math.min(stats.length, 4);
  const CW   = PAGE.contentWidth;
  const gap   = 10;
  const cardW = (CW - (count - 1) * gap) / count;
  const startY = doc.y;

  stats.slice(0, 4).forEach((s, i) => {
    const x = PAGE.margin + i * (cardW + gap);
    doc.roundedRect(x, startY, cardW, 52, 4).fillAndStroke(COLORS.lightBg, COLORS.border);
    doc.fontSize(16).fillColor(s.color || COLORS.heading)
      .text(s.value, x + 8, startY + 8, { width: cardW - 16, align: 'center' });
    doc.fontSize(8).fillColor(COLORS.muted)
      .text(s.label, x + 8, startY + 32, { width: cardW - 16, align: 'center' });
  });
  doc.y = startY + 62;
  doc.moveDown(0.3);
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY-VALUE GRID
// ─────────────────────────────────────────────────────────────────────────────
export function pdfKeyValueGrid(doc: any, pairs: [string, string][], cols = 2) {
  ensureSpace(doc, Math.ceil(pairs.length / cols) * 18 + 10);
  const colW   = PAGE.contentWidth / cols;
  const startY = doc.y;
  let maxY     = startY;

  pairs.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = PAGE.margin + col * colW;
    const y   = startY + row * 18;
    if (y > maxY) maxY = y;
    doc.fontSize(9).fillColor(COLORS.muted).text(p[0], x, y, { continued: true, width: colW - 10 });
    doc.fillColor(COLORS.heading).text('  ' + p[1]);
  });
  doc.y = maxY + 24;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────
export function pdfProgressBar(
  doc: any,
  label: string,
  value: number,
  maxVal = 100,
  width = PAGE.contentWidth,
  x     = PAGE.margin,
) {
  ensureSpace(doc, 30);
  const pct     = maxVal > 0 ? Math.min(value / maxVal, 1) : 0;
  const barH    = 12;
  const labelW  = 100;
  const barW    = width - labelW - 50;
  const y       = doc.y;

  doc.fontSize(9).fillColor(COLORS.body).text(label, x, y, { width: labelW });
  // Track
  doc.roundedRect(x + labelW + 5, y, barW, barH, 3).fill(COLORS.lightBg);
  // Fill
  const fillColor = pct >= 0.75 ? COLORS.positive : pct >= 0.4 ? COLORS.warning : COLORS.negative;
  if (pct > 0) doc.roundedRect(x + labelW + 5, y, barW * pct, barH, 3).fill(fillColor);
  // Percentage
  doc.fontSize(9).fillColor(COLORS.heading)
    .text(fmtPct(pct * 100), x + labelW + barW + 12, y, { width: 40, align: 'right' });
  doc.y = y + barH + 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE  (banded rows, dark header)
// ─────────────────────────────────────────────────────────────────────────────
export interface TableOptions {
  /** Column index from which text should be right-aligned (default: headers.length = disabled). */
  rightAlignFrom?: number;
}

export function pdfTable(
  doc: any,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  opts?: TableOptions,
) {
  ensureSpace(doc, 60);
  const rightFrom = opts?.rightAlignFrom ?? headers.length;
  const totalW    = colWidths.reduce((a, b) => a + b, 0);
  const startX    = PAGE.margin;
  const rowH      = 20;

  // Header
  let x = startX;
  const headerY = doc.y;
  doc.rect(startX, headerY - 2, totalW, rowH).fill(COLORS.tableHead);
  headers.forEach((h, i) => {
    doc.fontSize(8).fillColor(COLORS.tableHeadFg).text(h, x + 6, headerY + 3, {
      width: colWidths[i] - 12,
      align: i >= rightFrom ? 'right' : 'left',
    });
    x += colWidths[i];
  });

  let y = headerY + rowH;
  rows.forEach((row, ri) => {
    if (y > PAGE.height - 60) { doc.addPage(); y = PAGE.margin; }
    if (ri % 2 === 0) doc.rect(startX, y - 2, totalW, rowH).fill(COLORS.tableBand);
    x = startX;
    row.forEach((cell, ci) => {
      doc.fontSize(8).fillColor(COLORS.body).text(cell, x + 6, y + 3, {
        width: colWidths[ci] - 12,
        align: ci >= rightFrom ? 'right' : 'left',
      });
      x += colWidths[ci];
    });
    y += rowH;
  });
  doc.moveTo(startX, y).lineTo(startX + totalW, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.y = y + 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// INFO PANEL  (coloured box with left accent)
// ─────────────────────────────────────────────────────────────────────────────
export type InfoPanelType = 'info' | 'warning' | 'success' | 'danger';

export function pdfInfoPanel(doc: any, text: string, type: InfoPanelType = 'info') {
  ensureSpace(doc, 40);
  const colorMap: Record<InfoPanelType, [string, string]> = {
    info:    [COLORS.info,     COLORS.infoBg],
    warning: [COLORS.warning,  COLORS.warningBg],
    success: [COLORS.positive, COLORS.positiveBg],
    danger:  [COLORS.negative, COLORS.negativeBg],
  };
  const [accent, bg] = colorMap[type];
  const y = doc.y;
  doc.rect(PAGE.margin, y, PAGE.contentWidth, 28).fill(bg);
  doc.rect(PAGE.margin, y, 4, 28).fill(accent);
  doc.fontSize(9).fillColor(accent).text(text, PAGE.margin + 14, y + 8, { width: PAGE.contentWidth - 24 });
  doc.y = y + 36;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET COMPARISON BAR  (budget vs actual side-by-side)
// ─────────────────────────────────────────────────────────────────────────────
export function pdfBudgetBar(doc: any, category: string, budget: number, actual: number) {
  ensureSpace(doc, 28);
  const CW     = PAGE.contentWidth;
  const y      = doc.y;
  const barMax = CW - 200;
  const maxVal = Math.max(budget, actual, 1);

  doc.fontSize(8).fillColor(COLORS.body).text(titleCase(category), PAGE.margin, y, { width: 100 });
  // Budget bar
  doc.rect(PAGE.margin + 105, y, (budget / maxVal) * barMax, 6).fill(COLORS.info);
  // Actual bar (colour-coded)
  const aC = actual > budget ? COLORS.negative : COLORS.positive;
  doc.rect(PAGE.margin + 105, y + 8, (actual / maxVal) * barMax, 6).fill(aC);
  // Values
  doc.fontSize(7).fillColor(COLORS.muted).text(fmtGHS(budget), PAGE.margin + barMax + 112, y, { width: 80, align: 'right' });
  doc.fontSize(7).fillColor(aC).text(fmtGHS(actual), PAGE.margin + barMax + 112, y + 8, { width: 80, align: 'right' });
  doc.y = y + 22;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET LEGEND  (small colour key)
// ─────────────────────────────────────────────────────────────────────────────
export function pdfBudgetLegend(doc: any) {
  doc.fontSize(7).fillColor(COLORS.info).text('■ Budget', PAGE.margin + 105, doc.y, { continued: true });
  doc.fillColor(COLORS.positive).text('   ■ Actual (under)', { continued: true });
  doc.fillColor(COLORS.negative).text('   ■ Actual (over)');
  doc.moveDown(0.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEPARATOR LINE
// ─────────────────────────────────────────────────────────────────────────────
export function pdfSeparator(doc: any) {
  doc.moveDown(0.5);
  doc.moveTo(PAGE.margin, doc.y)
    .lineTo(PAGE.margin + PAGE.contentWidth, doc.y)
    .strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}
