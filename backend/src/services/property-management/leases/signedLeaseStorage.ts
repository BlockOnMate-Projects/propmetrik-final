import { buckets, getPresignedDownloadUrl, uploadFile } from '../../../database/minio';

const DEFAULT_BUCKET = buckets.documents || 'propmetrik-documents';

export function getSignedLeaseBucket(): string {
    return process.env.SIGNED_LEASES_BUCKET || DEFAULT_BUCKET;
}

export function isS3ObjectRef(value: string): boolean {
    return value.startsWith('s3://');
}

export function parseS3ObjectRef(value: string): { bucket: string; key: string } | null {
    if (!isS3ObjectRef(value)) return null;
    const withoutScheme = value.slice('s3://'.length);
    const separatorIndex = withoutScheme.indexOf('/');
    if (separatorIndex <= 0) return null;

    return {
        bucket: withoutScheme.slice(0, separatorIndex),
        key: withoutScheme.slice(separatorIndex + 1),
    };
}

export async function getSignedLeaseDownloadUrl(value: string, expiresInSeconds = 3600): Promise<string | null> {
    const ref = parseS3ObjectRef(value);
    if (!ref) return null;
    return getPresignedDownloadUrl(ref.bucket, ref.key, expiresInSeconds);
}

export async function storeSignedLeaseDocument(input: {
    tenancyId: string;
    envelopeId?: string;
    sourceUrl: string;
}): Promise<string> {
    if (isS3ObjectRef(input.sourceUrl)) return input.sourceUrl;

    const bucket = getSignedLeaseBucket();
    const objectId = input.envelopeId || `${Date.now()}`;
    const key = `signed-leases/tenancies/${input.tenancyId}/${objectId}.pdf`;

    let body: Buffer;
    let contentType = 'application/pdf';

    const dataUrlMatch = input.sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
        contentType = dataUrlMatch[1] || contentType;
        body = Buffer.from(dataUrlMatch[2], 'base64');
    } else if (input.sourceUrl.startsWith('http')) {
        const response = await fetch(input.sourceUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch signed lease document: HTTP ${response.status}`);
        }
        contentType = response.headers.get('content-type') || contentType;
        body = Buffer.from(await response.arrayBuffer());
    } else {
        throw new Error('Signed lease URL format is not supported for S3 migration');
    }

    await uploadFile(bucket, key, body, contentType, {
        tenancyId: input.tenancyId,
        envelopeId: input.envelopeId || '',
        documentType: 'signed_lease',
    });

    return `s3://${bucket}/${key}`;
}