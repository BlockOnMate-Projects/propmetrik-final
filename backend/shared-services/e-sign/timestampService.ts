/**
 * Timestamp Service
 * Provides RFC 3161-style timestamping for signatures
 * Self-hosted implementation (no external TSA)
 */

import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { logger } from '../../src/utils/logger';

// TSA key pair (in production, this would be stored in Vault/HSM)
let tsaKeyPair: { publicKey: string; privateKey: string } | null = null;

function getTSAKeyPair() {
    if (!tsaKeyPair) {
        // Generate TSA key pair on first use (in production, load from secure storage)
        tsaKeyPair = generateKeyPairSync('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        logger.info('TSA key pair initialized');
    }
    return tsaKeyPair;
}

export interface TimestampToken {
    timestamp: string; // ISO 8601
    messageHash: string;
    serialNumber: string;
    tsaSignature: string;
    tsaPublicKey: string;
    algorithm: string;
}

export class TimestampService {
    /**
     * Create a timestamp token for a document hash
     * Simulates RFC 3161 TSA response
     */
    async createTimestamp(documentHash: string): Promise<TimestampToken> {
        const { publicKey, privateKey } = getTSAKeyPair();

        const timestamp = new Date().toISOString();
        const serialNumber = this.generateSerialNumber();

        // Create the timestamp token data
        const tokenData = {
            version: 1,
            policy: 'propmetrik-tsa-policy-1.0',
            messageImprint: {
                algorithm: 'SHA-256',
                hash: documentHash
            },
            serialNumber,
            genTime: timestamp,
            accuracy: {
                seconds: 1
            },
            ordering: true,
            tsa: {
                name: 'PROPMETRIK Internal TSA',
                organization: 'PROPMETRIK Ghana Ltd.'
            }
        };

        // Sign the token data
        const tokenDataString = JSON.stringify(tokenData);
        const sign = createSign('SHA256');
        sign.update(tokenDataString);
        sign.end();
        const signature = sign.sign(privateKey, 'base64');

        return {
            timestamp,
            messageHash: documentHash,
            serialNumber,
            tsaSignature: signature,
            tsaPublicKey: publicKey,
            algorithm: 'ECDSA-P256-SHA256'
        };
    }

    /**
     * Verify a timestamp token
     */
    verifyTimestamp(token: TimestampToken): boolean {
        try {
            const tokenData = {
                version: 1,
                policy: 'propmetrik-tsa-policy-1.0',
                messageImprint: {
                    algorithm: 'SHA-256',
                    hash: token.messageHash
                },
                serialNumber: token.serialNumber,
                genTime: token.timestamp,
                accuracy: {
                    seconds: 1
                },
                ordering: true,
                tsa: {
                    name: 'PROPMETRIK Internal TSA',
                    organization: 'PROPMETRIK Ghana Ltd.'
                }
            };

            const { createVerify } = require('crypto');
            const verify = createVerify('SHA256');
            verify.update(JSON.stringify(tokenData));
            verify.end();

            return verify.verify(token.tsaPublicKey, token.tsaSignature, 'base64');
        } catch (error) {
            logger.error('Timestamp verification failed', { error });
            return false;
        }
    }

    /**
     * Generate a unique serial number for the timestamp
     */
    private generateSerialNumber(): string {
        const timestamp = Date.now().toString(16);
        const random = Math.random().toString(16).substring(2, 10);
        return `${timestamp}-${random}`.toUpperCase();
    }
}

export const timestampService = new TimestampService();
