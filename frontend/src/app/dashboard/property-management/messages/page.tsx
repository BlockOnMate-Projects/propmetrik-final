'use client'

/**
 * Landlord messages page — thin wrapper over the shared <TenantMessaging/>. The primary entry point
 * is now the Communications hub (Chat tab); this route is kept for back-compat/deep-links (?tenantId=…).
 */

import { TenantMessaging } from '@/components/communications/TenantMessaging'

export default function LandlordMessagesPage() {
  return (
    <div className="p-4 h-[calc(100vh-140px)]">
      <TenantMessaging />
    </div>
  )
}
