'use client'

import React, { useState, useCallback, useId } from 'react'
import { Plus, X, Filter, ChevronDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
  FilterCondition,
  FilterGroup,
  FilterFieldDefinition,
  FilterOperator,
} from '@/types/crm-filters'
import { OPERATOR_LABELS, NO_VALUE_OPERATORS } from '@/types/crm-filters'

// =====================================================
// FILTER ROW
// =====================================================
function FilterRow({
  condition,
  fields,
  onUpdate,
  onRemove,
}: {
  condition: FilterCondition
  fields: FilterFieldDefinition[]
  onUpdate: (updated: FilterCondition) => void
  onRemove: () => void
}) {
  const field = fields.find((f) => f.key === condition.field)
  const isNoValue = NO_VALUE_OPERATORS.includes(condition.operator)

  return (
    <div className="flex items-center gap-2">
      {/* Field picker */}
      <Select
        value={condition.field || ''}
        onValueChange={(val) => {
          const newField = fields.find((f) => f.key === val)
          onUpdate({
            ...condition,
            field: val,
            operator: newField?.operators[0] || 'equals',
            value: '',
          })
        }}
      >
        <SelectTrigger className="w-44 h-8 text-xs">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.key} value={f.key} className="text-xs">
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator picker */}
      <Select
        value={condition.operator}
        onValueChange={(val) =>
          onUpdate({ ...condition, operator: val as FilterOperator, value: NO_VALUE_OPERATORS.includes(val as FilterOperator) ? '' : condition.value })
        }
      >
        <SelectTrigger className="w-40 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(field?.operators || []).map((op) => (
            <SelectItem key={op} value={op} className="text-xs">
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {!isNoValue && (
        <>
          {field?.type === 'select' || field?.type === 'multi-select' ? (
            <Select
              value={String(condition.value)}
              onValueChange={(val) => onUpdate({ ...condition, value: val })}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Select value" />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field?.type === 'date' ? (
            <Input
              type="date"
              value={String(condition.value || '')}
              onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
              className="w-44 h-8 text-xs"
            />
          ) : field?.type === 'number' ? (
            <Input
              type="number"
              value={String(condition.value || '')}
              onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
              placeholder="Value"
              className="w-44 h-8 text-xs"
            />
          ) : (
            <Input
              type="text"
              value={String(condition.value || '')}
              onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
              placeholder="Value"
              className="w-44 h-8 text-xs"
            />
          )}
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// =====================================================
// MAIN FILTER BUILDER
// =====================================================
interface FilterBuilderProps {
  fields: FilterFieldDefinition[]
  value: FilterGroup
  onChange: (filter: FilterGroup) => void
  className?: string
}

function generateFilterId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function FilterBuilder({ fields, value, onChange, className }: FilterBuilderProps) {
  const [open, setOpen] = useState(false)

  const addCondition = useCallback(() => {
    const defaultField = fields[0]
    const newCondition: FilterCondition = {
      id: generateFilterId(),
      field: defaultField?.key || '',
      operator: defaultField?.operators[0] || 'equals',
      value: '',
    }
    onChange({
      ...value,
      conditions: [...value.conditions, newCondition],
    })
  }, [fields, value, onChange])

  const updateCondition = useCallback(
    (updated: FilterCondition) => {
      onChange({
        ...value,
        conditions: value.conditions.map((c) => (c.id === updated.id ? updated : c)),
      })
    },
    [value, onChange]
  )

  const removeCondition = useCallback(
    (id: string) => {
      onChange({
        ...value,
        conditions: value.conditions.filter((c) => c.id !== id),
      })
    },
    [value, onChange]
  )

  const clearAll = useCallback(() => {
    onChange({ ...value, conditions: [] })
  }, [value, onChange])

  const activeCount = value.conditions.filter((c) => c.field && c.value !== '').length

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 gap-1.5 text-xs font-medium',
              activeCount > 0 && 'border-primary text-primary'
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {activeCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 px-1.5 text-[10px] font-semibold bg-primary text-primary-foreground"
              >
                {activeCount}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[600px] p-0" sideOffset={8}>
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Filters</span>
                {value.conditions.length > 1 && (
                  <Select
                    value={value.conjunction}
                    onValueChange={(v) => onChange({ ...value, conjunction: v as 'and' | 'or' })}
                  >
                    <SelectTrigger className="w-20 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and" className="text-xs">AND</SelectItem>
                      <SelectItem value="or" className="text-xs">OR</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              {value.conditions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {value.conditions.map((condition, idx) => (
                <div key={condition.id}>
                  {idx > 0 && (
                    <div className="text-[10px] font-medium text-muted-foreground uppercase px-1 py-1">
                      {value.conjunction}
                    </div>
                  )}
                  <FilterRow
                    condition={condition}
                    fields={fields}
                    onUpdate={updateCondition}
                    onRemove={() => removeCondition(condition.id)}
                  />
                </div>
              ))}

              {value.conditions.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No filters applied. Add a filter to narrow results.
                </p>
              )}
            </div>
          </div>

          <div className="p-2 bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={addCondition}
              className="h-8 text-xs text-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add filter
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter pills */}
      {value.conditions.filter((c) => c.field).map((c) => {
        const field = fields.find((f) => f.key === c.field)
        const isNoVal = NO_VALUE_OPERATORS.includes(c.operator)
        return (
          <Badge
            key={c.id}
            variant="secondary"
            className="h-7 gap-1 text-xs font-normal cursor-pointer hover:bg-destructive/10"
            onClick={() => removeCondition(c.id)}
          >
            <span className="font-medium">{field?.label}</span>
            <span className="text-muted-foreground">{OPERATOR_LABELS[c.operator]}</span>
            {!isNoVal && <span className="font-medium">{String(c.value)}</span>}
            <X className="h-3 w-3 ml-0.5" />
          </Badge>
        )
      })}
    </div>
  )
}

// =====================================================
// HELPER: Convert FilterGroup to API params
// =====================================================
export function filterGroupToParams(filterGroup: FilterGroup): Record<string, string> {
  const params: Record<string, string> = {}

  for (const condition of filterGroup.conditions) {
    if (!condition.field || (!condition.value && !NO_VALUE_OPERATORS.includes(condition.operator))) continue

    const { field, operator, value } = condition

    switch (operator) {
      case 'equals':
        params[field] = String(value)
        break
      case 'contains':
        // Backend search fields usually accept partial match via 'search' param
        params['search'] = String(value)
        break
      case 'greater_than':
      case 'greater_than_or_equal':
        params[`min_${field}`] = String(value)
        break
      case 'less_than':
      case 'less_than_or_equal':
        params[`max_${field}`] = String(value)
        break
      case 'before':
        params[`${field}_before`] = String(value)
        break
      case 'after':
        params[`${field}_after`] = String(value)
        break
      case 'in':
        params[field] = Array.isArray(value) ? value.join(',') : String(value)
        break
      default:
        params[field] = String(value)
    }
  }

  return params
}
