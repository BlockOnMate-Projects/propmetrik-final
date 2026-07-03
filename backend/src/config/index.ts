import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from single .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Helper: select dev or prod value based on NODE_ENV
const isProd = process.env.NODE_ENV === 'production';
const envSelect = <T>(dev: T, prod: T): T => isProd ? prod : dev;

// Helper: select test or live value based on FINANCE_MODE
// FINANCE_MODE is independent of NODE_ENV — allows test payments in production
const isLiveFinance = process.env.FINANCE_MODE === 'live';
const financeSelect = <T>(test: T, live: T): T => isLiveFinance ? live : test;

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
    financeMode: process.env.FINANCE_MODE || 'test',
    paymentBypass: process.env.PAYMENT_BYPASS === 'yes',
    // SECURITY: the unauthenticated "dev mode" login is now an EXPLICIT opt-in.
    // It requires AUTH_DEV_BYPASS=true AND a non-production NODE_ENV. This closes
    // the previous hole where an *unset* NODE_ENV defaulted to 'development' and
    // silently logged every request in as the first super_admin. In production
    // (or with the flag unset) the bypass is impossible regardless of NODE_ENV.
    devAuthBypass: process.env.AUTH_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production',
    port: parseInt(process.env.PORT || '4000', 10),
    apiVersion: process.env.API_VERSION || 'v1',
    url: envSelect(
      process.env.DEV_APP_URL || 'http://localhost:4000',
      process.env.PROD_APP_URL || 'https://api.propmetrik.com'
    ),
    frontendUrl: envSelect(
      process.env.DEV_FRONTEND_URL || 'http://localhost:3000',
      process.env.PROD_FRONTEND_URL || 'https://propmetrik.com'
    ),
    tenantPortalUrl: envSelect(
      process.env.DEV_TENANT_PORTAL_URL || 'http://localhost:3001',
      process.env.PROD_TENANT_PORTAL_URL || 'https://tenant.propmetrik.com'
    ),
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
    // Server-to-server admin traffic (token + /admin/realms/*) can be pointed at a
    // non-Cloudflare origin to bypass edge bot-challenges. Falls back to the public URL.
    adminUrl: process.env.KEYCLOAK_ADMIN_URL || process.env.KEYCLOAK_URL,
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
    // SECURITY: never fall back to a well-known constant secret. In production a
    // missing JWT_SECRET is a hard startup failure (a constant secret lets anyone
    // mint super_admin tokens). Outside production we allow a random per-boot
    // secret so local runs work without a shared, guessable value.
    secret: (() => {
      const s = process.env.JWT_SECRET;
      if (s && s.length >= 16) return s;
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set to a strong value (>=16 chars) in production');
      }
      // Non-production: derive an ephemeral, non-guessable secret for this process.
      return require('crypto').randomBytes(48).toString('hex');
    })(),
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
    level: envSelect(
      process.env.DEV_LOG_LEVEL || 'debug',
      process.env.PROD_LOG_LEVEL || 'info'
    ),
    format: envSelect(
      process.env.DEV_LOG_FORMAT || 'pretty',
      process.env.PROD_LOG_FORMAT || 'json'
    ),
  },

  // CORS
  cors: {
    origins: envSelect(
      (process.env.DEV_CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(','),
      (process.env.PROD_CORS_ORIGINS || 'https://app.propmetrik.com,https://propmetrik.com').split(',')
    ),
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
    // Legacy full-URL form, kept for existing callers (kobbyAI, crm/ai, publications).
    // NOTE: in prod this env currently pins a RETIRED model (gemini-2.0-flash) → 404.
    // The shared aiService ignores this and builds its URL from apiBaseUrl + model below.
    apiUrl: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    // Model is centralized here so a Google model retirement is a one-line change.
    apiBaseUrl: process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    enabled: !!process.env.GEMINI_API_KEY,
  },

  // DeepSeek (OpenAI-compatible) — used as the fallback provider by aiService
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    enabled: !!process.env.DEEPSEEK_API_KEY,
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
    enabledSpiders: (process.env.SCRAPY_ENABLED_SPIDERS || 'meqasa,housemaster,gpc,realtor,tonaton,daily_graphic_legal,airbnb_ghana,ownkey')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    concurrentSpiders: parseInt(process.env.SCRAPY_CONCURRENT_SPIDERS || '2', 10),
    retryFailed: process.env.SCRAPY_RETRY_FAILED !== 'false',
    maxRetries: parseInt(process.env.SCRAPY_MAX_RETRIES || '3', 10),
    workerUrl: process.env.SCRAPY_WORKER_URL || 'http://scrapy-worker:5000',
  },

  // Paystack Payments (controlled by FINANCE_MODE)
  paystack: {
    enabled: !!(process.env.PAYSTACK_TEST_SECRET_KEY || process.env.PAYSTACK_LIVE_SECRET_KEY),
    isTestMode: !isLiveFinance,
    secretKey: financeSelect(
      process.env.PAYSTACK_TEST_SECRET_KEY || '',
      process.env.PAYSTACK_LIVE_SECRET_KEY || ''
    ),
    publicKey: financeSelect(
      process.env.PAYSTACK_TEST_PUBLIC_KEY || '',
      process.env.PAYSTACK_LIVE_PUBLIC_KEY || ''
    ),
    apiBaseUrl: 'https://api.paystack.co',
  },

  // NOWPayments Crypto (controlled by FINANCE_MODE)
  nowpayments: {
    enabled: !!(process.env.NOWPAYMENTS_TEST_API_KEY || process.env.NOWPAYMENTS_LIVE_API_KEY),
    isTestMode: !isLiveFinance,
    apiKey: financeSelect(
      process.env.NOWPAYMENTS_TEST_API_KEY || '',
      process.env.NOWPAYMENTS_LIVE_API_KEY || ''
    ),
    ipnSecret: financeSelect(
      process.env.NOWPAYMENTS_TEST_IPN_SECRET || '',
      process.env.NOWPAYMENTS_LIVE_IPN_SECRET || ''
    ),
    apiBaseUrl: financeSelect(
      'https://api-sandbox.nowpayments.io/v1',
      'https://api.nowpayments.io/v1'
    ),
    callbackUrl: process.env.NOWPAYMENTS_CALLBACK_URL || '',
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
