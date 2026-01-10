/**
 * Secure Credentials Management Service
 * Handles encryption/decryption of partner API credentials
 * 
 * Features:
 * - AES-256-GCM encryption
 * - Key rotation support
 * - Multiple credential types (OAuth2, API keys, certificates)
 * - Secure key derivation from environment secrets
 * - Audit logging for credential access
 */

import crypto from 'crypto';
import { pool } from '../../database';
import { logger } from '../../utils/logger';

export interface CredentialData {
  // OAuth2 Client Credentials
  client_id?: string;
  client_secret?: string;
  token_endpoint?: string;
  scope?: string;
  
  // API Key
  api_key?: string;
  api_secret?: string;
  
  // Basic Auth
  username?: string;
  password?: string;
  
  // Bearer Token
  token?: string;
  
  // mTLS Certificate
  certificate?: string;
  private_key?: string;
  ca_certificate?: string;
  
  // Additional metadata
  custom_headers?: Record<string, string>;
  auth_url?: string;
  token_url?: string;
}

export interface StoredCredential {
  id: string;
  source_id: string;
  credential_name: string;
  credential_type: string;
  expires_at?: Date;
  last_rotated_at?: Date;
  rotation_frequency_days: number;
  is_active: boolean;
}

class CredentialsService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;  // 128 bits
  private readonly tagLength = 16; // 128 bits

  /**
   * Derive encryption key from environment secret
   */
  private deriveKey(keyId: string): Buffer {
    const baseSecret = process.env.CREDENTIALS_ENCRYPTION_SECRET;
    if (!baseSecret) {
      throw new Error('CREDENTIALS_ENCRYPTION_SECRET environment variable is required');
    }

    // Use PBKDF2 to derive a unique key for each credential type
    return crypto.pbkdf2Sync(baseSecret, keyId, 100000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt credential data
   */
  private encrypt(data: CredentialData, keyId: string): Buffer {
    const key = this.deriveKey(keyId);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;

    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    // Format: [IV][TAG][ENCRYPTED_DATA]
    return Buffer.concat([iv, tag, encrypted]);
  }

  /**
   * Decrypt credential data
   */
  private decrypt(encryptedData: Buffer, keyId: string): CredentialData {
    const key = this.deriveKey(keyId);
    
    // Extract components: [IV][TAG][ENCRYPTED_DATA]
    const iv = encryptedData.subarray(0, this.ivLength);
    const tag = encryptedData.subarray(this.ivLength, this.ivLength + this.tagLength);
    const encrypted = encryptedData.subarray(this.ivLength + this.tagLength);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Store encrypted credentials
   */
  async storeCredentials(
    sourceId: string,
    credentialName: string,
    credentialType: string,
    credentialData: CredentialData,
    expiresAt?: Date,
    rotationFrequencyDays = 90
  ): Promise<string> {
    const keyId = `${sourceId}:${credentialType}:${credentialName}`;
    const encrypted = this.encrypt(credentialData, keyId);

    const query = `
      INSERT INTO partner_credentials (
        source_id, credential_name, credential_type, encrypted_value,
        encryption_key_id, expires_at, rotation_frequency_days, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (source_id, credential_name) 
      DO UPDATE SET
        credential_type = EXCLUDED.credential_type,
        encrypted_value = EXCLUDED.encrypted_value,
        encryption_key_id = EXCLUDED.encryption_key_id,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      RETURNING id
    `;

    const result = await pool.query(query, [
      sourceId,
      credentialName,
      credentialType,
      encrypted,
      keyId,
      expiresAt,
      rotationFrequencyDays,
      'system'
    ]);

    const credentialId = result.rows[0].id;

    logger.info('Credentials stored successfully', {
      credentialId,
      sourceId,
      credentialName,
      credentialType,
      hasExpiration: !!expiresAt
    });

    return credentialId;
  }

  /**
   * Retrieve and decrypt credentials
   */
  async getCredentials(sourceId: string, credentialName: string): Promise<CredentialData | null> {
    const query = `
      SELECT encrypted_value, encryption_key_id, expires_at, is_active
      FROM partner_credentials
      WHERE source_id = $1 AND credential_name = $2 AND is_active = true
    `;

    const result = await pool.query(query, [sourceId, credentialName]);

    if (result.rows.length === 0) {
      return null;
    }

    const credential = result.rows[0];

    // Check expiration
    if (credential.expires_at && new Date() > credential.expires_at) {
      logger.warn('Credential has expired', {
        sourceId,
        credentialName,
        expiresAt: credential.expires_at
      });
      return null;
    }

    try {
      const decrypted = this.decrypt(credential.encrypted_value, credential.encryption_key_id);
      
      logger.info('Credentials retrieved successfully', {
        sourceId,
        credentialName
      });

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt credentials', {
        sourceId,
        credentialName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Credential decryption failed');
    }
  }

  /**
   * List stored credentials for a source (metadata only)
   */
  async listCredentials(sourceId: string): Promise<StoredCredential[]> {
    const query = `
      SELECT 
        id, source_id, credential_name, credential_type, expires_at,
        last_rotated_at, rotation_frequency_days, is_active
      FROM partner_credentials
      WHERE source_id = $1
      ORDER BY credential_name
    `;

    const result = await pool.query(query, [sourceId]);
    return result.rows;
  }

  /**
   * Rotate credentials (for OAuth2 token refresh)
   */
  async rotateCredentials(
    sourceId: string,
    credentialName: string,
    newCredentialData: CredentialData
  ): Promise<void> {
    const keyId = `${sourceId}:credential:${credentialName}`;
    const encrypted = this.encrypt(newCredentialData, keyId);

    const query = `
      UPDATE partner_credentials
      SET 
        encrypted_value = $1,
        last_rotated_at = NOW(),
        updated_at = NOW()
      WHERE source_id = $2 AND credential_name = $3
    `;

    await pool.query(query, [encrypted, sourceId, credentialName]);

    logger.info('Credentials rotated successfully', {
      sourceId,
      credentialName
    });
  }

  /**
   * Deactivate credentials
   */
  async deactivateCredentials(sourceId: string, credentialName: string): Promise<void> {
    const query = `
      UPDATE partner_credentials
      SET is_active = false, updated_at = NOW()
      WHERE source_id = $1 AND credential_name = $2
    `;

    await pool.query(query, [sourceId, credentialName]);

    logger.info('Credentials deactivated', {
      sourceId,
      credentialName
    });
  }

  /**
   * Get credentials that need rotation
   */
  async getCredentialsNeedingRotation(): Promise<Array<{
    source_id: string;
    credential_name: string;
    credential_type: string;
    last_rotated_at?: Date;
    rotation_frequency_days: number;
  }>> {
    const query = `
      SELECT source_id, credential_name, credential_type, last_rotated_at, rotation_frequency_days
      FROM partner_credentials
      WHERE is_active = true
      AND (
        last_rotated_at IS NULL 
        OR last_rotated_at < NOW() - INTERVAL '1 day' * rotation_frequency_days
      )
    `;

    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Create OAuth2 client credentials
   */
  async storeOAuth2Credentials(
    sourceId: string,
    credentialName: string,
    clientId: string,
    clientSecret: string,
    tokenEndpoint: string,
    scope?: string
  ): Promise<string> {
    const credentialData: CredentialData = {
      client_id: clientId,
      client_secret: clientSecret,
      token_endpoint: tokenEndpoint,
      scope: scope || 'read'
    };

    return this.storeCredentials(
      sourceId,
      credentialName,
      'oauth2_client',
      credentialData,
      undefined,
      30 // OAuth2 secrets should rotate monthly
    );
  }

  /**
   * Create API key credentials
   */
  async storeApiKeyCredentials(
    sourceId: string,
    credentialName: string,
    apiKey: string,
    apiSecret?: string,
    customHeaders?: Record<string, string>
  ): Promise<string> {
    const credentialData: CredentialData = {
      api_key: apiKey,
      api_secret: apiSecret,
      custom_headers: customHeaders
    };

    return this.storeCredentials(
      sourceId,
      credentialName,
      'api_key',
      credentialData,
      undefined,
      90 // API keys rotate quarterly
    );
  }

  /**
   * Create basic auth credentials
   */
  async storeBasicAuthCredentials(
    sourceId: string,
    credentialName: string,
    username: string,
    password: string
  ): Promise<string> {
    const credentialData: CredentialData = {
      username,
      password
    };

    return this.storeCredentials(
      sourceId,
      credentialName,
      'username_password',
      credentialData,
      undefined,
      60 // Basic auth passwords rotate every 2 months
    );
  }

  /**
   * Create mTLS certificate credentials
   */
  async storeCertificateCredentials(
    sourceId: string,
    credentialName: string,
    certificate: string,
    privateKey: string,
    caCertificate?: string
  ): Promise<string> {
    const credentialData: CredentialData = {
      certificate,
      private_key: privateKey,
      ca_certificate: caCertificate
    };

    return this.storeCredentials(
      sourceId,
      credentialName,
      'certificate',
      credentialData,
      undefined,
      365 // Certificates rotate annually
    );
  }
}

export const credentialsService = new CredentialsService();