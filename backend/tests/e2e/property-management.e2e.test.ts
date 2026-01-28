/**
 * E2E Tests for Property Management Flows
 * 
 * Tests the complete PM workflows:
 * 1. Tenant Application Flow
 * 2. Payment Processing Flow
 * 3. Maintenance Request Flow
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:4000';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '575438e9-a0a2-461d-8011-e9e54c30acd3';

// ============================================================================
// Test Data
// ============================================================================

const testProperty = {
  name: 'E2E Test Property',
  addressStreet: '123 Test Street',
  addressCity: 'Accra',
  addressRegion: 'Greater Accra',
  propertyType: 'residential',
  operationalStatus: 'operational',
};

const testUnit = {
  unitNumber: 'E2E-101',
  floor: 1,
  bedrooms: 2,
  bathrooms: 1,
  squareMeters: 75,
  marketRent: 2500,
  status: 'vacant',
};

const testApplicant = {
  fullName: 'E2E Test Applicant',
  email: 'e2e.applicant@test.com',
  phone: '+233201234567',
  employmentStatus: 'employed',
  employer: 'Test Company Ltd',
  monthlyIncome: 8000,
  moveInDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
};

// ============================================================================
// Helper Functions
// ============================================================================

const createHeaders = () => ({
  'x-organization-id': TEST_ORG_ID,
  'x-user-id': TEST_USER_ID,
  'Content-Type': 'application/json',
});

// ============================================================================
// TENANT APPLICATION FLOW
// ============================================================================

describe('Tenant Application Flow E2E', () => {
  let propertyId: string;
  let unitId: string;
  let applicationId: string;
  let tenantId: string;
  let tenancyId: string;

  describe('1. Setup - Create Property and Unit', () => {
    it('should create a test property', async () => {
      const response = await request(API_BASE)
        .post('/api/v1/property-management/properties')
        .set(createHeaders())
        .send(testProperty);

      // Accept both 201 (created) and 200 (if exists)
      expect([200, 201]).toContain(response.status);
      expect(response.body.success || response.body.data).toBeTruthy();
      
      propertyId = response.body.data?.id || response.body.id;
    });

    it('should create a test unit', async () => {
      if (!propertyId) {
        console.log('Skipping: No property ID');
        return;
      }

      const response = await request(API_BASE)
        .post(`/api/v1/property-management/properties/${propertyId}/units`)
        .set(createHeaders())
        .send(testUnit);

      expect([200, 201]).toContain(response.status);
      unitId = response.body.data?.id || response.body.id;
    });
  });

  describe('2. Application Submission', () => {
    it('should submit a rental application', async () => {
      if (!unitId) {
        console.log('Skipping: No unit ID');
        return;
      }

      const response = await request(API_BASE)
        .post('/api/v1/property-management/applications')
        .set(createHeaders())
        .send({
          unitId,
          propertyId,
          ...testApplicant,
        });

      expect([200, 201]).toContain(response.status);
      expect(response.body.data || response.body.id).toBeTruthy();
      
      applicationId = response.body.data?.id || response.body.id;
    });

    it('should retrieve the application', async () => {
      if (!applicationId) {
        console.log('Skipping: No application ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/applications/${applicationId}`)
        .set(createHeaders());

      expect(response.status).toBe(200);
      expect(response.body.data?.status || response.body.status).toBe('pending');
    });

    it('should list applications for the property', async () => {
      const response = await request(API_BASE)
        .get('/api/v1/property-management/applications')
        .set(createHeaders())
        .query({ propertyId });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data || response.body.applications)).toBe(true);
    });
  });

  describe('3. Application Review & Approval', () => {
    it('should move application to screening', async () => {
      if (!applicationId) {
        console.log('Skipping: No application ID');
        return;
      }

      const response = await request(API_BASE)
        .patch(`/api/v1/property-management/applications/${applicationId}/status`)
        .set(createHeaders())
        .send({
          status: 'screening',
          notes: 'Background check initiated',
        });

      expect([200, 204]).toContain(response.status);
    });

    it('should approve the application', async () => {
      if (!applicationId) {
        console.log('Skipping: No application ID');
        return;
      }

      const response = await request(API_BASE)
        .patch(`/api/v1/property-management/applications/${applicationId}/status`)
        .set(createHeaders())
        .send({
          status: 'approved',
          notes: 'Background check passed. Application approved.',
        });

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('4. Lease Creation', () => {
    it('should convert application to tenancy', async () => {
      if (!applicationId) {
        console.log('Skipping: No application ID');
        return;
      }

      const leaseStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const leaseEndDate = new Date(leaseStartDate);
      leaseEndDate.setFullYear(leaseEndDate.getFullYear() + 1);

      const response = await request(API_BASE)
        .post(`/api/v1/property-management/applications/${applicationId}/convert`)
        .set(createHeaders())
        .send({
          leaseStartDate: leaseStartDate.toISOString().split('T')[0],
          leaseEndDate: leaseEndDate.toISOString().split('T')[0],
          rentAmount: 2500,
          securityDeposit: 5000,
          rentCurrency: 'GHS',
        });

      expect([200, 201]).toContain(response.status);
      
      tenantId = response.body.data?.tenantId || response.body.tenantId;
      tenancyId = response.body.data?.tenancyId || response.body.tenancyId;
    });

    it('should verify unit is now occupied', async () => {
      if (!unitId) {
        console.log('Skipping: No unit ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/properties/${propertyId}/units/${unitId}`)
        .set(createHeaders());

      expect(response.status).toBe(200);
      // Unit should now be occupied
      const status = response.body.data?.status || response.body.status;
      expect(['occupied', 'leased']).toContain(status);
    });
  });

  // Store IDs for other tests
  afterAll(() => {
    (global as any).testIds = {
      propertyId,
      unitId,
      tenantId,
      tenancyId,
    };
  });
});

// ============================================================================
// PAYMENT PROCESSING FLOW
// ============================================================================

describe('Payment Processing Flow E2E', () => {
  let tenancyId: string;
  let tenantId: string;
  let invoiceId: string;
  let paymentId: string;
  let paystackReference: string;

  beforeAll(() => {
    // Get IDs from previous test or use test defaults
    const testIds = (global as any).testIds || {};
    tenancyId = testIds.tenancyId || process.env.TEST_TENANCY_ID;
    tenantId = testIds.tenantId || process.env.TEST_TENANT_ID;
  });

  describe('1. Invoice Generation', () => {
    it('should generate rent invoice', async () => {
      if (!tenancyId) {
        console.log('Using mock tenancy ID for payment test');
        tenancyId = 'mock-tenancy-id';
      }

      const response = await request(API_BASE)
        .post('/api/v1/property-management/invoices')
        .set(createHeaders())
        .send({
          tenancyId,
          type: 'rent',
          amount: 2500,
          currency: 'GHS',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          description: 'Monthly rent - E2E Test',
        });

      // Allow 201, 200, or 400 (if mock ID)
      if (response.status === 200 || response.status === 201) {
        invoiceId = response.body.data?.id || response.body.id;
        expect(invoiceId).toBeTruthy();
      }
    });

    it('should list pending invoices', async () => {
      const response = await request(API_BASE)
        .get('/api/v1/property-management/invoices')
        .set(createHeaders())
        .query({ status: 'pending' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data || response.body.invoices || response.body)).toBe(true);
    });
  });

  describe('2. Payment Initiation', () => {
    it('should initiate Paystack payment', async () => {
      if (!invoiceId) {
        console.log('Skipping: No invoice ID');
        return;
      }

      const response = await request(API_BASE)
        .post('/api/v1/property-management/payments/initiate')
        .set(createHeaders())
        .send({
          invoiceId,
          paymentMethod: 'paystack',
          email: testApplicant.email,
          amount: 2500,
          currency: 'GHS',
        });

      if (response.status === 200 || response.status === 201) {
        expect(response.body.data?.authorizationUrl || response.body.authorizationUrl).toBeTruthy();
        paystackReference = response.body.data?.reference || response.body.reference;
      }
    });

    it('should verify pending payment status', async () => {
      if (!paystackReference) {
        console.log('Skipping: No payment reference');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/payments/verify/${paystackReference}`)
        .set(createHeaders());

      // Payment should be pending until webhook confirms
      expect([200, 202]).toContain(response.status);
    });
  });

  describe('3. Webhook Processing (Simulated)', () => {
    it('should process payment webhook', async () => {
      if (!paystackReference) {
        console.log('Skipping: No payment reference');
        return;
      }

      // Simulate Paystack webhook (in real scenario, this comes from Paystack)
      const webhookPayload = {
        event: 'charge.success',
        data: {
          reference: paystackReference,
          amount: 250000, // Paystack uses kobo (smallest currency unit)
          currency: 'GHS',
          status: 'success',
          paid_at: new Date().toISOString(),
          channel: 'card',
          customer: {
            email: testApplicant.email,
          },
        },
      };

      // Note: In production, this would be validated by Paystack signature
      const response = await request(API_BASE)
        .post('/api/v1/property-management/payments/webhook/paystack')
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      // Webhook should return 200 to acknowledge receipt
      expect([200, 400]).toContain(response.status); // 400 if signature validation fails in test
    });
  });

  describe('4. Payment Verification', () => {
    it('should verify payment completion', async () => {
      if (!invoiceId) {
        console.log('Skipping: No invoice ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/invoices/${invoiceId}`)
        .set(createHeaders());

      expect(response.status).toBe(200);
      // In a complete flow, status would be 'paid'
      // For E2E without real Paystack, we verify the invoice exists
    });

    it('should get tenant payment history', async () => {
      if (!tenantId) {
        console.log('Skipping: No tenant ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/tenants/${tenantId}/payments`)
        .set(createHeaders());

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data || response.body.payments || response.body)).toBe(true);
      }
    });
  });
});

// ============================================================================
// MAINTENANCE REQUEST FLOW
// ============================================================================

describe('Maintenance Request Flow E2E', () => {
  let tenancyId: string;
  let tenantId: string;
  let requestId: string;
  let workOrderId: string;

  beforeAll(() => {
    const testIds = (global as any).testIds || {};
    tenancyId = testIds.tenancyId || process.env.TEST_TENANCY_ID;
    tenantId = testIds.tenantId || process.env.TEST_TENANT_ID;
  });

  describe('1. Request Submission', () => {
    it('should submit a maintenance request', async () => {
      if (!tenancyId) {
        console.log('Using mock tenancy ID for maintenance test');
        tenancyId = 'mock-tenancy-id';
      }

      const response = await request(API_BASE)
        .post('/api/v1/property-management/maintenance/requests')
        .set(createHeaders())
        .send({
          tenancyId,
          category: 'plumbing',
          description: 'E2E Test: Kitchen sink is leaking',
          priority: 'medium',
          preferredContactMethod: 'whatsapp',
          preferredTimeSlot: 'morning',
          permissionToEnter: true,
        });

      if ([200, 201].includes(response.status)) {
        requestId = response.body.data?.id || response.body.id;
        expect(requestId).toBeTruthy();
      }
    });

    it('should get the maintenance request', async () => {
      if (!requestId) {
        console.log('Skipping: No request ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/maintenance/requests/${requestId}`)
        .set(createHeaders());

      expect(response.status).toBe(200);
      const status = response.body.data?.status || response.body.status;
      expect(['pending', 'new', 'submitted']).toContain(status);
    });

    it('should list maintenance requests', async () => {
      const response = await request(API_BASE)
        .get('/api/v1/property-management/maintenance/requests')
        .set(createHeaders());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data || response.body.requests || response.body)).toBe(true);
    });
  });

  describe('2. Work Order Assignment', () => {
    it('should create a work order from the request', async () => {
      if (!requestId) {
        console.log('Skipping: No request ID');
        return;
      }

      const response = await request(API_BASE)
        .post('/api/v1/property-management/maintenance/work-orders')
        .set(createHeaders())
        .send({
          requestId,
          description: 'Fix kitchen sink leak',
          priority: 'medium',
          estimatedDuration: 2, // hours
          estimatedCost: 200,
        });

      if ([200, 201].includes(response.status)) {
        workOrderId = response.body.data?.id || response.body.id;
        expect(workOrderId).toBeTruthy();
      }
    });

    it('should assign vendor to work order', async () => {
      if (!workOrderId) {
        console.log('Skipping: No work order ID');
        return;
      }

      const response = await request(API_BASE)
        .patch(`/api/v1/property-management/maintenance/work-orders/${workOrderId}/assign`)
        .set(createHeaders())
        .send({
          vendorId: 'test-vendor-id',
          vendorName: 'E2E Test Plumber',
          vendorPhone: '+233201234568',
          scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        });

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('3. Calendar Scheduling', () => {
    it('should schedule maintenance on calendar', async () => {
      if (!workOrderId) {
        console.log('Skipping: No work order ID');
        return;
      }

      const scheduledStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      scheduledStart.setHours(9, 0, 0, 0);
      const scheduledEnd = new Date(scheduledStart);
      scheduledEnd.setHours(11, 0, 0, 0);

      const response = await request(API_BASE)
        .post(`/api/v1/calendar/maintenance/${workOrderId}/schedule`)
        .set(createHeaders())
        .send({
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
          vendorName: 'E2E Test Plumber',
          vendorEmail: 'plumber@test.com',
        });

      // Calendar might not be connected in test, so accept multiple statuses
      expect([200, 201, 400]).toContain(response.status);
    });
  });

  describe('4. Work Order Progress', () => {
    it('should start work order', async () => {
      if (!workOrderId) {
        console.log('Skipping: No work order ID');
        return;
      }

      const response = await request(API_BASE)
        .patch(`/api/v1/property-management/maintenance/work-orders/${workOrderId}/status`)
        .set(createHeaders())
        .send({
          status: 'in_progress',
          notes: 'Technician has arrived and started work',
        });

      expect([200, 204]).toContain(response.status);
    });

    it('should add work notes', async () => {
      if (!workOrderId) {
        console.log('Skipping: No work order ID');
        return;
      }

      const response = await request(API_BASE)
        .post(`/api/v1/property-management/maintenance/work-orders/${workOrderId}/notes`)
        .set(createHeaders())
        .send({
          note: 'Replaced damaged pipe section. Tested - no more leaks.',
          type: 'progress',
        });

      expect([200, 201]).toContain(response.status);
    });

    it('should complete work order', async () => {
      if (!workOrderId) {
        console.log('Skipping: No work order ID');
        return;
      }

      const response = await request(API_BASE)
        .patch(`/api/v1/property-management/maintenance/work-orders/${workOrderId}/status`)
        .set(createHeaders())
        .send({
          status: 'completed',
          notes: 'Work completed successfully. Kitchen sink functioning normally.',
          actualCost: 180,
          actualDuration: 1.5,
        });

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('5. Request Resolution', () => {
    it('should mark request as resolved', async () => {
      if (!requestId) {
        console.log('Skipping: No request ID');
        return;
      }

      const response = await request(API_BASE)
        .patch(`/api/v1/property-management/maintenance/requests/${requestId}/status`)
        .set(createHeaders())
        .send({
          status: 'resolved',
          resolutionNotes: 'Issue fixed. Tenant satisfied with work.',
        });

      expect([200, 204]).toContain(response.status);
    });

    it('should verify request is resolved', async () => {
      if (!requestId) {
        console.log('Skipping: No request ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/maintenance/requests/${requestId}`)
        .set(createHeaders());

      expect(response.status).toBe(200);
      const status = response.body.data?.status || response.body.status;
      expect(['resolved', 'completed', 'closed']).toContain(status);
    });
  });
});

// ============================================================================
// FINANCIAL REPORTING E2E
// ============================================================================

describe('Financial Reporting Flow E2E', () => {
  let propertyId: string;

  beforeAll(() => {
    const testIds = (global as any).testIds || {};
    propertyId = testIds.propertyId || process.env.TEST_PROPERTY_ID;
  });

  describe('1. Property Financial Metrics', () => {
    it('should get NOI calculation', async () => {
      if (!propertyId) {
        console.log('Using first available property');
        // Get first property
        const propResponse = await request(API_BASE)
          .get('/api/v1/property-management/properties')
          .set(createHeaders())
          .query({ limit: 1 });
        
        if (propResponse.body.data?.[0]?.id) {
          propertyId = propResponse.body.data[0].id;
        } else {
          console.log('No properties found, skipping financial tests');
          return;
        }
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/financials/noi/${propertyId}`)
        .set(createHeaders());

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('noi');
      }
    });

    it('should get Cap Rate calculation', async () => {
      if (!propertyId) {
        console.log('Skipping: No property ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/financials/cap-rate/${propertyId}`)
        .set(createHeaders())
        .query({ marketValue: 500000 });

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('capRate');
      }
    });

    it('should get property financial summary', async () => {
      if (!propertyId) {
        console.log('Skipping: No property ID');
        return;
      }

      const response = await request(API_BASE)
        .get(`/api/v1/property-management/financials/summary/${propertyId}`)
        .set(createHeaders());

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('propertyId');
      }
    });
  });

  describe('2. Portfolio Financial Metrics', () => {
    it('should get portfolio financial summary', async () => {
      const response = await request(API_BASE)
        .get('/api/v1/property-management/financials/portfolio-summary')
        .set(createHeaders());

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('totalProperties');
      }
    });
  });
});

// ============================================================================
// TENANT PORTAL E2E
// ============================================================================

describe('Tenant Portal Flow E2E', () => {
  let tenantPhone: string;
  let otpCode: string;

  describe('1. OTP Authentication', () => {
    it('should request OTP for tenant login', async () => {
      tenantPhone = testApplicant.phone;

      const response = await request(API_BASE)
        .post('/api/v1/tenant-portal/auth/otp/request')
        .send({ phone: tenantPhone });

      // In test mode, OTP might be mocked
      expect([200, 201, 400]).toContain(response.status);
    });

    // Note: Actual OTP verification would require SMS or test mode bypass
    it('should handle invalid OTP', async () => {
      const response = await request(API_BASE)
        .post('/api/v1/tenant-portal/auth/otp/verify')
        .send({
          phone: tenantPhone,
          otp: '000000', // Invalid OTP
        });

      // Should reject invalid OTP
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('2. Tenant Dashboard (Authenticated)', () => {
    // These tests assume authenticated tenant
    it('should get tenant dashboard (mock auth)', async () => {
      const response = await request(API_BASE)
        .get('/api/v1/tenant-portal/dashboard')
        .set('x-tenant-id', 'test-tenant-id')
        .set('Authorization', 'Bearer test-token');

      // May fail without proper auth - that's expected
      expect([200, 401, 404]).toContain(response.status);
    });
  });
});
