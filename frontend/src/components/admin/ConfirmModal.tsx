'use client'

import { useEffect, useState } from 'react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: React.ReactNode
  /** If set, the user must type this exact string to enable the confirm button (for destructive deletes). */
  confirmWord?: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

/**
 * Admin confirmation dialog. For destructive actions pass `confirmWord` (e.g. the
 * org/user name) — the confirm button stays disabled until the user types it exactly.
 */
export function ConfirmModal({
  open, title, message, confirmWord, confirmLabel = 'Confirm',
  danger = true, busy = false, error, onConfirm, onClose,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('')
  useEffect(() => { if (open) setTyped('') }, [open])
  if (!open) return null

  const ready = !confirmWord || typed.trim() === confirmWord

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-lg p-6 font-mono shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-foreground font-bold text-base mb-2">{title}</h3>
        <div className="text-sm text-muted-foreground mb-4 leading-relaxed">{message}</div>

        {confirmWord && (
          <div className="mb-4">
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Type <span className="text-foreground font-bold">{confirmWord}</span> to confirm:
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoFocus
              className="w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready || busy}
            className={`px-4 py-2 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
