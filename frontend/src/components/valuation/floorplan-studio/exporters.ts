// ============================================================================
// Export Engine — PNG, SVG, DXF, JSON, PDF
// ============================================================================
import { jsPDF } from 'jspdf';
import type Konva from 'konva';
import type { Floor, Project } from './types';
import { measureBuilding, measureFloor, fmt } from './measure';
import { arcPoints, bbox, wallDir, wallPoint } from './geometry';
import { libDef } from './library';

declare global {
  interface Window {
    __fpStage?: Konva.Stage;
  }
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const safe = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60);

export function exportJSON(project: Project) {
  download(`${safe(project.name)}.json`, new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
}

export function exportPNG(project: Project) {
  const stage = window.__fpStage;
  if (!stage) return alert('Open the 2D view first.');
  const url = stage.toDataURL({ pixelRatio: 2 });
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe(project.name)}.png`;
  a.click();
}

// ---------------------------------------------------------------------------
// SVG — built from the model (crisp vector output, not a canvas dump)
// ---------------------------------------------------------------------------
export function floorToSVG(floor: Floor, project: Project): string {
  const m = measureFloor(floor);
  const pts = floor.walls.flatMap((w) => [w.a, w.b]);
  if (!pts.length) return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const bb = bbox(pts);
  const pad = 1.5;
  const x0 = bb.min.x - pad;
  const y0 = bb.min.y - pad;
  const wpx = (bb.max.x - bb.min.x + pad * 2) * 60;
  const hpx = (bb.max.y - bb.min.y + pad * 2) * 60;
  const S = 60;
  const X = (x: number) => ((x - x0) * S).toFixed(1);
  const Y = (y: number) => ((y - y0) * S).toFixed(1);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx.toFixed(0)}" height="${hpx.toFixed(0)}" viewBox="0 0 ${wpx.toFixed(0)} ${hpx.toFixed(0)}" font-family="Helvetica,Arial,sans-serif">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="white"/>`);
  // room fills + labels
  for (const r of m.rooms) {
    const d = r.poly.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.y)}`).join(' ') + ' Z';
    parts.push(`<path d="${d}" fill="#f1f5f9" stroke="none"/>`);
    const label = r.anchor ? (r.anchor.name ?? r.anchor.type) : 'Room';
    parts.push(
      `<text x="${X(r.centroid.x)}" y="${Y(r.centroid.y)}" text-anchor="middle" font-size="13" fill="#0f172a">${label}</text>`,
      `<text x="${X(r.centroid.x)}" y="${(parseFloat(Y(r.centroid.y)) + 15).toFixed(1)}" text-anchor="middle" font-size="11" fill="#64748b">${fmt(r.netArea)} m²</text>`,
    );
  }
  // walls
  for (const w of floor.walls) {
    const p = arcPoints(w.a, w.b, w.bulge ?? 0, 16);
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${X(q.x)},${Y(q.y)}`).join(' ');
    parts.push(`<path d="${d}" stroke="#111827" stroke-width="${(w.thickness * S).toFixed(1)}" fill="none" stroke-linecap="butt"/>`);
  }
  // openings
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const c = wallPoint(w, o.t);
    const dvec = wallDir(w, o.t);
    const hw = o.width / 2;
    const a = { x: c.x - dvec.x * hw, y: c.y - dvec.y * hw };
    const b = { x: c.x + dvec.x * hw, y: c.y + dvec.y * hw };
    const col = o.kind === 'door' ? '#b45309' : '#0284c7';
    parts.push(
      `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="white" stroke-width="${(w.thickness * S + 2).toFixed(1)}"/>`,
      `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${col}" stroke-width="3"/>`,
    );
  }
  // furniture outline
  for (const f of floor.furniture) {
    const def = libDef(f.def);
    parts.push(
      `<g transform="translate(${X(f.x + f.w / 2)},${Y(f.y + f.h / 2)}) rotate(${f.rot})"><rect x="${(-f.w / 2) * S}" y="${(-f.h / 2) * S}" width="${f.w * S}" height="${f.h * S}" fill="none" stroke="${def.color}" stroke-width="1.5" rx="3"/></g>`,
    );
  }
  parts.push(
    `<text x="12" y="22" font-size="15" font-weight="bold" fill="#0f172a">${project.name} — ${floor.name}</text>`,
    `<text x="12" y="40" font-size="11" fill="#475569">GFA ${fmt(m.grossFloorArea)} m² · Net ${fmt(m.netFloorArea)} m² · ${m.roomCount} rooms · ${new Date().toLocaleDateString('en-GB')} · scale bar: 1 m</text>`,
    `<line x1="12" y1="52" x2="${12 + S}" y2="52" stroke="#0f172a" stroke-width="3"/>`,
    // north arrow (screen-up = plan north by convention; rotate in CAD if needed)
    `<g transform="translate(${(wpx - 30).toFixed(0)},34)"><polygon points="0,-16 6,8 0,3 -6,8" fill="#0f172a"/><text x="0" y="22" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f172a">N</text></g>`,
  );
  parts.push('</svg>');
  return parts.join('\n');
}

export function exportSVG(project: Project, floor: Floor) {
  download(`${safe(project.name)}-${safe(floor.name)}.svg`, new Blob([floorToSVG(floor, project)], { type: 'image/svg+xml' }));
}

// ---------------------------------------------------------------------------
// DXF — minimal ENTITIES-only R12-compatible output (LibreCAD/AutoCAD load it)
// ---------------------------------------------------------------------------
export function exportDXF(project: Project, floor: Floor) {
  const L: string[] = [];
  const push = (...vals: (string | number)[]) => L.push(...vals.map(String));
  // header: drawing units = meters
  push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
  // layer table so CAD packages show named, colored layers
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 4);
  for (const [name, color] of [
    ['WALLS', 7],
    ['DOORS', 30],
    ['WINDOWS', 5],
    ['ROOMS', 3],
  ] as const) {
    push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
  }
  push(0, 'ENDTAB', 0, 'ENDSEC');
  push(0, 'SECTION', 2, 'ENTITIES');
  const m = measureFloor(floor);
  for (const w of floor.walls) {
    const pts = arcPoints(w.a, w.b, w.bulge ?? 0, 16);
    push(0, 'POLYLINE', 8, 'WALLS', 66, 1, 40, w.thickness, 41, w.thickness);
    for (const p of pts) push(0, 'VERTEX', 8, 'WALLS', 10, p.x.toFixed(4), 20, (-p.y).toFixed(4), 30, 0);
    push(0, 'SEQEND');
  }
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const c = wallPoint(w, o.t);
    const d = wallDir(w, o.t);
    const hw = o.width / 2;
    push(
      0, 'LINE', 8, o.kind === 'door' ? 'DOORS' : 'WINDOWS',
      10, (c.x - d.x * hw).toFixed(4), 20, (-(c.y - d.y * hw)).toFixed(4), 30, 0,
      11, (c.x + d.x * hw).toFixed(4), 21, (-(c.y + d.y * hw)).toFixed(4), 31, 0,
    );
  }
  for (const r of m.rooms) {
    const label = r.anchor ? (r.anchor.name ?? r.anchor.type) : 'Room';
    push(0, 'TEXT', 8, 'ROOMS', 10, r.centroid.x.toFixed(4), 20, (-r.centroid.y).toFixed(4), 30, 0, 40, 0.25, 1, `${label} ${fmt(r.netArea)}m2`);
  }
  push(0, 'ENDSEC', 0, 'EOF');
  const body = L.join('\r\n');
  download(`${safe(project.name)}-${safe(floor.name)}.dxf`, new Blob([body], { type: 'application/dxf' }));
}

// ---------------------------------------------------------------------------
// PDF — multi-floor booklet: one plan sheet per floor + full schedule of
// accommodation. Plans are rendered from the vector SVG so every floor
// exports faithfully regardless of which floor is on screen.
// ---------------------------------------------------------------------------

export function svgToPng(svg: string, scale = 2): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * scale));
      cv.height = Math.max(1, Math.round(img.height * scale));
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      resolve({ url: cv.toDataURL('image/png'), w: img.width, h: img.height });
    };
    img.onerror = () => reject(new Error('SVG rasterization failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** builds the booklet without saving — exported separately so it is testable */
export async function buildPdfBooklet(project: Project): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const floors = [...project.floors].sort((a, b) => a.level - b.level);
  const stamp = `generated ${new Date().toLocaleDateString('en-GB')} · PropMetrik Floor Plan Studio`;

  for (let i = 0; i < floors.length; i++) {
    const floor = floors[i];
    if (i > 0) doc.addPage('a4', 'landscape');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(project.name, 12, 14);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${floor.name}${floor.locked ? ' · LOCKED (measurements frozen)' : ''} · ${stamp}`, 12, 20);
    doc.setTextColor(0);
    if (floor.walls.length) {
      const png = await svgToPng(floorToSVG(floor, project), 2);
      const maxW = pw - 24;
      const maxH = ph - 32;
      const k = Math.min(maxW / png.w, maxH / png.h);
      doc.addImage(png.url, 'PNG', 12, 24, png.w * k, png.h * k, undefined, 'FAST');
    } else {
      doc.setTextColor(150);
      doc.text('(empty floor)', 12, 40);
      doc.setTextColor(0);
    }
  }

  // schedule of accommodation — all floors
  doc.addPage('a4', 'portrait');
  const b = measureBuilding(project);
  doc.setFontSize(14);
  doc.text('Schedule of Accommodation & Measurements', 14, 16);
  doc.setFontSize(10);
  let y = 28;
  const pageBreak = () => {
    if (y > 275) {
      doc.addPage('a4', 'portrait');
      y = 20;
    }
  };
  const row = (label: string, val: string, bold = false) => {
    pageBreak();
    if (bold) doc.setFont('helvetica', 'bold');
    doc.text(label, 14, y);
    doc.text(val, 196, y, { align: 'right' });
    if (bold) doc.setFont('helvetica', 'normal');
    y += 6;
  };
  for (const floor of floors) {
    const fm = b.floors.find((f) => f.floorId === floor.id)!;
    row(floor.name.toUpperCase(), '', true);
    doc.line(14, y - 4, 196, y - 4);
    for (const r of fm.rooms) {
      row(
        `  ${r.anchor ? (r.anchor.name ?? r.anchor.type) : 'Unassigned room'}`,
        `${r.netExact ? '' : '≈ '}${fmt(r.netArea)} m²`,
      );
    }
    row('  Gross Floor Area', `${fmt(fm.grossFloorArea)} m²`, true);
    row('  Net Floor Area', `${fmt(fm.netFloorArea)} m²`, true);
    row('  Wall length / area', `${fmt(fm.wallLength)} m / ${fmt(fm.wallArea)} m²`);
    row('  Windows · Doors', `${fm.windowCount} (${fmt(fm.windowArea)} m²) · ${fm.doorCount} (${fmt(fm.doorArea)} m²)`);
    y += 3;
  }
  y += 2;
  pageBreak();
  doc.line(14, y - 5, 196, y - 5);
  row('TOTAL GROSS FLOOR AREA', `${fmt(b.totalGFA)} m²`, true);
  row('TOTAL NET AREA', `${fmt(b.totalNFA)} m²`, true);
  row('Ground footprint', `${fmt(b.footprint)} m²`);
  row('Building height (incl. roof)', `${fmt(b.buildingHeight)} m`);
  row('Total rooms', String(b.totalRooms));
  y += 4;
  pageBreak();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'Gross areas measured at wall centerlines (IPMS 2). Net internal areas are exact finish-to-finish from miter-offset inner wall faces (IPMS 3B convention); values marked ≈ are approximations for irregular geometry.',
    14,
    y,
    { maxWidth: 182 },
  );
  doc.setTextColor(0);
  return doc;
}

export async function exportPDF(project: Project) {
  const doc = await buildPdfBooklet(project);
  doc.save(`${safe(project.name)}-plans.pdf`);
}
