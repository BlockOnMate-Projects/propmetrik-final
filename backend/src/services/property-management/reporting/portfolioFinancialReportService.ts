/**
 * Portfolio-Level Financial Report (PDF)
 *
 * Produces a professional, PROPMETRIK-branded portfolio financial report as a PDF:
 * executive KPIs, cash-flow trend, portfolio composition, per-property performance,
 * receivables aging and lease health — with inline SVG charts (no client JS, so they
 * render deterministically in headless Chromium).
 *
 * Data is pulled from the existing PM services (already GHS-normalized via the FX layer)
 * and rendered to HTML, then to PDF via puppeteer using the same launch config as the
 * other PROPMETRIK PDF generators.
 */
import puppeteer from 'puppeteer';
import db from '../../../database';
import { PortfolioService } from '../portfolios/portfolioService';
import { advancedFinancialService } from '../financial-reporting/advancedFinancialService';
import { reportingService } from './reportingService';

const portfolioService = new PortfolioService();

// ── Brand palette ─────────────────────────────────────────────────────────────
const BRAND = {
    gold: '#D4A843',
    ink: '#0B0B0F',
    slate: '#334155',
    muted: '#6b7280',
    border: '#e5e7eb',
    lightBg: '#f8f9fb',
    income: '#16a34a',
    expense: '#dc2626',
    net: '#D4A843',
};
const SERIES_COLORS = ['#D4A843', '#6366F1', '#22D3EE', '#F472B6', '#A3E635', '#FB923C', '#818CF8', '#34D399'];

// ── Formatting helpers ──────────────────────────────────────────────────────────
const ghs = (n: number | null | undefined): string =>
    'GH₵' + Math.round(Number(n) || 0).toLocaleString('en-GH');
const ghsShort = (n: number | null | undefined): string => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return 'GH₵' + (v / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(v) >= 1_000) return 'GH₵' + (v / 1_000).toFixed(0) + 'k';
    return 'GH₵' + Math.round(v).toLocaleString('en-GH');
};
const pct = (n: number | null | undefined): string => (Number(n) || 0).toFixed(1) + '%';
const titleCase = (s: string): string =>
    (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const esc = (s: any): string =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── SVG chart builders ───────────────────────────────────────────────────────────

/** Grouped vertical bars: income vs expenses per month. Clean and print-friendly. */
function cashFlowChartSvg(months: { label: string; income: number; expenses: number; net: number }[]): string {
    if (!months.length || months.every(m => !m.income && !m.expenses)) {
        return emptyChart('No cash-flow activity recorded in this period');
    }
    const W = 720, H = 280, padL = 60, padR = 16, padT = 14, padB = 40;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const maxV = Math.max(1, ...months.map(m => Math.max(m.income, m.expenses)));
    const step = innerW / months.length;
    const barW = Math.min(22, step * 0.30);
    const y = (v: number) => padT + innerH - (v / maxV) * innerH;
    const baseY = padT + innerH;
    const xCenter = (i: number) => padL + step * i + step / 2;

    const grid: string[] = [];
    for (let g = 0; g <= 4; g++) {
        const gy = padT + (innerH / 4) * g;
        const val = maxV * (1 - g / 4);
        grid.push(`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${BRAND.border}" stroke-width="1"/>`);
        grid.push(`<text x="${padL - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${BRAND.muted}">${ghsShort(val)}</text>`);
    }

    const bars: string[] = [];
    const labels: string[] = [];
    months.forEach((m, i) => {
        const cx = xCenter(i);
        if (m.income > 0) bars.push(`<rect x="${(cx - barW - 1.5).toFixed(1)}" y="${y(m.income).toFixed(1)}" width="${barW}" height="${(baseY - y(m.income)).toFixed(1)}" rx="2" fill="${BRAND.income}"/>`);
        if (m.expenses > 0) bars.push(`<rect x="${(cx + 1.5).toFixed(1)}" y="${y(m.expenses).toFixed(1)}" width="${barW}" height="${(baseY - y(m.expenses)).toFixed(1)}" rx="2" fill="${BRAND.expense}" opacity="0.9"/>`);
        labels.push(`<text x="${cx.toFixed(1)}" y="${H - padB + 16}" text-anchor="middle" font-size="9.5" fill="${BRAND.slate}">${esc(m.label)}</text>`);
    });

    return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">
    ${grid.join('')}
    <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="${BRAND.slate}" stroke-width="1"/>
    ${bars.join('')}
    ${labels.join('')}
  </svg>`;
}

/** Allocation donut: segments sized by share; centre shows the portfolio value headline. */
function donutSvg(segments: { label: string; value: number }[], centreValue: string): { svg: string; legend: string } {
    const total = segments.reduce((a, s) => a + (s.value || 0), 0);
    if (total <= 0) return { svg: emptyChart('No composition data'), legend: '' };
    const size = 200, r = 80, cx = size / 2, cy = size / 2, stroke = 28;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = segments.map((s, i) => {
        const frac = (s.value || 0) / total;
        const dash = frac * circ;
        const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${SERIES_COLORS[i % SERIES_COLORS.length]}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += dash;
        return seg;
    }).join('');
    const svg = `<svg viewBox="0 0 ${size} ${size}" width="180" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">
    ${arcs}
    <text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="15" font-weight="800" fill="${BRAND.ink}">${esc(centreValue)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="9" letter-spacing="0.5" fill="${BRAND.muted}">PORTFOLIO VALUE</text>
  </svg>`;
    const legend = segments.map((s, i) => `
    <div class="legend-row">
      <span class="legend-swatch" style="background:${SERIES_COLORS[i % SERIES_COLORS.length]}"></span>
      <span class="legend-label">${esc(titleCase(s.label))}</span>
      <span class="legend-val">${((s.value / total) * 100).toFixed(1)}%</span>
    </div>`).join('');
    return { svg, legend };
}

/** Horizontal bars (used for receivables aging). */
function hBarsSvg(rows: { label: string; value: number; color: string }[]): string {
    if (!rows.length || rows.every(r => !r.value)) return emptyChart('No outstanding receivables');
    const W = 720, rowH = 34, padL = 96, padR = 90, padT = 8;
    const H = padT * 2 + rows.length * rowH;
    const maxV = Math.max(1, ...rows.map(r => r.value));
    const innerW = W - padL - padR;
    const bars = rows.map((r, i) => {
        const y = padT + i * rowH + 6;
        const w = (r.value / maxV) * innerW;
        return `
      <text x="${padL - 10}" y="${y + 14}" text-anchor="end" font-size="11" fill="${BRAND.slate}">${esc(r.label)}</text>
      <rect x="${padL}" y="${y}" width="${Math.max(w, r.value > 0 ? 3 : 0).toFixed(1)}" height="20" rx="3" fill="${r.color}"/>
      <text x="${(padL + Math.max(w, 3) + 8).toFixed(1)}" y="${y + 14}" font-size="11" font-weight="600" fill="${BRAND.ink}">${ghs(r.value)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">${bars}</svg>`;
}

function emptyChart(msg: string): string {
    return `<svg viewBox="0 0 720 120" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">
    <rect x="0" y="0" width="720" height="120" rx="6" fill="${BRAND.lightBg}"/>
    <text x="360" y="64" text-anchor="middle" font-size="12" fill="${BRAND.muted}">${esc(msg)}</text>
  </svg>`;
}

// ── Report data assembly ─────────────────────────────────────────────────────────

export interface PortfolioReportOptions {
    period?: string; // 'this_month' | 'last_month' | 'this_quarter' | 'this_year' (default)
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Resolve a period key into a date range + human label — mirrors the Financial Center selector. */
function resolvePeriod(period?: string): { startDate: string; endDate: string; label: string } {
    const now = new Date();
    const y = now.getFullYear();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let start: Date, end: Date = now, label: string;

    switch (period) {
        case 'this_month':
            start = new Date(y, now.getMonth(), 1);
            label = `${MONTH_NAMES[now.getMonth()]} ${y}`;
            break;
        case 'last_month':
            start = new Date(y, now.getMonth() - 1, 1);
            end = new Date(y, now.getMonth(), 0); // last day of previous month
            label = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
            break;
        case 'this_quarter': {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(y, q * 3, 1);
            label = `Q${q + 1} ${y}`;
            break;
        }
        case 'this_year':
        default:
            start = new Date(y, 0, 1);
            label = `Year to date ${y}`;
            break;
    }
    return { startDate: fmt(start), endDate: fmt(end), label };
}

async function gatherData(organizationId: string, period?: string) {
    const { startDate, endDate, label: periodLabel } = resolvePeriod(period);

    const [orgRes, overview, summary, leases, receivables, building] = await Promise.all([
        db.query('SELECT name FROM organizations WHERE id = $1', [organizationId]).catch(() => null),
        portfolioService.getOverview(organizationId).catch(() => null),
        advancedFinancialService.getPortfolioFinancialSummary(organizationId).catch(() => null),
        portfolioService.getLeasePortfolioSummary(organizationId).catch(() => null),
        reportingService.getAgedReceivablesReport(organizationId).catch(() => null),
        // Building-level (active-only) performance + reconciled cash-flow + composition.
        reportingService.getBuildingPerformanceReport(organizationId, startDate, endDate).catch(() => null),
    ]);

    const orgName = orgRes?.rows?.[0]?.name || 'Your Portfolio';
    return { orgName, periodLabel, overview, summary, leases, receivables, building };
}

// ── HTML template ────────────────────────────────────────────────────────────────

function buildHtml(d: Awaited<ReturnType<typeof gatherData>>): string {
    const generatedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const fx = (d.summary as any)?.fx || (d.overview as any)?.fx;

    const bld = (d.building as any) || {};
    const buildings = (bld.buildings || []) as any[];
    const propertyCount = Number(bld.propertyCount) || buildings.length;
    const unitCount = Number(bld.unitCount) || 0;

    // Single authoritative portfolio value (used for the KPI AND the donut centre).
    const byType = (bld.byType || []).map((t: any) => ({ label: t.type, value: Number(t.value) || 0 }));
    const byTypeTotal = byType.reduce((a: number, s: any) => a + s.value, 0);
    const portfolioValue = Number((d.summary as any)?.totalValue) || byTypeTotal || Number((d.overview as any)?.totalValue) || 0;

    // KPI cards — full GH₵ figures (no "2k"), concise labels.
    const kpis = [
        { label: 'Portfolio Value', value: ghs(portfolioValue) },
        { label: 'Annual NOI', value: ghs((d.summary as any)?.portfolioNOI) },
        { label: 'Monthly Income', value: ghs((d.summary as any)?.totalMonthlyIncome ?? (d.overview as any)?.monthlyIncome) },
        { label: 'Net Monthly Flow', value: ghs((d.summary as any)?.netMonthlyCashFlow) },
        { label: 'Portfolio Occupancy', value: pct((d.leases as any)?.globalOccupancyRate ?? (d.overview as any)?.occupancyRate) },
        { label: 'Weighted Cap Rate', value: pct((d.summary as any)?.weightedCapRate) },
        { label: 'Properties', value: String(propertyCount) },
        { label: 'Rentable Units', value: String(unitCount) },
    ];

    // Cash flow monthly series — active buildings only (reconciles with the drill-down).
    const monthly = (bld.monthly || []).map((m: any) => {
        const mi = parseInt(String(m.month).split('-')[1], 10) - 1;
        return { label: MONTHS[mi] || m.month, income: Number(m.income) || 0, expenses: Number(m.expenses) || 0, net: Number(m.net) || 0 };
    });
    const cfTotals = {
        income: Number(bld.totals?.income) || 0,
        expenses: Number(bld.totals?.expenses) || 0,
        net: Number(bld.totals?.net) || 0,
    };

    // Composition donut (proportional) + centre = portfolio value; region rows.
    const donut = donutSvg(byType, ghsShort(portfolioValue));
    const byRegion = (bld.byRegion || []) as any[];

    // Per-building drill-down (active properties only). A building's units roll up into it.
    const perfRows = buildings.map(b => `
    <tr>
      <td class="t-name">${esc(b.title)}</td>
      <td class="num">${b.units > 0 ? b.units : '—'}</td>
      <td>${esc(titleCase(b.region || ''))}</td>
      <td class="num">${ghs(b.income)}</td>
      <td class="num">${ghs(b.expenses)}</td>
      <td class="num strong">${ghs(b.noi)}</td>
      <td class="num">${pct(b.occupancyRate)}</td>
    </tr>`).join('');
    const perfTotals = buildings.reduce((a, b) => ({
        income: a.income + (Number(b.income) || 0),
        expenses: a.expenses + (Number(b.expenses) || 0),
        noi: a.noi + (Number(b.noi) || 0),
    }), { income: 0, expenses: 0, noi: 0 });

    // Receivables aging
    const rsum = (d.receivables as any)?.summary || {};
    const aging = hBarsSvg([
        { label: 'Current', value: Number(rsum.current) || 0, color: BRAND.income },
        { label: '30–60 days', value: Number(rsum.days30to60) || 0, color: '#f59e0b' },
        { label: '60–90 days', value: Number(rsum.days60to90) || 0, color: '#fb923c' },
        { label: '90+ days', value: Number(rsum.over90Days) || 0, color: BRAND.expense },
    ]);

    // Lease expiry
    const exp = (d.leases as any)?.expiringSoon || {};

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; color: ${BRAND.ink}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; }
  .page { padding: 0; }
  .break { page-break-before: always; }
  h2.section { font-size: 15px; letter-spacing: 0.5px; text-transform: uppercase; color: ${BRAND.ink}; margin: 0 0 4px; }
  .section-rule { height: 3px; width: 48px; background: ${BRAND.gold}; border-radius: 2px; margin-bottom: 14px; }
  .muted { color: ${BRAND.muted}; }

  /* Cover — full bleed (page margins are 0 on top/left/right). */
  .cover { background: ${BRAND.ink}; color: #fff; height: 283mm; padding: 84px 64px; position: relative; }
  .cover .wordmark { font-size: 26px; font-weight: 800; letter-spacing: 2px; }
  .cover .wordmark .gold { color: ${BRAND.gold}; }
  .cover .title { font-size: 44px; font-weight: 800; line-height: 1.1; margin-top: 220px; }
  .cover .subtitle { font-size: 16px; color: #cbd5e1; margin-top: 14px; }
  .cover .meta { position: absolute; bottom: 70px; left: 64px; right: 64px; border-top: 1px solid #2a2a33; padding-top: 20px; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
  .cover .badge { display: inline-block; margin-top: 26px; border: 1px solid ${BRAND.gold}; color: ${BRAND.gold}; border-radius: 999px; padding: 6px 14px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  .cover .prepared { font-size: 13px; color: #e2e8f0; margin-top: 32px; }
  .cover .prepared b { color: #fff; }

  /* KPI grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 6px; }
  .kpi { border: 1px solid ${BRAND.border}; border-radius: 8px; padding: 13px 14px; background: ${BRAND.lightBg}; }
  .kpi .k-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; color: ${BRAND.muted}; min-height: 12px; white-space: nowrap; }
  .kpi .k-value { font-size: 18px; font-weight: 800; margin-top: 7px; white-space: nowrap; }

  /* Cards / layout */
  .card { border: 1px solid ${BRAND.border}; border-radius: 8px; padding: 16px; margin-top: 14px; }
  .row { display: flex; gap: 18px; }
  .row > .col { flex: 1; }
  .comp { display: flex; gap: 28px; align-items: center; }
  .comp .donut { flex: 0 0 180px; text-align: center; }
  .comp .legend { flex: 1; }
  .comp .legend .legend-row { font-size: 12px; margin-bottom: 10px; }
  .idle-row { font-style: italic; font-size: 10.5px; }
  .stat-inline { display: flex; gap: 24px; margin-top: 10px; }
  .stat-inline .s { font-size: 12px; }
  .stat-inline .s b { display: block; font-size: 16px; margin-top: 2px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }

  /* Legend */
  .legend-row { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 7px; }
  .legend-swatch { width: 10px; height: 10px; border-radius: 2px; }
  .legend-label { flex: 1; color: ${BRAND.slate}; }
  .legend-val { color: ${BRAND.ink}; font-weight: 600; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
  thead th { text-align: left; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; color: ${BRAND.muted}; border-bottom: 2px solid ${BRAND.border}; padding: 8px 6px; }
  tbody td { padding: 8px 6px; border-bottom: 1px solid ${BRAND.border}; }
  td.num, th.num { text-align: right; }
  td.t-name { font-weight: 600; }
  td.strong { font-weight: 700; }
  tfoot td { padding: 9px 6px; border-top: 2px solid ${BRAND.ink}; font-weight: 700; }
  .content { padding: 22mm 16mm 0; }
  .disclaimer { margin-top: 26px; font-size: 9.5px; color: ${BRAND.muted}; line-height: 1.5; border-top: 1px solid ${BRAND.border}; padding-top: 12px; }
</style></head>
<body>

  <!-- COVER -->
  <section class="cover">
    <div class="wordmark">PROP<span class="gold">METRIK</span></div>
    <div class="title">Portfolio<br/>Financial Report</div>
    <div class="subtitle">Property management performance, cash flow &amp; receivables</div>
    <div class="badge">Confidential</div>
    <div class="prepared">Prepared for <b>${esc(d.orgName)}</b><br/>Reporting period — ${esc(d.periodLabel)}</div>
    <div class="meta">
      <span>Generated ${generatedOn}</span>
      <span>PROPMETRIK Property &amp; Asset Analytics${fx?.rates?.USD ? ` · USD ${Number(fx.rates.USD).toFixed(2)}` : ''}</span>
    </div>
  </section>

  <!-- EXECUTIVE SUMMARY -->
  <section class="page break">
    <div class="content">
      <h2 class="section">Executive Summary</h2><div class="section-rule"></div>
      <p class="muted">A consolidated view of portfolio value, income performance and operational health for ${esc(d.orgName)}, for the period ${esc(d.periodLabel)}. All monetary figures are presented in Ghana Cedis (GH₵)${fx?.rates?.USD ? `, with foreign-currency holdings converted at live FX (USD ${Number(fx.rates.USD).toFixed(2)})` : ''}.</p>
      <div class="kpi-grid">
        ${kpis.map(k => `<div class="kpi"><div class="k-label">${esc(k.label)}</div><div class="k-value">${esc(k.value)}</div></div>`).join('')}
      </div>

      <div class="card">
        <h2 class="section" style="font-size:13px">Cash Flow — ${esc(d.periodLabel)}</h2><div class="section-rule"></div>
        ${cashFlowChartSvg(monthly)}
        <div class="stat-inline">
          <div class="s"><span class="dot" style="background:${BRAND.income}"></span>Total Income<b>${ghs(cfTotals.income)}</b></div>
          <div class="s"><span class="dot" style="background:${BRAND.expense}"></span>Total Expenses<b>${ghs(cfTotals.expenses)}</b></div>
          <div class="s"><span class="dot" style="background:${BRAND.net}"></span>Net Cash Flow<b style="color:${cfTotals.net >= 0 ? BRAND.income : BRAND.expense}">${ghs(cfTotals.net)}</b></div>
        </div>
      </div>
    </div>
  </section>

  <!-- COMPOSITION + PROPERTY PERFORMANCE -->
  <section class="page break">
    <div class="content">
      <h2 class="section">Portfolio Composition</h2><div class="section-rule"></div>
      <div class="card">
        <div class="comp">
          <div class="donut">${donut.svg}</div>
          <div class="legend">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND.muted};margin-bottom:10px;">Allocation by Asset Type</div>
            ${donut.legend || '<span class="muted">No composition data</span>'}
          </div>
        </div>
      </div>
      <div class="card">
        <h2 class="section" style="font-size:12px">By Region</h2><div class="section-rule"></div>
        <table>
          <thead><tr><th>Region</th><th class="num">Units</th><th class="num">Listed Value</th></tr></thead>
          <tbody>
            ${byRegion.length ? byRegion.map(r => `<tr><td>${esc(titleCase(r.region || ''))}</td><td class="num">${r.count}</td><td class="num">${ghs(r.value)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">No region data</td></tr>'}
          </tbody>
        </table>
      </div>

      <h2 class="section" style="margin-top:24px">Property Performance</h2><div class="section-rule"></div>
      <p class="muted" style="margin:0 0 4px;font-size:10.5px">Each property aggregates the financials of its units. Figures cover ${esc(d.periodLabel)}.</p>
      <table>
        <thead><tr>
          <th>Property</th><th class="num">Units</th><th>Region</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">NOI</th><th class="num">Occupancy</th>
        </tr></thead>
        <tbody>
          ${perfRows || '<tr><td colspan="7" class="muted">No active properties found.</td></tr>'}
        </tbody>
        ${buildings.length ? `<tfoot><tr><td>Portfolio Total</td><td class="num">${unitCount}</td><td></td><td class="num">${ghs(perfTotals.income)}</td><td class="num">${ghs(perfTotals.expenses)}</td><td class="num">${ghs(perfTotals.noi)}</td><td></td></tr></tfoot>` : ''}
      </table>
    </div>
  </section>

  <!-- RECEIVABLES + LEASE HEALTH -->
  <section class="page break">
    <div class="content">
      <h2 class="section">Receivables &amp; Lease Health</h2><div class="section-rule"></div>
      <div class="card">
        <h2 class="section" style="font-size:12px">Aged Receivables</h2><div class="section-rule"></div>
        ${aging}
        <div class="stat-inline">
          <div class="s">Total Outstanding<b>${ghs(rsum.totalOutstanding)}</b></div>
          <div class="s">Tenants in Arrears<b>${Number(rsum.tenantsWithArrears) || 0}</b></div>
        </div>
      </div>

      <div class="card">
        <h2 class="section" style="font-size:12px">Lease Expiry Outlook</h2><div class="section-rule"></div>
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="kpi"><div class="k-label">Expiring within 30 days</div><div class="k-value">${Number(exp.within30Days) || 0}</div></div>
          <div class="kpi"><div class="k-label">Within 60 days</div><div class="k-value">${Number(exp.within60Days) || 0}</div></div>
          <div class="kpi"><div class="k-label">Within 90 days</div><div class="k-value">${Number(exp.within90Days) || 0}</div></div>
        </div>
      </div>

      <p class="disclaimer">
        This report is generated by PROPMETRIK for the internal use of ${esc(d.orgName)} and is strictly confidential.
        Figures are derived from recorded transactions, leases and live market FX rates as at the generation date and are
        provided for informational purposes only; they do not constitute financial, investment or valuation advice.
        © ${new Date().getFullYear()} PROPMETRIK. All rights reserved.
      </p>
    </div>
  </section>

</body></html>`;
}

// ── Puppeteer render ──────────────────────────────────────────────────────────────

async function renderHtmlToPdf(html: string): Promise<Buffer> {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', bottom: '14mm', left: '0', right: '0' },
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `<div style="width:100%;font-family:'Helvetica Neue',Arial,sans-serif;font-size:7pt;color:#9ca3af;display:flex;justify-content:space-between;align-items:center;padding:0 16mm;">
        <span style="letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#0B0B0F;">PROP<span style="color:#D4A843;">METRIK</span></span>
        <span>Portfolio Financial Report · Confidential</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
        });
        return Buffer.from(pdf);
    } finally {
        if (browser) await browser.close();
    }
}

// ── Public entrypoint ──────────────────────────────────────────────────────────────

export async function generatePortfolioFinancialReportPdf(
    organizationId: string,
    options: PortfolioReportOptions = {}
): Promise<Buffer> {
    const data = await gatherData(organizationId, options.period);
    const html = buildHtml(data);
    return renderHtmlToPdf(html);
}
