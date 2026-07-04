'use client';

/**
 * "Social" tab of the Communications hub — one home for every connected social channel, structured
 * like the Mail tab (a sub-switcher across accounts). Each sub-tab surfaces that platform's real,
 * already-built capability:
 *   - WhatsApp                    → the two-way conversation inbox (WhatsAppMessaging)
 *   - TikTok / Facebook / Instagram → publish a property listing + post history (SocialPublisher)
 *
 * Connection state for TikTok/FB/IG comes from the shared Integrations Hub (getConnections). WhatsApp
 * is platform-managed (its own /messaging/status), so it's always present. Platforms with no adapter
 * yet (LinkedIn, X) are intentionally omitted until their publishers exist.
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ProviderLogo } from '@/components/integrations/ProviderLogo';
import { WhatsAppMessaging } from './WhatsAppMessaging';
import { SocialPublisher, type SocialPlatform } from './SocialPublisher';
import { getConnections } from '@/lib/integrations-api';

type SocialKey = 'whatsapp' | SocialPlatform;
type CommsService = 'deals' | 'property-management' | 'projects';

const CHANNELS: { key: SocialKey; label: string; emoji: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', emoji: '🟢' },
  { key: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { key: 'facebook', label: 'Facebook', emoji: '📘' },
  { key: 'instagram', label: 'Instagram', emoji: '📸' },
];

export function SocialHub({ service }: { service: CommsService }) {
  const [active, setActive] = useState<SocialKey>('whatsapp');
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getConnections()
      .then(c => setConnected({
        tiktok: !!c['tiktok'], facebook: !!c['facebook'], instagram: !!c['instagram'],
      }))
      .catch(() => setConnected({}));
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Channel sub-switcher — mirrors the Mail provider switcher */}
      <div className="flex rounded-lg border border-border overflow-hidden self-start">
        {CHANNELS.map((c) => {
          // WhatsApp is platform-managed (always available); social platforms show a live dot.
          const isConnected = c.key === 'whatsapp' ? true : connected[c.key];
          return (
            <button key={c.key} onClick={() => setActive(c.key)}
              className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-r border-border last:border-r-0',
                active === c.key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              <ProviderLogo type={c.key} emoji={c.emoji} size={16} />
              {c.label}
              {c.key !== 'whatsapp' && (
                <span className={cn('h-1.5 w-1.5 rounded-full', isConnected ? 'bg-green-500' : 'bg-muted-foreground/40')} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {active === 'whatsapp'
          ? <WhatsAppMessaging showHeader={false} />
          : <SocialPublisher platform={active as SocialPlatform} service={service} />}
      </div>
    </div>
  );
}

export default SocialHub;
