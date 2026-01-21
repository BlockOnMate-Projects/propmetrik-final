
import { v4 as uuidv4 } from 'uuid';
import db from '../../../database';
import {
    Vendor,
    CreateVendorDto,
    UpdateVendorDto,
    VendorStatus,
    VendorRating,
    PaginationParams,
    PaginatedResponse,
    MaintenanceCategory
} from '../../../types/property-management.types';
import { AppError } from '../../../middleware/errorHandler';

export class VendorService {
    /**
     * Create a new vendor
     */
    async createVendor(organizationId: string, data: CreateVendorDto, userId: string): Promise<Vendor> {
        const id = uuidv4();

        // Convert array fields to JSON for storage if needed, or PostgreSQL array
        // type definitions show service_categories is an enum array.

        const query = `
      INSERT INTO vendors (
        id, organization_id, business_name, contact_person, 
        phone_primary, phone_secondary, email, address, 
        digital_address, region, tin_number, business_registration,
        service_categories, bank_name, bank_account_number, 
        mobile_money_number, preferred_payment_method, notes,
        status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

        const values = [
            id,
            organizationId,
            data.businessName,
            data.contactPerson,
            data.phonePrimary,
            data.phoneSecondary || null,
            data.email || null,
            data.address || null,
            data.digitalAddress || null,
            data.region || null,
            data.tinNumber || null,
            data.businessRegistration || null,
            data.serviceCategories,
            data.bankName || null,
            data.bankAccountNumber || null,
            data.mobileMoneyNumber || null,
            data.preferredPaymentMethod || null,
            data.notes || null,
            data.status || VendorStatus.ACTIVE,
            userId
        ];

        const result = await db.query(query, values);
        return this.mapToVendor(result.rows[0]);
    }

    /**
     * Get vendor by ID
     */
    async getVendorById(id: string, organizationId: string): Promise<Vendor> {
        const query = `
      SELECT * FROM vendors 
      WHERE id = $1 AND organization_id = $2
    `;
        const result = await db.query(query, [id, organizationId]);

        if (result.rows.length === 0) {
            throw new AppError('Vendor not found', 404);
        }

        return this.mapToVendor(result.rows[0]);
    }

    /**
     * Update vendor
     */
    async updateVendor(
        id: string,
        organizationId: string,
        data: UpdateVendorDto
    ): Promise<Vendor> {
        const current = await this.getVendorById(id, organizationId);

        // Build dynamic update query
        const updates: string[] = [];
        const values: any[] = [id, organizationId];
        let paramIndex = 3;

        const fieldsToUpdate: Partial<keyof UpdateVendorDto>[] = [
            'businessName', 'contactPerson', 'phonePrimary', 'phoneSecondary',
            'email', 'address', 'digitalAddress', 'region', 'tinNumber',
            'businessRegistration', 'serviceCategories', 'bankName',
            'bankAccountNumber', 'mobileMoneyNumber', 'preferredPaymentMethod',
            'notes', 'status'
        ];

        // Map DTO keys to DB columns
        const dbColumnMap: Record<string, string> = {
            businessName: 'business_name',
            contactPerson: 'contact_person',
            phonePrimary: 'phone_primary',
            phoneSecondary: 'phone_secondary',
            email: 'email',
            address: 'address',
            digitalAddress: 'digital_address',
            region: 'region',
            tinNumber: 'tin_number',
            businessRegistration: 'business_registration',
            serviceCategories: 'service_categories',
            bankName: 'bank_name',
            bankAccountNumber: 'bank_account_number',
            mobileMoneyNumber: 'mobile_money_number',
            preferredPaymentMethod: 'preferred_payment_method',
            notes: 'notes',
            status: 'status'
        };

        for (const field of fieldsToUpdate) {
            if (data[field] !== undefined) {
                updates.push(`${dbColumnMap[field]} = $${paramIndex}`);
                values.push(data[field]);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return current;
        }

        const query = `
      UPDATE vendors 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `;

        const result = await db.query(query, values);
        return this.mapToVendor(result.rows[0]);
    }

    /**
     * Delete vendor
     */
    async deleteVendor(id: string, organizationId: string): Promise<void> {
        // First check if vendor exists
        await this.getVendorById(id, organizationId);

        const query = `
      DELETE FROM vendors 
      WHERE id = $1 AND organization_id = $2
    `;
        await db.query(query, [id, organizationId]);
    }

    /**
     * List vendors with filtering and pagination
     */
    async listVendors(
        organizationId: string,
        filters: {
            category?: MaintenanceCategory;
            status?: VendorStatus;
            search?: string;
        },
        pagination: PaginationParams
    ): Promise<PaginatedResponse<Vendor>> {
        const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        const conditions = [`organization_id = $1`];
        const values: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.status) {
            conditions.push(`status = $${paramIndex}`);
            values.push(filters.status);
            paramIndex++;
        }

        if (filters.category) {
            conditions.push(`$${paramIndex} = ANY(service_categories)`);
            values.push(filters.category);
            paramIndex++;
        }

        if (filters.search) {
            conditions.push(`(
        business_name ILIKE $${paramIndex} OR 
        contact_person ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        phone_primary ILIKE $${paramIndex}
      )`);
            values.push(`%${filters.search}%`);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const countQuery = `SELECT COUNT(*) FROM vendors ${whereClause}`;
        const countResult = await db.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count);

        // Get Data
        // Valid sort columns
        const validSortColumns = ['business_name', 'created_at', 'average_rating', 'total_jobs_completed'];
        const sortField = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const sortDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const query = `
      SELECT * FROM vendors
      ${whereClause}
      ORDER BY ${sortField} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

        values.push(limit, offset);

        const result = await db.query(query, values);
        const data = result.rows.map(this.mapToVendor);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrevious: page > 1
        };
    }

    /**
     * Update vendor rating after work order completion (Internal method)
     */
    async updateVendorRating(vendorId: string, rating: number): Promise<void> {
        const query = `
      UPDATE vendors SET
        total_ratings = total_ratings + 1,
        average_rating = (
          (average_rating * total_ratings + $2) / (total_ratings + 1)
        ),
        total_jobs_completed = total_jobs_completed + 1
      WHERE id = $1
    `;
        await db.query(query, [vendorId, rating]);
    }

    private mapToVendor(row: any): Vendor {
        return {
            id: row.id,
            organizationId: row.organization_id,
            businessName: row.business_name,
            contactPerson: row.contact_person,
            phonePrimary: row.phone_primary,
            phoneSecondary: row.phone_secondary,
            email: row.email,
            address: row.address,
            digitalAddress: row.digital_address,
            region: row.region,
            tinNumber: row.tin_number,
            businessRegistration: row.business_registration,
            serviceCategories: row.service_categories,
            totalJobsCompleted: row.total_jobs_completed,
            averageRating: parseFloat(row.average_rating),
            totalRatings: row.total_ratings,
            bankName: row.bank_name,
            bankAccountNumber: row.bank_account_number,
            mobileMoneyNumber: row.mobile_money_number,
            preferredPaymentMethod: row.preferred_payment_method,
            status: row.status,
            notes: row.notes,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const vendorService = new VendorService();
