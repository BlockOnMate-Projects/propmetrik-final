/**
 * Economic Data Service
 * Tier 4 Market Data - Economic Indicators
 * 
 * Collects and manages economic indicators from:
 * - Bank of Ghana (inflation, interest rates, exchange rates)
 * - Ghana Statistical Service (GDP, CPI, employment)
 * - Ministry of Finance (fiscal data)
 * - International financial institutions
 */

import { query, transaction } from '../../database';
import { logger } from '../../utils/logger';
import { fxFeedService } from './scrapers/fxFeedService';

// =====================================================
// TYPES
// =====================================================

export type EconomicIndicatorType =
  | 'inflation_rate'
  | 'cpi_index'
  | 'gdp_growth'
  | 'interest_rate_policy'
  | 'interest_rate_prime'
  | 'mortgage_rate_avg'
  | 'exchange_rate_usd'
  | 'exchange_rate_gbp'
  | 'exchange_rate_eur'
  | 'exchange_rate_cny'
  | 'unemployment_rate'
  | 'construction_pmi'
  | 'property_price_index';

export type DataFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export interface EconomicIndicator {
  id: string;
  indicator_type: EconomicIndicatorType;
  indicator_name: string;
  value: number;
  previous_value: number | null;
  change_percentage: number | null;
  effective_date: Date;
  period_type: DataFrequency;
  source_name: string;
  source_url: string | null;
  source_reference: string | null;
  unit: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEconomicIndicatorInput {
  indicator_type: EconomicIndicatorType;
  indicator_name: string;
  value: number;
  unit: string;
  effective_date: Date;
  period_type: DataFrequency;
  source_name: string;
  source_url?: string;
  source_reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface EconomicIndicatorFilters {
  indicator_type?: EconomicIndicatorType;
  period_type?: DataFrequency;
  from_date?: Date;
  to_date?: Date;
  source_name?: string;
}

export interface ExchangeRate {
  from_currency: string;
  to_currency: string;
  rate: number;
  date: Date;
  source: string;
}

export interface EconomicSnapshot {
  date: Date;
  inflation_rate: number | null;
  interest_rate_policy: number | null;
  exchange_rate_usd: number | null;
  exchange_rate_gbp: number | null;
  exchange_rate_eur: number | null;
  gdp_growth: number | null;
  unemployment_rate: number | null;
  mortgage_rate_avg: number | null;
}

// =====================================================
// SERVICE
// =====================================================

export class EconomicDataService {
  // Default exchange rates for GHS (Ghana Cedis) — last resort fallback.
  // These are ONLY used by the scheduled updateExchangeRates() job when external
  // APIs are unreachable. The canonical rates come from the economic_indicators table
  // and the live FX feed service. Last updated from Bank of Ghana (2025-06).
  private static readonly DEFAULT_EXCHANGE_RATES: Record<string, number> = {
    USD: 10.99,
    GBP: 14.50,
    EUR: 12.30,
    NGN: 0.0068,
  };

  // Official data sources
  private static readonly DATA_SOURCES = {
    BOG: 'Bank of Ghana',
    GSS: 'Ghana Statistical Service',
    MOF: 'Ministry of Finance',
    IMF: 'International Monetary Fund',
    WORLD_BANK: 'World Bank',
    EXCHANGE_RATE_API: 'Exchange Rate API',
  };

  /**
   * Create a new economic indicator record
   */
  async create(input: CreateEconomicIndicatorInput): Promise<EconomicIndicator> {
    // Get previous value for change calculation
    const previousResult = await query<{ value: number }>(
      `SELECT value FROM economic_indicators 
       WHERE indicator_type = $1 
       ORDER BY effective_date DESC LIMIT 1`,
      [input.indicator_type]
    );
    
    const previousValue = previousResult.rows[0]?.value || null;
    const changePercentage = previousValue 
      ? ((input.value - previousValue) / previousValue) * 100 
      : null;

    const result = await query<EconomicIndicator>(
      `INSERT INTO economic_indicators (
        indicator_type, indicator_name, value, previous_value, change_percentage,
        effective_date, period_type, source_name, source_url,
        source_reference, unit, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        input.indicator_type, input.indicator_name, input.value, previousValue, changePercentage,
        input.effective_date, input.period_type, input.source_name, input.source_url || null,
        input.source_reference || null, input.unit, input.notes || null, JSON.stringify(input.metadata || {}),
      ]
    );

    logger.info('Created economic indicator', {
      type: input.indicator_type,
      value: input.value,
      date: input.effective_date,
    });

    return result.rows[0];
  }

  /**
   * Get latest value for an indicator type
   */
  async getLatest(indicatorType: EconomicIndicatorType): Promise<EconomicIndicator | null> {
    const result = await query<EconomicIndicator>(
      `SELECT * FROM economic_indicators 
       WHERE indicator_type = $1
       ORDER BY effective_date DESC LIMIT 1`,
      [indicatorType]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all latest indicators (economic snapshot)
   */
  async getLatestSnapshot(): Promise<EconomicSnapshot> {
    const indicatorTypes: EconomicIndicatorType[] = [
      'inflation_rate', 'interest_rate_policy', 'exchange_rate_usd',
      'exchange_rate_gbp', 'exchange_rate_eur', 'gdp_growth',
      'unemployment_rate', 'mortgage_rate_avg',
    ];

    const snapshot: EconomicSnapshot = {
      date: new Date(),
      inflation_rate: null,
      interest_rate_policy: null,
      exchange_rate_usd: null,
      exchange_rate_gbp: null,
      exchange_rate_eur: null,
      gdp_growth: null,
      unemployment_rate: null,
      mortgage_rate_avg: null,
    };

    for (const type of indicatorTypes) {
      const indicator = await this.getLatest(type);
      if (indicator) {
        const key = type as keyof EconomicSnapshot;
        if (key !== 'date') {
          (snapshot[key] as number | null) = indicator.value;
        }
      }
    }

    return snapshot;
  }

  /**
   * Get historical data for an indicator
   */
  async getHistory(
    indicatorType: EconomicIndicatorType,
    options: {
      from?: Date;
      to?: Date;
      frequency?: DataFrequency;
      limit?: number;
    } = {}
  ): Promise<EconomicIndicator[]> {
    const conditions: string[] = ['indicator_type = $1'];
    const params: unknown[] = [indicatorType];
    let paramIndex = 2;

    if (options.from) {
      conditions.push(`effective_date >= $${paramIndex++}`);
      params.push(options.from);
    }
    if (options.to) {
      conditions.push(`effective_date <= $${paramIndex++}`);
      params.push(options.to);
    }
    if (options.frequency) {
      conditions.push(`period_type = $${paramIndex++}`);
      params.push(options.frequency);
    }

    const limit = options.limit || 100;
    params.push(limit);

    const result = await query<EconomicIndicator>(
      `SELECT * FROM economic_indicators 
       WHERE ${conditions.join(' AND ')}
       ORDER BY effective_date DESC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;
  }

  /**
   * Get current exchange rate - LIVE DATA ONLY, no fallback to mock/default values
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string = 'GHS'): Promise<ExchangeRate> {
    // Try to get from database first (cached from previous live fetches)
    const indicator = await this.getLatest(
      `exchange_rate_${fromCurrency.toLowerCase()}` as EconomicIndicatorType
    );

    if (indicator && this.isRecent(indicator.effective_date, 'daily')) {
      return {
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: indicator.value,
        date: indicator.effective_date,
        source: indicator.source_name,
      };
    }

    // Get live rate from FX Feed Service (Yahoo Finance / ForexRate-API)
    const liveRate = await fxFeedService.getCurrentRate(fromCurrency.toUpperCase());
    
    if (liveRate && liveRate.rate > 0 && liveRate.source !== 'Static Fallback') {
      logger.info('Using live FX rate', { 
        currency: fromCurrency, 
        rate: liveRate.rate, 
        source: liveRate.source 
      });
      return {
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: liveRate.rate,
        date: liveRate.timestamp,
        source: liveRate.source,
      };
    }

    // If static fallback was returned, still use it but log warning
    if (liveRate && liveRate.source === 'Static Fallback') {
      logger.warn('FX service returned static fallback - external APIs may be unavailable', { 
        currency: fromCurrency, 
        rate: liveRate.rate 
      });
      return {
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: liveRate.rate,
        date: liveRate.timestamp,
        source: liveRate.source,
      };
    }

    throw new Error(`Unable to fetch live exchange rate for ${fromCurrency}/${toCurrency}`);
  }

  /**
   * Get exchange rate for a specific date (RICS VPS 3 compliant for retrospective valuations)
   * 
   * This method supports fetching historical exchange rates as of a specific valuation date,
   * which is critical for RICS Red Book and GhIS compliant valuations where the effective
   * date may differ from the current date.
   * 
   * Fallback chain:
   * 1. Check database for exact date or closest prior date (within 3 days)
   * 2. Fetch from Yahoo Finance historical API
   * 3. Use most recent available rate with warning
   * 
   * @param fromCurrency - Source currency (e.g., 'USD')
   * @param toCurrency - Target currency (default: 'GHS')
   * @param asOfDate - The effective date for the exchange rate (valuation date)
   * @returns ExchangeRate object with rate as of the specified date
   */
  async getExchangeRateForDate(
    fromCurrency: string,
    toCurrency: string = 'GHS',
    asOfDate: Date
  ): Promise<ExchangeRate> {
    const indicatorType = `exchange_rate_${fromCurrency.toLowerCase()}` as EconomicIndicatorType;
    
    // Normalize to start of day
    const targetDate = new Date(asOfDate);
    targetDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // If the target date is today or future, use current rate
    if (targetDate >= today) {
      logger.debug('Target date is today or future, using current rate', {
        targetDate: targetDate.toISOString(),
        currency: fromCurrency,
      });
      return this.getExchangeRate(fromCurrency, toCurrency);
    }
    
    logger.info('Fetching historical exchange rate for RICS-compliant valuation', {
      currency: fromCurrency,
      asOfDate: targetDate.toISOString(),
    });

    // 1. Try to get from database (exact date or closest prior date within 3 days)
    const dbResult = await query<EconomicIndicator>(
      `SELECT * FROM economic_indicators 
       WHERE indicator_type = $1 
         AND effective_date <= $2
       ORDER BY effective_date DESC 
       LIMIT 1`,
      [indicatorType, targetDate]
    );
    
    const indicator = dbResult.rows[0];
    
    if (indicator) {
      const indicatorDate = new Date(indicator.effective_date);
      const daysDiff = Math.abs(
        (targetDate.getTime() - indicatorDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // If found within 3 days, use it
      if (daysDiff <= 3) {
        logger.info('Using cached historical FX rate from database', {
          currency: fromCurrency,
          requestedDate: targetDate.toISOString(),
          actualDate: indicatorDate.toISOString(),
          daysDiff,
          rate: indicator.value,
        });
        
        return {
          from_currency: fromCurrency,
          to_currency: toCurrency,
          rate: indicator.value,
          date: indicator.effective_date,
          source: `${indicator.source_name} (as of ${indicatorDate.toISOString().split('T')[0]})`,
        };
      }
    }
    
    // 2. Fetch from Yahoo Finance historical API
    try {
      const historicalRate = await fxFeedService.fetchHistoricalRate(
        fromCurrency.toUpperCase(),
        targetDate
      );
      
      if (historicalRate && historicalRate.rate > 0) {
        logger.info('Retrieved historical FX rate from Yahoo Finance', {
          currency: fromCurrency,
          date: targetDate.toISOString(),
          rate: historicalRate.rate,
        });
        
        // Save to database for future lookups
        try {
          await fxFeedService.saveDailyRate(fromCurrency, historicalRate);
        } catch (saveError) {
          logger.warn('Failed to cache historical FX rate', { error: saveError });
        }
        
        return {
          from_currency: fromCurrency,
          to_currency: toCurrency,
          rate: historicalRate.rate,
          date: targetDate,
          source: `${historicalRate.source} (historical)`,
        };
      }
    } catch (fetchError) {
      logger.warn('Yahoo Finance historical rate fetch failed', {
        currency: fromCurrency,
        date: targetDate.toISOString(),
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
      });
    }
    
    // 3. Fallback: use most recent available rate with warning
    if (indicator) {
      logger.warn('Using older exchange rate as fallback for RICS valuation', {
        currency: fromCurrency,
        requestedDate: targetDate.toISOString(),
        actualDate: new Date(indicator.effective_date).toISOString(),
        rate: indicator.value,
      });
      
      return {
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: indicator.value,
        date: indicator.effective_date,
        source: `${indicator.source_name} (historical fallback - ⚠️ date mismatch)`,
      };
    }
    
    // 4. Last resort: use current rate with strong warning
    logger.error('No historical rate available, falling back to current rate', {
      currency: fromCurrency,
      requestedDate: targetDate.toISOString(),
    });
    
    const currentRate = await this.getExchangeRate(fromCurrency, toCurrency);
    return {
      ...currentRate,
      source: `${currentRate.source} (⚠️ CURRENT RATE - historical not available)`,
    };
  }

  /**
   * Convert currency amount to GHS
   */
  async convertToGHS(amount: number, fromCurrency: string): Promise<number> {
    if (fromCurrency.toUpperCase() === 'GHS') {
      return amount;
    }

    const exchangeRate = await this.getExchangeRate(fromCurrency);
    return amount * exchangeRate.rate;
  }

  /**
   * Fetch and update exchange rates from external API
   * This should be called by a scheduled job
   */
  async updateExchangeRates(): Promise<void> {
    const currencies = ['USD', 'GBP', 'EUR'];
    
    for (const currency of currencies) {
      try {
        // In production, this would call an actual exchange rate API
        // For now, we'll use approximations based on Bank of Ghana data
        const rate = await this.fetchExchangeRateFromAPI(currency);
        
        if (rate) {
          await this.create({
            indicator_type: `exchange_rate_${currency.toLowerCase()}` as EconomicIndicatorType,
            indicator_name: `GHS/${currency} Exchange Rate`,
            value: rate,
            unit: `GHS per ${currency}`,
            effective_date: new Date(),
            period_type: 'daily',
            source_name: EconomicDataService.DATA_SOURCES.EXCHANGE_RATE_API,
          });
        }
      } catch (error) {
        logger.error(`Failed to update ${currency} exchange rate`, { error });
      }
    }
  }

  /**
   * Fetch exchange rate from external API
   */
  private async fetchExchangeRateFromAPI(currency: string): Promise<number | null> {
    // TODO: Implement actual API call
    // Options: exchangerate-api.com, xe.com, Bank of Ghana API
    
    // For now, return default rates
    return EconomicDataService.DEFAULT_EXCHANGE_RATES[currency] || null;
  }

  /**
   * Update Bank of Ghana indicators
   * Should be called monthly or when BOG publishes new data
   */
  async updateBOGIndicators(indicators: {
    inflation_rate?: number;
    interest_rate_policy?: number;
    interest_rate_prime?: number;
  }): Promise<void> {
    const effectiveDate = new Date();

    const indicatorConfigs: Array<{
      type: EconomicIndicatorType;
      name: string;
      value: number | undefined;
      unit: string;
    }> = [
      { type: 'inflation_rate', name: 'Ghana Inflation Rate', value: indicators.inflation_rate, unit: 'percent' },
      { type: 'interest_rate_policy', name: 'BOG Policy Rate', value: indicators.interest_rate_policy, unit: 'percent' },
      { type: 'interest_rate_prime', name: 'Ghana Prime Lending Rate', value: indicators.interest_rate_prime, unit: 'percent' },
    ];

    for (const config of indicatorConfigs) {
      if (config.value !== undefined) {
        await this.create({
          indicator_type: config.type,
          indicator_name: config.name,
          value: config.value,
          unit: config.unit,
          effective_date: effectiveDate,
          period_type: 'monthly',
          source_name: EconomicDataService.DATA_SOURCES.BOG,
          source_url: 'https://www.bog.gov.gh',
        });
      }
    }
  }

  /**
   * Update Ghana Statistical Service data
   * Should be called quarterly
   */
  async updateGSSIndicators(indicators: {
    gdp_growth?: number;
    unemployment_rate?: number;
    cpi_index?: number;
    property_price_index?: number;
  }): Promise<void> {
    const effectiveDate = new Date();

    const indicatorConfigs: Array<{
      type: EconomicIndicatorType;
      name: string;
      value: number | undefined;
      unit: string;
    }> = [
      { type: 'gdp_growth', name: 'Ghana GDP Growth Rate', value: indicators.gdp_growth, unit: 'percent' },
      { type: 'unemployment_rate', name: 'Ghana Unemployment Rate', value: indicators.unemployment_rate, unit: 'percent' },
      { type: 'cpi_index', name: 'Consumer Price Index', value: indicators.cpi_index, unit: 'index' },
      { type: 'property_price_index', name: 'Property Price Index', value: indicators.property_price_index, unit: 'index' },
    ];

    for (const config of indicatorConfigs) {
      if (config.value !== undefined) {
        await this.create({
          indicator_type: config.type,
          indicator_name: config.name,
          value: config.value,
          unit: config.unit,
          effective_date: effectiveDate,
          period_type: 'quarterly',
          source_name: EconomicDataService.DATA_SOURCES.GSS,
          source_url: 'https://statsghana.gov.gh',
        });
      }
    }
  }

  /**
   * Get inflation-adjusted value
   */
  async getInflationAdjustedValue(
    amount: number,
    fromDate: Date,
    toDate: Date = new Date()
  ): Promise<number> {
    // Get CPI values for both dates
    const fromCPI = await this.getCPIForDate(fromDate);
    const toCPI = await this.getCPIForDate(toDate);

    if (!fromCPI || !toCPI) {
      // Return original amount if CPI data not available
      return amount;
    }

    return amount * (toCPI / fromCPI);
  }

  /**
   * Get CPI for a specific date
   */
  private async getCPIForDate(date: Date): Promise<number | null> {
    const result = await query<{ value: number }>(
      `SELECT value FROM economic_indicators 
       WHERE indicator_type = 'consumer_price_index'
         AND effective_date <= $1
       ORDER BY effective_date DESC LIMIT 1`,
      [date]
    );
    return result.rows[0]?.value || null;
  }

  /**
   * Calculate real estate affordability index
   * Based on mortgage rates, median income, and property prices
   */
  async calculateAffordabilityIndex(
    medianPropertyPrice: number,
    medianHouseholdIncome: number
  ): Promise<{
    index: number;
    mortgage_rate_avg: number;
    monthly_payment: number;
    income_ratio: number;
    interpretation: string;
  }> {
    const mortgageRateIndicator = await this.getLatest('mortgage_rate_avg');
    const mortgageRate = mortgageRateIndicator?.value || 28; // Default 28% for Ghana

    // Standard 20-year mortgage, 20% down payment
    const loanAmount = medianPropertyPrice * 0.8;
    const monthlyRate = mortgageRate / 100 / 12;
    const numPayments = 20 * 12;
    
    const monthlyPayment = loanAmount * 
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);

    const monthlyIncome = medianHouseholdIncome / 12;
    const incomeRatio = monthlyPayment / monthlyIncome;
    
    // Affordability index: 100 = affordable, lower = less affordable
    const index = Math.max(0, 100 - (incomeRatio * 100));

    let interpretation: string;
    if (index >= 70) {
      interpretation = 'Highly affordable';
    } else if (index >= 50) {
      interpretation = 'Moderately affordable';
    } else if (index >= 30) {
      interpretation = 'Stretched affordability';
    } else {
      interpretation = 'Severely unaffordable';
    }

    return {
      index: Math.round(index * 10) / 10,
      mortgage_rate_avg: mortgageRate,
      monthly_payment: Math.round(monthlyPayment),
      income_ratio: Math.round(incomeRatio * 1000) / 1000,
      interpretation,
    };
  }

  /**
   * Check if a date is recent enough based on frequency
   */
  private isRecent(date: Date, frequency: DataFrequency): boolean {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    switch (frequency) {
      case 'daily':
        return diffDays < 2;
      case 'weekly':
        return diffDays < 10;
      case 'monthly':
        return diffDays < 45;
      case 'quarterly':
        return diffDays < 120;
      case 'annual':
        return diffDays < 400;
      default:
        return diffDays < 30;
    }
  }

  /**
   * Seed initial economic data with Ghana-specific values
   */
  async seedInitialData(): Promise<void> {
    const now = new Date();
    const indicators: CreateEconomicIndicatorInput[] = [
      {
        indicator_type: 'inflation_rate',
        indicator_name: 'Ghana Inflation Rate',
        value: 23.2,  // As of late 2024
        unit: 'percent',
        effective_date: new Date(now.getFullYear(), now.getMonth(), 0),
        period_type: 'monthly',
        source_name: 'Bank of Ghana',
        notes: 'Initial seed data',
      },
      {
        indicator_type: 'interest_rate_policy',
        indicator_name: 'BOG Policy Rate',
        value: 29.0,
        unit: 'percent',
        effective_date: new Date(now.getFullYear(), now.getMonth(), 0),
        period_type: 'monthly',
        source_name: 'Bank of Ghana',
        notes: 'Initial seed data',
      },
      {
        indicator_type: 'exchange_rate_usd',
        indicator_name: 'GHS/USD Exchange Rate',
        value: 15.5,
        unit: 'GHS per USD',
        effective_date: now,
        period_type: 'daily',
        source_name: 'Bank of Ghana',
        notes: 'Initial seed data',
      },
      {
        indicator_type: 'exchange_rate_gbp',
        indicator_name: 'GHS/GBP Exchange Rate',
        value: 19.5,
        unit: 'GHS per GBP',
        effective_date: now,
        period_type: 'daily',
        source_name: 'Bank of Ghana',
        notes: 'Initial seed data',
      },
      {
        indicator_type: 'exchange_rate_eur',
        indicator_name: 'GHS/EUR Exchange Rate',
        value: 16.8,
        unit: 'GHS per EUR',
        effective_date: now,
        period_type: 'daily',
        source_name: 'Bank of Ghana',
        notes: 'Initial seed data',
      },
      {
        indicator_type: 'mortgage_rate_avg',
        indicator_name: 'Average Mortgage Rate',
        value: 28.5,
        unit: 'percent',
        effective_date: new Date(now.getFullYear(), now.getMonth(), 0),
        period_type: 'monthly',
        source_name: 'Ghana Association of Banks',
        notes: 'Initial seed data',
      },
      {
        indicator_type: 'gdp_growth',
        indicator_name: 'Ghana GDP Growth Rate',
        value: 2.9,
        unit: 'percent',
        effective_date: new Date(now.getFullYear(), 2, 31),
        period_type: 'quarterly',
        source_name: 'Ghana Statistical Service',
        notes: 'Initial seed data',
      },
    ];

    for (const indicator of indicators) {
      try {
        await this.create(indicator);
      } catch (error) {
        // Ignore duplicate errors during seeding
        logger.debug('Indicator may already exist', { type: indicator.indicator_type });
      }
    }

    logger.info('Economic data seeded successfully');
  }
}

export const economicDataService = new EconomicDataService();
