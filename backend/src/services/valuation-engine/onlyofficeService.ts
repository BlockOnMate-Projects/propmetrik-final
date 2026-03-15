/**
 * OnlyOffice Document Server Integration Service
 * 
 * Handles JWT token generation, editor configuration, and document callbacks
 * for in-browser DOCX editing with OnlyOffice Document Server.
 * 
 * Phase 3: Document Editor Integration
 */

import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { query } from '../../database';
import { logger } from '../../utils/logger';
import { getPresignedDownloadUrl, uploadFile } from '../../database/minio';

// =====================================================
// CONFIGURATION
// =====================================================

const ONLYOFFICE_INTERNAL_URL =
  process.env.ONLYOFFICE_INTERNAL_URL ||
  process.env.ONLYOFFICE_URL ||
  'http://localhost:8080';
const ONLYOFFICE_PUBLIC_URL =
  process.env.ONLYOFFICE_PUBLIC_URL ||
  process.env.ONLYOFFICE_URL ||
  ONLYOFFICE_INTERNAL_URL;
const ONLYOFFICE_JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || 'propmetrik_onlyoffice_secret';
const ONLYOFFICE_JWT_ENABLED = process.env.ONLYOFFICE_JWT_ENABLED !== 'false'; // Default to true
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const MINIO_REPORTS_BUCKET = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-documents';

// Docker host URL for OnlyOffice to access host services
// On macOS/Windows Docker Desktop, use host.docker.internal
// On Linux, you may need to use the actual host IP
const DOCKER_HOST_URL = process.env.DOCKER_HOST_URL || 'host.docker.internal';

/**
 * Convert localhost URLs to Docker-accessible URLs
 * OnlyOffice runs in Docker and can't access localhost
 */
function makeDockerAccessible(url: string): string {
  return url
    .replace('localhost', DOCKER_HOST_URL)
    .replace('127.0.0.1', DOCKER_HOST_URL);
}

// =====================================================
// TYPES
// =====================================================

export interface EditorConfig {
  documentType: 'word' | 'cell' | 'slide';
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: {
      comment: boolean;
      download: boolean;
      edit: boolean;
      print: boolean;
      review: boolean;
    };
  };
  editorConfig: {
    callbackUrl: string;
    lang: string;
    mode: 'edit' | 'view';
    user: {
      id: string;
      name: string;
    };
    customization: {
      autosave: boolean;
      chat: boolean;
      comments: boolean;
      compactHeader: boolean;
      compactToolbar: boolean;
      forcesave: boolean;
      help: boolean;
      hideRightMenu: boolean;
      logo: {
        image: string;
        imageEmbedded: string;
        url: string;
      };
      reviewDisplay: string;
      zoom: number;
    };
  };
  token?: string;
}

export interface CallbackData {
  actions?: Array<{ type: number; userid: string }>;
  changeshistory?: any[];
  changesurl?: string;
  forcesavetype?: number;
  history?: any;
  key: string;
  status: number;
  url?: string;
  users?: string[];
  userdata?: string;
}

export interface CallbackResponse {
  error: number;
  message?: string;
}

// Callback status codes
export const CallbackStatus = {
  EDITING: 1,
  READY_FOR_SAVING: 2,
  SAVING_ERROR: 3,
  CLOSED_NO_CHANGES: 4,
  SAVING: 6,
  FORCE_SAVE_ERROR: 7,
} as const;

// =====================================================
// SERVICE
// =====================================================

class OnlyOfficeService {
  /**
   * Generate a unique document key for OnlyOffice
   * Key must change when document content changes
   */
  generateDocumentKey(reportId: string, version: number): string {
    const timestamp = Date.now();
    const hash = crypto
      .createHash('md5')
      .update(`${reportId}-${version}-${timestamp}`)
      .digest('hex')
      .substring(0, 20);
    return `doc_${hash}`;
  }

  /**
   * Sign a payload with JWT for OnlyOffice
   */
  signToken(payload: object): string {
    return jwt.sign(payload, ONLYOFFICE_JWT_SECRET, {
      expiresIn: '24h',
    });
  }

  /**
   * Verify JWT token from OnlyOffice callback
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, ONLYOFFICE_JWT_SECRET);
    } catch (error) {
      logger.error('Invalid OnlyOffice JWT token', { error });
      return null;
    }
  }

  /**
   * Get editor configuration for a report
   */
  async getEditorConfig(
    reportId: string,
    userId: string,
    userName: string,
    mode: 'edit' | 'view' = 'edit'
  ): Promise<EditorConfig> {
    // Get report details
    const reportResult = await query(
      `SELECT vr.*, v.property_id, p.title as property_title
       FROM valuation_reports vr
       JOIN valuations v ON vr.valuation_id = v.id
       JOIN properties p ON v.property_id = p.id
       WHERE vr.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error(`Report not found: ${reportId}`);
    }

    const report = reportResult.rows[0];

    // Check if report is editable
    if (mode === 'edit' && report.status === 'approved') {
      throw new Error('Cannot edit approved report');
    }

    // Get document URL - use docx_storage_key from the report
    if (!report.docx_storage_key) {
      throw new Error('Report document not generated. Generate DOCX first.');
    }

    // Get signed URL for the document (valid for 24 hours)
    const documentUrl = await getPresignedDownloadUrl(
      MINIO_REPORTS_BUCKET,
      report.docx_storage_key,
      24 * 60 * 60
    );

    // Convert URL to be accessible from Docker container
    const dockerAccessibleUrl = makeDockerAccessible(documentUrl);

    // Generate unique document key
    const documentKey = this.generateDocumentKey(reportId, report.version);

    // Callback URL must also be Docker-accessible
    const callbackUrl = makeDockerAccessible(`${BACKEND_URL}/api/v1/reports/${reportId}/callback`);

    // Build editor configuration
    const config: EditorConfig = {
      documentType: 'word',
      document: {
        fileType: 'docx',
        key: documentKey,
        title: `Valuation Report - ${report.property_title || 'Property'}.docx`,
        url: dockerAccessibleUrl,
        permissions: {
          comment: true,
          download: true,
          edit: mode === 'edit',
          print: true,
          review: mode === 'edit',
        },
      },
      editorConfig: {
        callbackUrl,
        lang: 'en',
        mode,
        user: {
          id: userId,
          name: userName,
        },
        customization: {
          autosave: true,
          chat: false,
          comments: true,
          compactHeader: false,
          compactToolbar: false,
          forcesave: true,
          help: true,
          hideRightMenu: false,
          logo: {
            image: `${BACKEND_URL}/branding/logo.png`,
            imageEmbedded: `${BACKEND_URL}/branding/logo-embedded.png`,
            url: 'https://propmetrik.com',
          },
          reviewDisplay: 'markup',
          zoom: 100,
        },
      },
    };

    // Sign the configuration with JWT (only if JWT is enabled)
    if (ONLYOFFICE_JWT_ENABLED) {
      config.token = this.signToken(config);
    }

    return config;
  }

  /**
   * Handle callback from OnlyOffice when document is saved
   */
  async handleCallback(
    reportId: string,
    callbackData: CallbackData
  ): Promise<CallbackResponse> {
    logger.info('OnlyOffice callback received', {
      reportId,
      status: callbackData.status,
      key: callbackData.key,
    });

    try {
      switch (callbackData.status) {
        case CallbackStatus.EDITING:
          // Document is being edited
          logger.debug('Document is being edited', { reportId });
          return { error: 0 };

        case CallbackStatus.READY_FOR_SAVING:
        case CallbackStatus.SAVING:
          // Document is ready to save or being saved
          if (callbackData.url) {
            await this.saveDocument(reportId, callbackData.url);
          }
          return { error: 0 };

        case CallbackStatus.CLOSED_NO_CHANGES:
          // Editor closed without changes
          logger.debug('Editor closed without changes', { reportId });
          return { error: 0 };

        case CallbackStatus.SAVING_ERROR:
        case CallbackStatus.FORCE_SAVE_ERROR:
          // Saving error occurred
          logger.error('Document saving error', {
            reportId,
            status: callbackData.status,
          });
          return { error: 0 }; // Still return 0 to acknowledge

        default:
          logger.warn('Unknown callback status', {
            reportId,
            status: callbackData.status,
          });
          return { error: 0 };
      }
    } catch (error: any) {
      logger.error('Callback handling failed', {
        reportId,
        error: error.message,
      });
      return { error: 1, message: error.message };
    }
  }

  /**
   * Save document from OnlyOffice callback URL
   */
  private async saveDocument(reportId: string, documentUrl: string): Promise<void> {
    logger.info('Saving document from OnlyOffice', { reportId, documentUrl });

    try {
      // Fetch the document from OnlyOffice
      const response = await fetch(documentUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Get current report details
      const reportResult = await query(
        `SELECT * FROM valuation_reports WHERE id = $1`,
        [reportId]
      );

      if (reportResult.rows.length === 0) {
        throw new Error(`Report not found: ${reportId}`);
      }

      const report = reportResult.rows[0];
      const content = report.content as any;

      // Upload to MinIO with new timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newStorageKey = `reports/${reportId}/valuation_report_v${report.version}_${timestamp}.docx`;

      await uploadFile(
        MINIO_REPORTS_BUCKET,
        newStorageKey,
        buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      // Update report record
      await query(
        `UPDATE valuation_reports 
         SET content = content || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            storage_key: newStorageKey,
            last_saved: new Date().toISOString(),
            saved_from_editor: true,
          }),
          reportId,
        ]
      );

      // Log audit event
      await query(
        `INSERT INTO report_audit_log (report_id, action, details)
         VALUES ($1, 'edited', $2)`,
        [
          reportId,
          JSON.stringify({
            source: 'onlyoffice_editor',
            storage_key: newStorageKey,
            file_size: buffer.length,
          }),
        ]
      );

      logger.info('Document saved successfully', {
        reportId,
        storageKey: newStorageKey,
        size: buffer.length,
      });
    } catch (error: any) {
      logger.error('Failed to save document', {
        reportId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Force save the current document state
   */
  async forceSave(reportId: string): Promise<void> {
    // This would typically call the OnlyOffice Command Service API
    // to force save the document. For now, we'll log the request.
    logger.info('Force save requested', { reportId });

    // In a full implementation, you would call:
    // POST http://documentserver/coauthoring/CommandService.ashx
    // with command: "forcesave" and key: documentKey
  }

  /**
   * Get OnlyOffice server URL for frontend
   */
  getServerUrl(): string {
    return ONLYOFFICE_PUBLIC_URL;
  }

  /**
   * Check if OnlyOffice server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${ONLYOFFICE_INTERNAL_URL}/healthcheck`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      logger.warn('OnlyOffice server not available', { error });
      return false;
    }
  }
}

// Export singleton instance
export const onlyofficeService = new OnlyOfficeService();
