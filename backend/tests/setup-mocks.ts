/**
 * Global Jest mocks loaded before the test framework.
 * Prevents notification services from opening real SMTP/Graph connections during tests.
 */

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
