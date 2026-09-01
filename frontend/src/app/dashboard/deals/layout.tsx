'use client'

import React, { useState, useEffect, lazy, Suspense } from 'react'
import { CrmSidebar } from '@/components/crm/CrmSidebar'
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from '@/components/crm/KeyboardShortcuts'

const OnboardingWizard = lazy(() => import('@/components/crm/OnboardingWizard'))

const ONBOARDING_DISMISSED_KEY = 'crm-onboarding-dismissed'

export default function DealsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
    const [showOnboarding, setShowOnboarding] = useState(false)

    useKeyboardShortcuts({
        onShowHelp: () => setShortcutsHelpOpen(true),
    })

    // Show onboarding on first visit
    useEffect(() => {
        try {
            const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY)
            if (!dismissed) {
                setShowOnboarding(true)
            }
        } catch {
            // localStorage not available
        }
    }, [])

    const handleOnboardingComplete = () => {
        setShowOnboarding(false)
        try {
            localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
        } catch {
            // ignore
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-7rem)]">
      <CrmSidebar />
      <main className="flex-1 min-w-0 p-2 sm:p-4 pb-10">
        {showOnboarding ? (
          <Suspense fallback={null}>
            <div className="mb-6">
              <OnboardingWizard onComplete={handleOnboardingComplete} />
            </div>
          </Suspense>
        ) : null}
        {children}
      </main>
      <KeyboardShortcutsHelp open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen} />
    </div>
    )
}
