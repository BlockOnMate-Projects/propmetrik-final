'use client';

/**
 * Deals messaging page — thin wrapper over the shared <WhatsAppMessaging/>. The primary entry point
 * is now the Communications hub (Chat tab); this route is kept for back-compat/deep-links.
 */

import { WhatsAppMessaging } from '@/components/communications/WhatsAppMessaging';

export default function MessagingPage() {
  return (
    <div className="h-[calc(100vh-120px)]">
      <WhatsAppMessaging />
    </div>
  );
}
