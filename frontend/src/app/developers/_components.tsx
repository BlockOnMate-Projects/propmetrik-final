'use client'

import { useState } from 'react'
import { Copy, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Card({ title, action, className, children }: { title?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('border border-border bg-card/40 rounded-xl overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="border border-border bg-card/40 rounded-xl p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold mt-1 tabular-nums', accent ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) }}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-border rounded hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
    >
      {ok ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {label ?? (ok ? 'Copied' : 'Copy')}
    </button>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="text-center py-10 text-sm text-muted-foreground">{children}</div>
}

export function Button({ children, onClick, variant = 'primary', disabled, type = 'button', className }: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  const styles = {
    primary: 'bg-amber-500 hover:bg-amber-600 text-white',
    ghost: 'border border-border hover:bg-muted text-foreground',
    danger: 'border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn('inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed', styles, className)}
    >
      {children}
    </button>
  )
}
