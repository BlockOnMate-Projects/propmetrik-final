'use client'

import React from 'react'

/**
 * Displays field-level validation errors below a form input.
 *
 * Usage:
 *   <Input ... />
 *   <FieldError errors={errors} field="title" />
 */
export function FieldError({
  errors,
  field,
}: {
  errors?: Record<string, string[]> | null
  field: string
}) {
  if (!errors || !errors[field]?.length) return null
  return (
    <p className="text-[10px] text-red-600 dark:text-red-400 font-mono mt-0.5">
      {errors[field][0]}
    </p>
  )
}

/**
 * Displays a summary of all validation errors at the top of a form.
 *
 * Usage:
 *   <FormErrorSummary errors={errors} />
 */
export function FormErrorSummary({
  errors,
}: {
  errors?: Record<string, string[]> | null
}) {
  if (!errors) return null
  const messages = Object.values(errors).flat()
  if (messages.length === 0) return null

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-3">
      <p className="text-[10px] text-red-600 dark:text-red-400 font-mono font-medium mb-1 uppercase tracking-wider">
        Please fix the following:
      </p>
      <ul className="list-disc list-inside space-y-0.5">
        {messages.map((msg, i) => (
          <li key={i} className="text-[10px] text-red-600 dark:text-red-400/80 font-mono">{msg}</li>
        ))}
      </ul>
    </div>
  )
}
