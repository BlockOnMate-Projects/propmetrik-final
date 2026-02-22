'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Check, Pencil, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface InlineEditProps {
  value: string | number | undefined | null
  onSave: (value: string) => Promise<void> | void
  /** Display formatter (e.g. currency formatter) */
  displayValue?: string
  /** Input type: text, number, date */
  type?: 'text' | 'number' | 'date'
  placeholder?: string
  className?: string
  inputClassName?: string
  /** If true, the entire area is clickable to start editing */
  fullClickArea?: boolean
}

export function InlineEdit({
  value,
  onSave,
  displayValue,
  type = 'text',
  placeholder = 'Click to edit',
  className,
  inputClassName,
  fullClickArea = true,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(String(value ?? ''))
      // Small delay so the input mounts first
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editing, value])

  const handleSave = useCallback(async () => {
    if (draft === String(value ?? '')) {
      setEditing(false)
      return
    }
    try {
      setSaving(true)
      await onSave(draft)
      setEditing(false)
    } catch {
      // Keep editing state on error
    } finally {
      setSaving(false)
    }
  }, [draft, value, onSave])

  const handleCancel = useCallback(() => {
    setDraft(String(value ?? ''))
    setEditing(false)
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    },
    [handleSave, handleCancel]
  )

  if (editing) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={saving}
          className={cn('h-7 text-sm px-2', inputClassName)}
        />
        <button
          onClick={handleSave}
          className="p-1 rounded hover:bg-primary/10 text-primary"
          tabIndex={-1}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground"
          tabIndex={-1}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const display = displayValue || String(value ?? '')

  return (
    <div
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-md transition-colors',
        fullClickArea && 'cursor-pointer hover:bg-muted/50 px-1.5 py-0.5 -mx-1.5 -my-0.5',
        className
      )}
      onClick={fullClickArea ? () => setEditing(true) : undefined}
    >
      <span className={cn(!display && 'text-muted-foreground italic')}>
        {display || placeholder}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  )
}
