'use client'

/**
 * Company Verification (KYB) — standalone route.
 * Renders the shared CompanyVerificationPanel, which is also embedded as a
 * "Verification" tab in every service's Settings (Valuation, PM, CRM, Projects).
 */
import { CompanyVerificationPanel } from '@/components/settings/CompanyVerificationPanel'

export default function CompanyVerificationPage() {
  return (
    <div className="p-4 md:p-6">
      <CompanyVerificationPanel />
    </div>
  )
}
