"use client"

import { useState, useEffect, useCallback } from 'react'
import { valuationConfigApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Scale,
  MapPin,
  Building2,
  History,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Edit2,
  X,
  Loader2,
} from 'lucide-react'

// =====================================================
// TYPES
// =====================================================

interface MaterialWeight {
  category: string
  display_name: string
  weight: number
  updated_at: string
}

interface RegionalFactor {
  region_code: string
  region_name: string
  location_factor: number
  updated_at: string
}

interface BaseCost {
  quality_tier: string
  display_name: string
  base_cost_per_sqm: number
  base_year: number
  updated_at: string
}

interface ConfigHistoryItem {
  id: string
  table_name: string
  record_id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_by: string
  changed_at: string
}

type TabType = 'weights' | 'regions' | 'costs' | 'history'

// =====================================================
// HELPER COMPONENTS
// =====================================================

function TabButton({ 
  active, 
  icon: Icon, 
  label, 
  onClick 
}: { 
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void 
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
        active 
          ? "border-amber-500 text-amber-500" 
          : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

function EditableCell({
  value,
  onChange,
  onSave,
  type = 'number',
  step = 0.01,
  min = 0,
  max,
  suffix,
  className,
}: {
  value: number
  onChange: (val: number) => void
  onSave: () => void
  type?: 'number' | 'percent'
  step?: number
  min?: number
  max?: number
  suffix?: string
  className?: string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value.toString())

  useEffect(() => {
    setLocalValue(value.toString())
  }, [value])

  const handleSave = () => {
    const num = parseFloat(localValue)
    if (!isNaN(num) && num >= min && (max === undefined || num <= max)) {
      onChange(num)
      onSave()
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          step={step}
          min={min}
          max={max}
          autoFocus
          className="w-24 px-2 py-1 bg-zinc-800 border border-amber-500 rounded text-right font-mono text-sm text-white focus:outline-none"
        />
        <button
          onClick={handleSave}
          className="p-1 hover:bg-green-500/20 rounded text-green-500"
        >
          <CheckCircle className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setLocalValue(value.toString())
            setIsEditing(false)
          }}
          className="p-1 hover:bg-red-500/20 rounded text-red-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2 group", className)}>
      <span className="font-mono text-sm">
        {type === 'percent' ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)}
        {suffix}
      </span>
      <button
        onClick={() => setIsEditing(true)}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-opacity"
      >
        <Edit2 className="w-3 h-3 text-zinc-400" />
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: 'success' | 'error' | 'loading' | null }) {
  if (!status) return null

  const config = {
    success: { icon: CheckCircle, text: 'Saved', color: 'text-green-500' },
    error: { icon: AlertCircle, text: 'Error', color: 'text-red-500' },
    loading: { icon: Loader2, text: 'Saving...', color: 'text-amber-500' },
  }

  const { icon: Icon, text, color } = config[status]

  return (
    <div className={cn("flex items-center gap-1 text-xs", color)}>
      <Icon className={cn("w-3 h-3", status === 'loading' && "animate-spin")} />
      {text}
    </div>
  )
}

// =====================================================
// MATERIAL WEIGHTS TAB
// =====================================================

function MaterialWeightsTab() {
  const [weights, setWeights] = useState<MaterialWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'success' | 'error' | 'loading' | null>>({})

  const fetchWeights = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await valuationConfigApi.getMaterialWeights()
      if (response.success && response.data) {
        setWeights(response.data)
      } else {
        setError('Failed to fetch material weights')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWeights()
  }, [fetchWeights])

  const handleUpdate = async (category: string, newWeight: number) => {
    const weight = weights.find(w => w.category === category)
    if (!weight) return

    setSaveStatus(prev => ({ ...prev, [category]: 'loading' }))

    try {
      const response = await valuationConfigApi.updateMaterialWeight(category, newWeight, 'admin')

      if (response.success) {
        setWeights(prev => prev.map(w => 
          w.category === category ? { ...w, weight: newWeight } : w
        ))
        setSaveStatus(prev => ({ ...prev, [category]: 'success' }))
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [category]: null })), 2000)
      } else {
        setSaveStatus(prev => ({ ...prev, [category]: 'error' }))
      }
    } catch {
      setSaveStatus(prev => ({ ...prev, [category]: 'error' }))
    }
  }

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        <span className="ml-2 text-zinc-400">Loading material weights...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
        <button onClick={fetchWeights} className="ml-4 text-amber-500 hover:underline">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Material Category Weights</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Weights used to calculate the weighted average Construction Cost Index. Total must equal 1.0 (100%)
          </p>
        </div>
        <div className={cn(
          "px-3 py-1 rounded font-mono text-sm",
          Math.abs(totalWeight - 1.0) < 0.001 
            ? "bg-green-500/20 text-green-500" 
            : "bg-red-500/20 text-red-500"
        )}>
          Total: {(totalWeight * 100).toFixed(1)}%
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Category</th>
              <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Display Name</th>
              <th className="text-right py-2 text-xs font-medium text-zinc-500 uppercase">Weight</th>
              <th className="text-center py-2 text-xs font-medium text-zinc-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((weight) => (
              <tr 
                key={weight.category} 
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
              >
                <td className="py-3">
                  <span className="font-mono text-sm text-zinc-300">{weight.category}</span>
                </td>
                <td className="py-3">
                  <span className="text-sm text-zinc-400">{weight.display_name}</span>
                </td>
                <td className="py-3 text-right">
                  <EditableCell
                    value={weight.weight}
                    onChange={(val) => handleUpdate(weight.category, val)}
                    onSave={() => {}}
                    type="percent"
                    step={0.01}
                    min={0}
                    max={1}
                  />
                </td>
                <td className="py-3 text-center">
                  <StatusBadge status={saveStatus[weight.category]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =====================================================
// REGIONAL FACTORS TAB
// =====================================================

function RegionalFactorsTab() {
  const [factors, setFactors] = useState<RegionalFactor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'success' | 'error' | 'loading' | null>>({})

  const fetchFactors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await valuationConfigApi.getRegionalFactors()
      if (response.success && response.data) {
        setFactors(response.data)
      } else {
        setError('Failed to fetch regional factors')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFactors()
  }, [fetchFactors])

  const handleUpdate = async (regionCode: string, newFactor: number) => {
    const factor = factors.find(f => f.region_code === regionCode)
    if (!factor) return

    setSaveStatus(prev => ({ ...prev, [regionCode]: 'loading' }))

    try {
      const response = await valuationConfigApi.updateRegionalFactor(regionCode, newFactor, 'admin')

      if (response.success) {
        setFactors(prev => prev.map(f => 
          f.region_code === regionCode ? { ...f, location_factor: newFactor } : f
        ))
        setSaveStatus(prev => ({ ...prev, [regionCode]: 'success' }))
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [regionCode]: null })), 2000)
      } else {
        setSaveStatus(prev => ({ ...prev, [regionCode]: 'error' }))
      }
    } catch {
      setSaveStatus(prev => ({ ...prev, [regionCode]: 'error' }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        <span className="ml-2 text-zinc-400">Loading regional factors...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
        <button onClick={fetchFactors} className="ml-4 text-amber-500 hover:underline">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-white">Regional Location Factors</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Location multipliers for construction costs. 1.0 = baseline, &gt;1.0 = higher cost region, &lt;1.0 = lower cost region
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {factors.map((factor) => (
          <div 
            key={factor.region_code}
            className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-medium text-white">{factor.region_name}</div>
                <div className="text-xs text-zinc-500 font-mono">{factor.region_code}</div>
              </div>
              <StatusBadge status={saveStatus[factor.region_code]} />
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500" />
              <EditableCell
                value={factor.location_factor}
                onChange={(val) => handleUpdate(factor.region_code, val)}
                onSave={() => {}}
                step={0.01}
                min={0.5}
                max={2.0}
                suffix="x"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// BASE COSTS TAB
// =====================================================

function BaseCostsTab() {
  const [costs, setCosts] = useState<BaseCost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'success' | 'error' | 'loading' | null>>({})

  const fetchCosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await valuationConfigApi.getBaseCosts()
      if (response.success && response.data) {
        setCosts(response.data)
      } else {
        setError('Failed to fetch base costs')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCosts()
  }, [fetchCosts])

  const handleUpdate = async (qualityTier: string, newCost: number) => {
    const cost = costs.find(c => c.quality_tier === qualityTier)
    if (!cost) return

    setSaveStatus(prev => ({ ...prev, [qualityTier]: 'loading' }))

    try {
      const response = await valuationConfigApi.updateBaseCost(qualityTier, newCost, 'admin')

      if (response.success) {
        setCosts(prev => prev.map(c => 
          c.quality_tier === qualityTier ? { ...c, base_cost_per_sqm: newCost } : c
        ))
        setSaveStatus(prev => ({ ...prev, [qualityTier]: 'success' }))
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [qualityTier]: null })), 2000)
      } else {
        setSaveStatus(prev => ({ ...prev, [qualityTier]: 'error' }))
      }
    } catch {
      setSaveStatus(prev => ({ ...prev, [qualityTier]: 'error' }))
    }
  }

  const tierColors: Record<string, string> = {
    luxury: 'bg-purple-500',
    high: 'bg-blue-500',
    standard: 'bg-green-500',
    basic: 'bg-yellow-500',
    substandard: 'bg-zinc-500',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        <span className="ml-2 text-zinc-400">Loading base costs...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
        <button onClick={fetchCosts} className="ml-4 text-amber-500 hover:underline">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-white">Base Construction Costs (2020)</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Reference costs per square meter by quality tier. These are indexed forward using the Construction Cost Index.
        </p>
      </div>

      <div className="space-y-3">
        {costs.map((cost) => (
          <div 
            key={cost.quality_tier}
            className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50"
          >
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full", tierColors[cost.quality_tier] || 'bg-zinc-500')} />
              <div>
                <div className="font-medium text-white">{cost.display_name}</div>
                <div className="text-xs text-zinc-500">
                  Base Year: {cost.base_year} | Tier: {cost.quality_tier}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-500" />
                <span className="text-zinc-400 text-sm">GHS</span>
                <EditableCell
                  value={cost.base_cost_per_sqm}
                  onChange={(val) => handleUpdate(cost.quality_tier, val)}
                  onSave={() => {}}
                  step={100}
                  min={500}
                  max={50000}
                  suffix="/sqm"
                />
              </div>
              <StatusBadge status={saveStatus[cost.quality_tier]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// HISTORY TAB
// =====================================================

function HistoryTab() {
  const [history, setHistory] = useState<ConfigHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState<string>('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await valuationConfigApi.getConfigHistory(tableFilter || undefined)
      if (response.success && response.data) {
        setHistory(response.data)
      } else {
        setError('Failed to fetch history')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [tableFilter])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const tableNames = [
    { value: '', label: 'All Tables' },
    { value: 'material_category_weights', label: 'Material Weights' },
    { value: 'regional_location_factors', label: 'Regional Factors' },
    { value: 'base_construction_costs', label: 'Base Costs' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        <span className="ml-2 text-zinc-400">Loading history...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
        <button onClick={fetchHistory} className="ml-4 text-amber-500 hover:underline">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Configuration Change History</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Audit trail of all valuation configuration changes
          </p>
        </div>
        <select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:border-amber-500 focus:outline-none"
        >
          {tableNames.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          No configuration changes recorded yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Time</th>
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Table</th>
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Field</th>
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Old Value</th>
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">New Value</th>
                <th className="text-left py-2 text-xs font-medium text-zinc-500 uppercase">Changed By</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-3">
                    <span className="text-xs text-zinc-400">
                      {new Date(item.changed_at).toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-xs text-zinc-300">
                      {item.table_name.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-xs text-amber-500">{item.field_name}</span>
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-xs text-red-400">{item.old_value || '—'}</span>
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-xs text-green-400">{item.new_value}</span>
                  </td>
                  <td className="py-3">
                    <span className="text-xs text-zinc-500">{item.changed_by}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =====================================================
// MAIN PAGE COMPONENT
// =====================================================

export default function ValuationConfigPage() {
  const [activeTab, setActiveTab] = useState<TabType>('weights')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Scale className="w-7 h-7 text-amber-500" />
            Valuation Configuration
          </h1>
          <p className="text-zinc-400 mt-1">
            Manage material weights, regional factors, and base construction costs
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <div className="flex gap-2">
          <TabButton
            active={activeTab === 'weights'}
            icon={Scale}
            label="Material Weights"
            onClick={() => setActiveTab('weights')}
          />
          <TabButton
            active={activeTab === 'regions'}
            icon={MapPin}
            label="Regional Factors"
            onClick={() => setActiveTab('regions')}
          />
          <TabButton
            active={activeTab === 'costs'}
            icon={Building2}
            label="Base Costs"
            onClick={() => setActiveTab('costs')}
          />
          <TabButton
            active={activeTab === 'history'}
            icon={History}
            label="Change History"
            onClick={() => setActiveTab('history')}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-6">
        {activeTab === 'weights' && <MaterialWeightsTab />}
        {activeTab === 'regions' && <RegionalFactorsTab />}
        {activeTab === 'costs' && <BaseCostsTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  )
}
