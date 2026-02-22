'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// =====================================================
// TYPES
// =====================================================
export interface KeyboardShortcut {
  /** Display key(s) — e.g. "N", "G D", "⌘K" */
  keys: string
  /** Description shown in help dialog */
  description: string
  /** Category for grouping */
  category: 'navigation' | 'actions' | 'views' | 'general'
}

// =====================================================
// SHORTCUT DEFINITIONS
// =====================================================
export const CRM_SHORTCUTS: KeyboardShortcut[] = [
  // General
  { keys: '⌘K', description: 'Open command palette', category: 'general' },
  { keys: '?', description: 'Show keyboard shortcuts', category: 'general' },
  { keys: 'Esc', description: 'Close panel / dialog', category: 'general' },

  // Navigation (G prefix)
  { keys: 'G then D', description: 'Go to Deals', category: 'navigation' },
  { keys: 'G then C', description: 'Go to Contacts', category: 'navigation' },
  { keys: 'G then O', description: 'Go to Companies', category: 'navigation' },
  { keys: 'G then A', description: 'Go to Analytics', category: 'navigation' },
  { keys: 'G then T', description: 'Go to Tasks', category: 'navigation' },
  { keys: 'G then P', description: 'Go to Properties', category: 'navigation' },

  // Actions
  { keys: 'N', description: 'New deal', category: 'actions' },
  { keys: 'C', description: 'New contact (from contacts page)', category: 'actions' },
  { keys: '/', description: 'Focus search', category: 'actions' },

  // Views
  { keys: 'K', description: 'Toggle Kanban / List view', category: 'views' },
]

// =====================================================
// HOOK: useKeyboardShortcuts
// =====================================================
interface UseKeyboardShortcutsOptions {
  onToggleView?: () => void
  onNewDeal?: () => void
  onNewContact?: () => void
  onFocusSearch?: () => void
  onShowHelp?: () => void
  enabled?: boolean
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const {
    onToggleView,
    onNewDeal,
    onNewContact,
    onFocusSearch,
    onShowHelp,
    enabled = true,
  } = options

  const router = useRouter()
  const gPrefixRef = useRef(false)
  const gPrefixTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]') ||
        target.closest('[cmdk-input]')
      ) {
        return
      }

      // Ignore if modifier keys (except for Cmd+K which is handled by CommandPalette)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key.toLowerCase()

      // Handle G-prefix sequences
      if (gPrefixRef.current) {
        gPrefixRef.current = false
        clearTimeout(gPrefixTimerRef.current)

        switch (key) {
          case 'd':
            e.preventDefault()
            router.push('/dashboard/deals')
            return
          case 'c':
            e.preventDefault()
            router.push('/dashboard/deals/contacts')
            return
          case 'o':
            e.preventDefault()
            router.push('/dashboard/deals/companies')
            return
          case 'a':
            e.preventDefault()
            router.push('/dashboard/deals/analytics')
            return
          case 't':
            e.preventDefault()
            router.push('/dashboard/deals/tasks')
            return
          case 'p':
            e.preventDefault()
            router.push('/dashboard/deals/properties')
            return
        }
        return
      }

      // Start G-prefix
      if (key === 'g') {
        gPrefixRef.current = true
        // Timeout after 800ms
        gPrefixTimerRef.current = setTimeout(() => {
          gPrefixRef.current = false
        }, 800)
        return
      }

      switch (key) {
        case '?':
          e.preventDefault()
          onShowHelp?.()
          break
        case 'n':
          e.preventDefault()
          onNewDeal?.() ?? router.push('/dashboard/deals/new')
          break
        case 'c':
          e.preventDefault()
          onNewContact?.() ?? router.push('/dashboard/deals/contacts/new')
          break
        case '/':
          e.preventDefault()
          onFocusSearch?.()
          break
        case 'k':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onToggleView?.()
          }
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      clearTimeout(gPrefixTimerRef.current)
    }
  }, [enabled, router, onToggleView, onNewDeal, onNewContact, onFocusSearch, onShowHelp])
}

// =====================================================
// KEYBOARD SHORTCUTS HELP DIALOG
// =====================================================
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  const grouped = CRM_SHORTCUTS.reduce(
    (acc, s) => {
      ;(acc[s.category] ??= []).push(s)
      return acc
    },
    {} as Record<string, KeyboardShortcut[]>
  )

  const categoryLabels: Record<string, string> = {
    general: 'General',
    navigation: 'Navigation',
    actions: 'Actions',
    views: 'Views',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {categoryLabels[category] || category}
              </h4>
              <div className="space-y-1">
                {shortcuts.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.split(' then ').map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-xs text-muted-foreground mx-0.5">then</span>}
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-medium text-foreground">
                            {k.trim()}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
