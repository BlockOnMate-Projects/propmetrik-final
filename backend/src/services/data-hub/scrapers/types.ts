/**
 * Economic Data Scrapers - Type Definitions
 * 
 * Central type definitions for all economic data acquisition services
 */

// =====================================================
// SYNC RESULT TYPES
// =====================================================

export interface SyncResult {
  source: string;
  status: 'success' | 'partial' | 'failed';
  started_at: Date;
  completed_at: Date;
  records_fetched: number;
  records_saved: number;
  records_failed: number;
  errors: SyncError[];
  metadata: Record<string, unknown>;
}

export interface SyncError {
  indicator?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// =====================================================
// BOG SCRAPER TYPES
// =====================================================

export interface BOGIndicatorRaw {
  year: number;
  month: number;
  indicator_name: string;
  value: number;
  category: 'exchange_rate' | 'interest_rate' | 'real_sector' | 'monetary';
}

export interface BOGScraperConfig {
  base_url: string;
  user_agent: string;
  timeout_ms: number;
  retry_attempts: number;
  retry_delay_ms: number;
  rate_limit_ms: number;
}

export const BOG_INDICATOR_MAPPING: Record<string, string> = {
  // Exchange Rates
  'Inter-Bank Exchange Rate - End Period (GHC/US$)': 'exchange_rate_usd',
  'Inter-Bank Exchange Rate - Month Average (GHC/US$)': 'exchange_rate_usd_avg',
  'Inter-Bank Exchange Rate - End Period (GHC/GBP)': 'exchange_rate_gbp',
  'Inter-Bank Exchange Rate - End Period (GHC/EURO)': 'exchange_rate_eur',
  
  // Interest Rates
  'Monetary Policy Rate (%)': 'interest_rate_policy',
  'Ghana Reference Rate (%)': 'prime_rate',
  'Average Commercial Banks Lending Rate (%)': 'lending_rate',
  'Average Savings Deposits Rate (%)': 'savings_rate',
  'Average Time Deposits Rate: 3-Month (%)': 'time_deposit_rate_3m',
  'Inter-Bank Weighted Average (%)': 'interbank_rate',
  
  // Real Sector
  'Inflation_Core (Adjusted for Energy & Utility) (%) Year-on-Year': 'inflation_rate',
  'Bank of Ghana Composite Index of Economic Activity': 'ciea_index',
  'Gross Domestic Product Growth Rate (%)': 'gdp_growth',
  'Gross Domestic Product at Current Prices': 'gdp_current',
  'Gross Domestic Product at Constant Prices': 'gdp_constant',
};

// =====================================================
// WDI CLIENT TYPES
// =====================================================

export interface WDIIndicatorConfig {
  code: string;
  name: string;
  map_to: string;
  unit: string;
  frequency: 'annual' | 'quarterly' | 'monthly';
}

export const WDI_INDICATORS: WDIIndicatorConfig[] = [
  {
    code: 'FP.CPI.TOTL.ZG',
    name: 'Inflation, consumer prices (annual %)',
    map_to: 'inflation_rate',
    unit: 'percentage',
    frequency: 'annual',
  },
  {
    code: 'NY.GDP.MKTP.KD.ZG',
    name: 'GDP growth (annual %)',
    map_to: 'gdp_growth',
    unit: 'percentage',
    frequency: 'annual',
  },
  {
    code: 'SL.UEM.TOTL.ZS',
    name: 'Unemployment, total (% of labor force)',
    map_to: 'unemployment_rate',
    unit: 'percentage',
    frequency: 'annual',
  },
  {
    code: 'FR.INR.LEND',
    name: 'Lending interest rate (%)',
    map_to: 'lending_rate',
    unit: 'percentage',
    frequency: 'annual',
  },
  {
    code: 'PA.NUS.FCRF',
    name: 'Official exchange rate (LCU per US$, period average)',
    map_to: 'exchange_rate_usd_annual',
    unit: 'ghs_per_usd',
    frequency: 'annual',
  },
  {
    code: 'NY.GDP.PCAP.CD',
    name: 'GDP per capita (current US$)',
    map_to: 'gdp_per_capita_usd',
    unit: 'usd',
    frequency: 'annual',
  },
  {
    code: 'SP.POP.TOTL',
    name: 'Population, total',
    map_to: 'population',
    unit: 'count',
    frequency: 'annual',
  },
];

export interface WDIDataPoint {
  indicator: {
    id: string;
    value: string;
  };
  country: {
    id: string;
    value: string;
  };
  date: string;
  value: number | null;
  decimal: number;
}

export interface WDIApiResponse {
  page: number;
  pages: number;
  per_page: number;
  total: number;
}

// =====================================================
// FX FEED TYPES
// =====================================================

export interface ExchangeRateFeed {
  pair: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  bid?: number;
  ask?: number;
  source: string;
  timestamp: Date;
  is_official: boolean;
}

export interface FXFeedConfig {
  primary_source: 'exchangerate_api' | 'yahoo_finance';
  fallback_sources: string[];
  cache_ttl_seconds: number;
  update_interval_ms: number;
  supported_currencies: string[];
}

export const DEFAULT_FX_CONFIG: FXFeedConfig = {
  primary_source: 'exchangerate_api',
  fallback_sources: ['yahoo_finance', 'fallback_static'],
  cache_ttl_seconds: 300, // 5 minutes
  update_interval_ms: 300000, // 5 minutes
  supported_currencies: ['USD', 'GBP', 'EUR', 'CNY', 'NGN'],
};

// =====================================================
// DATA VALIDATION TYPES
// =====================================================

export interface ValidationResult {
  is_valid: boolean;
  value: number;
  adjusted_value?: number;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  threshold?: number;
  actual?: number;
}

export interface ValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IndicatorValidationRules {
  indicator_type: string;
  min_value: number;
  max_value: number;
  max_change_percent: number;
  unit: string;
  requires_positive: boolean;
}

export const VALIDATION_RULES: Record<string, IndicatorValidationRules> = {
  inflation_rate: {
    indicator_type: 'inflation_rate',
    min_value: -10,
    max_value: 100,
    max_change_percent: 50,
    unit: 'percentage',
    requires_positive: false,
  },
  interest_rate_policy: {
    indicator_type: 'interest_rate_policy',
    min_value: 0,
    max_value: 100,
    max_change_percent: 25,
    unit: 'percentage',
    requires_positive: true,
  },
  prime_rate: {
    indicator_type: 'prime_rate',
    min_value: 0,
    max_value: 100,
    max_change_percent: 25,
    unit: 'percentage',
    requires_positive: true,
  },
  lending_rate: {
    indicator_type: 'lending_rate',
    min_value: 0,
    max_value: 100,
    max_change_percent: 30,
    unit: 'percentage',
    requires_positive: true,
  },
  exchange_rate_usd: {
    indicator_type: 'exchange_rate_usd',
    min_value: 1,
    max_value: 100,
    max_change_percent: 30,
    unit: 'ghs_per_unit',
    requires_positive: true,
  },
  exchange_rate_gbp: {
    indicator_type: 'exchange_rate_gbp',
    min_value: 1,
    max_value: 150,
    max_change_percent: 30,
    unit: 'ghs_per_unit',
    requires_positive: true,
  },
  exchange_rate_eur: {
    indicator_type: 'exchange_rate_eur',
    min_value: 1,
    max_value: 100,
    max_change_percent: 30,
    unit: 'ghs_per_unit',
    requires_positive: true,
  },
  gdp_growth: {
    indicator_type: 'gdp_growth',
    min_value: -30,
    max_value: 30,
    max_change_percent: 100,
    unit: 'percentage',
    requires_positive: false,
  },
  unemployment_rate: {
    indicator_type: 'unemployment_rate',
    min_value: 0,
    max_value: 50,
    max_change_percent: 50,
    unit: 'percentage',
    requires_positive: true,
  },
};

// =====================================================
// DATABASE TYPES
// =====================================================

export interface EconomicIndicatorRecord {
  id: string;
  indicator_type: string;
  indicator_name: string;
  value: number;
  previous_value: number | null;
  change_percentage: number | null;
  effective_date: Date;
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  source_name: string;
  source_url: string | null;
  source_reference: string | null;
  unit: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface SyncLogRecord {
  id: string;
  source_name: string;
  sync_type: 'full' | 'incremental' | 'manual' | 'scheduled';
  started_at: Date;
  completed_at: Date | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  records_fetched: number;
  records_saved: number;
  records_failed: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
}
