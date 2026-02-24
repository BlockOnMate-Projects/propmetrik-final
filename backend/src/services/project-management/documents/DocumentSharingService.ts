/**
 * Document Sharing Service
 * 
 * Phase 3.10: Split projectDocumentService
 * 
 * Manages document sharing:
 * - Create share links
 * - Password protection
 * - Expiration handling
 * - Access logging
 * 
 * @module services/project-management/documents/DocumentSharingService
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import {
  DocumentShare,
  CreateShareInput,
  mapRowToShare,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class DocumentSharingServiceImpl extends BaseService {
  constructor() {
    super('DocumentSharingService');
  }

  /**
   * Create a share link for a document
   */
  async createShare(input: CreateShareInput): Promise<DocumentShare> {
    const id = uuidv4();
    const shareToken = this.generateShareToken();
    
    // Hash password if provided
    let passwordHash: string | null = null;
    if (input.password) {
      passwordHash = await this.hashPassword(input.password);
    }

    // Generate share URL (base URL would be configured in environment)
    const shareUrl = `/shared/documents/${shareToken}`;

    const result = await this.query(
      `INSERT INTO document_shares (
         id, document_id, share_token, share_url,
         expires_at, password_hash,
         max_downloads, download_count,
         recipient_email, recipient_name,
         can_download, can_view_only,
         access_log, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, '[]', $12)
       RETURNING *`,
      [
        id,
        input.documentId,
        shareToken,
        shareUrl,
        input.expiresAt,
        passwordHash,
        input.maxDownloads,
        input.recipientEmail,
        input.recipientName,
        input.canDownload ?? true,
        input.canViewOnly ?? false,
        input.createdBy,
      ]
    );

    return mapRowToShare(result.rows[0]);
  }

  /**
   * Get share by token
   */
  async getShareByToken(shareToken: string): Promise<DocumentShare | null> {
    const result = await this.query(
      'SELECT * FROM document_shares WHERE share_token = $1',
      [shareToken]
    );

    return result.rows[0] ? mapRowToShare(result.rows[0]) : null;
  }

  /**
   * Get share by ID
   */
  async getShareById(shareId: string): Promise<DocumentShare | null> {
    const result = await this.query(
      'SELECT * FROM document_shares WHERE id = $1',
      [shareId]
    );

    return result.rows[0] ? mapRowToShare(result.rows[0]) : null;
  }

  /**
   * Validate share access
   */
  async validateShare(
    shareToken: string,
    password?: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    share?: DocumentShare;
    documentId?: string;
  }> {
    const share = await this.getShareByToken(shareToken);
    
    if (!share) {
      return { valid: false, reason: 'Share link not found' };
    }

    // Check expiration
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return { valid: false, reason: 'Share link has expired' };
    }

    // Check download limit
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      return { valid: false, reason: 'Download limit reached' };
    }

    // Check password
    if (share.passwordHash) {
      if (!password) {
        return { valid: false, reason: 'Password required' };
      }
      const passwordValid = await this.verifyPassword(password, share.passwordHash);
      if (!passwordValid) {
        return { valid: false, reason: 'Invalid password' };
      }
    }

    return {
      valid: true,
      share,
      documentId: share.documentId,
    };
  }

  /**
   * Record share access
   */
  async recordShareAccess(
    shareToken: string,
    accessInfo: {
      ip?: string;
      userAgent?: string;
      isDownload?: boolean;
    }
  ): Promise<void> {
    const accessEntry = {
      accessedAt: new Date().toISOString(),
      ip: accessInfo.ip,
      userAgent: accessInfo.userAgent,
      type: accessInfo.isDownload ? 'download' : 'view',
    };

    await this.query(
      `UPDATE document_shares
       SET 
         last_accessed_at = NOW(),
         access_log = access_log || $1::jsonb,
         download_count = download_count + $2
       WHERE share_token = $3`,
      [
        JSON.stringify(accessEntry),
        accessInfo.isDownload ? 1 : 0,
        shareToken,
      ]
    );
  }

  /**
   * Delete a share
   */
  async deleteShare(shareId: string): Promise<boolean> {
    const result = await this.query(
      'DELETE FROM document_shares WHERE id = $1 RETURNING id',
      [shareId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Revoke share by token
   */
  async revokeShare(shareToken: string): Promise<boolean> {
    const result = await this.query(
      'DELETE FROM document_shares WHERE share_token = $1 RETURNING id',
      [shareToken]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all shares for a document
   */
  async getSharesByDocument(documentId: string): Promise<DocumentShare[]> {
    const result = await this.query(
      'SELECT * FROM document_shares WHERE document_id = $1 ORDER BY created_at DESC',
      [documentId]
    );

    return result.rows.map(mapRowToShare);
  }

  /**
   * Get active shares for a document (not expired)
   */
  async getActiveSharesByDocument(documentId: string): Promise<DocumentShare[]> {
    const result = await this.query(
      `SELECT * FROM document_shares 
       WHERE document_id = $1 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_downloads IS NULL OR download_count < max_downloads)
       ORDER BY created_at DESC`,
      [documentId]
    );

    return result.rows.map(mapRowToShare);
  }

  /**
   * Update share settings
   */
  async updateShare(
    shareId: string,
    input: {
      expiresAt?: string | null;
      maxDownloads?: number | null;
      canDownload?: boolean;
      canViewOnly?: boolean;
      password?: string | null;
    }
  ): Promise<DocumentShare | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(input.expiresAt);
    }
    if (input.maxDownloads !== undefined) {
      updates.push(`max_downloads = $${paramIndex++}`);
      values.push(input.maxDownloads);
    }
    if (input.canDownload !== undefined) {
      updates.push(`can_download = $${paramIndex++}`);
      values.push(input.canDownload);
    }
    if (input.canViewOnly !== undefined) {
      updates.push(`can_view_only = $${paramIndex++}`);
      values.push(input.canViewOnly);
    }
    if (input.password !== undefined) {
      if (input.password === null) {
        updates.push(`password_hash = $${paramIndex++}`);
        values.push(null);
      } else {
        const hash = await this.hashPassword(input.password);
        updates.push(`password_hash = $${paramIndex++}`);
        values.push(hash);
      }
    }

    if (updates.length === 0) {
      return this.getShareById(shareId);
    }

    values.push(shareId);

    const result = await this.query(
      `UPDATE document_shares SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0] ? mapRowToShare(result.rows[0]) : null;
  }

  /**
   * Clean up expired shares
   */
  async cleanupExpiredShares(): Promise<number> {
    const result = await this.query(
      'DELETE FROM document_shares WHERE expires_at < NOW() RETURNING id'
    );

    return result.rowCount ?? 0;
  }

  /**
   * Get share statistics
   */
  async getShareStats(shareId: string): Promise<{
    totalViews: number;
    totalDownloads: number;
    uniqueIps: number;
    lastAccessed: string | null;
    accessByDate: Record<string, number>;
  }> {
    const share = await this.getShareById(shareId);
    if (!share) {
      return {
        totalViews: 0,
        totalDownloads: 0,
        uniqueIps: 0,
        lastAccessed: null,
        accessByDate: {},
      };
    }

    const accessLog = share.accessLog || [];
    const uniqueIps = new Set(accessLog.map(a => a.ip).filter(Boolean));
    const accessByDate: Record<string, number> = {};

    let totalViews = 0;
    let totalDownloads = 0;

    for (const entry of accessLog) {
      const date = entry.accessedAt?.split('T')[0];
      if (date) {
        accessByDate[date] = (accessByDate[date] || 0) + 1;
      }
      if ((entry as any).type === 'download') {
        totalDownloads++;
      } else {
        totalViews++;
      }
    }

    return {
      totalViews,
      totalDownloads,
      uniqueIps: uniqueIps.size,
      lastAccessed: share.lastAccessedAt || null,
      accessByDate,
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private generateShareToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const documentSharingService = new DocumentSharingServiceImpl();
