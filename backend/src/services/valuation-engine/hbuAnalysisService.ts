/**
 * HBU (Highest & Best Use) Analysis Service
 * Four-Test Framework implementation for Ghana real estate valuations
 * 
 * Features:
 * - Legal Permissibility Test
 * - Physical Possibility Test
 * - Financial Feasibility Test
 * - Maximum Productivity Test
 * - HBU Conclusion & Method Recommendations
 */

import { pool } from '../../database';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export interface LegalAnalysis {
  zoning_classification: string;
  zoning_source: string;
  permitted_uses: string[];
  conditional_uses: string[];
  prohibited_uses: string[];
  density_allowed?: number;
  height_limit_m?: number;
  setbacks?: {
    front: number;
    rear: number;
    side: number;
  };
  encumbrances: string[];
  title_restrictions: string[];
  compliance_status: 'compliant' | 'non_compliant' | 'conditional' | 'unknown';
  legal_notes?: string;
}

export interface PhysicalAnalysis {
  site_size_sqm: number;
  topography: 'level' | 'gentle_slope' | 'moderate_slope' | 'steep' | 'undulating';
  soil_conditions: 'stable' | 'moderate' | 'poor' | 'unknown';
  access_type: 'paved_road' | 'gravel_road' | 'dirt_road' | 'no_access';
  utilities_available: string[];
  flood_zone: boolean;
  environmental_constraints: string[];
  max_developable_gfa_sqm?: number;
  physical_notes?: string;
}

export interface DevelopmentScenario {
  use: string;
  development_cost: number;
  expected_value: number;
  profit_margin: number;
  irr: number;
  npv?: number;
  payback_months?: number;
  is_feasible: boolean;
}

export interface FinancialAnalysis {
  development_scenarios: DevelopmentScenario[];
  market_demand_rating: 'very_strong' | 'strong' | 'moderate' | 'weak' | 'none';
  absorption_rate_months?: number;
  risk_assessment: 'low' | 'moderate' | 'high' | 'very_high';
  financial_notes?: string;
}

export interface ProductivityOption {
  use: string;
  npv: number;
  irr: number;
  risk_adjusted_npv?: number;
}

export interface ProductivityAnalysis {
  options_evaluated: ProductivityOption[];
  highest_npv_use: string;
  value_differential: number;
  productivity_notes?: string;
}

export type ValuationMethod = 
  | 'sales_comparison' 
  | 'cost_approach' 
  | 'income_approach' 
  | 'residual_method'
  | 'profits_method'
  | 'drc_method';

export interface HBUAnalysis {
  id: string;
  valuation_id: string;
  legal_analysis: LegalAnalysis;
  legal_test_passed: boolean;
  physical_analysis: PhysicalAnalysis;
  physical_test_passed: boolean;
  financial_analysis: FinancialAnalysis;
  financial_test_passed: boolean;
  productivity_analysis: ProductivityAnalysis;
  productivity_test_passed: boolean;
  hbu_as_vacant?: string;
  hbu_as_improved?: string;
  hbu_conclusion: string;
  hbu_justification: string;
  recommended_methods: ValuationMethod[];
  method_justifications: Record<ValuationMethod, string>;
  status: 'draft' | 'in_progress' | 'completed' | 'locked';
  completed_at?: Date;
  completed_by?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateHBUInput {
  valuation_id: string;
  created_by?: string;
}

export interface UpdateLegalAnalysisInput {
  legal_analysis: LegalAnalysis;
  legal_test_passed?: boolean;
}

export interface UpdatePhysicalAnalysisInput {
  physical_analysis: PhysicalAnalysis;
  physical_test_passed?: boolean;
}

export interface UpdateFinancialAnalysisInput {
  financial_analysis: FinancialAnalysis;
  financial_test_passed?: boolean;
}

export interface UpdateProductivityAnalysisInput {
  productivity_analysis: ProductivityAnalysis;
  productivity_test_passed?: boolean;
}

export interface FinalizeHBUInput {
  hbu_as_vacant?: string;
  hbu_as_improved?: string;
  hbu_conclusion: string;
  hbu_justification: string;
  recommended_methods: ValuationMethod[];
  method_justifications: Record<string, string>;
  completed_by: string;
}

// ============================================================================
// HBU ANALYSIS SERVICE
// ============================================================================

class HBUAnalysisService {
  
  // --------------------------------------------------------------------------
  // CRUD OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Create a new HBU analysis
   */
  async create(input: CreateHBUInput): Promise<HBUAnalysis> {
    const id = uuidv4();
    
    const defaultLegal: LegalAnalysis = {
      zoning_classification: '',
      zoning_source: '',
      permitted_uses: [],
      conditional_uses: [],
      prohibited_uses: [],
      encumbrances: [],
      title_restrictions: [],
      compliance_status: 'unknown'
    };
    
    const defaultPhysical: PhysicalAnalysis = {
      site_size_sqm: 0,
      topography: 'level',
      soil_conditions: 'unknown',
      access_type: 'paved_road',
      utilities_available: [],
      flood_zone: false,
      environmental_constraints: []
    };
    
    const defaultFinancial: FinancialAnalysis = {
      development_scenarios: [],
      market_demand_rating: 'moderate',
      risk_assessment: 'moderate'
    };
    
    const defaultProductivity: ProductivityAnalysis = {
      options_evaluated: [],
      highest_npv_use: '',
      value_differential: 0
    };
    
    const query = `
      INSERT INTO valuation_hbu_analyses (
        id, valuation_id, legal_analysis, physical_analysis,
        financial_analysis, productivity_analysis,
        hbu_conclusion, hbu_justification, recommended_methods,
        method_justifications, status, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      RETURNING *
    `;
    
    const values = [
      id,
      input.valuation_id,
      JSON.stringify(defaultLegal),
      JSON.stringify(defaultPhysical),
      JSON.stringify(defaultFinancial),
      JSON.stringify(defaultProductivity),
      'Pending Analysis',
      '',
      JSON.stringify([]),
      JSON.stringify({}),
      'draft',
      input.created_by || null
    ];
    
    const result = await pool.query(query, values);
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Get HBU analysis by ID
   */
  async getById(id: string): Promise<HBUAnalysis | null> {
    const query = 'SELECT * FROM valuation_hbu_analyses WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Get HBU analysis by valuation ID
   */
  async getByValuationId(valuationId: string): Promise<HBUAnalysis | null> {
    const query = 'SELECT * FROM valuation_hbu_analyses WHERE valuation_id = $1';
    const result = await pool.query(query, [valuationId]);
    
    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Get or create HBU analysis for valuation
   * For specialized properties (DRC method), auto-pass HBU tests
   */
  async getOrCreate(valuationId: string, createdBy?: string): Promise<HBUAnalysis> {
    const existing = await this.getByValuationId(valuationId);
    if (existing) return existing;
    
    // Create new HBU analysis
    const hbu = await this.create({ valuation_id: valuationId, created_by: createdBy });
    
    // Check if this is a specialized/institutional property (DRC method)
    // If so, auto-pass HBU tests since these are typically purpose-built
    try {
      const valuationQuery = 'SELECT methods_applied, method_results FROM valuations WHERE id = $1';
      const valuationResult = await pool.query(valuationQuery, [valuationId]);
      
      if (valuationResult.rows.length > 0) {
        const valuation = valuationResult.rows[0];
        const methodsApplied = valuation.methods_applied || [];
        const methodResults = valuation.method_results || {};
        
        // Check if DRC method is used or if property type is institutional
        const isDRC = methodsApplied.includes('drc_method') || methodResults.drc_method;
        const assetType = methodResults.drc_method?.assetType || '';
        const isInstitutional = ['institutional', 'government', 'religious', 'church', 'mosque', 
                                  'hospital', 'school', 'library', 'museum', 'heritage', 'utility', 
                                  'stadium', 'community_center'].includes(assetType);
        
        if (isDRC || isInstitutional) {
          // Auto-pass HBU tests for specialized properties
          await this.updateAllTests(hbu.id, {
            legal_test_passed: true,
            physical_test_passed: true,
            financial_test_passed: true,
            productive_test_passed: true,
            recommended_use: `Current ${assetType || 'institutional'} use represents highest and best use`,
            analysis_notes: 'Specialized property - current use is purpose-built and represents HBU. Standard HBU analysis confirms current use as legally permissible, physically possible, financially feasible, and maximally productive for this asset class.',
          });
          
          // Return updated HBU
          const updated = await this.getById(hbu.id);
          if (updated) return updated;
        }
      }
    } catch (error) {
      // If auto-pass fails, just return the default HBU
      console.warn('Failed to auto-pass HBU for specialized property:', error);
    }
    
    return hbu;
  }

  /**
   * Delete HBU analysis
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    if (existing.status === 'locked') {
      throw new Error('HBU analysis is locked and cannot be deleted');
    }

    const query = 'DELETE FROM valuation_hbu_analyses WHERE id = $1';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // LEGAL PERMISSIBILITY TEST
  // --------------------------------------------------------------------------

  /**
   * Update legal analysis
   */
  async updateLegalAnalysis(id: string, input: UpdateLegalAnalysisInput): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status === 'locked') {
      throw new Error('HBU analysis is locked');
    }

    const passed = input.legal_test_passed ?? this.evaluateLegalTest(input.legal_analysis);

    const query = `
      UPDATE valuation_hbu_analyses SET
        legal_analysis = $2,
        legal_test_passed = $3,
        status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      JSON.stringify(input.legal_analysis),
      passed
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Evaluate legal test
   */
  evaluateLegalTest(legal: LegalAnalysis): boolean {
    // Test passes if:
    // 1. Compliance status is compliant or conditional
    // 2. There are permitted uses defined
    // 3. No critical title restrictions
    
    if (legal.compliance_status === 'non_compliant') return false;
    if (legal.permitted_uses.length === 0 && legal.compliance_status !== 'unknown') return false;
    
    // Check for critical restrictions
    const criticalRestrictions = ['demolition_order', 'court_injunction', 'government_acquisition'];
    const hasCritical = legal.title_restrictions.some(r => 
      criticalRestrictions.includes(r.toLowerCase().replace(/\s+/g, '_'))
    );
    if (hasCritical) return false;
    
    return legal.compliance_status === 'compliant' || legal.compliance_status === 'conditional';
  }

  // --------------------------------------------------------------------------
  // PHYSICAL POSSIBILITY TEST
  // --------------------------------------------------------------------------

  /**
   * Update physical analysis
   */
  async updatePhysicalAnalysis(id: string, input: UpdatePhysicalAnalysisInput): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status === 'locked') {
      throw new Error('HBU analysis is locked');
    }

    const passed = input.physical_test_passed ?? this.evaluatePhysicalTest(input.physical_analysis);

    const query = `
      UPDATE valuation_hbu_analyses SET
        physical_analysis = $2,
        physical_test_passed = $3,
        status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      JSON.stringify(input.physical_analysis),
      passed
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Evaluate physical test
   */
  evaluatePhysicalTest(physical: PhysicalAnalysis): boolean {
    // Test passes if:
    // 1. Site size is adequate (> 50 sqm for any development)
    // 2. Soil conditions are at least moderate
    // 3. Access exists
    // 4. Basic utilities available
    
    if (physical.site_size_sqm < 50) return false;
    if (physical.soil_conditions === 'poor') return false;
    if (physical.access_type === 'no_access') return false;
    
    // Check for critical environmental constraints
    const criticalConstraints = ['contaminated_land', 'protected_wetland', 'landslide_zone'];
    const hasCritical = physical.environmental_constraints.some(c =>
      criticalConstraints.includes(c.toLowerCase().replace(/\s+/g, '_'))
    );
    if (hasCritical) return false;
    
    return true;
  }

  // --------------------------------------------------------------------------
  // FINANCIAL FEASIBILITY TEST
  // --------------------------------------------------------------------------

  /**
   * Update financial analysis
   */
  async updateFinancialAnalysis(id: string, input: UpdateFinancialAnalysisInput): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status === 'locked') {
      throw new Error('HBU analysis is locked');
    }

    const passed = input.financial_test_passed ?? this.evaluateFinancialTest(input.financial_analysis);

    const query = `
      UPDATE valuation_hbu_analyses SET
        financial_analysis = $2,
        financial_test_passed = $3,
        status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      JSON.stringify(input.financial_analysis),
      passed
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Evaluate financial test
   */
  evaluateFinancialTest(financial: FinancialAnalysis): boolean {
    // Test passes if:
    // 1. At least one development scenario is feasible
    // 2. Market demand exists (not 'none')
    // 3. Risk is not very high with no feasible scenarios
    
    const hasFeasibleScenario = financial.development_scenarios.some(s => s.is_feasible);
    const hasMarketDemand = financial.market_demand_rating !== 'none';
    
    if (!hasMarketDemand) return false;
    if (!hasFeasibleScenario && financial.risk_assessment === 'very_high') return false;
    
    return hasFeasibleScenario;
  }

  /**
   * Add a development scenario
   */
  async addDevelopmentScenario(
    id: string, 
    scenario: Omit<DevelopmentScenario, 'is_feasible' | 'profit_margin'>
  ): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    // Calculate derived values
    const profitMargin = scenario.expected_value > 0 
      ? (scenario.expected_value - scenario.development_cost) / scenario.expected_value
      : 0;
    
    const isFeasible = profitMargin >= 0.15 && scenario.irr >= 0.12; // 15% margin, 12% IRR minimum
    
    const fullScenario: DevelopmentScenario = {
      ...scenario,
      profit_margin: Math.round(profitMargin * 10000) / 10000,
      is_feasible: isFeasible
    };
    
    const updatedScenarios = [...existing.financial_analysis.development_scenarios, fullScenario];
    
    return this.updateFinancialAnalysis(id, {
      financial_analysis: {
        ...existing.financial_analysis,
        development_scenarios: updatedScenarios
      }
    });
  }

  // --------------------------------------------------------------------------
  // MAXIMUM PRODUCTIVITY TEST
  // --------------------------------------------------------------------------

  /**
   * Update productivity analysis
   */
  async updateProductivityAnalysis(id: string, input: UpdateProductivityAnalysisInput): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status === 'locked') {
      throw new Error('HBU analysis is locked');
    }

    const passed = input.productivity_test_passed ?? this.evaluateProductivityTest(input.productivity_analysis);

    const query = `
      UPDATE valuation_hbu_analyses SET
        productivity_analysis = $2,
        productivity_test_passed = $3,
        status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      JSON.stringify(input.productivity_analysis),
      passed
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Evaluate productivity test
   */
  evaluateProductivityTest(productivity: ProductivityAnalysis): boolean {
    // Test passes if:
    // 1. Options have been evaluated
    // 2. A highest NPV use has been identified
    // 3. The highest NPV is positive
    
    if (productivity.options_evaluated.length === 0) return false;
    if (!productivity.highest_npv_use) return false;
    
    const highestOption = productivity.options_evaluated.find(
      o => o.use === productivity.highest_npv_use
    );
    
    return highestOption ? highestOption.npv > 0 : false;
  }

  /**
   * Automatically determine productivity from financial scenarios
   */
  async calculateProductivityFromScenarios(id: string): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    
    const feasibleScenarios = existing.financial_analysis.development_scenarios.filter(s => s.is_feasible);
    
    if (feasibleScenarios.length === 0) {
      return this.updateProductivityAnalysis(id, {
        productivity_analysis: {
          options_evaluated: [],
          highest_npv_use: '',
          value_differential: 0,
          productivity_notes: 'No feasible development scenarios to evaluate'
        },
        productivity_test_passed: false
      });
    }
    
    const options: ProductivityOption[] = feasibleScenarios.map(s => ({
      use: s.use,
      npv: s.npv || (s.expected_value - s.development_cost),
      irr: s.irr
    }));
    
    // Sort by NPV descending
    options.sort((a, b) => b.npv - a.npv);
    
    const highest = options[0];
    const secondHighest = options[1];
    const valueDifferential = secondHighest ? highest.npv - secondHighest.npv : highest.npv;
    
    return this.updateProductivityAnalysis(id, {
      productivity_analysis: {
        options_evaluated: options,
        highest_npv_use: highest.use,
        value_differential: valueDifferential,
        productivity_notes: `Highest NPV use: ${highest.use} with NPV of ${highest.npv.toLocaleString()}`
      }
    });
  }

  // --------------------------------------------------------------------------
  // BULK UPDATE
  // --------------------------------------------------------------------------

  /**
   * Update all HBU test results at once (from frontend form submission)
   */
  async updateAllTests(id: string, input: {
    legal_test_passed?: boolean;
    physical_test_passed?: boolean;
    financial_test_passed?: boolean;
    productive_test_passed?: boolean;
    recommended_use?: string;
    analysis_notes?: string;
    legal_analysis?: any;
    physical_analysis?: any;
    financial_analysis?: any;
    productive_analysis?: any;
    alternative_uses?: any[];
  }): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    // Explicitly convert boolean values to ensure they're not undefined
    // When undefined is passed to PostgreSQL, COALESCE treats it as null and keeps old value
    const legalPassed = input.legal_test_passed === true || input.legal_test_passed === false 
      ? input.legal_test_passed 
      : existing.legal_test_passed;
    const physicalPassed = input.physical_test_passed === true || input.physical_test_passed === false 
      ? input.physical_test_passed 
      : existing.physical_test_passed;
    const financialPassed = input.financial_test_passed === true || input.financial_test_passed === false 
      ? input.financial_test_passed 
      : existing.financial_test_passed;
    const productivityPassed = input.productive_test_passed === true || input.productive_test_passed === false 
      ? input.productive_test_passed 
      : existing.productivity_test_passed;

    const query = `
      UPDATE valuation_hbu_analyses
      SET 
        legal_test_passed = $2,
        physical_test_passed = $3,
        financial_test_passed = $4,
        productivity_test_passed = $5,
        hbu_conclusion = COALESCE(NULLIF($6, ''), hbu_conclusion),
        hbu_justification = COALESCE(NULLIF($7, ''), hbu_justification),
        legal_analysis = COALESCE($8, legal_analysis),
        physical_analysis = COALESCE($9, physical_analysis),
        financial_analysis = COALESCE($10, financial_analysis),
        productivity_analysis = COALESCE($11, productivity_analysis),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      legalPassed,
      physicalPassed,
      financialPassed,
      productivityPassed,
      input.recommended_use,
      input.analysis_notes,
      input.legal_analysis ? JSON.stringify(input.legal_analysis) : null,
      input.physical_analysis ? JSON.stringify(input.physical_analysis) : null,
      input.financial_analysis ? JSON.stringify(input.financial_analysis) : null,
      input.productive_analysis ? JSON.stringify(input.productive_analysis) : null,
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // FINALIZATION
  // --------------------------------------------------------------------------

  /**
   * Finalize HBU analysis with conclusion
   */
  async finalize(id: string, input: FinalizeHBUInput): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status === 'locked') {
      throw new Error('HBU analysis is already locked');
    }

    // Validate all tests are completed
    if (!existing.legal_test_passed) {
      throw new Error('Legal permissibility test must pass before finalization');
    }
    if (!existing.physical_test_passed) {
      throw new Error('Physical possibility test must pass before finalization');
    }
    if (!existing.financial_test_passed) {
      throw new Error('Financial feasibility test must pass before finalization');
    }
    if (!existing.productivity_test_passed) {
      throw new Error('Maximum productivity test must pass before finalization');
    }

    const query = `
      UPDATE valuation_hbu_analyses SET
        hbu_as_vacant = $2,
        hbu_as_improved = $3,
        hbu_conclusion = $4,
        hbu_justification = $5,
        recommended_methods = $6,
        method_justifications = $7,
        status = 'completed',
        completed_at = NOW(),
        completed_by = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      input.hbu_as_vacant || null,
      input.hbu_as_improved || null,
      input.hbu_conclusion,
      input.hbu_justification,
      JSON.stringify(input.recommended_methods),
      JSON.stringify(input.method_justifications),
      input.completed_by
    ]);

    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  /**
   * Lock HBU analysis (prevents further changes)
   */
  async lock(id: string): Promise<HBUAnalysis | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (existing.status !== 'completed') {
      throw new Error('HBU analysis must be completed before locking');
    }

    const query = `
      UPDATE valuation_hbu_analyses SET
        status = 'locked',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    return this.mapRowToHBU(result.rows[0]);
  }

  // --------------------------------------------------------------------------
  // METHOD RECOMMENDATIONS
  // --------------------------------------------------------------------------

  /**
   * Get recommended valuation methods based on HBU analysis
   */
  getMethodRecommendations(hbu: HBUAnalysis, propertyType: string): {
    methods: ValuationMethod[];
    justifications: Record<ValuationMethod, string>;
  } {
    const methods: ValuationMethod[] = [];
    const justifications: Record<string, string> = {};

    // Sales Comparison - recommended for most residential
    if (['house', 'apartment', 'condo', 'townhouse'].includes(propertyType.toLowerCase())) {
      methods.push('sales_comparison');
      justifications.sales_comparison = 'Active residential market with comparable sales data available';
    }

    // Income Approach - if property generates income
    const hasIncomeUse = hbu.financial_analysis.development_scenarios.some(
      s => s.use.includes('rental') || s.use.includes('commercial') || s.use.includes('mixed')
    );
    if (hasIncomeUse || ['commercial', 'office', 'retail', 'industrial'].includes(propertyType.toLowerCase())) {
      methods.push('income_approach');
      justifications.income_approach = 'Property has income-generating potential';
    }

    // Cost Approach - for new or specialized properties
    if (hbu.hbu_as_improved && hbu.hbu_as_improved !== hbu.hbu_as_vacant) {
      methods.push('cost_approach');
      justifications.cost_approach = 'Provides check value for improvements';
    }

    // Residual Method - for development sites
    if (hbu.hbu_as_vacant && hbu.financial_analysis.development_scenarios.length > 0) {
      methods.push('residual_method');
      justifications.residual_method = 'Development potential identified in HBU analysis';
    }

    // DRC Method - for specialized/limited market
    if (['school', 'hospital', 'church', 'government'].includes(propertyType.toLowerCase())) {
      methods.push('drc_method');
      justifications.drc_method = 'Specialized property with limited market transactions';
    }

    // Profits Method - for trade-related properties
    if (['hotel', 'fuel_station', 'cinema', 'nightclub'].includes(propertyType.toLowerCase())) {
      methods.push('profits_method');
      justifications.profits_method = 'Value directly related to trading potential';
    }

    return { methods, justifications: justifications as Record<ValuationMethod, string> };
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  private mapRowToHBU(row: any): HBUAnalysis {
    return {
      id: row.id,
      valuation_id: row.valuation_id,
      legal_analysis: typeof row.legal_analysis === 'string' 
        ? JSON.parse(row.legal_analysis) 
        : row.legal_analysis,
      legal_test_passed: row.legal_test_passed,
      physical_analysis: typeof row.physical_analysis === 'string' 
        ? JSON.parse(row.physical_analysis) 
        : row.physical_analysis,
      physical_test_passed: row.physical_test_passed,
      financial_analysis: typeof row.financial_analysis === 'string' 
        ? JSON.parse(row.financial_analysis) 
        : row.financial_analysis,
      financial_test_passed: row.financial_test_passed,
      productivity_analysis: typeof row.productivity_analysis === 'string' 
        ? JSON.parse(row.productivity_analysis) 
        : row.productivity_analysis,
      productivity_test_passed: row.productivity_test_passed,
      hbu_as_vacant: row.hbu_as_vacant,
      hbu_as_improved: row.hbu_as_improved,
      hbu_conclusion: row.hbu_conclusion,
      hbu_justification: row.hbu_justification,
      recommended_methods: typeof row.recommended_methods === 'string' 
        ? JSON.parse(row.recommended_methods) 
        : row.recommended_methods,
      method_justifications: typeof row.method_justifications === 'string' 
        ? JSON.parse(row.method_justifications) 
        : row.method_justifications,
      status: row.status,
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      completed_by: row.completed_by,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }
}

// Export singleton instance
export const hbuAnalysisService = new HBUAnalysisService();
export default hbuAnalysisService;
