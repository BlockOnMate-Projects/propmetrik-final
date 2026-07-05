'use client';

/**
 * ServiceSettings — the per-service Settings shell.
 * Houses "Company Branding" and "Integrations" (and any extra service tabs) as
 * sub-tabs so every service (Valuation, PM, CRM, Projects) has a consistent
 * Settings home. Integrations is now a sub-tab of Settings (not a top-level nav).
 */
import { useState, ReactNode } from 'react';
import { Suspense } from 'react';
import { Palette, Plug, ShieldCheck } from 'lucide-react';
import { CompanyBrandingSettings } from './CompanyBrandingSettings';
import { CompanyVerificationPanel } from './CompanyVerificationPanel';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';
import type { BrandingService } from '@/lib/branding-api';
import type { ServiceKey } from '@/lib/integrations-api';

export interface ExtraSettingsTab {
  key: string;
  label: string;
  icon?: ReactNode;
  node: ReactNode;
}

export function ServiceSettings({
  title,
  service,
  integrationsKey,
  extraTabs = [],
}: {
  title: string;
  service: BrandingService;
  integrationsKey: ServiceKey;
  extraTabs?: ExtraSettingsTab[];
}) {
  const tabs = [
    { key: 'branding', label: 'Company Branding', icon: <Palette className="w-4 h-4" /> },
    { key: 'verification', label: 'Verification', icon: <ShieldCheck className="w-4 h-4" /> },
    ...extraTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon })),
    { key: 'integrations', label: 'Integrations', icon: <Plug className="w-4 h-4" /> },
  ];
  const [active, setActive] = useState('branding');

  return (
    <div className="p-4 md:p-6 bg-background min-h-screen">
      <div className="mb-1 text-xl font-bold tracking-tight text-foreground">{title}</div>
      <div className="mb-5 text-sm text-muted-foreground">Company branding, integrations & preferences</div>

      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-border mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ' +
              (active === t.key
                ? 'border-amber-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {active === 'branding' && <CompanyBrandingSettings service={service} />}
        {active === 'verification' && <CompanyVerificationPanel />}
        {extraTabs.map((t) => (active === t.key ? <div key={t.key}>{t.node}</div> : null))}
        {active === 'integrations' && (
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading integrations…</p>}>
            <IntegrationsHub service={integrationsKey} title="Integrations" />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default ServiceSettings;
