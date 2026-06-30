/**
 * HTML to DOCX Converter
 * 
 * Converts TipTap editor HTML content into docx-compatible Paragraph/Table arrays.
 * This bridges the gap between the TipTap editor (HTML) and the DOCX builder (docx npm package).
 * 
 * Used by buildProfessionalDocx() to render user-edited report content
 * instead of programmatically building each section from raw data.
 */

import * as cheerio from 'cheerio';
import {
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  TableLayoutType,
} from 'docx';

type FileChild = Paragraph | Table;

// =====================================================
// COLOR PALETTE — matches professionalDocxBuilder
// =====================================================
const COLORS = {
  textDark: '18181B',
  textMedium: '3F3F46',
  textLight: '71717A',
  border: 'E4E4E7',
  // PropMetrik brand — deep amber table headers (white text) instead of near-black.
  tableHeader: 'B45309',
  tableStripe: 'F4F4F5',
  accent: 'F59E0B',
  white: 'FFFFFF',
};

/**
 * Convert a TipTap HTML section content string into an array of DOCX FileChild elements.
 * Handles: <h1>-<h3>, <p>, <ul>/<ol>/<li>, <table>, <strong>, <em>, <br/>, <u>
 */
export function htmlToDocxElements(html: string): FileChild[] {
  if (!html || html.trim() === '') {
    return [];
  }

  const $ = cheerio.load(html, { xmlMode: false });
  const result: FileChild[] = [];
  const body = $('body');

  body.contents().each((_index: any, node: any) => {
    const elements = processNode($, node);
    result.push(...elements);
  });

  return result;
}

/**
 * Process a single top-level DOM node into DOCX elements.
 */
function processNode($: any, node: any): FileChild[] {
  if (node.type === 'text') {
    const text = (node.data || '').trim();
    if (!text) return [];
    return [bodyParagraph([{ text, bold: false, italic: false, underline: false }])];
  }

  if (node.type !== 'tag') return [];

  const el = $(node);
  const tagName = (node.tagName || node.name || '').toLowerCase();

  switch (tagName) {
    case 'h1':
      return [headingFromElement($, el, HeadingLevel.HEADING_1)];
    case 'h2':
      return [headingFromElement($, el, HeadingLevel.HEADING_2)];
    case 'h3':
      return [headingFromElement($, el, HeadingLevel.HEADING_3)];
    case 'h4':
      return [headingFromElement($, el, HeadingLevel.HEADING_4)];
    case 'p':
      return processParagraph($, el);
    case 'ul':
      return processListItems($, el, false);
    case 'ol':
      return processListItems($, el, true);
    case 'table':
      return [processTable($, el)];
    case 'blockquote':
      return processBlockquote($, el);
    case 'div':
      return processChildNodes($, el);
    case 'br':
      return [new Paragraph({ children: [] })];
    default:
      return processParagraph($, el);
  }
}

/**
 * Build a heading paragraph from an HTML element.
 */
function headingFromElement($: any, el: any, level: any): Paragraph {
  const style = el.attr('style') || '';
  const hasUnderline = /text-decoration\s*:\s*underline/i.test(style);
  const parentStyle: InlineStyle = { bold: false, italic: false, underline: hasUnderline };
  const runs = extractTextRuns($, el, parentStyle);
  const alignment = parseAlignment(style);
  const spacing = parseSpacing(style, { before: 300, after: 150 });

  return new Paragraph({
    heading: level,
    alignment,
    spacing,
    children: runs,
  });
}

/**
 * Process a <p> element into Paragraphs.
 */
function processParagraph($: any, el: any): Paragraph[] {
  const style = el.attr('style') || '';
  const alignment = parseAlignment(style);
  const hasUnderline = /text-decoration\s*:\s*underline/i.test(style);
  const parentStyle: InlineStyle = { bold: false, italic: false, underline: hasUnderline };
  const runs = extractTextRuns($, el, parentStyle);
  const spacing = parseSpacing(style, { before: 60, after: 60 });

  // If the only content is &nbsp;, return an empty spacer paragraph.
  // keepNext so a blank line can't be the orphan that triggers a page break
  // inside a signature/certification block.
  const textContent = el.text().trim();
  if (textContent === '' || textContent === '\u00a0') {
    return [new Paragraph({ children: [], spacing: { before: 100, after: 100 }, keepNext: true })];
  }

  // Keep the signature/certification block together (CERTIFIED BY \u2192 signature line \u2192
  // valuer name / GhIS no. / firm) so the signee details don't spill onto a new page.
  const isSignatureLine =
    textContent.length <= 140 &&
    /(CERTIFIED BY|PREPARED BY|\.{8,}|_{8,}|SURV\.|GhIS|Registration No|License No|Firm:|\(SR\.)/i.test(textContent);

  return [new Paragraph({
    alignment,
    spacing,
    children: runs,
    ...(isSignatureLine ? { keepNext: true, keepLines: true } : {}),
  })];
}

/**
 * Process <ul>/<ol> list items.
 */
function processListItems($: any, listEl: any, ordered: boolean): Paragraph[] {
  const items: Paragraph[] = [];
  let index = 1;

  listEl.children('li').each((_i: any, li: any) => {
    const liEl = $(li);
    const runs = extractTextRuns($, liEl);
    const prefix = ordered ? `${index}. ` : '\u2022 ';
    index++;

    items.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        indent: { left: 720 },
        children: [
          new TextRun({ text: prefix, font: 'Times New Roman', size: 22, color: COLORS.textDark }),
          ...runs,
        ],
      })
    );
  });

  return items;
}

/**
 * Process an HTML <table> into a DOCX Table.
 */
function processTable($: any, tableEl: any): Table {
  const rows: TableRow[] = [];
  let isFirstRow = true;

  const trElements: any[] = [];
  tableEl.find('tr').each((_i: any, tr: any) => {
    trElements.push(tr);
  });

  const firstTr = trElements[0];
  const colCount = firstTr ? $(firstTr).children('td, th').length : 5;

  for (const tr of trElements) {
    const trEl = $(tr);
    const cells: TableCell[] = [];
    const isHeader = isFirstRow || trEl.children('th').length > 0;
    const rowBg = parseBackgroundColor(trEl.attr('style'));

    trEl.children('td, th').each((_j: any, cell: any) => {
      const cellEl = $(cell);
      const cellAlignment = parseAlignment(cellEl.attr('style')) || (isHeader ? AlignmentType.CENTER : AlignmentType.LEFT);
      const cellBg = parseBackgroundColor(cellEl.attr('style')) || rowBg;

      // Handle colspan
      const colspanAttr = cellEl.attr('colspan');
      const colSpan = colspanAttr ? parseInt(colspanAttr, 10) : 1;

      // Extract text runs with appropriate color for header vs body. Body cells honour an inline
      // `color:`/`font-weight:` (e.g. the green/red sensitivity Impact column).
      const cellStyleStr = cellEl.attr('style');
      const cellTextColor = parseTextColor(cellStyleStr) || undefined;
      const cellRuns = isHeader
        ? extractTextRuns($, cellEl, { bold: true, italic: false, underline: false, color: COLORS.white })
        : extractTextRuns($, cellEl, { bold: isBoldStyle(cellStyleStr), italic: false, underline: false, color: cellTextColor });

      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              alignment: cellAlignment,
              spacing: { before: 40, after: 40 },
              children: cellRuns.length > 0
                ? cellRuns
                : [new TextRun({ text: '', font: 'Times New Roman', size: 20 })],
            }),
          ],
          columnSpan: colSpan > 1 ? colSpan : undefined,
          shading: isHeader
            ? { type: ShadingType.SOLID, color: COLORS.tableHeader }
            : (cellBg ? { type: ShadingType.SOLID, color: cellBg } : undefined),
          verticalAlign: 'center' as any,
          width: _j === 0
            ? { size: 50, type: WidthType.PERCENTAGE }
            : { size: Math.floor(50 / Math.max(colCount - 1, 1)), type: WidthType.PERCENTAGE },
        })
      );
    });

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells, tableHeader: isHeader }));
    }
    isFirstRow = false;
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows,
  });
}

/**
 * Process <blockquote> elements.
 */
function processBlockquote($: any, el: any): Paragraph[] {
  const runs = extractTextRuns($, el);
  return [
    new Paragraph({
      indent: { left: 720 },
      spacing: { before: 100, after: 100 },
      border: { left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent } },
      children: runs,
    }),
  ];
}

/**
 * Recursively process all child nodes of an element.
 */
function processChildNodes($: any, el: any): FileChild[] {
  const result: FileChild[] = [];
  el.contents().each((_i: any, child: any) => {
    result.push(...processNode($, child));
  });
  return result;
}

// =====================================================
// INLINE TEXT RUN EXTRACTION
// =====================================================

interface InlineStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color?: string;
}

/**
 * Extract all text runs from an element, preserving bold/italic/underline formatting.
 */
function extractTextRuns(
  $: any,
  el: any,
  parentStyle: InlineStyle = { bold: false, italic: false, underline: false }
): TextRun[] {
  const runs: TextRun[] = [];

  el.contents().each((_i: any, child: any) => {
    if (child.type === 'text') {
      const text = child.data || '';
      if (text.replace(/\s+/g, ' ') === ' ' && runs.length === 0) return;
      if (text.trim() === '' && text.includes('\n')) return;

      runs.push(
        new TextRun({
          text: text.replace(/\n/g, ' '),
          bold: parentStyle.bold,
          italics: parentStyle.italic,
          underline: parentStyle.underline ? {} : undefined,
          font: 'Times New Roman',
          size: 22,
          color: parentStyle.color || COLORS.textDark,
        })
      );
      return;
    }

    if (child.type !== 'tag') return;

    const childTag = (child.tagName || child.name || '').toLowerCase();
    const childEl = $(child);

    const childStyle: InlineStyle = { ...parentStyle };
    if (childTag === 'strong' || childTag === 'b') childStyle.bold = true;
    if (childTag === 'em' || childTag === 'i') childStyle.italic = true;
    if (childTag === 'u') childStyle.underline = true;

    if (childTag === 'br') {
      runs.push(new TextRun({ text: '', break: 1, font: 'Times New Roman', size: 22 }));
      return;
    }

    if (childTag === 'a') {
      childStyle.underline = true;
      childStyle.color = '2563EB';
    }

    const childRuns = extractTextRuns($, childEl, childStyle);
    runs.push(...childRuns);
  });

  return runs;
}

// =====================================================
// STYLE PARSING HELPERS
// =====================================================

/**
 * Parse an inline background / background-color into a 6-digit hex (no #), for table
 * row/cell shading (e.g. highlighted "Reconciled Market Value" rows). Returns null if absent.
 */
function parseBackgroundColor(style?: string | null): string | null {
  if (!style) return null;
  const m = style.match(/background(?:-color)?:\s*#?([0-9a-fA-F]{6})\b/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Parse an inline text `color:` into a 6-digit hex (no #), for coloured run text (e.g. the
 * green/red sensitivity Impact column). Must not match `background-color`. Returns null if absent.
 */
function parseTextColor(style?: string | null): string | null {
  if (!style) return null;
  const m = style.match(/(?:^|;)\s*color:\s*#?([0-9a-fA-F]{6})\b/);
  return m ? m[1].toUpperCase() : null;
}

/** True when the inline style requests bold (font-weight: bold | 600–900). */
function isBoldStyle(style?: string | null): boolean {
  return !!style && /font-weight:\s*(?:bold|[6-9]00)\b/i.test(style);
}

function parseAlignment(style?: string | null): any {
  if (!style) return undefined;
  const match = style.match(/text-align:\s*(center|right|left|justify)/i);
  if (!match) return undefined;
  switch (match[1].toLowerCase()) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFIED;
    case 'left': return AlignmentType.LEFT;
    default: return undefined;
  }
}

/**
 * Parse margin-top / margin-bottom from inline style into DOCX spacing (twips).
 * Falls back to provided defaults.
 */
function parseSpacing(
  style: string | null | undefined,
  defaults: { before: number; after: number }
): { before: number; after: number } {
  let before = defaults.before;
  let after = defaults.after;
  if (!style) return { before, after };

  const mt = style.match(/margin-top\s*:\s*(\d+)\s*(px)?/i);
  if (mt) before = parseInt(mt[1], 10) === 0 ? 0 : parseInt(mt[1], 10) * 15; // rough px→twip

  const mb = style.match(/margin-bottom\s*:\s*(\d+)\s*(px)?/i);
  if (mb) after = parseInt(mb[1], 10) === 0 ? 0 : parseInt(mb[1], 10) * 15;

  return { before, after };
}

function bodyParagraph(
  segments: { text: string; bold: boolean; italic: boolean; underline: boolean }[]
): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: segments.map(
      (s) =>
        new TextRun({
          text: s.text,
          bold: s.bold,
          italics: s.italic,
          underline: s.underline ? {} : undefined,
          font: 'Times New Roman',
          size: 22,
          color: COLORS.textDark,
        })
    ),
  });
}
