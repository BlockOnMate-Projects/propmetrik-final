import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Environment validation
const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'KEYCLOAK_URL',
  'KEYCLOAK_REALM',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} is not set in environment variables`);
  }
}

export const config = {
  // Application
  app: {
    name: process.env.APP_NAME || 'propmetrik',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '4000', 10),
    apiVersion: process.env.API_VERSION || 'v1',
    url: process.env.APP_URL || 'http://localhost:4000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  // Database - PostgreSQL with PostGIS
  database: {
    url: process.env.DATABASE_URL!,
    host: process.env.DB_HOST || 'pg.cedynhq.com',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    name: process.env.DB_NAME || 'propmetrik',
    user: process.env.DB_USER || 'propmetrik_user',
    password: process.env.DB_PASSWORD!,
    ssl: process.env.DB_SSL === 'true',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL!,
    host: process.env.REDIS_HOST || 'redis.cedynhq.com',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    databases: {
      auth: parseInt(process.env.REDIS_DB_AUTH || '0', 10),
      cache: parseInt(process.env.REDIS_DB_CACHE || '1', 10),
      queue: parseInt(process.env.REDIS_DB_QUEUE || '2', 10),
      pubsub: parseInt(process.env.REDIS_DB_PUBSUB || '3', 10),
    },
  },

  // OpenSearch
  opensearch: {
    url: process.env.OPENSEARCH_URL || 'https://opensearch.cedynhq.com',
    username: process.env.OPENSEARCH_USERNAME || 'propmetrik_user',
    password: process.env.OPENSEARCH_PASSWORD!,
    indexPrefix: process.env.OPENSEARCH_INDEX_PREFIX || 'propmetrik_',
  },

  // MinIO / S3
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 's3.cedynhq.com',
    port: parseInt(process.env.MINIO_PORT || '443', 10),
    useSSL: process.env.MINIO_USE_SSL !== 'false',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
    buckets: {
      properties: process.env.MINIO_BUCKET_PROPERTIES || 'propmetrik-properties',
      documents: process.env.MINIO_BUCKET_DOCUMENTS || 'propmetrik-documents',
      media: process.env.MINIO_BUCKET_MEDIA || 'propmetrik-media',
      uploads: process.env.MINIO_BUCKET_UPLOADS || 'propmetrik-uploads',
    },
  },

  // ClickHouse Analytics
  clickhouse: {
    url: process.env.CLICKHOUSE_URL!,
  },

  // Keycloak Authentication
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'https://sso.cedynhq.com',
    realm: process.env.KEYCLOAK_REALM || 'propmetrik',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'propmetrik-api',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
    adminSecret: process.env.KEYCLOAK_ADMIN_SECRET,
  },

  // JWT (for internal tokens)
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
  },

  // File Upload
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || 'jpg,jpeg,png,gif,webp').split(','),
    allowedDocumentTypes: (process.env.ALLOWED_DOCUMENT_TYPES || 'pdf,doc,docx,xls,xlsx').split(','),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'pretty',
  },

  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
  },

  // Ghana Regional Configuration
  regions: {
    GREATER_ACCRA: 'greater_accra',
    KUMASI_METRO: 'kumasi_metro',
    EASTERN: 'eastern',
    WESTERN_CLUSTER: 'western_cluster',
    NORTHERN_CLUSTER: 'northern_cluster',
  } as const,

  // Convenience accessors
  get env() { return this.app.env; },
  get port() { return this.app.port; },
} as const;

// Add authServerUrl alias for Keycloak
export const keycloakConfig = {
  ...config.keycloak,
  authServerUrl: config.keycloak.url,
};

export type RegionCode = typeof config.regions[keyof typeof config.regions];

export default config;
