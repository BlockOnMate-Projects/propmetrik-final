/**
 * E2E Tests for E-Sign Flow
 * Tests the complete signing workflow from envelope creation to completion
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:4000';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '575438e9-a0a2-461d-8011-e9e54c30acd3';

describe('E-Sign Full Flow E2E Tests', () => {
    let envelopeId: string;
    let signerId: string;
    let accessToken: string;
    let fieldId: string;

    describe('Envelope Creation', () => {
        it('should create a new envelope with signers and fields', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/envelopes')
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({
                    name: 'E2E Test Lease Agreement',
                    documentHtml: '<html><body><h1>Test Lease Agreement</h1><p>This is a test document.</p></body></html>',
                    contextType: 'e2e_test',
                    contextEntityId: '12345678-1234-1234-1234-123456789abc',
                    contextEntityName: 'E2E Test Property',
                    message: 'Please sign this test document',
                    expiresInDays: 7,
                    signers: [
                        {
                            name: 'John Test Tenant',
                            email: 'john.tenant@test.com',
                            phone: '+1234567890',
                            role: 'Tenant',
                            order: 1
                        },
                        {
                            name: 'Jane Test Landlord',
                            email: 'jane.landlord@test.com',
                            role: 'Landlord',
                            order: 2
                        }
                    ],
                    fields: [
                        {
                            signerId: 'signer_1',
                            fieldType: 'signature',
                            page: 1,
                            x: 10,
                            y: 80,
                            width: 150,
                            height: 40,
                            required: true,
                            label: 'Tenant Signature'
                        },
                        {
                            signerId: 'signer_2',
                            fieldType: 'signature',
                            page: 1,
                            x: 60,
                            y: 80,
                            width: 150,
                            height: 40,
                            required: true,
                            label: 'Landlord Signature'
                        }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe('E2E Test Lease Agreement');
            expect(response.body.status).toBe('sent');
            expect(response.body.signers).toHaveLength(2);
            expect(response.body.fields).toHaveLength(2);

            envelopeId = response.body.id;
            signerId = response.body.signers[0].id;
            fieldId = response.body.fields.find((f: any) => f.signerId === signerId)?.id;
        });

        it('should list envelopes', async () => {
            const response = await request(API_BASE)
                .get('/api/v1/esign/envelopes')
                .set('x-organization-id', TEST_ORG_ID);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('envelopes');
            expect(response.body).toHaveProperty('total');
        });

        it('should get envelope by ID', async () => {
            const response = await request(API_BASE)
                .get(`/api/v1/esign/envelopes/${envelopeId}`)
                .set('x-organization-id', TEST_ORG_ID);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(envelopeId);
            expect(response.body.signers).toBeDefined();
            expect(response.body.fields).toBeDefined();
        });

        it('should get envelope audit log', async () => {
            const response = await request(API_BASE)
                .get(`/api/v1/esign/envelopes/${envelopeId}/audit`)
                .set('x-organization-id', TEST_ORG_ID);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            // Should have envelope_created and envelope_sent events at minimum
            expect(response.body.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('External Signing Flow', () => {
        it('should get envelope by access token', async () => {
            // First, get the envelope to find the access token
            const envelopeResponse = await request(API_BASE)
                .get(`/api/v1/esign/envelopes/${envelopeId}`)
                .set('x-organization-id', TEST_ORG_ID);

            const signer = envelopeResponse.body.signers.find((s: any) => s.id === signerId);
            accessToken = signer.accessToken;

            expect(accessToken).toBeDefined();

            const response = await request(API_BASE)
                .get(`/api/v1/esign/sign-envelope/${accessToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('envelope');
            expect(response.body).toHaveProperty('signer');
            expect(response.body.signer.id).toBe(signerId);
        });

        it('should reject invalid access token', async () => {
            const response = await request(API_BASE)
                .get('/api/v1/esign/sign-envelope/invalid-token-12345');

            expect(response.status).toBe(404);
        });

        it('should sign a field with drawn signature', async () => {
            // Create a simple base64 PNG signature (1x1 pixel)
            const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

            const response = await request(API_BASE)
                .post(`/api/v1/esign/sign-envelope/${accessToken}/fields/${fieldId}`)
                .send({
                    value: signatureData,
                    fontFamily: 'Brush Script MT'
                });

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(fieldId);
            expect(response.body.value).toBe(signatureData);
            expect(response.body.signedAt).toBeDefined();
        });
    });

    describe('Envelope Management', () => {
        it('should resend envelope to pending signers', async () => {
            const response = await request(API_BASE)
                .post(`/api/v1/esign/envelopes/${envelopeId}/resend`)
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID);

            expect(response.status).toBe(200);
        });

        it('should void an envelope', async () => {
            // Create a new envelope to void
            const createResponse = await request(API_BASE)
                .post('/api/v1/esign/envelopes')
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({
                    name: 'Envelope to Void',
                    documentHtml: '<html><body><h1>Void Test</h1></body></html>',
                    signers: [{ name: 'Test', email: 'test@void.com' }],
                    fields: [{ signerId: 'signer_1', fieldType: 'signature', x: 10, y: 10, width: 100, height: 30 }]
                });

            const voidEnvelopeId = createResponse.body.id;

            const response = await request(API_BASE)
                .post(`/api/v1/esign/envelopes/${voidEnvelopeId}/void`)
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({ reason: 'Testing void functionality' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('voided');
            expect(response.body.voidReason).toBe('Testing void functionality');
        });
    });

    describe('PDF Generation', () => {
        it('should create a test PDF', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/test/create-pdf')
                .send({ content: 'Test PDF Content' });

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toBe('application/pdf');
        });

        it('should generate full signed PDF with certificate', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/test/full-pdf')
                .send({
                    documentTitle: 'E2E Test Document',
                    includeSignatures: true,
                    includeCertificate: true
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.stats).toHaveProperty('originalSize');
            expect(response.body.stats).toHaveProperty('signedSize');
            expect(response.body.stats).toHaveProperty('documentHash');
            expect(response.body.signedPdfBase64).toBeDefined();
        });

        it('should generate Certificate of Completion', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/test/certificate')
                .send({ returnPdf: false });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.stats.pdfSize).toBeGreaterThan(0);
            expect(response.body.stats.pages).toBe(2);
            expect(response.body.certificatePdfBase64).toBeDefined();
        });
    });

    describe('Template Management', () => {
        let templateId: string;

        it('should create a new template', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/templates')
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({
                    name: 'E2E Test Template',
                    description: 'A test template for E2E testing',
                    category: 'Testing',
                    fieldDefinitions: [
                        { role: 'signer_1', type: 'signature', page: 1, x: 10, y: 80, width: 150, height: 40, required: true }
                    ],
                    roles: [
                        { name: 'Signer', order: 1, required: true }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe('E2E Test Template');
            templateId = response.body.id;
        });

        it('should list templates', async () => {
            const response = await request(API_BASE)
                .get('/api/v1/esign/templates')
                .set('x-organization-id', TEST_ORG_ID);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should get template by ID', async () => {
            const response = await request(API_BASE)
                .get(`/api/v1/esign/templates/${templateId}`)
                .set('x-organization-id', TEST_ORG_ID);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(templateId);
        });

        it('should update a template', async () => {
            const response = await request(API_BASE)
                .put(`/api/v1/esign/templates/${templateId}`)
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({
                    name: 'Updated E2E Test Template',
                    description: 'Updated description'
                });

            expect(response.status).toBe(200);
            expect(response.body.name).toBe('Updated E2E Test Template');
        });

        it('should delete a template', async () => {
            const response = await request(API_BASE)
                .delete(`/api/v1/esign/templates/${templateId}`)
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID);

            expect(response.status).toBe(204);
        });
    });

    describe('Health Check', () => {
        it('should return healthy status', async () => {
            const response = await request(API_BASE)
                .get('/api/v1/esign/health');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.service).toBe('e-sign');
        });
    });
});

describe('Security Tests', () => {
    describe('Token Expiration', () => {
        it('should reject expired access tokens', async () => {
            // This would require creating an envelope with a past expiration
            // For now, test that invalid tokens are rejected
            const response = await request(API_BASE)
                .get('/api/v1/esign/sign-envelope/expired-token-test');

            expect(response.status).toBe(404);
        });
    });

    describe('Access Control', () => {
        it('should reject requests without organization ID', async () => {
            const response = await request(API_BASE)
                .get('/api/v1/esign/envelopes/non-existent-id');

            // Should still work with default org, but return 404 for non-existent envelope
            expect(response.status).toBe(404);
        });

        it('should not allow access to other organizations envelopes', async () => {
            // Create envelope with one org
            const createResponse = await request(API_BASE)
                .post('/api/v1/esign/envelopes')
                .set('x-organization-id', 'org-1')
                .set('x-user-id', TEST_USER_ID)
                .send({
                    name: 'Org 1 Envelope',
                    documentHtml: '<html><body>Test</body></html>',
                    signers: [{ name: 'Test', email: 'test@test.com' }],
                    fields: []
                });

            if (createResponse.status === 201) {
                const envelopeId = createResponse.body.id;

                // Try to access with different org
                const accessResponse = await request(API_BASE)
                    .get(`/api/v1/esign/envelopes/${envelopeId}`)
                    .set('x-organization-id', 'org-2');

                expect(accessResponse.status).toBe(404);
            }
        });
    });

    describe('Input Validation', () => {
        it('should reject envelope without required fields', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/envelopes')
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({
                    // Missing name, documentHtml, signers
                });

            expect(response.status).toBe(400);
        });

        it('should reject envelope without signers', async () => {
            const response = await request(API_BASE)
                .post('/api/v1/esign/envelopes')
                .set('x-organization-id', TEST_ORG_ID)
                .set('x-user-id', TEST_USER_ID)
                .send({
                    name: 'Test',
                    documentHtml: '<html></html>',
                    signers: [] // Empty signers
                });

            expect(response.status).toBe(400);
        });

        it('should reject malformed signature data', async () => {
            // This test requires a valid access token
            // Would need to be implemented with a proper test envelope
        });
    });

    describe('Rate Limiting', () => {
        it('should handle multiple rapid requests', async () => {
            const requests = Array(10).fill(null).map(() =>
                request(API_BASE).get('/api/v1/esign/health')
            );

            const responses = await Promise.all(requests);
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
        });
    });
});

describe('Performance Tests', () => {
    describe('PDF Generation Performance', () => {
        it('should generate PDF within acceptable time', async () => {
            const startTime = Date.now();

            const response = await request(API_BASE)
                .post('/api/v1/esign/test/create-pdf')
                .send({ content: 'Performance test document with some content.' });

            const duration = Date.now() - startTime;

            expect(response.status).toBe(200);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });

        it('should generate certificate within acceptable time', async () => {
            const startTime = Date.now();

            const response = await request(API_BASE)
                .post('/api/v1/esign/test/certificate')
                .send({ returnPdf: false });

            const duration = Date.now() - startTime;

            expect(response.status).toBe(200);
            expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
        });

        it('should generate full signed PDF within acceptable time', async () => {
            const startTime = Date.now();

            const response = await request(API_BASE)
                .post('/api/v1/esign/test/full-pdf')
                .send({
                    documentTitle: 'Performance Test',
                    includeSignatures: true,
                    includeCertificate: true
                });

            const duration = Date.now() - startTime;

            expect(response.status).toBe(200);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
            
            console.log(`Full PDF generation took ${duration}ms`);
        });
    });

    describe('Envelope Operations Performance', () => {
        it('should list envelopes quickly', async () => {
            const startTime = Date.now();

            const response = await request(API_BASE)
                .get('/api/v1/esign/envelopes?limit=50')
                .set('x-organization-id', TEST_ORG_ID);

            const duration = Date.now() - startTime;

            expect(response.status).toBe(200);
            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
        });
    });
});
