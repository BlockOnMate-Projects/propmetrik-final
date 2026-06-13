'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  DollarSign,
  ChevronDown,
  X,
  Check,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// =====================================================
// TYPES
// =====================================================
export interface FundingSource {
  id: string
  label: string
  category?: string
}

interface FundingSourcesSelectProps {
  value: string[]
  onChange: (sources: string[]) => void
  sources?: FundingSource[]
  placeholder?: string
  maxSelections?: number
  allowCustom?: boolean
  className?: string
  error?: string
}

// =====================================================
// DEFAULT FUNDING SOURCES
// =====================================================
const DEFAULT_FUNDING_SOURCES: FundingSource[] = [
  // Bank Financing
  { id: 'bank_loan', label: 'Bank Loan', category: 'Bank Financing' },
  { id: 'construction_loan', label: 'Construction Loan', category: 'Bank Financing' },
  { id: 'mortgage_facility', label: 'Mortgage Facility', category: 'Bank Financing' },
  { id: 'bridge_loan', label: 'Bridge Loan', category: 'Bank Financing' },
  
  // Equity
  { id: 'owner_equity', label: 'Owner Equity', category: 'Equity' },
  { id: 'partner_investment', label: 'Partner Investment', category: 'Equity' },
  { id: 'private_equity', label: 'Private Equity', category: 'Equity' },
  { id: 'joint_venture', label: 'Joint Venture', category: 'Equity' },
  
  // Sales & Pre-sales
  { id: 'presales', label: 'Pre-Sales Deposits', category: 'Sales Revenue' },
  { id: 'unit_sales', label: 'Unit Sales', category: 'Sales Revenue' },
  { id: 'off_plan_sales', label: 'Off-Plan Sales', category: 'Sales Revenue' },
  
  // Government & Institutional
  { id: 'government_grant', label: 'Government Grant', category: 'Government' },
  { id: 'nhf_fund', label: 'National Housing Fund', category: 'Government' },
  { id: 'ssnit_financing', label: 'SSNIT Financing', category: 'Government' },
  { id: 'affordable_housing_fund', label: 'Affordable Housing Fund', category: 'Government' },
  
  // Alternative
  { id: 'crowdfunding', label: 'Crowdfunding', category: 'Alternative' },
  { id: 'pension_fund', label: 'Pension Fund Investment', category: 'Alternative' },
  { id: 'insurance_fund', label: 'Insurance Fund', category: 'Alternative' },
  { id: 'diaspora_investment', label: 'Diaspora Investment', category: 'Alternative' },
  { id: 'reit', label: 'REIT Investment', category: 'Alternative' },
  
  // Other
  { id: 'seller_financing', label: 'Seller Financing', category: 'Other' },
  { id: 'retained_earnings', label: 'Retained Earnings', category: 'Other' },
  { id: 'other', label: 'Other', category: 'Other' },
]

// =====================================================
// GROUPED SOURCES HELPER
// =====================================================
function groupByCategory(sources: FundingSource[]): Record<string, FundingSource[]> {
  return sources.reduce((groups, source) => {
    const category = source.category || 'Other'
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(source)
    return groups
  }, {} as Record<string, FundingSource[]>)
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export function FundingSourcesSelect({
  value,
  onChange,
  sources = DEFAULT_FUNDING_SOURCES,
  placeholder = 'Select funding sources...',
  maxSelections,
  allowCustom = false,
  className,
  error,
}: FundingSourcesSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [customInput, setCustomInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Group sources by category
  const groupedSources = groupByCategory(sources)

  // Filter sources based on search
  const filteredGroups = Object.entries(groupedSources).reduce((acc, [category, items]) => {
    const filtered = items.filter(item =>
      item.label.toLowerCase().includes(searchTerm.toLowerCase())
    )
    if (filtered.length > 0) {
      acc[category] = filtered
    }
    return acc
  }, {} as Record<string, FundingSource[]>)

  // Handle selection
  const handleSelect = useCallback((sourceId: string) => {
    if (value.includes(sourceId)) {
      onChange(value.filter(id => id !== sourceId))
    } else {
      if (maxSelections && value.length >= maxSelections) {
        return
      }
      onChange([...value, sourceId])
    }
  }, [value, onChange, maxSelections])

  // Handle remove
  const handleRemove = useCallback((sourceId: string) => {
    onChange(value.filter(id => id !== sourceId))
  }, [value, onChange])

  // Handle add custom
  const handleAddCustom = useCallback(() => {
    if (customInput.trim() && !value.includes(customInput.trim())) {
      onChange([...value, customInput.trim()])
      setCustomInput('')
    }
  }, [customInput, value, onChange])

  // Get label for source ID
  const getLabel = (sourceId: string): string => {
    const source = sources.find(s => s.id === sourceId)
    return source?.label || sourceId
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const isAtMax = maxSelections ? value.length >= maxSelections : false

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Label */}
      <div className="flex items-center gap-2 mb-1.5">
        <DollarSign className="h-4 w-4 text-amber-500" />
        <span className="font-mono text-xs text-amber-500 tracking-wider">
          FUNDING SOURCES
        </span>
        {maxSelections && (
          <span className="font-mono text-[10px] text-muted-foreground">
            ({value.length}/{maxSelections})
          </span>
        )}
      </div>

      {/* Selected items display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "min-h-[42px] p-2 bg-card border rounded cursor-pointer transition-colors",
          isOpen ? "border-amber-500 ring-1 ring-amber-500/20" : "border-border hover:border-zinc-600",
          error && "border-red-500"
        )}
      >
        <div className="flex flex-wrap gap-1.5 items-center">
          {value.length === 0 ? (
            <span className="font-mono text-xs text-muted-foreground">{placeholder}</span>
          ) : (
            value.map(sourceId => (
              <Badge
                key={sourceId}
                variant="secondary"
                className="bg-muted text-muted-foreground hover:bg-zinc-700 gap-1"
              >
                {getLabel(sourceId)}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(sourceId)
                  }}
                  className="hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground ml-auto transition-transform",
            isOpen && "transform rotate-180"
          )} />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="font-mono text-[10px] text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded shadow-xl max-h-80 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search funding sources..."
              className="w-full px-2 py-1.5 bg-muted border border-border rounded font-mono text-xs text-zinc-100 placeholder:text-muted-foreground focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Grouped options */}
          <div className="overflow-y-auto max-h-60">
            {Object.entries(filteredGroups).map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1.5 bg-muted/50 sticky top-0">
                  <span className="font-mono text-[10px] text-amber-500/80 uppercase tracking-wider">
                    {category}
                  </span>
                </div>
                {items.map(source => {
                  const isSelected = value.includes(source.id)
                  const isDisabled = isAtMax && !isSelected

                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => handleSelect(source.id)}
                      disabled={isDisabled}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-left transition-colors",
                        isSelected ? "bg-amber-500/10" : "hover:bg-muted",
                        isDisabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className={cn(
                        "font-mono text-xs",
                        isSelected ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                      )}>
                        {source.label}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-amber-500" />}
                    </button>
                  )
                })}
              </div>
            ))}

            {/* No results */}
            {Object.keys(filteredGroups).length === 0 && (
              <div className="p-4 text-center">
                <span className="font-mono text-xs text-muted-foreground">No matching sources found</span>
              </div>
            )}
          </div>

          {/* Add custom option */}
          {allowCustom && (
            <div className="p-2 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustom()
                    }
                  }}
                  placeholder="Add custom source..."
                  className="flex-1 px-2 py-1.5 bg-muted border border-border rounded font-mono text-xs text-zinc-100 placeholder:text-muted-foreground focus:outline-none focus:border-amber-500"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddCustom}
                  disabled={!customInput.trim() || isAtMax}
                  className="border-border"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Max reached indicator */}
      {isAtMax && (
        <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mt-1">
          Maximum of {maxSelections} sources selected
        </p>
      )}
    </div>
  )
}

export default FundingSourcesSelect
