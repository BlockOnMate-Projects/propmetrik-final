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
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
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
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    databases: {
      // Use DB 0 for all - managed Redis restricts SELECT command
      // Key prefixes in redis.ts (propmetrik:auth:, propmetrik:cache:, etc.) ensure no collisions
      auth: parseInt(process.env.REDIS_DB_AUTH || '0', 10),
      cache: parseInt(process.env.REDIS_DB_CACHE || '0', 10),
      queue: parseInt(process.env.REDIS_DB_QUEUE || '0', 10),
      pubsub: parseInt(process.env.REDIS_DB_PUBSUB || '0', 10),
    },
  },

  // OpenSearch
  opensearch: {
    url: process.env.OPENSEARCH_URL,
    username: process.env.OPENSEARCH_USERNAME,
    password: process.env.OPENSEARCH_PASSWORD!,
    indexPrefix: process.env.OPENSEARCH_INDEX_PREFIX || 'propmetrik_',
  },

  // MinIO / S3 - Parse URL if provided, otherwise use individual env vars
  minio: (() => {
    const minioUrl = process.env.MINIO_URL;
    let endpoint = process.env.MINIO_ENDPOINT;
    let port = parseInt(process.env.MINIO_PORT || '443', 10);
    let useSSL = process.env.MINIO_USE_SSL === 'true';
    let accessKey = process.env.MINIO_ACCESS_KEY || '';
    let secretKey = process.env.MINIO_SECRET_KEY || '';

    // Parse MINIO_URL if provided: https://user:pass@host or http://user:pass@host:port
    if (minioUrl) {
      try {
        const url = new URL(minioUrl);
        useSSL = url.protocol === 'https:';
        endpoint = url.hostname;
        port = url.port ? parseInt(url.port, 10) : (useSSL ? 443 : 80);
        accessKey = decodeURIComponent(url.username) || accessKey;
        secretKey = decodeURIComponent(url.password) || secretKey;
      } catch (e) {
        console.warn('Failed to parse MINIO_URL, falling back to individual env vars');
      }
    }

    return {
      endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
      buckets: {
        properties: process.env.MINIO_BUCKET_PROPERTIES || 'propmetrik-properties',
        documents: process.env.MINIO_BUCKET_DOCUMENTS || 'propmetrik-documents',
        media: process.env.MINIO_BUCKET_MEDIA || 'propmetrik-media',
        uploads: process.env.MINIO_BUCKET_UPLOADS || 'propmetrik-uploads',
      },
    };
  })(),

  // ClickHouse Analytics
  clickhouse: {
    url: process.env.CLICKHOUSE_URL!,
  },

  // Keycloak Authentication
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID,
    adminSecret: process.env.KEYCLOAK_ADMIN_SECRET,
    adminRealm: process.env.KEYCLOAK_ADMIN_REALM || 'master',
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME,
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,
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
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(','),
    credentials: true,
  },

  // External APIs - Mapping
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN || '',
  },

  // Ghana Post GPS - Self-hosted Docker
  ghanaPostGps: {
    apiUrl: process.env.GHANA_POST_GPS_API_URL || 'http://localhost:8585',
    fallbackUrl: process.env.GHANA_POST_GPS_FALLBACK_URL || 'https://ghanapostgps.sperixlabs.org/api',
  },

  // WhatsApp Business Cloud API
  whatsapp: {
    enabled: !!process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'propmetrik_webhook_2024',
    apiBaseUrl: 'https://graph.facebook.com',
  },

  // Google Calendar API
  google: {
    enabled: !!process.env.GOOGLE_CLIENT_ID,
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    calendarApiKey: process.env.GOOGLE_CALENDAR_API_KEY || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/v1/auth/google/callback',
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  },

  // Gemini AI (Google)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    apiUrl: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    enabled: !!process.env.GEMINI_API_KEY,
  },

  // Workspace & Kobby AI Schedules
  workspace: {
    kobbyMonitorCron: process.env.KOBBY_MONITOR_CRON || '0 8 * * *',
    whatsappDigestCron: process.env.WHATSAPP_DIGEST_CRON || '0 18 * * *',
  },

  // Scrapy automation
  scrapy: {
    autoStart: process.env.SCRAPY_AUTO_START !== 'false',
    initialDelay: parseInt(process.env.SCRAPY_INITIAL_DELAY || '30000', 10),
    weeklySchedule: process.env.SCRAPY_WEEKLY_SCHEDULE || '0 2 * * 0',
    dailyUpdates: process.env.SCRAPY_DAILY_UPDATES !== 'false',
    dailySchedule: process.env.SCRAPY_DAILY_SCHEDULE || '0 3 * * *',
    enabledSpiders: (process.env.SCRAPY_ENABLED_SPIDERS || 'meqasa,housemaster,gpc,realtor,jiji,daily_graphic_legal,airbnb_ghana')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    concurrentSpiders: parseInt(process.env.SCRAPY_CONCURRENT_SPIDERS || '2', 10),
    retryFailed: process.env.SCRAPY_RETRY_FAILED !== 'false',
    maxRetries: parseInt(process.env.SCRAPY_MAX_RETRIES || '3', 10),
  },

  // Paystack Payments
  paystack: {
    enabled: !!process.env.PAYSTACK_SECRET_KEY,
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    apiBaseUrl: 'https://api.paystack.co',
  },

  // Ghana Regional Configuration
  regions: {
    GREATER_ACCRA: 'greater_accra',
    ASHANTI: 'ashanti',
    EASTERN: 'eastern',
    CENTRAL: 'central',
    WESTERN: 'western',
    VOLTA: 'volta',
    NORTHERN: 'northern',
    UPPER_EAST: 'upper_east',
    UPPER_WEST: 'upper_west',
    BONO: 'bono',
    BONO_EAST: 'bono_east',
    AHAFO: 'ahafo',
    SAVANNAH: 'savannah',
    NORTH_EAST: 'north_east',
    OTI: 'oti',
    WESTERN_NORTH: 'western_north',
    // Legacy / Clusters
    KUMASI_METRO: 'kumasi_metro',
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
