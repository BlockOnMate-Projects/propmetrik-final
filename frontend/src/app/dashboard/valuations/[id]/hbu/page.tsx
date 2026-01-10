'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  TerminalPanel,
  StatusBadge,
  PropertyTypeBadge,
  AlertBanner,
  ConfidenceBar,
  StepIndicator,
} from '@/components/ui/terminal'
import { valuationsApi, hbuApi } from '@/lib/valuation-api'
import type { Valuation, HBUAnalysis, HBUTest, UseScenario } from '@/types/valuation'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  Scale,
  Gavel,
  Wrench,
  DollarSign,
  TrendingUp,
  Info,
} from 'lucide-react'

// HBU Test structure
interface HBUTestState {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  passed: boolean | null
  notes: string
  factors: { name: string; value: boolean | null; weight: number }[]
}

// Default HBU tests based on RICS/IVS standards
const createDefaultTests = (): HBUTestState[] => [
  {
    id: 'legally_permissible',
    name: 'Legally Permissible',
    icon: <Gavel className="w-5 h-5" />,
    description: 'Is the proposed use allowed under zoning, building codes, and regulations?',
    passed: null,
    notes: '',
    factors: [
      { name: 'Zoning Compliance', value: null, weight: 30 },
      { name: 'Building Code Compliance', value: null, weight: 25 },
      { name: 'Environmental Regulations', value: null, weight: 20 },
      { name: 'Private Restrictions (Covenants)', value: null, weight: 15 },
      { name: 'Land Use Permits Available', value: null, weight: 10 },
    ],
  },
  {
    id: 'physically_possible',
    name: 'Physically Possible',
    icon: <Wrench className="w-5 h-5" />,
    description: 'Can the proposed use be physically accommodated on the site?',
    passed: null,
    notes: '',
    factors: [
      { name: 'Site Size Adequate', value: null, weight: 25 },
      { name: 'Topography Suitable', value: null, weight: 20 },
      { name: 'Access Available', value: null, weight: 20 },
      { name: 'Utilities Available', value: null, weight: 20 },
      { name: 'Soil Conditions Appropriate', value: null, weight: 15 },
    ],
  },
  {
    id: 'financially_feasible',
    name: 'Financially Feasible',
    icon: <DollarSign className="w-5 h-5" />,
    description: 'Will the proposed use generate adequate financial returns?',
    passed: null,
    notes: '',
    factors: [
      { name: 'Market Demand Exists', value: null, weight: 25 },
      { name: 'Development Costs Reasonable', value: null, weight: 25 },
      { name: 'Income Potential Adequate', value: null, weight: 20 },
      { name: 'Risk Level Acceptable', value: null, weight: 15 },
      { name: 'Financing Available', value: null, weight: 15 },
    ],
  },
  {
    id: 'maximally_productive',
    name: 'Maximally Productive',
    icon: <TrendingUp className="w-5 h-5" />,
    description: 'Does the proposed use provide the highest return among feasible alternatives?',
    passed: null,
    notes: '',
    factors: [
      { name: 'Highest Net Operating Income', value: null, weight: 35 },
      { name: 'Best Return on Investment', value: null, weight: 30 },
      { name: 'Optimal Land Utilization', value: null, weight: 20 },
      { name: 'Long-term Value Appreciation', value: null, weight: 15 },
    ],
  },
]

// Use scenarios for comparison
interface UseScenarioState {
  id: string
  name: string
  propertyType: string
  estimatedValue: number
  developmentCost: number
  annualIncome: number
  roi: number
  selected: boolean
}

export default function HBUAnalysisPage() {
  const params = useParams()
  const router = useRouter()
  const valuationId = params.id as string

  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // HBU state
  const [tests, setTests] = useState<HBUTestState[]>(createDefaultTests())
  const [activeTest, setActiveTest] = useState('legally_permissible')
  const [scenarios, setScenarios] = useState<UseScenarioState[]>([])
  const [recommendedUse, setRecommendedUse] = useState('')
  const [analysisNotes, setAnalysisNotes] = useState('')

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

        // Fetch existing HBU analysis
        const hbuRes = await hbuApi.getByValuation(valuationId)
        if (hbuRes.data) {
          // Restore HBU state - the API may return additional fields not in the type
          const data = hbuRes.data as any
          if (data.tests) {
            setTests(data.tests as unknown as HBUTestState[])
          }
          if (data.scenarios) {
            setScenarios(data.scenarios as unknown as UseScenarioState[])
          }
          if (data.recommendedUse) {
            setRecommendedUse(data.recommendedUse)
          }
          if (data.analysisNotes) {
            setAnalysisNotes(data.analysisNotes)
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

  // Update factor value
  const updateFactorValue = (testId: string, factorIndex: number, value: boolean) => {
    setTests(tests.map(test => {
      if (test.id === testId) {
        const newFactors = [...test.factors]
        newFactors[factorIndex] = { ...newFactors[factorIndex], value }
        
        // Calculate if test passed (weighted average > 50%)
        const totalWeight = newFactors.reduce((sum, f) => sum + f.weight, 0)
        const passedWeight = newFactors
          .filter(f => f.value === true)
          .reduce((sum, f) => sum + f.weight, 0)
        const passed = passedWeight / totalWeight >= 0.5

        return { ...test, factors: newFactors, passed }
      }
      return test
    }))
  }

  // Update test notes
  const updateTestNotes = (testId: string, notes: string) => {
    setTests(tests.map(test => 
      test.id === testId ? { ...test, notes } : test
    ))
  }

  // Add use scenario
  const addScenario = () => {
    setScenarios([
      ...scenarios,
      {
        id: Date.now().toString(),
        name: '',
        propertyType: 'residential',
        estimatedValue: 0,
        developmentCost: 0,
        annualIncome: 0,
        roi: 0,
        selected: false,
      }
    ])
  }

  // Update scenario
  const updateScenario = (id: string, updates: Partial<UseScenarioState>) => {
    setScenarios(scenarios.map(s => {
      if (s.id === id) {
        const updated = { ...s, ...updates }
        // Calculate ROI
        if (updated.estimatedValue > 0 && updated.developmentCost > 0) {
          updated.roi = ((updated.estimatedValue - updated.developmentCost) / updated.developmentCost) * 100
        }
        return updated
      }
      return s
    }))
  }

  // Remove scenario
  const removeScenario = (id: string) => {
    setScenarios(scenarios.filter(s => s.id !== id))
  }

  // Select best scenario
  const selectScenario = (id: string) => {
    const scenario = scenarios.find(s => s.id === id)
    if (scenario) {
      setScenarios(scenarios.map(s => ({ ...s, selected: s.id === id })))
      setRecommendedUse(scenario.name)
    }
  }

  // Calculate overall HBU status
  const allTestsPassed = tests.every(t => t.passed === true)
  const someTestsPassed = tests.some(t => t.passed === true)
  const hbuScore = tests.filter(t => t.passed === true).length / tests.length

  // Save and continue
  const handleSaveAndContinue = async () => {
    try {
      setSaving(true)
      setError(null)

      // Save HBU analysis
      await hbuApi.create({
        valuationId,
        legallyPermissible: tests.find(t => t.id === 'legally_permissible')?.passed || false,
        physicallyPossible: tests.find(t => t.id === 'physically_possible')?.passed || false,
        financiallyFeasible: tests.find(t => t.id === 'financially_feasible')?.passed || false,
        maximallyProductive: tests.find(t => t.id === 'maximally_productive')?.passed || false,
        recommendedUse,
        analysisNotes,
        tests: tests as unknown as HBUTest[],
        scenarios: scenarios as unknown as UseScenario[],
      })

      // Update valuation progress
      await valuationsApi.update(valuationId, {
        current_step: 3,
      })

      // Navigate to next step
      router.push(`/dashboard/valuations/${valuationId}/methods`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save HBU analysis')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <span className="ml-3 font-mono text-sm text-zinc-400">Loading HBU analysis...</span>
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

  const property = valuation.property
  const currentTest = tests.find(t => t.id === activeTest)

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
              <h1 className="font-mono text-xl text-white">STEP 2: HBU ANALYSIS</h1>
              <StatusBadge status="in_progress" />
            </div>
            <p className="font-mono text-[10px] text-zinc-500">
              Highest & Best Use Determination • VAL-{valuationId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-mono text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                SAVE & CONTINUE
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step Progress */}
      <div className="mb-6">
        <StepIndicator
          steps={[
            { id: 1, label: 'Property Setup', status: 'completed' },
            { id: 2, label: 'HBU Analysis', status: 'current' },
            { id: 3, label: 'Method Selection', status: 'upcoming' },
            { id: 4, label: 'Valuation', status: 'upcoming' },
            { id: 5, label: 'Reconciliation', status: 'upcoming' },
            { id: 6, label: 'Report', status: 'upcoming' },
          ]}
        />
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-blue-900/20 border border-blue-500/30 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-mono text-sm text-blue-400">Highest & Best Use (HBU) Analysis</div>
          <div className="font-mono text-xs text-zinc-400 mt-1">
            The HBU is the reasonably probable use of property that results in the highest value. 
            A use must be legally permissible, physically possible, financially feasible, and maximally productive.
          </div>
        </div>
      </div>

      {/* HBU Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {tests.map((test) => (
          <button
            key={test.id}
            onClick={() => setActiveTest(test.id)}
            className={`p-4 border transition-colors text-left ${
              activeTest === test.id 
                ? 'border-amber-500 bg-amber-500/10' 
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={activeTest === test.id ? 'text-amber-400' : 'text-zinc-500'}>
                {test.icon}
              </div>
              {test.passed === true && <CheckCircle2 className="w-4 h-4 text-green-400" />}
              {test.passed === false && <XCircle className="w-4 h-4 text-red-400" />}
              {test.passed === null && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
            </div>
            <div className={`font-mono text-xs ${activeTest === test.id ? 'text-white' : 'text-zinc-400'}`}>
              {test.name.toUpperCase()}
            </div>
            <div className="font-mono text-[10px] text-zinc-600 mt-1">
              {test.factors.filter(f => f.value !== null).length}/{test.factors.length} assessed
            </div>
          </button>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Test Details */}
        <TerminalPanel title={currentTest?.name.toUpperCase() || 'TEST'} className="col-span-2">
          <div className="mb-4">
            <div className="font-mono text-xs text-zinc-400">{currentTest?.description}</div>
          </div>

          {/* Factors */}
          <div className="space-y-3">
            {currentTest?.factors.map((factor, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-zinc-800/30 border border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 text-center">
                    <span className="font-mono text-[10px] text-zinc-500">{factor.weight}%</span>
                  </div>
                  <span className="font-mono text-sm text-white">{factor.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateFactorValue(activeTest, idx, true)}
                    className={`px-3 py-1.5 font-mono text-xs transition-colors ${
                      factor.value === true 
                        ? 'bg-green-500 text-black font-bold' 
                        : 'bg-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    PASS
                  </button>
                  <button
                    onClick={() => updateFactorValue(activeTest, idx, false)}
                    className={`px-3 py-1.5 font-mono text-xs transition-colors ${
                      factor.value === false 
                        ? 'bg-red-500 text-white font-bold' 
                        : 'bg-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    FAIL
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Test Notes */}
          <div className="mt-4">
            <label className="font-mono text-[10px] text-zinc-500 mb-1 block">NOTES</label>
            <textarea
              value={currentTest?.notes || ''}
              onChange={(e) => updateTestNotes(activeTest, e.target.value)}
              placeholder="Add supporting notes or observations..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </TerminalPanel>

        {/* HBU Summary */}
        <TerminalPanel title="HBU SUMMARY">
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="mb-2">
                {allTestsPassed ? (
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
                ) : someTestsPassed ? (
                  <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto" />
                ) : (
                  <XCircle className="w-12 h-12 text-zinc-600 mx-auto" />
                )}
              </div>
              <div className={`font-mono text-2xl ${
                allTestsPassed ? 'text-green-400' : someTestsPassed ? 'text-yellow-400' : 'text-zinc-500'
              }`}>
                {(hbuScore * 100).toFixed(0)}%
              </div>
              <div className="font-mono text-[10px] text-zinc-500">HBU SCORE</div>
            </div>

            <div>
              <div className="font-mono text-[10px] text-zinc-500 mb-2">TEST RESULTS</div>
              {tests.map((test) => (
                <div key={test.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <span className="font-mono text-xs text-zinc-400">{test.name}</span>
                  {test.passed === true && <span className="font-mono text-[10px] text-green-400">PASS</span>}
                  {test.passed === false && <span className="font-mono text-[10px] text-red-400">FAIL</span>}
                  {test.passed === null && <span className="font-mono text-[10px] text-zinc-600">—</span>}
                </div>
              ))}
            </div>

            {recommendedUse && (
              <div className="pt-4 border-t border-zinc-800">
                <div className="font-mono text-[10px] text-zinc-500 mb-1">RECOMMENDED USE</div>
                <div className="font-mono text-sm text-amber-400">{recommendedUse}</div>
              </div>
            )}
          </div>
        </TerminalPanel>
      </div>

      {/* Use Scenarios */}
      <TerminalPanel title="ALTERNATIVE USE SCENARIOS" className="mt-4">
        <div className="mb-4 flex justify-between items-center">
          <div className="font-mono text-xs text-zinc-400">
            Compare potential uses to determine the maximally productive option
          </div>
          <button
            onClick={addScenario}
            className="flex items-center gap-1 px-3 py-2 bg-zinc-800 text-zinc-400 font-mono text-xs hover:text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            ADD SCENARIO
          </button>
        </div>

        {scenarios.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-zinc-800">
            <Scale className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <div className="font-mono text-sm text-zinc-500 mb-1">No scenarios added yet</div>
            <div className="font-mono text-[10px] text-zinc-600">
              Add alternative use scenarios to compare their financial viability
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-mono text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2 w-48">USE SCENARIO</th>
                <th className="text-left pb-2 w-28">TYPE</th>
                <th className="text-right pb-2 w-32">EST. VALUE</th>
                <th className="text-right pb-2 w-32">DEV. COST</th>
                <th className="text-right pb-2 w-32">ANNUAL INCOME</th>
                <th className="text-right pb-2 w-24">ROI</th>
                <th className="text-center pb-2 w-20">SELECT</th>
                <th className="text-right pb-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {scenarios.map((scenario) => (
                <tr key={scenario.id} className={`border-b border-zinc-800/50 ${
                  scenario.selected ? 'bg-amber-500/10' : ''
                }`}>
                  <td className="py-2">
                    <input
                      type="text"
                      value={scenario.name}
                      onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
                      placeholder="Enter use name..."
                      className="w-full bg-transparent text-white placeholder-zinc-600 focus:outline-none"
                    />
                  </td>
                  <td className="py-2">
                    <select
                      value={scenario.propertyType}
                      onChange={(e) => updateScenario(scenario.id, { propertyType: e.target.value })}
                      className="bg-transparent text-white focus:outline-none"
                    >
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                      <option value="industrial">Industrial</option>
                      <option value="mixed_use">Mixed Use</option>
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      value={scenario.estimatedValue || ''}
                      onChange={(e) => updateScenario(scenario.id, { estimatedValue: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full text-right bg-transparent text-green-400 placeholder-zinc-600 focus:outline-none"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      value={scenario.developmentCost || ''}
                      onChange={(e) => updateScenario(scenario.id, { developmentCost: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full text-right bg-transparent text-red-400 placeholder-zinc-600 focus:outline-none"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      value={scenario.annualIncome || ''}
                      onChange={(e) => updateScenario(scenario.id, { annualIncome: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full text-right bg-transparent text-blue-400 placeholder-zinc-600 focus:outline-none"
                    />
                  </td>
                  <td className={`py-2 text-right ${scenario.roi > 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                    {scenario.roi > 0 ? `${scenario.roi.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => selectScenario(scenario.id)}
                      className={`w-6 h-6 border ${
                        scenario.selected 
                          ? 'border-amber-500 bg-amber-500' 
                          : 'border-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      {scenario.selected && <CheckCircle2 className="w-4 h-4 text-black mx-auto" />}
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => removeScenario(scenario.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TerminalPanel>

      {/* Analysis Notes */}
      <TerminalPanel title="ANALYSIS NOTES" className="mt-4">
        <textarea
          value={analysisNotes}
          onChange={(e) => setAnalysisNotes(e.target.value)}
          placeholder="Document your HBU analysis rationale, supporting evidence, and conclusions..."
          rows={4}
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
        />
      </TerminalPanel>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <Link
          href={`/dashboard/valuations/${valuationId}/property`}
          className="px-6 py-3 bg-zinc-800 text-zinc-400 font-mono text-sm hover:text-white transition-colors"
        >
          ← BACK TO PROPERTY SETUP
        </Link>
        <button
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-black font-mono text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SAVING...
            </>
          ) : (
            <>
              CONTINUE TO METHOD SELECTION
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
