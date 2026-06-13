/**
 * Advanced Financial Reporting Service
 * 
 * Provides sophisticated financial metrics for property investment analysis:
 * - Net Operating Income (NOI)
 * - Capitalization Rate (Cap Rate)
 * - Internal Rate of Return (IRR)
 * - Cash-on-Cash Return
 * - Discounted Cash Flow (DCF) Analysis
 * - Debt Service Coverage Ratio (DSCR)
 */

import db from '../../../database';
import { AppError } from '../../../middleware/errorHandler';
import { getGhsRateMap, fxMeta, FxMeta } from '../utils/currencyFx';

// ============================================
// Types
// ============================================

export interface NOIAnalysis {
  propertyId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  grossPotentialRent: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  otherIncome: number;
  totalOperatingIncome: number;
  operatingExpenses: {
    management: number;
    maintenance: number;
    insurance: number;
    taxes: number;
    utilities: number;
    other: number;
    total: number;
  };
  netOperatingIncome: number;
  noiMargin: number; // NOI / EGI as percentage
}

export interface CapRateAnalysis {
  propertyId: string;
  marketValue: number;
  annualNOI: number;
  capRate: number;
  impliedValue: number; // Using market cap rate
  marketCapRate: number; // From comparable sales
  valueSpread: number; // Difference between implied and market value
  recommendation: 'undervalued' | 'fairly_valued' | 'overvalued';
}

export interface IRRAnalysis {
  propertyId: string;
  holdingPeriodYears: number;
  initialInvestment: number;
  annualCashFlows: number[];
  terminalValue: number;
  irr: number;
  npv: number;
  discountRate: number;
  paybackPeriod: number | null;
  profitabilityIndex: number;
}

export interface CashOnCashAnalysis {
  propertyId: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalCashInvested: number;
  downPayment: number;
  closingCosts: number;
  renovationCosts: number;
  annualPreTaxCashFlow: number;
  annualDebtService: number;
  cashOnCashReturn: number;
}

export interface DSCRAnalysis {
  propertyId: string;
  annualNOI: number;
  annualDebtService: number;
  dscr: number;
  status: 'excellent' | 'good' | 'acceptable' | 'poor' | 'critical';
  recommendation: string;
}

export interface PropertyFinancialSummary {
  propertyId: string;
  propertyName: string;
  currency: string;
  asOfDate: Date;
  noi: NOIAnalysis;
  capRate: CapRateAnalysis;
  cashOnCash: CashOnCashAnalysis;
  dscr?: DSCRAnalysis;
  benchmarks: {
    marketCapRate: number;
    marketNOIPerSqft: number;
    occupancyRate: number;
  };
}

export interface PortfolioFinancialSummary {
  organizationId: string;
  totalProperties: number;
  totalValue: number;
  currency: string;
  aggregateNOI: number;
  portfolioNOI: number; // alias for aggregateNOI (frontend compat)
  weightedCapRate: number;
  weightedCashOnCash: number;
  totalDebtService: number;
  portfolioDSCR: number;
  averageOccupancy: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  netMonthlyCashFlow: number;
  performanceByProperty: Array<{
    propertyId: string;
    propertyName: string;
    noi: number;
    capRate: number;
    cashOnCash: number;
    contribution: number; // % of portfolio NOI
  }>;
  /** Base currency + live rates used to normalize all monetary values to GHS. */
  fx?: FxMeta;
}

// ============================================
// Advanced Financial Service
// ============================================

export class AdvancedFinancialService {
  
  /**
   * Calculate Net Operating Income (NOI) for a property
   */
  async calculateNOI(
    organizationId: string,
    propertyId: string,
    startDate: string,
    endDate: string
  ): Promise<NOIAnalysis> {
    // Validate property exists
    const propRes = await db.query(
      `SELECT id, title, price FROM properties WHERE id = $1 AND organization_id = $2`,
      [propertyId, organizationId]
    );
    if (propRes.rows.length === 0) throw new AppError('Property not found', 404);

    // Get gross potential rent (all tenancies for this property)
    const rentQuery = `
      SELECT 
        COALESCE(SUM(t.monthly_rent * 
          GREATEST(EXTRACT(MONTH FROM AGE(
            LEAST(t.lease_end_date, $3::date), 
            GREATEST(t.lease_start_date, $2::date)
          )) + 1, 0)
        ), 0) as potential_rent,
        COALESCE(SUM(
          CASE WHEN t.status = 'active' THEN 
            t.monthly_rent * GREATEST(EXTRACT(MONTH FROM AGE(
              LEAST(t.lease_end_date, $3::date), 
              GREATEST(t.lease_start_date, $2::date)
            )) + 1, 0)
          ELSE 0 END
        ), 0) as actual_rent
      FROM tenancies t
      WHERE t.property_id = $1
      AND t.lease_start_date <= $3::date
      AND t.lease_end_date >= $2::date
    `;
    
    const rentRes = await db.query(rentQuery, [propertyId, startDate, endDate]);
    const grossPotentialRent = parseFloat(rentRes.rows[0].potential_rent || '0');
    const actualRent = parseFloat(rentRes.rows[0].actual_rent || '0');
    const vacancyLoss = grossPotentialRent - actualRent;

    // Get other income
    const otherIncomeQuery = `
      SELECT COALESCE(SUM(amount), 0) as other_income
      FROM property_financial_records
      WHERE property_id = $1
      AND record_type = 'income'
      AND income_category NOT IN ('rental_income')
      AND transaction_date BETWEEN $2 AND $3
    `;
    const otherIncomeRes = await db.query(otherIncomeQuery, [propertyId, startDate, endDate]);
    const otherIncome = parseFloat(otherIncomeRes.rows[0].other_income || '0');

    const effectiveGrossIncome = actualRent + otherIncome;
    const totalOperatingIncome = effectiveGrossIncome;

    // Get operating expenses by category
    const expenseQuery = `
      SELECT 
        expense_category,
        COALESCE(SUM(amount), 0) as total
      FROM property_financial_records
      WHERE property_id = $1
      AND record_type = 'expense'
      AND transaction_date BETWEEN $2 AND $3
      GROUP BY expense_category
    `;
    const expenseRes = await db.query(expenseQuery, [propertyId, startDate, endDate]);

    const operatingExpenses = {
      management: 0,
      maintenance: 0,
      insurance: 0,
      taxes: 0,
      utilities: 0,
      other: 0,
      total: 0
    };

    expenseRes.rows.forEach(row => {
      const amount = parseFloat(row.total);
      const category = row.expense_category?.toLowerCase() || 'other';
      
      if (category.includes('management') || category.includes('property_management')) {
        operatingExpenses.management += amount;
      } else if (category.includes('maintenance') || category.includes('repair')) {
        operatingExpenses.maintenance += amount;
      } else if (category.includes('insurance')) {
        operatingExpenses.insurance += amount;
      } else if (category.includes('tax') || category.includes('property_tax')) {
        operatingExpenses.taxes += amount;
      } else if (category.includes('utility') || category.includes('utilities')) {
        operatingExpenses.utilities += amount;
      } else {
        operatingExpenses.other += amount;
      }
    });

    operatingExpenses.total = Object.values(operatingExpenses).reduce((a, b) => a + b, 0) - operatingExpenses.total;

    const netOperatingIncome = totalOperatingIncome - operatingExpenses.total;
    const noiMargin = effectiveGrossIncome > 0 
      ? (netOperatingIncome / effectiveGrossIncome) * 100 
      : 0;

    return {
      propertyId,
      period: {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      grossPotentialRent,
      vacancyLoss,
      effectiveGrossIncome,
      otherIncome,
      totalOperatingIncome,
      operatingExpenses,
      netOperatingIncome,
      noiMargin: parseFloat(noiMargin.toFixed(2))
    };
  }

  /**
   * Calculate Capitalization Rate
   */
  async calculateCapRate(
    organizationId: string,
    propertyId: string,
    marketValue?: number,
    precomputedNoi?: NOIAnalysis,
    precomputedMarketCapRate?: number
  ): Promise<CapRateAnalysis> {
    // Get property value
    const propRes = await db.query(
      `SELECT id, title, price, price_currency FROM properties WHERE id = $1 AND organization_id = $2`,
      [propertyId, organizationId]
    );
    if (propRes.rows.length === 0) throw new AppError('Property not found', 404);

    const propertyValue = marketValue || parseFloat(propRes.rows[0].price);

    // Calculate annual NOI (last 12 months) — reuse a precomputed one when the caller
    // already has it (the portfolio summary), to avoid recomputing NOI per metric.
    let noi = precomputedNoi;
    if (!noi) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      noi = await this.calculateNOI(
        organizationId,
        propertyId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
    }

    const annualNOI = noi.netOperatingIncome;
    const capRate = propertyValue > 0 ? (annualNOI / propertyValue) * 100 : 0;

    // Get market cap rate from comparable sales (Ghana market benchmarks)
    const marketCapRate = precomputedMarketCapRate ?? await this.getMarketCapRate(organizationId, propertyId);

    // Calculate implied value using market cap rate
    const impliedValue = marketCapRate > 0 ? (annualNOI / (marketCapRate / 100)) : propertyValue;
    const valueSpread = impliedValue - propertyValue;

    // Determine recommendation
    let recommendation: 'undervalued' | 'fairly_valued' | 'overvalued';
    const spreadPercent = propertyValue > 0 ? (valueSpread / propertyValue) * 100 : 0;
    
    if (spreadPercent > 10) {
      recommendation = 'undervalued';
    } else if (spreadPercent < -10) {
      recommendation = 'overvalued';
    } else {
      recommendation = 'fairly_valued';
    }

    return {
      propertyId,
      marketValue: propertyValue,
      annualNOI,
      capRate: parseFloat(capRate.toFixed(2)),
      impliedValue: parseFloat(impliedValue.toFixed(2)),
      marketCapRate,
      valueSpread: parseFloat(valueSpread.toFixed(2)),
      recommendation
    };
  }

  /**
   * Get market cap rate from comparable sales or benchmarks
   */
  private async getMarketCapRate(organizationId: string, propertyId: string): Promise<number> {
    // Get property type and location
    const propRes = await db.query(
      `SELECT property_type, address_city, region FROM properties WHERE id = $1`,
      [propertyId]
    );

    if (propRes.rows.length === 0) return 8.0; // Default Ghana cap rate

    const { property_type, region } = propRes.rows[0];

    // Ghana market cap rate benchmarks by property type and region
    const capRateBenchmarks: Record<string, Record<string, number>> = {
      residential: {
        'Greater Accra': 7.5,
        'Ashanti': 8.5,
        'Western': 9.0,
        'default': 8.5
      },
      commercial: {
        'Greater Accra': 9.0,
        'Ashanti': 10.0,
        'Western': 10.5,
        'default': 10.0
      },
      mixed_use: {
        'Greater Accra': 8.0,
        'Ashanti': 9.0,
        'Western': 9.5,
        'default': 9.0
      },
      industrial: {
        'Greater Accra': 10.0,
        'Ashanti': 11.0,
        'default': 10.5
      }
    };

    const typeRates = capRateBenchmarks[property_type] || capRateBenchmarks.residential;
    return typeRates[region] || typeRates.default;
  }

  /**
   * Calculate Internal Rate of Return (IRR)
   */
  async calculateIRR(
    organizationId: string,
    propertyId: string,
    holdingPeriodYears: number = 5,
    discountRate: number = 10
  ): Promise<IRRAnalysis> {
    // Get property acquisition info
    const propRes = await db.query(
      `SELECT id, price, created_at FROM properties WHERE id = $1 AND organization_id = $2`,
      [propertyId, organizationId]
    );
    if (propRes.rows.length === 0) throw new AppError('Property not found', 404);

    const initialInvestment = parseFloat(propRes.rows[0].price);
    const acquisitionDate = new Date(propRes.rows[0].created_at);

    // Get annual cash flows
    const annualCashFlows: number[] = [];
    
    for (let year = 0; year < holdingPeriodYears; year++) {
      const yearStart = new Date(acquisitionDate);
      yearStart.setFullYear(yearStart.getFullYear() + year);
      const yearEnd = new Date(yearStart);
      yearEnd.setFullYear(yearEnd.getFullYear() + 1);
      yearEnd.setDate(yearEnd.getDate() - 1);

      try {
        const noi = await this.calculateNOI(
          organizationId,
          propertyId,
          yearStart.toISOString().split('T')[0],
          yearEnd.toISOString().split('T')[0]
        );
        annualCashFlows.push(noi.netOperatingIncome);
      } catch {
        // Project future years based on last known cash flow with 3% growth
        const lastCF = annualCashFlows[annualCashFlows.length - 1] || initialInvestment * 0.08;
        annualCashFlows.push(lastCF * 1.03);
      }
    }

    // Estimate terminal value (using exit cap rate)
    const exitCapRate = await this.getMarketCapRate(organizationId, propertyId) + 0.5; // 50bps higher
    const lastYearNOI = annualCashFlows[annualCashFlows.length - 1];
    const terminalValue = (lastYearNOI * 1.03) / (exitCapRate / 100);

    // Calculate IRR using Newton-Raphson method
    const irr = this.calculateIRRValue(
      -initialInvestment,
      annualCashFlows,
      terminalValue
    );

    // Calculate NPV
    const npv = this.calculateNPV(
      -initialInvestment,
      annualCashFlows,
      terminalValue,
      discountRate / 100
    );

    // Calculate payback period
    let cumulativeCF = -initialInvestment;
    let paybackPeriod: number | null = null;
    
    for (let i = 0; i < annualCashFlows.length; i++) {
      cumulativeCF += annualCashFlows[i];
      if (cumulativeCF >= 0 && paybackPeriod === null) {
        paybackPeriod = i + 1 - (cumulativeCF / annualCashFlows[i]);
      }
    }

    // Profitability Index
    const pvInflows = npv + initialInvestment;
    const profitabilityIndex = initialInvestment > 0 ? pvInflows / initialInvestment : 0;

    return {
      propertyId,
      holdingPeriodYears,
      initialInvestment,
      annualCashFlows,
      terminalValue: parseFloat(terminalValue.toFixed(2)),
      irr: parseFloat((irr * 100).toFixed(2)),
      npv: parseFloat(npv.toFixed(2)),
      discountRate,
      paybackPeriod: paybackPeriod ? parseFloat(paybackPeriod.toFixed(1)) : null,
      profitabilityIndex: parseFloat(profitabilityIndex.toFixed(2))
    };
  }

  /**
   * Newton-Raphson IRR calculation
   */
  private calculateIRRValue(
    initialInvestment: number,
    cashFlows: number[],
    terminalValue: number,
    guess: number = 0.1,
    tolerance: number = 0.0001,
    maxIterations: number = 100
  ): number {
    let rate = guess;
    
    for (let i = 0; i < maxIterations; i++) {
      let npv = initialInvestment;
      let dnpv = 0;
      
      for (let t = 0; t < cashFlows.length; t++) {
        const cf = cashFlows[t];
        const discountFactor = Math.pow(1 + rate, t + 1);
        npv += cf / discountFactor;
        dnpv -= ((t + 1) * cf) / Math.pow(1 + rate, t + 2);
      }
      
      // Add terminal value
      const n = cashFlows.length;
      npv += terminalValue / Math.pow(1 + rate, n);
      dnpv -= (n * terminalValue) / Math.pow(1 + rate, n + 1);
      
      if (Math.abs(npv) < tolerance) {
        return rate;
      }
      
      if (dnpv === 0) break;
      rate = rate - npv / dnpv;
    }
    
    return rate;
  }

  /**
   * Calculate Net Present Value
   */
  private calculateNPV(
    initialInvestment: number,
    cashFlows: number[],
    terminalValue: number,
    discountRate: number
  ): number {
    let npv = initialInvestment;
    
    for (let t = 0; t < cashFlows.length; t++) {
      npv += cashFlows[t] / Math.pow(1 + discountRate, t + 1);
    }
    
    npv += terminalValue / Math.pow(1 + discountRate, cashFlows.length);
    
    return npv;
  }

  /**
   * Calculate Cash-on-Cash Return
   */
  async calculateCashOnCash(
    organizationId: string,
    propertyId: string,
    investmentDetails: {
      downPayment: number;
      closingCosts: number;
      renovationCosts: number;
      annualDebtService: number;
    },
    year?: number
  ): Promise<CashOnCashAnalysis> {
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-01-01`;
    const endDate = `${targetYear}-12-31`;

    const noi = await this.calculateNOI(organizationId, propertyId, startDate, endDate);
    
    const totalCashInvested = 
      investmentDetails.downPayment + 
      investmentDetails.closingCosts + 
      investmentDetails.renovationCosts;

    const annualPreTaxCashFlow = noi.netOperatingIncome - investmentDetails.annualDebtService;

    const cashOnCashReturn = totalCashInvested > 0
      ? (annualPreTaxCashFlow / totalCashInvested) * 100
      : 0;

    return {
      propertyId,
      period: {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      totalCashInvested,
      downPayment: investmentDetails.downPayment,
      closingCosts: investmentDetails.closingCosts,
      renovationCosts: investmentDetails.renovationCosts,
      annualPreTaxCashFlow,
      annualDebtService: investmentDetails.annualDebtService,
      cashOnCashReturn: parseFloat(cashOnCashReturn.toFixed(2))
    };
  }

  /**
   * Calculate Debt Service Coverage Ratio
   */
  async calculateDSCR(
    organizationId: string,
    propertyId: string,
    annualDebtService: number,
    precomputedNoi?: NOIAnalysis
  ): Promise<DSCRAnalysis> {
    // Get annual NOI (last 12 months) — reuse a precomputed one when available.
    let noi = precomputedNoi;
    if (!noi) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      noi = await this.calculateNOI(
        organizationId,
        propertyId,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
    }

    const dscr = annualDebtService > 0 
      ? noi.netOperatingIncome / annualDebtService 
      : Infinity;

    // Determine status based on DSCR thresholds
    let status: 'excellent' | 'good' | 'acceptable' | 'poor' | 'critical';
    let recommendation: string;

    if (dscr >= 1.5) {
      status = 'excellent';
      recommendation = 'Strong debt coverage. Property can comfortably service debt with buffer for unexpected expenses.';
    } else if (dscr >= 1.25) {
      status = 'good';
      recommendation = 'Adequate debt coverage. Meets typical lender requirements with moderate safety margin.';
    } else if (dscr >= 1.1) {
      status = 'acceptable';
      recommendation = 'Minimal debt coverage. Consider strategies to increase NOI or refinance at better terms.';
    } else if (dscr >= 1.0) {
      status = 'poor';
      recommendation = 'Breakeven coverage. High risk - any vacancy or expense increase could cause default.';
    } else {
      status = 'critical';
      recommendation = 'Negative cash flow. Immediate action required - consider selling, refinancing, or injecting capital.';
    }

    return {
      propertyId,
      annualNOI: noi.netOperatingIncome,
      annualDebtService,
      dscr: parseFloat(dscr.toFixed(2)),
      status,
      recommendation
    };
  }

  /**
   * Get comprehensive financial summary for a property
   */
  async getPropertyFinancialSummary(
    organizationId: string,
    propertyId: string,
    investmentDetails?: {
      downPayment: number;
      closingCosts: number;
      renovationCosts: number;
      annualDebtService: number;
    }
  ): Promise<PropertyFinancialSummary> {
    const propRes = await db.query(
      `SELECT id, title, price_currency FROM properties WHERE id = $1 AND organization_id = $2`,
      [propertyId, organizationId]
    );
    if (propRes.rows.length === 0) throw new AppError('Property not found', 404);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    // Compute NOI and the market cap rate ONCE, then reuse across every dependent metric
    // (cap rate, DSCR, benchmark). Previously each of those recomputed NOI + market cap
    // rate independently — ~16 redundant queries per property in the portfolio loop.
    const noi = await this.calculateNOI(
      organizationId,
      propertyId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    const marketCapRate = await this.getMarketCapRate(organizationId, propertyId);
    const capRate = await this.calculateCapRate(organizationId, propertyId, undefined, noi, marketCapRate);

    const defaults = {
      downPayment: capRate.marketValue * 0.3,
      closingCosts: capRate.marketValue * 0.03,
      renovationCosts: 0,
      annualDebtService: 0
    };

    const investment = investmentDetails || defaults;

    const cashOnCash = await this.calculateCashOnCash(
      organizationId,
      propertyId,
      investment
    );

    let dscr: DSCRAnalysis | undefined;
    if (investment.annualDebtService > 0) {
      dscr = await this.calculateDSCR(organizationId, propertyId, investment.annualDebtService, noi);
    }

    // Get occupancy rate (based on tenancies directly linked to property)
    const occQuery = `
      SELECT 
        GREATEST(COUNT(*), 1) as total_tenancies,
        COUNT(CASE WHEN t.status = 'active' THEN 1 END) as active_tenancies
      FROM tenancies t
      WHERE t.property_id = $1
    `;
    const occRes = await db.query(occQuery, [propertyId]);
    const totalUnits = parseInt(occRes.rows[0].total_tenancies || '1');
    const occupiedUnits = parseInt(occRes.rows[0].active_tenancies || '0');
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // Get property size for NOI per sqft
    const sizeRes = await db.query(
      `SELECT total_area_sqm FROM properties WHERE id = $1`,
      [propertyId]
    );
    const areaSqft = (parseFloat(sizeRes.rows[0]?.total_area_sqm || '0') * 10.764) || 1;
    const noiPerSqft = noi.netOperatingIncome / areaSqft;

    return {
      propertyId,
      propertyName: propRes.rows[0].title,
      currency: propRes.rows[0].price_currency || 'GHS',
      asOfDate: new Date(),
      noi,
      capRate,
      cashOnCash,
      dscr,
      benchmarks: {
        marketCapRate,
        marketNOIPerSqft: parseFloat(noiPerSqft.toFixed(2)),
        occupancyRate: parseFloat(occupancyRate.toFixed(1))
      }
    };
  }

  /**
   * Get portfolio-level financial summary
   */
  async getPortfolioFinancialSummary(organizationId: string): Promise<PortfolioFinancialSummary> {
    // Computed live on every request (no result cache) so financial KPIs always reflect
    // the latest data. Kept fast by computing NOI/market cap rate once per property.
    // Get all properties
    const propsRes = await db.query(
      `SELECT id, title, price FROM properties WHERE organization_id = $1 AND status = 'active'`,
      [organizationId]
    );

    const properties = propsRes.rows;
    const performanceByProperty: PortfolioFinancialSummary['performanceByProperty'] = [];

    // Each property summary is computed in its native currency; convert every monetary
    // field to GHS (× live rate) before aggregating. Ratios (cap rate %, occupancy %,
    // cash-on-cash %) are currency-independent and pass through unchanged.
    const fx = await getGhsRateMap();
    const rate = (cur?: string): number => {
      const c = (cur || 'GHS').toUpperCase();
      if (c === 'GHS') return 1;
      const r = fx.rates[c];
      return Number.isFinite(r) && r > 0 ? r : 1;
    };

    let totalValue = 0;
    let aggregateNOI = 0;
    let totalDebtService = 0;
    let weightedCapRateSum = 0;
    let weightedCashOnCashSum = 0;
    let totalMonthlyIncome = 0;
    let totalMonthlyExpenses = 0;
    let occupancySum = 0;
    let occupancyCount = 0;

    for (const prop of properties) {
      try {
        const summary = await this.getPropertyFinancialSummary(organizationId, prop.id);
        const fxR = rate(summary.currency);

        const propValue = summary.capRate.marketValue * fxR;
        totalValue += propValue;
        aggregateNOI += summary.noi.netOperatingIncome * fxR;

        // Track monthly income & expenses from NOI breakdown (normalized to GHS)
        totalMonthlyIncome += ((summary.noi.effectiveGrossIncome || 0) / 12) * fxR;
        totalMonthlyExpenses += ((summary.noi.operatingExpenses?.total || 0) / 12) * fxR;

        if (summary.dscr) {
          totalDebtService += summary.dscr.annualDebtService * fxR;
        }

        weightedCapRateSum += summary.capRate.capRate * propValue;
        weightedCashOnCashSum += summary.cashOnCash.cashOnCashReturn * (summary.cashOnCash.totalCashInvested * fxR);

        // Track occupancy from actual benchmarks
        if (summary.benchmarks?.occupancyRate !== undefined) {
          occupancySum += summary.benchmarks.occupancyRate;
          occupancyCount += 1;
        }

        performanceByProperty.push({
          propertyId: prop.id,
          propertyName: prop.title,
          noi: summary.noi.netOperatingIncome * fxR,
          capRate: summary.capRate.capRate,
          cashOnCash: summary.cashOnCash.cashOnCashReturn,
          contribution: 0 // Will calculate after getting totals
        });
      } catch (err) {
        console.error(`Failed to get financial summary for property ${prop.id}:`, err);
      }
    }

    // Calculate contributions
    performanceByProperty.forEach(p => {
      p.contribution = aggregateNOI > 0 ? (p.noi / aggregateNOI) * 100 : 0;
    });

    // Sort by contribution
    performanceByProperty.sort((a, b) => b.contribution - a.contribution);

    const weightedCapRate = totalValue > 0 ? weightedCapRateSum / totalValue : 0;
    const totalCashInvested = performanceByProperty.reduce((sum, p) => sum + (p.noi / (p.cashOnCash / 100 || 1)), 0);
    const weightedCashOnCash = totalCashInvested > 0 ? weightedCashOnCashSum / totalCashInvested : 0;
    const portfolioDSCR = totalDebtService > 0 ? aggregateNOI / totalDebtService : Infinity;

    const averageOccupancy = occupancyCount > 0 ? occupancySum / occupancyCount : 0;
    const netMonthlyCashFlow = totalMonthlyIncome - totalMonthlyExpenses;

    const result: PortfolioFinancialSummary = {
      organizationId,
      totalProperties: properties.length,
      totalValue,
      currency: 'GHS',
      aggregateNOI,
      portfolioNOI: aggregateNOI, // alias for frontend compat
      weightedCapRate: parseFloat(weightedCapRate.toFixed(2)),
      weightedCashOnCash: parseFloat(weightedCashOnCash.toFixed(2)),
      totalDebtService,
      portfolioDSCR: parseFloat((portfolioDSCR === Infinity ? 0 : portfolioDSCR).toFixed(2)),
      averageOccupancy: parseFloat(averageOccupancy.toFixed(1)),
      totalMonthlyIncome: parseFloat(totalMonthlyIncome.toFixed(2)),
      totalMonthlyExpenses: parseFloat(totalMonthlyExpenses.toFixed(2)),
      netMonthlyCashFlow: parseFloat(netMonthlyCashFlow.toFixed(2)),
      performanceByProperty,
      fx: fxMeta(fx)
    };

    return result;
  }
}

export const advancedFinancialService = new AdvancedFinancialService();
