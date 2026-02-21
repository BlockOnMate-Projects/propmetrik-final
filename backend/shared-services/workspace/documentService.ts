import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../src/config';
import { logger } from '../../src/utils/logger';

// Instantiate S3 client using MinIO configuration from central config
const s3Client = new S3Client({
    region: 'us-east-1', // MinIO is region-agnostic but client requires a value
    endpoint: `${config.minio.useSSL ? 'https' : 'http'}://${config.minio.endpoint}:${config.minio.port}`,
    forcePathStyle: true, // Required for MinIO
    credentials: {
        accessKeyId: config.minio.accessKey,
        secretAccessKey: config.minio.secretKey,
    },
});

const bucketName = config.minio.buckets.uploads;

export const documentService = {
    /**
     * Generate an S3 presigned URL for direct bucket upload
     */
    async generatePresignedUrl(key: string, contentType: string, expirationMinutes = 15): Promise<string> {
        try {
            // Check if credentials are set (if not, we might be in a degraded/incomplete env)
            if (!config.minio.accessKey || !config.minio.secretKey) {
                logger.error('MinIO credentials missing in config');
                throw new Error('Environment misconfigured: MinIO credentials missing');
            }

            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                ContentType: contentType,
            });

            return await getSignedUrl(s3Client, command, { expiresIn: expirationMinutes * 60 });
        } catch (error) {
            logger.error('Failed to generate presigned upload URL', { error: (error as Error).message });
            throw new Error('Could not generate upload URL');
        }
    },

    /**
     * Generate a read-only S3 presigned URL for downloading/viewing a file
     */
    async getDownloadUrl(key: string, expirationMinutes = 60): Promise<string> {
        try {
            if (!config.minio.accessKey || !config.minio.secretKey) {
                throw new Error('Environment misconfigured: MinIO credentials missing');
            }

            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
            });

            return await getSignedUrl(s3Client, command, { expiresIn: expirationMinutes * 60 });
        } catch (error) {
            logger.error('Failed to generate presigned download URL', { error: (error as Error).message });
            throw new Error('Could not generate download URL');
        }
    }
};
