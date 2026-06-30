/**
 * Professional DOCX Builder
 * 
 * Generates a professionally formatted DOCX valuation report
 * using the 'docx' npm package. Provides full control over
 * cover page, TOC, headers/footers, tables, and formatting.
 * 
 * Replaces the docxtemplater approach for the GHIS standard template.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  SectionType,
  convertInchesToTwip,
  LevelFormat,
  VerticalAlign,
  TableLayoutType,
  ImageRun,
} from 'docx';
import { ReportSectionData } from './docGenerationService';
import { logger } from '../../utils/logger';
import { htmlToDocxElements } from './htmlToDocx';

// Type for document children (paragraphs, tables)
type FileChild = Paragraph | Table;

// =====================================================
// COLOR PALETTE — matches portfolio brochure
// =====================================================
const COLORS = {
  primary: '18181B',       // zinc-900 (dark background)
  primaryLight: '27272A',  // zinc-800
  accent: 'F59E0B',       // amber-500 (brand accent)
  accentDark: 'D97706',   // amber-600
  white: 'FFFFFF',
  textDark: '18181B',     // zinc-900
  textMedium: '3F3F46',   // zinc-700
  textLight: '71717A',    // zinc-500
  border: 'E4E4E7',       // zinc-200
  borderDark: 'A1A1AA',   // zinc-400
  tableHeader: '27272A',  // zinc-800
  tableStripe: 'F4F4F5',  // zinc-100
  success: '16A34A',      // green-600
  warning: 'EA580C',      // orange-600
  danger: 'DC2626',       // red-600
  coverBg: '18181B',      // dark cover background
  coverCardBg: '27272A',  // card on cover
};

// No-border shorthand
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// =====================================================
// STYLE HELPERS
// =====================================================

function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 28, // 14pt
        font: 'Calibri',
        color: COLORS.textDark,
      }),
    ],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent },
    },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24, // 12pt
        font: 'Calibri',
        color: COLORS.textDark,
      }),
    ],
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22, // 11pt
        font: 'Calibri',
        color: COLORS.textMedium,
      }),
    ],
  });
}

function bodyText(text: string, options?: {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  keepNext?: boolean;
  keepLines?: boolean;
}): Paragraph {
  return new Paragraph({
    alignment: options?.alignment || AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 276 },
    keepNext: options?.keepNext,
    keepLines: options?.keepLines,
    children: [
      new TextRun({
        text,
        size: options?.size || 22,
        font: 'Calibri',
        bold: options?.bold,
        italics: options?.italic,
        color: COLORS.textDark,
      }),
    ],
  });
}

function emptyLine(): Paragraph {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

/** Standard cell for data tables */
function tableCell(text: string, opts?: {
  bold?: boolean;
  shading?: string;
  width?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  borders?: boolean;
  span?: number;
}): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: opts?.alignment || AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({
            text,
            bold: opts?.bold,
            size: 20,
            font: 'Calibri',
            color: opts?.shading === COLORS.tableHeader ? COLORS.white : COLORS.textDark,
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    columnSpan: opts?.span,
    ...(opts?.shading ? { shading: { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading } } : {}),
    ...(opts?.width ? { width: { size: opts.width, type: WidthType.PERCENTAGE } } : {}),
    ...(opts?.borders === false ? { borders: NO_BORDERS } : {}),
  });
}

/** Header cell (dark background, white text) */
function headerCell(text: string, opts?: {
  width?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  span?: number;
}): TableCell {
  return tableCell(text, {
    bold: true,
    shading: COLORS.tableHeader,
    width: opts?.width,
    alignment: opts?.alignment,
    span: opts?.span,
  });
}

/** Creates a simple two-column key-value table */
function keyValueTable(rows: Array<[string, string]>, labelWidth = 40): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: rows.map((row, index) =>
      new TableRow({
        children: [
          tableCell(row[0], { bold: true, width: labelWidth, shading: index % 2 === 0 ? COLORS.tableStripe : undefined }),
          tableCell(row[1], { width: 100 - labelWidth, shading: index % 2 === 0 ? COLORS.tableStripe : undefined }),
        ],
      })
    ),
  });
}

/** Dark card cell for stats on cover */
function coverCardCell(label: string, value: string, width: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        spacing: { before: 60, after: 30 },
        indent: { left: 120 },
        children: [
          new TextRun({
            text: label,
            size: 14,
            font: 'Calibri',
            color: COLORS.textLight,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        indent: { left: 120 },
        children: [
          new TextRun({
            text: value,
            size: 36,
            font: 'Calibri',
            color: COLORS.white,
            bold: true,
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: COLORS.primaryLight, fill: COLORS.primaryLight },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '3F3F46' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '3F3F46' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '3F3F46' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '3F3F46' },
    },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}


// =====================================================
// SECTION BUILDERS
// =====================================================

/**
 * Cover page: Dark background matching portfolio brochure style
 * Uses a full-page table with dark shading, amber accents,
 * PROPMETRIK branding, stats panel
 */
function buildCoverPage(data: ReportSectionData): FileChild[] {
  const cover = data.cover;
  const property = data.property;
  const valuation = data.valuation;

  const marketValue = data.transmittal?.values?.market_value?.ghs_formatted
    || valuation?.final_value_formatted || 'N/A';
  const buildingArea = property?.size_sqm
    ? `${Number(property.size_sqm).toLocaleString()} m²` : 'N/A';
  const landArea = property?.land_area_sqm
    ? `${Number(property.land_area_sqm).toLocaleString()} m²` : 'N/A';
  const reportDate = cover.date
    || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const propertyAddress = cover.property_location || property?.address || '';

  // Format property name for cover title — clean up variable-like names
  const rawTitle = property?.name || propertyAddress || 'PROPERTY VALUATION';
  const cleanTitle = rawTitle.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  // Short market value for stats card
  const numericMarketValue = valuation?.final_value
    ? `GH₵ ${Number(valuation.final_value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : marketValue;

  // Full-page dark cover table
  const coverTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      // === ROW 1: Header bar (logo + date) ===
      new TableRow({
        height: { value: convertInchesToTwip(1.0), rule: 'atLeast' as any },
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
            borders: NO_BORDERS,
            margins: { top: 200, bottom: 0, left: 200, right: 0 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: '■',
                    size: 32,
                    font: 'Calibri',
                    color: COLORS.accent,
                  }),
                  new TextRun({
                    text: '  PROPMETRIK',
                    size: 26,
                    font: 'Calibri',
                    color: COLORS.white,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { before: 20, after: 0 },
                indent: { left: 460 },
                children: [
                  new TextRun({
                    text: 'REAL ESTATE INTELLIGENCE',
                    size: 12,
                    font: 'Calibri',
                    color: COLORS.textLight,
                    characterSpacing: 120,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
            borders: NO_BORDERS,
            margins: { top: 200, bottom: 0, left: 0, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: 'DOCUMENT DATE',
                    size: 12,
                    font: 'Calibri',
                    color: COLORS.textLight,
                    characterSpacing: 60,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 40, after: 0 },
                children: [
                  new TextRun({
                    text: reportDate,
                    size: 20,
                    font: 'Calibri',
                    color: COLORS.white,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      // === ROW 2: Main title area with left amber border ===
      new TableRow({
        height: { value: convertInchesToTwip(3.5), rule: 'atLeast' as any },
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
            borders: NO_BORDERS,
            margins: { top: 400, bottom: 200, left: 200, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              // "VALUATION REPORT" label
              new Paragraph({
                spacing: { after: 40 },
                indent: { left: 400 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.accent, space: 8 },
                },
                children: [
                  new TextRun({
                    text: 'VALUATION REPORT',
                    size: 16,
                    font: 'Calibri',
                    color: COLORS.accent,
                    bold: true,
                    characterSpacing: 120,
                  }),
                ],
              }),
              // Property name as main title
              new Paragraph({
                spacing: { before: 40, after: 20 },
                indent: { left: 400 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.accent, space: 8 },
                },
                children: [
                  new TextRun({
                    text: cleanTitle.toUpperCase(),
                    size: 56,
                    font: 'Calibri',
                    color: COLORS.white,
                    bold: true,
                  }),
                ],
              }),
              // Address subtitle
              new Paragraph({
                spacing: { before: 20, after: 10 },
                indent: { left: 400 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.accent, space: 8 },
                },
                children: [
                  new TextRun({
                    text: propertyAddress,
                    size: 22,
                    font: 'Calibri',
                    color: COLORS.borderDark,
                  }),
                ],
              }),
              // Date in amber
              new Paragraph({
                spacing: { before: 10, after: 0 },
                indent: { left: 400 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.accent, space: 8 },
                },
                children: [
                  new TextRun({
                    text: reportDate,
                    size: 20,
                    font: 'Calibri',
                    color: COLORS.accent,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      // === ROW 3: Stats panel (3 glass cards) ===
      new TableRow({
        height: { value: convertInchesToTwip(1.2), rule: 'atLeast' as any },
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
            borders: NO_BORDERS,
            margins: { top: 100, bottom: 100, left: 200, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Table({
                width: { size: 90, type: WidthType.PERCENTAGE },
                alignment: AlignmentType.CENTER,
                layout: TableLayoutType.FIXED,
                rows: [
                  new TableRow({
                    children: [
                      coverCardCell('MARKET VALUE', numericMarketValue, 34),
                      new TableCell({
                        width: { size: 1, type: WidthType.PERCENTAGE },
                        shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
                        borders: NO_BORDERS,
                        children: [new Paragraph({ children: [] })],
                      }),
                      coverCardCell('BUILDING AREA', buildingArea, 32),
                      new TableCell({
                        width: { size: 1, type: WidthType.PERCENTAGE },
                        shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
                        borders: NO_BORDERS,
                        children: [new Paragraph({ children: [] })],
                      }),
                      coverCardCell('LAND AREA', landArea, 32),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      // === ROW 4: Footer (prepared for / certified by) ===
      new TableRow({
        height: { value: convertInchesToTwip(2.5), rule: 'atLeast' as any },
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
            borders: NO_BORDERS,
            margins: { top: 200, bottom: 200, left: 300, right: 0 },
            verticalAlign: VerticalAlign.BOTTOM,
            children: [
              new Paragraph({
                spacing: { after: 20 },
                children: [
                  new TextRun({
                    text: 'PREPARED FOR',
                    size: 12,
                    font: 'Calibri',
                    color: COLORS.textLight,
                    characterSpacing: 100,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 100 },
                children: [
                  new TextRun({
                    text: cover.prepared_for?.name || cover.requested_by?.name || '',
                    size: 22,
                    font: 'Calibri',
                    color: COLORS.white,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 20 },
                children: [
                  new TextRun({
                    text: 'CERTIFIED BY',
                    size: 12,
                    font: 'Calibri',
                    color: COLORS.textLight,
                    characterSpacing: 100,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 10 },
                children: [
                  new TextRun({
                    text: `Surv. ${cover.certified_by?.name || ''}`,
                    size: 22,
                    font: 'Calibri',
                    color: COLORS.white,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 10 },
                children: [
                  new TextRun({
                    text: cover.certified_by?.qualifications || '',
                    size: 16,
                    font: 'Calibri',
                    color: COLORS.borderDark,
                    italics: true,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: cover.certified_by?.license_number ? `License No: ${cover.certified_by.license_number}` : '',
                    size: 16,
                    font: 'Calibri',
                    color: COLORS.borderDark,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: COLORS.coverBg, fill: COLORS.coverBg },
            borders: NO_BORDERS,
            margins: { top: 200, bottom: 200, left: 0, right: 300 },
            verticalAlign: VerticalAlign.BOTTOM,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 20 },
                children: [
                  new TextRun({
                    text: 'GENERATED VIA PROPMETRIK',
                    size: 12,
                    font: 'Calibri',
                    color: COLORS.textLight,
                    characterSpacing: 60,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: 'Professional Valuation Services',
                    size: 14,
                    font: 'Calibri',
                    color: COLORS.borderDark,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return [coverTable];
}

/**
 * Manual Table of Contents — LibreOffice headless doesn't populate field-based TOC
 */
function buildManualTableOfContents(): FileChild[] {
  const sections = [
    { num: '1', title: 'Letter of Transmittal' },
    { num: '2', title: 'Summary of Key Data' },
    { num: '3', title: 'Property Risk Assessment' },
    { num: '4', title: 'General Introduction' },
    { num: '5', title: 'Legal Attributes' },
    { num: '6', title: 'Data Influencing Values' },
    { num: '7', title: 'Property Description' },
    { num: '8', title: 'Valuation Process' },
    { num: '9', title: 'Certification / Valuation Opinion' },
    { num: '10', title: 'Limiting Conditions & Disclaimers' },
    { num: '11', title: 'Appendices' },
  ];

  const paragraphs: FileChild[] = [
    heading1('Table of Contents'),
    emptyLine(),
  ];

  sections.forEach((section) => {
    paragraphs.push(new Paragraph({
      spacing: { after: 160 },
      indent: { left: 200 },
      children: [
        new TextRun({
          text: `${section.num}.`,
          bold: true,
          size: 24,
          font: 'Calibri',
          color: COLORS.accent,
        }),
        new TextRun({
          text: `    ${section.title}`,
          size: 24,
          font: 'Calibri',
          color: COLORS.textDark,
        }),
      ],
    }));
  });

  return paragraphs;
}

function buildTransmittalLetter(data: ReportSectionData): FileChild[] {
  const t = data.transmittal;
  const paragraphs: FileChild[] = [
    heading1('Letter of Transmittal'),
  ];

  // Recipient
  if (t?.recipient?.name) {
    paragraphs.push(bodyText(t.recipient.name, { bold: true }));
    if (t.recipient.address) paragraphs.push(bodyText(t.recipient.address));
  } else {
    paragraphs.push(bodyText('Client', { bold: true }));
  }

  // Date
  if (t?.date_formatted) {
    paragraphs.push(emptyLine());
    paragraphs.push(bodyText(t.date_formatted));
  }

  // Subject — underlined, no spacing after
  if (t?.subject) {
    paragraphs.push(emptyLine());
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 0, line: 276 },
      children: [
        new TextRun({
          text: t.subject,
          size: 22,
          font: 'Calibri',
          bold: true,
          underline: {},
          color: COLORS.textDark,
        }),
      ],
    }));
  }

  // Body — no extra empty line before (follows directly after subject)
  if (t?.body) {
    const bodyLines = t.body.split('\n').filter((l: string) => l.trim());
    bodyLines.forEach((line: string) => paragraphs.push(bodyText(line)));
  }

  // Values summary — use short numeric format (not words-in-full)
  if (t?.values) {
    paragraphs.push(emptyLine());
    paragraphs.push(bodyText('Valuation Summary', { bold: true }));

    const fmtGHS = (v: number) => `GH₵ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtUSD = (v: number) => `USD$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const valRows: Array<[string, string]> = [];
    if (t.values.market_value) {
      valRows.push(['Market Value (GH₵)', fmtGHS(t.values.market_value.ghs)]);
      valRows.push(['Market Value (USD)', fmtUSD(t.values.market_value.usd)]);
    }
    if (t.values.forced_sale_value) {
      valRows.push(['Forced Sale Value (GH₵)', fmtGHS(t.values.forced_sale_value.ghs)]);
      valRows.push(['Forced Sale Value (USD)', fmtUSD(t.values.forced_sale_value.usd)]);
    }
    if (t.exchange_rate) {
      const rateDisplay = Number(t.exchange_rate.rate).toFixed(2);
      valRows.push(['Exchange Rate', `${rateDisplay} (${t.exchange_rate.source}, ${t.exchange_rate.date})`]);
    }

    if (valRows.length > 0) {
      paragraphs.push(keyValueTable(valRows));
    }
  }

  // Methods summary
  if (t?.valuation_methods_summary) {
    paragraphs.push(emptyLine());
    paragraphs.push(bodyText(t.valuation_methods_summary));
  }

  // ---- Signature block (compact) ----
  paragraphs.push(new Paragraph({
    spacing: { before: 120, after: 60 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({ text: 'Yours faithfully,', size: 22, font: 'Calibri' }),
    ],
  }));
  // Space for e-sign signature placement
  paragraphs.push(new Paragraph({ spacing: { after: 120 }, keepNext: true, children: [] }));
  paragraphs.push(new Paragraph({
    spacing: { after: 20 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({ text: '_________________________________', size: 22, font: 'Calibri' }),
    ],
  }));
  // Space beneath signature line for permanent ID badge
  paragraphs.push(new Paragraph({ spacing: { after: 80 }, keepNext: true, children: [] }));
  if (data.cover.certified_by?.name) {
    paragraphs.push(new Paragraph({
      spacing: { after: 40 },
      keepNext: true,
      keepLines: true,
      children: [
        new TextRun({
          text: `Surv. ${data.cover.certified_by.name}`,
          bold: true,
          size: 22,
          font: 'Calibri',
        }),
      ],
    }));
  }
  if (data.cover.certified_by?.qualifications) {
    paragraphs.push(new Paragraph({
      spacing: { after: 40 },
      keepLines: true,
      children: [
        new TextRun({
          text: data.cover.certified_by.qualifications,
          italics: true,
          size: 22,
          font: 'Calibri',
        }),
      ],
    }));
  }

  return paragraphs;
}

function buildSummaryOfKeyData(data: ReportSectionData): FileChild[] {
  const property = data.property;
  const valuation = data.valuation;
  const cover = data.cover;
  const legal = data.legal;
  const engagement = data.engagement;

  const paragraphs: FileChild[] = [
    heading1('Summary of Key Data'),
    emptyLine(),
  ];

  // Property Information table
  paragraphs.push(heading2('Property Information'));
  const fmtType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const propRows: Array<[string, string]> = [
    ['Property Type', property?.type ? fmtType(property.type) : 'N/A'],
    ['Property Address', property?.address || 'N/A'],
    ['City / Region', [property?.city, property?.region].filter(Boolean).join(', ') || 'N/A'],
    ['Ghana Post Address', cover?.ghana_post_address || 'N/A'],
    ['Building Area', property?.size_sqm ? `${Number(property.size_sqm).toLocaleString()} m²` : 'N/A'],
    ['Land Area', property?.land_area_sqm ? `${Number(property.land_area_sqm).toLocaleString()} m²` : 'N/A'],
    ['Year Built', String(property?.year_built || 'N/A')],
    ['Property Condition', property?.condition || 'N/A'],
    ['Bedrooms', String(property?.bedrooms || 'N/A')],
    ['Bathrooms', String(property?.bathrooms || 'N/A')],
  ];
  paragraphs.push(keyValueTable(propRows));
  paragraphs.push(emptyLine());

  // Legal Information
  paragraphs.push(heading2('Legal Information'));
  const legalRows: Array<[string, string]> = [
    ['Tenure Type', legal?.tenure_type || 'N/A'],
    ['Lease Term', legal?.tenure_details?.lease_term_years ? `${legal.tenure_details.lease_term_years} years` : 'N/A'],
    ['Remaining Years', legal?.tenure_details?.remaining_years ? `${legal.tenure_details.remaining_years} years` : 'N/A'],
    ['Title Status', legal?.title_registration?.status || 'N/A'],
    ['Title Reference', legal?.title_registration?.reference || 'N/A'],
  ];
  paragraphs.push(keyValueTable(legalRows));
  paragraphs.push(emptyLine());

  // Engagement Details
  paragraphs.push(heading2('Engagement Details'));
  const engRows: Array<[string, string]> = [
    ['Purpose of Valuation', engagement?.purpose || valuation?.purpose || 'N/A'],
    ['Basis of Value', engagement?.basis_of_value || 'Market Value'],
    ['Valuation Date', valuation?.date || 'N/A'],
    ['Client', cover?.requested_by?.name || 'N/A'],
  ];
  paragraphs.push(keyValueTable(engRows));
  paragraphs.push(emptyLine());

  // Valuation Results
  paragraphs.push(heading2('Valuation Results'));
  const valRows: Array<[string, string]> = [
    ['Market Value (GH₵)', data.transmittal?.values?.market_value?.ghs_formatted || valuation?.final_value_formatted || 'N/A'],
    ['Market Value (USD)', data.transmittal?.values?.market_value?.usd_formatted || 'N/A'],
    ['Forced Sale Value (GH₵)', data.transmittal?.values?.forced_sale_value?.ghs_formatted || 'N/A'],
    ['Forced Sale Value (USD)', data.transmittal?.values?.forced_sale_value?.usd_formatted || 'N/A'],
    ['Primary Method', valuation?.primary_method ? fmtType(valuation.primary_method) : 'N/A'],
    ['Confidence Score', valuation?.confidence_score ? `${Math.round(valuation.confidence_score * 100)}%` : 'N/A'],
    ['Confidence Grade', valuation?.confidence_grade || 'N/A'],
  ];
  paragraphs.push(keyValueTable(valRows));

  return paragraphs;
}

function buildPropertyRiskAssessment(data: ReportSectionData): FileChild[] {
  const risk = data.riskAssessment;
  const paragraphs: FileChild[] = [
    heading1('Property Risk Assessment'),
    emptyLine(),
  ];

  if (risk?.overall_risk_level) {
    const riskColor = risk.overall_risk_level === 'Low' ? COLORS.success :
                      risk.overall_risk_level === 'Medium' ? COLORS.warning : COLORS.danger;
    paragraphs.push(new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: 'Overall Risk Level: ', size: 22, font: 'Calibri', bold: true }),
        new TextRun({ text: risk.overall_risk_level, size: 24, font: 'Calibri', bold: true, color: riskColor }),
      ],
    }));
  }

  if (risk?.items && risk.items.length > 0) {
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('Risk Factor', { width: 30 }),
          headerCell('Rating', { width: 15, alignment: AlignmentType.CENTER }),
          headerCell('Description', { width: 55 }),
        ],
      }),
      ...risk.items.map((item: any, index: number) => {
        const ratingColor = item.rating === 'Low' ? COLORS.success :
                           item.rating === 'Medium' ? COLORS.warning : COLORS.danger;
        return new TableRow({
          children: [
            tableCell(item.factor || item.name || `Risk ${index + 1}`, {
              bold: true,
              width: 30,
              shading: index % 2 === 0 ? COLORS.tableStripe : undefined,
            }),
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              shading: index % 2 === 0
                ? { type: ShadingType.SOLID, color: COLORS.tableStripe, fill: COLORS.tableStripe }
                : undefined,
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                  text: item.rating || 'N/A',
                  bold: true,
                  size: 20,
                  font: 'Calibri',
                  color: ratingColor,
                })],
              })],
            }),
            tableCell(item.description || item.comment || '', {
              width: 55,
              shading: index % 2 === 0 ? COLORS.tableStripe : undefined,
            }),
          ],
        });
      }),
    ];

    paragraphs.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows,
    }));
  } else {
    paragraphs.push(bodyText('No specific risk factors identified for this property.'));
  }

  return paragraphs;
}

function buildGeneralIntroduction(data: ReportSectionData): FileChild[] {
  const engagement = data.engagement;
  const inspection = data.inspection;

  const paragraphs: FileChild[] = [
    heading1('General Introduction'),
    emptyLine(),
  ];

  paragraphs.push(heading2('Instructions & Purpose'));
  paragraphs.push(bodyText(`The purpose of this valuation is ${engagement?.purpose || 'to determine the market value of the subject property'}.`));
  paragraphs.push(bodyText(`The basis of value adopted is ${engagement?.basis_of_value || 'Market Value'} in accordance with the International Valuation Standards (IVS).`));

  if (engagement?.special_assumptions) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Special Assumptions'));
    paragraphs.push(bodyText(engagement.special_assumptions));
  }

  if (engagement?.departures) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Departures from Standards'));
    paragraphs.push(bodyText(engagement.departures));
  }

  if (inspection) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Inspection Details'));
    const inspRows: Array<[string, string]> = [
      ['Inspection Date', inspection.inspection_date || 'N/A'],
      ['Measurement Standard', inspection.measurement_standard || 'N/A'],
      ['Areas Inspected', Array.isArray(inspection.areas_inspected) ? inspection.areas_inspected.join(', ') : (inspection.areas_inspected || 'N/A')],
    ];
    paragraphs.push(keyValueTable(inspRows));

    if (inspection.limitations) {
      paragraphs.push(emptyLine());
      paragraphs.push(heading3('Limitations'));
      paragraphs.push(bodyText(inspection.limitations));
    }
  }

  return paragraphs;
}

function buildLegalAttributes(data: ReportSectionData): FileChild[] {
  const legal = data.legal;
  const paragraphs: FileChild[] = [
    heading1('Legal Attributes'),
    emptyLine(),
  ];

  paragraphs.push(heading2('Tenure'));
  paragraphs.push(bodyText(`The property is held on ${legal?.tenure_type || 'leasehold'} tenure.`));

  if (legal?.tenure_details) {
    const tenureRows: Array<[string, string]> = [];
    if (legal.tenure_details.lease_term_years) tenureRows.push(['Original Lease Term', `${legal.tenure_details.lease_term_years} years`]);
    if (legal.tenure_details.remaining_years) tenureRows.push(['Remaining Term', `${legal.tenure_details.remaining_years} years`]);
    if (legal.tenure_details.ground_rent) tenureRows.push(['Ground Rent', legal.tenure_details.ground_rent]);
    if (legal.tenure_details.commencement_date) tenureRows.push(['Commencement Date', legal.tenure_details.commencement_date]);
    if (tenureRows.length > 0) paragraphs.push(keyValueTable(tenureRows));
  }

  paragraphs.push(emptyLine());
  paragraphs.push(heading2('Title Registration'));
  if (legal?.title_registration) {
    const titleRows: Array<[string, string]> = [
      ['Registration Status', legal.title_registration.status || 'N/A'],
      ['Reference Number', legal.title_registration.reference || 'N/A'],
    ];
    if (legal.title_registration.registered_owner) titleRows.push(['Registered Owner', legal.title_registration.registered_owner]);
    if (legal.title_registration.registration_date) titleRows.push(['Registration Date', legal.title_registration.registration_date]);
    paragraphs.push(keyValueTable(titleRows));
  }

  if (legal?.encumbrances && legal.encumbrances.length > 0) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Encumbrances'));
    legal.encumbrances.forEach((enc: any) => {
      paragraphs.push(bodyText(`• ${enc.type || enc}: ${enc.description || ''}`));
    });
  }

  return paragraphs;
}

function buildDataInfluencingValues(data: ReportSectionData): FileChild[] {
  const property = data.property;
  const externals = data.externals;

  const paragraphs: FileChild[] = [
    heading1('Data Influencing Values'),
    emptyLine(),
  ];

  paragraphs.push(heading2('Location & Neighborhood'));
  paragraphs.push(bodyText(`The subject property is located at ${property?.address || 'the specified location'}, ${property?.city || ''}, ${property?.region || ''}.`));

  if (externals?.neighborhood) {
    paragraphs.push(bodyText(externals.neighborhood));
  }

  paragraphs.push(emptyLine());
  paragraphs.push(heading2('Infrastructure & Services'));
  const serviceRows: Array<[string, string]> = [
    ['Water Supply', externals?.services?.water_supply || 'N/A'],
    ['Electricity Supply', externals?.services?.electricity_supply || 'N/A'],
    ['Sewage System', externals?.services?.sewage_system || 'N/A'],
    ['Road Access', externals?.services?.road_access || externals?.road_access || 'N/A'],
    ['Drainage', externals?.services?.drainage || externals?.drainage || 'N/A'],
  ];
  paragraphs.push(keyValueTable(serviceRows));

  if (externals?.environmental_factors) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Environmental Factors'));
    paragraphs.push(bodyText(externals.environmental_factors));
  }

  return paragraphs;
}

function buildPropertyDescription(data: ReportSectionData): FileChild[] {
  const property = data.property;
  const construction = data.construction;
  const floorPlans = data.floorPlans || [];

  const paragraphs: FileChild[] = [
    heading1('Property Description'),
    emptyLine(),
  ];

  // General Description
  paragraphs.push(heading2('General'));
  const fmtType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const descRows: Array<[string, string]> = [
    ['Property Type', property?.type ? fmtType(property.type) : 'N/A'],
    ['Building Area', property?.size_sqm ? `${Number(property.size_sqm).toLocaleString()} m²` : 'N/A'],
    ['Land Area', property?.land_area_sqm ? `${Number(property.land_area_sqm).toLocaleString()} m²` : 'N/A'],
    ['Year Built / Age', property?.year_built ? `${property.year_built}` : (construction?.age_years ? `${construction.age_years} years` : 'N/A')],
    ['Condition', property?.condition || construction?.condition || 'N/A'],
  ];
  paragraphs.push(keyValueTable(descRows));
  paragraphs.push(emptyLine());

  // Construction Details
  paragraphs.push(heading2('Construction Details'));
  const constRows: Array<[string, string]> = [
    ['Structure Type', construction?.structure_type || 'N/A'],
    ['Walls', construction?.walls || 'N/A'],
    ['Roofing', construction?.roofing || 'N/A'],
    ['Flooring', construction?.flooring || 'N/A'],
    ['Ceiling', construction?.ceiling || 'N/A'],
    ['Windows', construction?.windows || 'N/A'],
    ['Doors', construction?.doors || 'N/A'],
  ];
  paragraphs.push(keyValueTable(constRows));

  // Schedule of Accommodation
  if (floorPlans.length > 0) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Schedule of Accommodation'));

    const accommodationRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('Floor', { width: 20 }),
          headerCell('Room / Area', { width: 30 }),
          headerCell('Dimensions', { width: 25, alignment: AlignmentType.CENTER }),
          headerCell('Area (m²)', { width: 25, alignment: AlignmentType.CENTER }),
        ],
      }),
    ];

    let totalArea = 0;
    let rowIndex = 0;
    floorPlans.forEach((fp: any) => {
      const rooms = fp.rooms || [];
      rooms.forEach((room: any) => {
        const area = parseFloat(room.area_sqm || room.area || 0);
        totalArea += area;
        const width = room.width_m || room.width || Math.sqrt(area).toFixed(1);
        const length = room.length_m || room.length || Math.sqrt(area).toFixed(1);

        accommodationRows.push(new TableRow({
          children: [
            tableCell(fp.floor_label || `Floor ${fp.floor_number}`, {
              width: 20,
              shading: rowIndex % 2 === 0 ? COLORS.tableStripe : undefined,
            }),
            tableCell(room.name || room.room_type || 'Room', {
              width: 30,
              shading: rowIndex % 2 === 0 ? COLORS.tableStripe : undefined,
            }),
            tableCell(`${width} × ${length}`, {
              width: 25,
              alignment: AlignmentType.CENTER,
              shading: rowIndex % 2 === 0 ? COLORS.tableStripe : undefined,
            }),
            tableCell(area.toFixed(2), {
              width: 25,
              alignment: AlignmentType.CENTER,
              shading: rowIndex % 2 === 0 ? COLORS.tableStripe : undefined,
            }),
          ],
        }));
        rowIndex++;
      });
    });

    // Total row
    accommodationRows.push(new TableRow({
      children: [
        tableCell('TOTAL', { bold: true, span: 3, shading: COLORS.tableHeader }),
        tableCell(totalArea.toFixed(2), { bold: true, shading: COLORS.tableHeader, alignment: AlignmentType.CENTER }),
      ],
    }));

    paragraphs.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: accommodationRows,
    }));
  }

  return paragraphs;
}

function buildValuationProcess(data: ReportSectionData): FileChild[] {
  const valuation = data.valuation;
  const methods = data.methods || [];

  const paragraphs: FileChild[] = [
    heading1('Valuation Process'),
    emptyLine(),
  ];

  paragraphs.push(heading2('Methodology'));
  paragraphs.push(bodyText(
    `The valuation has been carried out using ${methods.length > 1 ? 'multiple approaches' : 'the following approach'} in accordance with the International Valuation Standards (IVS) and the standards of the Ghana Institution of Surveyors (GhIS).`
  ));
  paragraphs.push(emptyLine());

  // Methods table
  if (methods.length > 0) {
    paragraphs.push(heading2('Valuation Methods Applied'));

    const methodRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('Method', { width: 30 }),
          headerCell('Value', { width: 25, alignment: AlignmentType.CENTER }),
          headerCell('Weight', { width: 20, alignment: AlignmentType.CENTER }),
          headerCell('Confidence', { width: 25, alignment: AlignmentType.CENTER }),
        ],
      }),
    ];

    methods.forEach((m: any, index: number) => {
      // Format value properly — ensure GHS prefix and comma formatting
      let formattedValue = m.value_formatted || 'N/A';
      if (m.value && (!formattedValue || formattedValue === 'N/A')) {
        formattedValue = `GHS ${Number(m.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      methodRows.push(new TableRow({
        children: [
          tableCell(m.name || 'Unknown', {
            bold: true,
            width: 30,
            shading: index % 2 === 0 ? COLORS.tableStripe : undefined,
          }),
          tableCell(formattedValue, {
            width: 25,
            alignment: AlignmentType.CENTER,
            shading: index % 2 === 0 ? COLORS.tableStripe : undefined,
          }),
          tableCell(m.weight ? `${Math.round(m.weight * 100)}%` : 'N/A', {
            width: 20,
            alignment: AlignmentType.CENTER,
            shading: index % 2 === 0 ? COLORS.tableStripe : undefined,
          }),
          tableCell(m.confidence ? `${Math.round(m.confidence * 100)}%` : 'N/A', {
            width: 25,
            alignment: AlignmentType.CENTER,
            shading: index % 2 === 0 ? COLORS.tableStripe : undefined,
          }),
        ],
      }));
    });

    paragraphs.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: methodRows,
    }));
    paragraphs.push(emptyLine());
  }

  // Weight Rationale — from user's reconciliation notes
  if (data.weightingRationale) {
    paragraphs.push(heading2('Weight Rationale'));
    // Split on the auto-generated delimiter and show only the user's notes
    const rationale = data.weightingRationale.split('--- AUTO-GENERATED NARRATIVE ---')[0].trim();
    if (rationale) {
      paragraphs.push(bodyText(rationale));
    }
    paragraphs.push(emptyLine());
  }

  // Final Value
  paragraphs.push(heading2('Reconciled Value'));
  paragraphs.push(bodyText(
    `After due consideration of all relevant factors and the results of the methods applied, the market value of the subject property is estimated at ${valuation?.final_value_formatted || 'N/A'}.`
  ));
  if (valuation?.confidence_grade) {
    paragraphs.push(bodyText(`Confidence Grade: ${valuation.confidence_grade} (${valuation.confidence_score ? Math.round(valuation.confidence_score * 100) : 'N/A'}%)`));
  }
  paragraphs.push(emptyLine());

  return paragraphs;
}

/**
 * Certification section — signature block kept together via keepNext/keepLines
 */
function buildCertification(data: ReportSectionData): FileChild[] {
  const cover = data.cover;
  const valuation = data.valuation;
  const certification = data.certification;

  const paragraphs: FileChild[] = [
    heading1('Certification / Valuation Opinion'),
    emptyLine(),
  ];

  // Certification text paragraphs
  paragraphs.push(bodyText(
    certification?.certification_text ||
    `This is to certify that I have inspected the subject property situated at ${data.property?.address || 'the specified location'} and that all findings, statements and opinions submitted in this report are correct to the best of my knowledge.`
  ));
  paragraphs.push(emptyLine());

  paragraphs.push(bodyText(
    certification?.disclosure ||
    'I again deem it fit to disclose that, I have no present or prospective interest in the subject hereditament.'
  ));
  paragraphs.push(emptyLine());

  paragraphs.push(bodyText(
    certification?.standards_compliance ||
    'I further certify that the appraisal has been made in conformity with the professional standards of the Ghana Institution of Surveyors (GhIS) and the International Valuation Standards (IVS), of which the undersigned is a member in good standing.'
  ));
  paragraphs.push(emptyLine());

  paragraphs.push(bodyText(
    `In this instance, having inspected, examined and analysed available data, it is my well-considered opinion that the subject property in its present condition as at ${valuation?.date || 'the valuation date'} is estimated to be worth as follows:`,
    { keepNext: true }
  ));
  paragraphs.push(emptyLine());

  // Value table
  const valueTable = new Table({
    width: { size: 80, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('DESCRIPTION', { width: 40 }),
          headerCell('AMOUNT (GH₵)', { width: 30, alignment: AlignmentType.CENTER }),
          headerCell('AMOUNT (USD)', { width: 30, alignment: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          tableCell('MARKET VALUE OF PROPERTY', { bold: true, width: 40 }),
          tableCell(data.transmittal?.values?.market_value?.ghs_formatted || valuation?.final_value_formatted || 'N/A', {
            width: 30, alignment: AlignmentType.CENTER,
          }),
          tableCell(data.transmittal?.values?.market_value?.usd_formatted || 'N/A', {
            width: 30, alignment: AlignmentType.CENTER,
          }),
        ],
      }),
      new TableRow({
        children: [
          tableCell('FORCED SALE VALUE', { bold: true, width: 40, shading: COLORS.tableStripe }),
          tableCell(data.transmittal?.values?.forced_sale_value?.ghs_formatted || 'N/A', {
            width: 30, alignment: AlignmentType.CENTER, shading: COLORS.tableStripe,
          }),
          tableCell(data.transmittal?.values?.forced_sale_value?.usd_formatted || 'N/A', {
            width: 30, alignment: AlignmentType.CENTER, shading: COLORS.tableStripe,
          }),
        ],
      }),
    ],
  });
  paragraphs.push(valueTable);
  paragraphs.push(emptyLine());

  // Exchange rate
  if (data.transmittal?.exchange_rate) {
    paragraphs.push(bodyText(
      `On the date of valuation, the GH Cedi to US Dollar exchange rate is: ${Number(data.transmittal.exchange_rate.rate).toFixed(2)}`,
      { italic: true, keepNext: true }
    ));
    paragraphs.push(bodyText(
      `*Source: ${data.transmittal.exchange_rate.source}, as at ${data.transmittal.exchange_rate.date}.`,
      { italic: true, size: 18 }
    ));
  }

  // =========================================================
  // SIGNATURE BLOCK — Must stay together on same page
  // =========================================================
  paragraphs.push(new Paragraph({
    spacing: { before: 300, after: 80 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({ text: 'CERTIFIED BY:', bold: true, size: 22, font: 'Calibri' }),
    ],
  }));

  // Double space for e-sign signature placement
  paragraphs.push(new Paragraph({ spacing: { after: 200 }, keepNext: true, children: [] }));
  paragraphs.push(new Paragraph({ spacing: { after: 200 }, keepNext: true, children: [] }));

  // Signature dots
  paragraphs.push(new Paragraph({
    spacing: { before: 0, after: 40 },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({
        text: '....................................................................',
        size: 22,
        font: 'Calibri',
      }),
    ],
  }));

  // Space beneath signature line for permanent ID badge
  paragraphs.push(new Paragraph({ spacing: { after: 200 }, keepNext: true, children: [] }));

  // Valuer name + qualifications
  if (cover.certified_by?.name) {
    paragraphs.push(new Paragraph({
      spacing: { after: 40 },
      keepNext: true,
      keepLines: true,
      children: [
        new TextRun({
          text: `SURV. ${cover.certified_by.name.toUpperCase()}`,
          bold: true,
          size: 22,
          font: 'Calibri',
        }),
        ...(cover.certified_by.qualifications ? [
          new TextRun({
            text: ` (${cover.certified_by.qualifications})`,
            bold: true,
            size: 22,
            font: 'Calibri',
          }),
        ] : []),
      ],
    }));
  }

  if (cover.certified_by?.title) {
    paragraphs.push(new Paragraph({
      spacing: { after: 40 },
      keepNext: true,
      keepLines: true,
      children: [
        new TextRun({
          text: `(${cover.certified_by.title.toUpperCase()})`,
          size: 22,
          font: 'Calibri',
        }),
      ],
    }));
  }

  if (cover.certified_by?.license_number) {
    paragraphs.push(new Paragraph({
      spacing: { after: 40 },
      keepLines: true,
      children: [
        new TextRun({
          text: `License No: ${cover.certified_by.license_number}`,
          size: 22,
          font: 'Calibri',
        }),
      ],
    }));
  }

  return paragraphs;
}

function buildLimitingConditions(data: ReportSectionData): FileChild[] {
  const disclaimers = data.disclaimers;

  const paragraphs: FileChild[] = [
    heading1('Limiting Conditions & Disclaimers'),
    emptyLine(),
  ];

  if (disclaimers?.conditions && Array.isArray(disclaimers.conditions)) {
    disclaimers.conditions.forEach((condition: string, index: number) => {
      paragraphs.push(new Paragraph({
        spacing: { after: 120, line: 276 },
        indent: { left: 360, hanging: 360 },
        children: [
          new TextRun({ text: `${index + 1}. `, bold: true, size: 22, font: 'Calibri', color: COLORS.textDark }),
          new TextRun({ text: condition, size: 22, font: 'Calibri', color: COLORS.textDark }),
        ],
      }));
    });
  } else if (disclaimers?.conditions && typeof disclaimers.conditions === 'string') {
    paragraphs.push(bodyText(disclaimers.conditions));
  } else {
    // No disclaimers provided — this should not happen as reportDataService always provides them.
    paragraphs.push(bodyText('Limiting conditions and disclaimers as per the valuation engagement terms apply.'));
  }

  if (disclaimers?.standards_references) {
    paragraphs.push(emptyLine());
    paragraphs.push(heading2('Standards References'));
    if (Array.isArray(disclaimers.standards_references)) {
      disclaimers.standards_references.forEach((ref: any) => {
        // standards_references are { code, name, year } objects — render their text,
        // not the object itself (which printed "[object Object]").
        const text = typeof ref === 'string'
          ? ref
          : [ref?.code, ref?.name].filter(Boolean).join(' — ') + (ref?.year ? ` (${ref.year})` : '');
        if (text.trim()) paragraphs.push(bodyText(`• ${text}`));
      });
    } else {
      paragraphs.push(bodyText(String(disclaimers.standards_references)));
    }
  }

  return paragraphs;
}

/**
 * Appendices with embedded floor plan images from MinIO
 */
function buildAppendices(data: ReportSectionData): FileChild[] {
  const paragraphs: FileChild[] = [
    heading1('Appendices'),
    emptyLine(),
  ];

  // Appendix A: Schedule of Accommodation (per-room — matches the report viewer).
  // The per-room schedule used to live in property_description, but editor content
  // overrides that section so it vanished from the signed PDF. Render it here so it
  // always appears and mirrors what the valuer reviewed in the viewer.
  const accFloorPlans = data.floorPlans || [];
  if (accFloorPlans.some((fp: any) => (fp.rooms || []).length > 0)) {
    paragraphs.push(heading2('Appendix A: Schedule of Accommodation'));
    const accRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('Floor', { width: 25 }),
          headerCell('Room', { width: 50 }),
          headerCell('Area (m²)', { width: 25, alignment: AlignmentType.CENTER }),
        ],
      }),
    ];
    let accTotal = 0;
    accFloorPlans.forEach((fp: any) => {
      (fp.rooms || []).forEach((room: any, idx: number) => {
        const area = parseFloat(room.area_sqm || room.area || 0) || 0;
        accTotal += area;
        accRows.push(new TableRow({
          children: [
            tableCell(idx === 0 ? (fp.floor_label || `Floor ${fp.floor_number}`) : '', { width: 25 }),
            tableCell(room.name || room.room_type || 'Room', { width: 50 }),
            tableCell(area.toFixed(2), { width: 25, alignment: AlignmentType.CENTER }),
          ],
        }));
      });
    });
    accRows.push(new TableRow({
      children: [
        tableCell('TOTAL GROSS FLOOR AREA', { bold: true, span: 2, shading: COLORS.tableHeader }),
        tableCell(`${accTotal.toFixed(2)} sqm`, { bold: true, shading: COLORS.tableHeader, alignment: AlignmentType.CENTER }),
      ],
    }));
    paragraphs.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: accRows,
    }));
    paragraphs.push(emptyLine());
  }

  // Appendix B: Floor Plans with embedded images
  const floorPlanImages = data.floorPlanImages || [];
  if (floorPlanImages.length > 0 || (data.floorPlans && data.floorPlans.length > 0)) {
    paragraphs.push(heading2('Appendix B: Floor Plans'));

    if (floorPlanImages.length > 0) {
      floorPlanImages.forEach((fp) => {
        paragraphs.push(heading3(fp.label));
        if (fp.area) {
          paragraphs.push(bodyText(`Gross Building Area: ${fp.area}`, { keepNext: true }));
        }

        // Embed the actual floor plan image
        if (fp.imageBuffer && fp.imageBuffer.length > 0) {
          try {
            // Fit within page: ~6 inches wide, ~7 inches tall max
            const maxWidthPx = 570;
            const maxHeightPx = 700;
            let imgWidth = maxWidthPx;
            let imgHeight = Math.round(maxHeightPx * 0.6);

            // Read PNG dimensions from header if available
            if (fp.imageBuffer[0] === 0x89 && fp.imageBuffer[1] === 0x50 && fp.imageBuffer.length > 24) {
              const pngWidth = fp.imageBuffer.readUInt32BE(16);
              const pngHeight = fp.imageBuffer.readUInt32BE(20);
              if (pngWidth > 0 && pngHeight > 0) {
                const ratio = Math.min(maxWidthPx / pngWidth, maxHeightPx / pngHeight);
                imgWidth = Math.round(pngWidth * ratio);
                imgHeight = Math.round(pngHeight * ratio);
              }
            }

            paragraphs.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 200 },
              children: [
                new ImageRun({
                  data: fp.imageBuffer,
                  transformation: {
                    width: imgWidth,
                    height: imgHeight,
                  },
                  type: 'png',
                }),
              ],
            }));
            logger.info('Embedded floor plan image', { label: fp.label, width: imgWidth, height: imgHeight, bufferSize: fp.imageBuffer.length });
          } catch (imgErr: any) {
            logger.warn('Failed to embed floor plan image', { label: fp.label, error: imgErr.message });
            paragraphs.push(bodyText('[Floor plan image could not be embedded]', { italic: true }));
          }
        }
        paragraphs.push(emptyLine());
      });
    } else {
      // Fallback: just list floor plan info without images
      data.floorPlans!.forEach((fp: any) => {
        paragraphs.push(heading3(fp.floor_label || `Floor ${fp.floor_number}`));
        if (fp.gross_building_area_sqm) {
          paragraphs.push(bodyText(`Gross Building Area: ${Number(fp.gross_building_area_sqm).toFixed(2)} m²`));
        }
        paragraphs.push(emptyLine());
      });
    }
  }

  // ── Appendices C/D/E — embedded valuation documents (location map / pictures / title docs) ──
  const docImages = (data as any).documentImages as Array<{ docType: string; caption: string | null; mime: string; buffer: Buffer }> | undefined || [];
  const mapDocs = docImages.filter((d) => d.docType === 'location_map');
  const photoDocs = docImages.filter((d) => d.docType === 'photo');
  const titleDocs = docImages.filter((d) => d.docType === 'title_document');

  const embedImg = (img: { buffer: Buffer; mime: string }, maxW = 560, maxH = 680): Paragraph => {
    let w = maxW;
    let h = Math.round(maxH * 0.66);
    const buf = img.buffer;
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) { // PNG header → real dimensions
      const pw = buf.readUInt32BE(16);
      const ph = buf.readUInt32BE(20);
      if (pw > 0 && ph > 0) { const r = Math.min(maxW / pw, maxH / ph); w = Math.round(pw * r); h = Math.round(ph * r); }
    }
    const type = (img.mime || '').includes('png') ? 'png' : 'jpg';
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 160 },
      children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: type as any })],
    });
  };
  const caption = (text: string): Paragraph => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 140 },
    children: [new TextRun({ text, italics: true, size: 18, font: 'Calibri', color: COLORS.textLight })],
  });

  // Appendix C: Satellite / Location Map
  paragraphs.push(heading2('Appendix C: Satellite / Location Map'));
  if (mapDocs.length > 0) {
    mapDocs.forEach((m) => paragraphs.push(embedImg(m)));
  } else {
    paragraphs.push(bodyText('A location map showing the subject property and surrounding area is available upon request.'));
  }
  paragraphs.push(emptyLine());

  // Appendix D: Pictures
  if (photoDocs.length > 0) {
    paragraphs.push(heading2('Appendix D: Pictures'));
    let plate = 1;
    photoDocs.forEach((p) => {
      paragraphs.push(embedImg(p, 520, 420));
      paragraphs.push(caption(`Plate ${plate++}${p.caption ? ': ' + p.caption : ''}`));
    });
    paragraphs.push(emptyLine());
  }

  // Appendix E: Title Documents / Indenture
  if (titleDocs.length > 0) {
    paragraphs.push(heading2('Appendix E: Title Documents / Indenture'));
    titleDocs.forEach((t) => {
      paragraphs.push(embedImg(t, 560, 700));
      if (t.caption) paragraphs.push(caption(t.caption));
    });
  }

  return paragraphs;
}


// =====================================================
// =====================================================
// SECTION JOINING — uses pageBreakBefore on first paragraph
// of each section to avoid blank-page gaps.
// =====================================================

/**
 * Join multiple content section arrays into a single children array.
 * Instead of inserting a Paragraph(PageBreak) between sections (which creates
 * blank pages when the prior section already fills the page), this inserts a
 * zero-height spacer with `pageBreakBefore: true` — a DOCX directive meaning
 * "ensure this paragraph starts on a fresh page" without adding an extra page
 * if we're already at a page boundary.
 */
function joinSectionsWithPageBreaks(sections: FileChild[][]): FileChild[] {
  const result: FileChild[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section || section.length === 0) continue;

    if (i > 0 && result.length > 0) {
      // Insert a page-break-before spacer that won't create blank pages
      result.push(new Paragraph({
        pageBreakBefore: true,
        spacing: { before: 0, after: 0, line: 0 },
        children: [],
      }));
    }

    result.push(...section);
  }

  return result;
}

// =====================================================
// MAIN BUILDER FUNCTION
// =====================================================

export async function buildProfessionalDocx(data: ReportSectionData): Promise<Buffer> {
  logger.info('Building professional DOCX report');

  // Helper: get saved TipTap HTML for a section, convert to DOCX elements
  const editorMap = new Map<string, string>();
  if (data.editorSections && data.editorSections.length > 0) {
    for (const s of data.editorSections) {
      editorMap.set(s.id, s.content);
    }
    logger.info('Using saved TipTap editor content for DOCX sections', {
      availableSections: Array.from(editorMap.keys()),
    });
  }

  /**
   * Resolve a section: if saved TipTap HTML exists, convert it;
   * otherwise fall back to the programmatic builder.
   * Cover page and TOC always use the programmatic builder (layout-sensitive).
   */
  function resolveSection(editorId: string, programmaticBuilder: () => FileChild[]): FileChild[] {
    const html = editorMap.get(editorId);
    if (html && html.trim().length > 20) {
      // Use saved editor content
      const elements = htmlToDocxElements(html);
      if (elements.length > 0) {
        logger.info(`Section "${editorId}": using saved TipTap editor content (${elements.length} elements)`);
        return elements;
      }
    }
    // Fall back to programmatic builder
    logger.info(`Section "${editorId}": using programmatic builder (no editor content)`);
    return programmaticBuilder();
  }

  // Cover page and TOC always use programmatic builders (layout-sensitive)
  const coverPageContent = buildCoverPage(data);
  const tocContent = buildManualTableOfContents();

  // All content sections: prefer saved TipTap editor content, fall back to programmatic
  const transmittalContent = resolveSection('transmittal_letter', () => buildTransmittalLetter(data));
  const summaryContent = resolveSection('summary_key_data', () => buildSummaryOfKeyData(data));
  const riskContent = resolveSection('property_risk_assessment', () => buildPropertyRiskAssessment(data));
  const introContent = resolveSection('general_introduction', () => buildGeneralIntroduction(data));
  const legalContent = resolveSection('legal_attributes', () => buildLegalAttributes(data));
  const dataInflContent = resolveSection('data_influencing_values', () => buildDataInfluencingValues(data));
  const propDescContent = resolveSection('property_description', () => buildPropertyDescription(data));
  const valuationContent = resolveSection('valuation_process', () => buildValuationProcess(data));
  const certContent = resolveSection('valuation_opinion', () => buildCertification(data));
  const limitingContent = resolveSection('limiting_conditions', () => buildLimitingConditions(data));
  // Appendices ALWAYS uses programmatic builder — it embeds actual floor plan images
  // from MinIO which cannot be represented via HTML <img> tags in DOCX
  const appendicesContent = buildAppendices(data);

  // Shared header for content pages
  const contentHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'PROPMETRIK', bold: true, size: 16, font: 'Calibri', color: COLORS.textLight }),
          new TextRun({ text: '  |  VALUATION REPORT', size: 16, font: 'Calibri', color: COLORS.textLight }),
        ],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.accent },
        },
      }),
    ],
  });

  // Shared footer for content pages
  const contentFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
        },
        spacing: { before: 100 },
        children: [
          new TextRun({ text: 'CONFIDENTIAL', size: 14, font: 'Calibri', color: COLORS.textLight, characterSpacing: 100 }),
          new TextRun({ text: '    |    Page ', size: 14, font: 'Calibri', color: COLORS.textLight }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Calibri', color: COLORS.textLight }),
          new TextRun({ text: ' of ', size: 14, font: 'Calibri', color: COLORS.textLight }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: 'Calibri', color: COLORS.textLight }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: 'PROPMETRIK Valuation System',
    title: data.cover?.title || 'Valuation Report',
    description: `Professional valuation report for ${data.property?.address || 'property'}`,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: COLORS.textDark },
          paragraph: { spacing: { line: 276 } },
        },
        heading1: {
          run: { font: 'Calibri', size: 28, bold: true, color: COLORS.textDark },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        heading2: {
          run: { font: 'Calibri', size: 24, bold: true, color: COLORS.textDark },
          paragraph: { spacing: { before: 300, after: 150 } },
        },
        heading3: {
          run: { font: 'Calibri', size: 22, bold: true, color: COLORS.textMedium },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      // === SECTION 1: COVER PAGE (zero margins for full-bleed) ===
      {
        properties: {
          page: {
            margin: {
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            },
            pageNumbers: { start: 0 },
          },
          titlePage: true,
        },
        headers: {
          default: new Header({ children: [] }),
          first: new Header({ children: [] }),
        },
        footers: {
          default: new Footer({ children: [] }),
          first: new Footer({ children: [] }),
        },
        children: coverPageContent,
      },

      // === SECTION 2: TABLE OF CONTENTS ===
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1.2),
            },
            pageNumbers: { start: 1 },
          },
        },
        headers: { default: contentHeader },
        footers: { default: contentFooter },
        children: tocContent,
      },

      // === SECTION 3: ALL CONTENT SECTIONS ===
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1.2),
            },
          },
        },
        headers: { default: contentHeader },
        footers: { default: contentFooter },
        children: joinSectionsWithPageBreaks([
          transmittalContent,
          summaryContent,
          riskContent,
          introContent,
          legalContent,
          dataInflContent,
          propDescContent,
          valuationContent,
          certContent,
          limitingContent,
          appendicesContent,
        ]),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  logger.info('Professional DOCX built successfully', { size: buffer.length });
  return Buffer.from(buffer);
}
