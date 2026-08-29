'use client'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useCallback, createContext, useContext } from 'react'
import { cn } from '@/lib/utils'
import {
  canAccessFeature,
  canAccessPlatformTab,
  customerHasServiceForTab,
  getUpgradeInfo,
  getTierDisplayName,
  getRequiredTierName,
  type FeatureGate,
} from '@/lib/rbac'

// ---------------------------------------------------------------------------
// UpgradeGate Context — allows any component to trigger the upgrade modal
// ---------------------------------------------------------------------------

interface UpgradeGateContextType {
  /** Show the upgrade modal for a specific feature */
  showUpgradeFor: (featureKey: string) => void
  /** Check if user has access to a feature (role + tier + userType) */
  hasAccess: (featureKey: string) => boolean
  /** Check role-only access to a platform tab */
  hasRoleAccess: (tabKey: string) => boolean
  /** Navigate to a feature, showing upgrade gate if blocked */
  navigateOrGate: (href: string, featureKey: string) => void
  /** Current user tier */
  tier: string
  /** Current user role */
  role: string
  /** Current user type (staff/customer) */
  userType: string
}

const UpgradeGateContext = createContext<UpgradeGateContextType>({
  showUpgradeFor: () => {},
  hasAccess: () => true,
  hasRoleAccess: () => true,
  navigateOrGate: () => {},
  tier: 'starter',
  role: 'viewer',
  userType: 'staff',
})

export function useUpgradeGate() {
  return useContext(UpgradeGateContext)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UpgradeGateProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [activeGate, setActiveGate] = useState<FeatureGate | null>(null)
  const [activeFeatureKey, setActiveFeatureKey] = useState<string>('')

  const role = session?.user?.role || 'viewer'
  const tier = session?.user?.tier || 'starter'
  const userType = session?.user?.userType || 'customer'
  const subscribedServices: string[] = (session?.user as any)?.subscribedServices || []

  const showUpgradeFor = useCallback((featureKey: string) => {
    const info = getUpgradeInfo(role, tier, featureKey, userType)
    if (info) {
      setActiveGate(info)
      setActiveFeatureKey(featureKey)
    }
  }, [role, tier, userType])

  const hasAccess = useCallback((featureKey: string) => {
    return canAccessFeature(role, tier, featureKey, userType)
  }, [role, tier, userType])

  const hasRoleAccess = useCallback((tabKey: string) => {
    return canAccessPlatformTab(role, tabKey)
  }, [role])

  const navigateOrGate = useCallback((href: string, featureKey: string) => {
    // Customers: subscription + tier (org role does not hide workflow tabs)
    if (userType === 'customer') {
      if (!customerHasServiceForTab(featureKey, subscribedServices, tier)) {
        setActiveGate({
          minTier: 'professional',
          label: featureKey.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: 'Your organization does not have an active subscription for this service. Visit Billing to add it to your plan.',
          category: 'subscription_required',
        })
        setActiveFeatureKey(featureKey)
        return
      }
      if (!canAccessFeature(role, tier, featureKey, userType)) {
        showUpgradeFor(featureKey)
        return
      }
      router.push(href)
      return
    }
    // Staff / org users: role then tier
    if (!canAccessPlatformTab(role, featureKey)) {
      // Role doesn't allow — no upgrade path, just inform
      setActiveGate({
        minTier: 'enterprise',
        label: featureKey.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: 'Your current role does not have access to this feature. Contact your organization administrator.',
        category: 'role_restricted',
      })
      setActiveFeatureKey(featureKey)
      return
    }
    // Check tier access (staff bypass this)
    if (!canAccessFeature(role, tier, featureKey, userType)) {
      showUpgradeFor(featureKey)
      return
    }
    router.push(href)
  }, [role, tier, userType, subscribedServices, router, showUpgradeFor])

  const closeModal = useCallback(() => {
    setActiveGate(null)
    setActiveFeatureKey('')
  }, [])

  return (
    <UpgradeGateContext.Provider value={{ showUpgradeFor, hasAccess, hasRoleAccess, navigateOrGate, tier, role, userType }}>
      {children}
      {activeGate && (
        <UpgradeModal
          gate={activeGate}
          featureKey={activeFeatureKey}
          currentTier={tier}
          onClose={closeModal}
          onUpgrade={() => {
            closeModal()
            router.push('/dashboard/billing')
          }}
        />
      )}
    </UpgradeGateContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Upgrade Modal
// ---------------------------------------------------------------------------

function UpgradeModal({
  gate,
  featureKey,
  currentTier,
  onClose,
  onUpgrade,
}: {
  gate: FeatureGate
  featureKey: string
  currentTier: string
  onClose: () => void
  onUpgrade: () => void
}) {
  const isRoleRestricted = gate.category === 'role_restricted'
  const requiredTier = getRequiredTierName(featureKey)

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 border border-border bg-card shadow-2xl shadow-amber-500/10">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-amber-500/10 border border-amber-500/30">
              {isRoleRestricted ? (
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="font-mono text-sm text-foreground tracking-wide">
                {isRoleRestricted ? 'ACCESS RESTRICTED' : 'UPGRADE REQUIRED'}
              </h3>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                {isRoleRestricted ? 'ROLE-BASED RESTRICTION' : `REQUIRES ${requiredTier.toUpperCase()} PLAN`}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="mb-4">
            <div className="font-mono text-xs text-amber-500 mb-1">{gate.label}</div>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">{gate.description}</p>
          </div>

          {!isRoleRestricted && (
            <>
              {/* Current vs Required */}
              <div className="flex items-center gap-3 mb-5 p-3 bg-muted/50 border border-border">
                <div className="flex-1 text-center">
                  <div className="font-mono text-[9px] text-muted-foreground mb-1">CURRENT PLAN</div>
                  <div className="font-mono text-xs text-foreground">{getTierDisplayName(currentTier)}</div>
                </div>
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div className="flex-1 text-center">
                  <div className="font-mono text-[9px] text-muted-foreground mb-1">REQUIRED</div>
                  <div className="font-mono text-xs text-amber-600 dark:text-amber-400">{requiredTier}</div>
                </div>
              </div>

              {/* Benefits tease */}
              <div className="mb-5 space-y-2">
                <div className="font-mono text-[10px] text-muted-foreground mb-2">INCLUDED WITH {requiredTier.toUpperCase()}:</div>
                {getTierBenefits(gate.minTier).map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <svg className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-mono text-[10px] text-muted-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 font-mono text-xs text-muted-foreground border border-border hover:bg-muted transition-colors"
          >
            CLOSE
          </button>
          {!isRoleRestricted && (
            <button
              onClick={onUpgrade}
              className="flex-1 py-2 font-mono text-xs text-foreground bg-amber-500 hover:bg-amber-400 transition-colors font-bold"
            >
              UPGRADE NOW
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tier benefits for the upgrade modal
// ---------------------------------------------------------------------------

function getTierBenefits(tier: string): string[] {
  switch (tier) {
    case 'professional':
      return [
        'Unlimited property valuations',
        'Full CRM & deal pipeline',
        'Advanced market analytics',
        'Property management tools',
        'E-Sign document workflows',
        'Priority support with 4hr SLA',
        'Up to 10 team seats',
      ]
    case 'enterprise':
      return [
        'Everything in Professional',
        'Full API access (100K calls/mo)',
        'AI-powered price forecasting',
        'Portfolio analysis & risk scoring',
        'Blockchain verification',
        'White-label custom reports',
        'Dedicated account manager',
        'Unlimited team seats',
      ]
    default:
      return [
        'Basic property valuations',
        'Standard reports',
        'Email support',
        '50 property limit',
      ]
  }
}

// ---------------------------------------------------------------------------
// GatedLink — a link that checks access before navigating
// ---------------------------------------------------------------------------

export function GatedLink({
  href,
  featureKey,
  children,
  className,
}: {
  href: string
  featureKey: string
  children: React.ReactNode
  className?: string
}) {
  const { navigateOrGate } = useUpgradeGate()

  return (
    <button
      onClick={() => navigateOrGate(href, featureKey)}
      className={cn('text-left', className)}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// LockedBadge — small badge to show a feature requires upgrade
// ---------------------------------------------------------------------------

export function LockedBadge({ featureKey, className }: { featureKey: string; className?: string }) {
  const { hasAccess } = useUpgradeGate()
  if (hasAccess(featureKey)) return null

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-mono text-[8px]', className)}>
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      PRO
    </span>
  )
}
