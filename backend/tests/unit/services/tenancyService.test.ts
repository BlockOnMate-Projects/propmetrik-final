/**
 * TenancyService Unit Tests
 * Tests for lease management including overlapping tenancy detection
 */

import { TenancyService, TenancyStatus } from '../../../src/services/property-management/leases/tenancyService';

// Mock the database pool
const mockQuery = jest.fn();
const mockPool = {
    query: mockQuery,
    connect: jest.fn(),
    end: jest.fn()
};

describe('TenancyService', () => {
    let service: TenancyService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new TenancyService(mockPool as any);
    });

    describe('createTenancy', () => {
        const mockOrganizationId = 'org-123';
        const mockUserId = 'user-456';

        const baseTenancyData = {
            propertyId: 'prop-789',
            tenantId: 'tenant-abc',
            leaseStartDate: '2026-02-01',
            leaseEndDate: '2027-01-31',
            monthlyRent: 3000,
            rentCurrency: 'GHS',
            advancePaymentMonths: 12,
            rentDueDay: 1
        };

        it('should create a new tenancy when no overlapping exists', async () => {
            // Mock property check
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: baseTenancyData.propertyId }]
            });

            // Mock overlap check (no overlap)
            mockQuery.mockResolvedValueOnce({ rows: [] });

            // Mock insert
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'tenancy-new',
                    reference_number: 'TEN-001',
                    property_id: baseTenancyData.propertyId,
                    tenant_id: baseTenancyData.tenantId,
                    organization_id: mockOrganizationId,
                    lease_start_date: new Date(baseTenancyData.leaseStartDate),
                    lease_end_date: new Date(baseTenancyData.leaseEndDate),
                    monthly_rent: baseTenancyData.monthlyRent,
                    rent_currency: baseTenancyData.rentCurrency,
                    advance_payment_months: baseTenancyData.advancePaymentMonths,
                    status: TenancyStatus.PENDING,
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.createTenancy(mockOrganizationId, baseTenancyData, mockUserId);

            expect(result).toBeDefined();
            expect(result.status).toBe(TenancyStatus.PENDING);
            expect(result.monthlyRent).toBe(baseTenancyData.monthlyRent);
        });

        it('should throw error when overlapping tenancy exists', async () => {
            // Mock property check
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: baseTenancyData.propertyId }]
            });

            // Mock overlap check (overlap found!)
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: 'existing-tenancy' }]
            });

            await expect(
                service.createTenancy(mockOrganizationId, baseTenancyData, mockUserId)
            ).rejects.toThrow('Overlapping tenancy exists for this property/unit');
        });

        it('should throw error when property not found', async () => {
            // Mock property check (not found)
            mockQuery.mockResolvedValueOnce({ rows: [] });

            await expect(
                service.createTenancy(mockOrganizationId, baseTenancyData, mockUserId)
            ).rejects.toThrow('Property not found');
        });
    });

    describe('Overlapping Tenancy Detection', () => {
        const testCases = [
            {
                name: 'completely overlapping dates',
                existing: { start: '2026-01-01', end: '2026-12-31' },
                new: { start: '2026-03-01', end: '2026-06-30' },
                shouldOverlap: true
            },
            {
                name: 'new starts during existing',
                existing: { start: '2026-01-01', end: '2026-06-30' },
                new: { start: '2026-05-01', end: '2026-12-31' },
                shouldOverlap: true
            },
            {
                name: 'new ends during existing',
                existing: { start: '2026-06-01', end: '2026-12-31' },
                new: { start: '2026-01-01', end: '2026-08-31' },
                shouldOverlap: true
            },
            {
                name: 'new encompasses existing',
                existing: { start: '2026-03-01', end: '2026-06-30' },
                new: { start: '2026-01-01', end: '2026-12-31' },
                shouldOverlap: true
            },
            {
                name: 'adjacent dates (new after existing)',
                existing: { start: '2026-01-01', end: '2026-06-30' },
                new: { start: '2026-07-01', end: '2026-12-31' },
                shouldOverlap: false
            },
            {
                name: 'adjacent dates (new before existing)',
                existing: { start: '2026-07-01', end: '2026-12-31' },
                new: { start: '2026-01-01', end: '2026-06-30' },
                shouldOverlap: false
            },
            {
                name: 'non-overlapping with gap',
                existing: { start: '2026-01-01', end: '2026-03-31' },
                new: { start: '2026-06-01', end: '2026-12-31' },
                shouldOverlap: false
            }
        ];

        testCases.forEach(({ name, existing, new: newDates, shouldOverlap }) => {
            it(`should ${shouldOverlap ? 'detect' : 'not detect'} overlap: ${name}`, async () => {
                const mockOrganizationId = 'org-123';
                const tenancyData = {
                    propertyId: 'prop-789',
                    tenantId: 'tenant-abc',
                    leaseStartDate: newDates.start,
                    leaseEndDate: newDates.end,
                    monthlyRent: 3000
                };

                // Mock property check
                mockQuery.mockResolvedValueOnce({
                    rows: [{ id: tenancyData.propertyId }]
                });

                // Mock overlap check
                mockQuery.mockResolvedValueOnce({
                    rows: shouldOverlap ? [{ id: 'existing-tenancy' }] : []
                });

                if (shouldOverlap) {
                    await expect(
                        service.createTenancy(mockOrganizationId, tenancyData)
                    ).rejects.toThrow('Overlapping tenancy exists');
                } else {
                    // Mock insert for non-overlapping
                    mockQuery.mockResolvedValueOnce({
                        rows: [{
                            id: 'tenancy-new',
                            reference_number: 'TEN-002',
                            property_id: tenancyData.propertyId,
                            tenant_id: tenancyData.tenantId,
                            organization_id: mockOrganizationId,
                            lease_start_date: new Date(tenancyData.leaseStartDate),
                            lease_end_date: new Date(tenancyData.leaseEndDate),
                            monthly_rent: tenancyData.monthlyRent,
                            rent_currency: 'GHS',
                            status: TenancyStatus.PENDING,
                            created_at: new Date(),
                            updated_at: new Date()
                        }]
                    });

                    const result = await service.createTenancy(mockOrganizationId, tenancyData);
                    expect(result).toBeDefined();
                }
            });
        });
    });

    describe('Multi-unit Properties', () => {
        it('should allow same date range for different units', async () => {
            const mockOrganizationId = 'org-123';
            const propertyId = 'multi-unit-prop';
            const dateRange = { start: '2026-01-01', end: '2026-12-31' };

            // Create tenancy for Unit A
            const unitAData = {
                propertyId,
                tenantId: 'tenant-a',
                unitNumber: 'Unit A',
                leaseStartDate: dateRange.start,
                leaseEndDate: dateRange.end,
                monthlyRent: 3000
            };

            // Mock for Unit A creation
            mockQuery.mockResolvedValueOnce({ rows: [{ id: propertyId }] }); // property check
            mockQuery.mockResolvedValueOnce({ rows: [] }); // no overlap for Unit A
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'tenancy-unit-a',
                    unit_number: 'Unit A',
                    property_id: propertyId,
                    tenant_id: 'tenant-a',
                    organization_id: mockOrganizationId,
                    lease_start_date: new Date(dateRange.start),
                    lease_end_date: new Date(dateRange.end),
                    monthly_rent: 3000,
                    rent_currency: 'GHS',
                    status: TenancyStatus.PENDING,
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const resultA = await service.createTenancy(mockOrganizationId, unitAData);
            expect(resultA.unitNumber).toBe('Unit A');

            // Create tenancy for Unit B (same property, same dates, different unit)
            const unitBData = {
                propertyId,
                tenantId: 'tenant-b',
                unitNumber: 'Unit B',
                leaseStartDate: dateRange.start,
                leaseEndDate: dateRange.end,
                monthlyRent: 3500
            };

            mockQuery.mockResolvedValueOnce({ rows: [{ id: propertyId }] }); // property check
            mockQuery.mockResolvedValueOnce({ rows: [] }); // no overlap for Unit B (different unit)
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: 'tenancy-unit-b',
                    unit_number: 'Unit B',
                    property_id: propertyId,
                    tenant_id: 'tenant-b',
                    organization_id: mockOrganizationId,
                    lease_start_date: new Date(dateRange.start),
                    lease_end_date: new Date(dateRange.end),
                    monthly_rent: 3500,
                    rent_currency: 'GHS',
                    status: TenancyStatus.PENDING,
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const resultB = await service.createTenancy(mockOrganizationId, unitBData);
            expect(resultB.unitNumber).toBe('Unit B');
        });
    });

    describe('activateTenancy', () => {
        it('should activate a pending tenancy', async () => {
            const tenancyId = 'tenancy-123';
            const orgId = 'org-456';

            // Mock get tenancy
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: tenancyId,
                    organization_id: orgId,
                    status: TenancyStatus.PENDING,
                    property_id: 'prop-789',
                    tenant_id: 'tenant-abc',
                    lease_start_date: new Date('2026-02-01'),
                    lease_end_date: new Date('2027-01-31'),
                    monthly_rent: 3000,
                    rent_currency: 'GHS',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock update
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: tenancyId,
                    organization_id: orgId,
                    status: TenancyStatus.ACTIVE,
                    property_id: 'prop-789',
                    tenant_id: 'tenant-abc',
                    lease_start_date: new Date('2026-02-01'),
                    lease_end_date: new Date('2027-01-31'),
                    monthly_rent: 3000,
                    rent_currency: 'GHS',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.activateTenancy(tenancyId, orgId);

            expect(result.status).toBe(TenancyStatus.ACTIVE);
        });
    });

    describe('terminateTenancy', () => {
        it('should terminate an active tenancy with reason', async () => {
            const tenancyId = 'tenancy-123';
            const orgId = 'org-456';
            const reason = 'Tenant requested early termination';

            // Mock get tenancy
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: tenancyId,
                    organization_id: orgId,
                    status: TenancyStatus.ACTIVE,
                    property_id: 'prop-789',
                    tenant_id: 'tenant-abc',
                    lease_start_date: new Date('2026-02-01'),
                    lease_end_date: new Date('2027-01-31'),
                    monthly_rent: 3000,
                    rent_currency: 'GHS',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            // Mock update
            mockQuery.mockResolvedValueOnce({
                rows: [{
                    id: tenancyId,
                    organization_id: orgId,
                    status: TenancyStatus.TERMINATED,
                    terminated_at: new Date(),
                    termination_reason: reason,
                    property_id: 'prop-789',
                    tenant_id: 'tenant-abc',
                    lease_start_date: new Date('2026-02-01'),
                    lease_end_date: new Date('2027-01-31'),
                    monthly_rent: 3000,
                    rent_currency: 'GHS',
                    created_at: new Date(),
                    updated_at: new Date()
                }]
            });

            const result = await service.terminateTenancy(tenancyId, orgId, reason);

            expect(result.status).toBe(TenancyStatus.TERMINATED);
            expect(result.terminationReason).toBe(reason);
        });
    });
});
