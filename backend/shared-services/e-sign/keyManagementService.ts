/**
 * Key Management Service
 * Handles user signing key generation and storage
 * Simplified implementation (no Vault for initial testing)
 */

import { createHash, generateKeyPairSync, createSign, createVerify } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';
import { UserSigningKey } from './types';

// In production, this would be fetched from environment/Vault
const KEY_ENCRYPTION_SECRET = process.env.ESIGN_KEY_SECRET || 'dev-secret-change-in-prod';

export class KeyManagementService {
    /**
     * Get or create a signing key pair for a user
     */
    async getOrCreateUserKey(userId: string): Promise<UserSigningKey> {
        // Check for existing active key
        const existingKey = await this.getActiveUserKey(userId);
        if (existingKey) {
            return existingKey;
        }

        // Generate new key pair
        return this.createUserKey(userId);
    }

    /**
     * Get active signing key for a user
     */
    async getActiveUserKey(userId: string): Promise<UserSigningKey | null> {
        const result = await db.query(
            `SELECT * FROM user_signing_keys WHERE user_id = $1 AND is_active = TRUE`,
            [userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapToUserSigningKey(result.rows[0]);
    }

    /**
     * Create a new signing key pair for a user
     */
    async createUserKey(userId: string): Promise<UserSigningKey> {
        // Generate ECDSA P-256 key pair
        const { publicKey, privateKey } = generateKeyPairSync('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Encrypt private key for storage (simplified - use Vault in production)
        const encryptedPrivateKey = this.encryptPrivateKey(privateKey);

        // Deactivate any existing keys
        await db.query(
            `UPDATE user_signing_keys SET is_active = FALSE WHERE user_id = $1`,
            [userId]
        );

        // Store new key
        const id = uuidv4();
        const result = await db.query(
            `INSERT INTO user_signing_keys (id, user_id, public_key, private_key_encrypted, key_algorithm, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
            [id, userId, publicKey, encryptedPrivateKey, 'ECDSA-P256']
        );

        logger.info('Created new signing key for user', { userId });
        return this.mapToUserSigningKey(result.rows[0]);
    }

    /**
     * Sign data using user's private key
     */
    async signData(userId: string, data: string): Promise<{ signature: string; publicKey: string }> {
        const userKey = await this.getOrCreateUserKey(userId);
        const privateKey = this.decryptPrivateKey(userKey.privateKeyEncrypted);

        const sign = createSign('SHA256');
        sign.update(data);
        sign.end();

        const signature = sign.sign(privateKey, 'base64');

        // Update last used timestamp
        await db.query(
            `UPDATE user_signing_keys SET last_used_at = NOW() WHERE id = $1`,
            [userKey.id]
        );

        return {
            signature,
            publicKey: userKey.publicKey
        };
    }

    /**
     * Verify a signature
     */
    verifySignature(data: string, signature: string, publicKey: string): boolean {
        try {
            const verify = createVerify('SHA256');
            verify.update(data);
            verify.end();
            return verify.verify(publicKey, signature, 'base64');
        } catch (error) {
            logger.error('Signature verification failed', { error });
            return false;
        }
    }

    /**
     * Encrypt private key for storage (simplified)
     * In production, use Vault transit secrets engine
     */
    private encryptPrivateKey(privateKey: string): string {
        // Simple XOR-based obfuscation for dev - NOT for production!
        // Production should use Vault or AWS KMS
        const buffer = Buffer.from(privateKey, 'utf8');
        const key = createHash('sha256').update(KEY_ENCRYPTION_SECRET).digest();

        const encrypted = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            encrypted[i] = buffer[i] ^ key[i % key.length];
        }

        return encrypted.toString('base64');
    }

    /**
     * Decrypt private key from storage
     */
    private decryptPrivateKey(encryptedKey: string): string {
        const encrypted = Buffer.from(encryptedKey, 'base64');
        const key = createHash('sha256').update(KEY_ENCRYPTION_SECRET).digest();

        const decrypted = Buffer.alloc(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ key[i % key.length];
        }

        return decrypted.toString('utf8');
    }

    private mapToUserSigningKey(row: any): UserSigningKey {
        return {
            id: row.id,
            userId: row.user_id,
            publicKey: row.public_key,
            privateKeyEncrypted: row.private_key_encrypted,
            keyAlgorithm: row.key_algorithm,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
            isActive: row.is_active
        };
    }
}

export const keyManagementService = new KeyManagementService();
