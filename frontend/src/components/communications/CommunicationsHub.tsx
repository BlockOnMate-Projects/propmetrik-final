'use client';

/**
 * Shared Communications hub — one component behind every service's "Communications" tab. Renders a
 * tabbed shell (Chat · Mail · Calendar) whose contents adapt to the `service`:
 *   - deals              → WhatsApp lead chat  + Mail + Calendar
 *   - property-management→ tenant messaging    + Mail + Calendar
 *   - projects           → Mail + Calendar (no external chat)
 * Reuses existing surfaces (no duplicated logic); internal team chat stays in the floating Workspace.
 */

import { useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MessageCircle, Mail, Calendar as CalendarIcon, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WhatsAppMessaging } from './WhatsAppMessaging';
import { TenantMessaging } from './TenantMessaging';
import { MailInbox } from './MailInbox';
import { SocialHub } from './SocialHub';
import { CalendarView } from '@/components/calendar/CalendarView';

export type CommsService = 'deals' | 'property-management' | 'projects';
type TabKey = 'chat' | 'mail' | 'social' | 'calendar';

export function CommunicationsHub({ service, title = 'Communications' }: { service: CommsService; title?: string }) {
  const tabs: { key: TabKey; label: string; icon: typeof Mail }[] = [
    ...(service !== 'projects'
      ? [{ key: 'chat' as const, label: service === 'property-management' ? 'Tenants' : 'Chat', icon: MessageCircle }]
      : []),
    { key: 'mail', label: 'Mail', icon: Mail },
    { key: 'social', label: 'Social', icon: Share2 },
    { key: 'calendar', label: 'Calendar', icon: CalendarIcon },
  ];

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const requested = searchParams.get('tab') as TabKey | null;
  const [tab, setTab] = useState<TabKey>(requested && tabs.some((t) => t.key === requested) ? requested : tabs[0].key);

  const select = (k: TabKey) => {
    setTab(k);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', k);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-border mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => select(t.key)}
                className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'chat' && (service === 'property-management'
          ? <TenantMessaging />
          : <WhatsAppMessaging showHeader={false} />)}
        {tab === 'mail' && <MailInbox service={service} />}
        {tab === 'social' && <SocialHub service={service} />}
        {tab === 'calendar' && <CalendarView filterService={service} className="h-full" />}
      </div>
    </div>
  );
}

export default CommunicationsHub;
