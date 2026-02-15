/**
 * Shared Services Index
 * 
 * Cross-cutting services used across all PROPMETRIK domains:
 * - CRM, Projects, Properties, Valuation, etc.
 * 
 * These services are domain-agnostic infrastructure components.
 */

// Real-time SSE & Presence
export * from './realtime';

// Calendar & Scheduling
export * from './calendar';

// Workflow Automation
export * from './workflow';

// E-Sign Services
export * from './e-sign';

// E-Sign Integration (business-level facade)
// Note: individual imports from './e-sign/integration' to avoid re-export conflicts
export { eSignIntegrationService } from './e-sign/integration';
export type { 
  CreateEnvelopeInput, 
  EnvelopeResult, 
  CompletionEvent, 
  ESignSourceModule,
  IESignIntegrationService 
} from './e-sign/integration/types';

// Payment Services
export * from './payments/paystack';
export { feeEngine } from './payments/feeEngine';

// Crypto Payment Services (USDT on Polygon)
export {
  cryptoPaymentService,
  exchangeRateService,
  blockchainListenerService,
  loadCryptoConfig,
} from './payments/crypto';
export type {
  CryptoPaymentInitParams,
  CryptoPaymentInitResult,
  CryptoVerifyResult,
  CryptoPaymentEvent,
  ExchangeRateResult,
  CryptoConfig,
} from './payments/crypto';

// Document Services (use named imports to avoid clash with e-sign TemplateService)
export { 
  DocumentServiceConfig,
  UploadDocumentParams,
  DocumentInfo,
  GenerateDocumentParams,
  TemplateInfo,
  DocumentStorageService, documentStorageService,
  TemplateService as DocTemplateService, templateService as docTemplateService,
  PDFGenerationService, pdfService,
  UnifiedDocumentService, documentService
} from './document-service';

// AI / LLM Services
export * from './ai';

// Base Service (abstract class for domain services)
export * from './base';

// Risk Assessment Services
export { floodRiskService } from './risk/floodRiskService';
export { litigationRiskService } from './risk/litigationRiskService';

// Compliance Services
export { ricsComplianceService } from './compliance/ricsComplianceService';

// Analytics Services
export * from './analytics';

// Unified Notification Service (SMS + Email)
export { notificationService } from './notifications/unified';
