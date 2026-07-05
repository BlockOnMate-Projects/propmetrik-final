'use client';

import { ServiceSettings } from '@/components/settings/ServiceSettings';

export default function DealsSettingsPage() {
  return (
    <ServiceSettings
      title="Deal Management Settings"
      service="crm"
      integrationsKey="crm"
    />
  );
}
