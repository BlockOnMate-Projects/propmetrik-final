'use client';

import { ServiceSettings } from '@/components/settings/ServiceSettings';

export default function PropertyManagementSettingsPage() {
  return (
    <ServiceSettings
      title="Property Management Settings"
      service="property_management"
      integrationsKey="pm"
    />
  );
}
