/**
 * Valuation Documents & Photos service.
 *
 * Mirrors floorPlanService's image handling: the file lives in MinIO, we store the
 * `minio://bucket/key` reference in valuation_documents, and the report (viewer +
 * signed DOCX) embeds by valuation_id. Handles three doc types:
 *   - 'photo'          -> subject pictures (Appendix D)
 *   - 'title_document' -> title/indenture scans (Appendix E)
 *   - 'location_map'   -> auto-generated satellite/location map (Appendix C)
 */

import axios from 'axios';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pool } from '../../database';
import { uploadFile, getPresignedDownloadUrl, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

const execFileP = promisify(execFile);

/**
 * Rasterize a PDF buffer to PNG page images via poppler's `pdftoppm` (so uploaded PDF
 * documents — e.g. title deeds — can embed in the DOCX report, which can't hold a PDF).
 * Returns [] if poppler is unavailable or the conversion fails (caller degrades gracefully).
 */
async function rasterizePdfToPngs(pdf: Buffer, maxPages = 15): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pmtk-pdfdoc-'));
  try {
    const inPath = path.join(dir, 'in.pdf');
    await writeFile(inPath, pdf);
    await execFileP('pdftoppm', ['-png', '-r', '150', '-l', String(maxPages), inPath, path.join(dir, 'page')], { timeout: 45_000 });
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    const out: Buffer[] = [];
    for (const f of files) out.push(await readFile(path.join(dir, f)));
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export type ValuationDocType = 'photo' | 'title_document' | 'location_map';

export interface ValuationDocImage {
  docType: string;
  caption: string | null;
  filename: string | null;
  mime: string;
  buffer: Buffer;
}

class ValuationDocumentService {
  /** Upload a base64 data URL (image or PDF) to MinIO and record it for the valuation. */
  async saveFromDataUrl(input: {
    valuationId: string;
    propertyId?: string | null;
    dataUrl: string;
    filename?: string | null;
    docType?: ValuationDocType;
    caption?: string | null;
    displayOrder?: number;
    createdBy?: string | null;
  }) {
    const m = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error('Invalid data URL (expected data:<mime>;base64,<data>)');
    const mime = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    const ext = (mime.split('/')[1] || 'bin').replace('+xml', '').replace('jpeg', 'jpg');
    const docType: ValuationDocType = input.docType || 'photo';

    const bucket = buckets.uploads || 'propmetrik-uploads';
    const key = `valuation-documents/${input.valuationId}/${docType}-${Date.now()}-${buffer.length}.${ext}`;
    await uploadFile(bucket, key, buffer, mime, { 'x-amz-meta-valuation-id': input.valuationId });
    const storageUrl = `minio://${bucket}/${key}`;

    const res = await pool.query(
      `INSERT INTO valuation_documents
        (valuation_id, property_id, doc_type, storage_url, filename, mime_type, caption, file_size_bytes, display_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.valuationId, input.propertyId || null, docType, storageUrl,
        input.filename || null, mime, input.caption || null, buffer.length,
        input.displayOrder ?? 0, input.createdBy || null,
      ]
    );
    logger.info('Valuation document saved', { valuationId: input.valuationId, docType, size: buffer.length });
    return res.rows[0];
  }

  /** List documents for a valuation (optionally filtered by type), with presigned preview URLs. */
  async list(valuationId: string, docType?: ValuationDocType) {
    const params: any[] = [valuationId];
    let q = `SELECT * FROM valuation_documents WHERE valuation_id = $1`;
    if (docType) { q += ` AND doc_type = $2`; params.push(docType); }
    q += ` ORDER BY doc_type, display_order, created_at`;
    const { rows } = await pool.query(q, params);
    // Attach short-lived preview URLs so the frontend can render thumbnails.
    for (const r of rows) {
      const match = String(r.storage_url || '').match(/^minio:\/\/([^/]+)\/(.+)$/);
      if (match) {
        try { r.url = await getPresignedDownloadUrl(match[1], match[2], 3600); } catch { r.url = null; }
      }
    }
    return rows;
  }

  async remove(docId: string, valuationId: string) {
    await pool.query(`DELETE FROM valuation_documents WHERE id = $1 AND valuation_id = $2`, [docId, valuationId]);
  }

  /** Fetch image buffers (for embedding in the DOCX) for the given doc types, in order. */
  async getImageBuffers(valuationId: string, docTypes: ValuationDocType[]): Promise<ValuationDocImage[]> {
    const { rows } = await pool.query(
      `SELECT * FROM valuation_documents
       WHERE valuation_id = $1 AND doc_type = ANY($2)
       ORDER BY doc_type, display_order, created_at`,
      [valuationId, docTypes]
    );
    const out: ValuationDocImage[] = [];
    for (const r of rows) {
      const match = String(r.storage_url || '').match(/^minio:\/\/([^/]+)\/(.+)$/);
      if (!match) continue;
      try {
        const url = await getPresignedDownloadUrl(match[1], match[2], 600);
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20_000 });
        const buf = Buffer.from(resp.data);
        const mime = String(r.mime_type || '').toLowerCase();
        if (mime.includes('pdf')) {
          // The DOCX can't embed a PDF — rasterize each page to PNG and embed those.
          const pages = await rasterizePdfToPngs(buf).catch((e: any) => {
            logger.warn('valuationDocument: PDF rasterize failed', { id: r.id, error: e.message });
            return [] as Buffer[];
          });
          pages.forEach((pageBuf, i) => out.push({
            docType: r.doc_type,
            caption: pages.length > 1 ? `${r.caption || r.filename || 'Document'} (page ${i + 1})` : (r.caption || r.filename),
            filename: r.filename,
            mime: 'image/png',
            buffer: pageBuf,
          }));
        } else if (mime.startsWith('image/')) {
          out.push({ docType: r.doc_type, caption: r.caption, filename: r.filename, mime: r.mime_type, buffer: buf });
        }
      } catch (e: any) {
        logger.warn('valuationDocument: failed to fetch document for report', { id: r.id, error: e.message });
      }
    }
    return out;
  }

  /**
   * Render a single document as ONE image for the report VIEWER (<img> — avoids the iframe
   * X-Frame-Options problem). PDFs are rasterized and stacked vertically into one tall PNG;
   * images are returned as-is. Returns null if the doc is missing or can't be rendered.
   */
  async getDocumentImage(valuationId: string, docId: string): Promise<{ buffer: Buffer; mime: string; filename: string } | null> {
    const { rows } = await pool.query(
      `SELECT * FROM valuation_documents WHERE id = $1 AND valuation_id = $2`,
      [docId, valuationId]
    );
    const r = rows[0];
    if (!r) return null;
    const match = String(r.storage_url || '').match(/^minio:\/\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const url = await getPresignedDownloadUrl(match[1], match[2], 600);
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20_000 });
    const buf = Buffer.from(resp.data);
    const mime = String(r.mime_type || '').toLowerCase();

    if (mime.startsWith('image/')) {
      return { buffer: buf, mime: r.mime_type, filename: r.filename };
    }
    if (mime.includes('pdf')) {
      const pages = await rasterizePdfToPngs(buf);
      if (pages.length === 0) return null;
      if (pages.length === 1) return { buffer: pages[0], mime: 'image/png', filename: r.filename };
      // Stack pages vertically into one PNG.
      const metas = await Promise.all(pages.map((p) => sharp(p).metadata()));
      const width = Math.max(...metas.map((m) => m.width || 0));
      const gap = 16;
      const totalHeight = metas.reduce((h, m) => h + (m.height || 0), 0) + gap * (pages.length - 1);
      let top = 0;
      const composites = pages.map((input, i) => {
        const c = { input, top, left: 0 };
        top += (metas[i].height || 0) + gap;
        return c;
      });
      const combined = await sharp({
        create: { width, height: totalHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      }).composite(composites).png().toBuffer();
      return { buffer: combined, mime: 'image/png', filename: r.filename };
    }
    return null;
  }

  /**
   * Generate a satellite/location map for the subject coordinates via Google Static Maps,
   * store it as a 'location_map' document (replacing any prior one), and return the row.
   */
  async generateLocationMap(
    valuationId: string,
    lat: number,
    lng: number,
    opts?: { propertyId?: string | null; zoom?: number }
  ): Promise<any | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { logger.warn('No GOOGLE_MAPS_API_KEY — cannot generate location map'); return null; }
    const zoom = opts?.zoom ?? 17;
    const url =
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
      `&zoom=${zoom}&size=640x600&scale=2&maptype=hybrid` +
      `&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20_000 });
      const buffer = Buffer.from(resp.data);
      await pool.query(`DELETE FROM valuation_documents WHERE valuation_id = $1 AND doc_type = 'location_map'`, [valuationId]);
      const bucket = buckets.uploads || 'propmetrik-uploads';
      const key = `valuation-documents/${valuationId}/location_map-${Date.now()}.png`;
      await uploadFile(bucket, key, buffer, 'image/png', { 'x-amz-meta-valuation-id': valuationId });
      const { rows } = await pool.query(
        `INSERT INTO valuation_documents
          (valuation_id, property_id, doc_type, storage_url, filename, mime_type, caption, file_size_bytes)
         VALUES ($1,$2,'location_map',$3,'location_map.png','image/png',$4,$5) RETURNING *`,
        [valuationId, opts?.propertyId || null, `minio://${bucket}/${key}`, 'Satellite/Location Map', buffer.length]
      );
      logger.info('Location map generated', { valuationId, size: buffer.length });
      return rows[0];
    } catch (e: any) {
      logger.warn('Failed to generate location map', { valuationId, error: e.message });
      return null;
    }
  }
}

export const valuationDocumentService = new ValuationDocumentService();
export default valuationDocumentService;
