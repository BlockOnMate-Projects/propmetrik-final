/**
 * Partner API Client
 * Handles secure communication with partner APIs using various authentication methods
 * 
 * Supported Authentication:
 * - OAuth2 Client Credentials
 * - API Key authentication
 * - Basic Authentication
 * - Bearer Token
 * - Mutual TLS (mTLS)
 * 
 * Features:
 * - Automatic token refresh for OAuth2
 * - Rate limiting compliance
 * - Retry logic with exponential backoff
 * - Request/response logging
 * - Error classification
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import https from 'https';
import { credentialsService, CredentialData } from './credentialsService';
import { logger } from '../../utils/logger';

export interface ApiClientConfig {
  baseURL: string;
  authMethod: 'oauth2' | 'api_key' | 'basic_auth' | 'bearer_token' | 'mtls';
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  rateLimitPerMinute?: number;
  headers?: Record<string, string>;
}

export interface PaginationConfig {
  method: 'offset' | 'cursor' | 'page';
  pageParam: string;
  sizeParam: string;
  defaultPageSize: number;
  maxPageSize: number;
}

export interface ApiResponse<T = any> {
  data: T;
  totalCount?: number;
  nextCursor?: string;
  hasMore?: boolean;
  rateLimit?: {
    remaining: number;
    resetAt: Date;
  };
}

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  retryable: boolean;
  rateLimit?: boolean;
}

class PartnerApiClient {
  private client: AxiosInstance;
  private sourceId: string;
  private credentials?: CredentialData;
  private accessToken?: string;
  private tokenExpiresAt?: Date;
  private lastRequestTime = 0;
  private requestCount = 0;
  private rateLimitReset = 0;

  constructor(
    sourceId: string,
    private config: ApiClientConfig
  ) {
    this.sourceId = sourceId;
    
    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'User-Agent': 'PROPMETRIK-DataHub/1.0',
        'Accept': 'application/json',
        ...config.headers
      }
    });

    // Add request/response interceptors
    this.setupInterceptors();
  }

  /**
   * Initialize the client with credentials
   */
  async initialize(credentialName = 'default'): Promise<void> {
    try {
      const creds = await credentialsService.getCredentials(this.sourceId, credentialName);
      this.credentials = creds ?? undefined;
      
      if (!this.credentials) {
        throw new Error(`No credentials found for source ${this.sourceId}`);
      }

      await this.setupAuthentication();
      
      logger.info('Partner API client initialized', {
        sourceId: this.sourceId,
        authMethod: this.config.authMethod,
        baseURL: this.config.baseURL
      });

    } catch (error) {
      logger.error('Failed to initialize Partner API client', {
        sourceId: this.sourceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Setup authentication based on method
   */
  private async setupAuthentication(): Promise<void> {
    if (!this.credentials) return;

    switch (this.config.authMethod) {
      case 'oauth2':
        await this.refreshOAuth2Token();
        break;
        
      case 'api_key':
        this.setupApiKeyAuth();
        break;
        
      case 'basic_auth':
        this.setupBasicAuth();
        break;
        
      case 'bearer_token':
        this.setupBearerToken();
        break;
        
      case 'mtls':
        this.setupMutualTLS();
        break;
        
      default:
        throw new Error(`Unsupported authentication method: ${this.config.authMethod}`);
    }
  }

  /**
   * OAuth2 Client Credentials token refresh
   */
  private async refreshOAuth2Token(): Promise<void> {
    if (!this.credentials?.client_id || !this.credentials?.client_secret || !this.credentials?.token_endpoint) {
      throw new Error('OAuth2 credentials incomplete');
    }

    // Skip refresh if token is still valid (with 5-minute buffer)
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return;
    }

    try {
      const response = await axios.post(this.credentials.token_endpoint, {
        grant_type: 'client_credentials',
        client_id: this.credentials.client_id,
        client_secret: this.credentials.client_secret,
        scope: this.credentials.scope || 'read'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));

      // Update client default headers
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

      logger.info('OAuth2 token refreshed successfully', {
        sourceId: this.sourceId,
        expiresAt: this.tokenExpiresAt
      });

    } catch (error) {
      logger.error('OAuth2 token refresh failed', {
        sourceId: this.sourceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('OAuth2 token refresh failed');
    }
  }

  /**
   * Setup API key authentication
   */
  private setupApiKeyAuth(): void {
    if (!this.credentials?.api_key) {
      throw new Error('API key not found in credentials');
    }

    // Common API key patterns
    if (this.credentials.custom_headers) {
      Object.assign(this.client.defaults.headers.common, this.credentials.custom_headers);
    } else {
      // Default to X-API-Key header
      this.client.defaults.headers.common['X-API-Key'] = this.credentials.api_key;
      
      // Some APIs also require API secret
      if (this.credentials.api_secret) {
        this.client.defaults.headers.common['X-API-Secret'] = this.credentials.api_secret;
      }
    }
  }

  /**
   * Setup Basic Authentication
   */
  private setupBasicAuth(): void {
    if (!this.credentials?.username || !this.credentials?.password) {
      throw new Error('Username/password not found in credentials');
    }

    const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
    this.client.defaults.headers.common['Authorization'] = `Basic ${auth}`;
  }

  /**
   * Setup Bearer Token authentication
   */
  private setupBearerToken(): void {
    if (!this.credentials?.token) {
      throw new Error('Bearer token not found in credentials');
    }

    this.client.defaults.headers.common['Authorization'] = `Bearer ${this.credentials.token}`;
  }

  /**
   * Setup Mutual TLS authentication
   */
  private setupMutualTLS(): void {
    if (!this.credentials?.certificate || !this.credentials?.private_key) {
      throw new Error('mTLS certificate/key not found in credentials');
    }

    const httpsAgent = new https.Agent({
      cert: this.credentials.certificate,
      key: this.credentials.private_key,
      ca: this.credentials.ca_certificate,
      rejectUnauthorized: true
    });

    this.client.defaults.httpsAgent = httpsAgent;
  }

  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Rate limiting
        await this.enforceRateLimit();
        
        // OAuth2 token refresh if needed
        if (this.config.authMethod === 'oauth2') {
          await this.refreshOAuth2Token();
        }

        logger.debug('API request', {
          sourceId: this.sourceId,
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params
        });

        return config;
      },
      (error) => {
        logger.error('Request interceptor error', {
          sourceId: this.sourceId,
          error: error instanceof Error ? error.message : String(error)
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Track rate limiting headers
        this.updateRateLimitInfo(response);

        logger.debug('API response', {
          sourceId: this.sourceId,
          status: response.status,
          dataSize: JSON.stringify(response.data).length
        });

        return response;
      },
      (error) => {
        const apiError = this.classifyError(error);
        
        logger.warn('API response error', {
          sourceId: this.sourceId,
          status: error.response?.status,
          statusText: error.response?.statusText,
          retryable: apiError.retryable
        });

        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    if (!this.config.rateLimitPerMinute) return;

    const now = Date.now();
    const minuteWindow = 60 * 1000;

    // Reset counter if minute window has passed
    if (now - this.rateLimitReset >= minuteWindow) {
      this.requestCount = 0;
      this.rateLimitReset = now;
    }

    // Check if we've hit the limit
    if (this.requestCount >= this.config.rateLimitPerMinute) {
      const waitTime = minuteWindow - (now - this.rateLimitReset);
      
      logger.warn('Rate limit reached, waiting', {
        sourceId: this.sourceId,
        waitTimeMs: waitTime
      });

      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.rateLimitReset = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Update rate limit tracking from response headers
   */
  private updateRateLimitInfo(response: AxiosResponse): void {
    const remaining = response.headers['x-ratelimit-remaining'] || response.headers['ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'] || response.headers['ratelimit-reset'];

    if (remaining && reset) {
      // Update our internal tracking to respect server-side limits
      this.requestCount = Math.max(0, (this.config.rateLimitPerMinute || 60) - parseInt(remaining));
      this.rateLimitReset = parseInt(reset) * 1000; // Convert to milliseconds
    }
  }

  /**
   * Classify API errors for retry logic
   */
  private classifyError(error: any): ApiError {
    const status = error.response?.status;
    const apiError = new Error(error.message) as ApiError;
    apiError.statusCode = status;

    // Determine if error is retryable
    if (status >= 500 || status === 429 || status === 408 || error.code === 'ECONNRESET') {
      apiError.retryable = true;
    } else {
      apiError.retryable = false;
    }

    // Rate limit specific handling
    if (status === 429) {
      apiError.rateLimit = true;
      apiError.code = 'RATE_LIMIT_EXCEEDED';
    }

    // Authentication errors
    if (status === 401) {
      apiError.code = 'AUTHENTICATION_FAILED';
    }

    // Authorization errors
    if (status === 403) {
      apiError.code = 'AUTHORIZATION_FAILED';
    }

    return apiError;
  }

  /**
   * Make API request with retry logic
   */
  async request<T = any>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const maxAttempts = this.config.retryAttempts || 3;
    let lastError: ApiError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.client.request(config);
        
        return {
          data: response.data,
          totalCount: this.extractTotalCount(response),
          nextCursor: this.extractNextCursor(response),
          hasMore: this.extractHasMore(response),
          rateLimit: this.extractRateLimit(response)
        };

      } catch (error) {
        lastError = error as ApiError;

        // Don't retry non-retryable errors
        if (!lastError.retryable || attempt === maxAttempts) {
          break;
        }

        // Calculate backoff delay
        const baseDelay = this.config.retryDelayMs || 1000;
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        
        logger.warn('API request failed, retrying', {
          sourceId: this.sourceId,
          attempt,
          maxAttempts,
          delayMs: delay,
          error: lastError.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * GET request with pagination support
   */
  async get<T = any>(
    url: string,
    params?: Record<string, any>,
    paginationConfig?: PaginationConfig
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      params
    });
  }

  /**
   * GET all pages of paginated data
   */
  async getAllPages<T = any>(
    url: string,
    params?: Record<string, any>,
    paginationConfig?: PaginationConfig
  ): Promise<T[]> {
    const allData: T[] = [];
    let currentParams = { ...params };
    let hasMore = true;
    let page = 1;

    while (hasMore && page <= 100) { // Safety limit
      const response = await this.get<T[]>(url, currentParams, paginationConfig);
      
      if (Array.isArray(response.data)) {
        allData.push(...response.data);
      } else {
        allData.push(response.data as T);
      }

      hasMore = response.hasMore || false;
      
      if (hasMore && paginationConfig) {
        if (paginationConfig.method === 'cursor' && response.nextCursor) {
          currentParams[paginationConfig.pageParam] = response.nextCursor;
        } else if (paginationConfig.method === 'page') {
          page++;
          currentParams[paginationConfig.pageParam] = page;
        } else if (paginationConfig.method === 'offset') {
          const currentOffset = currentParams[paginationConfig.pageParam] || 0;
          currentParams[paginationConfig.pageParam] = currentOffset + (paginationConfig.defaultPageSize || 100);
        }
      } else {
        hasMore = false;
      }
    }

    logger.info('Completed paginated data fetch', {
      sourceId: this.sourceId,
      totalRecords: allData.length,
      pages: page
    });

    return allData;
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data
    });
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data
    });
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try a simple GET request to a health or status endpoint
      await this.get('/health', undefined, undefined);
      return true;
    } catch (error) {
      // If no health endpoint, try the base URL
      try {
        await this.get('/', undefined, undefined);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Extract pagination metadata from response
   */
  private extractTotalCount(response: AxiosResponse): number | undefined {
    // Common patterns for total count
    return response.data.total || 
           response.data.totalCount || 
           response.data.count ||
           response.headers['x-total-count'] ? parseInt(response.headers['x-total-count']) : undefined;
  }

  private extractNextCursor(response: AxiosResponse): string | undefined {
    return response.data.nextCursor || 
           response.data.next_cursor ||
           response.data.cursor ||
           response.headers['x-next-cursor'];
  }

  private extractHasMore(response: AxiosResponse): boolean {
    return response.data.hasMore || 
           response.data.has_more ||
           !!response.data.nextCursor ||
           false;
  }

  private extractRateLimit(response: AxiosResponse) {
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];

    if (remaining && reset) {
      return {
        remaining: parseInt(remaining),
        resetAt: new Date(parseInt(reset) * 1000)
      };
    }

    return undefined;
  }
}

export { PartnerApiClient };