/**
 * Cloud Storage Service — push documents to a user's connected OneDrive or Google Drive.
 *
 * BYO-user storage: the user connects their own drive via the integrations page (tokens in
 * user_integrations, provider 'onedrive' | 'google_drive'). This uploads a file into a
 * `PropMetrik` folder using the auto-refreshed access token. Same feature, two providers.
 *
 * @module services/integrations/cloudStorageService
 */

import { integrationConnectorService } from './integrationConnectorService';
import { pool } from '../../database';
import { logger } from '../../utils/logger';

export type StorageProvider = 'onedrive' | 'google_drive';
const FOLDER = 'PropMetrik';

export interface UploadResult { id: string; url: string | null; provider: StorageProvider }

// ── OneDrive (Microsoft Graph) ────────────────────────────────────────────────
async function uploadOneDrive(token: string, name: string, data: Buffer, mime: string): Promise<UploadResult> {
  // Simple upload (<250 MB): PUT to the path, creating the folder implicitly.
  const path = `${FOLDER}/${name}`.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime || 'application/octet-stream' },
    body: data,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `OneDrive upload failed (${res.status})`);
  return { id: j.id, url: j.webUrl || null, provider: 'onedrive' };
}

async function testOneDrive(token: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/drive?$select=owner,driveType', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `OneDrive test failed (${res.status})`);
  return { ok: true, detail: `OneDrive (${j.owner?.user?.displayName || j.driveType || 'connected'})` };
}

// ── Google Drive ──────────────────────────────────────────────────────────────
async function uploadGoogleDrive(token: string, name: string, data: Buffer, mime: string): Promise<UploadResult> {
  const folderId = await googleDriveFolderId(token);
  const boundary = 'pm_' + Math.abs(hashString(name + data.length)).toString(36);
  const metadata = JSON.stringify({ name, ...(folderId ? { parents: [folderId] } : {}) });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Google Drive upload failed (${res.status})`);
  return { id: j.id, url: j.webViewLink || null, provider: 'google_drive' };
}

/** Find or create the PropMetrik folder in the user's Drive (drive.file scope can create/manage it). */
async function googleDriveFolderId(token: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const find = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fj: any = await find.json().catch(() => ({}));
    if (find.ok && fj.files?.length) return fj.files[0].id;
    const create = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const cj: any = await create.json().catch(() => ({}));
    return create.ok ? cj.id : null;
  } catch {
    return null; // fall back to Drive root
  }
}

async function testGoogleDrive(token: string): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Google Drive test failed (${res.status})`);
  return { ok: true, detail: `Google Drive (${j.user?.emailAddress || 'connected'})` };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}

// ── Public API ────────────────────────────────────────────────────────────────
export const cloudStorageService = {
  /** Upload a document to the user's connected Drive/OneDrive. */
  async uploadDocument(userId: string, provider: StorageProvider, file: { name: string; data: Buffer; mimeType: string }): Promise<UploadResult> {
    const token = await integrationConnectorService.getValidUserToken(userId, provider);
    const result = provider === 'onedrive'
      ? await uploadOneDrive(token, file.name, file.data, file.mimeType)
      : await uploadGoogleDrive(token, file.name, file.data, file.mimeType);
    logger.info('Document pushed to cloud storage', { userId, provider, id: result.id });
    return result;
  },

  /** Verify the connection by reading drive metadata (used by /org-integrations/:type/test). */
  async testConnection(userId: string, provider: StorageProvider): Promise<{ ok: boolean; detail: string }> {
    const token = await integrationConnectorService.getValidUserToken(userId, provider);
    return provider === 'onedrive' ? testOneDrive(token) : testGoogleDrive(token);
  },

  /** Which cloud storage (if any) this user has connected — for auto-routing "Save to cloud". */
  async getConnectedStorageProvider(userId: string): Promise<StorageProvider | null> {
    const r = await pool.query(
      `SELECT provider FROM user_integrations WHERE user_id = $1 AND provider IN ('onedrive','google_drive') ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    return (r.rows[0]?.provider as StorageProvider) || null;
  },
};
