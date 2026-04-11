/**
 * Project Wizard Service
 * Phase 1 Sprint 2: Multi-Step Project Creation Wizard
 * 
 * Handles:
 * - Draft persistence with auto-save
 * - Step validation using Data Hub services
 * - Wizard templates for different project types
 * - Draft-to-project conversion
 * 
 * Wizard Steps:
 * 1. Basics (name, type, description)
 * 2. Location (GPS code, coordinates, region/district)
 * 3. Land (size, tenure, cost)
 * 4. Scope (units, floors, amenities)
 * 5. Budget (total budget, funding sources, cost estimate)
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { BaseService } from '../../../shared-services/base/BaseService';
import { eventBus, ProjectEventType } from './events';

// Import related services
import { projectLocationService, CreateProjectWithLocationInput, LocationValidationResult } from './projectLocationService';
import { projectCostCurrencyService, CostEstimateInput, ProjectCostEstimate, SupportedCurrency } from './projectCostCurrencyService';
import { ProjectType } from './projectService';

// ============================================================================
// TYPES
// ============================================================================

export type WizardStep = 'step1_basics' | 'step2_location' | 'step3_land' | 'step4_scope' | 'step5_budget';

export type DraftStatus = 
  | 'in_progress' 
  | 'validation_pending' 
  | 'ready_to_submit' 
  | 'submitted' 
  | 'abandoned' 
  | 'expired';

export interface ProjectDraft {
  id: string;
  organization_id: string;
  created_by: string;
  last_edited_by?: string;
  
  draft_name?: string;
  draft_type: 'new_project' | 'clone' | 'template';
  source_project_id?: string;
  source_template_id?: string;
  
  current_step: number;
  total_steps: number;
  completed_steps: number[];
  
  step_data: StepData;
  validation_results: ValidationResults;
  
  last_auto_save_at?: Date;
  auto_save_count: number;
  
  status: DraftStatus;
  
  submitted_at?: Date;
  created_project_id?: string;
  
  expires_at?: Date;
  is_deleted: boolean;
  
  created_at: Date;
  updated_at: Date;
}

export interface StepData {
  step1_basics?: Step1Data;
  step2_location?: Step2Data;
  step3_land?: Step3Data;
  step4_scope?: Step4Data;
  step5_budget?: Step5Data;
}

export interface Step1Data {
  name: string;
  project_type: ProjectType;
  description?: string;
  project_manager_id?: string;
  marketing_name?: string;
  tagline?: string;
  developer_name?: string;
  developer_contact?: string;
  developer_email?: string;
  completed_at?: string;
}

export interface Step2Data {
  ghana_post_gps?: string;
  latitude?: number;
  longitude?: number;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  ghana_region?: string;
  ghana_district?: string;
  ghana_area?: string;
  
  // Validation result from location service
  location_validated?: boolean;
  validation_confidence?: number;
  validation_source?: string;
  
  completed_at?: string;
}

export interface Step3Data {
  land_size_sqm?: number;
  land_size_acres?: number;
  land_tenure_type?: 'government_lease' | 'stool_land_lease' | 'family_land' | 'freehold' | 'leasehold' | 'government_allocation';
  land_parcel_id?: string;
  land_title_number?: string;
  land_cost?: number;
  land_cost_currency?: SupportedCurrency;
  land_acquisition_date?: string;
  traditional_authority_id?: string;
  assembly_id?: string;
  
  completed_at?: string;
}

export interface Step4Data {
  total_units?: number;
  total_floors?: number;
  total_buildings?: number;
  total_sqm?: number;
  
  unit_mix?: Array<{
    type: string;
    count: number;
    min_price?: number;
    max_price?: number;
    sqm?: number;
  }>;
  
  amenities?: string[];
  
  // Images (can be uploaded during wizard)
  cover_image_url?: string;
  hero_image_url?: string;
  floor_plan_url?: string;
  site_plan_url?: string;
  render_url?: string;
  
  completed_at?: string;
}

export interface Step5Data {
  total_budget?: number;
  budget_currency?: SupportedCurrency;
  display_currency?: SupportedCurrency;
  
  funding_sources?: Array<{
    type: 'equity' | 'debt' | 'grant' | 'presales';
    amount: number;
    currency: SupportedCurrency;
    provider?: string;
    interest_rate?: number;
  }>;
  
  // Cost estimate from service
  cost_estimate?: ProjectCostEstimate;
  
  // Timeline
  planned_start_date?: string;
  planned_completion_date?: string;
  
  // Phase template
  phase_template_id?: string;
  
  // CRM integration
  auto_create_deals?: boolean;
  default_pipeline_id?: string;
  
  completed_at?: string;
}

export interface ValidationResults {
  step1_basics?: StepValidation;
  step2_location?: StepValidation & { location_validation?: LocationValidationResult };
  step3_land?: StepValidation;
  step4_scope?: StepValidation;
  step5_budget?: StepValidation;
}

export interface StepValidation {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  validated_at: string;
}

export interface CreateDraftInput {
  organization_id: string;
  created_by: string;
  draft_name?: string;
  draft_type?: 'new_project' | 'clone' | 'template';
  source_project_id?: string;
  source_template_id?: string;
  initial_step_data?: Partial<StepData>;
}

export interface UpdateDraftInput {
  step: WizardStep;
  data: Partial<Step1Data | Step2Data | Step3Data | Step4Data | Step5Data>;
  is_auto_save?: boolean;
  last_edited_by?: string;
}

export interface WizardTemplate {
  id: string;
  organization_id?: string;
  name: string;
  code?: string;
  description?: string;
  project_type: ProjectType;
  default_step_data: StepData;
  phase_template_id?: string;
  default_cost_categories: any[];
  usage_count: number;
  is_featured: boolean;
  is_active: boolean;
  created_at: Date;
}

// Step validation rules
const STEP_REQUIRED_FIELDS: Record<WizardStep, string[]> = {
  step1_basics: ['name', 'project_type'],
  step2_location: [], // GPS is recommended but not strictly required
  step3_land: [], // All optional
  step4_scope: [], // All optional but should have some data
  step5_budget: [], // Optional for draft creation
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProjectWizardService extends BaseService {
  constructor() {
    super('ProjectWizardService');
  }
  
  /**
   * Create a new project draft
   */
  async createDraft(input: CreateDraftInput): Promise<ProjectDraft> {
    const id = uuidv4();
    
    // Generate draft name if not provided
    const draftName = input.draft_name || `New Project ${new Date().toLocaleDateString('en-GB')}`;
    
    // Initialize step data
    let stepData: StepData = {};
    
    // If using a template, pre-fill with template defaults
    if (input.source_template_id) {
      const template = await this.getTemplateById(input.source_template_id);
      if (template) {
        stepData = { ...template.default_step_data };
      }
    }
    
    // If cloning, copy from source project
    if (input.source_project_id) {
      const sourceData = await this.getProjectDataForClone(input.source_project_id, input.organization_id);
      if (sourceData) {
        stepData = sourceData;
      }
    }
    
    // Apply initial step data overrides
    if (input.initial_step_data) {
      stepData = {
        ...stepData,
        ...input.initial_step_data,
      };
    }
    
    const result = await pool.query(
      `INSERT INTO project_drafts (
        id, organization_id, created_by, 
        draft_name, draft_type, source_project_id, source_template_id,
        current_step, total_steps, completed_steps,
        step_data, validation_results,
        status, auto_save_count
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        1, 5, '{}',
        $8, '{}'::jsonb,
        'in_progress', 0
      ) RETURNING *`,
      [
        id,
        input.organization_id,
        input.created_by,
        draftName,
        input.draft_type || 'new_project',
        input.source_project_id,
        input.source_template_id,
        JSON.stringify(stepData),
      ]
    );
    
    logger.info('Created project draft', {
      draftId: id,
      organizationId: input.organization_id,
      draftType: input.draft_type,
    });
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get draft by ID
   */
  async getDraftById(
    id: string, 
    organizationId: string
  ): Promise<ProjectDraft | null> {
    const result = await pool.query(
      `SELECT * FROM project_drafts 
       WHERE id = $1 AND organization_id = $2 AND is_deleted = false`,
      [id, organizationId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get all active drafts for a user
   */
  async getUserDrafts(
    organizationId: string,
    userId: string,
    limit: number = 10
  ): Promise<ProjectDraft[]> {
    const result = await pool.query(
      `SELECT * FROM project_drafts 
       WHERE organization_id = $1 
         AND created_by = $2 
         AND is_deleted = false 
         AND status IN ('in_progress', 'ready_to_submit')
       ORDER BY updated_at DESC
       LIMIT $3`,
      [organizationId, userId, limit]
    );
    
    return result.rows.map(this.mapRow);
  }

  /**
   * Update draft with step data
   */
  async updateDraft(
    draftId: string, 
    organizationId: string, 
    input: UpdateDraftInput
  ): Promise<ProjectDraft> {
    const draft = await this.getDraftById(draftId, organizationId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    if (draft.status === 'submitted' || draft.status === 'expired') {
      throw new Error('Cannot update a submitted or expired draft');
    }
    
    // Merge new data with existing step data
    const updatedStepData = {
      ...draft.step_data,
      [input.step]: {
        ...(draft.step_data[input.step] || {}),
        ...input.data,
      },
    };
    
    // Update auto-save tracking
    const autoSaveFields = input.is_auto_save
      ? `, last_auto_save_at = CURRENT_TIMESTAMP, auto_save_count = auto_save_count + 1`
      : '';
    
    const result = await pool.query(
      `UPDATE project_drafts 
       SET step_data = $1,
           last_edited_by = $2,
           updated_at = CURRENT_TIMESTAMP
           ${autoSaveFields}
       WHERE id = $3 AND organization_id = $4
       RETURNING *`,
      [
        JSON.stringify(updatedStepData),
        input.last_edited_by,
        draftId,
        organizationId,
      ]
    );
    
    if (!input.is_auto_save) {
      logger.info('Updated project draft', {
        draftId,
        step: input.step,
        organizationId,
      });
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Validate a specific step
   * Uses Data Hub services for location validation
   */
  async validateStep(
    draftId: string, 
    organizationId: string, 
    step: WizardStep
  ): Promise<StepValidation & { location_validation?: LocationValidationResult }> {
    const draft = await this.getDraftById(draftId, organizationId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    const stepData = draft.step_data[step];
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];
    let locationValidation: LocationValidationResult | undefined;
    
    // Check required fields
    const requiredFields = STEP_REQUIRED_FIELDS[step];
    for (const field of requiredFields) {
      if (!stepData || !(stepData as any)[field]) {
        errors.push({
          field,
          message: `${field.replace(/_/g, ' ')} is required`,
        });
      }
    }
    
    // Step-specific validation
    switch (step) {
      case 'step1_basics':
        const step1 = stepData as Step1Data;
        if (step1?.name && step1.name.length < 3) {
          errors.push({ field: 'name', message: 'Project name must be at least 3 characters' });
        }
        if (step1?.name && step1.name.length > 200) {
          errors.push({ field: 'name', message: 'Project name must be less than 200 characters' });
        }
        break;
        
      case 'step2_location':
        const step2 = stepData as Step2Data;
        
        // Use Data Hub location validation
        if (step2) {
          locationValidation = await projectLocationService.validateAndEnrichLocation({
            ghana_post_gps: step2.ghana_post_gps,
            latitude: step2.latitude,
            longitude: step2.longitude,
            address_line1: step2.address_line1,
            city: step2.city,
            region: step2.region,
          });
          
          // Convert location issues to validation errors/warnings
          for (const issue of locationValidation.issues) {
            const item = {
              field: issue.field || 'location',
              message: issue.message,
            };
            
            if (issue.severity === 'error') {
              errors.push(item);
            } else {
              warnings.push(item);
            }
          }
          
          // Recommend GPS code if not provided
          if (!step2.ghana_post_gps && !step2.latitude) {
            warnings.push({
              field: 'ghana_post_gps',
              message: 'Consider providing a Ghana PostGPS code for accurate location',
            });
          }
        }
        break;
        
      case 'step3_land':
        const step3 = stepData as Step3Data;
        if (step3?.land_size_sqm && step3.land_size_sqm <= 0) {
          errors.push({ field: 'land_size_sqm', message: 'Land size must be greater than 0' });
        }
        if (step3?.land_cost && step3.land_cost < 0) {
          errors.push({ field: 'land_cost', message: 'Land cost cannot be negative' });
        }
        break;
        
      case 'step4_scope':
        const step4 = stepData as Step4Data;
        if (step4?.total_units && step4.total_units <= 0) {
          errors.push({ field: 'total_units', message: 'Total units must be greater than 0' });
        }
        if (step4?.total_floors && step4.total_floors <= 0) {
          errors.push({ field: 'total_floors', message: 'Total floors must be greater than 0' });
        }
        if (step4?.unit_mix && step4.unit_mix.length > 0) {
          const totalUnitsInMix = step4.unit_mix.reduce((sum, u) => sum + u.count, 0);
          if (step4.total_units && totalUnitsInMix !== step4.total_units) {
            warnings.push({
              field: 'unit_mix',
              message: `Unit mix totals ${totalUnitsInMix} but total_units is ${step4.total_units}`,
            });
          }
        }
        break;
        
      case 'step5_budget':
        const step5 = stepData as Step5Data;
        if (step5?.total_budget && step5.total_budget < 0) {
          errors.push({ field: 'total_budget', message: 'Total budget cannot be negative' });
        }
        if (step5?.funding_sources && step5.funding_sources.length > 0) {
          const totalFunding = step5.funding_sources.reduce((sum, f) => sum + f.amount, 0);
          if (step5.total_budget && totalFunding < step5.total_budget * 0.8) {
            warnings.push({
              field: 'funding_sources',
              message: 'Funding sources cover less than 80% of the budget',
            });
          }
        }
        if (!step5?.planned_start_date) {
          warnings.push({
            field: 'planned_start_date',
            message: 'Consider setting a planned start date',
          });
        }
        break;
    }
    
    const validation: StepValidation = {
      valid: errors.length === 0,
      errors,
      warnings,
      validated_at: new Date().toISOString(),
    };
    
    // Store validation results
    const validationResults = {
      ...draft.validation_results,
      [step]: {
        ...validation,
        ...(locationValidation ? { location_validation: locationValidation } : {}),
      },
    };
    
    await pool.query(
      `UPDATE project_drafts 
       SET validation_results = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(validationResults), draftId]
    );
    
    return {
      ...validation,
      ...(locationValidation ? { location_validation: locationValidation } : {}),
    };
  }

  /**
   * Mark a step as completed
   */
  async completeStep(
    draftId: string, 
    organizationId: string, 
    stepNumber: number
  ): Promise<ProjectDraft> {
    const draft = await this.getDraftById(draftId, organizationId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    // Add to completed steps if not already there
    const completedSteps = draft.completed_steps.includes(stepNumber)
      ? draft.completed_steps
      : [...draft.completed_steps, stepNumber].sort((a, b) => a - b);
    
    // Update current step to next incomplete step
    let currentStep = stepNumber;
    for (let i = 1; i <= 5; i++) {
      if (!completedSteps.includes(i)) {
        currentStep = i;
        break;
      }
    }
    
    // Check if ready to submit
    const allStepsComplete = completedSteps.length === 5;
    const status = allStepsComplete ? 'ready_to_submit' : 'in_progress';
    
    // Update step data with completion timestamp
    const stepKey = `step${stepNumber}_basics` as WizardStep; // Will map correctly
    const stepMapping: Record<number, WizardStep> = {
      1: 'step1_basics',
      2: 'step2_location',
      3: 'step3_land',
      4: 'step4_scope',
      5: 'step5_budget',
    };
    const actualStepKey = stepMapping[stepNumber];
    
    const updatedStepData = {
      ...draft.step_data,
      [actualStepKey]: {
        ...(draft.step_data[actualStepKey] || {}),
        completed_at: new Date().toISOString(),
      },
    };
    
    const result = await pool.query(
      `UPDATE project_drafts 
       SET completed_steps = $1,
           current_step = $2,
           step_data = $3,
           status = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        completedSteps,
        currentStep,
        JSON.stringify(updatedStepData),
        status,
        draftId,
        organizationId,
      ]
    );
    
    logger.info('Completed wizard step', {
      draftId,
      step: stepNumber,
      totalCompleted: completedSteps.length,
      status,
    });
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Generate cost estimate for the draft
   */
  async generateCostEstimate(
    draftId: string, 
    organizationId: string
  ): Promise<ProjectCostEstimate> {
    const draft = await this.getDraftById(draftId, organizationId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    const step1 = draft.step_data.step1_basics;
    const step2 = draft.step_data.step2_location;
    const step3 = draft.step_data.step3_land;
    const step4 = draft.step_data.step4_scope;
    const step5 = draft.step_data.step5_budget;
    
    if (!step1?.project_type || !step4?.total_sqm) {
      throw new Error('Project type and total area are required for cost estimate');
    }
    
    // Map project type to estimate input
    const projectTypeMap: Record<string, CostEstimateInput['project_type']> = {
      residential_single: 'residential_single',
      residential_multi: 'residential_multi',
      commercial: 'commercial',
      mixed_use: 'mixed_use',
      industrial: 'commercial',
      land_development: 'residential_single',
      renovation: 'residential_single',
    };
    
    // Determine region from location data
    let region: string = 'greater_accra'; // Default
    if (step2?.ghana_region) {
      // Map Ghana region to RegionCode
      const regionMap: Record<string, string> = {
        'Greater Accra': 'greater_accra',
        'Ashanti': 'kumasi_metro',
        'Eastern': 'eastern',
        'Western': 'western',
        'Central': 'central',
        'Volta': 'volta',
        'Northern': 'northern',
        'Upper East': 'upper_east',
        'Upper West': 'upper_west',
        'Bono': 'bono',
        'Bono East': 'bono_east',
        'Ahafo': 'ahafo',
        'Savannah': 'savannah',
        'North East': 'north_east',
        'Oti': 'oti',
        'Western North': 'western_north',
      };
      region = regionMap[step2.ghana_region] || 'greater_accra';
    }
    
    // Determine finish level based on project type (can be overridden)
    let finishLevel: CostEstimateInput['finish_level'] = 'standard';
    if (step1.project_type === 'commercial') {
      finishLevel = 'premium';
    }
    
    const estimate = await projectCostCurrencyService.generateCostEstimate(
      {
        project_type: projectTypeMap[step1.project_type] || 'residential_multi',
        total_sqm: step4.total_sqm,
        total_floors: step4.total_floors || 1,
        region: region as any,
        finish_level: finishLevel,
        include_land: !!step3?.land_cost,
        land_cost_per_sqm: step3?.land_cost && step3?.land_size_sqm 
          ? step3.land_cost / step3.land_size_sqm 
          : undefined,
      },
      step5?.display_currency || 'GHS'
    );
    
    // Store estimate in step 5 data
    await this.updateDraft(draftId, organizationId, {
      step: 'step5_budget',
      data: {
        cost_estimate: estimate,
        total_budget: step5?.total_budget || estimate.total_estimated_cost_ghs,
      },
    });
    
    return estimate;
  }

  /**
   * Submit wizard and create project
   */
  async submitWizard(
    draftId: string, 
    organizationId: string, 
    submittedBy: string
  ): Promise<{ projectId: string; projectNumber: string }> {
    const draft = await this.getDraftById(draftId, organizationId);
    if (!draft) {
      throw new Error('Draft not found');
    }
    
    if (draft.status === 'submitted') {
      throw new Error('Draft has already been submitted');
    }
    
    // Validate all steps
    const stepKeys: WizardStep[] = ['step1_basics', 'step2_location', 'step3_land', 'step4_scope', 'step5_budget'];
    const allErrors: Array<{ step: string; errors: Array<{ field: string; message: string }> }> = [];
    
    for (const step of stepKeys) {
      const validation = await this.validateStep(draftId, organizationId, step);
      if (validation.errors.length > 0) {
        allErrors.push({ step, errors: validation.errors });
      }
    }
    
    if (allErrors.length > 0) {
      const errorMessages = allErrors
        .map(e => `${e.step}: ${e.errors.map(err => err.message).join(', ')}`)
        .join('; ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    
    // Build project input from step data
    const step1 = draft.step_data.step1_basics!;
    const step2 = draft.step_data.step2_location || {};
    const step3 = draft.step_data.step3_land || {};
    const step4 = draft.step_data.step4_scope || {};
    const step5 = draft.step_data.step5_budget || {};
    
    const projectInput: CreateProjectWithLocationInput = {
      organization_id: organizationId,
      name: step1.name,
      project_type: step1.project_type,
      description: step1.description,
      project_manager_id: step1.project_manager_id,
      marketing_name: step1.marketing_name,
      tagline: step1.tagline,
      developer_name: step1.developer_name,
      developer_contact: step1.developer_contact,
      developer_email: step1.developer_email,
      
      // Location
      ghana_post_gps: step2.ghana_post_gps,
      latitude: step2.latitude,
      longitude: step2.longitude,
      address_line1: step2.address_line1,
      address_line2: step2.address_line2,
      city: step2.city,
      region: step2.region,
      ghana_region: step2.ghana_region,
      ghana_district: step2.ghana_district,
      ghana_area: step2.ghana_area,
      
      // Land
      land_size_sqm: step3.land_size_sqm,
      land_tenure_type: step3.land_tenure_type,
      land_parcel_id: step3.land_parcel_id,
      land_title_number: step3.land_title_number,
      land_cost: step3.land_cost,
      traditional_authority_id: step3.traditional_authority_id,
      assembly_id: step3.assembly_id,
      
      // Scope
      total_floors: step4.total_floors,
      total_buildings: step4.total_buildings,
      amenities: step4.amenities,
      unit_mix: step4.unit_mix,
      cover_image_url: step4.cover_image_url,
      hero_image_url: step4.hero_image_url,
      floor_plan_url: step4.floor_plan_url,
      site_plan_url: step4.site_plan_url,
      render_url: step4.render_url,
      
      // Budget
      total_budget: step5.total_budget,
      display_currency: step5.display_currency,
      funding_sources: step5.funding_sources,
      planned_start_date: step5.planned_start_date ? new Date(step5.planned_start_date) : undefined,
      planned_completion_date: step5.planned_completion_date ? new Date(step5.planned_completion_date) : undefined,
      phase_template_id: step5.phase_template_id,
      auto_create_deals: step5.auto_create_deals,
      default_pipeline_id: step5.default_pipeline_id,
      
      created_by: submittedBy,
    };
    
    // Create the project using location service (with validation)
    const { project, locationValidation } = await projectLocationService.createWithValidation(projectInput);
    
    // Update draft status
    await pool.query(
      `UPDATE project_drafts 
       SET status = 'submitted',
           submitted_at = CURRENT_TIMESTAMP,
           created_project_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [project.id, draftId]
    );
    
    // Capture exchange rate snapshot for the new project
    if (step5.display_currency && step5.display_currency !== 'GHS') {
      await projectCostCurrencyService.captureExchangeRateSnapshot(project.id);
    }
    
    logger.info('Wizard submitted, project created', {
      draftId,
      projectId: project.id,
      projectNumber: project.project_number,
      locationConfidence: locationValidation.confidence,
    });
    
    // Return the full project object (frontend expects DevelopmentProject with 'id' property)
    return { projectId: project.id, projectNumber: project.project_number };
  }

  /**
   * Delete (soft-delete) a draft
   */
  async deleteDraft(
    draftId: string, 
    organizationId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `UPDATE project_drafts 
       SET is_deleted = true, 
           deleted_at = CURRENT_TIMESTAMP,
           status = 'abandoned',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2 AND is_deleted = false
       RETURNING id`,
      [draftId, organizationId]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Get available wizard templates
   */
  async getTemplates(
    organizationId: string,
    projectType?: ProjectType
  ): Promise<WizardTemplate[]> {
    const conditions = ['(organization_id = $1 OR organization_id IS NULL)', 'is_active = true'];
    const params: any[] = [organizationId];
    
    if (projectType) {
      conditions.push('project_type = $2');
      params.push(projectType);
    }
    
    const result = await pool.query(
      `SELECT * FROM project_wizard_templates 
       WHERE ${conditions.join(' AND ')}
       ORDER BY is_featured DESC, display_order, name`,
      params
    );
    
    return result.rows.map(this.mapTemplateRow);
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: string): Promise<WizardTemplate | null> {
    const result = await pool.query(
      `SELECT * FROM project_wizard_templates WHERE id = $1 AND is_active = true`,
      [templateId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapTemplateRow(result.rows[0]);
  }

  /**
   * Get project data for cloning
   */
  private async getProjectDataForClone(
    projectId: string, 
    organizationId: string
  ): Promise<StepData | null> {
    const result = await pool.query(
      `SELECT * FROM development_projects 
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [projectId, organizationId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const project = result.rows[0];
    
    return {
      step1_basics: {
        name: `${project.name} (Copy)`,
        project_type: project.project_type,
        description: project.description,
        marketing_name: project.marketing_name,
        tagline: project.tagline,
        developer_name: project.developer_name,
        developer_contact: project.developer_contact,
        developer_email: project.developer_email,
      },
      step2_location: {
        ghana_post_gps: project.ghana_post_gps,
        address_line1: project.address_line1,
        city: project.city,
        region: project.region,
        ghana_region: project.ghana_region,
        ghana_district: project.ghana_district,
      },
      step3_land: {
        land_size_sqm: project.land_size_sqm ? parseFloat(project.land_size_sqm) : undefined,
        land_tenure_type: project.land_tenure_type,
      },
      step4_scope: {
        total_floors: project.total_floors,
        total_buildings: project.total_buildings,
        amenities: project.amenities,
        unit_mix: project.unit_mix,
      },
      step5_budget: {
        // Don't copy budget amounts, just structure
        display_currency: project.display_currency,
      },
    };
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  protected mapRow(row: any): ProjectDraft {
    return {
      id: row.id,
      organization_id: row.organization_id,
      created_by: row.created_by,
      last_edited_by: row.last_edited_by,
      
      draft_name: row.draft_name,
      draft_type: row.draft_type,
      source_project_id: row.source_project_id,
      source_template_id: row.source_template_id,
      
      current_step: row.current_step,
      total_steps: row.total_steps,
      completed_steps: row.completed_steps || [],
      
      step_data: row.step_data || {},
      validation_results: row.validation_results || {},
      
      last_auto_save_at: row.last_auto_save_at,
      auto_save_count: row.auto_save_count || 0,
      
      status: row.status,
      
      submitted_at: row.submitted_at,
      created_project_id: row.created_project_id,
      
      expires_at: row.expires_at,
      is_deleted: row.is_deleted,
      
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapTemplateRow(row: any): WizardTemplate {
    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      code: row.code,
      description: row.description,
      project_type: row.project_type,
      default_step_data: row.default_step_data || {},
      phase_template_id: row.phase_template_id,
      default_cost_categories: row.default_cost_categories || [],
      usage_count: row.usage_count || 0,
      is_featured: row.is_featured,
      is_active: row.is_active,
      created_at: row.created_at,
    };
  }
}

export const projectWizardService = new ProjectWizardService();
export default projectWizardService;
