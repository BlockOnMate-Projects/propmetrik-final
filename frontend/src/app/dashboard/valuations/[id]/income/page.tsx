'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
  PropertyTypeBadge,
} from '@/components/ui/terminal'
import { valuationsApi, incomeApproachApi, pythonMethodsApi, type RentalComparable } from '@/lib/valuation-api'
import type { Valuation, IncomeApproachData } from '@/types/valuation'
import {
  ArrowLeft,
  Loader2,
  Info,
  Calculator,
  DollarSign,
  TrendingUp,
  Percent,
  Plus,
  X,
  HelpCircle,
  ArrowRight,
  AlertTriangle,
  Building2,
  MapPin,
  Bed,
  Bath,
  Ruler,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// GhIS/RICS-aligned tooltip definitions - Comprehensive compliance wording
const INCOME_TOOLTIPS = {
  // Market Rent Analysis
  indicatedRent: 'Indicative Market Rent derived from rental listings adjusted for location, property characteristics, and market conditions. This is not an achieved rent and should be interpreted as an informed estimate consistent with RICS and GhIS income approach guidance.',
  rentPerSqm: 'Normalized rental rate per square meter used to support comparability across properties of different sizes. Calculated after size and amenity adjustments.',
  confidence: 'Confidence score reflects the quantity, quality, and similarity of rental comparables used, as well as data recency. It does not represent statistical certainty.',
  comparablesMethod: 'Rental comparables are automatically scored and weighted based on proximity, size similarity, amenities, and listing recency. Lower-quality or stale listings receive reduced influence.',
  
  // Rent Input Mode
  systemEstimated: 'Uses the platform\'s rental comparable engine to estimate indicative market rent based on current listings and market adjustments.',
  userEntered: 'Allows manual override where the valuer has superior market evidence. When selected, the user-entered rent fully replaces the system estimate and is documented in the valuation audit trail.',
  
  // Primary Rental
  monthlyRent: 'Gross monthly rent before vacancy, collection loss, and operating expenses. For unleased properties, this represents an estimated stabilized rent.',
  occupancy: 'Represents assumed stabilized occupancy. For single-unit residential properties, 100% is typically applied unless market evidence suggests otherwise.',
  
  // Income & Losses
  potentialGrossIncome: 'Total income assuming 100% occupancy at market rent rates. This represents the maximum achievable income before any deductions.',
  vacancyRate: 'Allowance for expected downtime between tenancies, expressed as a percentage of Potential Gross Income. Reflects local market liquidity and tenant demand.',
  vacancyBands: 'Prime: 3–5% · Standard: 5–8% · Secondary: 8–15%',
  collectionLoss: 'Allowance for non-payment or delayed rent collection. Treated separately from vacancy in accordance with income approach best practice.',
  effectiveGrossIncome: 'Potential Gross Income less vacancy and collection losses. Represents realistic income expectation.',
  
  // Operating Expenses
  operatingExpenses: 'Recurring costs required to maintain the property and generate income, excluding financing costs, depreciation, and capital expenditures.',
  managementFee: 'Allowance for professional or implicit management, even where owner-managed, in line with RICS guidance on normalized operating assumptions.',
  utilities: 'Only expenses borne by the landlord should be included. Tenant-paid utilities should be excluded to avoid overstating expenses.',
  expenseRatio: 'Operating expenses expressed as a percentage of Effective Gross Income. Used as a reasonableness check against market norms.',
  
  // NOI & Capitalization
  netOperatingIncome: 'Income remaining after vacancy, collection loss, and operating expenses. NOI excludes financing costs and income taxes, consistent with direct capitalization methodology.',
  capRate: 'Market-derived rate reflecting the relationship between income and value, incorporating risk, growth expectations, and liquidity. Selected based on asset type, location, and prevailing market conditions.',
  capRateNote: 'Residential ranges shown for guidance only; professional judgment applies.',
  
  // RICS Evidence Categories for Cap Rate
  capRateGradeA: 'Category A (Highest Quality): Cap rate derived from verified transaction data or partner bank data. Represents actual market evidence from completed sales with known prices and income streams.',
  capRateGradeB: 'Category B (Good Quality): Cap rate derived from adjusted listing prices. Applies market-based discounts (asking-to-sale, DOM, condition) to current sale listings to estimate implied yields.',
  capRateGradeC: 'Category C (Limited Quality): Cap rate based on published surveys, valuer judgment, or market defaults. Used when insufficient transaction or listing data is available.',
  capRateSystemMode: 'System-Calculated cap rate uses RICS-compliant fallback hierarchy: First seeks Category A (transaction) data, then Category B (listings), finally Category C (surveys/defaults).',
  capRateUserMode: 'User-Entered allows manual override when the valuer has superior market evidence or specific investor requirements.',

  // Value Indication
  indicatedValue: 'Value indication derived by capitalizing stabilized Net Operating Income at the selected capitalization rate. This represents an income-based value indication, not a guaranteed transaction price.',
  
  // DCF
  dcfCrossCheck: 'Discounted Cash Flow analysis used as a secondary reasonableness check. Differences reflect varying assumptions on growth, holding period, and exit conditions.',
  dcfVariance: 'Percentage difference between Direct Capitalization and DCF outcomes. Significant variance should be reviewed and explained.',
  
  // Key Metrics
  grossRentMultiplier: 'Ratio of property value to gross annual rent. Provided as a secondary market check; not a standalone valuation method.',
  netRentMultiplier: 'Ratio of property value to Net Operating Income. Inversely related to the capitalization rate.',
  breakEvenRatio: 'Minimum occupancy required to cover operating expenses and debt service (if applicable). Useful for risk assessment, not valuation.',
  
  // Discount Rate
  discountRate: 'Rate used to convert future cash flows to present value, reflecting the time value of money and investment risk. Derived from market rates plus property-specific risk premiums.',
  
  // Legacy (keeping for compatibility)
  rentSource: 'Indicates whether the rent estimate comes from market analysis or manual entry. Market-derived values have supporting comparable evidence.',
}

interface IncomeSource {
  id: string
  description: string
  units: number
  monthlyRent: number
  annualIncome: number
  occupancyRate: number
}

// Ghana market typical rates
const MARKET_RATES = {
  capRates: {
    residential: { min: 6, max: 10, typical: 8 },
    commercial: { min: 8, max: 14, typical: 11 },
    industrial: { min: 10, max: 16, typical: 13 },
    mixed_use: { min: 7, max: 12, typical: 9.5 },
  },
  expenseRatios: {
    residential: { min: 25, max: 35, typical: 30 },
    commercial: { min: 30, max: 45, typical: 38 },
    industrial: { min: 20, max: 35, typical: 28 },
  },
  vacancyRates: {
    prime: { min: 3, max: 8, typical: 5 },
    standard: { min: 8, max: 15, typical: 10 },
    secondary: { min: 15, max: 25, typical: 18 },
  },
}

export default function IncomeApproachPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rent input mode: system (from rental market analysis) or user (manual)
  // Default to 'system' mode - when no system rent available, field shows 0 and prompts to complete analysis
  const [rentMode, setRentMode] = useState<'system' | 'user'>('system')
  const [systemRent, setSystemRent] = useState<number | null>(null) // System-estimated rent from rental analysis

  // Income sources
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([
    { id: '1', description: 'Primary Rental', units: 1, monthlyRent: 0, annualIncome: 0, occupancyRate: 100 },
  ])

  // Other income
  const [parkingIncome, setParkingIncome] = useState(0)
  const [otherIncome, setOtherIncome] = useState(0)

  // Vacancy and collection loss
  const [vacancyRate, setVacancyRate] = useState(5)
  const [collectionLoss, setCollectionLoss] = useState(2)

  // Operating expenses
  const [managementFee, setManagementFee] = useState(10) // % of EGI
  const [maintenance, setMaintenance] = useState(0)
  const [insurance, setInsurance] = useState(0)
  const [propertyTax, setPropertyTax] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [security, setSecurity] = useState(0)
  const [reserves, setReserves] = useState(3) // % of EGI
  const [otherExpenses, setOtherExpenses] = useState(0)

  // Capitalization
  const [capRate, setCapRate] = useState(8)
  const [capRateMode, setCapRateMode] = useState<'system' | 'user'>('system')
  const [systemCapRate, setSystemCapRate] = useState<number | null>(null)
  const [capRateGrade, setCapRateGrade] = useState<'A' | 'B' | 'C' | null>(null)
  const [capRateMethodology, setCapRateMethodology] = useState<{
    category: string;
    methodology: string;
    evidenceCount: number;
    dataQuality: string;
    justification: string;
    warnings: string[];
  } | null>(null)
  const [capRateLoading, setCapRateLoading] = useState(false)
  const [discountRate, setDiscountRate] = useState(12)
  const [discountRateMode, setDiscountRateMode] = useState<'system' | 'user'>('system')
  const [discountRateMethod, setDiscountRateMethod] = useState<'buildup' | 'wacc'>('buildup')
  const [systemDiscountRate, setSystemDiscountRate] = useState<number | null>(null)
  const [holdingPeriod, setHoldingPeriod] = useState(10)
  const [terminalCapRate, setTerminalCapRate] = useState(9)
  const [rentGrowth, setRentGrowth] = useState(3)

  // Economic data for discount rate calculation
  const [economicData, setEconomicData] = useState<{
    policyRate: number | null;
    inflationRate: number | null;
    mortgageRate: number | null;
    gdpGrowth: number | null;
    lastUpdated: string | null;
  }>({
    policyRate: null,
    inflationRate: null,
    mortgageRate: null,
    gdpGrowth: null,
    lastUpdated: null,
  })

  // Risk premium configurations by property type
  const RISK_PREMIUMS = {
    residential: { illiquidity: 2.5, propertyRisk: 1.5, label: 'Residential' },
    commercial: { illiquidity: 3.0, propertyRisk: 2.5, label: 'Commercial' },
    industrial: { illiquidity: 3.5, propertyRisk: 3.0, label: 'Industrial' },
    mixed_use: { illiquidity: 3.0, propertyRisk: 2.0, label: 'Mixed Use' },
  }

  // Rental comparables tracking (Phase 5.2/5.5)
  const [rentalComparables, setRentalComparables] = useState<RentalComparable[]>([])
  const [rentEstimateConfidence, setRentEstimateConfidence] = useState<number>(0)
  const [rentEstimateMethodology, setRentEstimateMethodology] = useState<'median' | 'weighted_average' | 'quality_weighted' | 'manual' | ''>('')
  
  // Phase 5.5: Track if rent was market-derived for disclosure
  const [rentSource, setRentSource] = useState<'market' | 'manual' | null>(null)
  const [rentEstimatedAt, setRentEstimatedAt] = useState<string | null>(null)

  // Method selection
  const [incomeMethod, setIncomeMethod] = useState<'direct_cap' | 'dcf'>('direct_cap')

  // Python RICS Engine calculation result
  const [pythonResult, setPythonResult] = useState<any>(null)
  const [calculating, setCalculating] = useState(false)

  // Calculations
  const potentialGrossIncome = incomeSources.reduce((sum, s) => sum + s.annualIncome, 0) + 
    (parkingIncome * 12) + (otherIncome * 12)
  
  const vacancyLoss = potentialGrossIncome * (vacancyRate / 100)
  const collectionLossAmount = potentialGrossIncome * (collectionLoss / 100)
  const effectiveGrossIncome = potentialGrossIncome - vacancyLoss - collectionLossAmount

  const managementFeeAmount = effectiveGrossIncome * (managementFee / 100)
  const reservesAmount = effectiveGrossIncome * (reserves / 100)
  const totalOperatingExpenses = managementFeeAmount + maintenance + insurance + 
    propertyTax + utilities + security + reservesAmount + otherExpenses

  const netOperatingIncome = effectiveGrossIncome - totalOperatingExpenses
  const operatingExpenseRatio = effectiveGrossIncome > 0 
    ? (totalOperatingExpenses / effectiveGrossIncome) * 100 
    : 0

  // Value calculations
  const directCapValue = capRate > 0 ? netOperatingIncome / (capRate / 100) : 0

  // Simple DCF calculation
  const calculateDCF = () => {
    let pv = 0
    const dr = discountRate / 100
    const rg = rentGrowth / 100
    let currentNOI = netOperatingIncome

    // PV of cash flows during holding period
    for (let year = 1; year <= holdingPeriod; year++) {
      currentNOI *= (1 + rg)
      pv += currentNOI / Math.pow(1 + dr, year)
    }

    // Terminal value
    const terminalValue = (currentNOI * (1 + rg)) / (terminalCapRate / 100)
    const pvTerminal = terminalValue / Math.pow(1 + dr, holdingPeriod)

    return pv + pvTerminal
  }

  const dcfValue = calculateDCF()
  
  // Use Python result for direct cap, local calculation for DCF
  // Python income approach returns direct cap value, not DCF
  const indicatedValue = incomeMethod === 'direct_cap' 
    ? (pythonResult?.estimated_value ?? directCapValue)
    : dcfValue
  const confidenceScore = pythonResult?.confidence_score ?? 0.5

  // Get property type for risk premium calculation
  const propertyType = valuation?.property?.property_type || 'residential'
  const currentPremiums = RISK_PREMIUMS[propertyType as keyof typeof RISK_PREMIUMS] || RISK_PREMIUMS.residential

  // Calculate discount rate based on method
  const calculateDiscountRate = (method: 'buildup' | 'wacc'): { rate: number; breakdown: { label: string; value: number }[] } => {
    const policyRate = economicData.policyRate ?? 27 // Default BOG policy rate
    
    if (method === 'buildup') {
      // Build-up Method: Risk-Free + Illiquidity Premium + Property Risk Premium
      const breakdown = [
        { label: 'BOG Policy Rate (Risk-Free)', value: policyRate },
        { label: 'Real Estate Illiquidity Premium', value: currentPremiums.illiquidity },
        { label: 'Property-Specific Risk Premium', value: currentPremiums.propertyRisk },
      ]
      const rate = policyRate + currentPremiums.illiquidity + currentPremiums.propertyRisk
      return { rate: Math.round(rate * 100) / 100, breakdown }
    } else {
      // WACC-style Method: Uses mortgage rate as debt cost, adds equity premium
      const mortgageRate = economicData.mortgageRate ?? 32 // Average Ghana mortgage rate
      const equityPremium = 4 // Premium over debt for equity returns
      const debtWeight = 0.6 // 60% LTV typical for Ghana
      const equityWeight = 0.4
      
      const costOfDebt = mortgageRate
      const costOfEquity = mortgageRate + equityPremium + currentPremiums.propertyRisk
      const wacc = (costOfDebt * debtWeight) + (costOfEquity * equityWeight)
      
      const breakdown = [
        { label: `Cost of Debt (Mortgage Rate × ${(debtWeight * 100).toFixed(0)}%)`, value: costOfDebt * debtWeight },
        { label: `Cost of Equity (${(equityWeight * 100).toFixed(0)}% weight)`, value: costOfEquity * equityWeight },
      ]
      return { rate: Math.round(wacc * 100) / 100, breakdown }
    }
  }

  const discountRateCalc = calculateDiscountRate(discountRateMethod)

  // Update discount rate when method changes (only in system mode)
  const handleDiscountMethodChange = (newMethod: 'buildup' | 'wacc') => {
    setDiscountRateMethod(newMethod)
    if (discountRateMode === 'system') {
      const { rate } = calculateDiscountRate(newMethod)
      setDiscountRate(rate)
      setSystemDiscountRate(rate)
    }
  }

  // Fetch existing data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const [valuationRes, incomeRes] = await Promise.all([
          valuationsApi.getById(valuationId),
          incomeApproachApi.getByValuation(valuationId),
        ])

        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as Valuation)

        // Set default cap rate based on property type
        const propType = valuationRes.data.property?.property_type || 'residential'
        const rates = MARKET_RATES.capRates[propType as keyof typeof MARKET_RATES.capRates]
        if (rates) setCapRate(rates.typical)

        // Fetch economic data for discount rate calculation
        try {
          const API_URL = process.env.NEXT_PUBLIC_TS_API_URL || 'http://localhost:4000'
          const economicRes = await fetch(`${API_URL}/api/v1/data-hub/economic/snapshot`)
          if (economicRes.ok) {
            const economicJson = await economicRes.json()
            if (economicJson.success && economicJson.data) {
              const econ = economicJson.data
              setEconomicData({
                policyRate: econ.policy_rate?.value ?? econ.interest_rate_policy?.value ?? null,
                inflationRate: econ.inflation_rate?.value ?? null,
                mortgageRate: econ.mortgage_rate_avg?.value ?? null,
                gdpGrowth: econ.gdp_growth?.value ?? null,
                lastUpdated: econ.policy_rate?.effective_date ?? economicJson.timestamp ?? null,
              })
              
              // Calculate system discount rate using build-up method
              const policyRate = econ.policy_rate?.value ?? econ.interest_rate_policy?.value ?? 27
              const premiums = RISK_PREMIUMS[propType as keyof typeof RISK_PREMIUMS] || RISK_PREMIUMS.residential
              const calculatedRate = policyRate + premiums.illiquidity + premiums.propertyRisk
              setSystemDiscountRate(Math.round(calculatedRate * 100) / 100)
              setDiscountRate(Math.round(calculatedRate * 100) / 100)
              setDiscountRateMode('system')
            }
          }
        } catch (econError) {
          console.warn('Failed to fetch economic data:', econError)
          // Fall back to defaults
          setSystemDiscountRate(null)
        }

        // Load rental market analysis data if available (from rental-market page)
        const rentalAnalysis = (valuationRes.data as any).rental_market_analysis
        if (rentalAnalysis) {
          // Store system-estimated rent (rounded to whole number)
          const indicatedRent = Math.round(rentalAnalysis.indicated_rent_monthly || 0)
          setSystemRent(indicatedRent)
          
          // Pre-populate rent from rental market analysis
          if (indicatedRent > 0) {
            setIncomeSources(prev => prev.map((s, i) => 
              i === 0 ? { ...s, monthlyRent: indicatedRent, annualIncome: Math.round(indicatedRent * 12 * (s.occupancyRate / 100)) } : s
            ))
            // Set to system mode if we have rental analysis
            setRentMode('system')
          }
          
          // Track rent source from rental market analysis
          setRentSource('market')
          setRentEstimateConfidence(rentalAnalysis.confidence || 0)
          setRentEstimateMethodology(rentalAnalysis.methodology || 'quality_weighted')
          setRentEstimatedAt(rentalAnalysis.analyzed_at)
          
          // Store comparables summary for disclosure
          if (rentalAnalysis.comparables) {
            setRentalComparables(rentalAnalysis.comparables.map((c: any) => ({
              id: c.id,
              title: c.address,
              address_street: c.address,
              asking_rent_monthly: c.asking_rent || c.adjusted_rent,
              bedrooms: c.bedrooms,
              distance_km: c.distance_km,
            })) as RentalComparable[])
          }
        }

        // Load existing income approach data if available - use any to handle camelCase/snake_case discrepancy
        if (incomeRes.data) {
          const data = incomeRes.data as any
          if (data.incomeSources || data.income_streams) setIncomeSources(data.incomeSources || data.income_streams)
          setParkingIncome(data.parkingIncome || 0)
          setOtherIncome(data.otherIncome || 0)
          setVacancyRate(data.vacancyRate || data.vacancy_rate || 5)
          setCollectionLoss(data.collectionLoss || 2)
          setManagementFee(data.managementFee || 10)
          setMaintenance(data.maintenance || 0)
          setInsurance(data.insurance || 0)
          setPropertyTax(data.propertyTax || 0)
          setUtilities(data.utilities || 0)
          setSecurity(data.security || 0)
          setReserves(data.reserves || 3)
          setOtherExpenses(data.otherExpenses || 0)
          
          // Cap rate handling: Only restore saved cap rate if user mode was saved
          // System mode cap rate will be fetched fresh from API
          const savedCapRateMode = data.cap_rate_mode || data.capRateMode
          if (savedCapRateMode === 'user') {
            setCapRateMode('user')
            // Only set cap rate from saved data in user mode
            const savedCapRate = data.capRate || data.cap_rate
            if (savedCapRate && savedCapRate > 0) {
              setCapRate(savedCapRate)
            }
          }
          // For system mode, don't restore saved cap rate - let API fetch it fresh
          // But store saved methodology/grade for reference (will be overwritten by API)
          if (data.cap_rate_grade || data.capRateGrade) {
            setCapRateGrade(data.cap_rate_grade || data.capRateGrade)
          }
          if (data.cap_rate_methodology || data.capRateMethodology) {
            setCapRateMethodology(data.cap_rate_methodology || data.capRateMethodology)
          }
          // Don't restore systemCapRate from saved data - let API determine it fresh
          
          // Only override discount rate if user previously saved in user mode
          if (data.discountRateMode === 'user') {
            setDiscountRate(data.discountRate || 12)
            setDiscountRateMode('user')
          }
          if (data.discountRateMethod) setDiscountRateMethod(data.discountRateMethod)
          setHoldingPeriod(data.holdingPeriod || 10)
          setTerminalCapRate(data.terminalCapRate || 9)
          setRentGrowth(data.rentGrowth || 3)
          setIncomeMethod(data.incomeMethod || 'direct_cap')
          
          // Restore rental analysis tracking from saved data
          if (data.rental_analysis) {
            setRentSource(data.rental_analysis.source || null)
            setRentEstimateConfidence(data.rental_analysis.confidence || 0)
            setRentEstimateMethodology(data.rental_analysis.methodology || '')
            setRentEstimatedAt(data.rental_analysis.estimated_at || null)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Calculate via Python RICS Engine when inputs change
  useEffect(() => {
    const calculateIncome = async () => {
      if (!valuation?.property) return
      const primaryRent = incomeSources[0]?.monthlyRent || 0
      if (primaryRent <= 0) return
      
      setCalculating(true)
      try {
        const prop = valuation.property
        const result = await pythonMethodsApi.calculateIncomeApproach(
          {
            id: prop.id,
            property_type: prop.property_type || 'residential',
            region: prop.region || 'greater_accra',
            building_size_sqm: prop.building_area_sqm,
            bedrooms: prop.bedrooms,
            bathrooms: prop.bathrooms,
          },
          {
            monthly_rent: primaryRent,
            vacancy_rate: vacancyRate,
            operating_expenses: operatingExpenseRatio,
            cap_rate: capRate,
          }
        )
        
        if (result.success && result.data) {
          setPythonResult(result.data)
        }
      } catch (err) {
        console.error('Python Income calculation error:', err)
        // Keep using local calculation on error
      } finally {
        setCalculating(false)
      }
    }

    // Debounce calculation
    const timer = setTimeout(calculateIncome, 500)
    return () => clearTimeout(timer)
  }, [valuation, incomeSources, vacancyRate, capRate, operatingExpenseRatio])

  // Fetch market cap rate from API when property data is available
  useEffect(() => {
    const fetchCapRate = async () => {
      if (!valuation?.property) return
      
      const prop = valuation.property
      const region = prop.region || 'greater_accra'
      const propertyType = prop.property_type || 'residential_house'
      
      setCapRateLoading(true)
      try {
        const API_URL = process.env.NEXT_PUBLIC_TS_API_URL || 'http://localhost:4000'
        const response = await fetch(`${API_URL}/api/v1/valuations/cap-rate/${region}/${propertyType}`)
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const data = result.data
            
            // Set system cap rate (API returns as decimal, convert to percentage)
            const capRateValue = data.capRate > 1 ? data.capRate : data.capRate * 100
            setSystemCapRate(capRateValue)
            
            // Set RICS grade from ricsCategory field (A, B, or C)
            const ricsCategory = data.ricsCategory || result.meta?.ricsCompliance?.category || 'C'
            setCapRateGrade(ricsCategory as 'A' | 'B' | 'C')
            
            // Store methodology details for tooltip
            // API returns: methodology (string), ricsCategory, sampleSize, confidence, description
            setCapRateMethodology({
              category: ricsCategory,
              methodology: data.methodology || 'market_default',
              evidenceCount: data.sampleSize || 0,
              dataQuality: data.confidence || 'limited',
              justification: data.description || 'Based on market data for this property type and region.',
              warnings: data.uncertaintyNote ? [data.uncertaintyNote] : [],
            })
            
            // Only update cap rate if in system mode
            if (capRateMode === 'system') {
              setCapRate(capRateValue)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch market cap rate:', err)
        // Fall back to property type defaults
        const rates = MARKET_RATES.capRates[propertyType.split('_')[0] as keyof typeof MARKET_RATES.capRates]
        if (rates && capRateMode === 'system') {
          setSystemCapRate(rates.typical)
          setCapRate(rates.typical)
          setCapRateGrade('C')
          setCapRateMethodology({
            category: 'survey_default',
            methodology: 'market_default',
            evidenceCount: 0,
            dataQuality: 'limited',
            justification: `Default cap rate based on typical ${propertyType} yields in Ghana market.`,
            warnings: ['Using default rate - no market data available'],
          })
        }
      } finally {
        setCapRateLoading(false)
      }
    }
    
    fetchCapRate()
  }, [valuation?.property?.id, valuation?.property?.region, valuation?.property?.property_type])

  // Update income source
  const updateIncomeSource = (id: string, field: keyof IncomeSource, value: number | string) => {
    setIncomeSources(prev =>
      prev.map(s => {
        if (s.id !== id) return s
        const updated = { ...s, [field]: value }
        updated.annualIncome = updated.units * updated.monthlyRent * 12 * (updated.occupancyRate / 100)
        return updated
      })
    )
  }

  // Add income source
  const addIncomeSource = () => {
    setIncomeSources([
      ...incomeSources,
      { 
        id: Date.now().toString(), 
        description: '', 
        units: 1, 
        monthlyRent: 0, 
        annualIncome: 0, 
        occupancyRate: 100 
      },
    ])
  }

  // Remove income source
  const removeIncomeSource = (id: string) => {
    if (incomeSources.length > 1) {
      setIncomeSources(incomeSources.filter(s => s.id !== id))
    }
  }

  // Handle rental market analysis rent estimation (Phase 5.2/5.5)
  const handleRentEstimated = (
    rent: number, 
    confidence: number, 
    comparables: RentalComparable[],
    methodology: 'median' | 'weighted_average' | 'manual'
  ) => {
    // Store comparables and metadata for report
    setRentalComparables(comparables)
    setRentEstimateConfidence(confidence)
    setRentEstimateMethodology(methodology)
    
    // Phase 5.5: Track rent source for disclosure
    setRentSource(methodology === 'manual' ? 'manual' : 'market')
    setRentEstimatedAt(new Date().toISOString())
    
    // Update the primary income source with the estimated rent
    if (incomeSources.length > 0) {
      updateIncomeSource(incomeSources[0].id, 'monthlyRent', rent)
    }
  }
  
  // Handle manual rent change - track as manual entry (Phase 5.5)
  const handleManualRentChange = (sourceId: string, value: number) => {
    // If user manually edits rent after using market analysis, mark as manual
    if (rentSource === 'market' && value !== incomeSources.find(s => s.id === sourceId)?.monthlyRent) {
      setRentSource('manual')
      setRentEstimateMethodology('manual')
      setRentEstimatedAt(new Date().toISOString())
    }
    updateIncomeSource(sourceId, 'monthlyRent', value)
  }

  // Calculate confidence
  const calculateConfidence = () => {
    let score = 0.5
    if (netOperatingIncome > 0) score += 0.2
    if (incomeSources.some(s => s.monthlyRent > 0)) score += 0.1
    if (capRate >= 5 && capRate <= 15) score += 0.1
    if (operatingExpenseRatio >= 20 && operatingExpenseRatio <= 50) score += 0.1
    return Math.min(score, 1)
  }

  // Save and continue
  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      await incomeApproachApi.save(valuationId, {
        gross_potential_income: potentialGrossIncome,
        vacancy_rate: vacancyRate,
        effective_gross_income: effectiveGrossIncome,
        operating_expenses: totalOperatingExpenses,
        net_operating_income: netOperatingIncome,
        cap_rate: capRate,
        cap_rate_mode: capRateMode,
        cap_rate_grade: capRateGrade,
        cap_rate_methodology: capRateMethodology,
        system_cap_rate: systemCapRate,
        indicated_value: indicatedValue,
        dcf_value: dcfValue,
        income_streams: incomeSources,
        expense_breakdown: {
          managementFee,
          managementFeeAmount,
          maintenance,
          insurance,
          propertyTax,
          utilities,
          security,
          reserves,
          reservesAmount,
          otherExpenses,
          parkingIncome,
          otherIncome,
          vacancyLoss,
          collectionLoss,
          collectionLossAmount,
          operatingExpenseRatio,
          discountRate,
          discountRateMode,
          discountRateMethod,
          systemDiscountRate,
          economicData,
          holdingPeriod,
          terminalCapRate,
          rentGrowth,
          incomeMethod,
          directCapValue,
        },
        // Phase 5.5: Include rental analysis metadata for disclosure
        rental_analysis: rentSource ? {
          source: rentSource,
          methodology: rentEstimateMethodology,
          confidence: rentEstimateConfidence,
          comparables_count: rentalComparables.length,
          estimated_at: rentEstimatedAt,
          comparables: rentalComparables.slice(0, 5).map(c => ({
            id: c.id,
            address: c.address_street || c.title,
            rent: c.asking_rent_monthly,
            bedrooms: c.bedrooms,
            distance_km: c.distance_km,
          })),
        } : null,
      })

      // Calculate separate confidence scores for each income method
      const baseConfidence = calculateConfidence()
      
      // Direct Cap confidence - higher when cap rate is within market norms
      const directCapConfidence = (() => {
        let conf = baseConfidence
        // Boost confidence if cap rate is within typical residential range (6-12%)
        if (capRate >= 6 && capRate <= 12) conf = Math.min(conf + 0.1, 1)
        // Reduce if cap rate seems extreme
        if (capRate < 4 || capRate > 18) conf = Math.max(conf - 0.15, 0.3)
        return conf
      })()
      
      // DCF confidence - higher when discount rate is properly derived
      const dcfConfidence = (() => {
        let conf = baseConfidence
        // Boost if using system-derived discount rate
        if (discountRateMode === 'system') conf = Math.min(conf + 0.1, 1)
        // Boost if variance between DCF and Direct Cap is reasonable (<15%)
        const variance = directCapValue > 0 ? Math.abs((dcfValue - directCapValue) / directCapValue * 100) : 50
        if (variance < 15) conf = Math.min(conf + 0.05, 1)
        if (variance > 30) conf = Math.max(conf - 0.1, 0.4)
        return conf
      })()

      // Calculate weighted average income value based on confidences
      const totalConfidence = directCapConfidence + dcfConfidence
      const directCapWeight = totalConfidence > 0 ? directCapConfidence / totalConfidence : 0.5
      const dcfWeight = totalConfidence > 0 ? dcfConfidence / totalConfidence : 0.5
      const consolidatedIncomeValue = (directCapValue * directCapWeight) + (dcfValue * dcfWeight)

      // Use Python result as primary, local as fallback
      const finalValue = pythonResult?.estimated_value ?? consolidatedIncomeValue
      const finalConfidence = pythonResult?.confidence_score ?? ((directCapConfidence + dcfConfidence) / 2)

      // Update valuation method result
      // Store both Direct Cap and DCF with individual confidence scores for reconciliation
      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          income_approach: {
            // Python RICS Engine result as primary
            value: finalValue,
            confidence: finalConfidence,
            confidence_level: pythonResult?.confidence_level ?? 'medium',
            value_range: pythonResult?.value_range ?? { low: finalValue * 0.9, high: finalValue * 1.1 },
            details: pythonResult?.details ?? {
              gross_annual_income: potentialGrossIncome,
              expense_ratio: operatingExpenseRatio / 100,
              net_operating_income: netOperatingIncome,
              cap_rate_pct: capRate,
            },
            assumptions: pythonResult?.assumptions ?? [],
            limitations: pythonResult?.limitations ?? [],
            calculated_by: pythonResult ? 'python_rics_engine' : 'frontend_fallback',
            // Individual method values and confidences for reconciliation
            directCapValue: directCapValue,
            directCapConfidence: directCapConfidence,
            directCapWeight: Math.round(directCapWeight * 100),
            dcfValue: dcfValue,
            dcfConfidence: dcfConfidence,
            dcfWeight: Math.round(dcfWeight * 100),
            dcfVariance: directCapValue > 0 ? Math.abs((dcfValue - directCapValue) / directCapValue * 100) : 0,
            primaryMethod: incomeMethod,
            noi: netOperatingIncome,
            capRate,
            discountRate,
            // Phase 5.5: Track rent source for disclosure
            rentSource: rentSource,
            rentConfidence: rentEstimateConfidence,
            rentMethodology: rentEstimateMethodology,
            rentalComparablesUsed: rentalComparables.length,
          },
        },
        current_step: 7,
      })

      // Navigate to next step based on selected methods
      const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
      const hasDRC = selectedMethods.includes('drc_method')
      const hasProfits = selectedMethods.includes('profits_method')
      const hasResidual = selectedMethods.includes('residual_method')
      
      if (hasDRC) {
        router.push(`/dashboard/valuations/${valuationId}/drc`)
      } else if (hasProfits) {
        router.push(`/dashboard/valuations/${valuationId}/profits`)
      } else if (hasResidual) {
        router.push(`/dashboard/valuations/${valuationId}/residual`)
      } else {
        router.push(`/dashboard/valuations/${valuationId}/reconciliation`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }
  
  // Determine back navigation path - always goes to rental-market now
  const getBackPath = () => {
    // Income approach always comes from rental-market page
    return `/dashboard/valuations/${valuationId}/rental-market`
  }
  
  const getBackLabel = () => {
    return '← BACK TO RENTAL MARKET'
  }

  // Property reference data
  const property = valuation?.property as any

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading income approach...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={getBackPath()}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">INCOME APPROACH</h1>
              <span className="px-2 py-0.5 bg-green-900/50 text-green-400 font-mono text-[10px]">
                STEP 6
              </span>
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              Capitalize net operating income to derive market value
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MethodBadge method="income" isPrimary={valuation?.primary_method === 'income_approach'} />
        </div>
      </div>

      {error && <div className="mb-4"><AlertBanner type="error" title="Error" message={error} /></div>}

      {/* Subject Property Reference */}
      <TerminalPanel title="SUBJECT PROPERTY REFERENCE">
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-2">
            <div className="font-mono text-[10px] text-zinc-500 mb-1">ADDRESS</div>
            <div className="font-mono text-sm text-white">{property?.address || (valuation as any)?.property_address || 'N/A'}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-zinc-500 mb-1">TYPE</div>
            <PropertyTypeBadge type={property?.property_type || 'residential'} />
          </div>
          <div>
            <div className="font-mono text-[10px] text-zinc-500 mb-1">SIZE</div>
            <div className="font-mono text-sm text-white flex items-center gap-1">
              <Ruler className="w-3 h-3 text-zinc-500" />
              {property?.builtArea || property?.grossFloorArea || property?.gfa_sqm || 'N/A'} sqm
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-zinc-500 mb-1">BEDROOMS</div>
            <div className="font-mono text-sm text-white flex items-center gap-1">
              <Bed className="w-3 h-3 text-zinc-500" />
              {property?.bedrooms || 'N/A'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] text-zinc-500 mb-1">BATHROOMS</div>
            <div className="font-mono text-sm text-white flex items-center gap-1">
              <Bath className="w-3 h-3 text-zinc-500" />
              {property?.bathrooms || 'N/A'}
            </div>
          </div>
        </div>
      </TerminalPanel>

      {/* Method Selection */}
      <div className="flex gap-2 mb-4 mt-4">
        <button
          onClick={() => setIncomeMethod('direct_cap')}
          className={`px-4 py-2 font-mono text-xs transition-colors ${
            incomeMethod === 'direct_cap'
              ? 'bg-amber-500 text-black font-bold'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          DIRECT CAPITALIZATION
        </button>
        <button
          onClick={() => setIncomeMethod('dcf')}
          className={`px-4 py-2 font-mono text-xs transition-colors ${
            incomeMethod === 'dcf'
              ? 'bg-amber-500 text-black font-bold'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          DCF ANALYSIS
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left Column - Income */}
        <div className="col-span-2 space-y-4">
          {/* Rental Market Analysis Summary (replaces embedded panel - now a separate page) */}
          {(valuation as any)?.rental_market_analysis && (
            <TerminalPanel title="RENTAL MARKET ANALYSIS">
              <div className="p-3 border border-green-800/50 bg-green-900/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="font-mono text-sm text-green-400">MARKET RENT ANALYSIS COMPLETE</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                          INDICATED RENT
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                                <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.indicatedRent}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="font-mono text-lg text-amber-400">
                          ₵{Math.round((valuation as any).rental_market_analysis.indicated_rent_monthly || 0).toLocaleString()}
                          <span className="text-[10px] text-zinc-500 ml-1">/month</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                          RENT PER SQM
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                                <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.rentPerSqm}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="font-mono text-lg text-white">
                          ₵{((valuation as any).rental_market_analysis.indicated_rent_per_sqm || 0).toFixed(2)}
                          <span className="text-[10px] text-zinc-500 ml-1">/sqm/mo</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                          CONFIDENCE
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                                <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.confidence}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className={`font-mono text-lg ${
                          (valuation as any).rental_market_analysis.confidence >= 80 ? 'text-green-400' :
                          (valuation as any).rental_market_analysis.confidence >= 60 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {(valuation as any).rental_market_analysis.confidence}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 font-mono text-[10px] text-zinc-500">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dotted border-zinc-600">
                              Based on {(valuation as any).rental_market_analysis.comparables_count} comparables
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                            <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.comparablesMethod}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>Method: {((valuation as any).rental_market_analysis.methodology || '').replace('_', ' ').toUpperCase()}</span>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/valuations/${valuationId}/rental-market`}
                    className="px-3 py-2 bg-zinc-800 text-zinc-300 font-mono text-xs hover:bg-zinc-700 transition-colors"
                  >
                    EDIT ANALYSIS →
                  </Link>
                </div>
              </div>
            </TerminalPanel>
          )}
          
          {/* If no rental analysis yet, show prompt to go to rental-market page */}
          {!(valuation as any)?.rental_market_analysis && (
            <TerminalPanel title="RENTAL MARKET ANALYSIS">
              <div className="p-4 border border-amber-800/50 bg-amber-900/10 text-center">
                <div className="font-mono text-sm text-amber-400 mb-2">RENTAL ANALYSIS NOT YET COMPLETED</div>
                <p className="font-mono text-xs text-zinc-500 mb-3">
                  Analyze rental comparables to estimate market rent for this property
                </p>
                <Link
                  href={`/dashboard/valuations/${valuationId}/rental-market`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors"
                >
                  GO TO RENTAL MARKET ANALYSIS
                </Link>
              </div>
            </TerminalPanel>
          )}
          
          {/* Income Sources */}
          <TerminalPanel title="INCOME SOURCES">
            {/* Rent Input Mode Toggle - always show, but indicate if system rent unavailable */}
            <div className="flex items-center justify-between mb-4 p-3 border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-zinc-500">PRIMARY RENT INPUT MODE:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setRentMode('system')
                      // Reset to system rent when switching to system mode (if available)
                      if (systemRent !== null && systemRent > 0 && incomeSources.length > 0) {
                        setIncomeSources(prev => prev.map((s, i) => 
                          i === 0 ? { ...s, monthlyRent: Math.round(systemRent), annualIncome: Math.round(systemRent * 12 * (s.occupancyRate / 100)) } : s
                        ))
                        setRentSource('market')
                      }
                    }}
                    className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                      rentMode === 'system'
                        ? 'bg-green-500/20 border-green-500 text-green-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    ◉ System-Estimated {rentMode === 'system' && <span className="ml-1">🔒</span>}
                  </button>
                  <button
                    onClick={() => {
                      setRentMode('user')
                      setRentSource('manual')
                    }}
                    className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                      rentMode === 'user'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    ◯ User-Entered
                  </button>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                      <p className="font-mono text-xs mb-2">
                        <strong className="text-amber-500">Rent Input Mode</strong>
                      </p>
                      <p className="text-[10px] text-zinc-400 mb-2">
                        Choose how rental income is determined for the primary unit.
                      </p>
                      <p className="text-[10px] text-zinc-400 mb-1">
                        <strong className="text-green-400">System-Estimated:</strong> {INCOME_TOOLTIPS.systemEstimated}
                      </p>
                      <p className="text-[10px] text-zinc-400 mb-2">
                        <strong className="text-amber-400">User-Entered:</strong> {INCOME_TOOLTIPS.userEntered}
                      </p>
                      <p className="text-[9px] text-zinc-500 italic">
                        ✓ RICS-compliant — professional judgment is explicitly preserved.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {rentMode === 'system' && systemRent !== null && systemRent > 0 && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-900/30 text-green-400 font-mono text-[9px]">
                    🔒 LOCKED • FROM RENTAL ANALYSIS • {rentEstimateMethodology?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              )}
              {rentMode === 'system' && (systemRent === null || systemRent <= 0) && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-900/30 text-red-400 font-mono text-[9px]">
                    ⚠ COMPLETE RENTAL ANALYSIS TO UNLOCK
                  </span>
                </div>
              )}
              {rentMode === 'user' && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-amber-900/30 text-amber-400 font-mono text-[9px]">
                    ✎ MANUAL OVERRIDE MODE
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end mb-3">
              <button
                onClick={addIncomeSource}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white"
              >
                <Plus className="w-3 h-3" /> ADD SOURCE
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2">DESCRIPTION</th>
                  <th className="text-center pb-2 w-20">UNITS</th>
                  <th className="text-center pb-2 w-40">
                    <div className="flex items-center justify-center gap-1">
                      MONTHLY RENT
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                            <p className="font-mono text-xs mb-2">
                              <strong className="text-amber-500">Monthly Rent (₵)</strong>
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {INCOME_TOOLTIPS.monthlyRent}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </th>
                  <th className="text-center pb-2 w-24">
                    <div className="flex items-center justify-center gap-1">
                      OCCUPANCY
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                            <p className="font-mono text-xs mb-2">
                              <strong className="text-amber-500">Occupancy (%)</strong>
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {INCOME_TOOLTIPS.occupancy}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </th>
                  <th className="text-right pb-2 w-32">ANNUAL</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {incomeSources.map((source, index) => (
                  <tr key={source.id} className="border-b border-zinc-800/50">
                    <td className="py-2">
                      <input
                        type="text"
                        value={source.description}
                        onChange={(e) => updateIncomeSource(source.id, 'description', e.target.value)}
                        placeholder="e.g., 3-Bed Apartment"
                        className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                      />
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="number"
                        value={source.units}
                        onChange={(e) => updateIncomeSource(source.id, 'units', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs text-center"
                        min="1"
                      />
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center">
                          <span className="font-mono text-xs text-zinc-500 mr-1">₵</span>
                          <input
                            type="number"
                            value={source.monthlyRent}
                            onChange={(e) => handleManualRentChange(source.id, parseFloat(e.target.value) || 0)}
                            disabled={index === 0 && rentMode === 'system'}
                            className={`w-full px-2 py-1 border text-white font-mono text-xs ${
                              index === 0 && rentMode === 'system' 
                                ? 'bg-zinc-900 border-green-700/50 text-green-400 cursor-not-allowed' 
                                : index === 0 && rentSource === 'market'
                                ? 'bg-black border-green-700'
                                : 'bg-black border-zinc-700'
                            }`}
                          />
                          {index === 0 && rentMode === 'system' && (
                            <span className="ml-1 text-green-500">🔒</span>
                          )}
                        </div>
                        {/* Show system estimate and variance when in user mode for primary */}
                        {index === 0 && rentMode === 'user' && systemRent !== null && systemRent > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] text-zinc-500">
                              System: ₵{systemRent.toLocaleString()}
                            </span>
                            {source.monthlyRent > 0 && (
                              <span className={`font-mono text-[9px] ${
                                Math.abs((source.monthlyRent - systemRent) / systemRent) > 0.2
                                  ? 'text-red-400'
                                  : 'text-green-400'
                              }`}>
                                {source.monthlyRent > systemRent ? '+' : ''}{Math.round(((source.monthlyRent - systemRent) / systemRent) * 100)}%
                              </span>
                            )}
                            {source.monthlyRent > 0 && Math.abs((source.monthlyRent - systemRent) / systemRent) > 0.2 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="w-3 h-3 text-red-400" />
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-red-900/90 border-red-500/50 text-red-200 p-2">
                                    <span className="text-[10px]">Variance exceeds ±20% from market analysis — justification required</span>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex items-center">
                        <input
                          type="number"
                          value={source.occupancyRate}
                          onChange={(e) => updateIncomeSource(source.id, 'occupancyRate', parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs text-center"
                          min="0"
                          max="100"
                        />
                        <span className="font-mono text-xs text-zinc-500 ml-1">%</span>
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-sm text-green-400">
                      ₵{source.annualIncome.toLocaleString()}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeIncomeSource(source.id)}
                        disabled={incomeSources.length <= 1}
                        className="text-zinc-500 hover:text-red-400 disabled:opacity-30"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Other Income */}
            <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                  PARKING INCOME (MONTHLY)
                </label>
                <div className="flex items-center">
                  <span className="font-mono text-xs text-zinc-500 mr-1">₵</span>
                  <input
                    type="number"
                    value={parkingIncome}
                    onChange={(e) => setParkingIncome(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                  OTHER INCOME (MONTHLY)
                </label>
                <div className="flex items-center">
                  <span className="font-mono text-xs text-zinc-500 mr-1">₵</span>
                  <input
                    type="number"
                    value={otherIncome}
                    onChange={(e) => setOtherIncome(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </TerminalPanel>

          {/* Vacancy and Expenses */}
          <div className="grid grid-cols-2 gap-4">
            {/* Vacancy */}
            <TerminalPanel title="VACANCY & COLLECTION LOSS">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                      VACANCY RATE
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                            <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.vacancyRate}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <span className="font-mono text-xs text-white">{vacancyRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="0.5"
                    value={vacancyRate}
                    onChange={(e) => setVacancyRate(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between font-mono text-[9px] text-zinc-600">
                    <span>Prime (3-5%)</span>
                    <span>Standard (5-8%)</span>
                    <span>Secondary (8-15%)</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                      COLLECTION LOSS
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                            <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.collectionLoss}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <span className="font-mono text-xs text-white">{collectionLoss}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={collectionLoss}
                    onChange={(e) => setCollectionLoss(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            </TerminalPanel>

            {/* Operating Expenses */}
            <TerminalPanel title={
              <div className="flex items-center gap-2">
                <span>OPERATING EXPENSES</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-amber-500/70 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                      <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.operatingExpenses}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            }>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                    MANAGEMENT (% EGI)
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                          <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.managementFee}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <input
                    type="number"
                    value={managementFee}
                    onChange={(e) => setManagementFee(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    MAINTENANCE (₵/yr)
                  </label>
                  <input
                    type="number"
                    value={maintenance}
                    onChange={(e) => setMaintenance(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    INSURANCE (₵/yr)
                  </label>
                  <input
                    type="number"
                    value={insurance}
                    onChange={(e) => setInsurance(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    PROPERTY TAX (₵/yr)
                  </label>
                  <input
                    type="number"
                    value={propertyTax}
                    onChange={(e) => setPropertyTax(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                    UTILITIES (₵/yr)
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                          <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.utilities}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <input
                    type="number"
                    value={utilities}
                    onChange={(e) => setUtilities(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                    SECURITY (₵/yr)
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                          <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.utilities}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <input
                    type="number"
                    value={security}
                    onChange={(e) => setSecurity(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <div className="flex justify-between text-xs font-mono items-center">
                  <span className="text-zinc-500 flex items-center gap-1">
                    Expense Ratio
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                          <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.expenseRatio}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                  <span className={`${operatingExpenseRatio > 45 ? 'text-red-400' : 'text-white'}`}>
                    {operatingExpenseRatio.toFixed(1)}%
                  </span>
                </div>
              </div>
            </TerminalPanel>
          </div>

          {/* Capitalization Inputs */}
          <TerminalPanel title={incomeMethod === 'direct_cap' ? 'CAPITALIZATION RATE' : 'DCF PARAMETERS'}>
            {incomeMethod === 'direct_cap' ? (
              <div className="space-y-4">
                {/* Cap Rate Mode Toggle */}
                <div className="flex items-center justify-between p-3 border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-zinc-500">CAP RATE INPUT MODE:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setCapRateMode('system')
                          if (systemCapRate !== null) {
                            setCapRate(systemCapRate)
                          }
                        }}
                        className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                          capRateMode === 'system'
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        ◉ System-Calculated {capRateMode === 'system' && <span className="ml-1">🔒</span>}
                      </button>
                      <button
                        onClick={() => setCapRateMode('user')}
                        className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                          capRateMode === 'user'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        ◯ User-Entered
                      </button>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-md bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                          <p className="font-mono text-xs mb-2">
                            <strong className="text-amber-500">Cap Rate Input Mode</strong>
                          </p>
                          <p className="text-[10px] text-zinc-400 mb-2">
                            {INCOME_TOOLTIPS.capRateSystemMode}
                          </p>
                          <p className="text-[10px] text-zinc-400 mb-1">
                            <strong className="text-green-400">System-Calculated:</strong> {INCOME_TOOLTIPS.capRateSystemMode}
                          </p>
                          <p className="text-[10px] text-zinc-400 mb-2">
                            <strong className="text-amber-400">User-Entered:</strong> {INCOME_TOOLTIPS.capRateUserMode}
                          </p>
                          <p className="text-[9px] text-zinc-500 italic">
                            Per RICS guidance, cap rates should be supported by market evidence where available.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Cap Rate Display with Grade Badge */}
                <div className="p-4 border border-zinc-800 bg-black/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <label className="font-mono text-[10px] text-zinc-500">CAP RATE</label>
                      {capRateMode === 'system' && capRateGrade && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`px-2 py-0.5 font-mono text-[10px] font-bold border cursor-help ${
                                capRateGrade === 'A' 
                                  ? 'bg-green-500/20 border-green-500 text-green-400'
                                  : capRateGrade === 'B'
                                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                    : 'bg-red-500/20 border-red-500 text-red-400'
                              }`}>
                                GRADE {capRateGrade}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-md bg-zinc-900 border border-amber-500/30 text-zinc-200 p-4">
                              <p className="font-mono text-sm mb-3">
                                <strong className={`${
                                  capRateGrade === 'A' ? 'text-green-400' 
                                    : capRateGrade === 'B' ? 'text-amber-400' 
                                    : 'text-red-400'
                                }`}>
                                  RICS Evidence Category {capRateGrade}
                                </strong>
                              </p>
                              
                              {/* Category Explanation */}
                              <div className="space-y-2 mb-3">
                                <div className={`p-2 border ${capRateGrade === 'A' ? 'border-green-500/50 bg-green-500/10' : 'border-zinc-700 bg-zinc-800/50'}`}>
                                  <p className="text-[10px] font-mono">
                                    <span className="text-green-400 font-bold">Category A:</span>{' '}
                                    <span className="text-zinc-400">Transactions & Bank Data</span>
                                  </p>
                                  <p className="text-[9px] text-zinc-500 mt-1">{INCOME_TOOLTIPS.capRateGradeA}</p>
                                </div>
                                <div className={`p-2 border ${capRateGrade === 'B' ? 'border-amber-500/50 bg-amber-500/10' : 'border-zinc-700 bg-zinc-800/50'}`}>
                                  <p className="text-[10px] font-mono">
                                    <span className="text-amber-400 font-bold">Category B:</span>{' '}
                                    <span className="text-zinc-400">Listing-Derived</span>
                                  </p>
                                  <p className="text-[9px] text-zinc-500 mt-1">{INCOME_TOOLTIPS.capRateGradeB}</p>
                                </div>
                                <div className={`p-2 border ${capRateGrade === 'C' ? 'border-red-500/50 bg-red-500/10' : 'border-zinc-700 bg-zinc-800/50'}`}>
                                  <p className="text-[10px] font-mono">
                                    <span className="text-red-400 font-bold">Category C:</span>{' '}
                                    <span className="text-zinc-400">Surveys & Defaults</span>
                                  </p>
                                  <p className="text-[9px] text-zinc-500 mt-1">{INCOME_TOOLTIPS.capRateGradeC}</p>
                                </div>
                              </div>

                              {/* Current Methodology Details */}
                              {capRateMethodology && (
                                <div className="border-t border-zinc-700 pt-3 mt-3">
                                  <p className="font-mono text-[10px] text-zinc-400 mb-2">
                                    <strong className="text-white">Current Analysis:</strong>
                                  </p>
                                  <div className="space-y-1 text-[9px] text-zinc-500">
                                    <p><span className="text-zinc-400">Method:</span> {capRateMethodology.methodology}</p>
                                    <p><span className="text-zinc-400">Evidence Count:</span> {capRateMethodology.evidenceCount} records</p>
                                    <p><span className="text-zinc-400">Data Quality:</span> {capRateMethodology.dataQuality}</p>
                                    <p className="mt-2 text-zinc-400 italic">{capRateMethodology.justification}</p>
                                    {capRateMethodology.warnings.length > 0 && (
                                      <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30">
                                        <p className="text-amber-400 font-bold mb-1">⚠ Warnings:</p>
                                        {capRateMethodology.warnings.map((w, i) => (
                                          <p key={i} className="text-amber-300/80">• {w}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {capRateLoading && (
                        <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                      )}
                    </div>
                    <span className="font-mono text-2xl text-amber-400 font-bold">{capRate.toFixed(2)}%</span>
                  </div>

                  {/* Cap Rate Input - System shows locked display, User shows editable */}
                  {capRateMode === 'system' ? (
                    <div className="space-y-2">
                      {/* Locked system rate display */}
                      <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-[10px]">
                        <span>🔒 LOCKED • FROM RENTAL ANALYSIS + QUALITY WEIGHTED</span>
                      </div>
                      {/* Range indicator */}
                      <div className="relative h-2 bg-zinc-800 rounded">
                        <div 
                          className="absolute h-full bg-gradient-to-r from-green-500/50 to-amber-500/50 rounded"
                          style={{ 
                            left: `${Math.max(0, ((capRate - 4) / 14) * 100 - 5)}%`,
                            width: '10%' 
                          }}
                        />
                        <div 
                          className="absolute h-4 w-1 bg-amber-400 -top-1 rounded"
                          style={{ left: `${((capRate - 4) / 14) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between font-mono text-[9px] text-zinc-600">
                        <span>4%</span>
                        <span>Residential (6-10%)</span>
                        <span>Commercial (8-14%)</span>
                        <span>18%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Editable user input */}
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          max="25"
                          step="0.25"
                          value={capRate}
                          onChange={(e) => setCapRate(parseFloat(e.target.value) || 8)}
                          className="w-24 px-3 py-2 bg-black border border-amber-500/50 text-amber-400 font-mono text-lg text-center focus:border-amber-400 focus:outline-none"
                        />
                        <span className="font-mono text-zinc-500 text-sm">%</span>
                        <input
                          type="range"
                          min="4"
                          max="18"
                          step="0.25"
                          value={capRate}
                          onChange={(e) => setCapRate(parseFloat(e.target.value))}
                          className="flex-1 accent-amber-500"
                        />
                      </div>
                      <div className="flex justify-between font-mono text-[9px] text-zinc-600">
                        <span>Residential (6-10%)</span>
                        <span>Commercial (8-14%)</span>
                        <span>Industrial (10-16%)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Discount Rate Mode Toggle */}
                <div className="flex items-center justify-between p-3 border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-zinc-500">DISCOUNT RATE MODE:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setDiscountRateMode('system')
                          if (systemDiscountRate !== null) {
                            setDiscountRate(systemDiscountRate)
                          } else {
                            const { rate } = calculateDiscountRate(discountRateMethod)
                            setDiscountRate(rate)
                          }
                        }}
                        className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                          discountRateMode === 'system'
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        ◉ System-Calculated {discountRateMode === 'system' && <span className="ml-1">🔒</span>}
                      </button>
                      <button
                        onClick={() => setDiscountRateMode('user')}
                        className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                          discountRateMode === 'user'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        ◯ User-Entered
                      </button>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-md bg-zinc-900 border border-amber-500/30 text-zinc-200 p-3">
                          <p className="font-mono text-xs mb-2">
                            <strong className="text-amber-500">Discount Rate Mode</strong>
                          </p>
                          <p className="text-[10px] text-zinc-400 mb-2">
                            Choose how the discount rate is determined for DCF analysis.
                          </p>
                          <p className="text-[10px] text-zinc-400 mb-1">
                            <strong className="text-green-400">System-Calculated:</strong> Derived from Bank of Ghana economic data plus risk premiums based on property type.
                          </p>
                          <p className="text-[10px] text-zinc-400 mb-2">
                            <strong className="text-amber-400">User-Entered:</strong> Manual override based on specific investor requirements or market knowledge.
                          </p>
                          <p className="text-[9px] text-zinc-500 italic">
                            Per RICS guidance, discount rates should reflect market conditions and property-specific risks.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="font-mono text-lg text-amber-400">{discountRate.toFixed(2)}%</span>
                </div>

                {/* Method Selection (only in system mode) */}
                {discountRateMode === 'system' && (
                  <div className="p-3 border border-zinc-800 bg-zinc-900/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-[10px] text-zinc-500">CALCULATION METHOD:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDiscountMethodChange('buildup')}
                          className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                            discountRateMethod === 'buildup'
                              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                          }`}
                        >
                          Build-Up Method
                        </button>
                        <button
                          onClick={() => handleDiscountMethodChange('wacc')}
                          className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                            discountRateMethod === 'wacc'
                              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                          }`}
                        >
                          WACC Method
                        </button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 text-cyan-500 cursor-help ml-1" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-lg bg-zinc-900 border border-cyan-500/30 text-zinc-200 p-3">
                              <p className="font-mono text-xs mb-2">
                                <strong className="text-cyan-500">Discount Rate Calculation Methods</strong>
                              </p>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] text-cyan-400 font-bold mb-1">Build-Up Method:</p>
                                  <p className="text-[10px] text-zinc-400">
                                    Discount Rate = Risk-Free Rate + Illiquidity Premium + Property Risk Premium
                                  </p>
                                  <p className="text-[9px] text-zinc-500 mt-1">
                                    • Risk-Free: BOG Policy Rate ({economicData.policyRate ?? 27}%)<br/>
                                    • Illiquidity: +{currentPremiums.illiquidity}% (real estate vs liquid assets)<br/>
                                    • Property Risk: +{currentPremiums.propertyRisk}% (based on {currentPremiums.label} type)
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-amber-400 font-bold mb-1">WACC Method:</p>
                                  <p className="text-[10px] text-zinc-400">
                                    Weighted Average Cost of Capital = (Cost of Debt × Debt %) + (Cost of Equity × Equity %)
                                  </p>
                                  <p className="text-[9px] text-zinc-500 mt-1">
                                    • Cost of Debt: Mortgage Rate ({economicData.mortgageRate ?? 32}%) × 60%<br/>
                                    • Cost of Equity: Mortgage Rate + Equity Premium + Property Risk × 40%
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    
                    {/* Rate Breakdown */}
                    <div className="bg-black/50 p-2 border border-zinc-800">
                      <div className="font-mono text-[9px] text-zinc-500 mb-2">RATE BREAKDOWN:</div>
                      {discountRateCalc.breakdown.map((item, idx) => (
                        <div key={idx} className="flex justify-between font-mono text-[10px] py-0.5">
                          <span className="text-zinc-400">{item.label}</span>
                          <span className="text-zinc-300">{item.value.toFixed(2)}%</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-mono text-xs pt-1 mt-1 border-t border-zinc-700">
                        <span className="text-amber-500 font-bold">Total Discount Rate</span>
                        <span className="text-amber-400 font-bold">{discountRateCalc.rate.toFixed(2)}%</span>
                      </div>
                      {economicData.lastUpdated && (
                        <div className="font-mono text-[8px] text-zinc-600 mt-2">
                          Economic data as of: {new Date(economicData.lastUpdated).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* User manual input (only in user mode) */}
                {discountRateMode === 'user' && (
                  <div className="p-3 border border-amber-500/30 bg-amber-900/10">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="font-mono text-[10px] text-amber-400">Manual Override - Requires Justification</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                          DISCOUNT RATE (%)
                        </label>
                        <input
                          type="number"
                          value={discountRate}
                          onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-black border border-amber-500/50 text-white font-mono text-sm"
                          step="0.25"
                          min="5"
                          max="50"
                        />
                      </div>
                      <div className="text-[9px] text-zinc-500 max-w-xs">
                        System-calculated rate: <span className="text-green-400">{systemDiscountRate?.toFixed(2) ?? 'N/A'}%</span>
                        <br/>Deviation: <span className={Math.abs(discountRate - (systemDiscountRate ?? discountRate)) > 5 ? 'text-red-400' : 'text-zinc-400'}>
                          {systemDiscountRate ? `${((discountRate - systemDiscountRate) >= 0 ? '+' : '')}${(discountRate - systemDiscountRate).toFixed(2)}%` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Other DCF Parameters */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                      HOLDING PERIOD (YRS)
                    </label>
                    <input
                      type="number"
                      value={holdingPeriod}
                      onChange={(e) => setHoldingPeriod(parseInt(e.target.value) || 10)}
                      className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-sm"
                      min="1"
                      max="30"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                      TERMINAL CAP (%)
                    </label>
                    <input
                      type="number"
                      value={terminalCapRate}
                      onChange={(e) => setTerminalCapRate(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-sm"
                      step="0.25"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                      RENT GROWTH (%)
                    </label>
                    <input
                      type="number"
                      value={rentGrowth}
                      onChange={(e) => setRentGrowth(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-sm"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>
            )}
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Income Pro Forma */}
          <TerminalPanel title="INCOME PRO FORMA">
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1">
                  Potential Gross Income
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.potentialGrossIncome}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-white">₵{potentialGrossIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>− Vacancy ({vacancyRate}%)</span>
                <span>(₵{Math.round(vacancyLoss).toLocaleString()})</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>− Collection Loss ({collectionLoss}%)</span>
                <span>(₵{Math.round(collectionLossAmount).toLocaleString()})</span>
              </div>
              <div className="flex justify-between items-center border-t border-zinc-800 pt-2">
                <span className="text-zinc-400 flex items-center gap-1">
                  Effective Gross Income
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.effectiveGrossIncome}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-white font-bold">₵{Math.round(effectiveGrossIncome).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>− Operating Expenses</span>
                <span>(₵{Math.round(totalOperatingExpenses).toLocaleString()})</span>
              </div>
              <div className="flex justify-between items-center border-t-2 border-zinc-700 pt-2">
                <span className="text-zinc-300 flex items-center gap-1">
                  Net Operating Income
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.netOperatingIncome}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-green-400 font-bold text-base">₵{Math.round(netOperatingIncome).toLocaleString()}</span>
              </div>
            </div>
          </TerminalPanel>

          {/* Value Summary */}
          <TerminalPanel title="VALUE INDICATION">
            {incomeMethod === 'direct_cap' ? (
              <div className="space-y-3">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-zinc-500">NOI</span>
                  <span className="text-white">₵{Math.round(netOperatingIncome).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-zinc-500">÷ Cap Rate</span>
                  <span className="text-white">{capRate}%</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-zinc-500">PV of Cash Flows</span>
                  <span className="text-white">₵{Math.round(dcfValue * 0.6).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-zinc-500">PV of Terminal</span>
                  <span className="text-white">₵{Math.round(dcfValue * 0.4).toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t-2 border-zinc-700">
              <div className="text-center p-4 bg-green-900/20 border border-green-800">
                <div className="font-mono text-[10px] text-green-400 mb-1 flex items-center justify-center gap-1">
                  INDICATED VALUE ({incomeMethod === 'direct_cap' ? 'DIRECT CAP' : 'DCF'})
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-green-400/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-sm bg-zinc-900 border border-green-500/30 text-zinc-200 p-3">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.indicatedValue}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="font-mono text-3xl text-green-400 font-bold">
                  ₵{Math.round(indicatedValue).toLocaleString()}
                </div>
                <div className="mt-2 text-[9px] text-zinc-500 leading-tight">
                  Per GhIS and RICS IVS 105, the Income Approach derives value from 
                  the capitalization of actual or anticipated income streams.
                </div>
              </div>
            </div>

            {incomeMethod === 'direct_cap' && dcfValue > 0 && (
              <div className="mt-3 p-3 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                  DCF CROSS-CHECK
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.dcfCrossCheck}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="font-mono text-lg text-zinc-400">₵{Math.round(dcfValue).toLocaleString()}</div>
                <div className="flex items-center justify-center gap-1">
                  <span className={`font-mono text-[10px] ${
                    Math.abs(dcfValue - directCapValue) / directCapValue < 0.1 
                      ? 'text-green-400' 
                      : 'text-amber-400'
                  }`}>
                    {((dcfValue - directCapValue) / directCapValue * 100).toFixed(1)}% variance
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.dcfVariance}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1">
                  CONFIDENCE
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">
                          Per RICS Valuation Standards, confidence levels should be disclosed 
                          in valuation reports. Factors: rental data quality, expense verification, 
                          cap rate support, and market activity.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <ConfidenceBar score={calculateConfidence() * 100} />
              </div>
            </div>
          </TerminalPanel>

          {/* Metrics */}
          <TerminalPanel title="KEY METRICS">
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1">
                  Gross Rent Multiplier
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.grossRentMultiplier}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-white">
                  {potentialGrossIncome > 0 ? (indicatedValue / potentialGrossIncome).toFixed(2) : '—'}x
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1">
                  Net Rent Multiplier
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.netRentMultiplier}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-white">
                  {netOperatingIncome > 0 ? (indicatedValue / netOperatingIncome).toFixed(2) : '—'}x
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1">
                  Break-Even Ratio
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-2.5 h-2.5 text-amber-500/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs bg-zinc-900 border border-amber-500/30 text-zinc-200 p-2">
                        <p className="text-[10px] text-zinc-400">{INCOME_TOOLTIPS.breakEvenRatio}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-white">
                  {potentialGrossIncome > 0 
                    ? ((totalOperatingExpenses / potentialGrossIncome) * 100).toFixed(1) 
                    : '—'}%
                </span>
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      {/* Global Compliance Footer */}
      <div className="mt-8 p-4 bg-zinc-900/50 border border-zinc-700/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="w-1 h-full min-h-[40px] bg-amber-500/30 rounded-full flex-shrink-0" />
          <div>
            <h4 className="text-xs font-mono font-bold text-amber-500/80 mb-1.5 tracking-wide">VALUATION DISCLOSURE</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
              This income approach valuation is based on indicative rental assumptions and market-derived capitalization rates. 
              Results are subject to data availability, market volatility, and professional judgment. 
              Prepared in general alignment with RICS and GhIS valuation principles.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={getBackPath()}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          {getBackLabel()}
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          SAVE & CONTINUE TO RECONCILIATION →
        </button>
      </div>
    </div>
  )
}
