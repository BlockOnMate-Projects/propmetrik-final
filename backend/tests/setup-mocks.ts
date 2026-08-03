/**
 * Global Jest mocks loaded before the test framework.
 * Prevents notification services from opening real SMTP/Graph connections during tests.
 */

// CI has no backend/.env — set safe defaults before config/auth modules load.
process.env.KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
process.env.KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'propmetrik';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const mockSend = jest.fn().mockResolvedValue({ success: true, messageId: 'test-message-id' });

const mockService = {
  send: mockSend,
  sendSMS: mockSend,
  sendEmail: mockSend,
  sendOTP: mockSend,
  sendMagicLink: mockSend,
  sendPortalInvite: mockSend,
};

jest.mock('../shared-services/notifications/unified', () => ({
  TwilioSMSService: jest.fn().mockImplementation(() => mockService),
  GoogleSMTPEmailService: jest.fn().mockImplementation(() => mockService),
  MicrosoftGraphEmailService: jest.fn().mockImplementation(() => mockService),
  AwsSESEmailService: jest.fn().mockImplementation(() => mockService),
  PrioritySMTPEmailService: jest.fn().mockImplementation(() => mockService),
  UnifiedNotificationService: jest.fn().mockImplementation(() => mockService),
  notificationService: mockService,
  smsService: mockService,
  emailService: mockService,
}));

// in-mail/index re-exports routes which eagerly loads auth middleware + JWKS.
jest.mock('../shared-services/notifications/in-mail', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  resolveOrgStaff: jest.fn().mockResolvedValue([]),
  resolveStaffUser: jest.fn().mockResolvedValue(null),
  resolveTenant: jest.fn().mockResolvedValue(null),
  resolveTenantByTenancy: jest.fn().mockResolvedValue(null),
}));
