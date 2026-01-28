/**
 * ApplicationService Unit Tests
 * Tests for tenant application state machine and workflows
 */

import { ApplicationService, ApplicationStatus, StateMachineError, CreateApplicationDto } from '../../../src/services/property-management/applications/applicationService';

// Mock the database pool
const mockQuery = jest.fn();
const mockPool = {
    query: mockQuery,
    connect: jest.fn(),
    end: jest.fn()
};

describe('ApplicationService', () => {
    let service: ApplicationService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ApplicationService(mockPool as any);
    });

    describe('State Machine Transitions', () => {
        const validTransitions = [
            { from: ApplicationStatus.DRAFT, to: ApplicationStatus.SUBMITTED },
            { from: ApplicationStatus.DRAFT, to: ApplicationStatus.WITHDRAWN },
            { from: ApplicationStatus.SUBMITTED, to: ApplicationStatus.UNDER_REVIEW },
            { from: ApplicationStatus.SUBMITTED, to: ApplicationStatus.WITHDRAWN },
            { from: ApplicationStatus.UNDER_REVIEW, to: ApplicationStatus.APPROVED },
            { from: ApplicationStatus.UNDER_REVIEW, to: ApplicationStatus.REJECTED },
            { from: ApplicationStatus.APPROVED, to: ApplicationStatus.LEASE_GENERATED },
        ];

        const invalidTransitions = [
            { from: ApplicationStatus.DRAFT, to: ApplicationStatus.APPROVED },
            { from: ApplicationStatus.SUBMITTED, to: ApplicationStatus.APPROVED },
            { from: ApplicationStatus.SUBMITTED, to: ApplicationStatus.LEASE_GENERATED },
            { from: ApplicationStatus.REJECTED, to: ApplicationStatus.APPROVED },
            { from: ApplicationStatus.REJECTED, to: ApplicationStatus.SUBMITTED },
            { from: ApplicationStatus.WITHDRAWN, to: ApplicationStatus.SUBMITTED },
            { from: ApplicationStatus.EXPIRED, to: ApplicationStatus.SUBMITTED },
        ];

        it.each(validTransitions)(
            'should allow transition from $from to $to',
            ({ from, to }) => {
                const validateTransition = (service as any).validateTransition.bind(service);
                expect(() => validateTransition(from, to)).not.toThrow();
            }
        );

        it.each(invalidTransitions)(
            'should reject transition from $from to $to',
            ({ from, to }) => {
                const validateTransition = (service as any).validateTransition.bind(service);
                expect(() => validateTransition(from, to)).toThrow(StateMachineError);
            }
        );
    });

    describe('createApplication', () => {
        const mockOrganizationId = 'org-123';
        const mockApplicationData: CreateApplicationDto = {
            propertyId: 'prop-456',
            applicantFullName: 'Kwame Mensah',
            applicantEmail: 'kwame@example.com',
            applicantPhone: '0244123456',
            applicantCurrentAddress: '123 Independence Ave, Accra',
            occupation: 'Software Engineer',
            employerName: 'Tech Ghana Ltd',
            monthlyIncome: 5000,
            desiredLeaseTermMonths: 12,
            characterReferences: [
                { name: 'Ama Owusu', phone: '0201234567', relationship: 'Colleague' }
            ]
        };

        it('should create a new application in DRAFT status', async () => {
            const mockCreatedApplication = {
                id: 'app-789',
                organization_id: mockOrganizationId,
                property_id: mockApplicationData.propertyId,
                applicant_full_name: mockApplicationData.applicantFullName,
                applicant_email: mockApplicationData.applicantEmail,
                applicant_phone: mockApplicationData.applicantPhone,
                status: ApplicationStatus.DRAFT,
                application_token: 'test-token',
                application_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                character_references: JSON.stringify(mockApplicationData.characterReferences),
                previous_addresses: '[]',
                uploaded_documents: '[]',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockQuery.mockResolvedValueOnce({ rows: [mockCreatedApplication] });

            const result = await service.createApplication(mockOrganizationId, mockApplicationData);

            expect(result).toBeDefined();
            expect(result.status).toBe(ApplicationStatus.DRAFT);
            expect(result.applicantFullName).toBe(mockApplicationData.applicantFullName);
            expect(result.applicationToken).toBeDefined();
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        it('should generate a valid application token', async () => {
            const mockCreatedApplication = {
                id: 'app-789',
                organization_id: mockOrganizationId,
                property_id: mockApplicationData.propertyId,
                applicant_full_name: mockApplicationData.applicantFullName,
                applicant_email: mockApplicationData.applicantEmail,
                applicant_phone: mockApplicationData.applicantPhone,
                status: ApplicationStatus.DRAFT,
                application_token: 'abc123def456',
                application_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                character_references: '[]',
                previous_addresses: '[]',
                uploaded_documents: '[]',
                created_at: new Date(),
                updated_at: new Date()
            };

            mockQuery.mockResolvedValueOnce({ rows: [mockCreatedApplication] });

            const result = await service.createApplication(mockOrganizationId, mockApplicationData);

            expect(result.applicationToken).toBeDefined();
            expect(typeof result.applicationToken).toBe('string');
            expect(result.applicationTokenExpiresAt).toBeDefined();
            expect(new Date(result.applicationTokenExpiresAt!).getTime()).toBeGreaterThan(Date.now());
        });
    });

    describe('submitApplication', () => {
        it('should transition from DRAFT to SUBMITTED', async () => {
            const appId = 'app-123';
            const orgId = 'org-456';

            // Mock getting the current application
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: appId,
                    organization_id: orgId,
                    status: ApplicationStatus.DRAFT,
                    applicant_full_name: 'Test User',
                    applicant_email: 'test@example.com',
                    applicant_phone: '0241234567',
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock the update query
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: appId,
                    organization_id: orgId,
                    status: ApplicationStatus.SUBMITTED,
                    submitted_at: new Date(),
                    applicant_full_name: 'Test User',
                    applicant_email: 'test@example.com',
                    applicant_phone: '0241234567',
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.submitApplication(appId, orgId);

            expect(result.status).toBe(ApplicationStatus.SUBMITTED);
            expect(result.submittedAt).toBeDefined();
        });

        it('should throw error when application not found', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(
                service.submitApplication('non-existent', 'org-123')
            ).rejects.toThrow('Application not found');
        });
    });

    describe('approveApplication', () => {
        it('should transition from UNDER_REVIEW to APPROVED', async () => {
            const appId = 'app-123';
            const orgId = 'org-456';
            const userId = 'user-789';

            // Mock getting the current application
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: appId,
                    organization_id: orgId,
                    status: ApplicationStatus.UNDER_REVIEW,
                    applicant_full_name: 'Test User',
                    applicant_email: 'test@example.com',
                    applicant_phone: '0241234567',
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock the update query
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: appId,
                    organization_id: orgId,
                    status: ApplicationStatus.APPROVED,
                    reviewed_at: new Date(),
                    reviewed_by: userId,
                    applicant_full_name: 'Test User',
                    applicant_email: 'test@example.com',
                    applicant_phone: '0241234567',
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.approveApplication(appId, orgId, userId, 'Good candidate');

            expect(result.status).toBe(ApplicationStatus.APPROVED);
            expect(result.reviewedAt).toBeDefined();
        });
    });

    describe('rejectApplication', () => {
        it('should transition from UNDER_REVIEW to REJECTED with reason', async () => {
            const appId = 'app-123';
            const orgId = 'org-456';
            const userId = 'user-789';
            const reason = 'Income too low';

            // Mock getting the current application
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: appId,
                    organization_id: orgId,
                    status: ApplicationStatus.UNDER_REVIEW,
                    applicant_full_name: 'Test User',
                    applicant_email: 'test@example.com',
                    applicant_phone: '0241234567',
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock the update query
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: appId,
                    organization_id: orgId,
                    status: ApplicationStatus.REJECTED,
                    reviewed_at: new Date(),
                    reviewed_by: userId,
                    rejection_reason: reason,
                    applicant_full_name: 'Test User',
                    applicant_email: 'test@example.com',
                    applicant_phone: '0241234567',
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.rejectApplication(appId, orgId, userId, reason);

            expect(result.status).toBe(ApplicationStatus.REJECTED);
            expect(result.rejectionReason).toBe(reason);
        });
    });

    describe('createApplicationFromLink', () => {
        it('should create and auto-submit application from valid link', async () => {
            const linkToken = 'valid-link-token';
            const mockApplicationData: CreateApplicationDto = {
                propertyId: 'will-be-overridden',
                applicantFullName: 'Ama Boateng',
                applicantEmail: 'ama@example.com',
                applicantPhone: '0551234567'
            };

            // Mock link validation query
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'link-123',
                    property_id: 'prop-789',
                    organization_id: 'org-456',
                    token: linkToken,
                    is_active: true,
                    expires_at: new Date(Date.now() + 86400000),
                    max_uses: 10,
                    current_uses: 5
                }]
            });

            // Mock link usage increment
            mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

            // Mock application creation
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'app-new',
                    organization_id: 'org-456',
                    property_id: 'prop-789',
                    applicant_full_name: mockApplicationData.applicantFullName,
                    applicant_email: mockApplicationData.applicantEmail,
                    applicant_phone: mockApplicationData.applicantPhone,
                    status: ApplicationStatus.DRAFT,
                    application_token: 'new-token',
                    application_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock submit - get application
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'app-new',
                    organization_id: 'org-456',
                    status: ApplicationStatus.DRAFT,
                    applicant_full_name: mockApplicationData.applicantFullName,
                    applicant_email: mockApplicationData.applicantEmail,
                    applicant_phone: mockApplicationData.applicantPhone,
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock submit - update
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'app-new',
                    organization_id: 'org-456',
                    property_id: 'prop-789',
                    status: ApplicationStatus.SUBMITTED,
                    submitted_at: new Date(),
                    applicant_full_name: mockApplicationData.applicantFullName,
                    applicant_email: mockApplicationData.applicantEmail,
                    applicant_phone: mockApplicationData.applicantPhone,
                    character_references: '[]',
                    previous_addresses: '[]',
                    uploaded_documents: '[]',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.createApplicationFromLink(linkToken, mockApplicationData);

            expect(result.status).toBe(ApplicationStatus.SUBMITTED);
            expect(result.propertyId).toBe('prop-789'); // From link, not input
        });

        it('should throw error for invalid link', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(
                service.createApplicationFromLink('invalid-token', {
                    propertyId: 'prop-123',
                    applicantFullName: 'Test',
                    applicantEmail: 'test@test.com',
                    applicantPhone: '0241234567'
                })
            ).rejects.toThrow('Invalid or expired application link');
        });
    });
});
