/**
 * Vendor Service
 * 
 * Phase 3.4: Split teamService
 * 
 * Manages vendor directory:
 * - Vendor registration and approval
 * - Performance ratings
 * - Preferred vendor management
 * 
 * @module services/project-management/team/VendorService
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { eventBus } from '../events/EventBus';
import {
  Vendor,
  CreateVendorInput,
  VendorFilters,
  VendorRating,
  VendorCategory,
  VendorStatus,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class VendorServiceImpl extends BaseService {
  constructor() {
    super('VendorService');
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  async addVendor(input: CreateVendorInput): Promise<Vendor> {
    const result = await this.query(
      `INSERT INTO pm_vendors (
         organization_id, category, company_name, trading_name,
         contact_person, email, phone, phone_alt, whatsapp,
         address, city, region, postal_code,
         tin_number, business_registration, ssnit_number,
         bank_name, bank_branch, account_number, account_name,
         mobile_money_provider, mobile_money_number,
         services, specializations,
         insurance_certificate, insurance_expiry,
         notes
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
       )
       RETURNING *`,
      [
        input.organizationId,
        input.category,
        input.companyName,
        input.tradingName || null,
        input.contactPerson,
        input.email,
        input.phone,
        input.phoneAlt || null,
        input.whatsapp || null,
        input.address || null,
        input.city || null,
        input.region || null,
        input.postalCode || null,
        input.tinNumber || null,
        input.businessRegistration || null,
        input.ssnitNumber || null,
        input.bankName || null,
        input.bankBranch || null,
        input.accountNumber || null,
        input.accountName || null,
        input.mobileMoneyProvider || null,
        input.mobileMoneyNumber || null,
        input.services || [],
        input.specializations || [],
        input.insuranceCertificate || null,
        input.insuranceExpiry || null,
        input.notes || null,
      ]
    );

    const vendor = this.mapRow(result.rows[0]);

    eventBus.emit('vendor.created', {
      vendorId: vendor.id,
      organizationId: input.organizationId,
      category: input.category,
    });

    return vendor;
  }

  async getVendorById(id: string): Promise<Vendor | null> {
    const result = await this.query(
      `SELECT * FROM pm_vendors WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getApprovedVendors(
    organizationId: string,
    category?: VendorCategory
  ): Promise<Vendor[]> {
    const params: any[] = [organizationId];
    let categoryClause = '';
    
    if (category) {
      categoryClause = 'AND category = $2';
      params.push(category);
    }

    const result = await this.query(
      `SELECT * FROM pm_vendors
       WHERE organization_id = $1 AND is_approved = true ${categoryClause}
       ORDER BY is_preferred DESC, rating DESC NULLS LAST, company_name`,
      params
    );

    return result.rows.map(this.mapRow);
  }

  async searchVendors(filters: VendorFilters): Promise<{ vendors: Vendor[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      conditions.push(`organization_id = $${paramIndex++}`);
      params.push(filters.organizationId);
    }

    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(filters.category);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.isApproved !== undefined) {
      conditions.push(`is_approved = $${paramIndex++}`);
      params.push(filters.isApproved);
    }

    if (filters.isPreferred !== undefined) {
      conditions.push(`is_preferred = $${paramIndex++}`);
      params.push(filters.isPreferred);
    }

    if (filters.minRating !== undefined) {
      conditions.push(`rating >= $${paramIndex++}`);
      params.push(filters.minRating);
    }

    if (filters.search) {
      conditions.push(`(
        company_name ILIKE $${paramIndex} OR
        trading_name ILIKE $${paramIndex} OR
        contact_person ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        $${paramIndex} = ANY(services) OR
        $${paramIndex} = ANY(specializations)
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.query(
        `SELECT * FROM pm_vendors ${whereClause}
         ORDER BY is_preferred DESC, rating DESC NULLS LAST, company_name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset]
      ),
      this.query(
        `SELECT COUNT(*) as total FROM pm_vendors ${whereClause}`,
        params
      ),
    ]);

    return {
      vendors: dataResult.rows.map(this.mapRow),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  // ==========================================================================
  // RATINGS
  // ==========================================================================

  async rateVendorPerformance(rating: VendorRating): Promise<void> {
    // Insert rating record
    await this.query(
      `INSERT INTO pm_vendor_ratings (
         vendor_id, project_id, rated_by,
         quality, timeliness, communication, value, overall_rating,
         feedback, would_recommend
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        rating.vendorId,
        rating.projectId,
        rating.ratedBy,
        rating.quality,
        rating.timeliness,
        rating.communication,
        rating.value,
        rating.overallRating,
        rating.feedback || null,
        rating.wouldRecommend,
      ]
    );

    // Update vendor aggregate rating
    await this.query(
      `UPDATE pm_vendors
       SET rating = (
         SELECT AVG(overall_rating) FROM pm_vendor_ratings WHERE vendor_id = $1
       ),
       total_ratings = (
         SELECT COUNT(*) FROM pm_vendor_ratings WHERE vendor_id = $1
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [rating.vendorId]
    );

    eventBus.emit('vendor.rated', {
      vendorId: rating.vendorId,
      projectId: rating.projectId,
      overallRating: rating.overallRating,
    });
  }

  async getVendorRatings(vendorId: string): Promise<VendorRating[]> {
    const result = await this.query(
      `SELECT * FROM pm_vendor_ratings WHERE vendor_id = $1 ORDER BY created_at DESC`,
      [vendorId]
    );
    
    return result.rows.map(row => ({
      vendorId: row.vendor_id,
      projectId: row.project_id,
      ratedBy: row.rated_by,
      quality: row.quality,
      timeliness: row.timeliness,
      communication: row.communication,
      value: row.value,
      overallRating: row.overall_rating,
      feedback: row.feedback,
      wouldRecommend: row.would_recommend,
    }));
  }

  // ==========================================================================
  // APPROVAL WORKFLOW
  // ==========================================================================

  async approveVendor(vendorId: string, approvedBy: string): Promise<Vendor | null> {
    const result = await this.query(
      `UPDATE pm_vendors
       SET is_approved = true, 
           status = 'approved',
           approved_by = $2, 
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [vendorId, approvedBy]
    );

    if (result.rows.length) {
      eventBus.emit('vendor.approved', { vendorId, approvedBy });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async suspendVendor(vendorId: string, suspendedBy: string, reason: string): Promise<Vendor | null> {
    const result = await this.query(
      `UPDATE pm_vendors
       SET status = 'suspended',
           notes = COALESCE(notes || E'\n', '') || $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [vendorId, suspendedBy, `Suspended: ${reason}`]
    );

    if (result.rows.length) {
      eventBus.emit('vendor.suspended', { vendorId, suspendedBy, reason });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async setPreferredVendor(vendorId: string, isPreferred: boolean): Promise<Vendor | null> {
    const result = await this.query(
      `UPDATE pm_vendors
       SET is_preferred = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [vendorId, isPreferred]
    );

    if (result.rows.length) {
      eventBus.emit('vendor.preferred_status_changed', { vendorId, isPreferred });
    }

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  // ==========================================================================
  // PROJECT ASSOCIATION
  // ==========================================================================

  async incrementCompletedProjects(vendorId: string): Promise<void> {
    await this.query(
      `UPDATE pm_vendors SET completed_projects = completed_projects + 1, updated_at = NOW() WHERE id = $1`,
      [vendorId]
    );
  }

  async getVendorsByProject(projectId: string): Promise<Vendor[]> {
    const result = await this.query(
      `SELECT DISTINCT v.* FROM pm_vendors v
       JOIN pm_project_team t ON t.vendor_id = v.id
       WHERE t.project_id = $1 AND t.is_active = true
       ORDER BY v.company_name`,
      [projectId]
    );
    return result.rows.map(this.mapRow);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  protected mapRow(row: any): Vendor {
    return {
      id: row.id,
      organizationId: row.organization_id,
      category: row.category,
      companyName: row.company_name,
      tradingName: row.trading_name,
      contactPerson: row.contact_person,
      email: row.email,
      phone: row.phone,
      phoneAlt: row.phone_alt,
      whatsapp: row.whatsapp,
      address: row.address,
      city: row.city,
      region: row.region,
      postalCode: row.postal_code,
      tinNumber: row.tin_number,
      businessRegistration: row.business_registration,
      ssnitNumber: row.ssnit_number,
      bankName: row.bank_name,
      bankBranch: row.bank_branch,
      accountNumber: row.account_number,
      accountName: row.account_name,
      mobileMoneyProvider: row.mobile_money_provider,
      mobileMoneyNumber: row.mobile_money_number,
      services: row.services || [],
      specializations: row.specializations || [],
      rating: row.rating,
      totalRatings: parseInt(row.total_ratings, 10) || 0,
      completedProjects: parseInt(row.completed_projects, 10) || 0,
      status: row.status,
      isApproved: row.is_approved,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at) : null,
      isPreferred: row.is_preferred,
      insuranceCertificate: row.insurance_certificate,
      insuranceExpiry: row.insurance_expiry ? new Date(row.insurance_expiry) : null,
      notes: row.notes,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const vendorService = new VendorServiceImpl();
