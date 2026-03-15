'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  AlertBanner,
  MethodBadge,
  Currency,
  ConfidenceBar,
  StepIndicator,
} from '@/components/ui/terminal'
import { valuationsApi, reconciliationApi, sensitivityApi, costApproachApi, comparablesApi } from '@/lib/valuation-api'
import type { Valuation, MethodResult, Reconciliation } from '@/types/valuation'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Scale,
  Info,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Lock,
  Unlock,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export default function ReconciliationPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Method results from valuation
  const [methodResults, setMethodResults] = useState<Record<string, MethodResult>>({})

  // Reconciliation weights
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [reconciliationNotes, setReconciliationNotes] = useState('')
  const [adjustmentRationale, setAdjustmentRationale] = useState('')
  const [reconciliationId, setReconciliationId] = useState<string | null>(null)

  // Sensitivity analysis
  const [showSensitivity, setShowSensitivity] = useState(true) // Auto-load sensitivity
  const [sensitivityRange, setSensitivityRange] = useState(10) // +/- percentage
  type SensitivityDriverType = 
    // Cost approach drivers
    | 'construction_cost' | 'land_value' | 'depreciation'
    // Sales comparison drivers
    | 'price_per_sqm' | 'comparable_adjustments'
    // Income approach drivers
    | 'rental_rate' | 'cap_rate' | 'vacancy_rate'
    // Residual/DRC drivers
    | 'gdv' | 'replacement_cost'
  const [sensitivityDriver, setSensitivityDriver] = useState<SensitivityDriverType>('construction_cost')

  // Weight locking and governance
  const [lockedWeights, setLockedWeights] = useState<Record<string, boolean>>({})
  const [weightJustifications, setWeightJustifications] = useState<Record<string, string>>({})
  
  // Finalization safeguards
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const [showNarrativePreview, setShowNarrativePreview] = useState(false)
  
  // Comparable basket data for disclosure generation (RICS/GhIS compliance)
  const [comparableBasket, setComparableBasket] = useState<{
    comparablesCount: number;
    verifiedSaleCount: number;
    askingPriceCount: number;
    avgListingAdjustment: number;
  } | null>(null)

  // Fetch valuation data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const valuationRes = await valuationsApi.getById(valuationId)
        if (valuationRes.error) throw new Error(valuationRes.error)
        if (!valuationRes.data) throw new Error('Valuation not found')

        setValuation(valuationRes.data as Valuation)

        // Get method results - check both camelCase and snake_case, and normalize structure
        const rawResults = valuationRes.data.methodResults || valuationRes.data.method_results || {}
        
        // Normalize method results to expected format
        const normalizedResults: Record<string, MethodResult> = {}
        
        // Handle both array and object formats
        if (Array.isArray(rawResults)) {
          rawResults.forEach((result: any) => {
            const method = result.method || 'unknown'
            normalizedResults[method] = {
              method: method,
              value_ghs: Number(result.value_ghs || result.value || 0),
              confidence_score: Number(result.confidence_score || result.confidence || 0.5),
              weight: result.weight || 0,
              is_primary: result.is_primary || false,
              notes: result.notes || '',
              calculated_at: result.calculated_at || new Date().toISOString(),
            }
          })
        } else if (typeof rawResults === 'object') {
          // Methods that are intermediate steps, not standalone valuation methods
          const nonValuationMethods = ['rental_market', 'rental_market_analysis', 'land_value']

          Object.entries(rawResults).forEach(([method, result]: [string, any]) => {
            // Skip intermediate/non-valuation methods
            if (nonValuationMethods.includes(method)) return

            // Map method keys to display names
            const methodKey = method === 'cost' ? 'cost_approach' :
                             method === 'market' || method === 'sales' ? 'sales_comparison' :
                             method === 'income' ? 'income_approach' : method

            normalizedResults[methodKey] = {
              method: methodKey as any,
              value_ghs: Number(result.value_ghs || result.value || result.indicatedValue || 0),
              confidence_score: Number(result.confidence_score || result.confidence || 0.5),
              weight: result.weight || 0,
              is_primary: result.is_primary || false,
              notes: result.notes || '',
              calculated_at: result.calculated_at || new Date().toISOString(),
            }
          })
        }

        if (Object.keys(normalizedResults).length > 0) {
          setMethodResults(normalizedResults)
          // Initialize weights from valuation or equal distribution
          const methods = Object.keys(normalizedResults)
          if (valuationRes.data.methodWeights || valuationRes.data.method_weights) {
            setWeights(valuationRes.data.methodWeights || valuationRes.data.method_weights)
          } else {
            const equalWeight = Math.floor(100 / methods.length)
            const initialWeights: Record<string, number> = {}
            methods.forEach(m => { initialWeights[m] = equalWeight })
            setWeights(initialWeights)
          }
        } else {
          // Fallback: Fetch method results directly from individual method endpoints
          // if method_results is empty (legacy data or incomplete save)
          const fallbackResults: Record<string, MethodResult> = {}
          
          try {
            // Try to fetch cost approach data
            const costRes = await costApproachApi.getByValuation(valuationId)
            if (costRes.success && costRes.data?.indicated_value) {
              fallbackResults['cost_approach'] = {
                method: 'cost_approach',
                value_ghs: costRes.data.indicated_value,
                confidence_score: 0.75, // Default confidence for cost approach
                weight: 0,
                is_primary: false,
                notes: 'Retrieved from cost approach data',
                calculated_at: (costRes.data as any).updated_at || new Date().toISOString(),
              }
            }
          } catch (e) {
            console.log('No cost approach data found')
          }

          // Fetch sales comparison data from comparable basket
          try {
            const basketRes = await comparablesApi.getBasket(valuationId)
            if (basketRes.success && basketRes.data) {
              const basket = basketRes.data
              // Calculate indicated value from basket comparables if not directly available
              let indicatedValue = 0
              let confidence = 0.70
              
              // Track evidence types for disclosure generation
              let verifiedCount = 0
              let askingCount = 0
              let totalListingAdj = 0
              
              if (basket.comparables && basket.comparables.length > 0) {
                // Use adjusted prices weighted average
                const adjustedComps = basket.comparables.filter((c: any) => c.adjustedPrice || c.adjusted_price || c.sale_price)
                if (adjustedComps.length > 0) {
                  const totalAdjustedValue = adjustedComps.reduce((sum: number, c: any) => {
                    return sum + (c.adjustedPrice || c.adjusted_price || c.sale_price || 0)
                  }, 0)
                  indicatedValue = totalAdjustedValue / adjustedComps.length
                  
                  // Calculate confidence based on number of comparables and adjustment variance
                  const adjustmentVariance = adjustedComps.reduce((sum: number, c: any) => {
                    return sum + Math.abs(c.totalAdjustment || 0)
                  }, 0) / adjustedComps.length
                  
                  confidence = Math.min(0.90, 0.50 + (adjustedComps.length * 0.08) - (adjustmentVariance / 100))
                  
                  // Count evidence types for RICS/GhIS disclosure
                  adjustedComps.forEach((c: any) => {
                    const evidenceType = c.evidence_type || 'asking_price'
                    if (evidenceType === 'verified_sale' || evidenceType === 'achieved_price') {
                      verifiedCount++
                    } else {
                      askingCount++
                      totalListingAdj += Math.abs(c.listing_adjustment || 12) // Default 12% adjustment
                    }
                  })
                }
              }
              
              // Check if basket has pre-calculated statistics
              if (basket.statistics?.avg_value) {
                indicatedValue = basket.statistics.avg_value
              }
              
              if (indicatedValue > 0) {
                fallbackResults['sales_comparison'] = {
                  method: 'sales_comparison',
                  value_ghs: indicatedValue,
                  confidence_score: confidence,
                  weight: 0,
                  is_primary: false,
                  notes: `Derived from ${basket.comparables?.length || 0} comparable properties (listing-based evidence)`,
                  calculated_at: basket.created_at || new Date().toISOString(),
                }
                
                // Store basket statistics for disclosure generation
                const totalComps = basket.comparables?.length || 0
                setComparableBasket({
                  comparablesCount: totalComps,
                  verifiedSaleCount: verifiedCount,
                  askingPriceCount: askingCount > 0 ? askingCount : totalComps, // Default all to asking if not specified
                  avgListingAdjustment: askingCount > 0 ? totalListingAdj / askingCount : 12,
                })
              }
            }
          } catch (e) {
            console.log('No sales comparison data found')
          }
          
          // TODO: Add income_approach fallback when implemented
          
          if (Object.keys(fallbackResults).length > 0) {
            setMethodResults(fallbackResults)
            const methods = Object.keys(fallbackResults)
            const equalWeight = Math.floor(100 / methods.length)
            const initialWeights: Record<string, number> = {}
            methods.forEach(m => { initialWeights[m] = equalWeight })
            setWeights(initialWeights)
          }
        }

        // Fetch existing reconciliation
        const reconRes = await reconciliationApi.getByValuation(valuationId)
        if (reconRes.data) {
          setReconciliationId(reconRes.data.id)
          if (reconRes.data.weights) setWeights(reconRes.data.weights)
          if (reconRes.data.reconciliation_narrative) setReconciliationNotes(reconRes.data.reconciliation_narrative)
          if (reconRes.data.special_assumptions && Array.isArray(reconRes.data.special_assumptions)) {
            setAdjustmentRationale(reconRes.data.special_assumptions.join('\n'))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load valuation')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

  // Calculate reconciled value
  const reconciledValue = useMemo(() => {
    if (Object.keys(methodResults).length === 0) return 0

    let weightedSum = 0
    let totalWeight = 0

    Object.entries(methodResults).forEach(([method, result]) => {
      const weight = weights[method] || 0
      weightedSum += result.value_ghs * (weight / 100)
      totalWeight += weight
    })

    return totalWeight > 0 ? weightedSum : 0
  }, [methodResults, weights])

  // Calculate value range
  const valueRange = useMemo(() => {
    const values = Object.values(methodResults).map(r => r.value_ghs)
    if (values.length === 0) return { low: 0, high: 0, spread: 0, advisoryLow: 0, advisoryHigh: 0, showAdvisory: false }

    const low = Math.min(...values)
    const high = Math.max(...values)
    const spread = high > 0 ? ((high - low) / high) * 100 : 0
    
    // Calculate advisory band for single-method or low-confidence scenarios
    const avgConfidence = Object.values(methodResults).reduce((sum, r) => sum + (r.confidence_score || 0.5), 0) / values.length
    const showAdvisory = values.length === 1 && avgConfidence < 0.85
    const advisoryRange = avgConfidence < 0.7 ? 0.10 : 0.05 // ±10% for low confidence, ±5% otherwise
    const centerValue = values.length === 1 ? values[0] : (low + high) / 2
    const advisoryLow = centerValue * (1 - advisoryRange)
    const advisoryHigh = centerValue * (1 + advisoryRange)

    return { low, high, spread, advisoryLow, advisoryHigh, showAdvisory }
  }, [methodResults])

  // Calculate confidence score
  const confidenceScore = useMemo(() => {
    if (Object.keys(methodResults).length === 0) return 0

    let weightedConfidence = 0
    let totalWeight = 0

    Object.entries(methodResults).forEach(([method, result]) => {
      const weight = weights[method] || 0
      weightedConfidence += (result.confidence_score || 0.5) * weight
      totalWeight += weight
    })

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0
  }, [methodResults, weights])

  // Build available sensitivity drivers based on which methods are active
  const availableDrivers = useMemo(() => {
    const drivers: { value: SensitivityDriverType; label: string; method: string; tooltip: string }[] = []
    const methods = Object.keys(methodResults)

    if (methods.includes('cost_approach')) {
      drivers.push(
        { value: 'construction_cost', label: 'Construction Cost', method: 'cost_approach', tooltip: 'Shows how value changes if construction costs vary. Useful for new/recently built properties.' },
        { value: 'land_value', label: 'Land Value', method: 'cost_approach', tooltip: 'Shows impact of land value fluctuations. Important in markets with volatile land prices.' },
        { value: 'depreciation', label: 'Depreciation', method: 'cost_approach', tooltip: 'Shows effect of depreciation assumptions. Critical for older buildings.' },
      )
    }
    if (methods.includes('sales_comparison')) {
      drivers.push(
        { value: 'price_per_sqm', label: 'Price per SQM', method: 'sales_comparison', tooltip: 'Shows sensitivity to comparable price-per-square-metre adjustments. Key driver for market approach.' },
        { value: 'comparable_adjustments', label: 'Comparable Adjustments', method: 'sales_comparison', tooltip: 'Shows impact of overall adjustment factors applied to comparable sales evidence.' },
      )
    }
    if (methods.includes('income_approach')) {
      drivers.push(
        { value: 'rental_rate', label: 'Rental Rate', method: 'income_approach', tooltip: 'Shows sensitivity to rental income assumptions. Directly affects gross income calculations.' },
        { value: 'cap_rate', label: 'Capitalisation Rate', method: 'income_approach', tooltip: 'Shows impact of yield/cap rate changes. Inverse relationship — higher cap rate reduces value.' },
        { value: 'vacancy_rate', label: 'Vacancy Rate', method: 'income_approach', tooltip: 'Shows effect of vacancy allowance assumptions on effective gross income.' },
      )
    }
    if (methods.includes('residual')) {
      drivers.push(
        { value: 'gdv', label: 'Gross Development Value', method: 'residual', tooltip: 'Shows sensitivity to GDV assumptions. Key for development/residual valuations.' },
      )
    }
    if (methods.includes('drc')) {
      drivers.push(
        { value: 'replacement_cost', label: 'Replacement Cost', method: 'drc', tooltip: 'Shows impact of replacement cost assumptions on DRC valuation output.' },
      )
    }
    return drivers
  }, [methodResults])

  // Auto-select first available driver when methods change
  useEffect(() => {
    if (availableDrivers.length > 0 && !availableDrivers.find(d => d.value === sensitivityDriver)) {
      setSensitivityDriver(availableDrivers[0].value)
    }
  }, [availableDrivers, sensitivityDriver])

  // Sensitivity data - driver-aware with fixed 5 key points
  const sensitivityData = useMemo(() => {
    const costResult = methodResults['cost_approach'] as any
    const costWeight = (weights['cost_approach'] || 0) / 100
    const salesWeight = (weights['sales_comparison'] || 0) / 100
    const incomeWeight = (weights['income_approach'] || 0) / 100
    const residualWeight = (weights['residual'] || 0) / 100
    const drcWeight = (weights['drc'] || 0) / 100

    // Cost approach component ratios (relative to method value, weighted into reconciled value)
    const hasActualCostData = costResult?.construction_cost && costResult?.land_value
    const constructionCostRatio = hasActualCostData
      ? (costResult.construction_cost / reconciledValue)
      : 0.65 * costWeight
    const landValueRatio = hasActualCostData
      ? (costResult.land_value / reconciledValue)
      : 0.30 * costWeight
    const depreciationRatio = costResult?.total_depreciation_percent
      ? (costResult.total_depreciation_percent / 100)
      : 0.20

    // Fixed 5-point analysis: -max, -half, 0, +half, +max
    const percentages = [-sensitivityRange, -sensitivityRange/2, 0, sensitivityRange/2, sensitivityRange]

    return percentages.map(pct => {
      let adjustedValue: number
      let impactMultiplier: number

      switch (sensitivityDriver) {
        // --- Cost Approach Drivers ---
        case 'construction_cost':
          impactMultiplier = constructionCostRatio * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break
        case 'land_value':
          impactMultiplier = landValueRatio * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break
        case 'depreciation':
          // More depreciation → lower value
          impactMultiplier = -depreciationRatio * costWeight * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break

        // --- Sales Comparison Drivers ---
        case 'price_per_sqm':
          // Price per sqm change flows proportionally through the sales weight
          impactMultiplier = salesWeight * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break
        case 'comparable_adjustments':
          // Overall adjustment factor change — typically ~30% of the comparable value moves
          impactMultiplier = salesWeight * 0.3 * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break

        // --- Income Approach Drivers ---
        case 'rental_rate':
          // Rental rate directly affects gross income → proportional to income weight
          impactMultiplier = incomeWeight * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break
        case 'cap_rate':
          // Cap rate has inverse relationship: Value = NOI / Cap Rate
          // If cap rate goes up by x%, value goes down by approximately x% (1st order)
          impactMultiplier = -incomeWeight * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break
        case 'vacancy_rate':
          // Vacancy affects ~5-15% of gross income, weighted by income approach share
          impactMultiplier = -incomeWeight * 0.15 * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break

        // --- Residual / DRC Drivers ---
        case 'gdv':
          impactMultiplier = residualWeight * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break
        case 'replacement_cost':
          impactMultiplier = drcWeight * (pct / 100)
          adjustedValue = reconciledValue * (1 + impactMultiplier)
          break

        default:
          adjustedValue = reconciledValue * (1 + pct / 100)
          break
      }

      return {
        percentage: pct,
        value: adjustedValue,
        change: adjustedValue - reconciledValue,
        changePercent: ((adjustedValue - reconciledValue) / reconciledValue) * 100
      }
    })
  }, [reconciledValue, sensitivityRange, sensitivityDriver, methodResults, weights])

  // Auto-generated reconciliation narrative (RICS/GhIS compliant)
  const autoNarrative = useMemo(() => {
    if (Object.keys(methodResults).length === 0) return ''
    
    const methods = Object.keys(methodResults)
    const primaryMethod = valuation?.primary_method || methods[0]
    const methodCount = methods.length
    
    const methodNames: Record<string, string> = {
      'cost_approach': 'Cost Approach',
      'sales_comparison': 'Sales Comparison Approach',
      'income_approach': 'Income Capitalisation Approach'
    }
    
    const getMethodName = (m: string) => methodNames[m] || m.replace('_', ' ')
    
    // Build narrative sections
    const sections: string[] = []
    
    // Opening
    sections.push(`In accordance with Ghana Institution of Surveyors (GhIS) Valuation Standards and RICS Red Book guidelines, the valuer has applied ${methodCount === 1 ? 'the' : 'multiple valuation'} ${methodCount === 1 ? getMethodName(methods[0]) : 'methodologies'} to determine the Market Value of the subject property.`)
    
    // Method weights explanation
    if (methodCount > 1) {
      const weightDescriptions = methods.map(m => {
        const w = weights[m] || 0
        const justification = weightJustifications[m]
        return `${getMethodName(m)}: ${w}%${justification ? ` (${justification})` : ''}`
      }).join('; ')
      sections.push(`\nWeighting Applied: ${weightDescriptions}`)
    }
    
    // RICS/GhIS Listing Evidence Disclosure (Critical for Ghana market)
    if (methods.includes('sales_comparison') && comparableBasket) {
      const { comparablesCount, verifiedSaleCount, askingPriceCount, avgListingAdjustment } = comparableBasket
      
      if (askingPriceCount > 0 && verifiedSaleCount === 0) {
        // All comparables are listing-based
        sections.push(`\n\n**Important Disclosure - Comparable Evidence:**\nThe Sales Comparison Approach utilizes ${comparablesCount} comparable properties based on asking/listing prices. In accordance with RICS Red Book and GhIS standards, adjustments averaging ${avgListingAdjustment.toFixed(1)}% have been applied to estimate likely achieved prices. The absence of verified sale transactions in Ghana's property market necessitates reliance on listing data as the best available market evidence. The valuer has exercised professional judgment in determining appropriate asking-to-achieved price adjustments based on market segment and conditions.`)
      } else if (askingPriceCount > 0 && verifiedSaleCount > 0) {
        // Mixed evidence
        sections.push(`\n\n**Comparable Evidence:**\nThe Sales Comparison Approach utilizes ${comparablesCount} comparable properties, comprising ${verifiedSaleCount} verified sale${verifiedSaleCount !== 1 ? 's' : ''} and ${askingPriceCount} listing${askingPriceCount !== 1 ? 's' : ''} with asking prices. For listing-based evidence, adjustments averaging ${avgListingAdjustment.toFixed(1)}% have been applied to estimate achieved prices in accordance with RICS/GhIS guidance.`)
      } else {
        // All verified sales (rare in Ghana)
        sections.push(`\n\n**Comparable Evidence:**\nThe Sales Comparison Approach utilizes ${comparablesCount} comparable properties, all with verified sale prices. This represents the highest quality of market evidence.`)
      }
    }
    
    // Value range and spread
    if (methodCount > 1 && valueRange.spread > 0) {
      sections.push(`\nThe value indications range from ₵${valueRange.low.toLocaleString()} to ₵${valueRange.high.toLocaleString()}, representing a ${valueRange.spread.toFixed(1)}% spread.${valueRange.spread > 15 ? ' This variance warrants careful consideration of the underlying assumptions.' : ''}`)
    }
    
    // Confidence
    sections.push(`\nOverall confidence in the reconciled value is assessed at ${(confidenceScore * 100).toFixed(0)}%.`)
    
    // Final value
    sections.push(`\nBased on the foregoing analysis, the Final Indicated Market Value as at the effective date of valuation is:\n\n₵${reconciledValue.toLocaleString()} (Ghana Cedis ${numberToWords(reconciledValue)})`)
    
    // Disclaimer
    sections.push(`\n\nThis valuation is provided subject to the assumptions, limiting conditions, and scope of work detailed in this report. The valuer certifies compliance with RICS Valuation – Global Standards (Red Book) and GhIS Professional Standards.`)
    
    return sections.join('')
  }, [methodResults, valuation, weights, weightJustifications, valueRange, confidenceScore, reconciledValue, comparableBasket])

  // Helper function to convert number to words (simplified)
  function numberToWords(num: number): string {
    if (num === 0) return 'Zero'
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    if (num >= 1000000) {
      const millions = Math.floor(num / 1000000)
      const remainder = num % 1000000
      return `${ones[millions] || 'Several'} Million${remainder > 0 ? ' ' + numberToWords(remainder) : ''}`
    }
    if (num >= 1000) {
      const thousands = Math.floor(num / 1000)
      const remainder = num % 1000
      return `${thousands < 20 ? (thousands < 10 ? ones[thousands] : teens[thousands - 10]) : tens[Math.floor(thousands / 10)] + (thousands % 10 > 0 ? '-' + ones[thousands % 10] : '')} Thousand${remainder > 0 ? ' ' + numberToWords(remainder) : ''}`
    }
    if (num >= 100) {
      const hundreds = Math.floor(num / 100)
      const remainder = num % 100
      return `${ones[hundreds]} Hundred${remainder > 0 ? ' and ' + numberToWords(remainder) : ''}`
    }
    if (num >= 20) {
      return tens[Math.floor(num / 10)] + (num % 10 > 0 ? '-' + ones[num % 10] : '')
    }
    if (num >= 10) {
      return teens[num - 10]
    }
    return ones[num]
  }

  // Update weight
  const updateWeight = (method: string, weight: number) => {
    // Don't allow updates if weight is locked
    if (lockedWeights[method]) return
    setWeights({ ...weights, [method]: Math.max(0, Math.min(100, weight)) })
  }

  // Toggle weight lock
  const toggleWeightLock = (method: string) => {
    setLockedWeights(prev => ({ ...prev, [method]: !prev[method] }))
  }

  // Calculate total weight - must be before canFinalize
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0)

  // Validation for finalization
  const canFinalize = useMemo(() => {
    const hasValidWeights = Math.abs(totalWeight - 100) <= 1
    const hasRationale = reconciliationNotes.trim().length >= 20
    const hasDisclaimerAccepted = disclaimerAccepted
    const hasLockedJustifications = Object.entries(lockedWeights).every(([method, locked]) => 
      !locked || (weightJustifications[method]?.trim().length || 0) >= 10
    )
    return hasValidWeights && hasRationale && hasDisclaimerAccepted && hasLockedJustifications
  }, [totalWeight, reconciliationNotes, disclaimerAccepted, lockedWeights, weightJustifications])

  // Determine back navigation path based on selected methods or available results (reverse order)
  const getBackPath = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    const availableMethods = Object.keys(methodResults)
    
    // Go back to the last method in workflow order: income > cost > market
    if (selectedMethods.includes('income_approach') || availableMethods.includes('income_approach')) {
      return `/dashboard/valuations/${valuationId}/income`
    }
    if (selectedMethods.includes('cost_approach') || availableMethods.includes('cost_approach')) {
      return `/dashboard/valuations/${valuationId}/cost`
    }
    if (selectedMethods.includes('sales_comparison') || availableMethods.includes('sales_comparison')) {
      return `/dashboard/valuations/${valuationId}/market`
    }
    // Default to comparables (Step 4)
    return `/dashboard/valuations/${valuationId}/comparables`
  }
  
  const getBackLabel = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    const availableMethods = Object.keys(methodResults)
    
    if (selectedMethods.includes('income_approach') || availableMethods.includes('income_approach')) {
      return '← BACK TO INCOME APPROACH'
    }
    if (selectedMethods.includes('cost_approach') || availableMethods.includes('cost_approach')) {
      return '← BACK TO COST APPROACH'
    }
    if (selectedMethods.includes('sales_comparison') || availableMethods.includes('sales_comparison')) {
      return '← BACK TO MARKET ANALYSIS'
    }
    return '← BACK TO COMPARABLES'
  }

  // Auto-balance weights
  const autoBalance = () => {
    const methods = Object.keys(methodResults)
    const equalWeight = Math.floor(100 / methods.length)
    const remainder = 100 - (equalWeight * methods.length)

    const newWeights: Record<string, number> = {}
    methods.forEach((m, i) => {
      newWeights[m] = equalWeight + (i === 0 ? remainder : 0)
    })
    setWeights(newWeights)
  }

  // Weight by confidence
  const weightByConfidence = () => {
    const totalConfidence = Object.values(methodResults).reduce((sum, r) => sum + (r.confidence_score || 0.5), 0)

    const newWeights: Record<string, number> = {}
    Object.entries(methodResults).forEach(([method, result]) => {
      newWeights[method] = Math.round(((result.confidence_score || 0.5) / totalConfidence) * 100)
    })
    setWeights(newWeights)
  }

  // Save and continue
  const handleSaveAndContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      // Validate using canFinalize instead of just weights
      if (!canFinalize) {
        throw new Error('Please complete all required fields before finalizing')
      }

      let currentReconId = reconciliationId

      // Create reconciliation if it doesn't exist
      if (!currentReconId) {
        // Prepare method results for API with governance metadata
        const apiMethodResults: Record<string, any> = {}
        Object.entries(methodResults).forEach(([method, result]) => {
          apiMethodResults[method] = {
            method,
            value: result.value_ghs,
            confidence_score: result.confidence_score || 0.5,
            data_quality_score: 0.8, // Default
            weight: weights[method] || 0,
            weight_locked: lockedWeights[method] || false,
            weight_justification: weightJustifications[method] || null
          }
        })

        const createRes = await reconciliationApi.create(valuationId, {
          method_results: apiMethodResults,
          weighting_method: 'manual'
        })

        if (!createRes.success || !createRes.data) {
          throw new Error(createRes.error || 'Failed to create reconciliation')
        }
        currentReconId = createRes.data.id
        setReconciliationId(currentReconId)
      } else {
        // Update weights (API currently only supports basic weights)
        await reconciliationApi.setWeights(currentReconId, { 
          weights
        })
      }

      // Finalize reconciliation (using only supported fields)
      await reconciliationApi.finalize(currentReconId, {
        final_value_selection: 'manual',
        final_market_value: reconciledValue,
        reconciliation_narrative: `${reconciliationNotes}\n\n--- AUTO-GENERATED NARRATIVE ---\n${autoNarrative}`,
        special_assumptions: adjustmentRationale ? adjustmentRationale.split('\n').filter(Boolean) : [],
      })

      // Update valuation with final value and reconciliation metadata
      await valuationsApi.update(valuationId, {
        final_value_ghs: reconciledValue,
        confidence_score: confidenceScore,
        current_step: 9,
        status: 'pending_review',
        reconciliation_data: {
          weights,
          locked_weights: lockedWeights,
          weight_justifications: weightJustifications,
          value_range: valueRange,
          reconciliation_notes: reconciliationNotes,
          adjustment_rationale: adjustmentRationale,
          disclaimer_accepted: disclaimerAccepted
        }
      })

      // Navigate to report
      router.push(`/dashboard/valuations/${valuationId}/report`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reconciliation')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading reconciliation...</span>
      </div>
    )
  }

  if (error || !valuation) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <AlertBanner type="error" title="Error" message={error || 'Valuation not found'} />
      </div>
    )
  }

  const methods = Object.keys(methodResults)

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/valuations/${valuationId}`}
            className="p-2 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-xl text-white">STEP 7: RECONCILIATION</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              Final Value Determination • VAL-{valuationId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSensitivity(!showSensitivity)}
            className={`flex items-center gap-2 px-3 py-2 font-mono text-xs transition-colors ${showSensitivity ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
          >
            <Sliders className="w-3 h-3" />
            SENSITIVITY
          </button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSaveAndContinue}
                  disabled={saving || !canFinalize}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      SAVING...
                    </>
                  ) : (
                    <>
                      FINALIZE VALUE
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </TooltipTrigger>
              {!canFinalize && !saving && (
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs text-red-300">Cannot finalize. Check validation errors below.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Step Progress */}
      <div className="mb-6">
        <StepIndicator
          steps={[
            { id: 1, label: 'Property Setup', status: 'completed' },
            { id: 2, label: 'HBU Analysis', status: 'completed' },
            { id: 3, label: 'Method Selection', status: 'completed' },
            { id: 4, label: 'Valuation', status: 'completed' },
            { id: 5, label: 'Reconciliation', status: 'current' },
            { id: 6, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {/* Error Alert */}
      {error && <AlertBanner type="error" title="Error" message={error} />}

      {/* Reconciliation Basis Panel - GhIS/RICS compliant summary */}
      {methods.length > 0 && (
        <TerminalPanel title="RECONCILIATION BASIS" className="mb-4">
          <div className="grid grid-cols-4 gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-3 bg-zinc-800/50 border border-zinc-700 cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-zinc-500">PRIMARY METHOD</span>
                      <HelpCircle className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="font-mono text-sm text-amber-400">
                      {valuation?.primary_method?.replace('_', ' ').toUpperCase() || methods[0]?.replace('_', ' ').toUpperCase() || '—'}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">The valuation method considered most reliable for this property type based on data quality, market conditions, and highest & best use analysis.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-3 bg-zinc-800/50 border border-zinc-700 cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-zinc-500">SECONDARY METHODS</span>
                      <HelpCircle className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="font-mono text-sm text-zinc-300">
                      {methods.filter(m => m !== valuation?.primary_method).map(m => m.replace('_', ' ').split(' ')[0].charAt(0).toUpperCase()).join(', ') || 'None'}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">Supporting valuation methods used to validate or cross-check the primary approach. Multiple methods increase confidence when results converge.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-3 bg-zinc-800/50 border border-zinc-700 cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-zinc-500">MARKET EVIDENCE</span>
                      <HelpCircle className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="font-mono text-sm text-zinc-300">
                      {valueRange.spread < 10 ? 'Strong' : valueRange.spread < 20 ? 'Moderate' : 'Limited'}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">Assessment based on method spread: Strong (&lt;10%), Moderate (10-20%), Limited (&gt;20%). Lower spread indicates better market evidence convergence per RICS guidance.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-3 bg-zinc-800/50 border border-zinc-700 cursor-help">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-zinc-500">PROPERTY SUITABILITY</span>
                      <HelpCircle className="w-3 h-3 text-zinc-500" />
                    </div>
                    <div className="font-mono text-sm text-zinc-300">
                      {(confidenceScore * 100) >= 80 ? 'High' : (confidenceScore * 100) >= 60 ? 'Medium' : 'Low'}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">Indicates how well the applied methods suit this property type. High suitability suggests reliable value indication; Low suggests specialist review may be needed.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TerminalPanel>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Method Values */}
        <TerminalPanel title="METHOD RESULTS" className="col-span-2">
          {methods.length === 0 ? (
            <div className="text-center py-12">
              <Scale className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <div className="font-mono text-sm text-zinc-500">No method results available</div>
              <div className="font-mono text-[10px] text-zinc-600 mt-1">
                Complete the valuation steps first
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {methods.map((method) => {
                const result = methodResults[method]
                const weight = weights[method] || 0
                const contribution = result.value_ghs * (weight / 100)
                const isPrimary = valuation.primary_method === method
                const isLocked = lockedWeights[method] || false

                return (
                  <div
                    key={method}
                    className={`p-4 border transition-colors ${isPrimary ? 'border-amber-500/50 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/50'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <MethodBadge method={method} isPrimary={isPrimary} />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <div className="flex items-center gap-1 font-mono text-xs text-zinc-500">
                                  Confidence
                                  <HelpCircle className="w-3 h-3" />
                                </div>
                                <ConfidenceBar score={(result.confidence_score || 0.5) * 100} size="sm" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs font-medium mb-1">Data Quality Confidence</p>
                              <p className="text-xs text-zinc-400">Reflects data reliability and method applicability. High confidence does NOT automatically warrant high weight — professional judgment considers market conditions, property uniqueness, and comparable quality.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Currency value={result.value_ghs} size="lg" />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {/* Weight Lock Toggle */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleWeightLock(method)}
                                  className={`p-1 transition-colors ${isLocked ? 'text-amber-500 hover:text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                  {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">{isLocked ? 'Weight is locked. Click to unlock and allow adjustment. Locked weights require justification.' : 'Click to lock this weight. Locking requires written justification per RICS standards.'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <span className="font-mono text-[10px] text-zinc-500">WEIGHT:</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={weight}
                            onChange={(e) => updateWeight(method, parseInt(e.target.value))}
                            disabled={isLocked}
                            className={`flex-1 accent-amber-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={weight}
                            onChange={(e) => updateWeight(method, parseInt(e.target.value) || 0)}
                            disabled={isLocked}
                            className={`w-14 px-2 py-1 bg-zinc-800 border border-zinc-700 text-white font-mono text-xs text-center focus:outline-none focus:border-amber-500/50 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                          <span className="font-mono text-[10px] text-zinc-500">%</span>
                        </div>
                        {/* Weight micro-label */}
                        <div className="font-mono text-[9px] text-zinc-600 mt-0.5 ml-6">
                          Weight reflects professional judgment, not mathematical certainty.
                        </div>
                        
                        {/* Locked weight justification field */}
                        {isLocked && (
                          <div className="mt-2 ml-6">
                            <input
                              type="text"
                              value={weightJustifications[method] || ''}
                              onChange={(e) => setWeightJustifications(prev => ({ ...prev, [method]: e.target.value }))}
                              placeholder="Justification for locked weight (required)..."
                              className="w-full px-2 py-1 bg-zinc-900 border border-amber-500/30 text-white font-mono text-[10px] placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                            />
                            {(!weightJustifications[method] || weightJustifications[method].trim().length < 10) && (
                              <div className="text-[9px] text-amber-400 mt-0.5">Minimum 10 characters required</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right w-32">
                        <div className="font-mono text-[10px] text-zinc-500">CONTRIBUTION</div>
                        <Currency value={contribution} size="sm" />
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Weight Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={autoBalance}
                    className="px-3 py-1.5 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white transition-colors"
                  >
                    EQUAL WEIGHTS
                  </button>
                  <button
                    onClick={weightByConfidence}
                    className="px-3 py-1.5 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white transition-colors"
                  >
                    WEIGHT BY CONFIDENCE
                  </button>
                </div>
                <div className={`font-mono text-xs ${Math.abs(totalWeight - 100) <= 1 ? 'text-green-400' : 'text-red-400'
                  }`}>
                  TOTAL: {totalWeight}%
                  {Math.abs(totalWeight - 100) > 1 && ' ⚠'}
                </div>
              </div>
            </div>
          )}
        </TerminalPanel>

        {/* Final Value */}
        <div className="space-y-4">
          <TerminalPanel title="RECONCILED VALUE">
            <div className="text-center py-6">
              <div className="font-mono text-4xl text-green-400 mb-2">
                ₵{reconciledValue.toLocaleString()}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="font-mono text-[10px] text-zinc-500 cursor-help inline-flex items-center gap-1">
                      FINAL INDICATED MARKET VALUE
                      <HelpCircle className="w-3 h-3" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs">"Indicated" reflects that this value is the professional opinion of value based on available data and methodology — not a guarantee of transaction price. Per RICS Red Book and GhIS standards.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="mt-4 pt-4 border-t border-zinc-800">
                <div className="flex justify-between items-center mb-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono text-[10px] text-zinc-500 cursor-help inline-flex items-center gap-1">
                          CONFIDENCE SCORE
                          <HelpCircle className="w-3 h-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="text-xs">Weighted average of individual method confidence scores. Reflects overall data quality and methodological reliability, not certainty of value.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="font-mono text-xs text-zinc-400">{(confidenceScore * 100).toFixed(0)}%</span>
                </div>
                <ConfidenceBar score={confidenceScore * 100} showValue={false} />
              </div>
            </div>
          </TerminalPanel>

          <TerminalPanel title="VALUE RANGE">
            <div className="space-y-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex justify-between items-center cursor-help">
                      <div>
                        <div className="font-mono text-[10px] text-zinc-500">LOW</div>
                        <Currency value={valueRange.low} size="sm" />
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                          SPREAD
                          <HelpCircle className="w-3 h-3" />
                        </div>
                        <div className={`font-mono text-lg ${valueRange.spread < 10 ? 'text-green-400' :
                          valueRange.spread < 20 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                          {valueRange.spread.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[10px] text-zinc-500">HIGH</div>
                        <Currency value={valueRange.high} size="sm" />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs mb-1">Value range represents the spread between lowest and highest method indications.</p>
                    <p className="text-xs text-zinc-400">
                      {valueRange.spread === 0 
                        ? 'Single-method valuation shows 0% spread. Consider advisory range below for uncertainty disclosure.'
                        : valueRange.spread < 10 
                          ? 'Strong convergence suggests reliable market evidence.'
                          : valueRange.spread < 20 
                            ? 'Moderate variance — review underlying assumptions.'
                            : 'High variance warrants careful reconciliation rationale.'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Advisory Band for single-method or low-confidence scenarios */}
              {valueRange.showAdvisory && (
                <div className="p-2 bg-blue-900/20 border border-blue-500/30">
                  <div className="flex items-start gap-2">
                    <Info className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-mono text-[10px] text-blue-400 font-medium">ADVISORY RANGE</div>
                      <div className="font-mono text-xs text-blue-300 mt-1">
                        ₵{valueRange.advisoryLow.toLocaleString()} – ₵{valueRange.advisoryHigh.toLocaleString()}
                      </div>
                      <div className="font-mono text-[9px] text-blue-400/70 mt-1">
                        Single-method valuation with confidence below 85%. Consider disclosing this range per RICS uncertainty guidance.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {valueRange.spread > 15 && (
                <div className="p-2 bg-yellow-900/20 border border-yellow-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="font-mono text-[10px] text-yellow-400">
                      High variance between methods. Consider reviewing assumptions.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TerminalPanel>

          <TerminalPanel title="STATISTICS">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-800/50">
                <div className="font-mono text-[10px] text-zinc-500">METHODS USED</div>
                <div className="font-mono text-xl text-white">{methods.length}</div>
              </div>
              <div className="p-3 bg-zinc-800/50">
                <div className="font-mono text-[10px] text-zinc-500">PRIMARY</div>
                <div className="font-mono text-xs text-amber-400 mt-1">
                  {(valuation.primary_method || methods[0])?.replace(/_/g, ' ').toUpperCase() || '—'}
                </div>
              </div>
            </div>
          </TerminalPanel>
        </div>
      </div>

      {/* Sensitivity Analysis */}
      {showSensitivity && (
        <TerminalPanel title="SENSITIVITY ANALYSIS" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-500">RANGE:</span>
                <select
                  value={sensitivityRange}
                  onChange={(e) => setSensitivityRange(parseInt(e.target.value))}
                  className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-white font-mono text-xs focus:outline-none"
                >
                  <option value={5}>±5%</option>
                  <option value={10}>±10%</option>
                  <option value={15}>±15%</option>
                  <option value={20}>±20%</option>
                </select>
              </div>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <span className="font-mono text-[10px] text-zinc-500">DRIVER:</span>
                      <select
                        value={sensitivityDriver}
                        onChange={(e) => setSensitivityDriver(e.target.value as SensitivityDriverType)}
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-white font-mono text-xs focus:outline-none"
                      >
                        {availableDrivers.map(d => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                      <HelpCircle className="w-3 h-3 text-zinc-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs font-medium mb-1">Sensitivity Driver</p>
                    <p className="text-xs text-zinc-400">
                      {availableDrivers.find(d => d.value === sensitivityDriver)?.tooltip || 'Select a driver to see how changes impact the reconciled value.'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="font-mono text-[9px] text-zinc-600">
              Sensitivity analysis per RICS VPS 3 uncertainty disclosure requirements
            </div>
          </div>

          {/* Professional Table Format */}
          <div className="overflow-hidden border border-zinc-800">
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-800/50">
                  <th className="px-4 py-2 text-left font-mono text-[10px] text-zinc-400 uppercase">
                    {(availableDrivers.find(d => d.value === sensitivityDriver)?.label || 'Driver')} Δ
                  </th>
                  <th className="px-4 py-2 text-right font-mono text-[10px] text-zinc-400">INDICATED VALUE</th>
                  <th className="px-4 py-2 text-right font-mono text-[10px] text-zinc-400">VALUE CHANGE</th>
                  <th className="px-4 py-2 text-center font-mono text-[10px] text-zinc-400 w-48">IMPACT</th>
                </tr>
              </thead>
              <tbody>
                {sensitivityData.map((row, idx) => {
                  const isBase = row.percentage === 0
                  const maxAbsChange = Math.max(...sensitivityData.map(d => Math.abs(d.changePercent)))
                  const barWidth = maxAbsChange > 0 ? (Math.abs(row.changePercent) / maxAbsChange) * 100 : 0
                  
                  return (
                    <tr 
                      key={idx} 
                      className={`border-t border-zinc-800 ${isBase ? 'bg-amber-500/10' : 'hover:bg-zinc-800/30'}`}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-mono text-sm font-medium ${
                          row.percentage < 0 ? 'text-red-400' : row.percentage > 0 ? 'text-green-400' : 'text-amber-400'
                        }`}>
                          {row.percentage > 0 ? '+' : ''}{row.percentage.toFixed(0)}%
                        </span>
                        {isBase && <span className="ml-2 font-mono text-[9px] text-amber-400/70">BASE</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm text-white">
                          ₵{row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-xs ${
                          row.change < 0 ? 'text-red-400' : row.change > 0 ? 'text-green-400' : 'text-zinc-500'
                        }`}>
                          {row.change >= 0 ? '+' : ''}₵{row.change.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Bar chart visualization */}
                          <div className="flex-1 h-4 bg-zinc-800 relative overflow-hidden">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                            {row.changePercent !== 0 && (
                              <div 
                                className={`absolute top-0 h-full ${row.changePercent < 0 ? 'bg-red-500/60' : 'bg-green-500/60'}`}
                                style={{
                                  width: `${barWidth / 2}%`,
                                  left: row.changePercent < 0 ? `${50 - barWidth / 2}%` : '50%'
                                }}
                              />
                            )}
                          </div>
                          <span className={`font-mono text-[10px] w-12 text-right ${
                            row.changePercent < 0 ? 'text-red-400' : row.changePercent > 0 ? 'text-green-400' : 'text-zinc-500'
                          }`}>
                            {row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Summary insights */}
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="p-3 bg-zinc-800/50 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">DOWNSIDE RISK</div>
              <div className="font-mono text-lg text-red-400">
                {sensitivityData[0]?.changePercent.toFixed(1)}%
              </div>
              <div className="font-mono text-[10px] text-zinc-600">
                ₵{sensitivityData[0]?.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/30">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">BASE VALUE</div>
              <div className="font-mono text-lg text-amber-400">
                ₵{reconciledValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="font-mono text-[10px] text-zinc-600">Current indicated value</div>
            </div>
            <div className="p-3 bg-zinc-800/50 border border-zinc-700">
              <div className="font-mono text-[10px] text-zinc-500 mb-1">UPSIDE POTENTIAL</div>
              <div className="font-mono text-lg text-green-400">
                +{sensitivityData[4]?.changePercent.toFixed(1)}%
              </div>
              <div className="font-mono text-[10px] text-zinc-600">
                ₵{sensitivityData[4]?.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        </TerminalPanel>
      )}

      {/* Reconciliation Notes */}
      <TerminalPanel title="RECONCILIATION RATIONALE" className="mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="font-mono text-[10px] text-zinc-500">WEIGHT RATIONALE</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-zinc-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">Per RICS VPS 3, provide reasoning for weight allocation. Address why primary method received highest weight and consider data quality, market conditions, and property characteristics.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {reconciliationNotes.trim().length < 20 && (
                <span className="font-mono text-[9px] text-amber-400">Min 20 chars required</span>
              )}
            </div>
            <textarea
              value={reconciliationNotes}
              onChange={(e) => setReconciliationNotes(e.target.value)}
              placeholder="Example: The Cost Approach was given primary weight (60%) due to the recent construction date (2023) and availability of verified construction cost data. The limited comparable sales in this micro-market reduced reliability of the Sales Comparison approach..."
              rows={5}
              className={`w-full px-3 py-2 bg-zinc-900 border text-white font-mono text-sm placeholder-zinc-600 focus:outline-none resize-none ${
                reconciliationNotes.trim().length >= 20 ? 'border-zinc-800 focus:border-amber-500/50' : 'border-amber-500/30'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="font-mono text-[10px] text-zinc-500">ADJUSTMENTS & SPECIAL ASSUMPTIONS</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-zinc-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">Document any special assumptions per RICS VPS 4, departures from standard methodology, or market conditions affecting the valuation.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <textarea
              value={adjustmentRationale}
              onChange={(e) => setAdjustmentRationale(e.target.value)}
              placeholder="Example: Special assumption — valued on basis of vacant possession. Adjustment of +5% applied to cost approach to account for premium location near upcoming metro station. Market conditions reflect post-election uncertainty..."
              rows={5}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>
      </TerminalPanel>

      {/* Auto-Generated Narrative Preview */}
      <TerminalPanel title="RECONCILIATION NARRATIVE PREVIEW" className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-500" />
            <span className="font-mono text-[10px] text-zinc-500">AUTO-GENERATED NARRATIVE (EDITABLE)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-zinc-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">This narrative is automatically generated from your reconciliation data and will appear in the final valuation report. You can edit it before finalization.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <button
            onClick={() => setShowNarrativePreview(!showNarrativePreview)}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-400 font-mono text-[10px] hover:text-white transition-colors"
          >
            {showNarrativePreview ? (
              <>
                <ChevronUp className="w-3 h-3" />
                COLLAPSE
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                EXPAND
              </>
            )}
          </button>
        </div>
        
        {showNarrativePreview && (
          <div className="p-4 bg-zinc-900 border border-zinc-800">
            <div className="font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {autoNarrative}
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
              <span className="font-mono text-[9px] text-zinc-600">
                {autoNarrative.length} characters • This text will appear in Section 8 of the valuation report
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(autoNarrative)}
                className="px-2 py-1 bg-zinc-800 text-zinc-400 font-mono text-[9px] hover:text-white transition-colors"
              >
                COPY TO CLIPBOARD
              </button>
            </div>
          </div>
        )}
      </TerminalPanel>

      {/* Finalization Disclaimer */}
      <div className="mt-4 p-4 bg-zinc-900 border border-zinc-800">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={disclaimerAccepted}
            onChange={(e) => setDisclaimerAccepted(e.target.checked)}
            className="mt-1 w-4 h-4 accent-amber-500"
          />
          <div>
            <div className="font-mono text-xs text-white mb-1">Professional Certification</div>
            <div className="font-mono text-[10px] text-zinc-400 leading-relaxed">
              I certify that this valuation has been prepared in accordance with the Ghana Institution of Surveyors (GhIS) Valuation Standards, 
              RICS Valuation – Global Standards (Red Book), and applicable regulatory requirements. The final indicated market value reflects 
              my independent professional judgment based on the data, methodologies, and analysis documented herein. I confirm that I have no 
              undisclosed conflicts of interest regarding this assignment.
            </div>
          </div>
        </label>
        
        {!disclaimerAccepted && (
          <div className="mt-2 flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span className="font-mono text-[10px]">Certification required before finalization</span>
          </div>
        )}
      </div>

      {/* Validation Summary */}
      {!canFinalize && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30">
          <div className="font-mono text-[10px] text-red-400 font-medium mb-2">FINALIZATION BLOCKED:</div>
          <ul className="space-y-1">
            {Math.abs(totalWeight - 100) > 1 && (
              <li className="font-mono text-[10px] text-red-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                Weights must sum to 100% (currently {totalWeight}%)
              </li>
            )}
            {reconciliationNotes.trim().length < 20 && (
              <li className="font-mono text-[10px] text-red-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                Weight rationale requires minimum 20 characters
              </li>
            )}
            {!disclaimerAccepted && (
              <li className="font-mono text-[10px] text-red-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                Professional certification checkbox required
              </li>
            )}
            {Object.entries(lockedWeights).some(([method, locked]) => 
              locked && (!weightJustifications[method] || weightJustifications[method].trim().length < 10)
            ) && (
              <li className="font-mono text-[10px] text-red-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                Locked weights require justification (min 10 characters each)
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={getBackPath()}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          {getBackLabel()}
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving || !canFinalize}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SAVING...
            </>
          ) : (
            <>
              {canFinalize ? <CheckCircle2 className="w-4 h-4" /> : null}
              GENERATE REPORT
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
