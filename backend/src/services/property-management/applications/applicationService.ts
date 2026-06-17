/**
 * ApplicationService
 * Tenant Application Management with State Machine
 * 
 * Handles tenant applications for properties with full workflow:
 * draft → submitted → under_review → approved/rejected → lease_generated
 * 
 * @module services/property-management/applications
 */

import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { pool } from '../../../database';
import { notify, resolveOrgStaff } from '../../../../shared-services/notifications/in-mail';
import { logger } from '../../../utils/logger';

// =====================================================
// TYPES
// =====================================================

export enum ApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  LEASE_GENERATED = 'lease_generated',
  EXPIRED = 'expired'
}

export interface CharacterReference {
  name: string;
  phone: string;
  relationship: string;
  email?: string;
}

export interface PreviousAddress {
  address: string;
  landlordName?: string;
  landlordPhone?: string;
  duration: string;
  reasonForLeaving?: string;
}

export interface UploadedDocument {
  type: string; // 'ghana_card', 'passport', 'proof_of_income', 'employment_letter'
  side?: string; // 'front' | 'back' | 'bio' for ID images
  url: string;
  uploadedAt: string;
  filename?: string;
}

export interface Application {
  id: string;
  organizationId: string;
  propertyId: string;
  
  // Applicant info
  applicantFullName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantPhoneSecondary?: string;
  applicantDateOfBirth?: Date;
  applicantIdType?: string;
  applicantGhanaCard?: string;
  applicantCurrentAddress?: string;
  applicantDigitalAddress?: string;
  
  // Employment
  occupation?: string;
  employerName?: string;
  employerAddress?: string;
  employerPhone?: string;
  monthlyIncome?: number;
  employmentDurationMonths?: number;
  
  // Emergency contact
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  
  // Lease preferences
  desiredMoveInDate?: Date;
  desiredLeaseTermMonths: number;
  numberOfOccupants: number;
  hasPets: boolean;
  petDetails?: string;
  
  // Additional
  reasonForMoving?: string;
  specialRequirements?: string;
  howDidYouHear?: string;
  
  // References
  characterReferences: CharacterReference[];
  previousAddresses: PreviousAddress[];
  uploadedDocuments: UploadedDocument[];
  
  // Token for external access
  applicationToken?: string;
  applicationTokenExpiresAt?: Date;
  
  // Status
  status: ApplicationStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  approvalNotes?: string;
  rejectionReason?: string;
  
  // Results
  tenantId?: string;
  tenancyId?: string;
  envelopeId?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  deletedAt?: Date;
  
  // Virtual fields (from joins)
  propertyName?: string;
  propertyAddress?: string;
  propertyPrice?: number;
  propertyPriceCurrency?: string;
  propertyBedrooms?: number;
  propertyBathrooms?: number;
  propertyType?: string;
  
  // E-Sign integration (populated dynamically)
  signerToken?: string;

  // Lease progress (derived from the linked tenancy + lease envelope; populated
  // by getApplicationByToken). The application.status enum stops at
  // 'lease_generated', so signed/active state must be derived for the tracker.
  leaseGenerated?: boolean;
  leaseSigned?: boolean;
  tenancyActive?: boolean;
  leaseSignedUrl?: string;
}

export interface CreateApplicationDto {
  propertyId: string;
  // When applying to a multi-unit building, the specific unit (child property) the applicant chose
  unitId?: string;
  applicantFullName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantPhoneSecondary?: string;
  applicantDateOfBirth?: string;
  applicantIdType?: string; // 'ghana_card' | 'passport' | ... — the selected form of ID
  applicantGhanaCard?: string; // the ID number (kept name for back-compat)
  applicantCurrentAddress?: string;
  applicantDigitalAddress?: string;
  occupation?: string;
  employerName?: string;
  employerAddress?: string;
  employerPhone?: string;
  monthlyIncome?: number;
  employmentDurationMonths?: number;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  desiredMoveInDate?: string;
  desiredLeaseTermMonths?: number;
  numberOfOccupants?: number;
  hasPets?: boolean;
  petDetails?: string;
  reasonForMoving?: string;
  specialRequirements?: string;
  howDidYouHear?: string;
  characterReferences?: CharacterReference[];
  previousAddresses?: PreviousAddress[];
  uploadedDocuments?: UploadedDocument[]; // ID images (front/back/bio) etc.
}

export interface UpdateApplicationDto extends Partial<CreateApplicationDto> {}

export interface ApplicationFilters {
  status?: ApplicationStatus | ApplicationStatus[];
  propertyId?: string;
  applicantEmail?: string;
  search?: string;
  submittedAfter?: string;
  submittedBefore?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApplicationLink {
  id: string;
  organizationId: string;
  propertyId: string;
  token: string;
  applicationType: string;
  maxUses?: number;
  currentUses: number;
  expiresAt: Date;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  deactivatedAt?: Date;
  deactivatedBy?: string;
  // Virtual fields
  propertyName?: string;
  propertyAddress?: string;
}

export interface CreateApplicationLinkDto {
  propertyId: string;
  applicationType?: 'standard' | 'express' | 'premium';
  maxUses?: number;
  expiresInDays?: number;
}

// =====================================================
// STATE MACHINE
// =====================================================

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.DRAFT]: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.EXPIRED],
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.UNDER_REVIEW, ApplicationStatus.WITHDRAWN, ApplicationStatus.EXPIRED],
  [ApplicationStatus.UNDER_REVIEW]: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED],
  [ApplicationStatus.APPROVED]: [ApplicationStatus.LEASE_GENERATED, ApplicationStatus.EXPIRED],
  [ApplicationStatus.REJECTED]: [],
  [ApplicationStatus.WITHDRAWN]: [],
  [ApplicationStatus.LEASE_GENERATED]: [ApplicationStatus.LEASE_GENERATED, ApplicationStatus.APPROVED], // Allow regenerate and revert to approved
  [ApplicationStatus.EXPIRED]: []
};

export class StateMachineError extends Error {
  constructor(
    public fromStatus: ApplicationStatus,
    public toStatus: ApplicationStatus
  ) {
    super(`Invalid status transition from '${fromStatus}' to '${toStatus}'`);
    this.name = 'StateMachineError';
  }
}

// =====================================================
// APPLICATION SERVICE
// =====================================================

export class ApplicationService {
  private db: Pool;

  constructor(database?: Pool) {
    this.db = database || pool;
  }

  // =====================================================
  // STATE MACHINE ENFORCEMENT
  // =====================================================

  private validateTransition(from: ApplicationStatus, to: ApplicationStatus): void {
    const validNextStates = VALID_TRANSITIONS[from];
    if (!validNextStates.includes(to)) {
      throw new StateMachineError(from, to);
    }
  }

  // =====================================================
  // TOKEN GENERATION
  // =====================================================

  private generateToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  // =====================================================
  // CREATE APPLICATION
  // =====================================================

  async createApplication(
    organizationId: string,
    data: CreateApplicationDto,
    userId?: string
  ): Promise<Application> {
    // Generate application token for external access
    const token = this.generateToken();
    const tokenExpiry = new Date();
    tokenExpiry.setDate(tokenExpiry.getDate() + 30); // 30 days validity

    const query = `
      INSERT INTO applications (
        organization_id,
        property_id,
        applicant_full_name,
        applicant_email,
        applicant_phone,
        applicant_phone_secondary,
        applicant_date_of_birth,
        applicant_id_type,
        applicant_ghana_card,
        applicant_current_address,
        applicant_digital_address,
        occupation,
        employer_name,
        employer_address,
        employer_phone,
        monthly_income,
        employment_duration_months,
        emergency_contact_name,
        emergency_contact_relationship,
        emergency_contact_phone,
        desired_move_in_date,
        desired_lease_term_months,
        number_of_occupants,
        has_pets,
        pet_details,
        reason_for_moving,
        special_requirements,
        how_did_you_hear,
        character_references,
        previous_addresses,
        uploaded_documents,
        application_token,
        application_token_expires_at,
        status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34
      )
      RETURNING *
    `;

    const values = [
      organizationId,
      data.propertyId,
      data.applicantFullName,
      data.applicantEmail,
      data.applicantPhone,
      data.applicantPhoneSecondary || null,
      data.applicantDateOfBirth ? new Date(data.applicantDateOfBirth) : null,
      data.applicantIdType || null,
      data.applicantGhanaCard || null,
      data.applicantCurrentAddress || null,
      data.applicantDigitalAddress || null,
      data.occupation || null,
      data.employerName || null,
      data.employerAddress || null,
      data.employerPhone || null,
      data.monthlyIncome || null,
      data.employmentDurationMonths || null,
      data.emergencyContactName || null,
      data.emergencyContactRelationship || null,
      data.emergencyContactPhone || null,
      data.desiredMoveInDate ? new Date(data.desiredMoveInDate) : null,
      data.desiredLeaseTermMonths || 12,
      data.numberOfOccupants || 1,
      data.hasPets ?? false,
      data.petDetails || null,
      data.reasonForMoving || null,
      data.specialRequirements || null,
      data.howDidYouHear || null,
      JSON.stringify(data.characterReferences || []),
      JSON.stringify(data.previousAddresses || []),
      JSON.stringify(data.uploadedDocuments || []),
      token,
      tokenExpiry,
      ApplicationStatus.DRAFT
    ];

    const result = await this.db.query(query, values);
    return this.mapRowToApplication(result.rows[0]);
  }

  // =====================================================
  // CREATE APPLICATION FROM LINK
  // =====================================================

  async createApplicationFromLink(
    linkToken: string,
    data: CreateApplicationDto
  ): Promise<Application> {
    // Validate the application link
    const linkQuery = `
      SELECT al.*, p.organization_id
      FROM application_links al
      JOIN properties p ON p.id = al.property_id
      WHERE al.token = $1 
        AND al.is_active = true 
        AND al.expires_at > NOW()
        AND (al.max_uses IS NULL OR al.current_uses < al.max_uses)
    `;
    
    const linkResult = await this.db.query(linkQuery, [linkToken]);
    
    if (linkResult.rows.length === 0) {
      throw new Error('Invalid or expired application link');
    }
    
    const link = linkResult.rows[0];
    
    // Increment link usage
    await this.db.query(
      'UPDATE application_links SET current_uses = current_uses + 1 WHERE id = $1',
      [link.id]
    );
    
    // Resolve the specific unit when applying to a multi-unit building.
    // The applicant may select a child unit; we record the application against that unit
    // (a real property row), so the lease/tenancy downstream point at the exact space.
    let targetPropertyId: string = link.property_id;
    if (data.unitId && data.unitId !== link.property_id) {
      const unitCheck = await this.db.query(
        `SELECT id FROM properties WHERE id = $1 AND parent_property_id = $2`,
        [data.unitId, link.property_id]
      );
      if (unitCheck.rows.length === 0) {
        throw new Error('Selected unit does not belong to this property');
      }
      targetPropertyId = data.unitId;
    }

    // Create the application against the resolved unit (or the listed property itself)
    const application = await this.createApplication(
      link.organization_id,
      { ...data, propertyId: targetPropertyId }
    );
    
    // Automatically submit the application when created via tenant portal link
    // This sets status to 'submitted' and records submission timestamp
    const submittedApplication = await this.submitApplication(application.id, link.organization_id);
    
    return submittedApplication;
  }

  // =====================================================
  // GET APPLICATION BY ID
  // =====================================================

  async getApplicationById(
    applicationId: string,
    organizationId: string
  ): Promise<Application | null> {
    const query = `
      SELECT a.*, 
             p.title as property_name,
             p.address_street as property_address,
             p.price as property_price,
             p.price_currency as property_price_currency,
             p.bedrooms as property_bedrooms,
             p.bathrooms as property_bathrooms,
             p.property_type as property_type
      FROM applications a
      LEFT JOIN properties p ON p.id = a.property_id
      WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [applicationId, organizationId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToApplication(result.rows[0]);
  }

  // =====================================================
  // GET APPLICATION BY TOKEN (Public)
  // =====================================================

  async getApplicationByToken(tokenOrId: string): Promise<Application | null> {
    // First try by application token
    const tokenQuery = `
      SELECT a.*, 
             p.title as property_name,
             p.address_street as property_address,
             p.price as property_price,
             p.price_currency as property_price_currency,
             p.bedrooms as property_bedrooms,
             p.bathrooms as property_bathrooms,
             p.property_type as property_type
      FROM applications a
      LEFT JOIN properties p ON p.id = a.property_id
      WHERE a.application_token = $1 
        AND a.application_token_expires_at > NOW()
        AND a.deleted_at IS NULL
    `;

    let result = await this.db.query(tokenQuery, [tokenOrId]);
    
    // If no result by token, try by ID (for backwards compatibility)
    if (result.rows.length === 0) {
      const idQuery = `
        SELECT a.*, 
               p.title as property_name,
               p.address_street as property_address,
               p.price as property_price,
               p.price_currency as property_price_currency,
               p.bedrooms as property_bedrooms,
               p.bathrooms as property_bathrooms,
               p.property_type as property_type
        FROM applications a
        LEFT JOIN properties p ON p.id = a.property_id
        WHERE a.id = $1 
          AND a.deleted_at IS NULL
      `;
      result = await this.db.query(idQuery, [tokenOrId]);
    }
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const application = this.mapRowToApplication(result.rows[0]);

    // Derive lease progress from the linked tenancy + lease envelope. The
    // application.status enum has no signed/active state (it stops at
    // 'lease_generated'), so the public status tracker can't otherwise tell that
    // the tenant has signed. A completed lease envelope or an active/countersigned
    // tenancy means the lease is signed.
    if (application.tenancyId) {
      try {
        const lease = await this.db.query(
          `SELECT t.status            AS tenancy_status,
                  t.lease_status,
                  t.esign_status,
                  t.lease_signed_url,
                  EXISTS (
                    SELECT 1 FROM esign_envelopes e
                    WHERE e.context_entity_id = t.id
                      AND e.context_type = 'lease'
                      AND e.status = 'completed'
                  ) AS has_completed_envelope
           FROM tenancies t
           WHERE t.id = $1`,
          [application.tenancyId]
        );
        const row = lease.rows[0];
        if (row) {
          application.leaseSigned = Boolean(
            row.has_completed_envelope ||
            row.esign_status === 'completed' ||
            row.lease_status === 'countersigned' ||
            !!row.lease_signed_url
          );
          application.tenancyActive = row.tenancy_status === 'active';
          // A lease exists (generated/sent) once there's a tenancy with a lease
          // document/envelope, regardless of whether the app row advanced.
          application.leaseGenerated = Boolean(
            application.leaseSigned ||
            application.status === ApplicationStatus.LEASE_GENERATED ||
            !!row.lease_signed_url ||
            ['sent', 'sent_to_tenant', 'tenant_signed', 'completed'].includes(row.esign_status)
          );
          if (row.lease_signed_url) application.leaseSignedUrl = row.lease_signed_url;
        }
      } catch {
        // Non-fatal: fall back to the raw application status if the lookup fails.
      }
    }

    return application;
  }

  // =====================================================
  // GET APPLICATIONS WITH FILTERING
  // =====================================================

  async getApplications(
    organizationId: string,
    filters: ApplicationFilters = {},
    pagination: PaginationParams = {}
  ): Promise<PaginatedResponse<Application>> {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    const conditions: string[] = ['a.organization_id = $1', 'a.deleted_at IS NULL'];
    const params: (string | number | string[])[] = [organizationId];
    let paramIndex = 2;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`a.status = ANY($${paramIndex})`);
        params.push(filters.status);
      } else {
        conditions.push(`a.status = $${paramIndex}`);
        params.push(filters.status);
      }
      paramIndex++;
    }

    if (filters.propertyId) {
      conditions.push(`a.property_id = $${paramIndex}`);
      params.push(filters.propertyId);
      paramIndex++;
    }

    if (filters.applicantEmail) {
      conditions.push(`a.applicant_email ILIKE $${paramIndex}`);
      params.push(`%${filters.applicantEmail}%`);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(`(
        a.applicant_full_name ILIKE $${paramIndex} OR 
        a.applicant_email ILIKE $${paramIndex} OR 
        a.applicant_phone ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.submittedAfter) {
      conditions.push(`a.submitted_at >= $${paramIndex}`);
      params.push(filters.submittedAfter);
      paramIndex++;
    }

    if (filters.submittedBefore) {
      conditions.push(`a.submitted_at <= $${paramIndex}`);
      params.push(filters.submittedBefore);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Validate sortBy column
    const validSortColumns = ['created_at', 'updated_at', 'submitted_at', 'applicant_full_name', 'status'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM applications a
      WHERE ${whereClause}
    `;

    // Data query
    const dataQuery = `
      SELECT a.*,
             p.title as property_name,
             p.address_street as property_address
      FROM applications a
      LEFT JOIN properties p ON p.id = a.property_id
      WHERE ${whereClause}
      ORDER BY a.${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.db.query(countQuery, params),
      this.db.query(dataQuery, [...params, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    return {
      data: dataResult.rows.map(row => this.mapRowToApplication(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // =====================================================
  // UPDATE APPLICATION
  // =====================================================

  async updateApplication(
    applicationId: string,
    organizationId: string,
    data: UpdateApplicationDto
  ): Promise<Application> {
    // First check if application exists and is in draft status
    const existing = await this.getApplicationById(applicationId, organizationId);
    
    if (!existing) {
      throw new Error('Application not found');
    }
    
    if (existing.status !== ApplicationStatus.DRAFT) {
      throw new Error('Can only update applications in draft status');
    }

    const updateFields: string[] = [];
    const values: (string | number | boolean | Date | null)[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      applicantFullName: 'applicant_full_name',
      applicantEmail: 'applicant_email',
      applicantPhone: 'applicant_phone',
      applicantPhoneSecondary: 'applicant_phone_secondary',
      applicantDateOfBirth: 'applicant_date_of_birth',
      applicantGhanaCard: 'applicant_ghana_card',
      applicantCurrentAddress: 'applicant_current_address',
      applicantDigitalAddress: 'applicant_digital_address',
      occupation: 'occupation',
      employerName: 'employer_name',
      employerAddress: 'employer_address',
      employerPhone: 'employer_phone',
      monthlyIncome: 'monthly_income',
      employmentDurationMonths: 'employment_duration_months',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactRelationship: 'emergency_contact_relationship',
      emergencyContactPhone: 'emergency_contact_phone',
      desiredMoveInDate: 'desired_move_in_date',
      desiredLeaseTermMonths: 'desired_lease_term_months',
      numberOfOccupants: 'number_of_occupants',
      hasPets: 'has_pets',
      petDetails: 'pet_details',
      reasonForMoving: 'reason_for_moving',
      specialRequirements: 'special_requirements',
      howDidYouHear: 'how_did_you_hear'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in data) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        let value = (data as any)[key];
        
        // Handle date fields
        if (key.includes('Date') && value) {
          value = new Date(value);
        }
        
        values.push(value ?? null);
        paramIndex++;
      }
    }

    // Handle JSON fields
    if (data.characterReferences) {
      updateFields.push(`character_references = $${paramIndex}`);
      values.push(JSON.stringify(data.characterReferences) as any);
      paramIndex++;
    }

    if (data.previousAddresses) {
      updateFields.push(`previous_addresses = $${paramIndex}`);
      values.push(JSON.stringify(data.previousAddresses) as any);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return existing;
    }

    values.push(applicationId as any);
    values.push(organizationId as any);

    const query = `
      UPDATE applications
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return this.mapRowToApplication(result.rows[0]);
  }

  // =====================================================
  // STATUS TRANSITIONS
  // =====================================================

  async submitApplication(
    applicationId: string,
    organizationId: string
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.SUBMITTED);

    const query = `
      UPDATE applications
      SET status = $1, submitted_at = NOW()
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.SUBMITTED,
      applicationId,
      organizationId
    ]);

    return this.mapRowToApplication(result.rows[0]);
  }

  async startReview(
    applicationId: string,
    organizationId: string,
    reviewerId: string
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.UNDER_REVIEW);

    const query = `
      UPDATE applications
      SET status = $1, reviewed_by = $2
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.UNDER_REVIEW,
      reviewerId,
      applicationId,
      organizationId
    ]);

    return this.mapRowToApplication(result.rows[0]);
  }

  async approveApplication(
    applicationId: string,
    organizationId: string,
    reviewerId: string,
    notes?: string
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.APPROVED);

    const query = `
      UPDATE applications
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), approval_notes = $3
      WHERE id = $4 AND organization_id = $5
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.APPROVED,
      reviewerId,
      notes || null,
      applicationId,
      organizationId
    ]);

    const approved = this.mapRowToApplication(result.rows[0]);

    // Email the applicant their approval (they may not be a platform user yet).
    try {
      await notify({
        recipients: {
          audience: 'tenant',
          userId: '',
          email: approved.applicantEmail,
          name: approved.applicantFullName,
        },
        category: 'property',
        type: 'application.approved',
        title: 'Your application has been approved',
        body: `Good news${approved.applicantFullName ? `, ${approved.applicantFullName}` : ''}! Your rental application has been approved.${notes ? ` Notes: ${notes}` : ''}`,
        summary: 'Application approved',
        priority: 'high',
        sourceType: 'application',
        sourceId: applicationId,
        organizationId,
        channels: { email: true },
      });
    } catch (err: any) {
      logger.warn('notify(application.approved) failed', { applicationId, error: err.message });
    }

    return approved;
  }

  async rejectApplication(
    applicationId: string,
    organizationId: string,
    reviewerId: string,
    reason: string
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.REJECTED);

    const query = `
      UPDATE applications
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), rejection_reason = $3
      WHERE id = $4 AND organization_id = $5
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.REJECTED,
      reviewerId,
      reason,
      applicationId,
      organizationId
    ]);

    const rejected = this.mapRowToApplication(result.rows[0]);

    // Email the applicant the decision (they may not be a platform user yet).
    try {
      await notify({
        recipients: {
          audience: 'tenant',
          userId: '',
          email: rejected.applicantEmail,
          name: rejected.applicantFullName,
        },
        category: 'property',
        type: 'application.rejected',
        title: 'Update on your application',
        body: `Thank you for your interest. Unfortunately your rental application was not successful.${reason ? ` Reason: ${reason}` : ''}`,
        summary: 'Application decision',
        priority: 'normal',
        sourceType: 'application',
        sourceId: applicationId,
        organizationId,
        channels: { email: true },
      });
    } catch (err: any) {
      logger.warn('notify(application.rejected) failed', { applicationId, error: err.message });
    }

    return rejected;
  }

  async withdrawApplication(
    applicationId: string,
    organizationId: string
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.WITHDRAWN);

    const query = `
      UPDATE applications
      SET status = $1
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.WITHDRAWN,
      applicationId,
      organizationId
    ]);

    return this.mapRowToApplication(result.rows[0]);
  }

  /**
   * Generate and send lease to applicant for signature
   * This transitions from APPROVED to LEASE_GENERATED status
   * Creates tenancy and triggers e-sign workflow
   */
  async sendLease(
    applicationId: string,
    organizationId: string,
    userId: string,
    leaseData?: {
      templateId?: string;
      startDate?: string;
      endDate?: string;
      monthlyRent?: number;
      securityDeposit?: number;
      advanceMonths?: number;
      noticePeriodDays?: number;
      autoRenew?: boolean;
      additionalTerms?: string;
      landlordName?: string;
      landlordEmail?: string;
      envelopeId?: string;
      pdfUrl?: string;
      tenantUtilities?: string[];
      landlordUtilities?: string[];
      signers?: { name: string; email: string; role: string }[];
    }
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.LEASE_GENERATED);

    // If lease data includes start/end dates, we can create a tenancy
    let tenancyId: string | null = null;
    let tenantId: string | null = application.tenantId ?? null;
    let envelopeId: string | null = leaseData?.envelopeId || null;

    // If we have comprehensive lease data and no existing tenant, create tenant and tenancy
    if (leaseData?.startDate && leaseData?.endDate && leaseData?.monthlyRent) {
      try {
        // Import tenancy service dynamically to avoid circular dependency
        const { tenancyService } = await import('../leases/tenancyService');
        const { tenantService } = await import('../tenants/tenantService');

        // Create tenant if not exists
        if (!tenantId) {
          const tenant = await tenantService.createTenant(organizationId, {
            fullName: application.applicantFullName,
            email: application.applicantEmail,
            phonePrimary: application.applicantPhone,
            ghanaCardNumber: application.applicantGhanaCard,
            currentAddress: application.applicantCurrentAddress,
            digitalAddress: application.applicantDigitalAddress,
            emergencyContactName: application.emergencyContactName,
            emergencyContactPhone: application.emergencyContactPhone || undefined,
            emergencyContactRelationship: application.emergencyContactRelationship || undefined
          }, userId);
          tenantId = tenant.id;
        }

        // Create tenancy
        const tenancy = await tenancyService.createTenancy(organizationId, {
          propertyId: application.propertyId,
          tenantId: tenantId,
          leaseStartDate: leaseData.startDate,
          leaseEndDate: leaseData.endDate,
          monthlyRent: leaseData.monthlyRent,
          securityDeposit: leaseData.securityDeposit,
          autoRenew: leaseData.autoRenew || false,
          advancePaymentMonths: leaseData.advanceMonths || 1,
          specialConditions: leaseData.additionalTerms,
          leaseTerms: {
            tenantUtilities: leaseData.tenantUtilities || [],
            landlordUtilities: leaseData.landlordUtilities || []
          }
        }, userId);
        tenancyId = tenancy.id;

        // If signers are provided, initiate e-sign workflow
        if (leaseData.signers && leaseData.signers.length > 0) {
          const esignResult = await tenancyService.initiateLeaseEsign(
            tenancy,
            organizationId,
            userId,
            { templateId: leaseData.templateId }
          );
          envelopeId = esignResult.envelopeId;
        }
      } catch (error: any) {
        // Log but don't fail - we can still mark as lease_generated
        console.error('Failed to create tenancy for application:', error);
        // If tenancy creation fails, we still update the status
      }
    }

    // Update application status, tenant/tenancy IDs and envelope_id if provided
    const query = `
      UPDATE applications
      SET status = $1, 
          envelope_id = COALESCE($4, envelope_id), 
          tenant_id = COALESCE($5, tenant_id),
          tenancy_id = COALESCE($6, tenancy_id),
          updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.LEASE_GENERATED,
      applicationId,
      organizationId,
      envelopeId,
      tenantId,
      tenancyId
    ]);

    return this.mapRowToApplication(result.rows[0]);
  }

  async markLeaseGenerated(
    applicationId: string,
    organizationId: string,
    tenantId: string,
    tenancyId: string
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    this.validateTransition(application.status, ApplicationStatus.LEASE_GENERATED);

    const query = `
      UPDATE applications
      SET status = $1, tenant_id = $2, tenancy_id = $3
      WHERE id = $4 AND organization_id = $5
      RETURNING *
    `;

    const result = await this.db.query(query, [
      ApplicationStatus.LEASE_GENERATED,
      tenantId,
      tenancyId,
      applicationId,
      organizationId
    ]);

    return this.mapRowToApplication(result.rows[0]);
  }

  /**
   * Generate lease document for an approved application
   * Creates tenant, tenancy, and generates PDF - but does NOT auto-send to e-sign
   * Returns document info so frontend can redirect to e-sign wizard for field placement
   */
  async generateLeaseDocument(
    applicationId: string,
    organizationId: string,
    userId: string,
    leaseData: {
      templateId?: string;
      startDate: string;
      endDate: string;
      monthlyRent: number;
      currency?: string;
      securityDeposit?: number;
      advanceMonths?: number;
      noticePeriodDays?: number;
      autoRenew?: boolean;
      additionalTerms?: string;
      landlordName?: string;
      landlordEmail?: string;
      tenantUtilities?: string[];
      landlordUtilities?: string[];
      isUserLandlord?: boolean;
      landlordWillSign?: boolean;
      signers?: Array<{ role: string; name: string; email: string; order: number }>;
    }
  ): Promise<{
    tenantId: string;
    tenancyId: string;
    documentId: string;
    documentKey: string;
    documentUrl: string;
    filename: string;
    signers: Array<{ name: string; email: string; role: string; order?: number }>;
  }> {
    // Validate required lease data
    if (!leaseData.startDate || !leaseData.endDate) {
      throw new Error('Lease start date and end date are required');
    }
    if (!leaseData.monthlyRent || leaseData.monthlyRent <= 0) {
      throw new Error('Monthly rent is required and must be greater than 0');
    }

    // Validate date formats
    const startDate = new Date(leaseData.startDate);
    const endDate = new Date(leaseData.endDate);
    if (isNaN(startDate.getTime())) {
      throw new Error(`Invalid start date format: ${leaseData.startDate}`);
    }
    if (isNaN(endDate.getTime())) {
      throw new Error(`Invalid end date format: ${leaseData.endDate}`);
    }
    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    // Allow generation when approved, and re-generation when a lease was already generated
    // (lease_generated) — but never once the lease is signed/active.
    if (application.status !== ApplicationStatus.APPROVED && application.status !== ApplicationStatus.LEASE_GENERATED) {
      throw new Error('Application must be approved before generating a lease');
    }

    // Regeneration: cancel any prior lease for this application before generating a fresh one.
    //  - If it is already fully signed (active tenancy, or a completed envelope), refuse — a
    //    signed lease must be terminated explicitly, never silently replaced.
    //  - Otherwise VOID the prior still-open e-sign envelope(s) so signers can no longer sign the
    //    superseded lease, and terminate the prior unsigned tenancy so no duplicates linger.
    if (application.tenancyId) {
      const existing = await this.db.query(
        `SELECT status FROM tenancies WHERE id = $1 AND organization_id = $2`,
        [application.tenancyId, organizationId]
      );
      const existingStatus = existing.rows[0]?.status;
      if (existingStatus === 'active') {
        throw new Error('This lease is already active/signed and cannot be regenerated. Terminate the current lease first.');
      }

      const completedEnvelope = await this.db.query(
        `SELECT id FROM esign_envelopes
          WHERE context_type = 'lease' AND context_entity_id = $1 AND status = 'completed'
          LIMIT 1`,
        [application.tenancyId]
      ).catch(() => ({ rows: [] as any[] }));
      if (completedEnvelope.rows.length > 0) {
        throw new Error('This lease has already been signed by all parties and cannot be regenerated. Terminate the current lease first.');
      }

      // Void any still-open envelopes tied to the prior tenancy (cancels the old lease).
      await this.db.query(
        `UPDATE esign_envelopes
            SET status = 'voided', voided_at = NOW(), void_reason = $2, updated_at = NOW()
          WHERE context_type = 'lease' AND context_entity_id = $1
            AND status IN ('draft', 'sent', 'delivered')`,
        [application.tenancyId, 'Superseded by lease regeneration']
      ).catch(() => { /* non-fatal */ });

      // Terminate the prior unsigned tenancy.
      await this.db.query(
        `UPDATE tenancies SET status = 'terminated', updated_at = NOW()
          WHERE id = $1 AND organization_id = $2`,
        [application.tenancyId, organizationId]
      ).catch(() => { /* ignore cleanup failure */ });
    }

    // Import services dynamically to avoid circular dependency
    const { tenancyService } = await import('../leases/tenancyService');
    const { leaseTemplateService } = await import('../leases/leaseTemplateService');

    // NOTE: We do NOT create tenant here - tenant is created only after lease is signed
    // The tenancy is created with status 'pending_signature' and will store applicant info
    // When e-sign is completed, we'll create the tenant and activate the tenancy

    // Create tenancy with pending_signature status (no tenant yet)
    const tenancy = await tenancyService.createTenancy(organizationId, {
      propertyId: application.propertyId,
      tenantId: undefined, // No tenant yet - will be created after signing
      leaseStartDate: leaseData.startDate,
      leaseEndDate: leaseData.endDate,
      monthlyRent: leaseData.monthlyRent,
      rentCurrency: leaseData.currency || 'GHS',
      securityDeposit: leaseData.securityDeposit,
      autoRenew: leaseData.autoRenew || false,
      advancePaymentMonths: leaseData.advanceMonths || 1,
      specialConditions: leaseData.additionalTerms,
      status: 'pending_signature', // Awaiting e-signatures
      leaseTerms: {
        tenantUtilities: leaseData.tenantUtilities || [],
        landlordUtilities: leaseData.landlordUtilities || [],
        // Signing scenario flags
        isUserLandlord: leaseData.isUserLandlord || false,
        landlordWillSign: leaseData.landlordWillSign || false,
        landlordName: leaseData.landlordName || '',
        landlordEmail: leaseData.landlordEmail || '',
        signers: leaseData.signers || [],
        noticePeriodDays: leaseData.noticePeriodDays || 30,
        // Store applicant info for tenant creation after signing
        applicationId: applicationId,
        applicantFullName: application.applicantFullName,
        applicantEmail: application.applicantEmail,
        applicantPhone: application.applicantPhone,
        applicantGhanaCard: application.applicantGhanaCard,
        applicantCurrentAddress: application.applicantCurrentAddress,
        applicantDigitalAddress: application.applicantDigitalAddress,
        emergencyContactName: application.emergencyContactName,
        emergencyContactPhone: application.emergencyContactPhone,
        emergencyContactRelationship: application.emergencyContactRelationship
      }
    }, userId);

    // Generate lease PDF document (without sending to e-sign)
    const leaseDoc = await leaseTemplateService.generateLease(organizationId, {
      tenancyId: tenancy.id,
      templateId: leaseData.templateId,
      format: 'pdf'
    });

    // Update application with tenancy ID only (NO tenant_id yet - that comes after signing)
    // Status stays as 'approved' until e-sign envelope is sent
    await this.db.query(
      `UPDATE applications 
       SET tenancy_id = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [tenancy.id, applicationId, organizationId]
    );

    // Build signers list - use provided signers from frontend or fall back to default
    let signers: Array<{ name: string; email: string; role: string; order?: number }>;
    
    if (leaseData.signers && leaseData.signers.length > 0) {
      // Use signers provided by frontend (which has the signing authorization logic)
      signers = leaseData.signers.map(s => ({
        name: s.name,
        email: s.email,
        role: s.role.toUpperCase(),
        order: s.order
      }));
    } else {
      // Fallback to default signers
      const orgResult = await this.db.query(
        `SELECT name, email FROM organizations WHERE id = $1`,
        [organizationId]
      );
      const orgInfo = orgResult.rows[0] || { name: 'Property Manager', email: '' };

      signers = [
        { 
          name: leaseData.landlordName || orgInfo.name, 
          email: leaseData.landlordEmail || orgInfo.email, 
          role: 'LANDLORD',
          order: 1
        },
        { 
          name: application.applicantFullName, 
          email: application.applicantEmail, 
          role: 'TENANT',
          order: 2
        }
      ];
    }

    return {
      tenantId: '', // Will be created after e-sign completion
      tenancyId: tenancy.id,
      documentId: leaseDoc.documentId,
      documentKey: leaseDoc.documentKey,
      documentUrl: leaseDoc.downloadUrl,
      filename: leaseDoc.filename,
      signers
    };
  }

  // =====================================================
  // APPLICATION LINKS
  // =====================================================

  async createApplicationLink(
    organizationId: string,
    data: CreateApplicationLinkDto,
    userId: string
  ): Promise<ApplicationLink> {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays || 30));

    const query = `
      INSERT INTO application_links (
        organization_id,
        property_id,
        token,
        application_type,
        max_uses,
        expires_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      organizationId,
      data.propertyId,
      token,
      data.applicationType || 'standard',
      data.maxUses || null,
      expiresAt,
      userId
    ]);

    return this.mapRowToApplicationLink(result.rows[0]);
  }

  async getApplicationLinks(
    organizationId: string,
    propertyId?: string
  ): Promise<ApplicationLink[]> {
    let query = `
      SELECT al.*, 
             p.title as property_name,
             p.address_street as property_address
      FROM application_links al
      LEFT JOIN properties p ON p.id = al.property_id
      WHERE al.organization_id = $1
    `;
    const params: string[] = [organizationId];

    if (propertyId) {
      query += ' AND al.property_id = $2';
      params.push(propertyId);
    }

    query += ' ORDER BY al.created_at DESC';

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapRowToApplicationLink(row));
  }

  async deactivateApplicationLink(
    linkId: string,
    organizationId: string,
    userId: string
  ): Promise<ApplicationLink> {
    const query = `
      UPDATE application_links
      SET is_active = false, deactivated_at = NOW(), deactivated_by = $1
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [userId, linkId, organizationId]);
    
    if (result.rows.length === 0) {
      throw new Error('Application link not found');
    }

    return this.mapRowToApplicationLink(result.rows[0]);
  }

  async validateApplicationLink(token: string): Promise<{ valid: boolean; propertyId?: string; organizationId?: string; property?: Record<string, any>; units?: Array<Record<string, any>> }> {
    const query = `
      SELECT al.*,
             p.organization_id,
             p.title as property_title,
             p.description as property_description,
             p.region as property_region,
             p.address_city as property_address_city,
             p.address_street as property_address_street,
             p.property_type,
             p.bedrooms as property_bedrooms,
             p.bathrooms as property_bathrooms,
             p.price as property_price,
             p.price_currency as property_price_currency,
             p.total_units as property_total_units
      FROM application_links al
      JOIN properties p ON p.id = al.property_id
      WHERE al.token = $1
        AND al.is_active = true
        AND al.expires_at > NOW()
        AND (al.max_uses IS NULL OR al.current_uses < al.max_uses)
    `;

    const result = await this.db.query(query, [token]);

    if (result.rows.length === 0) {
      return { valid: false };
    }

    // For a multi-unit building, surface the available units so the applicant can pick one.
    let units: Array<Record<string, any>> | undefined;
    if (result.rows[0].property_total_units && Number(result.rows[0].property_total_units) > 0) {
      const unitRows = await this.db.query(
        `SELECT id, unit_number, floor_number, bedrooms, bathrooms, total_area_sqm, price, price_currency, status
         FROM properties
         WHERE parent_property_id = $1 AND status NOT IN ('withdrawn', 'leased', 'occupied')
         ORDER BY floor_number NULLS LAST, unit_number`,
        [result.rows[0].property_id]
      );
      units = unitRows.rows.map((u: any) => ({
        id: u.id,
        unitNumber: u.unit_number,
        floorNumber: u.floor_number,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        totalAreaSqm: u.total_area_sqm,
        price: Number(u.price || 0),
        priceCurrency: u.price_currency || 'GHS',
        status: u.status,
      }));
    }

    return {
      valid: true,
      propertyId: result.rows[0].property_id,
      organizationId: result.rows[0].organization_id,
      property: {
        id: result.rows[0].property_id,
        title: result.rows[0].property_title,
        description: result.rows[0].property_description,
        addressStreet: result.rows[0].property_address_street,
        addressCity: result.rows[0].property_address_city,
        addressRegion: result.rows[0].property_region,
        type: result.rows[0].property_type,
        propertyType: result.rows[0].property_type,
        bedrooms: result.rows[0].property_bedrooms,
        bathrooms: result.rows[0].property_bathrooms,
        monthlyRent: Number(result.rows[0].property_price || 0),
        price: Number(result.rows[0].property_price || 0),
        currency: result.rows[0].property_price_currency || 'GHS',
        priceCurrency: result.rows[0].property_price_currency || 'GHS',
        totalUnits: result.rows[0].property_total_units || null
      },
      units
    };
  }

  // =====================================================
  // STATUS HISTORY
  // =====================================================

  async getApplicationHistory(
    applicationId: string,
    organizationId: string
  ): Promise<Array<{
    id: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    changedBy: string | null;
    changedByType: string;
    reason: string | null;
    changedAt: Date;
  }>> {
    // First verify the application belongs to the org
    const app = await this.getApplicationById(applicationId, organizationId);
    if (!app) {
      throw new Error('Application not found');
    }

    const query = `
      SELECT h.*, COALESCE(u.display_name, u.first_name || ' ' || u.last_name) as changed_by_name
      FROM application_status_history h
      LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.application_id = $1
      ORDER BY h.changed_at ASC
    `;

    const result = await this.db.query(query, [applicationId]);
    
    return result.rows.map(row => ({
      id: row.id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedBy: row.changed_by_name || row.changed_by,
      changedByType: row.changed_by_type,
      reason: row.reason,
      changedAt: row.changed_at
    }));
  }

  // =====================================================
  // CONVERT APPLICATION TO TENANT
  // =====================================================

  async convertToTenant(
    applicationId: string,
    organizationId: string,
    userId: string
  ): Promise<{ tenantId: string; tenancyId: string }> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    if (application.status !== ApplicationStatus.APPROVED) {
      throw new Error('Only approved applications can be converted to tenants');
    }

    // Start transaction
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create tenant record
      const tenantQuery = `
        INSERT INTO tenants (
          organization_id,
          full_name,
          ghana_card_number,
          date_of_birth,
          phone_primary,
          phone_secondary,
          email,
          current_address,
          digital_address,
          occupation,
          employer_name,
          employer_address,
          employer_phone,
          monthly_income,
          emergency_contact_name,
          emergency_contact_phone,
          emergency_contact_relationship,
          character_references,
          previous_addresses,
          status,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        RETURNING id
      `;
      
      const tenantResult = await client.query(tenantQuery, [
        organizationId,
        application.applicantFullName,
        application.applicantGhanaCard,
        application.applicantDateOfBirth,
        application.applicantPhone,
        application.applicantPhoneSecondary,
        application.applicantEmail,
        application.applicantCurrentAddress,
        application.applicantDigitalAddress,
        application.occupation,
        application.employerName,
        application.employerAddress,
        application.employerPhone,
        application.monthlyIncome,
        application.emergencyContactName,
        application.emergencyContactPhone,
        application.emergencyContactRelationship,
        JSON.stringify(application.characterReferences),
        JSON.stringify(application.previousAddresses),
        'active',
        userId
      ]);
      
      const tenantId = tenantResult.rows[0].id;
      
      // Get property rent information (use price as monthly rent) + its currency
      const propertyResult = await client.query(
        `SELECT price, price_currency FROM properties WHERE id = $1`,
        [application.propertyId]
      );
      const monthlyRent = propertyResult.rows[0]?.price || 0;
      const rentCurrency = propertyResult.rows[0]?.price_currency || 'GHS';
      
      // Calculate lease dates
      const leaseStartDate = application.desiredMoveInDate ? new Date(application.desiredMoveInDate) : new Date();
      const leaseEndDate = new Date(leaseStartDate);
      leaseEndDate.setMonth(leaseEndDate.getMonth() + (application.desiredLeaseTermMonths || 12));
      
      // Create tenancy record
      const tenancyQuery = `
        INSERT INTO tenancies (
          organization_id,
          property_id,
          tenant_id,
          lease_start_date,
          lease_end_date,
          monthly_rent,
          rent_currency,
          status,
          application_id,
          lease_status,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const tenancyResult = await client.query(tenancyQuery, [
        organizationId,
        application.propertyId,
        tenantId,
        leaseStartDate,
        leaseEndDate,
        monthlyRent,
        rentCurrency,
        'pending',
        applicationId,
        'draft',
        userId
      ]);
      
      const tenancyId = tenancyResult.rows[0].id;

      for (const document of application.uploadedDocuments || []) {
        const documentType = this.mapApplicationDocumentType(document.type);
        const fileName = document.filename || document.url.split('/').pop() || `${document.type || 'application-document'}`;

        await client.query(
          `INSERT INTO property_management_documents (
            id, property_id, tenancy_id, organization_id,
            document_type, title, description,
            file_url, file_name, folder_path, tags, uploaded_by, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3,
            $4, $5, $6,
            $7, $8, '/', $9, $10, COALESCE($11::timestamptz, CURRENT_TIMESTAMP)
          )`,
          [
            application.propertyId,
            tenancyId,
            organizationId,
            documentType,
            this.getApplicationDocumentTitle(document.type, fileName),
            `Uploaded during tenant application ${application.id}`,
            document.url,
            fileName,
            ['tenant', 'application'],
            userId,
            document.uploadedAt || null
          ]
        );
      }
      
      // Update application with tenant and tenancy IDs
      await client.query(
        `UPDATE applications SET tenant_id = $1, tenancy_id = $2, status = $3 WHERE id = $4`,
        [tenantId, tenancyId, ApplicationStatus.LEASE_GENERATED, applicationId]
      );
      
      await client.query('COMMIT');
      
      return { tenantId, tenancyId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Ensure a freshly-SIGNED tenancy has a tenant attached, creating one from the stored
   * applicant info if needed. This is what makes e-sign completion produce an active tenant
   * automatically — no separate "convert applicant to tenant" step (which would otherwise
   * create a divergent second tenancy). Best-effort: never throws into the completion flow.
   *
   * Returns the tenant id linked to the tenancy, or null if nothing could be done.
   */
  async ensureTenantForSignedTenancy(
    tenancyId: string,
    organizationId: string,
    userId: string | null
  ): Promise<string | null> {
    try {
      const tRes = await this.db.query(
        `SELECT id, tenant_id, application_id, property_id, lease_terms
           FROM tenancies WHERE id = $1 AND organization_id = $2`,
        [tenancyId, organizationId]
      );
      const tenancy = tRes.rows[0];
      if (!tenancy) return null;

      const leaseTerms = tenancy.lease_terms || {};
      const appId: string | null = tenancy.application_id || leaseTerms.applicationId || null;

      // Already has a tenant — just make sure the application points at THIS tenancy/tenant.
      if (tenancy.tenant_id) {
        if (appId) {
          await this.db.query(
            `UPDATE applications
                SET tenant_id = COALESCE(tenant_id, $1), tenancy_id = $2, updated_at = NOW()
              WHERE id = $3 AND organization_id = $4`,
            [tenancy.tenant_id, tenancyId, appId, organizationId]
          ).catch(() => { /* non-fatal */ });
        }
        return tenancy.tenant_id;
      }

      // Resolve the application (for full applicant detail) if we have one.
      const application = appId
        ? await this.getApplicationById(appId, organizationId).catch(() => null)
        : null;

      // Reuse an existing tenant if the application was already converted; otherwise create one.
      let tenantId: string | null = application?.tenantId || null;

      if (!tenantId) {
        const fullName = application?.applicantFullName || leaseTerms.applicantFullName;
        const email = application?.applicantEmail || leaseTerms.applicantEmail;
        if (!fullName) return null; // nothing to build a tenant from

        const insert = await this.db.query(
          `INSERT INTO tenants (
              organization_id, full_name, ghana_card_number, date_of_birth,
              phone_primary, phone_secondary, email, current_address, digital_address,
              occupation, employer_name, employer_address, employer_phone, monthly_income,
              emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
              character_references, previous_addresses, status, created_by
           ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
           ) RETURNING id`,
          [
            organizationId,
            fullName,
            application?.applicantGhanaCard || leaseTerms.applicantGhanaCard || null,
            application?.applicantDateOfBirth || null,
            application?.applicantPhone || leaseTerms.applicantPhone || null,
            application?.applicantPhoneSecondary || null,
            email || null,
            application?.applicantCurrentAddress || leaseTerms.applicantCurrentAddress || null,
            application?.applicantDigitalAddress || leaseTerms.applicantDigitalAddress || null,
            application?.occupation || null,
            application?.employerName || null,
            application?.employerAddress || null,
            application?.employerPhone || null,
            application?.monthlyIncome || null,
            application?.emergencyContactName || leaseTerms.emergencyContactName || null,
            application?.emergencyContactPhone || leaseTerms.emergencyContactPhone || null,
            application?.emergencyContactRelationship || leaseTerms.emergencyContactRelationship || null,
            JSON.stringify(application?.characterReferences || []),
            JSON.stringify(application?.previousAddresses || []),
            'active',
            userId,
          ]
        );
        tenantId = insert.rows[0].id;
      }

      // Link the tenant to the signed tenancy.
      await this.db.query(
        `UPDATE tenancies SET tenant_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [tenantId, tenancyId, organizationId]
      );

      // Point the application at this tenant + signed tenancy so the UI resolves a single record.
      if (appId) {
        await this.db.query(
          `UPDATE applications
              SET tenant_id = $1, tenancy_id = $2, status = $3, updated_at = NOW()
            WHERE id = $4 AND organization_id = $5`,
          [tenantId, tenancyId, ApplicationStatus.LEASE_GENERATED, appId, organizationId]
        ).catch(() => { /* non-fatal */ });
      }

      return tenantId;
    } catch {
      return null;
    }
  }

  private mapApplicationDocumentType(type?: string): string {
    switch ((type || '').toLowerCase()) {
      case 'ghana_card':
      case 'national_id':
      case 'passport':
      case 'drivers_license':
      case 'voters_id':
        return 'tenant_agreements';
      case 'proof_of_address':
        return 'utility_bills';
      case 'lease_agreement':
        return 'lease_agreement';
      case 'employment_letter':
      case 'proof_of_income':
      default:
        return 'other';
    }
  }

  private getApplicationDocumentTitle(type: string | undefined, fileName: string): string {
    switch ((type || '').toLowerCase()) {
      case 'ghana_card':
      case 'national_id':
        return `Tenant ID - ${fileName}`;
      case 'passport':
        return `Passport - ${fileName}`;
      case 'drivers_license':
        return `Driver's License - ${fileName}`;
      case 'voters_id':
        return `Voter ID - ${fileName}`;
      case 'proof_of_address':
        return `Proof of Address - ${fileName}`;
      case 'proof_of_income':
        return `Proof of Income - ${fileName}`;
      case 'employment_letter':
        return `Employment Letter - ${fileName}`;
      default:
        return fileName;
    }
  }

  // =====================================================
  // UPLOAD DOCUMENT
  // =====================================================

  async addDocument(
    applicationId: string,
    organizationId: string,
    document: UploadedDocument
  ): Promise<Application> {
    const application = await this.getApplicationById(applicationId, organizationId);
    
    if (!application) {
      throw new Error('Application not found');
    }
    
    const documents = [...application.uploadedDocuments, document];
    
    const query = `
      UPDATE applications
      SET uploaded_documents = $1
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [
      JSON.stringify(documents),
      applicationId,
      organizationId
    ]);

    return this.mapRowToApplication(result.rows[0]);
  }

  // =====================================================
  // SOFT DELETE
  // =====================================================

  async deleteApplication(
    applicationId: string,
    organizationId: string
  ): Promise<void> {
    const query = `
      UPDATE applications
      SET deleted_at = NOW()
      WHERE id = $1 AND organization_id = $2
    `;

    await this.db.query(query, [applicationId, organizationId]);
  }

  // =====================================================
  // STATISTICS
  // =====================================================

  async getApplicationStats(
    organizationId: string
  ): Promise<{
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    submittedThisMonth: number;
    approvalRate: number;
    averageReviewTime: number;
  }> {
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
        COUNT(*) FILTER (WHERE status = 'under_review') as under_review,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'withdrawn') as withdrawn,
        COUNT(*) FILTER (WHERE status = 'lease_generated') as lease_generated,
        COUNT(*) FILTER (WHERE status = 'expired') as expired,
        COUNT(*) FILTER (WHERE submitted_at >= date_trunc('month', CURRENT_DATE)) as submitted_this_month,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 86400) FILTER (WHERE reviewed_at IS NOT NULL) as avg_review_days
      FROM applications
      WHERE organization_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(statsQuery, [organizationId]);
    const row = result.rows[0];

    const approved = parseInt(row.approved || '0', 10);
    const rejected = parseInt(row.rejected || '0', 10);
    const totalDecided = approved + rejected;

    return {
      total: parseInt(row.total, 10),
      byStatus: {
        [ApplicationStatus.DRAFT]: parseInt(row.draft || '0', 10),
        [ApplicationStatus.SUBMITTED]: parseInt(row.submitted || '0', 10),
        [ApplicationStatus.UNDER_REVIEW]: parseInt(row.under_review || '0', 10),
        [ApplicationStatus.APPROVED]: approved,
        [ApplicationStatus.REJECTED]: rejected,
        [ApplicationStatus.WITHDRAWN]: parseInt(row.withdrawn || '0', 10),
        [ApplicationStatus.LEASE_GENERATED]: parseInt(row.lease_generated || '0', 10),
        [ApplicationStatus.EXPIRED]: parseInt(row.expired || '0', 10)
      },
      submittedThisMonth: parseInt(row.submitted_this_month || '0', 10),
      approvalRate: totalDecided > 0 ? (approved / totalDecided) * 100 : 0,
      averageReviewTime: parseFloat(row.avg_review_days || '0')
    };
  }

  // =====================================================
  // ROW MAPPERS
  // =====================================================

  private mapRowToApplication(row: any): Application {
    return {
      id: row.id,
      organizationId: row.organization_id,
      propertyId: row.property_id,
      applicantFullName: row.applicant_full_name,
      applicantEmail: row.applicant_email,
      applicantPhone: row.applicant_phone,
      applicantPhoneSecondary: row.applicant_phone_secondary,
      applicantDateOfBirth: row.applicant_date_of_birth,
      applicantIdType: row.applicant_id_type,
      applicantGhanaCard: row.applicant_ghana_card,
      applicantCurrentAddress: row.applicant_current_address,
      applicantDigitalAddress: row.applicant_digital_address,
      occupation: row.occupation,
      employerName: row.employer_name,
      employerAddress: row.employer_address,
      employerPhone: row.employer_phone,
      monthlyIncome: row.monthly_income ? parseFloat(row.monthly_income) : undefined,
      employmentDurationMonths: row.employment_duration_months,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactRelationship: row.emergency_contact_relationship,
      emergencyContactPhone: row.emergency_contact_phone,
      desiredMoveInDate: row.desired_move_in_date,
      desiredLeaseTermMonths: row.desired_lease_term_months || 12,
      numberOfOccupants: row.number_of_occupants || 1,
      hasPets: row.has_pets || false,
      petDetails: row.pet_details,
      reasonForMoving: row.reason_for_moving,
      specialRequirements: row.special_requirements,
      howDidYouHear: row.how_did_you_hear,
      characterReferences: row.character_references || [],
      previousAddresses: row.previous_addresses || [],
      uploadedDocuments: row.uploaded_documents || [],
      applicationToken: row.application_token,
      applicationTokenExpiresAt: row.application_token_expires_at,
      status: row.status,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      approvalNotes: row.approval_notes,
      rejectionReason: row.rejection_reason,
      tenantId: row.tenant_id,
      tenancyId: row.tenancy_id,
      envelopeId: row.envelope_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      deletedAt: row.deleted_at,
      propertyName: row.property_name,
      propertyAddress: row.property_address,
      propertyPrice: row.property_price ? parseFloat(row.property_price) : undefined,
      propertyPriceCurrency: row.property_price_currency,
      propertyBedrooms: row.property_bedrooms,
      propertyBathrooms: row.property_bathrooms,
      propertyType: row.property_type
    };
  }

  private mapRowToApplicationLink(row: any): ApplicationLink {
    return {
      id: row.id,
      organizationId: row.organization_id,
      propertyId: row.property_id,
      token: row.token,
      applicationType: row.application_type,
      maxUses: row.max_uses,
      currentUses: row.current_uses || 0,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      deactivatedAt: row.deactivated_at,
      deactivatedBy: row.deactivated_by,
      propertyName: row.property_name,
      propertyAddress: row.property_address
    };
  }
}

export const applicationService = new ApplicationService();
