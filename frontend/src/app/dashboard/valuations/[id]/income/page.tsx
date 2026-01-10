'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  AlertBanner,
  MethodBadge,
  ConfidenceBar,
} from '@/components/ui/terminal'
import { valuationsApi, incomeApproachApi } from '@/lib/valuation-api'
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
} from 'lucide-react'

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
  const [discountRate, setDiscountRate] = useState(12)
  const [holdingPeriod, setHoldingPeriod] = useState(10)
  const [terminalCapRate, setTerminalCapRate] = useState(9)
  const [rentGrowth, setRentGrowth] = useState(3)

  // Method selection
  const [incomeMethod, setIncomeMethod] = useState<'direct_cap' | 'dcf'>('direct_cap')

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
  const indicatedValue = incomeMethod === 'direct_cap' ? directCapValue : dcfValue

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
          setCapRate(data.capRate || data.cap_rate || 8)
          setDiscountRate(data.discountRate || 12)
          setHoldingPeriod(data.holdingPeriod || 10)
          setTerminalCapRate(data.terminalCapRate || 9)
          setRentGrowth(data.rentGrowth || 3)
          setIncomeMethod(data.incomeMethod || 'direct_cap')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [valuationId])

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
          holdingPeriod,
          terminalCapRate,
          rentGrowth,
          incomeMethod,
          directCapValue,
        },
      })

      // Update valuation method result
      await valuationsApi.update(valuationId, {
        method_results: {
          ...(valuation?.method_results || {}),
          income: {
            value: indicatedValue,
            confidence: calculateConfidence(),
            noi: netOperatingIncome,
            capRate,
            method: incomeMethod,
          },
        },
        current_step: 6,
      })

      router.push(`/dashboard/valuations/${valuationId}/reconciliation`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }
  
  // Determine back navigation path based on selected methods
  const getBackPath = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    const hasCostApproach = selectedMethods.includes('cost_approach')
    if (hasCostApproach) {
      return `/dashboard/valuations/${valuationId}/cost`
    }
    // If no cost approach, go back to market
    return `/dashboard/valuations/${valuationId}/market`
  }
  
  const getBackLabel = () => {
    const selectedMethods = (valuation as any)?.selectedMethods || valuation?.methods_applied || []
    const hasCostApproach = selectedMethods.includes('cost_approach')
    return hasCostApproach ? '← BACK TO COST APPROACH' : '← BACK TO MARKET DATA'
  }

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
            href={`/dashboard/valuations/${valuationId}/cost`}
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

      {/* Method Selection */}
      <div className="flex gap-2 mb-4">
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
          {/* Income Sources */}
          <TerminalPanel title="INCOME SOURCES">
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
                  <th className="text-center pb-2 w-32">MONTHLY RENT</th>
                  <th className="text-center pb-2 w-24">OCCUPANCY</th>
                  <th className="text-right pb-2 w-32">ANNUAL</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {incomeSources.map((source) => (
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
                      <div className="flex items-center">
                        <span className="font-mono text-xs text-zinc-500 mr-1">₵</span>
                        <input
                          type="number"
                          value={source.monthlyRent}
                          onChange={(e) => updateIncomeSource(source.id, 'monthlyRent', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-xs"
                        />
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
                    <label className="font-mono text-[10px] text-zinc-500">VACANCY RATE</label>
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
                    <span>Prime (3-8%)</span>
                    <span>Standard (8-15%)</span>
                    <span>Secondary (15-25%)</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-mono text-[10px] text-zinc-500">COLLECTION LOSS</label>
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
            <TerminalPanel title="OPERATING EXPENSES">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    MANAGEMENT (% EGI)
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
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    UTILITIES (₵/yr)
                  </label>
                  <input
                    type="number"
                    value={utilities}
                    onChange={(e) => setUtilities(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    SECURITY (₵/yr)
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
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500">Expense Ratio</span>
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
              <div>
                <div className="flex justify-between mb-2">
                  <label className="font-mono text-[10px] text-zinc-500">CAP RATE</label>
                  <span className="font-mono text-lg text-amber-400">{capRate}%</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="18"
                  step="0.25"
                  value={capRate}
                  onChange={(e) => setCapRate(parseFloat(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between font-mono text-[9px] text-zinc-600 mt-1">
                  <span>Residential (6-10%)</span>
                  <span>Commercial (8-14%)</span>
                  <span>Industrial (10-16%)</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="font-mono text-[10px] text-zinc-500 block mb-1">
                    DISCOUNT RATE (%)
                  </label>
                  <input
                    type="number"
                    value={discountRate}
                    onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-black border border-zinc-700 text-white font-mono text-sm"
                    step="0.25"
                  />
                </div>
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
            )}
          </TerminalPanel>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-4">
          {/* Income Pro Forma */}
          <TerminalPanel title="INCOME PRO FORMA">
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Potential Gross Income</span>
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
              <div className="flex justify-between border-t border-zinc-800 pt-2">
                <span className="text-zinc-400">Effective Gross Income</span>
                <span className="text-white font-bold">₵{Math.round(effectiveGrossIncome).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>− Operating Expenses</span>
                <span>(₵{Math.round(totalOperatingExpenses).toLocaleString()})</span>
              </div>
              <div className="flex justify-between border-t-2 border-zinc-700 pt-2">
                <span className="text-zinc-300">Net Operating Income</span>
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
                <div className="font-mono text-[10px] text-green-400 mb-1">
                  INDICATED VALUE ({incomeMethod === 'direct_cap' ? 'DIRECT CAP' : 'DCF'})
                </div>
                <div className="font-mono text-3xl text-green-400 font-bold">
                  ₵{Math.round(indicatedValue).toLocaleString()}
                </div>
              </div>
            </div>

            {incomeMethod === 'direct_cap' && dcfValue > 0 && (
              <div className="mt-3 p-3 bg-zinc-800/30 text-center">
                <div className="font-mono text-[10px] text-zinc-500">DCF CROSS-CHECK</div>
                <div className="font-mono text-lg text-zinc-400">₵{Math.round(dcfValue).toLocaleString()}</div>
                <div className={`font-mono text-[10px] ${
                  Math.abs(dcfValue - directCapValue) / directCapValue < 0.1 
                    ? 'text-green-400' 
                    : 'text-amber-400'
                }`}>
                  {((dcfValue - directCapValue) / directCapValue * 100).toFixed(1)}% variance
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-zinc-500">CONFIDENCE</span>
                <ConfidenceBar score={calculateConfidence() * 100} />
              </div>
            </div>
          </TerminalPanel>

          {/* Metrics */}
          <TerminalPanel title="KEY METRICS">
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Gross Rent Multiplier</span>
                <span className="text-white">
                  {potentialGrossIncome > 0 ? (indicatedValue / potentialGrossIncome).toFixed(2) : '—'}x
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Net Rent Multiplier</span>
                <span className="text-white">
                  {netOperatingIncome > 0 ? (indicatedValue / netOperatingIncome).toFixed(2) : '—'}x
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Break-Even Ratio</span>
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
