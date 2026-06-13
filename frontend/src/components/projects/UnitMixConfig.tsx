'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Home,
  Plus,
  Minus,
  Trash2,
  Building2,
  Bed,
  PieChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// =====================================================
// TYPES
// =====================================================
export interface UnitMixItem {
  id: string
  type: string
  unitType: string
  label: string
  count: number
  avgSize?: number
  avgSizeSqm?: number
  avgPrice?: number
  basePrice?: number
}

// Alias for backward compatibility
export type UnitType = UnitMixItem

export interface UnitMixConfigProps {
  value: UnitMixItem[]
  onChange: (items: UnitMixItem[]) => void
  totalUnits?: number
  currency?: string
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================
const UNIT_TYPES = [
  { type: 'studio', label: 'Studio', icon: Home, bedrooms: 0 },
  { type: 'one_bed', label: '1 Bedroom', icon: Bed, bedrooms: 1 },
  { type: 'two_bed', label: '2 Bedroom', icon: Bed, bedrooms: 2 },
  { type: 'three_bed', label: '3 Bedroom', icon: Bed, bedrooms: 3 },
  { type: 'four_bed', label: '4 Bedroom', icon: Bed, bedrooms: 4 },
  { type: 'five_plus_bed', label: '5+ Bedroom', icon: Bed, bedrooms: 5 },
  { type: 'penthouse', label: 'Penthouse', icon: Building2, bedrooms: null },
  { type: 'townhouse', label: 'Townhouse', icon: Home, bedrooms: null },
  { type: 'villa', label: 'Villa', icon: Home, bedrooms: null },
  { type: 'duplex', label: 'Duplex', icon: Building2, bedrooms: null },
]

const COLORS = [
  'bg-amber-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-red-500',
  'bg-teal-500',
  'bg-indigo-500',
]

// =====================================================
// UNIT MIX PIE CHART
// =====================================================
function UnitMixChart({ items, total }: { items: UnitMixItem[]; total: number }) {
  const validItems = items.filter(item => item.count > 0)
  
  if (validItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <span className="font-mono text-xs">Add units to see distribution</span>
      </div>
    )
  }

  // Calculate percentages
  const withPercentages = validItems.map((item, index) => ({
    ...item,
    percentage: (item.count / total) * 100,
    color: COLORS[index % COLORS.length],
  }))

  // Create bar segments
  let accumulatedPercent = 0

  return (
    <div className="space-y-3">
      {/* Horizontal stacked bar */}
      <div className="h-6 flex rounded overflow-hidden bg-muted">
        {withPercentages.map((item) => {
          accumulatedPercent += item.percentage
          return (
            <div
              key={item.id}
              className={cn(item.color, "transition-all hover:opacity-80 relative group")}
              style={{ width: `${item.percentage}%` }}
            >
              {item.percentage >= 10 && (
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-foreground font-medium">
                  {Math.round(item.percentage)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {withPercentages.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-sm", item.color)} />
            <span className="font-mono text-[10px] text-muted-foreground flex-1 truncate">
              {item.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground font-medium">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// UNIT TYPE ROW
// =====================================================
function UnitTypeRow({
  item,
  colorIndex,
  onUpdate,
  onRemove,
  currency = 'GHS',
}: {
  item: UnitMixItem
  colorIndex: number
  onUpdate: (updates: Partial<UnitMixItem>) => void
  onRemove: () => void
  currency?: string
}) {
  const config = UNIT_TYPES.find(t => t.type === item.type)
  const Icon = config?.icon || Home

  return (
    <div className="flex items-center gap-3 p-2 bg-card/50 border border-border rounded">
      {/* Color indicator */}
      <div className={cn("w-1 h-12 rounded", COLORS[colorIndex % COLORS.length])} />
      
      {/* Type info */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">{item.label}</span>
      </div>

      {/* Count controls */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onUpdate({ count: Math.max(0, item.count - 1) })}
          disabled={item.count <= 0}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          min={0}
          value={item.count}
          onChange={(e) => onUpdate({ count: parseInt(e.target.value) || 0 })}
          className="w-16 h-7 text-center font-mono text-sm bg-muted border-border"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onUpdate({ count: item.count + 1 })}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Avg Size (optional) */}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          placeholder="sqm"
          value={item.avgSize || ''}
          onChange={(e) => onUpdate({ avgSize: parseFloat(e.target.value) || undefined })}
          className="w-20 h-7 font-mono text-xs bg-muted border-border"
        />
        <span className="font-mono text-[10px] text-muted-foreground">sqm</span>
      </div>

      {/* Avg Price (optional) */}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          placeholder="Price"
          value={item.avgPrice || ''}
          onChange={(e) => onUpdate({ avgPrice: parseFloat(e.target.value) || undefined })}
          className="w-24 h-7 font-mono text-xs bg-muted border-border"
        />
        <span className="font-mono text-[10px] text-muted-foreground">{currency}</span>
      </div>

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-red-400"
        onClick={onRemove}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}

// =====================================================
// MAIN UNIT MIX CONFIG COMPONENT
// =====================================================
export function UnitMixConfig({
  value,
  onChange,
  totalUnits,
  currency = 'GHS',
  className,
}: UnitMixConfigProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)

  // Calculate total from items
  const calculatedTotal = useMemo(() => {
    return value.reduce((sum, item) => sum + item.count, 0)
  }, [value])

  // Get available types to add
  const availableTypes = useMemo(() => {
    const usedTypes = new Set(value.map(item => item.type))
    return UNIT_TYPES.filter(t => !usedTypes.has(t.type))
  }, [value])

  // Add unit type
  const addUnitType = useCallback((type: string) => {
    const config = UNIT_TYPES.find(t => t.type === type)
    if (!config) return

    const newItem: UnitMixItem = {
      id: `${type}-${Date.now()}`,
      type,
      unitType: type,
      label: config.label,
      count: 0,
    }
    onChange([...value, newItem])
    setShowAddMenu(false)
  }, [value, onChange])

  // Update unit type
  const updateItem = useCallback((id: string, updates: Partial<UnitMixItem>) => {
    onChange(value.map(item => item.id === id ? { ...item, ...updates } : item))
  }, [value, onChange])

  // Remove unit type
  const removeItem = useCallback((id: string) => {
    onChange(value.filter(item => item.id !== id))
  }, [value, onChange])

  // Calculate summary
  const summary = useMemo(() => {
    const totalArea = value.reduce((sum, item) => {
      return sum + (item.count * (item.avgSize || 0))
    }, 0)
    
    const totalValue = value.reduce((sum, item) => {
      return sum + (item.count * (item.avgPrice || 0))
    }, 0)

    return { totalArea, totalValue }
  }, [value])

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-amber-500" />
          <span className="font-mono text-xs text-amber-500 tracking-wider">
            UNIT MIX CONFIGURATION
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground">
            Total: <span className="text-zinc-100">{calculatedTotal}</span>
            {totalUnits && totalUnits !== calculatedTotal && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">/ {totalUnits} target</span>
            )}
          </span>
        </div>
      </div>

      {/* Distribution chart */}
      <div className="p-3 bg-card/30 border border-border rounded">
        <UnitMixChart items={value} total={calculatedTotal || 1} />
      </div>

      {/* Unit type rows */}
      <div className="space-y-2">
        {/* Header row */}
        {value.length > 0 && (
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-1" />
            <div className="min-w-[120px] font-mono text-[10px] text-muted-foreground">Type</div>
            <div className="w-[108px] font-mono text-[10px] text-muted-foreground text-center">Count</div>
            <div className="w-[88px] font-mono text-[10px] text-muted-foreground">Avg Size</div>
            <div className="w-[100px] font-mono text-[10px] text-muted-foreground">Avg Price</div>
            <div className="w-7" />
          </div>
        )}

        {/* Items */}
        {value.map((item, index) => (
          <UnitTypeRow
            key={item.id}
            item={item}
            colorIndex={index}
            onUpdate={(updates) => updateItem(item.id, updates)}
            onRemove={() => removeItem(item.id)}
            currency={currency}
          />
        ))}

        {/* Empty state */}
        {value.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Home className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-mono text-xs">No unit types added yet</p>
            <p className="font-mono text-[10px]">Click below to add unit types</p>
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddMenu(!showAddMenu)}
          disabled={availableTypes.length === 0}
          className="w-full border-dashed border-border hover:border-zinc-600 hover:bg-card"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Unit Type
        </Button>

        {/* Dropdown menu */}
        {showAddMenu && availableTypes.length > 0 && (
          <div className="absolute z-10 w-full mt-1 py-1 bg-card border border-border rounded shadow-xl max-h-60 overflow-y-auto">
            {availableTypes.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.type}
                  type="button"
                  onClick={() => addUnitType(type.type)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">{type.label}</span>
                  {type.bedrooms !== null && (
                    <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                      {type.bedrooms} BR
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      {value.length > 0 && (summary.totalArea > 0 || summary.totalValue > 0) && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border border-border rounded">
          {summary.totalArea > 0 && (
            <div className="font-mono text-xs">
              <span className="text-muted-foreground">Total Area: </span>
              <span className="text-muted-foreground">{summary.totalArea.toLocaleString()} sqm</span>
            </div>
          )}
          {summary.totalValue > 0 && (
            <div className="font-mono text-xs">
              <span className="text-muted-foreground">Total Value: </span>
              <span className="text-amber-600 dark:text-amber-400">
                {currency} {summary.totalValue.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close menu */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowAddMenu(false)}
        />
      )}
    </div>
  )
}

export default UnitMixConfig
