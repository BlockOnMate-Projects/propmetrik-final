import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from '../utils/logger';

// S3/MinIO client configuration
const minioEndpoint = config.minio.endpoint;
const minioConfigured = !!(minioEndpoint && config.minio.accessKey && config.minio.secretKey);

const protocol = config.minio.useSSL ? 'https' : 'http';
const portSuffix = config.minio.port && config.minio.port !== 80 && config.minio.port !== 443
  ? `:${config.minio.port}`
  : '';

// Only create client if MinIO is configured
export const s3Client = minioConfigured ? new S3Client({
  endpoint: `${protocol}://${minioEndpoint}${portSuffix}`,
  region: 'us-east-1', // MinIO ignores this but it's required
  credentials: {
    accessKeyId: config.minio.accessKey,
    secretAccessKey: config.minio.secretKey,
  },
  forcePathStyle: true, // Required for MinIO
}) : null as unknown as S3Client;

// Log warning if MinIO not configured
if (!minioConfigured) {
  logger.warn('MinIO not fully configured - file storage will be unavailable', {
    hasEndpoint: !!minioEndpoint,
    hasAccessKey: !!config.minio.accessKey,
    hasSecretKey: !!config.minio.secretKey,
  });
}

// Bucket names
export const buckets = config.minio.buckets;

// CORS configuration for browser uploads
const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      AllowedOrigins: config.cors.origins,
      ExposeHeaders: ['ETag', 'x-amz-meta-custom-header'],
      MaxAgeSeconds: 3600,
    },
  ],
};

/**
 * Check if a bucket exists
 */
export async function bucketExists(bucketName: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Create a bucket if it doesn't exist
 */
export async function createBucketIfNotExists(bucketName: string): Promise<boolean> {
  try {
    const exists = await bucketExists(bucketName);

    if (!exists) {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      logger.info(`Created MinIO bucket: ${bucketName}`);

      // Apply CORS configuration (optional - some MinIO setups don't support this)
      try {
        await s3Client.send(
          new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: corsConfiguration,
          })
        );
        logger.debug(`Applied CORS configuration to bucket: ${bucketName}`);
      } catch (corsError: any) {
        logger.warn(`Could not apply CORS to bucket ${bucketName}: ${corsError.message}`);
      }

      return true;
    }

    logger.debug(`MinIO bucket already exists: ${bucketName}`);
    return false;
  } catch (error) {
    logger.error(`Failed to create bucket ${bucketName}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Initialize all required buckets
 */
export async function initializeBuckets(): Promise<void> {
  const bucketList = Object.values(buckets);

  for (const bucket of bucketList) {
    await createBucketIfNotExists(bucket);
  }

  logger.info('All MinIO buckets initialized');
}

/**
 * Upload a file to MinIO
 */
export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ bucket: string; key: string; etag?: string }> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  });

  const response = await s3Client.send(command);

  logger.debug(`Uploaded file to MinIO`, { bucket, key });

  return {
    bucket,
    key,
    etag: response.ETag,
  };
}

/**
 * Get a file from MinIO
 */
export async function getFile(
  bucket: string,
  key: string
): Promise<{ body: Uint8Array; contentType?: string; metadata?: Record<string, string> }> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  const body = await response.Body?.transformToByteArray();

  return {
    body: body || new Uint8Array(),
    contentType: response.ContentType,
    metadata: response.Metadata,
  };
}

/**
 * Read an object's size (bytes) and content type without downloading it.
 * Returns {} on any failure (object missing, storage down) — callers treat
 * a missing size as "unknown" rather than erroring.
 */
export async function getObjectSize(
  bucket: string,
  key: string
): Promise<{ size?: number; contentType?: string }> {
  if (!minioConfigured) return {};
  try {
    const response = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      size: typeof response.ContentLength === 'number' ? response.ContentLength : undefined,
      contentType: response.ContentType,
    };
  } catch (err: any) {
    logger.warn('getObjectSize failed', { bucket, key, error: err?.message });
    return {};
  }
}

/**
 * Delete a file from MinIO
 */
export async function deleteFile(bucket: string, key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);
  logger.debug(`Deleted file from MinIO`, { bucket, key });
}

/**
 * List files in a bucket with optional prefix
 */
export async function listFiles(
  bucket: string,
  prefix?: string,
  maxKeys: number = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await s3Client.send(command);

  return (response.Contents || []).map((item) => ({
    key: item.Key || '',
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}

/**
 * Generate a presigned URL for upload
 */
export async function getPresignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a presigned URL for download
 */
export async function getPresignedDownloadUrl(
  bucket: string,
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate object key for property images
 */
export function generatePropertyImageKey(
  propertyId: string,
  fileName: string,
  type: 'original' | 'thumbnail' | 'medium' = 'original'
): string {
  const ext = fileName.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  return `properties/${propertyId}/${type}/${timestamp}.${ext}`;
}

/**
 * Generate object key for documents
 */
export function generateDocumentKey(
  entityType: 'property' | 'user' | 'organization' | 'deal',
  entityId: string,
  documentType: string,
  fileName: string
): string {
  const ext = fileName.split('.').pop() || 'pdf';
  const timestamp = Date.now();
  return `${entityType}s/${entityId}/${documentType}/${timestamp}.${ext}`;
}

/**
 * Check MinIO health
 */
export async function checkHealth(): Promise<{
  connected: boolean;
  buckets: Record<string, { exists: boolean; objectCount?: number }>;
}> {
  const bucketStatus: Record<string, { exists: boolean; objectCount?: number }> = {};

  try {
    for (const [name, bucketName] of Object.entries(buckets)) {
      try {
        const exists = await bucketExists(bucketName);
        if (exists) {
          const objects = await listFiles(bucketName, undefined, 1);
          bucketStatus[name] = {
            exists: true,
            objectCount: objects.length,
          };
        } else {
          bucketStatus[name] = { exists: false };
        }
      } catch {
        bucketStatus[name] = { exists: false };
      }
    }

    return {
      connected: true,
      buckets: bucketStatus,
    };
  } catch (error) {
    return {
      connected: false,
      buckets: {},
    };
  }
}

export default {
  client: s3Client,
  buckets,
  bucketExists,
  createBucketIfNotExists,
  initializeBuckets,
  uploadFile,
  getFile,
  deleteFile,
  listFiles,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  generatePropertyImageKey,
  generateDocumentKey,
  checkHealth,
};
