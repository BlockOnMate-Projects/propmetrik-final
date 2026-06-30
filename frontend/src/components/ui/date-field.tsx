'use client'

import React, { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * DateField — Ghana-format (dd/mm/yyyy) date input.
 *
 * Drop-in replacement for `<input type="date">`:
 *   - `value` / `onChange` use the SAME ISO `yyyy-mm-dd` string contract, so existing
 *     handlers written as `onChange={(e) => set(e.target.value)}` keep working unchanged.
 *   - Displays and accepts typing as **dd/mm/yyyy** regardless of the browser locale
 *     (native `<input type="date">` follows the browser language, which we don't control).
 *   - A calendar icon still opens the native OS date picker for convenience.
 *
 * Storage stays ISO (`yyyy-mm-dd`) — only the display/entry format is Ghanaian.
 */

function isoToDisplay(iso?: string): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Parse "dd/mm/yyyy" → ISO "yyyy-mm-dd", or '' if incomplete/invalid. */
function displayToIso(display: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display.trim())
  if (!m) return ''
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const year = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  const d = new Date(Date.UTC(year, month - 1, day))
  // Reject overflow (e.g. 31/02 → Mar 3)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Auto-insert slashes while typing digits. */
function maskTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter((p, i) => i === 0 || digits.length > i * 2)
  return parts.join('/')
}

export interface DateFieldProps {
  value?: string
  /** Receives a synthetic event mirroring a native date input: e.target.value is ISO (yyyy-mm-dd) or ''. */
  onChange?: (e: { target: { value: string } }) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  id?: string
  name?: string
  placeholder?: string
  className?: string
  'aria-label'?: string
}

export function DateField({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  id,
  name,
  placeholder = 'dd/mm/yyyy',
  className,
  ...rest
}: DateFieldProps) {
  const nativeRef = useRef<HTMLInputElement>(null)
  const [text, setText] = React.useState<string>(() => isoToDisplay(value))

  // Keep the visible text in sync when the controlled ISO value changes externally.
  React.useEffect(() => {
    setText(isoToDisplay(value))
  }, [value])

  const emit = (iso: string) => onChange?.({ target: { value: iso } })

  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskTyping(e.target.value)
    setText(masked)
    const iso = displayToIso(masked)
    if (iso || masked === '') emit(iso) // only propagate a complete (or cleared) date
  }

  const openPicker = () => {
    const el = nativeRef.current
    if (!el || disabled) return
    if (typeof (el as any).showPicker === 'function') (el as any).showPicker()
    else el.click()
  }

  return (
    <div className={cn('relative', className)}>
      <input
        type="text"
        inputMode="numeric"
        id={id}
        name={name}
        value={text}
        onChange={handleText}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full bg-transparent outline-none pr-7"
        autoComplete="off"
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <Calendar className="h-3.5 w-3.5" />
      </button>
      {/* Hidden native date input drives the OS calendar picker; its value is ISO. */}
      <input
        ref={nativeRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => { setText(isoToDisplay(e.target.value)); emit(e.target.value) }}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only absolute inset-0 h-0 w-0 opacity-0 pointer-events-none"
      />
    </div>
  )
}

export default DateField
