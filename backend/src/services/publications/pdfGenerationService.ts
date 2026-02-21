/**
 * PDF Generation Service — PROPMETRIK
 *
 * Generates professional PDF reports for publications using Puppeteer.
 * Charts are rendered as static SVG/CSS visualizations (frozen at publication time).
 * PDFs are uploaded to MinIO and the pdf_url is saved on the publication record.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * LAYOUT RULES (read before editing):
 *
 * 1. Puppeteer margins (25 mm top/bottom, 20 mm left/right) are the SOLE source
 *    of page margins.  CSS must NOT set conflicting @page margins.
 * 2. NO position:absolute, position:fixed, or negative margins anywhere.
 * 3. NO fixed height / width on the cover page — only page-break-after:always.
 * 4. NO overflow:hidden on any page-level container.
 * 5. page-break-inside:avoid on charts, tables, key-findings, exec-summary.
 * 6. page-break-after:avoid on headings (so heading + first para stay together).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import puppeteer from 'puppeteer';
import { pool } from '../../database';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

// ============================================================
// PUBLIC API
// ============================================================

export interface PdfGenerationOptions {
  publicationId: string;
}

export interface PdfResult {
  pdfUrl: string;
  pdfKey: string;
  sizeBytes: number;
}

/**
 * Generate a PDF for a publication, upload to MinIO, and update the publication record.
 */
export async function generatePublicationPdf(
  options: PdfGenerationOptions,
): Promise<PdfResult> {
  const { publicationId } = options;
  logger.info({ publicationId }, 'Starting PDF generation');

  /* 1 — Fetch publication + charts */
  const pubResult = await pool.query(
    `SELECT p.*,
            COALESCE(json_agg(
              json_build_object(
                'id', pc.id,
                'chart_type', pc.chart_type,
                'title', pc.title,
                'ai_insight', pc.ai_insight,
                'snapshot_data', pc.snapshot_data,
                'position', pc.position
              ) ORDER BY pc.position
            ) FILTER (WHERE pc.id IS NOT NULL), '[]') as charts
     FROM publications p
     LEFT JOIN publication_charts pc ON pc.publication_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [publicationId],
  );

  if (pubResult.rows.length === 0) {
    throw new Error(`Publication not found: ${publicationId}`);
  }

  const publication = pubResult.rows[0];
  const charts = publication.charts || [];
  const contentBlocks = publication.content_json || [];

  /* 2 — Build HTML */
  const html = buildPdfHtml(publication, contentBlocks, charts);

  /* 3 — Render to PDF */
  const pdfBuffer = await renderHtmlToPdf(html);

  /* 4 — Upload to MinIO */
  const pdfKey = `publications/${publicationId}/${slugify(publication.title)}.pdf`;
  await uploadFile(
    buckets.documents,
    pdfKey,
    pdfBuffer,
    'application/pdf',
    {
      'publication-id': publicationId,
      'publication-type': publication.type,
      'generated-at': new Date().toISOString(),
    },
  );

  /* 5 — Presigned URL (7 days) */
  const pdfUrl = await getPresignedDownloadUrl(
    buckets.documents,
    pdfKey,
    7 * 24 * 60 * 60,
  );

  /* 6 — Persist URL */
  await pool.query(
    `UPDATE publications SET pdf_url = $2 WHERE id = $1`,
    [publicationId, pdfUrl],
  );

  logger.info(
    { publicationId, pdfKey, size: pdfBuffer.length },
    'PDF generated and uploaded',
  );

  return { pdfUrl, pdfKey, sizeBytes: pdfBuffer.length };
}

// ============================================================
// HTML BUILDER
// ============================================================

const PRODUCT_LABELS: Record<string, string> = {
  outlook: 'Ghana Real Estate Outlook',
  snapshot: 'Ghana Property Snapshot',
  policy_paper: 'Policy Paper',
  press_release: 'Press Release',
  podcast: 'Podcast',
};

const EDITION_LABELS: Record<string, string> = {
  monthly: 'Monthly Edition',
  quarterly: 'Quarterly Edition',
  annual: 'Annual Edition',
  weekly: 'Weekly',
  adhoc: '',
};

function buildPdfHtml(
  publication: any,
  contentBlocks: any[],
  charts: any[],
): string {
  const pubDate = publication.published_at
    ? new Date(publication.published_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  const pubMonth = publication.published_at
    ? new Date(publication.published_at)
        .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        .toUpperCase()
    : new Date()
        .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        .toUpperCase();

  const productLabel = PRODUCT_LABELS[publication.product] || publication.product || publication.type || 'Publication';
  const editionLabel = EDITION_LABELS[publication.edition] || '';
  const typeLabel = editionLabel ? `${productLabel} — ${editionLabel}` : productLabel;

  const regions =
    (publication.regions || [])
      .map((r: string) =>
        r
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase()),
      )
      .join(', ') || 'National';

  const bodyContent = buildBodyContent(contentBlocks, charts);
  const tocEntries = extractTocEntries(contentBlocks);

  /* Key findings */
  const keyFindings =
    publication.key_findings && publication.key_findings.length > 0
      ? `<div class="key-findings">
          <div class="kf-header">
            <div class="kf-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      stroke="#D4A843" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round"/>
              </svg>
            </div>
            <h2>Key Findings</h2>
          </div>
          <div class="kf-grid">
            ${publication.key_findings
              .map(
                (f: string, i: number) => `
              <div class="kf-item">
                <span class="kf-num">${String(i + 1).padStart(2, '0')}</span>
                <span class="kf-text">${escapeHtml(f)}</span>
              </div>`,
              )
              .join('\n')}
          </div>
         </div>`
      : '';

  /* Table of contents */
  const toc =
    tocEntries.length > 2
      ? `<div class="toc">
          <div class="toc-title">CONTENTS</div>
          <div class="toc-list">
            ${tocEntries
              .map(
                (entry, i) => `
              <div class="toc-item">
                <span class="toc-num">${String(i + 1).padStart(2, '0')}</span>
                <span class="toc-label">${escapeHtml(entry)}</span>
              </div>`,
              )
              .join('\n')}
          </div>
         </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${PDF_STYLES}</style>
</head>
<body>

  <!-- ══════════════════ COVER PAGE ══════════════════ -->
  <div class="cover-page">
    <div class="cover-top">
      <div class="cover-logo">PROP<span class="gold">METRIK</span></div>
    </div>
    <div class="cover-center">
      <div class="cover-type-line">
        <span class="cover-type-label">${typeLabel.toUpperCase()}</span>
        <span class="cover-type-divider"></span>
        <span class="cover-type-date">${pubMonth}</span>
      </div>
      <h1 class="cover-title">${escapeHtml(publication.title)}</h1>
      ${
        publication.subtitle
          ? `<p class="cover-subtitle">${escapeHtml(publication.subtitle)}</p>`
          : ''
      }
      <div class="cover-meta-row">
        <div class="cover-meta-item">
          <span class="cover-meta-label">Region</span>
          <span class="cover-meta-value">${regions}</span>
        </div>
        <div class="cover-meta-item">
          <span class="cover-meta-label">Published</span>
          <span class="cover-meta-value">${pubDate}</span>
        </div>
      </div>
    </div>
    <div class="cover-bottom">
      <span class="cover-brand-text">PROPMETRIK Research &amp; Analytics</span>
      <p class="cover-legal">
        This report is intended for general information purposes only and does
        not constitute investment advice.
      </p>
    </div>
  </div>

  <!-- ══════════════════ CONTENT PAGES ══════════════════ -->
  <div class="content-wrapper">

    ${
      publication.excerpt
        ? `<div class="executive-summary">
        <div class="es-label">EXECUTIVE SUMMARY</div>
        <p class="es-text">${escapeHtml(publication.excerpt)}</p>
      </div>`
        : ''
    }

    ${toc}

    ${keyFindings}

    <div class="body-content">
      ${bodyContent}
    </div>

    <div class="disclaimer">
      <div class="disclaimer-header">DISCLAIMER</div>
      <p>
        This publication is produced by PROPMETRIK for general informational
        purposes. The data and analysis contained herein are derived from sources
        believed to be reliable, but PROPMETRIK makes no guarantee as to their
        accuracy or completeness. This report does not constitute investment
        advice or a recommendation to buy, sell, or hold any property or
        financial instrument. Past performance is not indicative of future
        results. Readers should conduct their own due diligence before making
        investment decisions.
      </p>
      <p class="disclaimer-copy">
        &copy; ${new Date().getFullYear()} PROPMETRIK. All rights reserved.
      </p>
    </div>
  </div>

</body>
</html>`;
}

// ============================================================
// CONTENT HELPERS
// ============================================================

function extractTocEntries(contentBlocks: any[]): string[] {
  const entries: string[] = [];
  for (const block of contentBlocks) {
    if (block.type === 'text' && block.content) {
      const h2Matches = block.content.match(/<h2[^>]*>([^<]+)<\/h2>/gi);
      if (h2Matches) {
        for (const match of h2Matches) {
          const text = match.replace(/<[^>]+>/g, '').trim();
          if (text && text.length > 3) entries.push(text);
        }
      }
    }
    if (block.type === 'heading' && block.content) {
      entries.push(block.content);
    }
  }
  return entries;
}

function buildBodyContent(contentBlocks: any[], charts: any[]): string {
  if (!contentBlocks || contentBlocks.length === 0) return '';

  const hasInlineCharts = contentBlocks.some((b: any) => b.type === 'chart');

  if (hasInlineCharts) {
    return contentBlocks
      .map((block: any) => {
        if (block.type === 'chart') return renderChartForPdf(block);
        if (block.type === 'heading')
          return `<h2>${escapeHtml(block.content)}</h2>`;
        if (block.type === 'callout')
          return `<div class="callout">${block.content}</div>`;
        if (block.type === 'text')
          return `<div class="text-block">${block.content}</div>`;
        return block.content
          ? `<div class="text-block">${block.content}</div>`
          : '';
      })
      .join('\n');
  }

  /* Old-style: separate text + charts distributed evenly */
  const textBlocks = contentBlocks.filter(
    (b: any) => b.type === 'text' || b.type === 'heading',
  );
  const chartInterval =
    charts.length > 0
      ? Math.max(1, Math.floor(textBlocks.length / (charts.length + 1)))
      : textBlocks.length + 1;
  let chartIdx = 0;
  const parts: string[] = [];

  textBlocks.forEach((block: any, i: number) => {
    if (block.type === 'heading') {
      parts.push(`<h2>${escapeHtml(block.content)}</h2>`);
    } else {
      parts.push(`<div class="text-block">${block.content}</div>`);
    }
    if (chartIdx < charts.length && (i + 1) % chartInterval === 0) {
      parts.push(renderChartForPdf(charts[chartIdx]));
      chartIdx++;
    }
  });

  while (chartIdx < charts.length) {
    parts.push(renderChartForPdf(charts[chartIdx]));
    chartIdx++;
  }

  return parts.join('\n');
}

// ============================================================
// CHART RENDERERS (static HTML / SVG)
// ============================================================

function renderChartForPdf(chartBlock: any): string {
  const snap = chartBlock.snapshotData || chartBlock.snapshot_data || {};
  const chartType = (
    snap._chartType ||
    chartBlock.chartType ||
    chartBlock.chart_type ||
    'stat'
  ).toLowerCase();
  const title =
    chartBlock.title || snap._metricLabel || 'Data Visualization';
  const insight =
    chartBlock.aiInsight || chartBlock.ai_insight || '';

  const series = Array.isArray(snap.series) ? snap.series : [];
  const breakdown = Array.isArray(snap.breakdown) ? snap.breakdown : [];
  const current = snap._currentValue;
  const previous = snap._previousValue;

  const statHtml =
    current != null
      ? buildStatHeader(snap._metricLabel || title, current, previous)
      : '';

  let chartViz = '';
  if (chartType === 'donut' || chartType === 'pie') {
    if (breakdown.length > 0) chartViz = renderDonutSvg(breakdown);
  } else if (chartType === 'area') {
    if (series.length >= 2) chartViz = renderAreaSvg(series);
    else if (breakdown.length > 0) chartViz = renderBarSvg(breakdown);
  } else if (chartType === 'gauge') {
    const gaugeVal = snap._gaugeValue ?? snap._currentValue;
    const gaugeLabel = snap._gaugeLabel ?? snap._metricLabel ?? title;
    if (gaugeVal != null) chartViz = renderGaugeSvg(gaugeVal, gaugeLabel);
  } else if (chartType === 'stacked_bar') {
    if (breakdown.length > 0) chartViz = renderStackedBarSvg(breakdown);
    else if (series.length >= 2) chartViz = renderBarSvg(series.map((s: Record<string, unknown>) => ({ label: String(Object.values(s).find(v => typeof v === 'string') || ''), value: Object.values(s).find(v => typeof v === 'number') as number || 0 })));
  } else if (
    chartType === 'line' ||
    chartType === 'sparkline' ||
    chartType === 'forecast'
  ) {
    if (series.length >= 2) chartViz = renderLineSvg(series);
    else if (breakdown.length > 0) chartViz = renderBarSvg(breakdown);
  } else if (chartType === 'bar') {
    if (breakdown.length > 0) chartViz = renderBarSvg(breakdown);
  } else if (breakdown.length > 0) {
    chartViz = renderBarSvg(breakdown);
  } else if (series.length >= 2) {
    chartViz = renderLineSvg(series);
  }

  const timestamp = snap.timestamp
    ? new Date(snap.timestamp).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  return `
    <div class="chart-container">
      <div class="chart-header">
        <span class="chart-title">${escapeHtml(title)}</span>
        <span class="chart-badge">${
          timestamp
            ? `Data as of ${timestamp}`
            : 'PROPMETRIK Research'
        }</span>
      </div>
      ${statHtml}
      ${chartViz || '<div class="chart-no-data">Metric snapshot</div>'}
      ${
        insight
          ? `<div class="chart-insight">${escapeHtml(insight)}</div>`
          : ''
      }
    </div>`;
}

function buildStatHeader(
  label: string,
  current: number,
  previous?: number,
): string {
  const delta =
    previous != null && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : null;

  return `
    <div class="stat-header">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${current.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })}</span>
      ${
        delta != null
          ? `<span class="stat-delta ${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}%</span>`
          : ''
      }
    </div>`;
}

const CHART_COLORS = [
  '#D4A843',
  '#6366F1',
  '#22D3EE',
  '#F472B6',
  '#A3E635',
  '#FB923C',
  '#818CF8',
  '#34D399',
];

function renderLineSvg(
  series: Array<Record<string, unknown>>,
): string {
  const W = 480,
    H = 180,
    PAD = 40;
  const sample = series[0] || {};
  const xKey =
    Object.keys(sample).find((k) => typeof sample[k] === 'string') || 'date';
  const valueKeys = Object.keys(sample).filter(
    (k) => typeof sample[k] === 'number',
  );
  if (valueKeys.length === 0) return '';

  const allValues = series.flatMap((d) =>
    valueKeys.map((k) => d[k] as number),
  );
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const lines = valueKeys.map((key, ki) => {
    const points = series
      .map((d, i) => {
        const x = PAD + (i / (series.length - 1)) * (W - 2 * PAD);
        const y =
          H -
          PAD -
          (((d[key] as number) - minVal) / range) * (H - 2 * PAD);
        return `${x},${y}`;
      })
      .join(' ');
    return `<polyline points="${points}" fill="none" stroke="${CHART_COLORS[ki % CHART_COLORS.length]}" stroke-width="2.5" stroke-linejoin="round" />`;
  });

  const xLabels = [0, Math.floor(series.length / 2), series.length - 1].map(
    (i) => {
      const x = PAD + (i / (series.length - 1)) * (W - 2 * PAD);
      const label = formatDateLabel(String(series[i]?.[xKey] || ''));
      return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#888">${label}</text>`;
    },
  );

  const yLabels = [0, 0.5, 1].map((p) => {
    const val = minVal + p * range;
    const y = H - PAD - p * (H - 2 * PAD);
    return `<text x="${PAD - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#888">${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
            <line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#e5e5e5" stroke-width="0.5" />`;
  });

  return `
    <div class="chart-svg-wrapper">
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${yLabels.join('\n')}
        ${lines.join('\n')}
        ${xLabels.join('\n')}
      </svg>
    </div>`;
}

function renderBarSvg(
  breakdown: Array<{ label: string; value: number }>,
): string {
  const W = 480,
    H = 180,
    PAD = 50;
  const maxVal = Math.max(...breakdown.map((d) => d.value), 1);
  const barW = Math.min(
    50,
    (W - 2 * PAD) / breakdown.length - 8,
  );

  const bars = breakdown.map((d, i) => {
    const barH = (d.value / maxVal) * (H - 2 * PAD);
    const x =
      PAD +
      i * ((W - 2 * PAD) / breakdown.length) +
      ((W - 2 * PAD) / breakdown.length - barW) / 2;
    const y = H - PAD - barH;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${CHART_COLORS[i % CHART_COLORS.length]}" />
      <text x="${x + barW / 2}" y="${H - PAD + 14}" text-anchor="middle" font-size="8" fill="#888">${truncate(d.label, 10)}</text>
      <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="9" fill="#555" font-weight="600">${d.value.toLocaleString()}</text>`;
  });

  return `
    <div class="chart-svg-wrapper">
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#ddd" stroke-width="1" />
        ${bars.join('\n')}
      </svg>
    </div>`;
}

function renderDonutSvg(
  breakdown: Array<{ label: string; value: number }>,
): string {
  const total = breakdown.reduce((s, d) => s + d.value, 0) || 1;
  const CX = 100,
    CY = 100,
    R = 72,
    IR = 44;

  let cumAngle = -Math.PI / 2;
  const slices = breakdown.map((d, i) => {
    const frac = d.value / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + frac * 2 * Math.PI;
    cumAngle = endAngle;

    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const ix1 = CX + IR * Math.cos(endAngle);
    const iy1 = CY + IR * Math.sin(endAngle);
    const ix2 = CX + IR * Math.cos(startAngle);
    const iy2 = CY + IR * Math.sin(startAngle);
    const largeArc = frac > 0.5 ? 1 : 0;
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${IR} ${IR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    return `<path d="${path}" fill="${CHART_COLORS[i % CHART_COLORS.length]}" />`;
  });

  const legend = breakdown.map((d, i) => {
    const pct = ((d.value / total) * 100).toFixed(0);
    return `
      <div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        <span>${escapeHtml(d.label)} (${pct}%)</span>
      </div>`;
  });

  return `
    <div class="chart-donut-wrapper">
      <svg viewBox="0 0 200 200" width="180" height="180">
        ${slices.join('\n')}
        <text x="${CX}" y="${CY + 4}" text-anchor="middle" font-size="14" font-weight="700" fill="#333">${total.toLocaleString()}</text>
        <text x="${CX}" y="${CY + 18}" text-anchor="middle" font-size="9" fill="#888">Total</text>
      </svg>
      <div class="donut-legend">
        ${legend.join('\n')}
      </div>
    </div>`;
}

/**
 * Render an area chart (filled line) — used for forecasts, investment flows, cumulative data.
 */
function renderAreaSvg(
  series: Array<Record<string, unknown>>,
): string {
  const W = 480, H = 180, PAD = 40;
  const sample = series[0] || {};
  const xKey = Object.keys(sample).find((k) => typeof sample[k] === 'string') || 'date';
  const valueKeys = Object.keys(sample).filter((k) => typeof sample[k] === 'number');
  if (valueKeys.length === 0) return '';

  const allValues = series.flatMap((d) => valueKeys.map((k) => d[k] as number));
  const minVal = Math.min(...allValues) * 0.95; // slight padding below min
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const areas = valueKeys.map((key, ki) => {
    const points = series.map((d, i) => {
      const x = PAD + (i / (series.length - 1)) * (W - 2 * PAD);
      const y = H - PAD - (((d[key] as number) - minVal) / range) * (H - 2 * PAD);
      return { x, y };
    });

    const linePath = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPath = `M ${points[0].x},${H - PAD} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${points[points.length - 1].x},${H - PAD} Z`;
    const color = CHART_COLORS[ki % CHART_COLORS.length];

    return `
      <path d="${areaPath}" fill="${color}" fill-opacity="0.15" />
      <polyline points="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" />
      ${points.map((p, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0 || i === points.length - 1
        ? `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" />`
        : ''
      ).join('')}`;
  });

  const xLabels = [0, Math.floor(series.length / 2), series.length - 1].map((i) => {
    const x = PAD + (i / (series.length - 1)) * (W - 2 * PAD);
    const label = formatDateLabel(String(series[i]?.[xKey] || ''));
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#888">${label}</text>`;
  });

  const yLabels = [0, 0.5, 1].map((p) => {
    const val = minVal + p * range;
    const y = H - PAD - p * (H - 2 * PAD);
    return `<text x="${PAD - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#888">${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
            <line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#e5e5e5" stroke-width="0.5" />`;
  });

  return `
    <div class="chart-svg-wrapper">
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${yLabels.join('\n')}
        ${areas.join('\n')}
        ${xLabels.join('\n')}
      </svg>
    </div>`;
}

/**
 * Render a gauge/dial chart — used for single index scores (HAI, confidence, affordability).
 */
function renderGaugeSvg(value: number, label: string): string {
  const CX = 150, CY = 130, R = 90;
  const clampedValue = Math.min(100, Math.max(0, value));
  const startAngle = Math.PI;  // 180° = left
  const endAngle = 2 * Math.PI; // 360° = right
  const valueAngle = startAngle + (clampedValue / 100) * (endAngle - startAngle);

  // Background arc (full semicircle)
  const bgX1 = CX + R * Math.cos(startAngle);
  const bgY1 = CY + R * Math.sin(startAngle);
  const bgX2 = CX + R * Math.cos(endAngle);
  const bgY2 = CY + R * Math.sin(endAngle);
  const bgPath = `M ${bgX1} ${bgY1} A ${R} ${R} 0 1 1 ${bgX2} ${bgY2}`;

  // Value arc
  const valX2 = CX + R * Math.cos(valueAngle);
  const valY2 = CY + R * Math.sin(valueAngle);
  const largeArc = clampedValue > 50 ? 1 : 0;
  const valPath = `M ${bgX1} ${bgY1} A ${R} ${R} 0 ${largeArc} 1 ${valX2} ${valY2}`;

  // Color based on value
  const color = clampedValue >= 70 ? '#22C55E' : clampedValue >= 40 ? '#D4A843' : '#EF4444';

  // Tick marks with better positioning
  const ticks = [0, 25, 50, 75, 100].map(t => {
    const angle = startAngle + (t / 100) * (endAngle - startAngle);
    const outerX = CX + (R + 14) * Math.cos(angle);
    const outerY = CY + (R + 14) * Math.sin(angle);
    return `<text x="${outerX}" y="${outerY + 4}" text-anchor="middle" font-size="9" fill="#999">${t}</text>`;
  });

  return `
    <div class="chart-svg-wrapper" style="text-align:center;">
      <svg viewBox="0 0 300 165" width="300" height="165">
        <path d="${bgPath}" fill="none" stroke="#e5e5e5" stroke-width="16" stroke-linecap="round" />
        <path d="${valPath}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" />
        ${ticks.join('\n')}
        <text x="${CX}" y="${CY - 10}" text-anchor="middle" font-size="32" font-weight="700" fill="#333">${clampedValue.toFixed(0)}</text>
        <text x="${CX}" y="${CY + 12}" text-anchor="middle" font-size="11" fill="#888">${escapeHtml(truncate(label, 40))}</text>
      </svg>
    </div>`;
}

/**
 * Render a horizontal stacked bar chart — used for regional breakdowns.
 */
function renderStackedBarSvg(
  breakdown: Array<{ label: string; value: number }>,
): string {
  const W = 500, H = 200, PAD = 120;
  const total = breakdown.reduce((s, d) => s + d.value, 0) || 1;
  const barH = Math.min(36, (H - 40) / breakdown.length - 8);

  const bars = breakdown.map((d, i) => {
    const barW = Math.max(4, (d.value / total) * (W - PAD - 30));
    const y = 20 + i * ((H - 40) / breakdown.length) + ((H - 40) / breakdown.length - barH) / 2;
    const pct = ((d.value / total) * 100).toFixed(0);
    return `
      <text x="${PAD - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="10" fill="#555">${escapeHtml(truncate(d.label, 28))}</text>
      <rect x="${PAD}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${CHART_COLORS[i % CHART_COLORS.length]}" />
      <text x="${PAD + barW + 8}" y="${y + barH / 2 + 4}" text-anchor="start" font-size="10" fill="#555" font-weight="600">${pct}%</text>`;
  });

  return `
    <div class="chart-svg-wrapper">
      <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${bars.join('\n')}
      </svg>
    </div>`;
}

// ============================================================
// PUPPETEER RENDERER
// ============================================================

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      /**
       * These margins are the SOLE source of page spacing.
       * Content is paginated within 247 mm × 170 mm (A4 minus margins).
       * Do NOT add @page { margin } in CSS — it would double-up or conflict.
       */
      margin: {
        top: '25mm',
        bottom: '25mm',
        left: '20mm',
        right: '20mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font-family:'Helvetica Neue',Arial,sans-serif;
                    font-size:7pt;color:#bbb;display:flex;
                    justify-content:space-between;align-items:center;
                    padding:0 20mm;">
          <span style="letter-spacing:1.5px;text-transform:uppercase;
                       font-weight:600;">PROPMETRIK</span>
          <span>Page <span class="pageNumber"></span> of
                <span class="totalPages"></span></span>
        </div>`,
    });

    return Buffer.from(pdfUint8);
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatDateLabel(d: string): string {
  if (!d) return '';
  try {
    const parsed = new Date(d);
    // Check if it's a valid date — if not, use the string as-is
    if (isNaN(parsed.getTime())) return d.length > 12 ? d.slice(0, 12) : d;
    return parsed.toLocaleDateString('en-GB', {
      month: 'short',
      year: '2-digit',
    });
  } catch {
    return d.length > 12 ? d.slice(0, 12) : d;
  }
}

// ============================================================
// PDF STYLES
// ============================================================

const PDF_STYLES = `
/* ══════════════════════════════════════════════════════════════
   PROPMETRIK — Professional Research Report Stylesheet
   Brand: #D4A843 (Gold)  ·  #0B0B0F (Ink Black)  ·  #FFFFFF
   ──────────────────────────────────────────────────────────────
   RULES:
   • Puppeteer margins (25 mm / 20 mm) are the sole page gutter.
   • This stylesheet must NOT declare @page { margin }.
   • NO position:absolute / fixed / negative-margin anywhere.
   • Cover page uses page-break-after:always — NO fixed height.
   ══════════════════════════════════════════════════════════════ */

@page { size: A4 portrait; }

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.7;
  color: #1e1e1e;
  background: #fff;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── COVER PAGE ───────────────────────────────────────────── */

.cover-page {
  background: #0B0B0F;
  color: #fff;
  border-left: 6px solid #D4A843;
  padding: 48mm 32mm 40mm 30mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  page-break-after: always;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.cover-top {
  margin-bottom: 0;
}

.cover-logo {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 4px;
  color: #fff;
}

.cover-logo .gold {
  color: #D4A843;
}

.cover-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24mm 0;
}

.cover-type-line {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.cover-type-label {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #D4A843;
}

.cover-type-divider {
  display: inline-block;
  width: 30px;
  height: 1px;
  background: rgba(212,168,67,0.5);
}

.cover-type-date {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.5);
}

.cover-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 34px;
  font-weight: 700;
  line-height: 1.18;
  color: #fff;
  margin: 0 0 14px 0;
  max-width: 95%;
}

.cover-subtitle {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 15px;
  color: rgba(255,255,255,0.55);
  margin: 0 0 22px 0;
  font-style: italic;
  line-height: 1.5;
  max-width: 85%;
}

.cover-meta-row {
  display: flex;
  gap: 40px;
  margin-top: 8px;
}

.cover-meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cover-meta-label {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #D4A843;
}

.cover-meta-value {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  color: rgba(255,255,255,0.85);
}

.cover-bottom {
  padding-top: 18px;
  border-top: 1px solid rgba(255,255,255,0.08);
}

.cover-brand-text {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.4);
  display: block;
  margin-bottom: 6px;
}

.cover-legal {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 8px;
  color: rgba(255,255,255,0.22);
  line-height: 1.5;
  max-width: 80%;
  margin: 0;
}

/* ── CONTENT WRAPPER ──────────────────────────────────────── */

.content-wrapper {
  /* Puppeteer margins handle all page spacing — no padding here */
  padding: 0;
}

/* ── Executive Summary ──────────────────────────────────── */

.executive-summary {
  margin-bottom: 24px;
  padding: 20px 24px;
  background: #faf9f6;
  border-left: 4px solid #D4A843;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.es-label {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: #D4A843;
  margin-bottom: 8px;
}

.es-text {
  font-size: 12px;
  line-height: 1.7;
  color: #333;
  font-style: italic;
  margin: 0;
}

/* ── Table of Contents ──────────────────────────────────── */

.toc {
  margin-bottom: 28px;
  page-break-inside: avoid;
}

.toc-title {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: #D4A843;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8e2d0;
}

.toc-list {
  display: block;
}

.toc-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dotted #e0ddd5;
}

.toc-num {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  color: #D4A843;
  min-width: 20px;
}

.toc-label {
  font-size: 11px;
  color: #2a2a2a;
}

/* ── Key Findings ───────────────────────────────────────── */

.key-findings {
  background: #faf9f6;
  border: 1px solid #e8e2d0;
  padding: 20px 24px;
  margin-bottom: 28px;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.kf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8e2d0;
}

.kf-header h2 {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: #D4A843;
  margin: 0;
  padding: 0;
  border: none;
}

.kf-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: rgba(212,168,67,0.1);
  border-radius: 50%;
  flex-shrink: 0;
}

.kf-grid {
  display: block;
}

.kf-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.kf-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.kf-num {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 800;
  color: #D4A843;
  min-width: 20px;
  padding-top: 1px;
}

.kf-text {
  font-size: 11px;
  line-height: 1.55;
  color: #2a2a2a;
}

/* ── Body Text ──────────────────────────────────────────── */

.body-content {
  /* flows naturally, no special sizing */
}

.text-block {
  margin-bottom: 12px;
}

.text-block h1,
.text-block h2 {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #0B0B0F;
  margin: 28px 0 10px 0;
  padding-bottom: 5px;
  border-bottom: 2px solid #D4A843;
  page-break-after: avoid;
}

.text-block h3 {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: #1e1e1e;
  margin: 22px 0 8px 0;
  page-break-after: avoid;
}

.text-block h4 {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #333;
  margin: 16px 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  page-break-after: avoid;
}

.text-block p {
  margin: 0 0 8px 0;
  line-height: 1.7;
  color: #2a2a2a;
}

.text-block ul,
.text-block ol {
  margin: 6px 0 12px 22px;
  color: #2a2a2a;
}

.text-block li {
  margin-bottom: 4px;
  line-height: 1.6;
}

.text-block strong {
  font-weight: 700;
  color: #0B0B0F;
}

.text-block em {
  font-style: italic;
  color: #444;
}

/* ── Tables ─────────────────────────────────────────────── */

.text-block table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 16px 0;
  font-size: 10px;
  page-break-inside: avoid;
  word-wrap: break-word;
}

.text-block table thead {
  display: table-header-group;
}

.text-block table th {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-align: left;
  padding: 8px 10px;
  background: #0B0B0F;
  color: #D4A843;
  border: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.text-block table td {
  padding: 7px 10px;
  border-bottom: 1px solid #eae8e3;
  color: #2a2a2a;
  vertical-align: top;
}

.text-block table tr:nth-child(even) td {
  background: #faf9f6;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.text-block table tr:last-child td {
  border-bottom: 2px solid #D4A843;
}

/* Global h2 (outside .text-block) */
h2 {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: #0B0B0F;
  margin: 28px 0 10px 0;
  padding-bottom: 5px;
  border-bottom: 2px solid #D4A843;
  page-break-after: avoid;
}

.callout {
  background: #f0f0ff;
  border-left: 4px solid #6366F1;
  padding: 12px 16px;
  margin: 16px 0;
  font-size: 11px;
  color: #2a2a2a;
  line-height: 1.6;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Chart Containers ───────────────────────────────────── */

.chart-container {
  background: #fff;
  border: 1px solid #e5e2da;
  border-left: 4px solid #D4A843;
  padding: 18px 20px;
  margin: 20px 0;
  page-break-inside: avoid;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.chart-title {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: #0B0B0F;
}

.chart-badge {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 7px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 1px;
  background: #f5f5f2;
  padding: 2px 6px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.stat-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0efe9;
}

.stat-label {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 8px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.stat-value {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 22px;
  font-weight: 800;
  color: #0B0B0F;
}

.stat-delta {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
}

.stat-delta.positive {
  color: #047857;
  background: #ecfdf5;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.stat-delta.negative {
  color: #b91c1c;
  background: #fef2f2;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.chart-svg-wrapper {
  text-align: center;
  margin: 8px 0 4px;
}

.chart-svg-wrapper svg {
  max-width: 100%;
  height: auto;
}

.chart-donut-wrapper {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 8px 0 4px;
}

.donut-legend {
  flex: 1;
}

.donut-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 10px;
  color: #2a2a2a;
}

.donut-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.chart-no-data {
  padding: 14px;
  text-align: center;
  color: #999;
  font-size: 10px;
  font-style: italic;
}

.chart-insight {
  margin-top: 10px;
  padding: 10px 14px;
  background: #faf9f6;
  font-size: 10px;
  color: #555;
  line-height: 1.6;
  border-left: 3px solid #e8e2d0;
  font-style: italic;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Disclaimer ─────────────────────────────────────────── */

.disclaimer {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 2px solid #0B0B0F;
  page-break-inside: avoid;
}

.disclaimer-header {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #999;
  margin-bottom: 8px;
}

.disclaimer p {
  font-size: 8px;
  color: #888;
  line-height: 1.6;
  margin: 0 0 5px 0;
}

.disclaimer-copy {
  margin-top: 6px;
  font-weight: 600;
  color: #666;
}

/* ── Page-break utilities ───────────────────────────────── */

.page-break { page-break-before: always; }

@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cover-page  { page-break-after: always; page-break-inside: avoid; }
  .chart-container,
  .key-findings,
  .executive-summary,
  .disclaimer   { page-break-inside: avoid; }
  .text-block table { page-break-inside: avoid; }
  h2, h3, h4   { page-break-after: avoid; }
}
`;
